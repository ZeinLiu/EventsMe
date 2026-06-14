import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const DAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
]

const FREQ_OPTIONS = [
  { value: 'daily',   label: 'Daily' },
  { value: 'weekly',  label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'manual',  label: 'Manual' },
]

const TYPE_OPTIONS = ['ai_search', 'rss', 'scraper', 'api']

const TYPE_COLORS = {
  api:       'bg-blue-100 text-blue-700',
  rss:       'bg-orange-100 text-orange-700',
  ai_search: 'bg-purple-100 text-purple-700',
  scraper:   'bg-yellow-100 text-yellow-800',
}

const LANG_COLORS = {
  en: 'bg-gray-100 text-gray-600',
  zh: 'bg-red-100 text-red-600',
}

function DaySelector({ value, onChange }) {
  const selected = new Set((value || '').split(',').filter(Boolean))

  function toggle(day) {
    const next = new Set(selected)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    onChange([...next].sort((a, b) => Number(a) - Number(b)).join(','))
  }

  return (
    <div className="flex gap-1 flex-wrap mt-1">
      {DAYS.map((d) => (
        <button
          key={d.value}
          onClick={() => toggle(d.value)}
          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
            selected.has(d.value)
              ? 'bg-brand-600 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {d.label}
        </button>
      ))}
    </div>
  )
}

function RunResult({ result }) {
  if (!result) return null
  const ok = result.status === 'ok' || result.ok
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
      ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
    }`}>
      {ok
        ? `✓ ${result.ran ?? 1} run${result.ran !== 1 ? 's' : ''}`
        : `✗ ${result.error ?? 'Error'}`}
    </span>
  )
}

function SourceRow({ source, onUpdate }) {
  const [draft, setDraft]     = useState(source)
  const [saving, setSaving]   = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)

  const isDirty = (
    draft.is_active         !== source.is_active         ||
    draft.refresh_frequency !== source.refresh_frequency ||
    draft.refresh_days      !== source.refresh_days      ||
    draft.language          !== source.language
  )

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('discovery_sources')
      .update({
        is_active:         draft.is_active,
        refresh_frequency: draft.refresh_frequency,
        refresh_days:      draft.refresh_days,
        language:          draft.language,
      })
      .eq('id', source.id)
    if (!error) onUpdate({ ...source, ...draft })
    setSaving(false)
  }

  async function runNow() {
    setRunning(true)
    setRunResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('run-scheduler', {
        body: { source_id: source.id },
      })
      setRunResult(error ? { error: error.message } : (data ?? { ok: true }))
      // Refresh source stats
      const { data: updated } = await supabase
        .from('discovery_sources')
        .select('*')
        .eq('id', source.id)
        .single()
      if (updated) { onUpdate(updated); setDraft(updated) }
    } catch (err) {
      setRunResult({ error: err.message })
    } finally {
      setRunning(false)
    }
  }

  const typeColor = TYPE_COLORS[source.type] ?? 'bg-gray-100 text-gray-600'
  const langColor = LANG_COLORS[draft.language] ?? LANG_COLORS.en

  return (
    <div className={`px-5 py-4 transition-colors ${isDirty ? 'bg-amber-50' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Active toggle */}
        <button
          onClick={() => setDraft((d) => ({ ...d, is_active: !d.is_active }))}
          className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
            draft.is_active ? 'bg-brand-600' : 'bg-gray-200'
          }`}
          title={draft.is_active ? 'Disable' : 'Enable'}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            draft.is_active ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`} />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Name + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-medium ${draft.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
              {source.label}
            </span>
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${typeColor}`}>
              {source.type}
            </span>
            <select
              value={draft.language || 'en'}
              onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
              className={`text-xs font-semibold px-1.5 py-0.5 rounded border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500 ${langColor}`}
            >
              <option value="en">EN</option>
              <option value="zh">ZH</option>
            </select>
            {runResult && <RunResult result={runResult} />}
          </div>

          {/* Stats */}
          <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
            <span>Runs: <span className="text-gray-600 font-medium">{source.run_count ?? 0}</span></span>
            <span>Events: <span className="text-gray-600 font-medium">{source.total_events_found ?? 0}</span></span>
            <span>Avg: <span className="text-gray-600 font-medium">{Number(source.avg_events_per_run ?? 0).toFixed(1)}/run</span></span>
            <span>Tokens: <span className="text-gray-600 font-medium">{(source.total_tokens_used ?? 0).toLocaleString()}</span></span>
            {source.last_run_at && (
              <span>Last: <span className="text-gray-600 font-medium">
                {new Date(source.last_run_at).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}
              </span></span>
            )}
          </div>

          {/* Frequency */}
          <div className="flex items-start gap-3 flex-wrap">
            <select
              value={draft.refresh_frequency || 'weekly'}
              onChange={(e) => setDraft((d) => ({ ...d, refresh_frequency: e.target.value }))}
              className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
            >
              {FREQ_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            {draft.refresh_frequency === 'weekly' && (
              <DaySelector
                value={draft.refresh_days}
                onChange={(v) => setDraft((d) => ({ ...d, refresh_days: v }))}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={runNow}
            disabled={running}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center gap-1"
            title="Run this source now"
          >
            {running
              ? <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              : '▶'}
            {running ? 'Running…' : 'Run Now'}
          </button>
          {isDirty && (
            <>
              <button
                onClick={() => setDraft(source)}
                className="px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >✕</button>
              <button
                onClick={save}
                disabled={saving}
                className="px-3 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg disabled:opacity-50 hover:bg-brand-700 transition-colors"
              >{saving ? '…' : 'Save'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY_SOURCE = {
  label: '', type: 'ai_search', value: '', language: 'en', tier: 1, is_active: true,
  refresh_frequency: 'weekly', refresh_days: '1',
}

function AddSourceForm({ onAdded, onCancel }) {
  const [form, setForm]     = useState(EMPTY_SOURCE)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(key, val) { setForm((f) => ({ ...f, [key]: val })) }

  async function submit() {
    if (!form.label.trim() || !form.value.trim()) { setError('Label and value/URL are required.'); return }
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase
      .from('discovery_sources')
      .insert({ ...form, tier: Number(form.tier) })
      .select()
      .single()
    if (err) { setError(err.message); setSaving(false); return }
    onAdded(data)
  }

  return (
    <div className="px-5 py-5 bg-gray-50 border-t border-gray-200">
      <p className="text-sm font-semibold text-gray-800 mb-4">New Source</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label *</label>
          <input value={form.label} onChange={(e) => set('label', e.target.value)}
            placeholder="e.g. Visit Singapore RSS"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Value / URL *</label>
          <input value={form.value} onChange={(e) => set('value', e.target.value)}
            placeholder="Search query or feed URL"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lang</label>
            <select value={form.language} onChange={(e) => set('language', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white">
              <option value="en">EN</option>
              <option value="zh">ZH</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tier</label>
            <input type="number" min={1} max={3} value={form.tier} onChange={(e) => set('tier', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Active</label>
            <button onClick={() => set('is_active', !form.is_active)}
              className={`mt-0.5 relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${form.is_active ? 'bg-brand-600' : 'bg-gray-200'}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-white transition-colors">
          Cancel
        </button>
        <button onClick={submit} disabled={saving}
          className="px-4 py-2 text-sm bg-brand-600 text-white font-medium rounded-xl disabled:opacity-50 hover:bg-brand-700 transition-colors">
          {saving ? 'Adding…' : 'Add Source'}
        </button>
      </div>
    </div>
  )
}

