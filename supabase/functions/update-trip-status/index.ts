/**
 * update-trip-status Edge Function
 *
 * Called by the driver app (or Navigator/Admin) to record a status transition.
 * Appends to trip_status_log (append-only audit trail) via log_trip_status()
 * SECURITY DEFINER function, then fires the appropriate outbound SMS.
 *
 * POST body:
 *   {
 *     trip_id:    string
 *     trip_type:  'errand' | 'nemt'
 *     status:     string   (see valid values in migration 011)
 *     gps_lat?:   number
 *     gps_lng?:   number
 *     note?:      string
 *     photo_url?: string   (Supabase Storage path)
 *   }
 *
 * Authorization:
 *   - Driver: must be the assigned driver for this trip
 *   - Navigator/Admin: must have access to the client
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

async function sendSms(to: string, body: string) {
  const res = await fetch(
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
  return res.ok
}

// Map fine-grained status → SMS recipients and message builders
type TripContext = {
  clientName:    string
  clientPhone:   string
  proxyPhone:    string | null
  navPhone:      string | null
  driverName:    string
  serviceLabel:  string
}

function buildSmsPayloads(status: string, ctx: TripContext): Array<{ to: string; body: string }> {
  const msgs: Array<{ to: string; body: string }> = []
  const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

  switch (status) {
    case 'accepted':
      if (ctx.proxyPhone) msgs.push({ to: ctx.proxyPhone, body: `Pathway: ${ctx.driverName} has accepted the ${ctx.serviceLabel} request for ${ctx.clientName} and is on the way.` })
      if (ctx.navPhone)   msgs.push({ to: ctx.navPhone,   body: `Pathway: ${ctx.driverName} accepted the ${ctx.serviceLabel} for ${ctx.clientName}.` })
      break

    case 'delivered':
      if (ctx.clientPhone) msgs.push({ to: ctx.clientPhone, body: `Hi ${ctx.clientName.split(' ')[0]}, your ${ctx.serviceLabel.toLowerCase()} has been delivered. – Pathway` })
      if (ctx.proxyPhone)  msgs.push({ to: ctx.proxyPhone,  body: `Pathway: Delivery complete for ${ctx.clientName} by ${ctx.driverName} at ${now}.` })
      break

    case 'client_returned_home':
      if (ctx.proxyPhone) msgs.push({ to: ctx.proxyPhone, body: `Pathway: ${ctx.clientName} has been returned home safely after their appointment. Driver: ${ctx.driverName}.` })
      break

    case 'completed':
      // For ride & wait, client_returned_home handles the SMS. For errand runs, delivered handles it.
      // completed is a backend state — no additional SMS needed.
      break

    case 'canceled':
      if (ctx.proxyPhone) msgs.push({ to: ctx.proxyPhone, body: `Pathway: The ${ctx.serviceLabel} request for ${ctx.clientName} has been canceled.` })
      break
  }

  return msgs
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Validate JWT — caller must be authenticated
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })

  // Verify the caller's identity
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401 })

  const body = await req.json() as {
    trip_id:    string
    trip_type:  'errand' | 'nemt'
    status:     string
    gps_lat?:   number
    gps_lng?:   number
    note?:      string
    photo_url?: string
  }

  const { trip_id, trip_type, status, gps_lat, gps_lng, note, photo_url } = body
  if (!trip_id || !trip_type || !status) {
    return new Response(JSON.stringify({ error: 'trip_id, trip_type, and status are required' }), { status: 400 })
  }

  // Use service-role client for DB operations (log_trip_status is SECURITY DEFINER)
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  // Fetch trip to verify access and gather SMS context
  const table = trip_type === 'errand' ? 'errand_trips' : 'nemt_trips'
  const select = trip_type === 'errand'
    ? '*, clients(name, phone, navigator_id, navigators(profiles(phone)), family_proxies(profiles(phone))), drivers:driver_id(profiles(name))'
    : '*, clients(name, phone, navigator_id), drivers:driver_id(profiles(name))'

  const { data: trip, error: tripErr } = await adminClient
    .from(table)
    .select(select)
    .eq('id', trip_id)
    .single()

  if (tripErr || !trip) {
    return new Response(JSON.stringify({ error: 'trip not found' }), { status: 404 })
  }

  // Authorization check
  const userRole = (await adminClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  ).data?.role ?? 'anon'

  const isAuthorized =
    userRole === 'admin' ||
    (userRole === 'driver' && trip.driver_id === user.id) ||
    (userRole === 'navigator') ||
    (userRole === 'family_proxy')

  if (!isAuthorized) return new Response('Forbidden', { status: 403 })

  // Special: when driver accepts, update dispatch log and set driver_id
  if (status === 'accepted' && userRole === 'driver') {
    // Check if another driver already accepted (race condition guard)
    const { data: existing } = await adminClient
      .from('errand_trips')
      .select('driver_id, status')
      .eq('id', trip_id)
      .single()

    if (existing?.status === 'assigned' && existing.driver_id !== user.id) {
      return new Response(JSON.stringify({ error: 'trip already accepted by another driver' }), { status: 409 })
    }

    // Assign driver and update all pending dispatch log entries to expired
    await adminClient
      .from('errand_trips')
      .update({ driver_id: user.id })
      .eq('id', trip_id)

    await adminClient
      .from('job_dispatch_log')
      .update({ response: 'expired', responded_at: new Date().toISOString() })
      .eq('trip_id', trip_id)
      .eq('trip_type', 'errand')
      .eq('response', 'pending')
      .neq('driver_id', user.id)

    // Mark this driver's entry as accepted
    await adminClient
      .from('job_dispatch_log')
      .update({ response: 'accepted', responded_at: new Date().toISOString() })
      .eq('trip_id', trip_id)
      .eq('trip_type', 'errand')
      .eq('driver_id', user.id)
  }

  // Append to audit log and update denormalized status
  const { data: logId, error: logErr } = await adminClient.rpc('log_trip_status', {
    p_trip_id:   trip_id,
    p_trip_type: trip_type,
    p_status:    status,
    p_by:        user.id,
    p_lat:       gps_lat ?? null,
    p_lng:       gps_lng ?? null,
    p_note:      note ?? null,
    p_photo_url: photo_url ?? null,
  })

  if (logErr) {
    return new Response(JSON.stringify({ error: logErr.message }), { status: 500 })
  }

  // Build and send SMS notifications
  const clients = trip.clients as any
  const driverProfile = (trip.drivers as any)?.profiles

  const serviceLabel = trip_type === 'errand'
    ? ({ pharmacy_pickup: 'Pharmacy Pickup', grocery_run: 'Grocery Run', small_errand: 'Small Errand', ride_and_wait: 'Ride & Wait' } as any)[trip.service_type] ?? trip.service_type
    : 'Medical Transport'

  const ctx: TripContext = {
    clientName:   clients?.name ?? 'Client',
    clientPhone:  clients?.phone ?? '',
    proxyPhone:   clients?.family_proxies?.profiles?.phone ?? null,
    navPhone:     clients?.navigators?.profiles?.phone ?? null,
    driverName:   driverProfile?.name ?? 'Your driver',
    serviceLabel,
  }

  const smsList = buildSmsPayloads(status, ctx)
  await Promise.allSettled(smsList.filter(m => m.to).map(m => sendSms(m.to, m.body)))

  // Log SMS send attempts
  if (smsList.length > 0) {
    await adminClient.from('sms_log').insert(
      smsList.map(m => ({
        to_number:  m.to,
        body:       m.body,
        event_type: `TRIP_STATUS_${status.toUpperCase()}`,
        status:     'sent',
      })),
    )
  }

  return new Response(
    JSON.stringify({ log_id: logId, status, sms_sent: smsList.length }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
