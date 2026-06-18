import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { buildEventsQuery, DEFAULT_FILTERS } from '../lib/eventFilters'
import EventCard from '../components/EventCard'
import EventDetailSheet from '../components/EventDetailSheet'
import CalendarBottomSheet from '../components/CalendarBottomSheet'
import FilterDrawer from '../components/FilterDrawer'
import Toast from '../components/Toast'

const SORT_OPTIONS = [
  { key: 'created-at-desc', label: 'Latest Added' },
  { key: 'date-asc',        label: 'Date (soonest first)' },
  { key: 'date-desc',       label: 'Date (latest first)' },
  { key: 'price-asc',       label: 'Price (low to high)' },
  { key: 'price-desc',      label: 'Price (high to low)' },
]

const SORT_FNS = {
  'created-at-desc': (a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  'date-asc':        (a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''),
  'date-desc':       (a, b) => (b.event_date ?? '').localeCompare(a.event_date ?? ''),
  'price-asc':       (a, b) => (a.price_min ?? Infinity) - (b.price_min ?? Infinity),
  'price-desc':      (a, b) => (b.price_max ?? -Infinity) - (a.price_max ?? -Infinity),
}

function sortWithNullsLast(fn) {
  return (a, b) => {
    if (a.event_date && !b.event_date) return -1
    if (!a.event_date && b.event_date) return 1
    return fn(a, b)
  }
}

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })
}

// Group events with the same title + venue into one card with extra date chips.
// Uses earliest date as the base; remaining dates shown as chips below the card.
function groupEventSeries(events) {
  const groups = new Map()
  for (const e of events) {
    const key = (e.title?.toLowerCase().trim() ?? '') + '|' + (e.venue?.toLowerCase().trim() ?? '')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }
  return Array.from(groups.values()).map(group => {
    if (group.length === 1) return group[0]
    const sorted = [...group].sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
    const [base, ...rest] = sorted
    return {
      ...base,
      _extraDates: rest.map(e => e.event_date).filter(Boolean),
      _groupIds: sorted.map(e => e.id),
    }
  })
}

function buildActivePills(filters, setFilters) {
  const pills = []

  filters.categories.forEach(cat =>
    pills.push({
      label: cat,
      onRemove: () => setFilters(f => ({ ...f, categories: f.categories.filter(c => c !== cat) })),
    })
  )

  if (filters.sources.length === 1)
    pills.push({
      label: filters.sources[0],
      onRemove: () => setFilters(f => ({ ...f, sources: [] })),
    })
  else if (filters.sources.length > 1)
    pills.push({
      label: `${filters.sources.length} Sources`,
      onRemove: () => setFilters(f => ({ ...f, sources: [] })),
    })

  const priceLabels = {
    free:    'Free only',
    under20: 'Under $20',
    under50: 'Under $50',
    above50: '$50 and above',
    custom:  `$${filters.priceMin}–$${filters.priceMax}`,
  }
  if (filters.price !== 'any')
    pills.push({
      label: priceLabels[filters.price],
      onRemove: () => setFilters(f => ({ ...f, price: 'any' })),
    })

  const dateLabels = {
    weekend: 'This Weekend',
    week:    'This Week',
    month:   'This Month',
    custom:  `${filters.dateFrom} – ${filters.dateTo}`,
  }
  if (filters.date !== 'any')
    pills.push({
      label: dateLabels[filters.date],
      onRemove: () => setFilters(f => ({ ...f, date: 'any' })),
    })

  filters.audience.forEach(a => {
    const labels = {
      toddlers:   'Toddlers 0-3',
      young_kids: 'Young Kids 4-6',
      kids:       'Kids 7-12',
      teens:      'Teens 13-17',
      adults:     'Adults',
    }
    pills.push({
      label: labels[a],
      onRemove: () => setFilters(f => ({ ...f, audience: f.audience.filter(x => x !== a) })),
    })
  })

  if (filters.admission !== 'both')
    pills.push({
      label: filters.admission === 'free' ? 'Free only' : 'Paid only',
      onRemove: () => setFilters(f => ({ ...f, admission: 'both' })),
    })

  return pills
}

