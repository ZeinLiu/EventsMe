import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import EventCard from '../components/EventCard'
import ChatBar from '../components/ChatBar'

const SAMPLE_EVENTS = [
  {
    id: 1,
    title: 'Sentosa Beach Festival',
    date: '14 Jun 2026',
    location: 'Sentosa',
    tags: ['outdoor', 'family'],
    short_summary: 'A weekend of beach activities, live music, and food stalls perfect for families with young kids.',
  },
  {
    id: 2,
    title: 'Science Centre Discovery Day',
    date: '21 Jun 2026',
    location: 'Jurong East',
    tags: ['indoor', 'kids'],
    short_summary: 'Interactive science exhibits and workshops designed for children aged 5–12.',
  },
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function getDisplayName(user) {
  // Google OAuth sets user_metadata.name; email registration sets full_name
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
    <div className="px-4 pt-6 space-y-6">
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
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Recommended for you</h2>
        <div className="space-y-3">
          {SAMPLE_EVENTS.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </section>
    </div>
  )
}
