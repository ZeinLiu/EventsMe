import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

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

export default function CalendarBottomSheet({ event, isInCalendar, onClose, onAdded }) {
  const { user } = useAuth()
  const today = new Date().toISOString().split('T')[0]
  const minDate = event.event_date ?? today
  const maxDate = event.event_end_date ?? minDate

  const [date, setDate] = useState(minDate)
  const [time, setTime] = useState('10:00')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleAdd() {
    if (!user) return
    setSaving(true)
    setErr('')
    const { error } = await supabase.from('calendar_entries').insert({
      user_id: user.id,
      event_id: event.id,
      scheduled_date: date,
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onAdded()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3">
          <div className="pr-8">
            <h3 className="text-base font-semibold text-gray-900 leading-snug">{event.title}</h3>
            {event.event_date && (
              <p className="text-xs text-gray-500 mt-0.5">
                {formatDateRange(event.event_date, event.event_end_date)}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-5 pb-8 space-y-4">
          {isInCalendar ? (
            <div className="bg-blue-50 rounded-2xl p-4 text-center space-y-2">
              <p className="text-sm font-medium text-blue-800">Already in your calendar</p>
              <Link
                to="/calendar"
                onClick={onClose}
                className="inline-block text-sm font-semibold text-brand-600 underline"
              >
                View →
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Date</label>
                <input
                  type="date"
                  value={date}
                  min={minDate}
                  max={maxDate}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  Time <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  Notes <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes for this visit…"
                  rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
                />
              </div>

              {err && <p className="text-xs text-red-500">{err}</p>}

              <button
                onClick={handleAdd}
                disabled={saving}
                className="w-full bg-brand-600 text-white font-semibold py-3 rounded-2xl text-sm disabled:opacity-60 active:opacity-80 transition-opacity"
              >
                {saving ? 'Adding…' : 'Add to Calendar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
