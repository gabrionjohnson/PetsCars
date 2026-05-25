/**
 * dispatch-job Edge Function
 *
 * Called after a booking is confirmed (payment captured or admin-approved).
 * Finds all eligible drivers in the client's service zone, notifies them
 * simultaneously, and records each notification in job_dispatch_log.
 *
 * Zone expansion: If called with zone_round > 1, expands to adjacent counties.
 * The 15-min / 45-min timeouts are enforced by a pg_cron job that calls this
 * function again with an incremented zone_round.
 *
 * POST body: { trip_id, zone_round? }
 * All trips in this function are errand_trips (nemt uses a separate dispatcher).
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const SERVICE_LABEL: Record<string, string> = {
  pharmacy_pickup: 'Pharmacy Pickup',
  grocery_run:     'Grocery Run',
  small_errand:    'Small Errand',
  ride_and_wait:   'Ride & Wait',
}

async function sendSms(to: string, body: string) {
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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const { trip_id, zone_round = 1 } = await req.json() as {
    trip_id: string
    zone_round?: number
  }

  if (!trip_id) return new Response(JSON.stringify({ error: 'trip_id required' }), { status: 400 })

  // Fetch the trip with client info
  const { data: trip, error: tripErr } = await supabase
    .from('errand_trips')
    .select('*, clients(county, zip, name, navigator_id, navigators(profiles(name, phone)))')
    .eq('id', trip_id)
    .single()

  if (tripErr || !trip) {
    return new Response(JSON.stringify({ error: 'trip not found' }), { status: 404 })
  }

  if (trip.status === 'assigned' || trip.status === 'completed' || trip.status === 'canceled') {
    return new Response(JSON.stringify({ skipped: true, reason: 'trip already ' + trip.status }), { status: 200 })
  }

  const clientCounty: string = trip.clients?.county ?? ''
  const clientZip: string = trip.clients?.zip ?? ''

  // Find eligible drivers:
  //   - active = true (vetted and background-checked)
  //   - online = true (available for work)
  //   - background_check_status = 'approved'
  //   - service zone overlaps client location
  //   - if wav_required: has_wav = true
  //   - not already notified for this trip
  let driversQuery = supabase
    .from('drivers')
    .select('id, profiles(phone, name), vehicle_make, vehicle_model, vehicle_color, has_wav')
    .eq('active', true)
    .eq('online', true)
    .eq('background_check_status', 'approved')
    .not('id', 'in', `(
      SELECT driver_id FROM job_dispatch_log
      WHERE trip_id = '${trip_id}' AND trip_type = 'errand'
    )`)

  if (trip.wav_required) {
    driversQuery = driversQuery.eq('has_wav', true)
  }

  // Zone filter: round 1 = exact county/zip, round 2+ = broader (handled by admin county list)
  // For round 1: driver's zip_codes must contain the client's zip OR county matches
  // For round 2+: looser filter — just county presence (admin configures adjacent counties)
  if (zone_round === 1) {
    driversQuery = driversQuery
      .or(`county.eq.${clientCounty},zip_codes.cs.{${clientZip}}`)
  }
  // zone_round >= 2: drop the zone filter to expand (simplified — Phase 4 will add county adjacency table)

  const { data: drivers, error: driversErr } = await driversQuery

  if (driversErr) {
    return new Response(JSON.stringify({ error: driversErr.message }), { status: 500 })
  }

  if (!drivers || drivers.length === 0) {
    // No drivers found — if this is already round 2+, alert navigator
    if (zone_round >= 2) {
      const navPhone = (trip.clients as any)?.navigators?.profiles?.phone
      const clientName = trip.clients?.name ?? 'a client'
      const serviceLabel = SERVICE_LABEL[trip.service_type] ?? trip.service_type

      if (navPhone) {
        await sendSms(
          navPhone,
          `Pathway: No driver available for ${clientName}'s ${serviceLabel} request after expanded search. Manual follow-up needed.`,
        )
      }

      await supabase
        .from('errand_trips')
        .update({ no_driver_alert_sent: true })
        .eq('id', trip_id)
    }

    return new Response(JSON.stringify({ dispatched: 0, zone_round }), { status: 200 })
  }

  const serviceLabel = SERVICE_LABEL[trip.service_type] ?? trip.service_type
  const payout = trip.driver_payout ?? 0
  const scheduledText = trip.scheduled_for
    ? `Scheduled: ${new Date(trip.scheduled_for).toLocaleString('en-US', { timeZone: 'America/New_York' })}`
    : 'ASAP'

  // Insert dispatch log entries and send SMS/push to all eligible drivers simultaneously
  const notifications = drivers.map(async (driver: any) => {
    // Record notification in dispatch log
    await supabase.from('job_dispatch_log').insert({
      trip_id,
      trip_type:  'errand',
      driver_id:  driver.id,
      zone_round,
      response:   'pending',
    })

    // Send SMS notification to driver
    const driverPhone = driver.profiles?.phone
    if (driverPhone) {
      await sendSms(
        driverPhone,
        `Pathway: New job — ${serviceLabel} in ${clientZip || clientCounty}. ` +
        `$${payout.toFixed(2)} payout. ${scheduledText}. ` +
        `Open the Pathway app to accept.`,
      )
    }
  })

  await Promise.allSettled(notifications)

  // Mark trip as dispatched in status log
  await supabase.rpc('log_trip_status', {
    p_trip_id:   trip_id,
    p_trip_type: 'errand',
    p_status:    'dispatched',
    p_note:      `Notified ${drivers.length} driver(s), zone round ${zone_round}`,
  })

  // Update zone_expansion_count if this is a re-dispatch
  if (zone_round > 1) {
    await supabase
      .from('errand_trips')
      .update({ zone_expansion_count: zone_round - 1 })
      .eq('id', trip_id)
  }

  return new Response(
    JSON.stringify({ dispatched: drivers.length, zone_round, driver_ids: drivers.map((d: any) => d.id) }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
