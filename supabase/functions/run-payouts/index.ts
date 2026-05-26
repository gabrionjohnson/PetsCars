/**
 * run-payouts Edge Function
 *
 * Scheduled bi-weekly (cron: 0 9 1,16 * * America/New_York).
 * Closes the prior payout period and transfers earnings to all
 * Navigator, Driver, and Ambassador Connect accounts.
 *
 * POST body: { period_start?: string, period_end?: string }
 * If dates omitted, uses the just-closed period (yesterday).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const STRIPE_SECRET    = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_SID       = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN     = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM      = Deno.env.get('TWILIO_PHONE_NUMBER')!
const ADMIN_PHONE      = Deno.env.get('ADMIN_ALERT_PHONE') ?? ''
const MIN_PAYOUT_CENTS = 100  // $1.00 Stripe minimum

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

async function stripeTransfer(
  amount: number,       // in cents
  destination: string,  // Stripe Connect account ID
  description: string,
): Promise<{ id: string } | null> {
  const res = await fetch('https://api.stripe.com/v1/transfers', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${STRIPE_SECRET}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      amount:      String(amount),
      currency:    'usd',
      destination,
      description,
    }).toString(),
  })
  if (!res.ok) {
    console.error('Stripe transfer failed', await res.text())
    return null
  }
  return res.json()
}

function closedPeriod(): { period_start: string; period_end: string } {
  const today = new Date()
  const day   = today.getDate()
  const year  = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  // If today is 1st, closed period was previous month 16th–last
  // If today is 16th, closed period was 1st–15th of this month
  if (day === 1) {
    const prevMonth = new Date(year, today.getMonth() - 1, 1)
    const pm = String(prevMonth.getMonth() + 1).padStart(2, '0')
    const py = prevMonth.getFullYear()
    const lastDay = new Date(year, today.getMonth(), 0).getDate()
    return { period_start: `${py}-${pm}-16`, period_end: `${py}-${pm}-${lastDay}` }
  }
  return { period_start: `${year}-${month}-01`, period_end: `${year}-${month}-15` }
}

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
  const body     = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

  const { period_start, period_end } = body.period_start
    ? body
    : closedPeriod()

  console.log(`Running payouts for period ${period_start} → ${period_end}`)

  // ── Credit Standard/Full Care navigator flat monthly earnings ─────────────
  // These aren't per-session (handled by trigger for Basic).
  // Find all active Standard/Full Care clients and credit their navigator.
  const { data: stdClients } = await supabase
    .from('clients')
    .select('id, navigator_id, subscription_tier, subscription_status')
    .in('subscription_tier', ['standard', 'full_care'])
    .eq('subscription_status', 'active')
    .not('navigator_id', 'is', null)

  const navFlatCredits: Record<string, number> = {}
  for (const c of stdClients ?? []) {
    const flat = c.subscription_tier === 'standard' ? 53.40 / 2 : 77.40 / 2
    navFlatCredits[c.navigator_id] = (navFlatCredits[c.navigator_id] ?? 0) + flat
  }

  for (const [navId, flat] of Object.entries(navFlatCredits)) {
    // Check if already credited this period (avoid double-credit)
    const { count } = await supabase
      .from('payout_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', navId)
      .eq('event_type', 'session')
      .eq('period_start', period_start)
      .eq('period_end', period_end)

    if ((count ?? 0) === 0) {
      await supabase.rpc('add_ledger_row', {
        p_recipient_type: 'navigator',
        p_recipient_id:   navId,
        p_event_type:     'session',
        p_reference_id:   null,
        p_gross_amount:   flat / 0.60,
        p_platform_fee:   flat / 0.60 * 0.40,
        p_net_amount:     flat,
      })
    }
  }

  // ── Fetch all unpaid ledger rows for the closed period ───────────────────
  const { data: unpaidRows } = await supabase
    .from('payout_ledger')
    .select('id, recipient_type, recipient_id, net_amount')
    .is('payout_id', null)
    .lte('period_end', period_end)

  // Group by recipient
  const byRecipient: Record<string, { type: string; id: string; total: number; rowIds: string[] }> = {}
  for (const row of unpaidRows ?? []) {
    const key = `${row.recipient_type}:${row.recipient_id}`
    if (!byRecipient[key]) {
      byRecipient[key] = { type: row.recipient_type, id: row.recipient_id, total: 0, rowIds: [] }
    }
    byRecipient[key].total   += row.net_amount
    byRecipient[key].rowIds.push(row.id)
  }

  let totalDisbursed   = 0
  let recipientCount   = 0
  let failedCount      = 0
  const failedDetails: string[] = []

  for (const rec of Object.values(byRecipient)) {
    if (rec.total < 1.00) continue  // below Stripe minimum

    const amountCents = Math.round(rec.total * 100)

    // Get Stripe account ID
    let stripeAccountId: string | null = null
    let phone: string | null = null

    if (rec.type === 'navigator') {
      const { data } = await supabase
        .from('navigators')
        .select('stripe_account_id, profiles!inner(phone)')
        .eq('id', rec.id)
        .single()
      stripeAccountId = data?.stripe_account_id ?? null
      phone = (data?.profiles as any)?.phone ?? null
    } else if (rec.type === 'driver') {
      const { data } = await supabase
        .from('drivers')
        .select('stripe_account_id, profiles!inner(phone)')
        .eq('id', rec.id)
        .single()
      stripeAccountId = data?.stripe_account_id ?? null
      phone = (data?.profiles as any)?.phone ?? null
    } else if (rec.type === 'ambassador') {
      const { data } = await supabase
        .from('ambassadors')
        .select('stripe_account_id, phone')
        .eq('id', rec.id)
        .single()
      stripeAccountId = data?.stripe_account_id ?? null
      phone = data?.phone ?? null
    }

    if (!stripeAccountId) {
      console.warn(`No Stripe account for ${rec.type} ${rec.id} — skipping`)
      continue
    }

    // Create payout record
    const { data: payoutRow } = await supabase
      .from('payouts')
      .insert({
        recipient_type: rec.type,
        recipient_id:   rec.id,
        amount:         rec.total,
        period_start,
        period_end,
        status:        'pending',
      })
      .select('id')
      .single()

    if (!payoutRow) continue

    // Create Stripe Transfer
    const transfer = await stripeTransfer(
      amountCents,
      stripeAccountId,
      `Pathway ${rec.type} payout ${period_start} to ${period_end}`,
    )

    if (transfer) {
      // Mark payout paid + update ledger rows
      await supabase
        .from('payouts')
        .update({ status: 'paid', stripe_transfer_id: transfer.id, paid_at: new Date().toISOString() })
        .eq('id', payoutRow.id)

      await supabase
        .from('payout_ledger')
        .update({ payout_id: payoutRow.id })
        .in('id', rec.rowIds)

      totalDisbursed += rec.total
      recipientCount++

      if (phone) {
        await sendSms(phone,
          `Pathway: $${rec.total.toFixed(2)} payout for ${period_start}–${period_end} has been sent to your bank. ` +
          `Allow 2–3 business days to arrive.`,
        )
      }
    } else {
      // Transfer failed — mark payout failed
      await supabase
        .from('payouts')
        .update({ status: 'failed', failure_reason: 'Stripe transfer rejected' })
        .eq('id', payoutRow.id)

      failedCount++
      failedDetails.push(`${rec.type} ${rec.id.slice(0,8)}: $${rec.total.toFixed(2)}`)
    }
  }

  // ── Admin summary SMS ─────────────────────────────────────────────────────
  await sendSms(ADMIN_PHONE,
    `✅ Pathway Payout Run Complete\n` +
    `Period: ${period_start} → ${period_end}\n` +
    `Paid: ${recipientCount} recipients, $${totalDisbursed.toFixed(2)} total\n` +
    (failedCount > 0 ? `⚠ ${failedCount} failed: ${failedDetails.join(', ')}` : 'No failures.'),
  )

  return new Response(JSON.stringify({
    period_start, period_end,
    recipients: recipientCount,
    total_disbursed: totalDisbursed,
    failed: failedCount,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
