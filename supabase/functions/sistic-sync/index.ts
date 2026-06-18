import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { checkBudget, addTokens } from '../_shared/tokenBudget.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EventData {
  title: string
  description: string | null
  short_summary: string | null
  category: string | null
  event_date: string | null
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
      signal: AbortSignal.timeout(90_000),
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

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

// Try to extract JSON-LD structured data from HTML (most reliable when present)
function extractJsonLd(html: string): EventData[] {
  const events: EventData[] = []
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        if (item['@type'] !== 'Event') continue
        const loc = item.location
        const venue = typeof loc === 'string' ? loc
          : loc?.name ? [loc.name, loc.address?.addressLocality].filter(Boolean).join(', ')
          : null

        const offers = Array.isArray(item.offers) ? item.offers : (item.offers ? [item.offers] : [])
        const prices = offers.map((o: { price?: string | number }) => parseFloat(String(o.price))).filter((p: number) => !isNaN(p) && p > 0)

        events.push({
          title: item.name ?? '',
          description: item.description ? stripHtml(item.description).slice(0, 500) : null,
          short_summary: null,
          category: null,
          event_date: item.startDate ? item.startDate.split('T')[0] : null,
          event_end_date: item.endDate ? item.endDate.split('T')[0] : null,
          venue: venue ? String(venue).slice(0, 200) : null,
          price_min: prices.length ? Math.round(Math.min(...prices)) : 0,
          price_max: prices.length ? Math.round(Math.max(...prices)) : 0,
          is_free: prices.length === 0,
          source_url: item.url ?? 'https://www.sistic.com.sg',
          booking_url: item.url ?? 'https://www.sistic.com.sg',
          image_url: item.image ?? null,
          source_name: 'SISTIC',
        })
      }
    } catch { /* malformed LD+JSON */ }
  }
  return events
}

// Fallback: extract event card data from SISTIC listing HTML
function scrapeEventCards(html: string, baseUrl: string): Array<{ title: string; url: string; dateText: string; imageUrl: string }> {
  const cards: Array<{ title: string; url: string; dateText: string; imageUrl: string }> = []

  // SISTIC event cards typically have links like /events/eventcode
  const cardRe = /href=["'](\/events\/[^"'?#]+)["'][^>]*>[\s\S]{0,500}?<[^>]*>([^<]{5,120})<\/[^>]*>/gi
  const seen = new Set<string>()
  let m

  while ((m = cardRe.exec(html)) !== null) {
    const path = m[1]
    const title = stripHtml(m[2]).trim()
    if (!title || seen.has(path) || title.length < 5) continue
    seen.add(path)
    cards.push({
      title,
      url: `${baseUrl}${path}`,
      dateText: '',
      imageUrl: '',
    })
    if (cards.length >= 30) break
  }

  return cards
}

