const CATEGORY_COLORS = {
  'Food & Lifestyle':   'bg-orange-100 text-orange-700',
  'Arts & Culture':     'bg-purple-100 text-purple-700',
  'Nature & Wildlife':  'bg-green-100 text-green-700',
  'Cultural & National':'bg-red-100 text-red-700',
  'Kids & Family':      'bg-blue-100 text-blue-700',
}

function formatDateRange(start, end) {
  if (!start) return ''
  const s = new Date(start)
  const e = end ? new Date(end) : s
  const opts = { day: 'numeric', month: 'short' }
  const optsYear = { day: 'numeric', month: 'short', year: 'numeric' }
  if (start === end) return s.toLocaleDateString('en-SG', optsYear)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.toLocaleDateString('en-SG', optsYear)}`
  }
  return `${s.toLocaleDateString('en-SG', opts)} – ${e.toLocaleDateString('en-SG', optsYear)}`
}

function PriceTag({ is_free, price_min, price_max }) {
  if (is_free) return <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Free</span>
  if (price_min == null) return null
  const label = price_min === price_max ? `$${price_min}` : `$${price_min}–$${price_max}`
  return <span className="text-xs font-semibold text-gray-700">From {label}</span>
}

export default function EventCard({ event }) {
  // Support both old sample format (date/location/tags) and Supabase format
  const displayDate = event.event_date
    ? formatDateRange(event.event_date, event.event_end_date)
    : event.date
  const displayLocation = event.venue || event.location
  const catColor = CATEGORY_COLORS[event.category] ?? 'bg-gray-100 text-gray-600'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {event.image_url && (
        <img
          src={event.image_url}
          alt={event.title}
          className="w-full h-44 object-cover"
          loading="lazy"
        />
      )}

      <div className="p-4 space-y-2.5">
        {/* Category + price row */}
        <div className="flex items-center justify-between gap-2">
          {event.category
            ? <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${catColor}`}>{event.category}</span>
            : <span />
          }
          <PriceTag is_free={event.is_free} price_min={event.price_min} price_max={event.price_max} />
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold text-gray-900 leading-snug">{event.title}</h3>

        {/* Date + location */}
        <div className="flex flex-col gap-0.5 text-xs text-gray-500">
          {displayDate && <span>📅 {displayDate}</span>}
          {displayLocation && <span>📍 {displayLocation}</span>}
        </div>

        {/* Summary */}
        {event.short_summary && (
          <p className="text-sm text-gray-600 leading-relaxed">{event.short_summary}</p>
        )}

        {/* Old-format tags */}
        {event.tags && (
          <div className="flex gap-1.5 flex-wrap pt-0.5">
            {event.tags.map((tag) => (
              <span key={tag} className="px-2.5 py-0.5 bg-brand-50 text-brand-700 text-xs rounded-full font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Booking row */}
        {event.booking_url && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-50">
            <span className="text-xs text-gray-400">{event.source_name}</span>
            <a
              href={event.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              Book now →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
