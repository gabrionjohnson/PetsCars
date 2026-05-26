/**
 * nemt-dispatch Edge Function
 *
 * Dispatches a NEMT trip to eligible drivers 72+ hours before the scheduled
 * datetime (Verida 3-business-day rule). Called manually by admin or by a
 * pg_cron job after trip approval.
 *
 * Rules:
 *  - Stretcher trips → escalate to admin (SMS + DB flag), no auto-dispatch
 *  - WAV trips → only has_wav drivers
 *  - 24-hour accept window (vs. 15 min for errands)
 *  - One notification per driver per trip; no duplicates
 *
 * POST body: { trip_id: string, zone_round?: number }
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const TWILIO_SID       = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN     = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM      = Deno.env.get('TWILIO_PHONE_NUMBER')!
const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_PHONE      = Deno.env.get('ADMIN_ALERT_PHONE') ?? ''

const TRIP_TYPE_LABELS: Record<string, string> = {
  ambulatory: 'Ambulatory',
  wheelchair: 'Wheelchair',
  stretcher:  'Stretcher',
}

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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

  let body: { trip_id: string; zone_round?: number }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { trip_id, zone_round = 1 } = body
  if (!trip_id) {
    return new Response(JSON.stringify({ error: 'trip_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Fetch the NEMT trip ──────────────────────────────────────────────────
  const { data: trip, error: tripErr } = await supabase
    .from('nemt_trips')
    .select(`
      id, trip_type, pickup_address, appointment_address,
      appointment_provider, scheduled_datetime,
      status, driver_id, client_id,
      clients!inner(county, zip_code)
    `)
    .eq('id', trip_id)
    .single()

  if (tripErr || !trip) {
    return new Response(
      JSON.stringify({ error: 'Trip not found', detail: tripErr?.message }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (trip.status !== 'pending') {
    return new Response(
      JSON.stringify({ skipped: true, reason: `Trip status is ${trip.status}` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // ── Stretcher → admin escalation, no auto-dispatch ──────────────────────
  if (trip.trip_type === 'stretcher') {
    await sendSms(
      ADMIN_PHONE,
      `⚠️ NEMT Stretcher Trip Needs Manual Assignment\n` +
      `Trip: ${trip_id}\n` +
      `${formatDate(trip.scheduled_datetime)}\n` +
      `Pickup: ${trip.pickup_address}\n` +
      `Destination: ${trip.appointment_address}\n` +
      `Please assign a stretcher-capable driver in the dashboard.`,
    )
    // Log a note in trip_status_log
    await supabase.rpc('log_trip_status', {
      p_trip_id:   trip_id,
      p_trip_type: 'nemt',
      p_status:    'dispatched',
      p_by:        null,
      p_note:      'Stretcher trip — escalated to admin for manual driver assignment.',
    })
    return new Response(
      JSON.stringify({ dispatched: 0, escalated: true, reason: 'stretcher_manual' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const client = trip.clients as { county: string | null; zip_code: string | null }

  // ── Find already-notified driver IDs (prevent re-notification) ───────────
  const { data: alreadyNotified } = await supabase
    .from('job_dispatch_log')
    .select('driver_id')
    .eq('trip_id', trip_id)
    .eq('trip_type', 'nemt')

  const excludeIds = (alreadyNotified ?? []).map((r: any) => r.driver_id as string)

  // ── Query eligible drivers ────────────────────────────────────────────────
  let driversQuery = supabase
    .from('drivers')
    .select('id, county, zip_codes, has_wav, profiles!inner(phone)')
    .eq('active', true)
    .eq('online', true)
    .eq('background_check_status', 'approved')
    .eq('stripe_connect_complete', true)

  // WAV requirement
  if (trip.trip_type === 'wheelchair') {
    driversQuery = driversQuery.eq('has_wav', true)
  }

  // Zone filter round 1: county + zip; later rounds: no zone filter
  if (zone_round === 1 && client.county) {
    const filters: string[] = [`county.eq.${client.county}`]
    if (client.zip_code) filters.push(`zip_codes.cs.{${client.zip_code}}`)
    driversQuery = driversQuery.or(filters.join(','))
  }

  if (excludeIds.length > 0) {
    driversQuery = driversQuery.not('id', 'in', `(${excludeIds.join(',')})`)
  }

  const { data: drivers } = await driversQuery
  const eligible = (drivers ?? []) as Array<{
    id: string
    profiles: { phone: string | null } | null
  }>

  if (eligible.length === 0) {
    return new Response(
      JSON.stringify({ dispatched: 0, eligible: 0, zone_round }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const typeLabel = TRIP_TYPE_LABELS[trip.trip_type] ?? trip.trip_type
  const smsBody =
    `🏥 NEMT Job Available — ${typeLabel}\n` +
    `📅 ${formatDate(trip.scheduled_datetime)}\n` +
    `📍 Pickup: ${trip.pickup_address}\n` +
    `🏥 Drop-off: ${trip.appointment_address}\n` +
    `Reply ACCEPT ${trip_id.slice(0, 8).toUpperCase()} to accept (24-hr window).`

  // ── Notify all eligible drivers & log dispatch ────────────────────────────
  let dispatched = 0

  await Promise.all(
    eligible.map(async (driver) => {
      // Log dispatch record first (idempotent via UNIQUE constraint)
      const { error: logErr } = await supabase
        .from('job_dispatch_log')
        .insert({
          trip_id,
          trip_type:  'nemt',
          driver_id:  driver.id,
          zone_round,
          response:   'pending',
        })

      if (logErr && !logErr.message.includes('unique')) {
        console.error('dispatch log error', driver.id, logErr.message)
        return
      }

      const phone = (driver.profiles as any)?.phone
      if (phone) await sendSms(phone, smsBody)
      dispatched++
    }),
  )

  // Log the first dispatched event on the trip if first zone round
  if (zone_round === 1 && dispatched > 0) {
    await supabase.rpc('log_trip_status', {
      p_trip_id:   trip_id,
      p_trip_type: 'nemt',
      p_status:    'dispatched',
      p_by:        null,
      p_note:      `Dispatched to ${dispatched} driver(s) in zone round ${zone_round}.`,
    })
  }

  return new Response(
    JSON.stringify({ dispatched, eligible: eligible.length, zone_round }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
