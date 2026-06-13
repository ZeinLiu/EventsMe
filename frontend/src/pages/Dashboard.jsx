import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import EventCard from '../components/EventCard'
import ChatBar from '../components/ChatBar'

const SAMPLE_RECS = [
  {
    id: 1,
    title: 'Botanic Gardens Family Picnic',
    date: '15 Jun 2026',
    location: 'Tanglin',
    tags: ['outdoor', 'free'],
    short_summary: 'Guided nature walk followed by open picnic areas — great for curious toddlers and parents who love green space.',
    matchScore: 98,
  },
  {
    id: 2,
    title: 'KidZania Singapore',
    date: '20 Jun 2026',
    location: 'Sentosa',
    tags: ['indoor', 'play'],
    short_summary: 'Role-play city where kids can be doctors, pilots, and chefs. Suits Mia and Leo perfectly.',
    matchScore: 94,
  },
]

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

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

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
          aria-label="Sign out"
        >
          Sign out
        </button>
      </div>

      <ChatBar />

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-800">For Your Family</h2>
          <p className="text-xs text-gray-400 mt-0.5">AI-matched based on your family profile.</p>
        </div>
        <div className="space-y-3">
          {SAMPLE_RECS.map((event) => (
            <div key={event.id} className="relative">
              <EventCard event={event} />
              <span className="absolute top-3 right-3 bg-brand-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {event.matchScore}% match
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-center text-gray-400 mt-4">
          Recommendations refresh when new events are added or your profile changes.
        </p>
      </section>
    </div>
  )
}
