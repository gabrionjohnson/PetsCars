/**
 * stripe-webhook Edge Function
 *
 * Handles Stripe webhook events for subscription billing and payout failures.
 *
 * Events handled:
 *   invoice.paid                  → reset session/errand counters; trigger ambassador retention
 *   customer.subscription.updated → sync subscription_status + tier to clients
 *   customer.subscription.deleted → set subscription_status = canceled
 *   transfer.failed               → flag payout, alert admin + SMS recipient
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const STRIPE_SECRET       = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SEC  = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_SID          = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN        = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM         = Deno.env.get('TWILIO_PHONE_NUMBER')!
const ADMIN_PHONE         = Deno.env.get('ADMIN_ALERT_PHONE') ?? ''

// Stripe tier → internal enum mapping
const PRICE_TO_TIER: Record<string, string> = {
  [Deno.env.get('STRIPE_PRICE_BASIC')    ?? '']: 'basic',
  [Deno.env.get('STRIPE_PRICE_STANDARD') ?? '']: 'standard',
  [Deno.env.get('STRIPE_PRICE_FULL_CARE')?? '']: 'full_care',
}

async function sendSms(to: string, body: string) {
  if (!to || !TWILIO_SID) return
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

// Minimal Stripe signature verification (HMAC-SHA256)
async function verifyStripeSignature(payload: string, sigHeader: string): Promise<boolean> {
  const parts      = sigHeader.split(',').reduce<Record<string,string>>((acc, p) => {
    const [k, v] = p.split('=')
    acc[k] = v
    return acc
  }, {})
  const timestamp  = parts['t']
  const signature  = parts['v1']
  if (!timestamp || !signature) return false

  const signed = `${timestamp}.${payload}`
  const key    = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(STRIPE_WEBHOOK_SEC),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed))
  const hex    = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2,'0')).join('')
  return hex === signature
}

Deno.serve(async (req) => {
  const payload   = await req.text()
  const sigHeader = req.headers.get('stripe-signature') ?? ''

  if (STRIPE_WEBHOOK_SEC && !await verifyStripeSignature(payload, sigHeader)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const event = JSON.parse(payload)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  // ── Idempotency: skip events already processed ────────────────────────────
  // Stripe may retry delivery; event IDs are stable across retries.
  const { error: insertErr } = await supabase
    .from('stripe_processed_events')
    .insert({ event_id: event.id, event_type: event.type })
  if (insertErr) {
    // Duplicate key = already processed — return 200 so Stripe stops retrying
    if (insertErr.code === '23505') {
      return new Response(JSON.stringify({ received: true, skipped: 'duplicate' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }
    // Any other insert error — log and continue (idempotency best-effort)
    console.error('stripe_processed_events insert error', insertErr.message)
  }

  try {
    switch (event.type) {

      // ── invoice.paid ─────────────────────────────────────────────────────
      case 'invoice.paid': {
        const invoice       = event.data.object
        const customerId    = invoice.customer
        const subscriptionId = invoice.subscription

        // Find client by stripe_subscription_id
        const { data: client } = await supabase
          .from('clients')
          .select('id, ambassador_id, subscription_tier')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        if (client) {
          // Reset usage counters on renewal
          await supabase
            .from('clients')
            .update({
              sessions_used_this_period: 0,
              errands_used_this_period: 0,
              subscription_status: 'active',
            })
            .eq('id', client.id)

          // Ambassador retention bonus (≤ month 6)
          if (client.ambassador_id) {
            const { data: referral } = await supabase
              .from('referrals')
              .select('id, months_paid, signup_bonus_paid')
              .eq('ambassador_id', client.ambassador_id)
              .eq('client_id', client.id)
              .single()

            if (referral && referral.signup_bonus_paid && referral.months_paid < 6) {
              // Credit $10 retention bonus
              await supabase.rpc('add_ledger_row', {
                p_recipient_type: 'ambassador',
                p_recipient_id:   client.ambassador_id,
                p_event_type:     'ambassador_retention',
                p_reference_id:   referral.id,
                p_gross_amount:   10.00,
                p_platform_fee:   0,
                p_net_amount:     10.00,
              })
              await supabase
                .from('referrals')
                .update({ months_paid: referral.months_paid + 1 })
                .eq('id', referral.id)

              // Atomically increment ambassador total_earned
              await supabase.rpc('increment_ambassador_earned', {
                p_id:     client.ambassador_id,
                p_amount: 10.00,
              })
            }
          }

          // Credit Standard/Full Care navigator flat monthly earnings (via run-payouts batch)
          // Per-session credits for Basic are handled by the sessions trigger.
        }
        break
      }

      // ── customer.subscription.updated ────────────────────────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const priceId = sub.items?.data?.[0]?.price?.id ?? ''
        const tier    = PRICE_TO_TIER[priceId] ?? null
        const status  = sub.status // active, past_due, canceled, etc.

        await supabase
          .from('clients')
          .update({
            subscription_status: status,
            ...(tier ? { subscription_tier: tier } : {}),
          })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      // ── customer.subscription.deleted ─────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await supabase
          .from('clients')
          .update({ subscription_status: 'canceled' })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      // ── transfer.failed ───────────────────────────────────────────────────
      case 'transfer.failed': {
        const transfer   = event.data.object
        const transferId = transfer.id

        // Find payout record by stripe_transfer_id
        const { data: payout } = await supabase
          .from('payouts')
          .select('id, recipient_type, recipient_id, amount')
          .eq('stripe_transfer_id', transferId)
          .single()

        if (payout) {
          // Mark payout failed
          await supabase
            .from('payouts')
            .update({
              status:         'failed',
              failure_reason: transfer.failure_message ?? 'Transfer failed',
            })
            .eq('id', payout.id)

          // Alert admin
          await sendSms(
            ADMIN_PHONE,
            `⚠️ Stripe Transfer Failed\n` +
            `Recipient: ${payout.recipient_type} ${payout.recipient_id.slice(0, 8)}\n` +
            `Amount: $${payout.amount.toFixed(2)}\n` +
            `Transfer: ${transferId}\n` +
            `Reason: ${transfer.failure_message ?? 'Unknown'}`,
          )

          // SMS the Navigator/Driver
          if (payout.recipient_type !== 'ambassador') {
            const table = payout.recipient_type === 'navigator' ? 'navigators' : 'drivers'
            const { data: profile } = await supabase
              .from(table)
              .select('profiles!inner(phone)')
              .eq('id', payout.recipient_id)
              .single()
            const phone = (profile?.profiles as any)?.phone
            if (phone) {
              await sendSms(phone,
                `Pathway: Your payout of $${payout.amount.toFixed(2)} failed. ` +
                `Please update your bank info in your Connect account, or contact support.`,
              )
            }
          }
        }
        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('stripe-webhook error', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