async function deduplicateWithClaude(newEvents: EventData[], existing: ExistingEvent[], apiKey: string, maxTokens: number): Promise<{ events: EventData[]; tokensUsed: number }> {
  if (newEvents.length === 0) return { events: [], tokensUsed: 0 }
  if (existing.length === 0) return { events: newEvents, tokensUsed: 0 }
  try {
    const data = await callClaude({
      model: 'claude-sonnet-4-6', max_tokens: maxTokens,
      system: `Deduplication engine. Return ONLY new events NOT in existing list. Duplicates = same real-world event. Return JSON array, no markdown.`,
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

  const SISTIC_URL = 'https://www.sistic.com.sg/events'
  const today = new Date().toISOString().split('T')[0]
  let events: EventData[] = []
  let strategy = 'unknown'
  let totalTokens = 0

  // Strategy 1: Fetch and parse SISTIC listing page
  try {
    const htmlRes = await fetch(SISTIC_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20_000),
    })

    if (htmlRes.ok) {
      const html = await htmlRes.text()

      // Try JSON-LD first (most structured)
      const ldEvents = extractJsonLd(html)
      if (ldEvents.length > 0) {
        events = ldEvents.filter((e) => e.title && e.event_date && e.event_date >= today)
        strategy = 'json-ld'
      }

      // If no JSON-LD, scrape cards then ask Claude to normalise
      if (events.length === 0) {
        const cards = scrapeEventCards(html, 'https://www.sistic.com.sg')
        if (cards.length > 0) {
          strategy = 'html-scrape'
          const claudeData = await callClaude({
            model: 'claude-sonnet-4-6',
            max_tokens: maxTokensPerCall,
            system: `You are an event extraction engine for Singapore. Given SISTIC event listings, return structured event data as a JSON array. Return ONLY events happening in the future (today: ${today}).

Each object must have: title, description (null if unknown), short_summary (max 30 words), category (one of: Kids & Family, Arts & Culture, Food & Lifestyle, Nature & Wildlife, Music & Concerts, Sports & Fitness, Cultural & National, Arts & Performance), audience (array of one or more: toddlers, young_kids, kids, teens, adults, all_ages), event_date (YYYY-MM-DD or null), event_end_date (YYYY-MM-DD or null), venue (null if unknown), price_min (0), price_max (0), is_free (false), source_url, booking_url, image_url (null), source_name ("SISTIC").
Return [] if no future events. No markdown.`,
            messages: [{ role: 'user', content: JSON.stringify(cards) }],
          }, claudeApiKey)

          const scrapeTokens = (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0)
          if (scrapeTokens > 0) { totalTokens += scrapeTokens; await addTokens(supabase, scrapeTokens) }

          const blocks = (claudeData.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text as string)
          let result: unknown[] | null = null
          for (let i = blocks.length - 1; i >= 0; i--) { result = extractJson(blocks[i]); if (result) break }
          if (result) events = (result as EventData[]).filter((e) => e.title)
        }
      }
    }
  } catch (err) {
    console.error(`SISTIC fetch failed: ${err}`)
  }

  // Strategy 2 (fallback): Claude web search for SISTIC events
  if (events.length === 0) {
    strategy = 'web-search-fallback'
    try {
      const claudeData = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokensPerCall * 2,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are an event discovery engine. Search for upcoming events on SISTIC Singapore (sistic.com.sg). Return ONLY a JSON array of events with fields: title, description, short_summary (max 30 words), category, audience (array of: toddlers/young_kids/kids/teens/adults/all_ages), event_date (YYYY-MM-DD), event_end_date, venue, price_min, price_max, is_free, source_url, booking_url, image_url, source_name ("SISTIC"). Today: ${today}. Only future events. No markdown.`,
        messages: [{ role: 'user', content: `Search for: site:sistic.com.sg upcoming events Singapore ${new Date().getFullYear()}\nReturn upcoming SISTIC events as JSON array.` }],
      }, claudeApiKey)

      const fallbackTokens = (claudeData.usage?.input_tokens ?? 0) + (claudeData.usage?.output_tokens ?? 0)
      if (fallbackTokens > 0) { totalTokens += fallbackTokens; await addTokens(supabase, fallbackTokens) }

      const blocks = (claudeData.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text as string)
      let result: unknown[] | null = null
      for (let i = blocks.length - 1; i >= 0; i--) { result = extractJson(blocks[i]); if (result) break }
      if (result) events = (result as EventData[]).filter((e) => e.title && e.event_date)
    } catch (err) {
      return new Response(JSON.stringify({ error: `All strategies failed: ${err}` }),
        { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
  }

  if (events.length === 0) {
    return new Response(JSON.stringify({ new_events: 0, strategy, message: 'No events found' }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  // Fetch existing events for dedup
  const { data: existingEvents } = await supabase
    .from('events').select('id, title, event_date, venue')
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })

  const { events: dedupedEvents, tokensUsed: dedupTokens } = await deduplicateWithClaude(events, existingEvents ?? [], claudeApiKey, maxTokensPerCall)
  if (dedupTokens > 0) { totalTokens += dedupTokens; await addTokens(supabase, dedupTokens) }

  // Insert
  let newCount = 0
  for (const event of dedupedEvents) {
    const { error } = await supabase.from('events').insert({
      title: event.title, description: event.description, short_summary: event.short_summary,
      category: event.category, audience: Array.isArray((event as any).audience) ? (event as any).audience : null,
      event_date: event.event_date, event_end_date: event.event_end_date,
      venue: event.venue, price_min: event.price_min, price_max: event.price_max,
      is_free: event.is_free, source_url: event.source_url, booking_url: event.booking_url,
      image_url: event.image_url, source_name: 'SISTIC',
    })
    if (!error) newCount++
  }

  // Update discovery_sources
  await supabase.from('discovery_sources')
    .update({ last_run_at: new Date().toISOString(), last_run_count: newCount })
    .eq('value', SISTIC_URL)

  return new Response(
    JSON.stringify({ strategy, found: events.length, after_dedup: dedupedEvents.length, new_events: newCount, tokens_used: totalTokens }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
