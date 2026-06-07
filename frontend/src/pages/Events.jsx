import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import EventCard from '../components/EventCard'

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
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('All')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      const { data, error: dbErr } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })
      if (dbErr) {
        setError(dbErr.message)
      } else {
        setEvents(data ?? [])
      }
      setLoading(false)
    }
    load()
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
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
