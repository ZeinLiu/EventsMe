import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = not yet checked
  const [loading, setLoading] = useState(true)
  const resolved = useRef(false)

  useEffect(() => {
    // Primary: resolve session from storage (or PKCE exchange)
    supabase.auth.getSession().then(({ data: { session } }) => {
      resolved.current = true
      setSession(session ?? null)
      setLoading(false)
    })

    // Secondary: handle auth events — also clears loading so SIGNED_IN
    // from PKCE exchange unblocks the spinner even if getSession() is slow
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, session?.user?.email ?? null)

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        resolved.current = true
        setSession(session)
        setLoading(false)
      }
      if (event === 'SIGNED_OUT') {
        resolved.current = true
        setSession(null)
        setLoading(false)
      }

      // Auto-create profile row on first Google sign-in
      if (event === 'SIGNED_IN' && session?.user) {
        const u = session.user
        const { data: existing } = await supabase
          .from('profiles').select('id').eq('id', u.id).single()
        if (!existing) {
          await supabase.from('profiles').insert({
            id: u.id,
            name: u.user_metadata?.full_name || u.email,
          })
        }
      }
    })

    // Fallback: if nothing resolved after 3 s, call getSession() once more
    const timeout = setTimeout(async () => {
      if (resolved.current) return
      const { data: { session } } = await supabase.auth.getSession()
      resolved.current = true
      setSession(session ?? null)
      setLoading(false)
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const user = session?.user ?? null

  return (
    <AuthContext.Provider value={{ user, session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
