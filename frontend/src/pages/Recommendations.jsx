import EventCard from '../components/EventCard'

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

export default function Recommendations() {
  return (
    <div className="px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">For Your Family</h1>
        <p className="text-sm text-gray-500 mt-1">AI-matched based on your family profile.</p>
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

      <p className="text-xs text-center text-gray-400 pb-2">
        Recommendations refresh when new events are added or your profile changes.
      </p>
    </div>
  )
}
