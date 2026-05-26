import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type NemtTripType = 'ambulatory' | 'wheelchair' | 'stretcher'
export type NemtClaimStatus =
  | 'draft' | 'ready_to_submit' | 'submitted' | 'paid' | 'denied' | 'needs_resubmission'

export interface NemtTrip {
  id:                          string
  client_id:                   string
  driver_id:                   string | null
  booked_by:                   string | null
  trip_type:                   NemtTripType
  pickup_address:              string
  appointment_address:         string
  appointment_provider:        string | null
  appointment_type:            string | null
  appointment_type_other:      string | null
  scheduled_datetime:          string
  return_included:             boolean
  return_pickup_time:          string | null
  medicaid_id:                 string
  base_fee:                    number | null
  loaded_miles:                number | null
  mileage_rate:                number | null
  total_billed:                number | null
  gps_pickup_coords:           { lat: number; lng: number } | null
  gps_dropoff_coords:          { lat: number; lng: number } | null
  appointment_gps:             { lat: number; lng: number } | null
  pickup_timestamp:            string | null
  dropoff_timestamp:           string | null
  pickup_signature_url:        string | null
  dropoff_signature_url:       string | null
  member_signature_url:        string | null
  pre_trip_checklist_completed: boolean
  pre_trip_checklist_at:       string | null
  claim_status:                string
  claim_draft_generated_at:    string | null
  verida_claim_id:             string | null
  verida_submission_date:      string | null
  paid_amount:                 number | null
  denial_reason:               string | null
  status:                      string
  booking_source:              string | null
  estimated_duration_min:      number | null
  assistance_needed:           string | null
  recurring_series_id:         string | null
  occurrence_number:           number | null
  created_at:                  string
  updated_at:                  string
}

export interface NemtClaim {
  id:                          string
  trip_id:                     string
  client_id:                   string
  driver_id:                   string | null
  trip_type:                   NemtTripType
  trip_date:                   string
  pickup_address:              string
  appointment_address:         string
  appointment_provider:        string | null
  appointment_type:            string | null
  medicaid_id:                 string
  base_fee:                    number
  loaded_miles:                number | null
  mileage_rate:                number
  total_billed:                number | null
  gps_pickup_coords:           { lat: number; lng: number } | null
  gps_dropoff_coords:          { lat: number; lng: number } | null
  appointment_gps:             { lat: number; lng: number } | null
  pickup_signature_url:        string | null
  dropoff_signature_url:       string | null
  pre_trip_checklist_completed: boolean
  status:                      NemtClaimStatus
  admin_approved_by:           string | null
  admin_approved_at:           string | null
  verida_claim_id:             string | null
  submitted_by:                string | null
  submitted_at:                string | null
  verida_submission_date:      string | null
  paid_amount:                 number | null
  paid_at:                     string | null
  denial_reason:               string | null
  denied_at:                   string | null
  resubmission_count:          number
  admin_notes:                 string | null
  created_at:                  string
  updated_at:                  string
}

export interface NemtRecurringSeries {
  id:                    string
  client_id:             string
  booked_by:             string | null
  trip_type:             NemtTripType
  pickup_address:        string
  appointment_address:   string
  appointment_provider:  string | null
  appointment_type:      string | null
  assistance_needed:     string | null
  return_included:       boolean
  frequency:             'weekly' | 'biweekly' | 'monthly'
  day_of_week:           number | null
  appointment_time:      string
  return_offset_minutes: number | null
  active:                boolean
  series_start_date:     string
  series_end_date:       string | null
  next_occurrence_date:  string | null
  occurrence_count:      number
  medicaid_id:           string
  created_at:            string
  updated_at:            string
}

export interface SavedProvider {
  id:         string
  client_id:  string
  name:       string
  address:    string
  phone:      string | null
  specialty:  string | null
  is_default: boolean
  created_at: string
}

export const NEMT_TRIP_TYPE_LABELS: Record<NemtTripType, string> = {
  ambulatory: 'Ambulatory',
  wheelchair: 'Wheelchair',
  stretcher:  'Stretcher',
}

