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
  if (start === end || !end) return s.toLocaleDateString('en-SG', optsYear)
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

import { useBodyScrollLock } from '../hooks/useBodyScrollLock'

export default function EventDetailSheet({ event, isSaved, isInCalendar, onWishlist, onCalendar, onSource, onClose }) {
  useBodyScrollLock(true)
  const catColor = CATEGORY_COLORS[event.category] ?? 'bg-gray-100 text-gray-600'
  const displayDate = formatDateRange(event.event_date, event.event_end_date)
  const displayLocation = event.venue || event.location

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl max-h-[90vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 text-white text-sm"
        >
          ✕
        </button>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 pb-2">
          {event.image_url ? (
            <img
              src={event.image_url}
              alt={event.title}
              className="w-full aspect-[16/7] object-cover rounded-t-3xl"
              loading="lazy"
            />
          ) : (
            <div className={`w-full aspect-[16/7] bg-gradient-to-br ${CATEGORY_GRADIENTS[event.category] ?? 'from-gray-300 to-gray-400'} flex items-center justify-center rounded-t-3xl`}>
              <span className="text-6xl">{CATEGORY_EMOJI[event.category] ?? '🎉'}</span>
            </div>
          )}

          <div className="p-5 space-y-3">
            {/* Category + price */}
            <div className="flex items-center justify-between gap-2">
              {event.category
                ? <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${catColor}`}>{event.category}</span>
                : <span />}
              <PriceTag is_free={event.is_free} price_min={event.price_min} price_max={event.price_max} />
            </div>

            {/* Title */}
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{event.title}</h2>

            {/* Date + venue */}
            <div className="flex flex-col gap-1 text-sm text-gray-500">
              {displayDate && <span>📅 {displayDate}</span>}
              {displayLocation && <span>📍 {displayLocation}</span>}
            </div>

            {/* Description */}
            {(event.description || event.short_summary) && (
              <p className="text-sm text-gray-700 leading-relaxed">
                {event.description || event.short_summary}
              </p>
            )}

            {event.source_name && (
              <p className="text-xs text-gray-400">Source: {event.source_name}</p>
            )}
          </div>
        </div>

        {/* Sticky action buttons */}
        <div className="p-4 border-t border-gray-100 flex gap-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={onWishlist}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
              isSaved
                ? 'border-red-300 bg-red-50 text-red-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {isSaved ? '❤️' : '🤍'} Wishlist
          </button>
          <button
            onClick={onCalendar}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-xl border transition-colors ${
              isInCalendar
                ? 'border-brand-300 bg-brand-50 text-brand-600'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            📅 Calendar
          </button>
          {event.source_name !== 'XHS' && (
            <button
              onClick={onSource}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              🔗 Source
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
