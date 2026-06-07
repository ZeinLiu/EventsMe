export default function EventCard({ event }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-gray-900 leading-snug">{event.title}</h3>
        <button className="shrink-0 text-gray-300 hover:text-brand-500 text-xl leading-none">♡</button>
      </div>

      <div className="flex gap-3 text-xs text-gray-500">
        <span>📅 {event.date}</span>
        <span>📍 {event.location}</span>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed">{event.short_summary}</p>

      {event.tags && (
        <div className="flex gap-1.5 flex-wrap pt-1">
          {event.tags.map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-0.5 bg-brand-50 text-brand-700 text-xs rounded-full font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