export const NEMT_TRIP_TYPE_EMOJI: Record<NemtTripType, string> = {
  ambulatory: '🚶',
  wheelchair: '♿',
  stretcher:  '🛏',
}

export const NEMT_CLAIM_STATUS_LABELS: Record<NemtClaimStatus, string> = {
  draft:              'Draft',
  ready_to_submit:    'Ready to Submit',
  submitted:          'Submitted',
  paid:               'Paid',
  denied:             'Denied',
  needs_resubmission: 'Needs Resubmission',
}

export const NEMT_CLAIM_STATUS_COLOR: Record<NemtClaimStatus, string> = {
  draft:              'gray',
  ready_to_submit:    'blue',
  submitted:          'amber',
  paid:               'green',
  denied:             'red',
  needs_resubmission: 'orange',
}

export const APPOINTMENT_TYPES = [
  'Primary Care', 'Specialist', 'Dialysis', 'Chemotherapy',
  'Mental Health', 'Physical Therapy', 'Dental', 'Lab / Imaging',
  'Pharmacy', 'Other',
] as const

// ── Hooks ─────────────────────────────────────────────────────────────────

export function useNemtTrips(clientId?: string) {
  const [trips,   setTrips]   = useState<NemtTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('nemt_trips')
      .select('*')
      .order('scheduled_datetime', { ascending: false })
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) setError(error.message)
    else setTrips((data ?? []) as NemtTrip[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  return { trips, loading, error, refetch: load }
}

export function useNemtTrip(tripId: string) {
  const [trip,    setTrip]    = useState<NemtTrip | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!tripId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('nemt_trips')
      .select('*')
      .eq('id', tripId)
      .single()
    setTrip(data as NemtTrip | null)
    setLoading(false)
  }, [tripId])

  useEffect(() => { load() }, [load])

  return { trip, loading, refetch: load }
}

export function useActiveNemtTrip(driverId: string) {
  const [trip,    setTrip]    = useState<NemtTrip | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!driverId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('nemt_trips')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'en_route'])
      .order('scheduled_datetime', { ascending: true })
      .limit(1)
      .maybeSingle()
    setTrip(data as NemtTrip | null)
    setLoading(false)
  }, [driverId])

  useEffect(() => { load() }, [load])

  return { trip, loading, refetch: load }
}

export function useNemtClaims(statusFilter?: NemtClaimStatus | NemtClaimStatus[]) {
  const [claims,  setClaims]  = useState<NemtClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('nemt_claims')
      .select('*')
      .order('created_at', { ascending: false })
    if (statusFilter) {
      const statuses = Array.isArray(statusFilter) ? statusFilter : [statusFilter]
      q = q.in('status', statuses)
    }
    const { data, error } = await q
    if (error) setError(error.message)
    else setClaims((data ?? []) as NemtClaim[])
    setLoading(false)
  }, [JSON.stringify(statusFilter)])

  useEffect(() => { load() }, [load])

  return { claims, loading, error, refetch: load }
}

export function useNemtClaim(claimId: string) {
  const [claim,   setClaim]   = useState<NemtClaim | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!claimId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('nemt_claims')
      .select('*')
      .eq('id', claimId)
      .single()
    setClaim(data as NemtClaim | null)
    setLoading(false)
  }, [claimId])

  useEffect(() => { load() }, [load])

  return { claim, loading, refetch: load }
}

export function useNemtRecurringSeries(clientId?: string) {
  const [series,  setSeries]  = useState<NemtRecurringSeries[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('nemt_recurring_series')
      .select('*')
      .eq('active', true)
      .order('next_occurrence_date', { ascending: true })
    if (clientId) q = q.eq('client_id', clientId)
    const { data } = await q
    setSeries((data ?? []) as NemtRecurringSeries[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  return { series, loading, refetch: load }
}

export function useSavedProviders(clientId: string) {
  const [providers, setProviders] = useState<SavedProvider[]>([])
  const [loading,   setLoading]   = useState(true)

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('saved_providers')
      .select('*')
      .eq('client_id', clientId)
      .order('is_default', { ascending: false })
    setProviders((data ?? []) as SavedProvider[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  return { providers, loading, refetch: load }
}
