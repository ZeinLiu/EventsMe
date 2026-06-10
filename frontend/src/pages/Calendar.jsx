import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CalendarView from '../components/CalendarView'

export default function Calendar() {
  const { user } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    supabase
      .from('calendar_entries')
      .select('*, events(title, category, event_date)')
      .eq('user_id', user.id)
      .order('scheduled_date', { ascending: true })
      .then(({ data }) => {
        setEntries(data ?? [])
        setLoading(false)
      })
  }, [user])

  const COLOR_MAP = {
    'Kids & Family':      'bg-blue-400',
    'Arts & Culture':     'bg-purple-400',
    'Nature & Wildlife':  'bg-green-400',
    'Food & Lifestyle':   'bg-orange-400',
    'Cultural & National':'bg-red-400',
  }

  return (
    <div className="px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-500 mt-1">Events you've planned for your family.</p>
      </div>

      <CalendarView />

      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Upcoming Plans</h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2 text-center">
            <span className="text-3xl">📅</span>
            <p className="text-sm text-gray-500">No events planned yet.<br />Add events from the Events tab.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const color = COLOR_MAP[entry.events?.category] ?? 'bg-gray-400'
              const dateStr = entry.scheduled_date
                ? new Date(entry.scheduled_date).toLocaleDateString('en-SG', {
                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                  })
                : ''
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm"
                >
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {entry.events?.title ?? 'Event'}
                    </p>
                    <p className="text-xs text-gray-400">{dateStr}</p>
                    {entry.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 italic">{entry.notes}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
