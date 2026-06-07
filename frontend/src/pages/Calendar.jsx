import CalendarView from '../components/CalendarView'

const SAVED_EVENTS = [
  { id: 1, title: 'Sentosa Beach Festival', date: '2026-06-14', color: 'bg-blue-400' },
  { id: 2, title: 'Science Centre Day', date: '2026-06-21', color: 'bg-purple-400' },
]

export default function Calendar() {
  return (
    <div className="px-4 pt-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <p className="text-sm text-gray-500 mt-1">Events you've saved for your family.</p>
      </div>

      <CalendarView />

      <section>
        <h2 className="text-base font-semibold text-gray-800 mb-3">Saved Events</h2>
        <div className="space-y-2">
          {SAVED_EVENTS.map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm"
            >
              <div className={`w-2.5 h-2.5 rounded-full ${event.color}`} />
              <div>
                <p className="text-sm font-medium text-gray-800">{event.title}</p>
                <p className="text-xs text-gray-400">{event.date}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