export default function Events() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)

  const [savedIds, setSavedIds] = useState(new Set())
  const [calendarIds, setCalendarIds] = useState(new Set())

  const [langPref, setLangPref] = useState('both')

  const [sortBy, setSortBy] = useState('created-at-desc')
  const [sortOpen, setSortOpen] = useState(false)

  const [detailEvent, setDetailEvent] = useState(null)
  const [calendarEvent, setCalendarEvent] = useState(null)
  const [toast, setToast] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // Fetch events when filters or language preference changes
  useEffect(() => {
    setLoading(true)
    setError('')
    buildEventsQuery(filters, { language: langPref }).then(({ data, error: err }) => {
      if (err) setError(err.message)
      else setEvents(data ?? [])
      setLoading(false)
    })
  }, [filters, langPref])

  // Load user language preference
  useEffect(() => {
    if (!user) return
    supabase.from('preferences').select('preferred_language').eq('profile_id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.preferred_language) setLangPref(data.preferred_language) })
  }, [user])

  // Fetch saved and calendar IDs when user changes
  useEffect(() => {
    if (!user) { setSavedIds(new Set()); setCalendarIds(new Set()); return }
    Promise.all([
      supabase.from('saved_events').select('event_id').eq('user_id', user.id),
      supabase.from('calendar_entries').select('event_id').eq('user_id', user.id),
    ]).then(([savedRes, calRes]) => {
      setSavedIds(new Set((savedRes.data ?? []).map(r => r.event_id)))
      setCalendarIds(new Set((calRes.data ?? []).map(r => r.event_id)))
    })
  }, [user])

  const handleWishlist = useCallback(async (event) => {
    if (!user) { showToast('Log in to save events'); return }
    if (savedIds.has(event.id)) {
      await supabase.from('saved_events').delete().eq('user_id', user.id).eq('event_id', event.id)
      setSavedIds(prev => { const s = new Set(prev); s.delete(event.id); return s })
      showToast('Removed from wishlist')
    } else {
      await supabase.from('saved_events').insert({ user_id: user.id, event_id: event.id })
      setSavedIds(prev => new Set([...prev, event.id]))
      showToast('Added to wishlist ❤️')
    }
  }, [user, savedIds])

  const handleSource = useCallback((event) => {
    if (!event.source_url) { showToast('No source link available'); return }
    window.open(event.source_url, '_blank', 'noopener,noreferrer')
  }, [])

  const handleCalendarAdded = useCallback((event) => {
    setCalendarIds(prev => new Set([...prev, event.id]))
    showToast('Added to your calendar! 📅')
  }, [])

  const filtered = groupEventSeries(
    [...events].sort(sortWithNullsLast(SORT_FNS[sortBy] ?? SORT_FNS['date-asc']))
  )

  const activePills = buildActivePills(filters, setFilters)

  return (
    <div className="pt-6 space-y-5">
      {/* Header */}
      <div className="px-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="text-sm text-gray-500 mt-1">Upcoming family events across Singapore.</p>
        </div>
        <button
          onClick={() => setFilterOpen(true)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors mt-1 ${
            activePills.length > 0
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-gray-700 border-gray-200 hover:border-brand-300'
          }`}
        >
          {/* Sliders icon */}
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0">
            <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="5"  cy="4"  r="1.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <circle cx="11" cy="8"  r="1.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <circle cx="5"  cy="12" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
          </svg>
          {activePills.length > 0 ? `Filter · ${activePills.length}` : 'Filter'}
        </button>
      </div>

      {/* Active filter pills */}
      {activePills.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 px-4 no-scrollbar">
          {activePills.map((pill, i) => (
            <button
              key={i}
              onClick={pill.onRemove}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-xs font-medium"
            >
              {pill.label}
              <span className="text-brand-400 ml-0.5">×</span>
            </button>
          ))}
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="shrink-0 text-xs text-gray-400 underline ml-1 whitespace-nowrap"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Content */}
      <div className="px-4 pb-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-sm text-red-600">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <span className="text-4xl">🔍</span>
            <p className="text-sm text-gray-500">No events match your filters.</p>
            {activePills.length > 0 && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-sm text-brand-600 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {filtered.length} event{filtered.length !== 1 ? 's' : ''}
                {events.length > filtered.length ? ` (${events.length} dates)` : ''}
              </p>
              <button
                onClick={() => setSortOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors"
              >
                {SORT_OPTIONS.find(o => o.key === sortBy)?.label}
                <span className="text-gray-400 text-xs">▾</span>
              </button>
            </div>
            {filtered.map((event) => (
              <div key={event.id}>
                <EventCard
                  event={event}
                  isSaved={event._groupIds ? event._groupIds.some(id => savedIds.has(id)) : savedIds.has(event.id)}
                  isInCalendar={event._groupIds ? event._groupIds.some(id => calendarIds.has(id)) : calendarIds.has(event.id)}
                  onDetail={() => setDetailEvent(event)}
                  onWishlist={() => handleWishlist(event)}
                  onCalendar={() => setCalendarEvent(event)}
                  onSource={() => handleSource(event)}
                />
                {event._extraDates?.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1.5">
                    <span className="text-xs text-gray-400">Also on:</span>
                    {event._extraDates.map(d => (
                      <span key={d} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {formatShortDate(d)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter drawer */}
      <FilterDrawer
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
      />

      {/* Event detail sheet */}
      {detailEvent && (
        <EventDetailSheet
          event={detailEvent}
          isSaved={savedIds.has(detailEvent.id)}
          isInCalendar={calendarIds.has(detailEvent.id)}
          onClose={() => setDetailEvent(null)}
          onWishlist={() => handleWishlist(detailEvent)}
          onCalendar={() => { setDetailEvent(null); setCalendarEvent(detailEvent) }}
          onSource={() => handleSource(detailEvent)}
        />
      )}

      {/* Calendar bottom sheet */}
      {calendarEvent && (
        <CalendarBottomSheet
          event={calendarEvent}
          isInCalendar={calendarIds.has(calendarEvent.id)}
          onClose={() => setCalendarEvent(null)}
          onAdded={() => handleCalendarAdded(calendarEvent)}
        />
      )}

      {/* Sort bottom sheet */}
      {sortOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSortOpen(false)} />
          <div
            className="relative bg-white rounded-t-2xl px-4 pt-4 animate-slide-up max-h-[80vh] flex flex-col"
            style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
          >
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 shrink-0" />
            <h3 className="text-base font-semibold text-gray-900 mb-2 shrink-0">Sort by</h3>
            <div className="space-y-0.5 overflow-y-auto">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => { setSortBy(opt.key); setSortOpen(false) }}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-900 text-left">{opt.label}</span>
                  {sortBy === opt.key && <span className="text-brand-600 text-sm font-bold">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </div>
  )
}
