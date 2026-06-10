import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import EventCard from '../components/EventCard'
import EventDetailSheet from '../components/EventDetailSheet'
import CalendarBottomSheet from '../components/CalendarBottomSheet'
import Toast from '../components/Toast'

const TABS = [
  { label: 'All',           filter: () => true },
  { label: 'Free',          filter: (e) => e.is_free },
  { label: 'This Month',    filter: (e) => {
    const now = new Date()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const start = new Date(e.event_date)
    const end = new Date(e.event_end_date)
    return start <= monthEnd && end >= now
  }},
  { label: 'Kids & Family', filter: (e) => e.category === 'Kids & Family' },
  { label: 'Arts',          filter: (e) => e.category === 'Arts & Culture' },
]

export default function Events() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('All')

  const [savedIds, setSavedIds] = useState(new Set())
  const [calendarIds, setCalendarIds] = useState(new Set())

  const [detailEvent, setDetailEvent] = useState(null)
  const [calendarEvent, setCalendarEvent] = useState(null)
  const [toast, setToast] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')

      const [eventsRes, savedRes, calRes] = await Promise.all([
        supabase.from('events').select('*').order('event_date', { ascending: true }),
        user
          ? supabase.from('saved_events').select('event_id').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
        user
          ? supabase.from('calendar_entries').select('event_id').eq('user_id', user.id)
          : Promise.resolve({ data: [] }),
      ])

      if (eventsRes.error) setError(eventsRes.error.message)
      else setEvents(eventsRes.data ?? [])

      setSavedIds(new Set((savedRes.data ?? []).map((r) => r.event_id)))
      setCalendarIds(new Set((calRes.data ?? []).map((r) => r.event_id)))
      setLoading(false)
    }
    load()
  }, [user])

  const handleWishlist = useCallback(async (event) => {
    if (!user) { showToast('Log in to save events'); return }
    if (savedIds.has(event.id)) {
      await supabase.from('saved_events')
        .delete().eq('user_id', user.id).eq('event_id', event.id)
      setSavedIds((prev) => { const s = new Set(prev); s.delete(event.id); return s })
      showToast('Removed from wishlist')
    } else {
      await supabase.from('saved_events').insert({ user_id: user.id, event_id: event.id })
      setSavedIds((prev) => new Set([...prev, event.id]))
      showToast('Added to wishlist ❤️')
    }
  }, [user, savedIds])

  const handleSource = useCallback((event) => {
    if (!event.source_url) { showToast('No source link available'); return }
    window.open(event.source_url, '_blank', 'noopener,noreferrer')
  }, [])

  const handleCalendarAdded = useCallback((event) => {
    setCalendarIds((prev) => new Set([...prev, event.id]))
    showToast('Added to your calendar! 📅')
  }, [])

  const activeFilter = TABS.find((t) => t.label === activeTab)?.filter ?? (() => true)
  const filtered = events.filter(activeFilter)

  return (
    <div className="pt-6 space-y-5">
      <div className="px-4">
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <p className="text-sm text-gray-500 mt-1">Upcoming family events across Singapore.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 px-4 no-scrollbar">
        {TABS.map(({ label }) => (
          <button
            key={label}
            onClick={() => setActiveTab(label)}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeTab === label
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

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
            <p className="text-sm text-gray-500">No events found for this filter.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</p>
            {filtered.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                isSaved={savedIds.has(event.id)}
                isInCalendar={calendarIds.has(event.id)}
                onDetail={() => setDetailEvent(event)}
                onWishlist={() => handleWishlist(event)}
                onCalendar={() => setCalendarEvent(event)}
                onSource={() => handleSource(event)}
              />
            ))}
          </div>
        )}
      </div>

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

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </div>
  )
}
