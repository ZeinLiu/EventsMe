import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, addTokens } from '../_shared/tokenBudget.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TmImage {
  url: string
  width: number
  height: number
  ratio: string
}

interface TmEvent {
  id: string
  name: string
  url: string
  info?: string
  pleaseNote?: string
  dates: {
    start: { localDate: string; localTime?: string }
    end?: { localDate: string }
  }
  priceRanges?: Array<{ min: number; max: number }>
  images: TmImage[]
  classifications?: Array<{
    segment?: { name: string }
    genre?: { name: string }
  }>
  _embedded?: {
    venues?: Array<{
      name: string
      address?: { line1: string }
      city?: { name: string }
    }>
  }
}

interface EventData {
  title: string
  description: string | null
  short_summary: string | null
  category: string | null
  event_date: string
  event_end_date: string | null
  venue: string | null
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
}

const SEGMENT_TO_CATEGORY: Record<string, string> = {
  'Music': 'Music & Concerts',
  'Sports': 'Sports & Fitness',
  'Arts & Theatre': 'Arts & Culture',
  'Arts': 'Arts & Culture',
  'Theatre': 'Arts & Culture',
  'Family': 'Kids & Family',
  'Film': 'Arts & Culture',
}

function mapCategory(event: TmEvent): string | null {
  for (const c of event.classifications ?? []) {
    const seg = c.segment?.name ?? ''
    if (SEGMENT_TO_CATEGORY[seg]) return SEGMENT_TO_CATEGORY[seg]
  }
  return null
}

function bestImage(images: TmImage[]): string | null {
  if (!images?.length) return null
  const preferred = images.filter((img) => img.ratio === '16_9').sort((a, b) => b.width - a.width)
  return (preferred[0] ?? images.sort((a, b) => b.width - a.width)[0])?.url ?? null
}

