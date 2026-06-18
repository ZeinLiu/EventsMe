'use strict'
const { execFileSync } = require('child_process')

const LIKES_THRESHOLD = parseInt(process.env.LIKES_THRESHOLD  ?? '10')
const MAX_NOTES       = parseInt(process.env.MAX_NOTES_PER_SOURCE ?? '10')
const LOOKBACK_DAYS   = parseInt(process.env.LOOKBACK_DAYS    ?? '14')

// ── opencli wrappers ──────────────────────────────────────────

function searchXHS(query) {
  const raw = execFileSync('opencli', ['rednote', 'search', query, '-f', 'json'], {
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  })
  return JSON.parse(raw)
}

function fetchNote(url) {
  try {
    const raw = execFileSync('opencli', ['rednote', 'note', url, '-f', 'json'], {
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    })
    const parsed = JSON.parse(raw)
    // opencli returns [{field, value}, ...] — normalise to plain object
    if (Array.isArray(parsed))
      return parsed.reduce((obj, { field, value }) => ({ ...obj, [field]: value }), {})
    return parsed
  } catch {
    return null
  }
}

// ── Claude extraction ─────────────────────────────────────────

async function extractEvents(notes, today) {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) throw new Error('CLAUDE_API_KEY not set in scripts/.env')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: `You are an event extraction engine for Singapore. Given XHS (小红书) posts in Chinese, identify which describe specific upcoming events or activities in Singapore. Keep all event titles and descriptions in their original Chinese.

Return ONLY a JSON array — no markdown. Skip: personal diaries, lifestyle posts, restaurant reviews, immigration content, product ads.
Include: events with specific dates, workshops, exhibitions, festivals, ticketed activities, free public events.

Each object must have exactly these fields:
{"title","description","short_summary","category","audience","event_date","event_end_date","venue","price_min","price_max","is_free","source_url","booking_url","image_url","source_name","language"}

Rules:
- title/description: keep in original Chinese
- short_summary: max 30 words in English
- category: one of: Kids & Family, Arts & Culture, Food & Lifestyle, Nature & Wildlife, Education & Science, Music & Concerts, Sports & Fitness, Cultural & National
- audience: array of one or more: toddlers, young_kids, kids, teens, adults, all_ages
- event_date / event_end_date: YYYY-MM-DD or null
- price_min / price_max: numbers (0 if unknown/free)
- source_name: "XHS"
- language: "zh"
- booking_url / image_url: null if unknown

Today: ${today}. Only include events happening in the future. Return [] if no actual events found.`,
      messages: [{
        role: 'user',
        content: JSON.stringify(
          notes.map(n => ({
            title:        n.title,
            content:      (n.content ?? n.body ?? '').slice(0, 1000),
            tags:         n.tags ?? [],
            source_url:   n.url,
            published_at: n.published_at,
          }))
        ),
      }],
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0)
  const text = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('')

  // Try to parse JSON from response
  for (const candidate of [text.trim(), (text.match(/\[[\s\S]*\]/) ?? [])[0]]) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return { events: parsed, tokens }
    } catch { /* try next candidate */ }
  }
  return { events: [], tokens }
}

// ── Main handler ──────────────────────────────────────────────

