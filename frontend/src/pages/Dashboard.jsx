import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import EventCard from '../components/EventCard'
import EventDetailSheet from '../components/EventDetailSheet'
import CalendarBottomSheet from '../components/CalendarBottomSheet'
import ChatBar from '../components/ChatBar'
import Toast from '../components/Toast'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getDisplayName(user) {
  const name = user?.user_metadata?.full_name ?? user?.user_metadata?.name
  if (name) return name.split(' ')[0]
  return user?.email?.split('@')[0] ?? 'there'
}

function SkeletonCard() {
  return <div className="bg-white rounded-2xl border border-gray-100 h-40 animate-pulse" />
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reason, setReason] = useState(null)
  const [savedIds, setSavedIds] = useState(new Set())
  const [calendarIds, setCalendarIds] = useState(new Set())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [calendarTarget, setCalendarTarget] = useState(null)
  const [toast, setToast] = useState(null)

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    if (!user) return
    Promise.all([
      supabase.from('saved_events').select('event_id').eq('user_id', user.id),
      supabase.from('calendar_entries').select('event_id').eq('user_id', user.id),
    ]).then(([saved, cal]) => {
      setSavedIds(new Set((saved.data ?? []).map(r => r.event_id)))
      setCalendarIds(new Set((cal.data ?? []).map(r => r.event_id)))
    })
  }, [user])

  const fetchRecs = useCallback(async (force = false) => {
    if (!user) return
    try {
      const { data, error } = await supabase.functions.invoke('get-recommendations', {
        body: { refresh: force },
      })
      if (error) throw error
      setReason(data.reason ?? null)
      setRecs(data.recommendations ?? [])
    } catch {
      setReason('error')
      setRecs([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => { fetchRecs() }, [fetchRecs])

  function handleRefresh() {
    setRefreshing(true)
    fetchRecs(true)
  }

  const handleWishlist = useCallback(async (eventId) => {
    if (savedIds.has(eventId)) {
      await supabase.from('saved_events').delete().eq('user_id', user.id).eq('event_id', eventId)
      setSavedIds(s => { const n = new Set(s); n.delete(eventId); return n })
      showToast('Removed from wishlist')
    } else {
      await supabase.from('saved_events').insert({ user_id: user.id, event_id: eventId })
      setSavedIds(s => new Set([...s, eventId]))
      showToast('Saved to wishlist ❤️')
    }
  }, [savedIds, user])

  const handleCalendarAdded = useCallback((eventId) => {
    setCalendarIds(s => new Set([...s, eventId]))
    showToast('Added to your calendar! 📅')
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const validRecs = recs.filter(r => r.events)

  return (
    <div className="px-4 pt-6 space-y-6 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {getDisplayName(user)} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1">Here's what's on for your family this week.</p>
        </div>
        <button
          onClick={handleSignOut}
          className="mt-1 text-xs text-gray-400 hover:text-red-500 transition-colors font-medium"
        >
          Sign out
        </button>
      </div>

      <ChatBar />

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">For Your Family</h2>
            <p className="text-xs text-gray-400 mt-0.5">AI-matched based on your family profile.</p>
          </div>
          {!loading && validRecs.length > 0 && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-xs text-brand-600 font-medium disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : reason === 'no_profile' ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">👨‍👩‍👧‍👦</p>
            <p className="text-gray-600 mb-4 text-sm">Add your family members to get personalised recommendations.</p>
            <button
              onClick={() => navigate('/profile')}
              className="bg-brand-600 text-white px-5 py-2 rounded-full text-sm font-medium"
            >
              Build Profile
            </button>
          </div>
        ) : reason === 'error' ? (
          <div className="text-center py-8">
            <p className="text-gray-400 text-sm">Could not load recommendations.</p>
            <button onClick={handleRefresh} className="text-brand-600 text-sm mt-2 underline">Try again</button>
          </div>
        ) : validRecs.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No upcoming events found. Check back soon.</p>
        ) : (
          <div className="space-y-4">
            {validRecs.map(rec => (
              <div key={rec.id}>
                <div className="relative">
                  <EventCard
                    event={rec.events}
                    isSaved={savedIds.has(rec.event_id)}
                    isInCalendar={calendarIds.has(rec.event_id)}
                    onWishlist={() => handleWishlist(rec.event_id)}
                    onCalendar={() => setCalendarTarget(rec.events)}
                    onSource={() => window.open(rec.events.source_url, '_blank')}
                    onDetail={() => setSelectedEvent(rec.events)}
                  />
                  <span className="absolute top-3 right-3 bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {rec.match_score}% match
                  </span>
                </div>
                {rec.reasoning && (
                  <p className="text-xs text-brand-700 px-1 pt-1.5">✨ {rec.reasoning}</p>
                )}
              </div>
            ))}
            <p className="text-xs text-center text-gray-400 mt-2">
              Refreshes when 5+ new events are added or you update your profile.
            </p>
          </div>
        )}
      </section>

      {selectedEvent && (
        <EventDetailSheet
          event={selectedEvent}
          isSaved={savedIds.has(selectedEvent.id)}
          isInCalendar={calendarIds.has(selectedEvent.id)}
          onClose={() => setSelectedEvent(null)}
          onWishlist={() => handleWishlist(selectedEvent.id)}
          onCalendar={() => { setCalendarTarget(selectedEvent); setSelectedEvent(null) }}
          onSource={() => window.open(selectedEvent.source_url, '_blank')}
        />
      )}

      {calendarTarget && (
        <CalendarBottomSheet
          event={calendarTarget}
          isInCalendar={calendarIds.has(calendarTarget.id)}
          onClose={() => setCalendarTarget(null)}
          onAdded={() => handleCalendarAdded(calendarTarget.id)}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  )
}
