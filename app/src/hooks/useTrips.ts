import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type TripStatus =
  | 'pending' | 'assigned' | 'en_route' | 'completed' | 'canceled'

export type FineStatus =
  | 'pending' | 'dispatched' | 'accepted' | 'completed' | 'canceled'
  | 'departed_for_errand' | 'errand_complete' | 'delivered'
  | 'en_route_to_pickup' | 'client_picked_up' | 'arrived_at_destination'
  | 'waiting' | 'return_trip_started' | 'client_returned_home'
  // NEMT Phase 4
  | 'pre_trip_checklist_complete'
  | 'arrived_at_pickup'
  | 'pickup_signed'
  | 'departed_to_appointment'
  | 'arrived_at_appointment'
  | 'waiting_at_appointment'
  | 'arrived_at_dropoff'
  | 'dropoff_signed'

export type ServiceType = 'pharmacy_pickup' | 'grocery_run' | 'small_errand' | 'ride_and_wait'
export type BookingSource = 'navigator' | 'family_proxy' | 'sms'

export interface ErrandTrip {
  id:                      string
  client_id:               string
  driver_id:               string | null
  booked_by:               string | null
  service_type:            ServiceType
  pickup_address:          string
  destination:             string | null
  instructions:            string | null
  status:                  TripStatus
  flat_rate:               number
  driver_payout:           number | null
  stripe_charge_id:        string | null
  stripe_payment_intent_id: string | null
  refunded_amount:         number | null
  gps_start:               { lat: number; lng: number; timestamp: string } | null
  gps_end:                 { lat: number; lng: number; timestamp: string } | null
  scheduled_for:           string | null
  accepted_at:             string | null
  completed_at:            string | null
  wav_required:            boolean
  booking_source:          BookingSource
  job_details:             Record<string, unknown> | null
  zone_expansion_count:    number
  no_driver_alert_sent:    boolean
  delivery_photo_url:      string | null
  created_at:              string
  updated_at:              string
}

export interface TripStatusLog {
  id:         string
  trip_id:    string
  trip_type:  'errand' | 'nemt'
  status:     FineStatus
  changed_by: string | null
  gps_lat:    number | null
  gps_lng:    number | null
  note:       string | null
  photo_url:  string | null
  created_at: string
}

export interface SmsErrandRequest {
  id:                     string
  client_id:              string | null
  phone:                  string
  keyword:                'PICKUP' | 'RIDE'
  raw_body:               string | null
  navigator_id:           string | null
  status:                 'pending' | 'confirmed' | 'dispatched' | 'dismissed'
  trip_id:                string | null
  navigator_confirmed_at: string | null
  created_at:             string
}

export const SERVICE_LABELS: Record<ServiceType, string> = {
  pharmacy_pickup: 'Pharmacy Pickup',
  grocery_run:     'Grocery / Store Run',
  small_errand:    'Small Errand',
  ride_and_wait:   'Ride & Wait',
}

export const SERVICE_EMOJI: Record<ServiceType, string> = {
  pharmacy_pickup: '💊',
  grocery_run:     '🛒',
  small_errand:    '📦',
  ride_and_wait:   '🚗',
}

export const SERVICE_RATES: Record<ServiceType, { flat: number; payout: number }> = {
  pharmacy_pickup: { flat: 12,  payout: 9    },
  grocery_run:     { flat: 18,  payout: 13.5 },
  small_errand:    { flat: 12,  payout: 9    },
  ride_and_wait:   { flat: 35,  payout: 26.25 },
}

export const FINE_STATUS_LABELS: Partial<Record<FineStatus, string>> = {
  pending:                        'Waiting for driver',
  dispatched:                     'Finding a driver…',
  accepted:                       'Driver accepted',
  departed_for_errand:            'Driver on the way',
  errand_complete:                'Errand complete — delivering',
  delivered:                      'Delivered',
  en_route_to_pickup:             'Driver on the way',
  client_picked_up:               'Client picked up',
  arrived_at_destination:         'At destination',
  waiting:                        'Waiting at appointment',
  return_trip_started:            'Returning home',
  client_returned_home:           'Client home safely',
  completed:                      'Completed',
  canceled:                       'Canceled',
  // NEMT Phase 4
  pre_trip_checklist_complete:    'Pre-trip checklist done',
  arrived_at_pickup:              'Driver at pickup location',
  pickup_signed:                  'Client signed — trip started',
  departed_to_appointment:        'En route to appointment',
  arrived_at_appointment:         'Arrived at appointment',
  waiting_at_appointment:         'Waiting at appointment',
  arrived_at_dropoff:             'Driver at drop-off',
  dropoff_signed:                 'Client signed — trip complete',
}

