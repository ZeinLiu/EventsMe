const CATEGORY_COLORS = {
  'Food & Lifestyle':    'bg-orange-100 text-orange-700',
  'Arts & Culture':      'bg-purple-100 text-purple-700',
  'Nature & Wildlife':   'bg-green-100 text-green-700',
  'Cultural & National': 'bg-red-100 text-red-700',
  'Kids & Family':       'bg-blue-100 text-blue-700',
}

const CATEGORY_GRADIENTS = {
  'Kids & Family':       'from-green-400 to-emerald-500',
  'Arts & Culture':      'from-purple-400 to-violet-500',
  'Food & Lifestyle':    'from-orange-400 to-amber-500',
  'Nature & Wildlife':   'from-teal-400 to-cyan-500',
  'Education & Science': 'from-blue-400 to-indigo-500',
  'Music & Concerts':    'from-pink-400 to-rose-500',
  'Sports & Fitness':    'from-red-400 to-orange-500',
  'Cultural & National': 'from-yellow-400 to-amber-500',
  'Arts & Performance':  'from-indigo-400 to-purple-500',
}

const CATEGORY_EMOJI = {
  'Kids & Family':       '🎪',
  'Arts & Culture':      '🎨',
  'Food & Lifestyle':    '🍜',
  'Nature & Wildlife':   '🌿',
  'Education & Science': '🔬',
  'Music & Concerts':    '🎵',
  'Sports & Fitness':    '🏃',
  'Cultural & National': '🎆',
  'Arts & Performance':  '🎭',
}

function formatDateRange(start, end) {
  if (!start) return ''
  const s = new Date(start)
  const e = end ? new Date(end) : s
  const opts = { day: 'numeric', month: 'short' }
  const optsYear = { day: 'numeric', month: 'short', year: 'numeric' }
  if (start === end) return s.toLocaleDateString('en-SG', optsYear)
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
    return `${s.getDate()}–${e.toLocaleDateString('en-SG', optsYear)}`
  return `${s.toLocaleDateString('en-SG', opts)} – ${e.toLocaleDateString('en-SG', optsYear)}`
}

function PriceTag({ is_free, price_min, price_max }) {
  if (is_free) return <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Free</span>
  if (price_min == null) return null
  const label = price_min === price_max ? `$${price_min}` : `$${price_min}–$${price_max}`
  return <span className="text-xs font-semibold text-gray-700">From {label}</span>
}

function msSince(ts) {
  return ts ? Date.now() - new Date(ts).getTime() : Infinity
}

export default function EventCard({ event, isSaved, isInCalendar, onWishlist, onCalendar, onSource, onDetail }) {
  const displayDate = event.event_date
    ? formatDateRange(event.event_date, event.event_end_date)
    : event.date
  const displayLocation = event.venue || event.location
  const catColor = CATEGORY_COLORS[event.category] ?? 'bg-gray-100 text-gray-600'

  const age = msSince(event.created_at)
  const isNew    = age < 48 * 60 * 60 * 1000
  const isRecent = age < 7  * 24 * 60 * 60 * 1000

  function stop(fn) {
    return (e) => { e.stopPropagation(); fn?.() }
  }

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm overflow-hidden cursor-pointer active:opacity-90 transition-opacity ${
        isRecent
          ? 'border border-gray-100 border-l-[3px] border-l-emerald-300'
          : 'border border-gray-100'
      }`}
      onClick={onDetail}
    >
      {event.image_url ? (
        <img
          src={event.image_url}
          alt={event.title}
          className="w-full h-[180px] object-cover"
          loading="lazy"
        />
      ) : (
        <div className={`w-full h-[180px] bg-gradient-to-br ${CATEGORY_GRADIENTS[event.category] ?? 'from-gray-300 to-gray-400'} flex items-center justify-center`}>
          <span className="text-5xl">{CATEGORY_EMOJI[event.category] ?? '🎉'}</span>
        </div>
      )}

      <div className="p-4 space-y-2.5">
        {/* Category + source + New badge + price */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {event.category && (
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full shrink-0 ${catColor}`}>{event.category}</span>
            )}
            {event.source_name && (
              <span className="text-xs text-gray-400 truncate">{event.source_name}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isNew && (
              <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide">
                New
              </span>
            )}
            <PriceTag is_free={event.is_free} price_min={event.price_min} price_max={event.price_max} />
          </div>
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

        {/* Action buttons */}
        <div className="flex gap-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={stop(onWishlist)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
              isSaved
                ? 'border-red-300 bg-red-50 text-red-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {isSaved ? '❤️' : '🤍'} Wishlist
          </button>
          <button
            onClick={stop(onCalendar)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
              isInCalendar
                ? 'border-brand-300 bg-brand-50 text-brand-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            📅 Calendar
          </button>
          <button
            onClick={stop(onSource)}
            className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            🔗 Source
          </button>
        </div>
      </div>
    </div>
  )
}
