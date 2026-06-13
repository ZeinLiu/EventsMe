import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, addTokens } from '../_shared/tokenBudget.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EbTicketClass {
  free: boolean
  cost?: { major_value: string }
}

interface EbEvent {
  id: string
  name: { text: string }
  description: { text: string | null }
  start: { local: string }
  end: { local: string }
  url: string
  is_free: boolean
  logo: { url: string } | null
  venue: {
    name: string
    address: { localized_address_display: string }
  } | null
  ticket_classes: EbTicketClass[]
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
    try { const p = JSON.parse(candidate); if (Array.isArray(p)) return p } catch { /* try next */ }
  }
  return null
}

function stripHtml(html: string): string {
  return (html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function mapEventbriteEvent(eb: EbEvent): EventData {
  const prices = (eb.ticket_classes ?? [])
    .filter((tc) => !tc.free && tc.cost)
    .map((tc) => parseFloat(tc.cost!.major_value))
    .filter((p) => !isNaN(p))

  return {
    title: eb.name.text,
    description: eb.description.text ? stripHtml(eb.description.text).slice(0, 500) : null,
    short_summary: null,
    category: null,
    event_date: eb.start.local.split('T')[0],
    event_end_date: eb.end.local.split('T')[0],
    venue: eb.venue
      ? `${eb.venue.name}, ${eb.venue.address.localized_address_display}`.slice(0, 200)
      : null,
    price_min: prices.length ? Math.round(Math.min(...prices)) : 0,
    price_max: prices.length ? Math.round(Math.max(...prices)) : 0,
    is_free: eb.is_free || prices.length === 0,
    source_url: eb.url,
    booking_url: eb.url,
    image_url: eb.logo?.url ?? null,
    source_name: 'Eventbrite',
  }
}

async function generateSummaries(
  events: EventData[],
  apiKey: string,
  maxTokens: number,
): Promise<{ summaries: Map<number, string>; tokensUsed: number }> {
  const summaries = new Map<number, string>()
  let tokensUsed = 0
  const BATCH = 10

  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH).map((e, idx) => ({
      idx: i + idx,
      title: e.title,
      description: (e.description ?? '').slice(0, 200),
      venue: e.venue,
    }))

    try {
      const data = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: `For each event write a short_summary of max 50 words, family-focused, highlighting what makes it special for Singapore families. Return ONLY a JSON array: [{"idx": number, "summary": "..."}]. No markdown.`,
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
    } catch { /* summaries are non-critical */ }

    await new Promise((r) => setTimeout(r, 1000))
  }

  return { summaries, tokensUsed }
}

async function deduplicateWithClaude(
  newEvents: EventData[],
  existing: ExistingEvent[],
  apiKey: string,
  maxTokens: number,
): Promise<{ events: EventData[]; tokensUsed: number }> {
  if (newEvents.length === 0) return { events: [], tokensUsed: 0 }
  if (existing.length === 0) return { events: newEvents, tokensUsed: 0 }
  try {
    const data = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: `You are a deduplication engine for a Singapore events database. Return ONLY new events that are NOT semantic duplicates of existing ones. Two events are duplicates if they are the same real-world event (even with different titles or ±2-day dates). Return a JSON array. No markdown.`,
      messages: [{
        role: 'user',
        content: `EXISTING:\n${JSON.stringify(existing.map((e) => ({ id: e.id, title: e.title, date: e.event_date, venue: e.venue })))}\n\nNEW:\n${JSON.stringify(newEvents.map((e, i) => ({ _i: i, title: e.title, date: e.event_date, venue: e.venue })))}\n\nReturn only non-duplicate items (include all original fields) as JSON array.`,
      }],
    }, apiKey)
    const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
    const blocks = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text as string)
    let result: unknown[] | null = null
    for (let i = blocks.length - 1; i >= 0; i--) { result = extractJson(blocks[i]); if (result) break }
    return { events: (result as EventData[]) ?? newEvents, tokensUsed }
  } catch {
    return { events: newEvents, tokensUsed: 0 }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const eventbriteKey = Deno.env.get('EVENTBRITE_API_KEY')
  if (!eventbriteKey) {
    return new Response(JSON.stringify({ error: 'EVENTBRITE_API_KEY not configured' }),
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
  const rangeStart = today.toISOString()
  const rangeEnd = in90Days.toISOString()

  // Call Eventbrite search API
  const params = new URLSearchParams({
    'location.address': 'Singapore',
    'location.within': '50km',
    'expand': 'venue,ticket_classes,logo',
    'status': 'live',
    'start_date.range_start': rangeStart,
    'start_date.range_end': rangeEnd,
    'page_size': '50',
  })

  const ebRes = await fetch(`https://www.eventbriteapi.com/v3/events/search/?${params}`, {
    headers: { 'Authorization': `Bearer ${eventbriteKey}` },
    signal: AbortSignal.timeout(30_000),
  })

  if (!ebRes.ok) {
    const body = await ebRes.text()
    return new Response(JSON.stringify({ error: `Eventbrite API ${ebRes.status}: ${body}` }),
      { status: 502, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  const ebData = await ebRes.json()
  const rawEvents: EbEvent[] = ebData.events ?? []

  if (rawEvents.length === 0) {
    return new Response(JSON.stringify({ new_events: 0, message: 'No events from Eventbrite' }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  const mapped = rawEvents.map(mapEventbriteEvent)

  // Generate short_summary via Claude
  const { summaries, tokensUsed: summaryTokens } = await generateSummaries(mapped, claudeApiKey, maxTokensPerCall)
  mapped.forEach((e, i) => { if (summaries.has(i)) e.short_summary = summaries.get(i)! })
  if (summaryTokens > 0) await addTokens(supabase, summaryTokens)

  // Fetch existing events for dedup
  const { data: existingEvents } = await supabase
    .from('events')
    .select('id, title, event_date, venue')
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })

  // Deduplicate in batches of 20
  const DEDUP_BATCH = 20
  const dedupedEvents: EventData[] = []
  let dedupTokens = 0
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
      title: event.title,
      description: event.description,
      short_summary: event.short_summary,
      category: event.category,
      event_date: event.event_date,
      event_end_date: event.event_end_date,
      venue: event.venue,
      price_min: event.price_min,
      price_max: event.price_max,
      is_free: event.is_free,
      source_url: event.source_url,
      booking_url: event.booking_url,
      image_url: event.image_url,
      source_name: event.source_name,
    })
    if (!error) newCount++
  }

  return new Response(
    JSON.stringify({
      fetched: rawEvents.length,
      after_dedup: dedupedEvents.length,
      new_events: newCount,
      tokens_used: summaryTokens + dedupTokens,
    }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
