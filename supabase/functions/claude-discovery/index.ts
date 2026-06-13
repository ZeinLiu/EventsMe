import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, addTokens } from '../_shared/tokenBudget.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DiscoverySource {
  id: string
  label: string
  value: string
  total_events_found: number
}

interface EventData {
  title: string
  description: string
  short_summary: string
  category: string
  event_date: string | null
  event_end_date: string | null
  venue: string
  price_min: number
  price_max: number
  is_free: boolean
  source_url: string
  booking_url: string
  image_url: string | null
  source_name: string
}

interface ExistingEvent {
  id: string
  title: string
  event_date: string | null
  venue: string | null
  source_name: string | null
}

async function callClaude(
  body: object,
  apiKey: string,
  maxRetries = 3,
): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    })

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfterSec = parseInt(res.headers.get('retry-after') ?? '30', 10)
      await new Promise((r) => setTimeout(r, retryAfterSec * 1000))
      continue
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Claude API ${res.status}: ${text}`)
    }

    return JSON.parse(await res.text())
  }
  throw new Error('Claude API: max retries exceeded')
}

function extractJson(text: string): unknown[] | null {
  const clean = text.trim()

  try { const p = JSON.parse(clean); if (Array.isArray(p)) return p } catch { /* fall through */ }

  const codeBlock = clean.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) { try { const p = JSON.parse(codeBlock[1].trim()); if (Array.isArray(p)) return p } catch { /* fall through */ } }

  const arrayMatch = clean.match(/\[[\s\S]*\]/)
  if (arrayMatch) { try { const p = JSON.parse(arrayMatch[0]); if (Array.isArray(p)) return p } catch { /* fall through */ } }

  const start = clean.indexOf('[')
  const end = clean.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try { const p = JSON.parse(clean.slice(start, end + 1)); if (Array.isArray(p)) return p } catch { /* fall through */ }
  }

  return null
}

async function deduplicateWithClaude(
  newEvents: EventData[],
  existingEvents: ExistingEvent[],
  apiKey: string,
  maxTokens: number,
): Promise<EventData[]> {
  if (newEvents.length === 0) return []
  if (existingEvents.length === 0) return newEvents

  try {
    const claudeData = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: `You are a deduplication engine for a Singapore events database. Given NEW events and EXISTING events, return ONLY the new events that are NOT semantic duplicates of existing ones.

Two events are duplicates if they refer to the same real-world event, even if titles differ, dates differ by 1-2 days, or one is in English and one in Chinese.

