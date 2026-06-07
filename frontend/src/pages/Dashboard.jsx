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

export default function Dashboard() {
  return (
    <div className="px-4 pt-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Good morning 👋</h1>
        <p className="text-sm text-gray-500 mt-1">Here's what's on for your family this week.</p>
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
