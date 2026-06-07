import EventCard from '../components/EventCard'

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
  {
    id: 3,
    title: 'Gardens by the Bay Night Show',
    date: '28 Jun 2026',
    location: 'Marina Bay',
    tags: ['outdoor', 'evening'],
    short_summary: 'Light and sound show at the Supertree Grove, free admission for under-12s.',
  },
]

const TABS = ['All', 'This Week', 'Free', 'Indoor']

export default function Events() {
  return (
    <div className="px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Events</h1>
        <p className="text-sm text-gray-500 mt-1">Browse upcoming family events in Singapore.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              i === 0
                ? 'bg-brand-600 text-white border-brand-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {SAMPLE_EVENTS.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}
