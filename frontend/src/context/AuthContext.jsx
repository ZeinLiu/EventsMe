import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let initialised = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)

      // Set loading false after the first event fires (INITIAL_SESSION handles
      // the OAuth code exchange, so this is always authoritative)
      if (!initialised) {
        setLoading(false)
        initialised = true
      }

      if (currentUser && event === 'SIGNED_IN') {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', currentUser.id)
          .single()

        if (!existingProfile) {
          await supabase
            .from('profiles')
            .insert({
              id: currentUser.id,
              name: currentUser.user_metadata?.full_name || currentUser.email,
            })
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
