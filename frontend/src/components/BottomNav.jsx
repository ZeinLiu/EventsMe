import { NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/',               label: 'Home',    icon: '🏠' },
  { to: '/events',         label: 'Events',  icon: '🎪' },
  { to: '/recommendations',label: 'For You', icon: '✨' },
  { to: '/chat',           label: 'Chat',    icon: '💬' },
  { to: '/profile',        label: 'Profile', icon: '👤' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 flex items-center justify-around px-2 py-2 z-50">
      {NAV_ITEMS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
              isActive ? 'text-brand-600' : 'text-gray-400 hover:text-gray-600'
            }`
          }
        >
          <span className="text-xl leading-none">{icon}</span>
          <span className="text-[10px] font-medium">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
