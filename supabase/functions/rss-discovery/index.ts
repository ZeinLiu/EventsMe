import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
}

interface RssItem {
  title: string
  link: string
  description: string
  pubDate: string
  imageUrl: string
}

async function callClaude(
  body: object,
  apiKey: string,
  maxRetries = 3,
): Promise<{ content: Array<{ type: string; text?: string }> }> {
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
      const sec = parseInt(res.headers.get('retry-after') ?? '30', 10)
      await new Promise((r) => setTimeout(r, sec * 1000))
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
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return parsed
    } catch { /* try next */ }
  }
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function extractXmlTag(xml: string, tag: string): string {
  // CDATA
  const cdata = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`, 'i'))
  if (cdata) return cdata[1].trim()
  // Regular
  const regular = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  if (regular) return stripHtml(regular[1]).slice(0, 500)
  return ''
}

function extractXmlAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["']`, 'i'))
  return m ? m[1] : ''
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const title = extractXmlTag(block, 'title')
    if (!title) continue

    // <link> can be plain text or an href attribute
    let link = extractXmlTag(block, 'link')
    if (!link) link = extractXmlAttr(block, 'link', 'href')

    const description = extractXmlTag(block, 'content:encoded') || extractXmlTag(block, 'description')
    const pubDate = extractXmlTag(block, 'pubDate') || extractXmlTag(block, 'dc:date')
    const imageUrl = extractXmlAttr(block, 'media:content', 'url') ||
                     extractXmlAttr(block, 'enclosure', 'url') ||
                     extractXmlAttr(block, 'media:thumbnail', 'url')

    items.push({ title, link, description, pubDate, imageUrl })
  }
  return items
}

async function deduplicateWithClaude(
  newEvents: EventData[],
  existing: ExistingEvent[],
  apiKey: string,
): Promise<EventData[]> {
  if (newEvents.length === 0) return []
  if (existing.length === 0) return newEvents
  try {
    const data = await callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are a deduplication engine for a Singapore events database. Given NEW events and EXISTING events, return ONLY the new events that are NOT semantic duplicates of existing ones. Two events are duplicates if they are the same real-world event (even with different titles, ±2-day dates, or one event being a subset of another). Return a JSON array. No markdown.`,
      messages: [{
        role: 'user',
        content: `EXISTING:\n${JSON.stringify(existing.map((e) => ({ id: e.id, title: e.title, date: e.event_date, venue: e.venue })))}\n\nNEW:\n${JSON.stringify(newEvents)}\n\nReturn only non-duplicate new events as JSON array.`,
      }],
    }, apiKey)
    const blocks = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text as string)
    let result: unknown[] | null = null
    for (let i = blocks.length - 1; i >= 0; i--) { result = extractJson(blocks[i]); if (result) break }
    return (result as EventData[]) ?? newEvents
  } catch {
    return newEvents
  }
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

  // Load active RSS sources
  const { data: sources, error: srcErr } = await supabase
    .from('discovery_sources')
    .select('*')
    .eq('type', 'rss')
    .eq('is_active', true)
    .order('last_run_at', { ascending: true, nullsFirst: true })

  if (srcErr || !sources?.length) {
    return new Response(JSON.stringify({ sources_processed: 0, total_new_events: 0, results: [] }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  // Fetch existing events once for dedup
  const { data: existingEvents } = await supabase
    .from('events')
    .select('id, title, event_date, venue')
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })

  const today = new Date()
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000)
  const todayStr = today.toISOString().split('T')[0]

  const results: Array<{ source: string; new_events: number; error?: string }> = []
  let totalNewEvents = 0

  for (const source of sources) {
    try {
      // Fetch RSS feed
      const feedRes = await fetch(source.value, {
        headers: { 'User-Agent': 'Mozilla/5.0 EventsMe RSS Reader', 'Accept': 'application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!feedRes.ok) throw new Error(`Feed returned ${feedRes.status}`)
      const xml = await feedRes.text()

      // Parse items, filter to last 30 days
      const allItems = parseRssItems(xml)
      const recentItems = allItems.filter((item) => {
        if (!item.pubDate) return true  // keep if no date
        const d = new Date(item.pubDate)
        return !isNaN(d.getTime()) && d >= thirtyDaysAgo
      })

      if (recentItems.length === 0) {
        results.push({ source: source.label, new_events: 0 })
        continue
      }

      // Extract events from RSS items in batches of 10
      const allExtracted: EventData[] = []
      const BATCH = 10

      for (let i = 0; i < recentItems.length; i += BATCH) {
        const batch = recentItems.slice(i, i + BATCH)
        try {
          const claudeData = await callClaude({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            system: `You are an event extraction engine for Singapore. Given RSS feed articles, identify which ones are about upcoming events or activities in Singapore. For each event found return structured JSON. Skip opinion pieces, news articles, and reviews of past events.

Return ONLY a JSON array of events with exactly these fields:
{"title","description","short_summary","category","event_date","event_end_date","venue","price_min","price_max","is_free","source_url","booking_url","image_url","source_name"}

category must be one of: Kids & Family, Arts & Culture, Food & Lifestyle, Nature & Wildlife, Education & Science, Music & Concerts, Sports & Fitness, Cultural & National, Arts & Performance
event_date format: YYYY-MM-DD or null
If imageUrl is provided with the article, use it as image_url.
Today: ${todayStr}. Only include events happening in the future.
Return [] if no upcoming events found.`,
            messages: [{
              role: 'user',
              content: JSON.stringify(batch.map((item) => ({
                title: item.title,
                description: item.description.slice(0, 400),
                url: item.link,
                pubDate: item.pubDate,
                imageUrl: item.imageUrl || null,
                source_name: source.label,
              }))),
            }],
          }, claudeApiKey)

          const blocks = (claudeData.content ?? []).filter((b) => b.type === 'text').map((b) => b.text as string)
          let extracted: unknown[] | null = null
          for (let j = blocks.length - 1; j >= 0; j--) { extracted = extractJson(blocks[j]); if (extracted) break }
          if (extracted) allExtracted.push(...(extracted as EventData[]).filter((e) => e.title && e.event_date))
        } catch (batchErr) {
          // One batch failing is non-fatal
          console.error(`Batch error: ${batchErr}`)
        }

        await new Promise((r) => setTimeout(r, 1000))
      }

      if (allExtracted.length === 0) {
        results.push({ source: source.label, new_events: 0 })
        continue
      }

      // AI dedup against existing events
      const dedupedEvents = await deduplicateWithClaude(allExtracted, existingEvents ?? [], claudeApiKey)

      // Insert non-duplicates
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
          source_name: source.label,
        })
        if (!insertError) newCount++
      }

      await supabase.from('discovery_sources').update({
        last_run_at: new Date().toISOString(),
        last_run_count: newCount,
        total_events_found: (source.total_events_found ?? 0) + newCount,
      }).eq('id', source.id)

      results.push({ source: source.label, new_events: newCount })
      totalNewEvents += newCount

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ source: source.label, new_events: 0, error: msg })
    }

    await new Promise((r) => setTimeout(r, 2000))
  }

  return new Response(
    JSON.stringify({ sources_processed: sources.length, total_new_events: totalNewEvents, results }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
