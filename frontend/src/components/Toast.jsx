export default function Toast({ message }) {
  return (
    <div className="fixed left-1/2 -translate-x-1/2 z-[200] bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-xl animate-fade-in-down pointer-events-none whitespace-nowrap" style={{ top: 'max(1.25rem, env(safe-area-inset-top))' }}>
      {message}
    </div>
  )
}
