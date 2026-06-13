import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const TYPE_COLORS = {
  api:       'bg-blue-100 text-blue-700',
  rss:       'bg-orange-100 text-orange-700',
  ai_search: 'bg-purple-100 text-purple-700',
  scraper:   'bg-yellow-100 text-yellow-800',
}

const STATUS_COLORS = {
  success: 'bg-green-100 text-green-700',
  error:   'bg-red-100 text-red-700',
  running: 'bg-blue-100 text-blue-700',
}

function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n ?? 0)
}

function StatCard({ label, value, sub, color = 'gray' }) {
  const palette = {
    green:  'bg-green-50  border-green-200',
    blue:   'bg-blue-50   border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
    orange: 'bg-orange-50 border-orange-200',
    amber:  'bg-amber-50  border-amber-200',
    gray:   'bg-white     border-gray-200',
  }
  return (
    <div className={`rounded-2xl border px-5 py-4 ${palette[color]}`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function UsageBar({ label, used, limit, color = 'bg-brand-500' }) {
  const pct     = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const isHigh  = pct > 80
  const barColor = isHigh ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : color

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-500 tabular-nums">
          {fmtTokens(used)} / {fmtTokens(limit)}
        </span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={`text-right text-xs mt-0.5 ${isHigh ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
        {pct.toFixed(1)}%{isHigh ? ' — approaching limit' : ''}
      </p>
    </div>
  )
}

export default function AdminUsage() {
  const [stats, setStats]         = useState(null)
  const [sources, setSources]     = useState([])
  const [runs, setRuns]           = useState([])
  const [settings, setSettings]   = useState({})
  const [loading, setLoading]     = useState(true)
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg]   = useState('')
  const [error, setError]         = useState('')

  const load = useCallback(async () => {
    const now        = new Date()
    const dayStart   = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const weekStart  = (() => {
      const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d.toISOString()
    })()

    const [eventsRes, sourcesRes, todayRes, weekRes, monthRes, runsRes, settingsRes] = await Promise.all([
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('is_archived', false),
      supabase.from('discovery_sources').select('*').order('total_events_found', { ascending: false }),
      supabase.from('events').select('id', { count: 'exact', head: true }).gte('created_at', dayStart),
      supabase.from('events').select('id', { count: 'exact', head: true }).gte('created_at', weekStart),
      supabase.from('events').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
      supabase.from('discovery_runs').select('*').order('started_at', { ascending: false }).limit(25),
      supabase.from('app_settings').select('key,value').in('key', [
        'daily_token_limit', 'daily_tokens_used', 'monthly_token_budget',
      ]),
    ])

    if (sourcesRes.error) { setError(sourcesRes.error.message); setLoading(false); return }

    const srcs        = sourcesRes.data ?? []
    const totalTokens = srcs.reduce((s, r) => s + (r.total_tokens_used ?? 0), 0)
    const totalRuns   = srcs.reduce((s, r) => s + (r.run_count         ?? 0), 0)
    const totalEvents = srcs.reduce((s, r) => s + (r.total_events_found ?? 0), 0)

    const settingsMap = {}
    ;(settingsRes.data ?? []).forEach((s) => { settingsMap[s.key] = s.value })

    setSettings(settingsMap)
    setStats({
      liveEvents:    eventsRes.count   ?? 0,
      todayEvents:   todayRes.count    ?? 0,
      weekEvents:    weekRes.count     ?? 0,
      monthEvents:   monthRes.count    ?? 0,
      totalTokens,
      totalRuns,
      totalEvents,
      activeSources: srcs.filter((s) => s.is_active).length,
      totalSources:  srcs.length,
    })
    setSources(srcs)
    setRuns(runsRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function resetDailyCounter() {
    setResetting(true)
    const { error } = await supabase
      .from('app_settings')
      .update({ value: '0', updated_at: new Date().toISOString() })
      .eq('key', 'daily_tokens_used')
    if (!error) {
      setSettings((s) => ({ ...s, daily_tokens_used: '0' }))
      setResetMsg('Counter reset to 0')
      setTimeout(() => setResetMsg(''), 3000)
    }
    setResetting(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const dailyUsed   = parseInt(settings.daily_tokens_used   ?? '0')
  const dailyLimit  = parseInt(settings.daily_token_limit   ?? '300000')
  const monthBudget = parseInt(settings.monthly_token_budget ?? '5000000')

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Usage & Stats</h1>
        <p className="text-sm text-gray-500 mt-0.5">Discovery performance and token consumption.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* Token usage bars */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Token Usage</h2>
          <div className="flex items-center gap-3">
            {resetMsg && <span className="text-xs text-brand-600 font-medium">{resetMsg}</span>}
            <button
              onClick={resetDailyCounter}
              disabled={resetting}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {resetting ? 'Resetting…' : 'Reset Daily Counter'}
            </button>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 px-5 py-5 space-y-5">
          <UsageBar
            label="Today's tokens used"
            used={dailyUsed}
            limit={dailyLimit}
            color="bg-brand-500"
          />
          <UsageBar
            label="This month (all-time total vs budget)"
            used={stats.totalTokens}
            limit={monthBudget}
            color="bg-purple-500"
          />
        </div>
      </section>

      {/* Event stats */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Events</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Live events"       value={stats.liveEvents.toLocaleString()}  color="green"  />
          <StatCard label="Added today"       value={stats.todayEvents}                  color="blue"   />
          <StatCard label="This week"         value={stats.weekEvents}                   color="purple" />
          <StatCard label="This month"        value={stats.monthEvents}                  color="orange" />
        </div>
      </section>

      {/* Discovery stats */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Discovery</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total runs"         value={stats.totalRuns.toLocaleString()}   color="amber" />
          <StatCard label="Events discovered"  value={stats.totalEvents.toLocaleString()}               />
          <StatCard label="Total tokens used"  value={fmtTokens(stats.totalTokens)} sub="all sources"  />
          <StatCard label="Active sources"     value={`${stats.activeSources}/${stats.totalSources}`}  />
        </div>
      </section>

      {/* Recent runs */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Recent Runs</h2>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left   px-5 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Source</th>
                  <th className="text-left   px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Type</th>
                  <th className="text-left   px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Started</th>
                  <th className="text-right  px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Events</th>
                  <th className="text-right  px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Tokens</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900 max-w-[180px]">
                      <span className="block truncate" title={run.source_label}>{run.source_label ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {run.source_type && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[run.source_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {run.source_type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {run.started_at
                        ? new Date(run.started_at).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{run.events_found ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtTokens(run.tokens_used ?? 0)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLORS[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {run.status ?? '—'}
                      </span>
                      {run.status === 'error' && run.error_message && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[160px] truncate" title={run.error_message}>
                          {run.error_message}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-gray-400 text-sm">
                      No runs recorded yet. Runs are logged when the scheduler executes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Per-source table */}
      <section>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Per-source breakdown</h2>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left   px-5 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Source</th>
                  <th className="text-left   px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Type</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Active</th>
                  <th className="text-right  px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Runs</th>
                  <th className="text-right  px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Events</th>
                  <th className="text-right  px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Avg/run</th>
                  <th className="text-right  px-4 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Tokens</th>
                  <th className="text-right  px-5 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">Last run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sources.map((s) => (
                  <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${!s.is_active ? 'opacity-40' : ''}`}>
                    <td className="px-5 py-3 font-medium text-gray-900 max-w-[180px]">
                      <span className="block truncate" title={s.label}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_COLORS[s.type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${s.is_active ? 'bg-brand-500' : 'bg-gray-300'}`} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{s.run_count ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{s.total_events_found ?? 0}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{Number(s.avg_events_per_run ?? 0).toFixed(1)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">{fmtTokens(s.total_tokens_used ?? 0)}</td>
                    <td className="px-5 py-3 text-right text-gray-400 text-xs whitespace-nowrap">
                      {s.last_run_at
                        ? new Date(s.last_run_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-10 text-center text-gray-400">No sources yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
