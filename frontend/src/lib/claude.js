export const WIZARD_OPENING = "Hi! I'm going to ask you a few quick questions to get to know your new family member. What's their name and how old are they? 😊"

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

const EDGE_FUNCTION_URL = 'https://bwmwojuymggllrkckeid.supabase.co/functions/v1/claude-wizard'

export async function chatWithWizard(messages) {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseAnonKey) {
    throw new Error('Missing VITE_SUPABASE_ANON_KEY in .env')
  }

  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${supabaseAnonKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ messages }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Edge function error ${res.status}`)
  }

  const data = await res.json()

  if (data.error) throw new Error(data.error)

  const text = data.text?.trim()
  if (!text) throw new Error('Empty response from Claude')

  const parsed = extractJson(text)
  if (parsed?.ready && parsed?.profile) {
    return { done: true, profile: parsed.profile }
  }

  return { done: false, text }
}