async function run(source, supabase) {
  const today  = new Date().toISOString().split('T')[0]
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)

  console.log(`\n[${source.label}] Searching: ${source.value}`)

  // 1. Search XHS for this hashtag/query
  let results
  try {
    results = searchXHS(source.value)
  } catch (err) {
    throw new Error(`opencli search failed — is the browser bridge running? (${err.message})`)
  }

  // 2. Filter to recent posts
  const recent = results.filter(r => {
    if (!r.published_at) return true
    return new Date(r.published_at) >= cutoff
  })
  console.log(`[${source.label}] ${results.length} total, ${recent.length} within last ${LOOKBACK_DAYS} days`)

  if (recent.length === 0) return { new_events: 0, searched: 0, fetched: 0, tokens: 0 }

  // 3. Sort by likes, take top N (filter by threshold only if > 0)
  const candidates = recent
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    .filter(r => LIKES_THRESHOLD === 0 || (r.likes ?? 0) >= LIKES_THRESHOLD)
    .slice(0, MAX_NOTES)

  if (candidates.length === 0) {
    console.log(`[${source.label}] No candidates after filtering`)
    return { new_events: 0, searched: recent.length, fetched: 0, tokens: 0 }
  }

  // 4. Skip URLs already in the database
  const urls = candidates.map(r => r.url).filter(Boolean)
  const { data: knownRows } = await supabase.from('events').select('source_url').in('source_url', urls)
  const knownUrls = new Set((knownRows ?? []).map(e => e.source_url))
  const fresh = candidates.filter(r => !knownUrls.has(r.url))

  console.log(`[${source.label}] ${fresh.length} fresh candidates after URL dedup (${candidates.length - fresh.length} already in DB)`)
  if (fresh.length === 0) return { new_events: 0, searched: recent.length, fetched: 0, tokens: 0 }

  // 5. Fetch full note body for each candidate
  const notes = []
  for (const c of fresh) {
    console.log(`[${source.label}]   Fetching note: ${c.title?.slice(0, 50) ?? c.url}`)
    const note = fetchNote(c.url)
    if (note) notes.push({ ...note, url: c.url, published_at: c.published_at })
    await new Promise(r => setTimeout(r, 1500))
  }

  if (notes.length === 0) return { new_events: 0, searched: recent.length, fetched: 0, tokens: 0 }
  console.log(`[${source.label}] Fetched ${notes.length} notes — sending to Claude`)

  // 6. Claude event extraction
  const { events, tokens } = await extractEvents(notes, today)
  console.log(`[${source.label}] Claude extracted ${events.length} event(s) using ${tokens} tokens`)

  // 7. Insert to Supabase
  let newCount = 0
  for (const event of events) {
    const { error } = await supabase.from('events').insert({
      title:          event.title          ?? null,
      description:    event.description    ?? null,
      short_summary:  event.short_summary  ?? null,
      category:       event.category       ?? null,
      audience:       Array.isArray(event.audience) ? event.audience : null,
      event_date:     event.event_date     ?? null,
      event_end_date: event.event_end_date ?? null,
      venue:          event.venue          ?? null,
      price_min:      Number(event.price_min)  || 0,
      price_max:      Number(event.price_max)  || 0,
      is_free:        Boolean(event.is_free),
      source_url:     event.source_url     ?? null,
      booking_url:    event.booking_url    ?? null,
      image_url:      null,
      source_name:    'XHS',
      language:       'zh',
    })
    if (!error) newCount++
    else console.warn(`[${source.label}]   Insert failed: ${error.message}`)
  }

  return { new_events: newCount, searched: recent.length, fetched: notes.length, tokens }
}

// ── Single-URL import (for pending_imports queue) ─────────────

async function importFromUrl(url, supabase) {
  const today = new Date().toISOString().split('T')[0]

  console.log(`[ManualImport] Fetching note: ${url}`)
  const note = fetchNote(url)
  if (!note) throw new Error('opencli could not fetch note (security block or bad URL)')

  // Check if already in DB
  const { data: existing } = await supabase.from('events').select('id').eq('source_url', url).maybeSingle()
  if (existing) return { new_events: 0, titles: [], skipped: 'already in DB' }

  console.log(`[ManualImport] Sending to Claude`)
  const { events, tokens } = await extractEvents([{ ...note, url }], today)
  console.log(`[ManualImport] Claude extracted ${events.length} event(s) using ${tokens} tokens`)

  const titles = []
  for (const event of events) {
    const { error } = await supabase.from('events').insert({
      title:          event.title          ?? null,
      description:    event.description    ?? null,
      short_summary:  event.short_summary  ?? null,
      category:       event.category       ?? null,
      audience:       Array.isArray(event.audience) ? event.audience : null,
      event_date:     event.event_date     ?? null,
      event_end_date: event.event_end_date ?? null,
      venue:          event.venue          ?? null,
      price_min:      Number(event.price_min)  || 0,
      price_max:      Number(event.price_max)  || 0,
      is_free:        Boolean(event.is_free),
      source_url:     event.source_url     ?? url,
      booking_url:    event.booking_url    ?? null,
      image_url:      null,
      source_name:    'XHS',
      language:       'zh',
    })
    if (!error) titles.push(event.title ?? '(untitled)')
    else console.warn(`[ManualImport]   Insert failed: ${error.message}`)
  }

  return { new_events: titles.length, titles, tokens }
}

module.exports = { run, importFromUrl }
