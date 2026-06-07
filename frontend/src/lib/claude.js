const SYSTEM_PROMPT = `You are EventsMe's friendly family profile assistant.
Your job is to learn about a new family member in 4-5
short conversational exchanges. Be warm, sharp and efficient.
Ask maximum 2 questions per message. Keep each message
under 2 sentences. Use occasional light humour.

After gathering: name, age, role, interests, any constraints,
and availability — output ONLY a JSON block in this exact format
with no extra text:

{
  "ready": true,
  "profile": {
    "name": "",
    "age": 0,
    "role": "",
    "interests": [],
    "constraints": "",
    "availability": "",
    "summary": "one sentence personality summary for event recommendation engine"
  }
}

Do not output the JSON until you have enough information.
Until then, just ask conversational questions naturally.`

export const WIZARD_OPENING = "Hi! I'm going to ask you a few quick questions to get to know your new family member. What's their name and how old are they? 😊"

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

export async function chatWithWizard(messages) {
  const apiKey = import.meta.env.VITE_CLAUDE_API_KEY
  if (!apiKey) throw new Error('Add VITE_CLAUDE_API_KEY to your .env file')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-client-side-allow': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Claude API error ${res.status}`)
  }

  const data = await res.json()
  const text = data.content[0].text.trim()

  const parsed = extractJson(text)
  if (parsed?.ready && parsed?.profile) {
    return { done: true, profile: parsed.profile }
  }

  return { done: false, text }
}
