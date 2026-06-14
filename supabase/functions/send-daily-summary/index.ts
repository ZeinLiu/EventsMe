import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TO_EMAIL   = 'zein.liuzheng@gmail.com'
const FROM_EMAIL = 'onboarding@resend.dev'
const FROM_NAME  = 'EventsMe'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Events added in the last 24 hours
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const { data: newEvents, error } = await supabase
    .from('events')
    .select('title, event_date, category, source_name, is_free, price_min, price_max, venue')
    .gte('created_at', since)
    .eq('is_archived', false)
    .order('source_name', { ascending: true })
    .order('event_date',  { ascending: true })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  const events = newEvents ?? []

  // Group by source
  const bySource: Record<string, typeof events> = {}
  for (const e of events) {
    const src = e.source_name ?? 'Unknown'
    if (!bySource[src]) bySource[src] = []
    bySource[src].push(e)
  }

  const todaySgt = new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString().split('T')[0]

  const subject = events.length === 0
    ? `EventsMe · No new events today (${todaySgt})`
    : `EventsMe · ${events.length} new event${events.length > 1 ? 's' : ''} added (${todaySgt})`

  const html = buildHtml(events, bySource, todaySgt)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to:   [TO_EMAIL],
      subject,
      html,
    }),
  })

  const resBody = await res.json()

  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Resend failed', detail: resBody }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }

  return new Response(
    JSON.stringify({ sent: true, new_events: events.length, email_id: resBody.id }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatPrice(e: { is_free: boolean; price_min: number | null; price_max: number | null }): string {
  if (e.is_free) return 'Free'
  if (!e.price_min) return '—'
  return e.price_min === e.price_max ? `$${e.price_min}` : `$${e.price_min}–$${e.price_max}`
}

function buildHtml(
  events: any[],
  bySource: Record<string, any[]>,
  dateStr: string,
): string {
  const sourceCount = Object.keys(bySource).length

  const summaryRow = events.length === 0
    ? `<p style="color:#6b7280;font-size:15px;">No new events were added in the last 24 hours.</p>`
    : `<p style="color:#374151;font-size:15px;">
        <strong>${events.length} new event${events.length > 1 ? 's' : ''}</strong> added across
        <strong>${sourceCount} source${sourceCount > 1 ? 's' : ''}</strong>.
       </p>`

  const sourceBlocks = Object.entries(bySource).map(([src, evts]) => `
    <div style="margin-bottom:24px;">
      <div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
        ${src} · ${evts.length} event${evts.length > 1 ? 's' : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${evts.map(e => `
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;width:55%;">
              <div style="font-size:14px;font-weight:500;color:#111827;">${e.title}</div>
              <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${e.venue ?? ''}</div>
            </td>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;text-align:right;width:25%;">
              <span style="font-size:12px;color:#6b7280;">${formatDate(e.event_date)}</span>
            </td>
            <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;text-align:right;width:20%;">
              <span style="font-size:12px;color:${e.is_free ? '#16a34a' : '#374151'};">${formatPrice(e)}</span>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  `).join('')

  const emptyBlock = events.length === 0 ? `
    <div style="text-align:center;padding:32px 0;color:#9ca3af;font-size:14px;">
      Discovery ran but no new events were found today.<br>
      RSS feeds and AI search will try again tomorrow.
    </div>
  ` : ''

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:#16a34a;padding:24px 28px;">
      <div style="font-size:20px;font-weight:700;color:#fff;">EventsMe</div>
      <div style="font-size:13px;color:#bbf7d0;margin-top:2px;">Daily Discovery Summary · ${dateStr}</div>
    </div>

    <!-- Body -->
    <div style="padding:24px 28px;">
      ${summaryRow}
      ${emptyBlock}
      ${sourceBlocks}
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;border-top:1px solid #f3f4f6;background:#f9fafb;">
      <p style="font-size:12px;color:#9ca3af;margin:0;">
        Sent by EventsMe discovery pipeline · <a href="https://events-me.vercel.app" style="color:#16a34a;text-decoration:none;">Open app</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
