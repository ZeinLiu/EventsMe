import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DiscoverySource {
  id: string
  label: string
  value: string
  last_run_count: number
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

// Call Claude API with automatic retry on 429 rate-limit errors.
// Uses the retry-after header if Anthropic provides it, otherwise backs off by 30 s.
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

    return res.json()
  }
  throw new Error('Claude API: max retries exceeded')
}

// Extract a JSON array from Claude's text output.
// Handles: raw array, markdown code block, array embedded in prose.
function extractJson(text: string): EventData[] | null {
  const clean = text.trim()

  try {
    const parsed = JSON.parse(clean)
    if (Array.isArray(parsed)) return parsed
  } catch { /* fall through */ }

  const codeBlock = clean.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) {
    try {
      const parsed = JSON.parse(codeBlock[1].trim())
      if (Array.isArray(parsed)) return parsed
    } catch { /* fall through */ }
  }

  const arrayMatch = clean.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0])
      if (Array.isArray(parsed)) return parsed
    } catch { /* fall through */ }
  }

  return null
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

  // 1. Read active AI search sources
  const { data: sources, error: sourcesError } = await supabase
    .from('discovery_sources')
    .select('*')
    .eq('type', 'ai_search')
    .eq('is_active', true)

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

  const results: Array<{ source: string; new_events: number; error?: string }> = []
  let totalNewEvents = 0

  // 2. Process each source
  for (const source of sources as DiscoverySource[]) {
    try {
      const today = new Date().toISOString().split('T')[0]

      // Call Claude with web_search tool (retries automatically on 429)
      const claudeData = await callClaude({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are an event discovery engine for Singapore. Search the web for events matching the query. Extract ALL events found and return ONLY a JSON array with no extra text.

Each event must have these fields:
{
  "title": "event name",
  "description": "full description",
  "short_summary": "max 50 words, family focused",
  "category": "one of: Kids & Family, Arts & Culture, Food & Lifestyle, Nature & Wildlife, Education & Science, Music & Concerts, Sports & Fitness, Cultural & National, Arts & Performance",
  "event_date": "YYYY-MM-DD or null",
  "event_end_date": "YYYY-MM-DD or null",
  "venue": "venue name and area",
  "price_min": 0,
  "price_max": 0,
  "is_free": true,
  "source_url": "url where event was found",
  "booking_url": "booking or more info url",
  "image_url": "image url or null",
  "source_name": "website name"
}

Only include real upcoming events with dates.
Skip past events.
Skip events outside Singapore.
Return minimum 5, maximum 15 events per search.`,
        messages: [{
          role: 'user',
          content: `Search for: ${source.value}\nToday's date: ${today}\nReturn only upcoming Singapore events as JSON array.`,
        }],
      }, claudeApiKey)

      // 3. Parse JSON array from Claude's text blocks.
      // Web search adds preamble blocks — the JSON is always in the LAST text block.
      const textBlocks: string[] = (claudeData.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { type: string; text: string }) => b.text)
      const combinedText = textBlocks.join('\n')
      if (!combinedText.trim()) throw new Error('No text content in Claude response')

      const events = extractJson(combinedText)
      if (!events) throw new Error('Could not parse JSON array from Claude response')

      // 4. Insert non-duplicate events
      let newCount = 0
      for (const event of events) {
        if (!event.title || !event.event_date) continue

        // Duplicate check: same title (fuzzy) + same date
        const { data: existing } = await supabase
          .from('events')
          .select('id')
          .ilike('title', `%${event.title}%`)
          .eq('event_date', event.event_date)
          .limit(1)

        if (existing && existing.length > 0) continue

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

      // 5. Update source metadata
      await supabase
        .from('discovery_sources')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_count: newCount,
          total_events_found: (source.total_events_found ?? 0) + newCount,
        })
        .eq('id', source.id)

      results.push({ source: source.label, new_events: newCount })
      totalNewEvents += newCount

    } catch (err) {
      // One source failing must not abort the rest
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ source: source.label, new_events: 0, error: msg })
    }

    // Pause between sources to avoid Claude API rate limits
    await new Promise((r) => setTimeout(r, 2000))
  }

  // 6. Return summary
  return new Response(
    JSON.stringify({
      sources_processed: sources.length,
      total_new_events: totalNewEvents,
      results,
    }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