export default function AdminDiscovery() {
  const [sources, setSources]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    supabase
      .from('discovery_sources')
      .select('*')
      .order('tier',  { ascending: true })
      .order('type',  { ascending: true })
      .order('label', { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setSources(data ?? [])
        setLoading(false)
      })
  }, [])

  const updateSource = useCallback((updated) => {
    setSources((prev) => prev.map((s) => s.id === updated.id ? updated : s))
  }, [])

  function handleAdded(newSource) {
    setSources((prev) => [...prev, newSource].sort((a, b) =>
      (a.tier ?? 1) - (b.tier ?? 1) || a.label.localeCompare(b.label)
    ))
    setShowAddForm(false)
  }

  const tiers        = [...new Set(sources.map((s) => s.tier ?? 1))].sort((a, b) => a - b)
  const activeCount  = sources.filter((s) => s.is_active).length

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Discovery Sources</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} active · {sources.length} total
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {tiers.map((tier) => {
          const tierSources = sources.filter((s) => (s.tier ?? 1) === tier)
          return (
            <div key={tier} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Tier {tier}
                </span>
                <span className="text-xs text-gray-400">
                  {tierSources.filter((s) => s.is_active).length}/{tierSources.length} active
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {tierSources.map((source) => (
                  <SourceRow key={source.id} source={source} onUpdate={updateSource} />
                ))}
              </div>
            </div>
          )
        })}

        {sources.length === 0 && !error && (
          <div className="bg-white rounded-2xl border border-gray-200 px-5 py-12 text-center text-sm text-gray-400">
            No discovery sources found.
          </div>
        )}
      </div>

      {/* Add new source */}
      <div className="mt-5 bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {showAddForm ? (
          <AddSourceForm onAdded={handleAdded} onCancel={() => setShowAddForm(false)} />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full px-5 py-4 text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors flex items-center justify-center gap-2"
          >
            <span className="text-lg leading-none">+</span> Add New Source
          </button>
        )}
      </div>
    </div>
  )
}
