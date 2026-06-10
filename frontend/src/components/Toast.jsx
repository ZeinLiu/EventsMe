export default function Toast({ message }) {
  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-xl animate-fade-in-down pointer-events-none whitespace-nowrap">
      {message}
    </div>
  )
}
