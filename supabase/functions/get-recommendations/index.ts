import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, addTokens } from '../_shared/tokenBudget.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Rec {
  event_id: string
  match_score: number
  reasoning: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const respond = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...CORS, 'content-type': 'application/json' } })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Auth
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return respond({ error: 'Unauthorized' }, 401)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return respond({ error: 'Unauthorized' }, 401)

  const claudeApiKey = Deno.env.get('CLAUDE_API_KEY')
  if (!claudeApiKey) return respond({ error: 'CLAUDE_API_KEY not configured' }, 500)

  let forceRefresh = false
  try { const body = await req.json(); forceRefresh = body?.refresh === true } catch { /* no body */ }

  // Load family profile
  const [membersRes, prefsRes] = await Promise.all([
    supabase.from('family_members')
      .select('name, age, role, interests, constraints, availability, summary')
      .eq('profile_id', user.id)
      .order('created_at'),
    supabase.from('preferences')
      .select('budget_min, budget_max, constraints, preferred_days')
      .eq('profile_id', user.id)
      .maybeSingle(),
  ])
  const members = membersRes.data ?? []
  const prefs = prefsRes.data

  if (members.length === 0) return respond({ recommendations: [], reason: 'no_profile' })

  // Count current active future events
  const { count: currentEventCount } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .or('is_archived.is.null,is_archived.eq.false')
    .gte('event_date', new Date().toISOString())

  // Check cache (unless forced)
  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from('recommendations')
      .select('*, events(*)')
      .eq('profile_id', user.id)
      .order('match_score', { ascending: false })

    if (cached && cached.length > 0) {
      const ageHours = (Date.now() - new Date(cached[0].cached_at).getTime()) / 3_600_000
      const newSinceCache = (currentEventCount ?? 0) - (cached[0].events_count_at_cache ?? 0)
      if (ageHours < 24 && newSinceCache < 5) {
        return respond({ recommendations: cached, source: 'cache' })
      }
    }
  }

  // Token budget check — fall back to stale cache if exceeded
  const budget = await checkBudget(supabase)
  if (!budget.allowed) {
    const { data: stale } = await supabase
      .from('recommendations').select('*, events(*)')
      .eq('profile_id', user.id).order('match_score', { ascending: false })
    return respond({ recommendations: stale ?? [], source: 'cache_budget_exceeded' })
  }

  // Load candidate events: next 60 days
  const windowEnd = new Date(Date.now() + 60 * 86_400_000).toISOString()
  const { data: events } = await supabase
    .from('events')
    .select('id, title, short_summary, category, audience, event_date, venue, price_min, price_max, is_free')
    .or('is_archived.is.null,is_archived.eq.false')
    .gte('event_date', new Date().toISOString())
    .lte('event_date', windowEnd)
    .order('event_date', { ascending: true })
    .limit(80)

  if (!events || events.length === 0) return respond({ recommendations: [], reason: 'no_events' })

  // Build prompt
  const familyLines = members.map((m: any) => {
    const parts = [`${m.name} (${m.role}, age ${m.age})`]
    if (m.interests?.length) parts.push(`interests: ${m.interests.join(', ')}`)
    if (m.constraints) parts.push(`constraints: ${m.constraints}`)
    if (m.availability) parts.push(`available: ${m.availability}`)
    return parts.join(' | ')
  }).join('\n')

  const prefsLines = [
    prefs?.budget_max ? `Budget: $${prefs.budget_min ?? 0}–$${prefs.budget_max} per person` : '',
    prefs?.preferred_days?.length ? `Preferred days: ${(prefs.preferred_days as string[]).join(', ')}` : '',
    prefs?.constraints ? `Constraints: ${prefs.constraints}` : '',
  ].filter(Boolean).join('\n')

  const compactEvents = events.map((e: any) => ({
    id: e.id,
    title: e.title,
    summary: e.short_summary,
    category: e.category,
    audience: e.audience,
    date: e.event_date,
    venue: e.venue,
    price: e.is_free ? 'free' : (e.price_min != null ? `$${e.price_min}–$${e.price_max}` : 'unknown'),
  }))

  const systemPrompt = `You are an event recommendation engine for Singapore families. Given a family profile and a list of upcoming events, select the top 10 best-matched events.

Return ONLY a JSON array — no markdown, no explanation. Each object must have exactly:
{"event_id": "uuid", "match_score": 0-100, "reasoning": "one sentence why this suits this specific family"}

Score based on: age-appropriateness, interest alignment, budget fit, day-of-week availability. Rank by match_score descending.`

  const userMessage = `FAMILY PROFILE:\n${familyLines}${prefsLines ? '\n' + prefsLines : ''}\n\nUPCOMING EVENTS:\n${JSON.stringify(compactEvents)}\n\nReturn the top 10 recommendations as a JSON array.`

  // Call Claude
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!claudeRes.ok) throw new Error(`Claude API ${claudeRes.status}: ${await claudeRes.text()}`)

  const claudeData = await claudeRes.json()
  const tokens = (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0)
  if (tokens > 0) await addTokens(supabase, tokens)

  // Parse JSON from Claude response
  const text = (claudeData.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text as string)
    .join('')

  let recs: Rec[] = []
  for (const candidate of [text.trim(), (text.match(/\[[\s\S]*\]/) ?? [])[0]]) {
    if (!candidate) continue
    try { const p = JSON.parse(candidate); if (Array.isArray(p)) { recs = p; break } } catch { /* next */ }
  }

  if (recs.length === 0) return respond({ recommendations: [], reason: 'parse_error' })

  // Only keep recs whose event_id was in our candidate list
  const eventIds = new Set(events.map((e: any) => e.id))
  const valid = recs.filter(r => r.event_id && eventIds.has(r.event_id) && typeof r.match_score === 'number')

  // Persist to cache
  const now = new Date().toISOString()
  await supabase.from('recommendations').delete().eq('profile_id', user.id)
  if (valid.length > 0) {
    await supabase.from('recommendations').insert(
      valid.map(r => ({
        profile_id: user.id,
        event_id: r.event_id,
        match_score: Math.min(100, Math.max(0, Math.round(r.match_score))),
        reasoning: r.reasoning ?? null,
        cached_at: now,
        events_count_at_cache: currentEventCount ?? 0,
      }))
    )
  }

  // Return with full event data joined
  const { data: fresh } = await supabase
    .from('recommendations')
    .select('*, events(*)')
    .eq('profile_id', user.id)
    .order('match_score', { ascending: false })

  return respond({ recommendations: fresh ?? [], source: 'fresh' })
})
