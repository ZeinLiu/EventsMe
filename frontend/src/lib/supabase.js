import { createClient } from '@supabase/supabase-js'

// Strip trailing /rest/v1/ path if accidentally included in the env var —
// the JS client only needs the project root URL.
const rawUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!rawUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
