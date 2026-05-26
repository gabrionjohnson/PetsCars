/**
 * check-session-limits Edge Function
 *
 * Called client-side (via supabase.functions.invoke) BEFORE saving a session,
 * to check whether the client is at their tier's session limit.
 *
 * POST body: { client_id: string }
 * Returns: { allowed: boolean; used: number; limit: number | null; tier: string }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!

const TIER_SESSION_LIMITS: Record<string, number | null> = {
  basic:     2,
  standard:  null,  // unlimited
  full_care: null,  // unlimited
  inactive:  null,  // contract billing or unconfigured — admin decides
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const supabase   = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: authHeader ?? '' } },
  })

  const { client_id } = await req.json()
  if (!client_id) {
    return new Response(JSON.stringify({ error: 'client_id required' }), { status: 400 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('subscription_tier, subscription_status, sessions_used_this_period, contract_billing')
    .eq('id', client_id)
    .single()

  if (!client) {
    return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404 })
  }

  // Contract billing clients always allowed
  if (client.contract_billing) {
    return new Response(JSON.stringify({
      allowed: true, used: client.sessions_used_this_period, limit: null, tier: 'contract',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const tier  = client.subscription_tier ?? 'inactive'
  const limit = TIER_SESSION_LIMITS[tier] ?? null
  const used  = client.sessions_used_this_period ?? 0

  return new Response(JSON.stringify({
    allowed: limit === null || used < limit,
    used,
    limit,
    tier,
    over_limit: limit !== null && used >= limit,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