// Steps in order per service type for driver UI
export const ERRAND_STATUS_STEPS: FineStatus[] = [
  'accepted', 'departed_for_errand', 'errand_complete', 'delivered', 'completed',
]

export const RIDE_STATUS_STEPS: FineStatus[] = [
  'accepted', 'en_route_to_pickup', 'client_picked_up', 'arrived_at_destination',
  'waiting', 'return_trip_started', 'client_returned_home', 'completed',
]

// NEMT execution steps — GPS + signature captured at starred steps
export const NEMT_STATUS_STEPS: FineStatus[] = [
  'accepted',
  'pre_trip_checklist_complete',  // driver completes vehicle safety checklist
  'arrived_at_pickup',            // GPS captured (≤0.25 mi proximity check)
  'pickup_signed',                // client signs → loaded miles START
  'departed_to_appointment',
  'arrived_at_appointment',       // GPS captured
  'waiting_at_appointment',
  'arrived_at_dropoff',           // GPS captured
  'dropoff_signed',               // client signs → loaded miles END
  'completed',
]

// Step labels for NEMT driver UI (what button says BEFORE pressing)
export const NEMT_STEP_CTA: Partial<Record<FineStatus, string>> = {
  accepted:                     'Begin Pre-Trip Checklist',
  pre_trip_checklist_complete:  'Arrived at Pickup',
  arrived_at_pickup:            'Capture Pickup Signature',
  pickup_signed:                'Departed to Appointment',
  departed_to_appointment:      'Arrived at Appointment',
  arrived_at_appointment:       'Waiting at Appointment',
  waiting_at_appointment:       'Arrived at Drop-off',
  arrived_at_dropoff:           'Capture Drop-off Signature',
  dropoff_signed:               'Mark Trip Complete',
}

export function useErrandTrips(clientId?: string) {
  const [trips,   setTrips]   = useState<ErrandTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('errand_trips')
      .select('*')
      .order('created_at', { ascending: false })
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) setError(error.message)
    else setTrips((data ?? []) as ErrandTrip[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { fetch() }, [fetch])

  return { trips, loading, error, refetch: fetch }
}

export function useActiveTrip(driverId: string) {
  const [trip,    setTrip]    = useState<ErrandTrip | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!driverId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('errand_trips')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'en_route'])
      .order('accepted_at', { ascending: false })
      .limit(1)
      .single()
    setTrip(data as ErrandTrip | null)
    setLoading(false)
  }, [driverId])

  useEffect(() => { fetch() }, [fetch])

  return { trip, loading, refetch: fetch }
}

export function useDriverQueue(driverId: string) {
  const [jobs,    setJobs]    = useState<ErrandTrip[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!driverId) { setLoading(false); return }
    setLoading(true)
    // Jobs in dispatch_log for this driver that are still pending
    const { data: dispatched } = await supabase
      .from('job_dispatch_log')
      .select('trip_id')
      .eq('driver_id', driverId)
      .eq('trip_type', 'errand')
      .eq('response', 'pending')

    const tripIds = (dispatched ?? []).map((d: any) => d.trip_id)
    if (tripIds.length === 0) { setJobs([]); setLoading(false); return }

    const { data } = await supabase
      .from('errand_trips')
      .select('*')
      .in('id', tripIds)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    setJobs((data ?? []) as ErrandTrip[])
    setLoading(false)
  }, [driverId])

  useEffect(() => { fetch() }, [fetch])

  return { jobs, loading, refetch: fetch }
}

export function useTripStatusLog(tripId: string, tripType: 'errand' | 'nemt') {
  const [log,     setLog]     = useState<TripStatusLog[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!tripId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('trip_status_log')
      .select('*')
      .eq('trip_id', tripId)
      .eq('trip_type', tripType)
      .order('created_at', { ascending: true })
    setLog((data ?? []) as TripStatusLog[])
    setLoading(false)
  }, [tripId, tripType])

  useEffect(() => { fetch() }, [fetch])

  return { log, loading, refetch: fetch }
}

export function useSmsErrandRequests() {
  const [requests, setRequests] = useState<SmsErrandRequest[]>([])
  const [loading,  setLoading]  = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sms_errand_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setRequests((data ?? []) as SmsErrandRequest[])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { requests, loading, refetch: fetch }
}
