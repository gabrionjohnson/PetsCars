import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'
import {
  SERVICE_LABELS,
  SERVICE_EMOJI,
  FINE_STATUS_LABELS,
  type TripStatus,
  type ServiceType,
  type TripStatusLog,
} from '../../../hooks/useTrips'

interface TripDetail {
  id:            string
  service_type:  ServiceType
  status:        TripStatus
  pickup_address: string
  destination:   string | null
  instructions:  string | null
  flat_rate:     number
  wav_required:  boolean
  scheduled_for: string | null
  booking_source: string
  job_details:   Record<string, unknown> | null
  created_at:    string
  clients: {
    name:  string
    phone: string
  } | null
  driver: {
    profiles: {
      name:  string
      phone: string
    } | null
  } | null
}

function statusColor(status: TripStatus): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (status === 'completed') return 'green'
  if (status === 'canceled')  return 'red'
  if (status === 'en_route')  return 'blue'
  if (status === 'assigned')  return 'amber'
  return 'gray'
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function formatGps(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

// Render job_details JSONB as readable key-value pairs
function JobDetailsCard({ details }: { details: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) return null

  const humanize = (key: string) =>
    key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^./, s => s.toUpperCase())
      .trim()

  const skip = new Set(['wavRequired'])

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Job Details</h3>
      </div>
      <dl className="divide-y divide-gray-100">
        {Object.entries(details)
          .filter(([k, v]) => !skip.has(k) && v !== '' && v != null)
          .map(([k, v]) => (
            <div key={k} className="px-4 py-2.5 flex gap-3">
              <dt className="text-xs text-gray-500 w-32 shrink-0 pt-0.5">{humanize(k)}</dt>
              <dd className="text-sm text-gray-900 break-words">{String(v)}</dd>
            </div>
          ))}
      </dl>
    </div>
  )
}

// Status timeline
function TimelineCard({ log }: { log: TripStatusLog[] }) {
  if (log.length === 0) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Status Timeline</h3>
      </div>
      <ol className="divide-y divide-gray-100">
        {log.map((entry, idx) => (
          <li key={entry.id} className="px-4 py-3 flex gap-3">
            <div className="flex flex-col items-center gap-1 pt-0.5">
              <div className={`w-3 h-3 rounded-full border-2 shrink-0 ${idx === log.length - 1 ? 'border-green bg-green' : 'border-gray-300 bg-white'}`} />
              {idx < log.length - 1 && <div className="w-0.5 flex-1 min-h-[16px] bg-gray-200" />}
            </div>
            <div className="flex-1 pb-2">
              <p className="text-sm font-medium text-gray-900">
                {FINE_STATUS_LABELS[entry.status] ?? entry.status.replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-gray-500">{formatDate(entry.created_at)}</p>
              {formatGps(entry.gps_lat, entry.gps_lng) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  📍 {formatGps(entry.gps_lat, entry.gps_lng)}
                </p>
              )}
              {entry.note && (
                <p className="text-xs text-gray-600 mt-0.5 italic">{entry.note}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate    = useNavigate()

  const [trip,      setTrip]      = useState<TripDetail | null>(null)
  const [log,       setLog]       = useState<TripStatusLog[]>([])
  const [loading,   setLoading]   = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [toast,     setToast]     = useState<string | null>(null)

  const loadTrip = useCallback(async () => {
    if (!tripId) return
    setLoading(true)

    const [tripRes, logRes] = await Promise.all([
      supabase
        .from('errand_trips')
        .select(`
          id, service_type, status, pickup_address, destination, instructions,
          flat_rate, wav_required, scheduled_for, booking_source, job_details, created_at,
          clients:client_id(name, phone),
          driver:driver_id(profiles(name, phone))
        `)
        .eq('id', tripId)
        .single(),
      supabase
        .from('trip_status_log')
        .select('*')
        .eq('trip_id', tripId)
        .eq('trip_type', 'errand')
        .order('created_at', { ascending: true }),
    ])

    if (tripRes.data) {
      const raw = tripRes.data as any
      setTrip({
        ...raw,
        driver: raw.driver
          ? { profiles: Array.isArray(raw.driver.profiles) ? raw.driver.profiles[0] : raw.driver.profiles }
          : null,
      } as TripDetail)
    }
    setLog((logRes.data ?? []) as TripStatusLog[])
    setLoading(false)
  }, [tripId])

  useEffect(() => { loadTrip() }, [loadTrip])

  async function cancelTrip() {
    if (!tripId || !trip) return
    setCanceling(true)

    await supabase
      .from('errand_trips')
      .update({ status: 'canceled' })
      .eq('id', tripId)

    await supabase.functions.invoke('update-trip-status', {
      body: { trip_id: tripId, status: 'canceled' },
    })

    setToast('Trip canceled.')
    loadTrip()
    setCanceling(false)
  }

  if (loading) {
    return (
      <div className="px-4 pt-6 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="px-4 pt-8 text-center text-gray-500">
        <p>Trip not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-green underline text-sm">
          Go back
        </button>
      </div>
    )
  }

  const canCancel = trip.status === 'pending' || trip.status === 'assigned'

  return (
    <div className="max-w-lg mx-auto px-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 pt-4 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          ←
        </button>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{SERVICE_EMOJI[trip.service_type]}</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              {SERVICE_LABELS[trip.service_type]}
            </h1>
            {trip.clients && (
              <p className="text-sm text-gray-500">{trip.clients.name}</p>
            )}
          </div>
        </div>
        <div className="ml-auto">
          <Badge color={statusColor(trip.status)}>
            {trip.status.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 mt-2">
        {/* Summary card */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-500">Rate</span>
            <span className="font-semibold text-gray-900">${trip.flat_rate}</span>
          </div>
          <div className="px-4 py-3 flex justify-between text-sm">
            <span className="text-gray-500">Scheduled</span>
            <span className="font-semibold text-gray-900">
              {trip.scheduled_for ? formatDate(trip.scheduled_for) : 'ASAP'}
            </span>
          </div>
          {trip.wav_required && (
            <div className="px-4 py-3 text-sm text-amber-700 font-medium">
              ♿ Wheelchair assistance required
            </div>
          )}
          {trip.booking_source && (
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-gray-500">Booked via</span>
              <span className="font-semibold text-gray-900 capitalize">
                {trip.booking_source.replace('_', ' ')}
              </span>
            </div>
          )}
        </div>

        {/* Driver card */}
        {trip.driver?.profiles && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <h3 className="font-semibold text-gray-900 mb-2">Driver</h3>
            <p className="text-sm text-gray-900">{trip.driver.profiles.name}</p>
            {trip.driver.profiles.phone && (
              <a
                href={`tel:${trip.driver.profiles.phone}`}
                className="text-sm text-green underline"
              >
                {trip.driver.profiles.phone}
              </a>
            )}
          </div>
        )}

        {/* Job Details */}
        <JobDetailsCard details={trip.job_details} />

        {/* Timeline */}
        <TimelineCard log={log} />

        {/* Cancel */}
        {canCancel && (
          <Button variant="danger" fullWidth loading={canceling} onClick={cancelTrip}>
            Cancel Trip
          </Button>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
