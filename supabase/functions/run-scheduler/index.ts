import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Maps a discovery source to the edge function that processes it
function resolveFunctionName(source: { type: string; label: string }): string | null {
  if (source.type === 'ai_search') return 'claude-discovery'
  if (source.type === 'rss')       return 'rss-discovery'
  if (source.type === 'scraper')   return 'sistic-sync'
  if (source.type === 'api') {
    const label = source.label.toLowerCase()
    if (label.includes('eventbrite'))   return 'eventbrite-sync'
    if (label.includes('ticketmaster')) return 'ticketmaster-sync'
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase    = createClient(supabaseUrl, serviceKey)

  try {
    const body      = await req.json().catch(() => ({}))
    const sourceId  = body?.source_id as string | undefined   // run a single source
    const scheduled = body?.scheduled as boolean | undefined  // called from CI

    // ── 1. Master switch ─────────────────────────────────────────────────────
    const { data: settingsRows } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['discovery_enabled', 'daily_token_limit', 'daily_tokens_used'])

    const cfg: Record<string, string> = {}
    ;(settingsRows ?? []).forEach((r: any) => { cfg[r.key] = r.value })

    if (cfg.discovery_enabled !== 'true') {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'discovery_disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 2. Daily token budget ────────────────────────────────────────────────
    const dailyLimit = parseInt(cfg.daily_token_limit  ?? '300000')
    const dailyUsed  = parseInt(cfg.daily_tokens_used  ?? '0')

    if (dailyUsed >= dailyLimit && !sourceId) {
      return new Response(
        JSON.stringify({ skipped: true, reason: 'daily_token_limit_exceeded', used: dailyUsed, limit: dailyLimit }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── 3. Determine which sources to run ────────────────────────────────────
    let sourcesToRun: any[] = []

    if (sourceId) {
      // Manual "Run Now" for a specific source
      const { data } = await supabase
        .from('discovery_sources')
        .select('*')
        .eq('id', sourceId)
        .single()
      if (data) sourcesToRun = [data]
    } else {
      // Scheduled run — pick sources due today
      const todayDay = new Date().getDay().toString()  // 0=Sun, 1=Mon…
      const today    = new Date().getDate()

      const { data: allSources } = await supabase
        .from('discovery_sources')
        .select('*')
        .eq('is_active', true)
        .neq('refresh_frequency', 'manual')

      sourcesToRun = (allSources ?? []).filter((s: any) => {
        if (s.refresh_frequency === 'daily')   return true
        if (s.refresh_frequency === 'weekly')  {
          const days = (s.refresh_days ?? '').split(',').map((d: string) => d.trim())
          return days.includes(todayDay)
        }
        if (s.refresh_frequency === 'monthly') return today === 1
        return false
      })
    }

    // ── 4. Run each source ───────────────────────────────────────────────────
    let tokensDelta = 0
    const results: any[] = []

    for (const source of sourcesToRun) {
      const fnName = resolveFunctionName(source)
      if (!fnName) {
        results.push({ source: source.label, skipped: true, reason: 'no_function_mapped' })
        continue
      }

      const runStart = Date.now()

      // Record run start in discovery_runs
      const { data: runRow } = await supabase
        .from('discovery_runs')
        .insert({
          source_id:    source.id,
          source_label: source.label,
          source_type:  source.type,
          status:       'running',
        })
        .select()
        .single()

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ source_id: source.id }),
        })

        const payload    = await res.json().catch(() => ({}))
        const events     = payload.events_found ?? payload.inserted ?? payload.upserted ?? 0
        const tokens     = payload.tokens_used  ?? 0
        const durationMs = Date.now() - runStart
        const status     = res.ok ? 'success' : 'error'

        // Update run record
        if (runRow) {
          await supabase.from('discovery_runs').update({
            finished_at:   new Date().toISOString(),
            events_found:  events,
            tokens_used:   tokens,
            status,
            error_message: res.ok ? null : JSON.stringify(payload).slice(0, 500),
          }).eq('id', runRow.id)
        }

        // Update source stats
        const prevEvents = source.total_events_found ?? 0
        const prevRuns   = source.run_count          ?? 0
        const newRuns    = prevRuns + 1

        await supabase.from('discovery_sources').update({
          last_run_at:        new Date(runStart).toISOString(),
          last_run_count:     events,
          total_events_found: prevEvents + events,
          total_tokens_used:  (source.total_tokens_used ?? 0) + tokens,
          run_count:          newRuns,
          avg_events_per_run: (prevEvents + events) / newRuns,
          last_successful_run: status === 'success' ? new Date(runStart).toISOString() : source.last_successful_run,
        }).eq('id', source.id)

        tokensDelta += tokens
        results.push({ source: source.label, function: fnName, events, tokens, durationMs, status })
      } catch (err: any) {
        if (runRow) {
          await supabase.from('discovery_runs').update({
            finished_at:   new Date().toISOString(),
            status:        'error',
            error_message: err.message,
          }).eq('id', runRow.id)
        }
        results.push({ source: source.label, function: fnName, status: 'error', error: err.message })
      }
    }

    // ── 5. Update daily token counter ────────────────────────────────────────
    if (tokensDelta > 0) {
      await supabase
        .from('app_settings')
        .update({ value: String(dailyUsed + tokensDelta) })
        .eq('key', 'daily_tokens_used')
    }

    // ── 6. Always run dedup cleanup (scheduled runs only) ────────────────────
    if (!sourceId) {
      await fetch(`${supabaseUrl}/functions/v1/cleanup-duplicates`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }).catch(() => {/* non-fatal */})
    }

    return new Response(
      JSON.stringify({ ok: true, ran: results.length, tokensDelta, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
