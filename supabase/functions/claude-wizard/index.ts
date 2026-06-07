import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { messages } = await req.json()

    const apiKey = Deno.env.get('CLAUDE_API_KEY')
    if (!apiKey) throw new Error('CLAUDE_API_KEY secret not set — run: supabase secrets set CLAUDE_API_KEY=sk-ant-...')

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages,
      }),
    })

    const body = await upstream.json()
    return new Response(JSON.stringify(body), {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: { message: msg } }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
