import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { buildEventsQuery, matchesAudience, DEFAULT_FILTERS } from '../lib/eventFilters'

const AUDIENCE_OPTIONS = [
  { value: 'toddlers',   label: 'Toddlers 0-3' },
  { value: 'young_kids', label: 'Young Kids 4-6' },
  { value: 'kids',       label: 'Kids 7-12' },
  { value: 'teens',      label: 'Teens 13-17' },
  { value: 'adults',     label: 'Adults' },
]

const DATE_OPTIONS = [
  { value: 'any',     label: 'Any time' },
  { value: 'weekend', label: 'This weekend' },
  { value: 'week',    label: 'This week (next 7 days)' },
  { value: 'month',   label: 'This month' },
  { value: 'custom',  label: 'Custom range' },
]

const PRICE_OPTIONS = [
  { value: 'any',     label: 'Any price' },
  { value: 'free',    label: 'Free only' },
  { value: 'under20', label: 'Under $20' },
  { value: 'under50', label: 'Under $50' },
  { value: 'above50', label: '$50 and above' },
  { value: 'custom',  label: 'Custom range' },
]

function RadioOption({ name, value, checked, label, onChange }) {
  return (
    <button onClick={onChange} className="flex items-center gap-3 w-full py-0.5">
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'border-brand-600' : 'border-gray-300'
      }`}>
        {checked && <div className="w-2 h-2 rounded-full bg-brand-600" />}
      </div>
      <span className="text-sm text-gray-700 text-left">{label}</span>
    </button>
  )
}

export default function FilterDrawer({ open, onClose, filters, onApply }) {
  const [draft, setDraft] = useState(filters)
  const [categories, setCategories] = useState([])
  const [sources, setSources] = useState([])
  const [draftCount, setDraftCount] = useState(null)

  useEffect(() => {
    if (open) setDraft(filters)
  }, [open])

  useEffect(() => {
    async function loadMeta() {
      const [catRes, srcRes] = await Promise.all([
        supabase.from('events').select('category').eq('is_archived', false).not('category', 'is', null),
        supabase.from('events').select('source_name').eq('is_archived', false).not('source_name', 'is', null),
      ])

      const catCounts = (catRes.data ?? []).reduce((acc, e) => {
        acc[e.category] = (acc[e.category] ?? 0) + 1
        return acc
      }, {})
      setCategories(
        Object.entries(catCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, count]) => ({ cat, count }))
      )

      const srcCounts = (srcRes.data ?? []).reduce((acc, e) => {
        acc[e.source_name] = (acc[e.source_name] ?? 0) + 1
        return acc
      }, {})
      setSources(
        Object.entries(srcCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([src, count]) => ({ src, count }))
      )
    }
    loadMeta()
  }, [])

  useEffect(() => {
    if (!open) return
    setDraftCount(null)
    buildEventsQuery(draft).then(({ data }) => {
      const after = (data ?? []).filter(e => matchesAudience(e, draft.audience))
      setDraftCount(after.length)
    })
  }, [draft, open])

  function toggleCategory(cat) {
    setDraft(d => ({
      ...d,
      categories: d.categories.includes(cat)
        ? d.categories.filter(c => c !== cat)
        : [...d.categories, cat],
    }))
  }

  function toggleSource(src) {
    setDraft(d => ({
      ...d,
      sources: d.sources.includes(src)
        ? d.sources.filter(s => s !== src)
        : [...d.sources, src],
    }))
  }

  function toggleAudience(val) {
    setDraft(d => ({
      ...d,
      audience: d.audience.includes(val)
        ? d.audience.filter(a => a !== val)
        : [...d.audience, val],
    }))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="relative bg-white rounded-t-2xl flex flex-col animate-slide-up"
        style={{ maxHeight: '90vh' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Filter Events</h2>
          <button
            onClick={() => setDraft(DEFAULT_FILTERS)}
            className="text-sm text-brand-600 font-medium"
          >
            Reset All
          </button>
        </div>

        <div className="h-px bg-gray-100 shrink-0" />

        {/* Scrollable sections */}
        <div className="overflow-y-auto flex-1 px-4 py-5 space-y-6">

          {/* CATEGORY */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Category</p>
            {categories.length === 0 ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {categories.map(({ cat, count }) => {
                  const selected = draft.categories.includes(cat)
                  return (
                    <button
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-2 rounded-full text-sm font-medium border transition-colors text-left ${
                        selected
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <div className="h-px bg-gray-100" />

          {/* SOURCE */}
          <section>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Source</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDraft(d => ({ ...d, sources: sources.map(s => s.src) }))}
                  className="text-xs text-brand-600 font-medium"
                >
                  Select all
                </button>
                <button
                  onClick={() => setDraft(d => ({ ...d, sources: [] }))}
                  className="text-xs text-gray-400 font-medium"
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-3">Where was this event discovered?</p>
            {sources.length === 0 ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : (
              <div
                className="border border-gray-100 rounded-xl divide-y divide-gray-50 overflow-y-auto"
                style={{ maxHeight: 200 }}
              >
                {sources.map(({ src, count }) => {
                  const checked = draft.sources.includes(src)
                  return (
                    <button
                      key={src}
                      onClick={() => toggleSource(src)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checked ? 'bg-brand-600 border-brand-600' : 'border-gray-300'
                      }`}>
                        {checked && (
                          <svg viewBox="0 0 10 8" className="w-2.5 h-2" fill="none">
                            <path d="M1 4l2.5 3L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm text-gray-700 flex-1 text-left">{src}</span>
                      <span className="text-xs text-gray-400">{count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <div className="h-px bg-gray-100" />

          {/* DATE */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Date</p>
            <div className="space-y-3">
              {DATE_OPTIONS.map(({ value, label }) => (
                <RadioOption
                  key={value}
                  checked={draft.date === value}
                  label={label}
                  onChange={() => setDraft(d => ({ ...d, date: value }))}
                />
              ))}
              {draft.date === 'custom' && (
                <div className="ml-7 flex gap-3 mt-1">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">From</label>
                    <input
                      type="date"
                      value={draft.dateFrom ?? ''}
                      onChange={e => setDraft(d => ({ ...d, dateFrom: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">To</label>
                    <input
                      type="date"
                      value={draft.dateTo ?? ''}
                      onChange={e => setDraft(d => ({ ...d, dateTo: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="h-px bg-gray-100" />

          {/* PRICE */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Price</p>
            <div className="space-y-3">
              {PRICE_OPTIONS.map(({ value, label }) => (
                <RadioOption
                  key={value}
                  checked={draft.price === value}
                  label={label}
                  onChange={() => setDraft(d => ({ ...d, price: value }))}
                />
              ))}
              {draft.price === 'custom' && (
                <div className="ml-7 flex gap-3 mt-1">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">Min ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={draft.priceMin}
                      onChange={e => setDraft(d => ({ ...d, priceMin: Number(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 mb-1 block">Max ($)</label>
                    <input
                      type="number"
                      min="0"
                      value={draft.priceMax}
                      onChange={e => setDraft(d => ({ ...d, priceMax: Number(e.target.value) }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="h-px bg-gray-100" />

          {/* AUDIENCE */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Audience</p>
            <p className="text-xs text-gray-400 mb-3">Who is this suitable for?</p>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {AUDIENCE_OPTIONS.map(({ value, label }) => {
                const selected = draft.audience.includes(value)
                return (
                  <button
                    key={value}
                    onClick={() => toggleAudience(value)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                      selected
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </section>

          <div className="h-px bg-gray-100" />

          {/* ADMISSION */}
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Admission</p>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              {[
                { value: 'both', label: 'Both' },
                { value: 'free', label: 'Free' },
                { value: 'paid', label: 'Paid' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDraft(d => ({ ...d, admission: value }))}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    draft.admission === value
                      ? 'bg-brand-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <div className="h-2" />
        </div>

        {/* Sticky footer */}
        <div
          className="shrink-0 px-4 py-3 border-t border-gray-100"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => { onApply(draft); onClose() }}
            className="w-full bg-brand-600 text-white rounded-2xl py-3.5 text-sm font-semibold active:opacity-90 transition-opacity"
          >
            {draftCount === null
              ? 'Loading…'
              : `Show ${draftCount} Event${draftCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
