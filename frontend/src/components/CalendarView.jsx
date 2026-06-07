const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

export default function CalendarView() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = now.getDate()

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  const cells = Array(firstDay).fill(null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  )

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button className="text-gray-400 hover:text-gray-600 px-1">‹</button>
        <h2 className="text-sm font-semibold text-gray-800">{monthName}</h2>
        <button className="text-gray-400 hover:text-gray-600 px-1">›</button>
      </div>

      <div className="grid grid-cols-7 text-center">
        {DAYS.map((d) => (
          <div key={d} className="text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
        {cells.map((day, i) => (
          <div
            key={i}
            className={`text-sm py-1.5 rounded-full mx-auto w-8 h-8 flex items-center justify-center ${
              day === today
                ? 'bg-brand-600 text-white font-bold'
                : day
                ? 'text-gray-700 hover:bg-brand-50 cursor-pointer'
                : ''
            }`}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  )
}