function mapTmEvent(tm: TmEvent): EventData {
  const venue = tm._embedded?.venues?.[0]
  const venueName = venue
    ? [venue.name, venue.address?.line1, venue.city?.name].filter(Boolean).join(', ').slice(0, 200)
    : null
  const price = tm.priceRanges?.[0]

  return {
    title: tm.name,
    description: (tm.info || tm.pleaseNote || null)?.slice(0, 500) ?? null,
    short_summary: null,
    category: mapCategory(tm),
    event_date: tm.dates.start.localDate,
    event_end_date: tm.dates.end?.localDate ?? null,
    venue: venueName,
    price_min: price ? Math.round(price.min) : 0,
    price_max: price ? Math.round(price.max) : 0,
    is_free: false,
    source_url: tm.url,
    booking_url: tm.url,
    image_url: bestImage(tm.images),
    source_name: 'Ticketmaster',
  }
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
      signal: AbortSignal.timeout(60_000),
    })
    if (res.status === 429 && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, parseInt(res.headers.get('retry-after') ?? '30', 10) * 1000))
      continue
    }
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`)
    return JSON.parse(await res.text())
  }
  throw new Error('Claude API: max retries exceeded')
}

function extractJson(text: string): unknown[] | null {
  const clean = text.trim()
  for (const candidate of [
    clean,
    (clean.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [])[1],
    (clean.match(/\[[\s\S]*\]/) ?? [])[0],
    clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1),
  ]) {
    if (!candidate) continue
    try { const p = JSON.parse(candidate); if (Array.isArray(p)) return p } catch { /* next */ }
  }
  return null
}

async function generateSummaries(events: EventData[], apiKey: string, maxTokens: number): Promise<{ summaries: Map<number, string>; tokensUsed: number }> {
  const summaries = new Map<number, string>()
  let tokensUsed = 0
  const BATCH = 10
  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH).map((e, idx) => ({
      idx: i + idx, title: e.title, description: (e.description ?? '').slice(0, 200), venue: e.venue,
    }))
    try {
      const data = await callClaude({
        model: 'claude-sonnet-4-6', max_tokens: maxTokens,
        system: `For each event write a short_summary of max 50 words, family-focused, for Singapore families. Return ONLY JSON array: [{"idx":number,"summary":"..."}]. No markdown.`,
        messages: [{ role: 'user', content: JSON.stringify(batch) }],
      }, apiKey)
      tokensUsed += (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
      const blocks = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text as string)
      let result: unknown[] | null = null
      for (let j = blocks.length - 1; j >= 0; j--) { result = extractJson(blocks[j]); if (result) break }
      if (result) {
        for (const item of result as Array<{ idx: number; summary: string }>) {
          if (typeof item.idx === 'number' && item.summary) summaries.set(item.idx, item.summary)
        }
      }
    } catch { /* non-critical */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return { summaries, tokensUsed }
}

async function deduplicateWithClaude(newEvents: EventData[], existing: ExistingEvent[], apiKey: string, maxTokens: number): Promise<{ events: EventData[]; tokensUsed: number }> {
  if (newEvents.length === 0) return { events: [], tokensUsed: 0 }
  if (existing.length === 0) return { events: newEvents, tokensUsed: 0 }
  try {
    const data = await callClaude({
      model: 'claude-sonnet-4-6', max_tokens: maxTokens,
      system: `Deduplication engine. Return ONLY new events NOT in the existing list. Duplicates = same real-world event (different titles or ±2 days OK). Return JSON array, no markdown.`,
      messages: [{
        role: 'user',
        content: `EXISTING:\n${JSON.stringify(existing.map((e) => ({ id: e.id, title: e.title, date: e.event_date, venue: e.venue })))}\n\nNEW:\n${JSON.stringify(newEvents)}\n\nReturn non-duplicates as JSON array.`,
      }],
    }, apiKey)
    const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    const blocks = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text as string)
    let result: unknown[] | null = null
    for (let i = blocks.length - 1; i >= 0; i--) { result = extractJson(blocks[i]); if (result) break }
    return { events: (result as EventData[]) ?? newEvents, tokensUsed }
  } catch { return { events: newEvents, tokensUsed: 0 } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const tmKey = Deno.env.get('TICKETMASTER_API_KEY')
  if (!tmKey) {
    return new Response(JSON.stringify({ error: 'TICKETMASTER_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
  const claudeApiKey = Deno.env.get('CLAUDE_API_KEY')
  if (!claudeApiKey) {
    return new Response(JSON.stringify({ error: 'CLAUDE_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  // Read settings and check budget
  const { data: settingsRows } = await supabase
    .from('app_settings').select('key, value').eq('key', 'max_tokens_per_call')
  const maxTokensPerCall = parseInt(
    (settingsRows ?? []).find((s: any) => s.key === 'max_tokens_per_call')?.value ?? '1000',
  )
  const budget = await checkBudget(supabase)
  if (!budget.allowed) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'daily_token_limit_reached', used: budget.used, limit: budget.limit }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  const today = new Date()
  const in90Days = new Date(today.getTime() + 90 * 86400000)

  const params = new URLSearchParams({
    apikey: tmKey,
    countryCode: 'SG',
    size: '50',
    startDateTime: `${today.toISOString().split('T')[0]}T00:00:00Z`,
    endDateTime: `${in90Days.toISOString().split('T')[0]}T00:00:00Z`,
    sort: 'date,asc',
  })

  const tmRes = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`, {
    signal: AbortSignal.timeout(30_000),
  })

  if (!tmRes.ok) {
    return new Response(JSON.stringify({ error: `Ticketmaster API ${tmRes.status}` }),
      { status: 502, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  const tmData = await tmRes.json()
  const rawEvents: TmEvent[] = tmData._embedded?.events ?? []

  if (rawEvents.length === 0) {
    return new Response(JSON.stringify({ new_events: 0, message: 'No events from Ticketmaster' }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  const mapped = rawEvents.map(mapTmEvent)

  // Generate summaries
  const { summaries, tokensUsed: summaryTokens } = await generateSummaries(mapped, claudeApiKey, maxTokensPerCall)
  mapped.forEach((e, i) => { if (summaries.has(i)) e.short_summary = summaries.get(i)! })
  if (summaryTokens > 0) await addTokens(supabase, summaryTokens)

  // Fetch existing events for dedup
  const { data: existingEvents } = await supabase
    .from('events').select('id, title, event_date, venue')
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })

  // Deduplicate in batches of 20
  const dedupedEvents: EventData[] = []
  let dedupTokens = 0
  const DEDUP_BATCH = 20
  for (let i = 0; i < mapped.length; i += DEDUP_BATCH) {
    const batch = mapped.slice(i, i + DEDUP_BATCH)
    const { events: clean, tokensUsed } = await deduplicateWithClaude(batch, existingEvents ?? [], claudeApiKey, maxTokensPerCall)
    dedupedEvents.push(...clean)
    if (tokensUsed > 0) { await addTokens(supabase, tokensUsed); dedupTokens += tokensUsed }
    if (i + DEDUP_BATCH < mapped.length) await new Promise((r) => setTimeout(r, 1500))
  }

  // Insert
  let newCount = 0
  for (const event of dedupedEvents) {
    const { error } = await supabase.from('events').insert({
      title: event.title, description: event.description, short_summary: event.short_summary,
      category: event.category, event_date: event.event_date, event_end_date: event.event_end_date,
      venue: event.venue, price_min: event.price_min, price_max: event.price_max,
      is_free: event.is_free, source_url: event.source_url, booking_url: event.booking_url,
      image_url: event.image_url, source_name: event.source_name, is_archived: false,
    })
    if (!error) newCount++
  }

  return new Response(
    JSON.stringify({ fetched: rawEvents.length, after_dedup: dedupedEvents.length, new_events: newCount, tokens_used: summaryTokens + dedupTokens }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
