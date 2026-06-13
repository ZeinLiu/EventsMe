import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Extract best image URL from HTML — og:image first, then twitter:image, then first meaningful <img>
function extractImageFromHtml(html: string, baseUrl: string): string | null {
  // og:image (two attribute orders)
  const og1 = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
  const og2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
  const ogUrl = og1?.[1] ?? og2?.[1]
  if (ogUrl && ogUrl.startsWith('http')) return ogUrl

  // twitter:image
  const tw1 = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
  const tw2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)
  const twUrl = tw1?.[1] ?? tw2?.[1]
  if (twUrl && twUrl.startsWith('http')) return twUrl

  // First meaningful <img src>
  const imgMatches = html.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi) ?? []
  for (const imgTag of imgMatches) {
    const src = imgTag.match(/src=["']([^"']+)["']/)?.[1] ?? ''
    if (
      src.startsWith('http') &&
      /\.(jpg|jpeg|png|webp)/i.test(src) &&
      !src.includes('logo') &&
      !src.includes('icon') &&
      !src.includes('avatar') &&
      !src.includes('pixel') &&
      !src.includes('tracking') &&
      !src.includes('1x1')
    ) return src
  }

  return null
}

async function fetchImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EventsMe/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    return extractImageFromHtml(html, url)
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Optional: limit how many to process per call (default 50)
  let body: any = {}
  try { body = await req.json() } catch { /* no body */ }
  const limit: number = parseInt(body?.limit ?? '50')
  const onlyUpcoming: boolean = body?.only_upcoming !== false

  // Fetch events missing images
  let query = supabase
    .from('events')
    .select('id, title, source_url')
    .is('image_url', null)
    .not('source_url', 'is', null)
    .limit(limit)

  if (onlyUpcoming) {
    query = query.gte('event_date', new Date().toISOString().split('T')[0])
  }

  const { data: events, error } = await query
  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  if (!events?.length) {
    return new Response(JSON.stringify({ enriched: 0, message: 'No events need images' }),
      { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  let enriched = 0
  let failed = 0
  const results: Array<{ title: string; image?: string; status: string }> = []

  for (const event of events) {
    const img = await fetchImage(event.source_url)
    if (img) {
      const { error: updateErr } = await supabase
        .from('events')
        .update({ image_url: img })
        .eq('id', event.id)

      if (!updateErr) {
        enriched++
        results.push({ title: event.title, image: img, status: 'ok' })
      } else {
        failed++
        results.push({ title: event.title, status: 'db_error' })
      }
    } else {
      failed++
      results.push({ title: event.title, status: 'no_image_found' })
    }

    // Small delay to avoid hammering sites
    await new Promise((r) => setTimeout(r, 500))
  }

  return new Response(
    JSON.stringify({ processed: events.length, enriched, failed, results }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
