import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EventRow {
  id: string
  title: string
  description: string | null
  event_date: string | null
  event_end_date: string | null
  venue: string | null
  source_name: string | null
  is_free: boolean
}

interface DedupGroup {
  keep: string
  delete: string[]
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

function extractDedupGroups(text: string): DedupGroup[] | null {
  const clean = text.trim()
  const candidates: string[] = []

  // Try raw parse
  candidates.push(clean)

  // Try code block
  const codeBlock = clean.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) candidates.push(codeBlock[1].trim())

  // Try outermost array
  const start = clean.indexOf('[')
  const end = clean.lastIndexOf(']')
  if (start !== -1 && end > start) candidates.push(clean.slice(start, end + 1))

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (!Array.isArray(parsed)) continue
      // Validate shape: each item must have keep (string) and delete (string[])
      const groups = parsed.filter(
        (item: unknown) =>
          item !== null &&
          typeof item === 'object' &&
          typeof (item as DedupGroup).keep === 'string' &&
          Array.isArray((item as DedupGroup).delete),
      ) as DedupGroup[]
      return groups
    } catch { /* try next */ }
  }

  return null
}

// Group events into non-overlapping 7-day windows and return only windows with 2+ events.
function buildCandidateWindows(events: EventRow[]): EventRow[][] {
  const withDates = events.filter((e) => e.event_date)
  if (withDates.length < 2) return []

  withDates.sort((a, b) => a.event_date!.localeCompare(b.event_date!))

  const windows: EventRow[][] = []
  const MS_PER_DAY = 86_400_000
  let windowStart = new Date(withDates[0].event_date!).getTime()

  while (true) {
    const windowEnd = windowStart + 7 * MS_PER_DAY
    const bucket = withDates.filter((e) => {
      const t = new Date(e.event_date!).getTime()
      return t >= windowStart && t < windowEnd
    })
    if (bucket.length >= 2) windows.push(bucket)
    if (windowEnd > new Date(withDates[withDates.length - 1].event_date!).getTime()) break
    windowStart = windowEnd
  }

  return windows
}

// Flatten candidate windows into batches capped at maxPerBatch events.
// Each batch stays within one window to keep context coherent.
function buildBatches(windows: EventRow[][], maxPerBatch = 20): EventRow[][] {
  const batches: EventRow[][] = []
  for (const window of windows) {
    for (let i = 0; i < window.length; i += maxPerBatch) {
      const slice = window.slice(i, i + maxPerBatch)
      if (slice.length >= 2) batches.push(slice)
    }
  }
  return batches
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

  // 1. Fetch all events
  const { data: allEvents, error: fetchError } = await supabase
    .from('events')
    .select('id, title, description, event_date, event_end_date, venue, source_name, is_free')
    .order('event_date', { ascending: true })

  if (fetchError) {
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  if (!allEvents || allEvents.length < 2) {
    return new Response(
      JSON.stringify({ batches_processed: 0, duplicates_deleted: 0, deleted_ids: [] }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  // 2. Build candidate windows (7-day buckets) then batches for Claude
  const windows = buildCandidateWindows(allEvents as EventRow[])
  const batches = buildBatches(windows)

  if (batches.length === 0) {
    return new Response(
      JSON.stringify({ batches_processed: 0, duplicates_deleted: 0, deleted_ids: [] }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  const allDeletedIds: string[] = []
  const alreadyDeleted = new Set<string>()
  let batchesProcessed = 0
  const errors: string[] = []

  // 3. Send each batch to Claude and collect duplicate groups
  for (const batch of batches) {
    // Skip events already deleted in a previous batch
    const liveBatch = batch.filter((e) => !alreadyDeleted.has(e.id))
    if (liveBatch.length < 2) continue

    try {
      const claudeData = await callClaude({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `You are a deduplication engine for a Singapore events database.
These events may be duplicates of each other. Identify which ones refer to the same real-world event.

Two events are duplicates if they share the same real-world event, even if:
- Titles are slightly different or translated
- Dates differ by 1-2 days
- Descriptions differ but venue + date match

For each group of duplicates, decide which ID to KEEP (the one with the most complete information) and which to DELETE.

Return ONLY a JSON array. Each element must be: {"keep": "uuid", "delete": ["uuid1", "uuid2"]}.
Return [] if there are no duplicates in this batch.
No markdown, no explanation, no code blocks. Start with [ and end with ].`,
        messages: [{
          role: 'user',
          content: JSON.stringify(
            liveBatch.map((e) => ({
              id: e.id,
              title: e.title,
              date: e.event_date,
              end_date: e.event_end_date,
              venue: e.venue,
              source: e.source_name,
              is_free: e.is_free,
              description_preview: e.description?.slice(0, 100) ?? null,
            })),
          ),
        }],
      }, claudeApiKey)

      const textBlocks = (claudeData.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { type: string; text: string }) => b.text)

      let groups: DedupGroup[] | null = null
      for (let i = textBlocks.length - 1; i >= 0; i--) {
        groups = extractDedupGroups(textBlocks[i])
        if (groups !== null) break
      }
      if (groups === null && textBlocks.length > 0) {
        groups = extractDedupGroups(textBlocks.join('\n'))
      }

      if (groups && groups.length > 0) {
        // 4. Delete the duplicates Claude identified, keeping the best version
        for (const group of groups) {
          const toDelete = group.delete.filter((id) => !alreadyDeleted.has(id))
          if (toDelete.length === 0) continue

          const { error: deleteError } = await supabase
            .from('events')
            .delete()
            .in('id', toDelete)

          if (!deleteError) {
            for (const id of toDelete) alreadyDeleted.add(id)
            allDeletedIds.push(...toDelete)
          } else {
            errors.push(`Delete failed for [${toDelete.join(', ')}]: ${deleteError.message}`)
          }
        }
      }

      batchesProcessed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`Batch error: ${msg}`)
    }

    // Brief pause between Claude calls to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1500))
  }

  // 5. Return summary
  return new Response(
    JSON.stringify({
      batches_processed: batchesProcessed,
      total_candidate_batches: batches.length,
      duplicates_deleted: allDeletedIds.length,
      deleted_ids: allDeletedIds,
      ...(errors.length > 0 ? { errors } : {}),
    }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
