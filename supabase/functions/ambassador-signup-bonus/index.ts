/**
 * ambassador-signup-bonus Edge Function
 *
 * Called via Supabase Database Webhook when a session is inserted.
 * Checks if the client has an ambassador referral and this is their
 * FIRST session — if so, credits the $20 signup bonus.
 *
 * POST body: { type: 'INSERT', table: 'sessions', record: { client_id, id, ... } }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_SID       = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN     = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM      = Deno.env.get('TWILIO_PHONE_NUMBER')!

async function sendSms(to: string, body: string) {
  if (!to) return
  await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }).toString(),
    },
  )
}

Deno.serve(async (req) => {
  const payload = await req.json()
  const session = payload.record
  if (!session?.client_id) return new Response('ok', { status: 200 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  // Find ambassador linked to this client
  const { data: client } = await supabase
    .from('clients')
    .select('id, ambassador_id, name')
    .eq('id', session.client_id)
    .single()

  if (!client?.ambassador_id) return new Response('no ambassador', { status: 200 })

  // Check referral record — signup bonus not yet paid
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, signup_bonus_paid, months_paid')
    .eq('ambassador_id', client.ambassador_id)
    .eq('client_id', client.id)
    .single()

  if (!referral || referral.signup_bonus_paid) return new Response('already paid', { status: 200 })

  // Check this is truly the first session for this client
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client.id)

  if ((count ?? 0) > 1) return new Response('not first session', { status: 200 })

  // Credit $20 signup bonus
  await supabase.rpc('add_ledger_row', {
    p_recipient_type: 'ambassador',
    p_recipient_id:   client.ambassador_id,
    p_event_type:     'ambassador_signup',
    p_reference_id:   referral.id,
    p_gross_amount:   20.00,
    p_platform_fee:   0,
    p_net_amount:     20.00,
  })

  // Mark signup bonus paid and set activated_at on referral
  await supabase
    .from('referrals')
    .update({
      signup_bonus_paid:    true,
      signup_bonus_paid_at: new Date().toISOString(),
      activated_at:         new Date().toISOString(),
    })
    .eq('id', referral.id)

  // Update ambassador total_earned and active_referrals
  const { data: amb } = await supabase
    .from('ambassadors')
    .select('id, phone, total_earned, active_referrals')
    .eq('id', client.ambassador_id)
    .single()

  if (amb) {
    const newTotal  = (amb.total_earned ?? 0) + 20
    const newActive = (amb.active_referrals ?? 0) + 1

    await supabase
      .from('ambassadors')
      .update({ total_earned: newTotal, active_referrals: newActive })
      .eq('id', amb.id)

    // SMS ambassador
    const clientFirstName = (client.name ?? 'Someone').split(' ')[0]
    await sendSms(amb.phone,
      `Great news! ${clientFirstName} you referred just completed their first Pathway session. ` +
      `$20 has been added to your account. Total balance: $${newTotal.toFixed(2)}.`,
    )

    // Check tier bonus (5 active referrals = $50 + Senior Ambassador)
    if (newActive === 5) {
      await supabase.rpc('add_ledger_row', {
        p_recipient_type: 'ambassador',
        p_recipient_id:   amb.id,
        p_event_type:     'ambassador_tier',
        p_reference_id:   null,
        p_gross_amount:   50.00,
        p_platform_fee:   0,
        p_net_amount:     50.00,
      })
      await supabase
        .from('ambassadors')
        .update({ senior_ambassador: true, total_earned: newTotal + 50 })
        .eq('id', amb.id)
      await sendSms(amb.phone,
        `🎉 Congratulations! You've reached Senior Ambassador status. ` +
        `A $50 bonus has been added to your account. Thank you for growing Pathway!`,
      )
    }
  }

  return new Response(JSON.stringify({ credited: true, amount: 20 }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
})