Return ONLY a JSON array starting with [ and ending with ]. No markdown, no explanation.`,
      messages: [{
        role: 'user',
        content: `EXISTING EVENTS:\n${JSON.stringify(
          existingEvents.map((e) => ({ id: e.id, title: e.title, date: e.event_date, venue: e.venue })),
        )}\n\nNEW EVENTS:\n${JSON.stringify(newEvents)}\n\nReturn only the non-duplicate new events as a JSON array.`,
      }],
    }, apiKey)

    const textBlocks: string[] = (claudeData.content ?? [])
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)

    let filtered: unknown[] | null = null
    for (let i = textBlocks.length - 1; i >= 0; i--) {
      filtered = extractJson(textBlocks[i])
      if (filtered) break
    }
    if (!filtered) filtered = extractJson(textBlocks.join('\n'))

    return (filtered as EventData[]) ?? newEvents
  } catch {
    return newEvents
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const claudeApiKey = Deno.env.get('CLAUDE_API_KEY')
  if (!claudeApiKey) {
    return new Response(
      JSON.stringify({ error: 'CLAUDE_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 1. Read settings dynamically
  const { data: settingsRows } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['max_events_per_run', 'max_tokens_per_call', 'event_window_days'])

  const cfg: Record<string, string> = {}
  for (const s of settingsRows ?? []) cfg[s.key] = s.value

  const maxEventsPerRun  = parseInt(cfg['max_events_per_run']  ?? '10')
  const maxTokensPerCall = parseInt(cfg['max_tokens_per_call'] ?? '1000')
  const eventWindowDays  = parseInt(cfg['event_window_days']   ?? '90')

  // 2. Budget guard — skip if daily limit reached (auto-resets if 24h passed)
  const budget = await checkBudget(supabase)
  if (!budget.allowed) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'daily_token_limit_reached', used: budget.used, limit: budget.limit }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 3. Read active AI search sources
  const { data: sources, error: sourcesError } = await supabase
    .from('discovery_sources')
    .select('*')
    .eq('type', 'ai_search')
    .eq('is_active', true)
    .order('last_run_at', { ascending: true, nullsFirst: true })

  if (sourcesError) {
    return new Response(
      JSON.stringify({ error: sourcesError.message }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  if (!sources || sources.length === 0) {
    return new Response(
      JSON.stringify({ sources_processed: 0, total_new_events: 0, results: [] }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 4. Fetch existing events within the event window for deduplication
  const windowEnd = new Date(Date.now() + eventWindowDays * 86_400_000).toISOString()
  const { data: existingEvents } = await supabase
    .from('events')
    .select('id, title, event_date, venue, source_name')
    .gte('event_date', new Date().toISOString())
    .lte('event_date', windowEnd)
    .order('event_date', { ascending: true })

  const results: Array<{ source: string; new_events: number; skipped_duplicates: number; tokens_used?: number; error?: string }> = []
  let totalNewEvents = 0
  let totalTokens = 0

  // 5. Process each source
  for (const source of sources as DiscoverySource[]) {
    try {
      const today = new Date().toISOString().split('T')[0]

      const claudeData = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokensPerCall * 2,  // discovery needs more headroom than dedup
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are a Singapore events discovery engine. Search the web for upcoming events matching the query. Today: ${today}. Only include events within the next ${eventWindowDays} days.

Return ONLY a JSON array — no markdown, no code blocks. Start with [ and end with ].

Each event object must have exactly these fields:
{
  "title": "event name",
  "description": "max 60 words",
  "short_summary": "max 30 words, family-focused",
  "category": "one of: Kids & Family | Arts & Culture | Food & Lifestyle | Nature & Wildlife | Education & Science | Music & Concerts | Sports & Fitness | Cultural & National | Arts & Performance",
  "event_date": "YYYY-MM-DD or null",
  "event_end_date": "YYYY-MM-DD or null",
  "venue": "venue name and area",
  "price_min": 0,
  "price_max": 0,
  "is_free": true,
  "source_url": "url",
  "booking_url": "url",
  "image_url": "url or null",
  "source_name": "website name"
}

Rules: skip past events, skip non-Singapore events, skip events without dates. Return max ${maxEventsPerRun} events. Return ONLY the JSON array.`,
        messages: [{
          role: 'user',
          content: `Search for: ${source.value}\nReturn only upcoming Singapore events as JSON array.`,
        }],
      }, claudeApiKey)

      // Track tokens
      const callTokens = (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0)
      console.log(`[${source.label}] discovery tokens: ${callTokens}`)
      if (callTokens > 0) {
        await addTokens(supabase, callTokens)
        totalTokens += callTokens
      }

      const textBlocks: string[] = (claudeData.content ?? [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
      if (!textBlocks.length) throw new Error('No text content in Claude response')

      let discoveredEvents: EventData[] | null = null
      for (let i = textBlocks.length - 1; i >= 0; i--) {
        discoveredEvents = extractJson(textBlocks[i]) as EventData[] | null
        if (discoveredEvents) break
      }
      if (!discoveredEvents) discoveredEvents = extractJson(textBlocks.join('\n')) as EventData[] | null
      if (!discoveredEvents) throw new Error(
        `Could not parse JSON. Last block: ${textBlocks[textBlocks.length - 1]?.slice(0, 300)}`,
      )

      const validEvents = discoveredEvents.filter((e) => e.title && e.event_date)

      const dedupedEvents = await deduplicateWithClaude(
        validEvents,
        existingEvents ?? [],
        claudeApiKey,
        maxTokensPerCall,
      )
      const skippedDuplicates = validEvents.length - dedupedEvents.length

      let newCount = 0
      for (const event of dedupedEvents) {
        const { error: insertError } = await supabase.from('events').insert({
          title: event.title,
          description: event.description ?? null,
          short_summary: event.short_summary ?? null,
          category: event.category ?? null,
          event_date: event.event_date,
          event_end_date: event.event_end_date ?? null,
          venue: event.venue ?? null,
          price_min: Number(event.price_min) || 0,
          price_max: Number(event.price_max) || 0,
          is_free: Boolean(event.is_free),
          source_url: event.source_url ?? null,
          booking_url: event.booking_url ?? null,
          image_url: event.image_url ?? null,
          source_name: event.source_name ?? source.label,
        })
        if (!insertError) newCount++
      }

      await supabase
        .from('discovery_sources')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_count: newCount,
          total_events_found: (source.total_events_found ?? 0) + newCount,
        })
        .eq('id', source.id)

      results.push({ source: source.label, new_events: newCount, skipped_duplicates: skippedDuplicates, tokens_used: callTokens })
      totalNewEvents += newCount

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ source: source.label, new_events: 0, skipped_duplicates: 0, error: msg })
    }

    await new Promise((r) => setTimeout(r, 2000))
  }

  return new Response(
    JSON.stringify({
      sources_processed: sources.length,
      total_new_events: totalNewEvents,
      tokens_used: totalTokens,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
