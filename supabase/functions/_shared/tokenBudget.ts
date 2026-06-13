// Shared token budget utilities for all discovery edge functions.
// Reads limits from app_settings and auto-resets the daily counter
// after 24 hours so the admin never has to reset manually.

export interface BudgetStatus {
  allowed: boolean
  used: number
  limit: number
}

export async function checkBudget(supabase: any): Promise<BudgetStatus> {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['daily_tokens_used', 'daily_token_limit', 'last_token_reset'])

  const map: Record<string, string> = {}
  for (const s of data ?? []) map[s.key] = s.value

  const limit = parseInt(map['daily_token_limit'] ?? '300000')
  const lastReset = map['last_token_reset'] ? new Date(map['last_token_reset']).getTime() : 0
  const hoursSince = (Date.now() - lastReset) / 3_600_000

  // Auto-reset counter if 24+ hours have passed since last reset
  if (hoursSince >= 24) {
    const now = new Date().toISOString()
    await Promise.all([
      supabase.from('app_settings')
        .update({ value: '0', updated_at: now })
        .eq('key', 'daily_tokens_used'),
      supabase.from('app_settings')
        .update({ value: now, updated_at: now })
        .eq('key', 'last_token_reset'),
    ])
    return { allowed: true, used: 0, limit }
  }

  const used = parseInt(map['daily_tokens_used'] ?? '0')
  return { allowed: used < limit, used, limit }
}

export async function addTokens(supabase: any, count: number): Promise<void> {
  if (count <= 0) return
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'daily_tokens_used')
    .single()
  const newValue = parseInt(data?.value ?? '0') + count
  await supabase.from('app_settings')
    .update({ value: String(newValue), updated_at: new Date().toISOString() })
    .eq('key', 'daily_tokens_used')
}
