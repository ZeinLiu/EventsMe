import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Archive events whose end date passed more than 7 days ago
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffDate = cutoff.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('events')
    .update({ is_archived: true })
    .lt('event_end_date', cutoffDate)
    .eq('is_archived', false)
    .select('id')

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({ archived: data?.length ?? 0, cutoff_date: cutoffDate }),
    { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  )
})
