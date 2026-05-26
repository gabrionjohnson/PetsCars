import { useAuth } from '../../hooks/useAuth'
import { useNemtTrips, NEMT_TRIP_TYPE_EMOJI, NEMT_TRIP_TYPE_LABELS } from '../../hooks/useNemt'
import { Badge } from '../../components/ui/Badge'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function statusColor(s: string): 'gray' | 'amber' | 'blue' | 'green' | 'red' {
  if (s === 'completed') return 'green'
  if (s === 'canceled')  return 'red'
  if (s === 'en_route')  return 'blue'
  if (s === 'assigned')  return 'amber'
  return 'gray'
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={ok ? 'text-green-600' : 'text-gray-300'}>{ok ? '✓' : '○'}</span>
      <span className={ok ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
    </div>
  )
}

export function NemtPage() {
  const { user } = useAuth()
  const [clientId, setClientId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('family_proxies')
      .select('client_id')
      .eq('id', user.id)
      .single()
      .then(({ data }) => { if (data) setClientId(data.client_id) })
  }, [user])

  const { trips, loading } = useNemtTrips(clientId ?? undefined)

  const upcoming  = trips.filter(t => t.status === 'pending' || t.status === 'assigned')
  const active    = trips.filter(t => t.status === 'en_route')
  const completed = trips.filter(t => t.status === 'completed' || t.status === 'canceled')

  if (loading || !clientId) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Medical Trips</h2>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-sm text-blue-800">
          To schedule a NEMT trip for your family member, contact their care navigator.
        </p>
      </div>

      {/* Active trips */}
      {active.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-2">Active Now</h3>
          <ul className="space-y-3">
            {active.map(trip => (
              <li key={trip.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{NEMT_TRIP_TYPE_EMOJI[trip.trip_type]}</span>
                  <span className="font-semibold text-gray-900">{NEMT_TRIP_TYPE_LABELS[trip.trip_type]}</span>
                  <Badge color="blue">En route</Badge>
                </div>
                <p className="text-sm text-gray-700">{trip.pickup_address}</p>
                <p className="text-xs text-gray-500 mt-0.5">→ {trip.appointment_address}</p>
                <div className="mt-3 grid grid-cols-2 gap-1">
                  <Check ok={trip.pre_trip_checklist_completed} label="Safety check" />
                  <Check ok={!!trip.pickup_signature_url} label="Pickup signed" />
                  <Check ok={!!trip.gps_pickup_coords}    label="GPS logged" />
                  <Check ok={!!trip.dropoff_signature_url} label="Drop-off signed" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-2">Upcoming</h3>
          <ul className="space-y-3">
            {upcoming.map(trip => (
              <li key={trip.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span>{NEMT_TRIP_TYPE_EMOJI[trip.trip_type]}</span>
                      <span className="font-semibold text-sm text-gray-900">{NEMT_TRIP_TYPE_LABELS[trip.trip_type]}</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{fmt(trip.scheduled_datetime)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{trip.pickup_address}</p>
                    {trip.appointment_provider && (
                      <p className="text-xs text-gray-500 mt-0.5">{trip.appointment_provider}</p>
                    )}
                  </div>
                  <Badge color={statusColor(trip.status)}>
                    {trip.status === 'pending'  ? 'Scheduled' : 'Driver assigned'}
                  </Badge>
                </div>
                {trip.return_included && (
                  <p className="text-xs text-gray-500 mt-2">↩ Return trip included</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-2">Past Trips</h3>
          <ul className="space-y-2">
            {completed.slice(0, 10).map(trip => (
              <li key={trip.id} className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{NEMT_TRIP_TYPE_EMOJI[trip.trip_type]}</span>
                    <div>
                      <p className="text-sm text-gray-700">{fmt(trip.scheduled_datetime)}</p>
                      {trip.appointment_provider && (
                        <p className="text-xs text-gray-400">{trip.appointment_provider}</p>
                      )}
                    </div>
                  </div>
                  <Badge color={statusColor(trip.status)}>
                    {trip.status === 'completed' ? 'Done' : 'Canceled'}
                  </Badge>
                </div>
                {trip.status === 'completed' && (
                  <div className="mt-2 flex gap-3">
                    <Check ok={!!trip.pickup_signature_url} label="Pickup signed" />
                    <Check ok={!!trip.dropoff_signature_url} label="Drop-off signed" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {trips.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🏥</p>
          <p className="font-medium text-gray-500">No medical trips scheduled.</p>
          <p className="text-sm mt-1 text-gray-400">Contact the care navigator to book one.</p>
        </div>
      )}
    </div>
  )
}
