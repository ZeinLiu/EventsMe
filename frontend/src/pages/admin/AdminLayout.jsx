import { useEffect, useState } from 'react'
import { NavLink, Outlet, Navigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export function useAdminRole() {
  const { user, loading: authLoading } = useAuth()
  const [role, setRole]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setRole(null); setLoading(false); return }
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setRole(data?.role ?? 'user')
        setLoading(false)
      })
  }, [user, authLoading])

  return { role, loading: authLoading || loading, isAdmin: role === 'admin' }
}

const NAV = [
  { to: '/admin/settings',  label: 'Settings' },
  { to: '/admin/discovery', label: 'Discovery' },
  { to: '/admin/usage',     label: 'Usage' },
]

export default function AdminLayout() {
  const { isAdmin, loading } = useAdminRole()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAdmin) return <Navigate to="/" replace />

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-2.5 shrink-0">
              <Link to="/" className="text-base font-bold text-gray-900 hover:text-brand-600 transition-colors">
                EventsMe
              </Link>
              <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                Admin
              </span>
            </div>

            <nav className="flex gap-1">
              {NAV.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>

            <Link
              to="/"
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
            >
              ← App
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Outlet />
      </main>
    </div>
  )
}
