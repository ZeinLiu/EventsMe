'use strict'
require('dotenv').config({ path: __dirname + '/.env' })
const { createClient } = require('@supabase/supabase-js')

// ── Source handlers ────────────────────────────────────────────
// Each handler exports a run(source, supabase) → { new_events, searched, fetched }
const HANDLERS = {
  xhs: require('./sources/xhs'),
  // Future: grab, carousell, eventbrite_scrape, etc.
  // Just add the type key and a matching file in sources/
}

// ── Pending imports queue ──────────────────────────────────────
async function processPendingImports(supabase) {
  const { data: pending } = await supabase
    .from('pending_imports')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (!pending?.length) return

  console.log(`\n── Pending imports: ${pending.length} item(s) ─────────`)

  for (const item of pending) {
    console.log(`[PendingImport] ${item.url}`)

    // Detect source type from URL
    const isXHS = /rednote\.com|xiaohongshu\.com|xhslink\.com/.test(item.url)
    if (!isXHS) {
      await supabase.from('pending_imports').update({
        status: 'failed',
        result: { error: 'Unsupported URL — only XHS/rednote URLs are supported' },
        processed_at: new Date().toISOString(),
      }).eq('id', item.id)
      continue
    }

    await supabase.from('pending_imports').update({ status: 'processing' }).eq('id', item.id)

    try {
      const xhs = require('./sources/xhs')
      const result = await xhs.importFromUrl(item.url, supabase)
      await supabase.from('pending_imports').update({
        status: 'done',
        result,
        processed_at: new Date().toISOString(),
      }).eq('id', item.id)
      console.log(`[PendingImport] ✓ ${result.new_events} event(s): ${result.titles?.join(', ') || 'none'}`)
    } catch (err) {
      await supabase.from('pending_imports').update({
        status: 'failed',
        result: { error: err.message },
        processed_at: new Date().toISOString(),
      }).eq('id', item.id)
      console.warn(`[PendingImport] ✗ ${err.message}`)
    }

    await new Promise(r => setTimeout(r, 2000))
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in scripts/.env')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  // Optional --type filter: node local-sync.js --type xhs
  const typeArg = process.argv.find(a => a.startsWith('--type='))?.split('=')[1]
    ?? (process.argv.includes('--type') ? process.argv[process.argv.indexOf('--type') + 1] : null)

  const supportedTypes = typeArg ? [typeArg] : Object.keys(HANDLERS)

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`EventsMe local sync — ${new Date().toLocaleString('en-SG')}`)
  console.log(`Types: ${supportedTypes.join(', ')}`)
  console.log(`${'─'.repeat(50)}`)

  const { data: sources, error } = await supabase
    .from('discovery_sources')
    .select('*')
    .in('type', supportedTypes)
    .eq('is_active', true)
    .order('last_run_at', { ascending: true, nullsFirst: true })

  if (error) {
    console.error('Failed to load sources:', error.message)
    process.exit(1)
  }

  if (!sources?.length) {
    console.log('No active local sources found.')
    return
  }

  // Process any manually queued URLs first
  await processPendingImports(supabase)

  console.log(`\nFound ${sources.length} source(s) to process\n`)

  const summary = []

  for (const source of sources) {
    const handler = HANDLERS[source.type]
    if (!handler) {
      console.warn(`No handler for type "${source.type}" — skipping ${source.label}`)
      continue
    }

    try {
      const result = await handler.run(source, supabase)
      summary.push({ label: source.label, ...result })

      await supabase
        .from('discovery_sources')
        .update({
          last_run_at: new Date().toISOString(),
          last_run_count: result.new_events ?? 0,
          total_events_found: (source.total_events_found ?? 0) + (result.new_events ?? 0),
        })
        .eq('id', source.id)

    } catch (err) {
      console.error(`[${source.label}] Uncaught error:`, err.message)
      summary.push({ label: source.label, error: err.message })

      await supabase
        .from('discovery_sources')
        .update({ last_run_at: new Date().toISOString(), last_run_count: 0 })
        .eq('id', source.id)
    }

    // Brief pause between sources
    await new Promise(r => setTimeout(r, 2000))
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`)
  console.log('Summary:')
  for (const r of summary) {
    if (r.error) {
      console.log(`  ✗  ${r.label}: ${r.error}`)
    } else {
      const detail = [
        `${r.new_events} new`,
        r.searched != null ? `${r.searched} searched` : null,
        r.fetched != null  ? `${r.fetched} fetched`   : null,
        r.tokens  != null  ? `${r.tokens} tokens`     : null,
      ].filter(Boolean).join(', ')
      console.log(`  ✓  ${r.label}: ${detail}`)
    }
  }
  console.log(`${'─'.repeat(50)}\n`)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
