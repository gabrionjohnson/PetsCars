import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useNemtTrip, NEMT_TRIP_TYPE_EMOJI, NEMT_TRIP_TYPE_LABELS } from '../../../hooks/useNemt'
import { useTripStatusLog, FINE_STATUS_LABELS } from '../../../hooks/useTrips'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'

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
    <div className="flex items-center gap-2">
      <span className={ok ? 'text-green-600' : 'text-amber-500'}>{ok ? '✓' : '✗'}</span>
      <span className={`text-sm ${ok ? 'text-gray-700' : 'text-amber-700'}`}>{label}</span>
    </div>
  )
}

export function NemtTripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate   = useNavigate()
  const id = tripId ?? ''

  const { trip, loading, refetch } = useNemtTrip(id)
  const { log,  loading: logLoading } = useTripStatusLog(id, 'nemt')

  const [toast,       setToast]       = useState<string | null>(null)
  const [drafting,    setDrafting]    = useState(false)
  const [editMiles,   setEditMiles]   = useState(false)
  const [miles,       setMiles]       = useState('')
  const [savingMiles, setSavingMiles] = useState(false)

  async function generateDraft() {
    setDrafting(true)
    const { error } = await supabase.rpc('generate_nemt_claim_draft', { p_trip_id: id })
    if (error) setToast(`Error: ${error.message}`)
    else { setToast('Claim draft created — visible in admin claims queue.'); refetch() }
    setDrafting(false)
  }

  async function saveMiles() {
    const val = parseFloat(miles)
    if (isNaN(val) || val <= 0) { setToast('Enter a valid mileage value.'); return }
    setSavingMiles(true)
    const { error } = await supabase
      .from('nemt_trips')
      .update({ loaded_miles: val, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) setToast(`Error: ${error.message}`)
    else { setToast('Loaded miles saved.'); setEditMiles(false); refetch() }
    setSavingMiles(false)
  }

  if (loading) {
    return <div className="p-4 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
  }

  if (!trip) {
    return <div className="p-4 text-gray-500">Trip not found.</div>
  }

  const complianceOk = {
    gpsPickup:   !!trip.gps_pickup_coords,
    gpsDropoff:  !!trip.gps_dropoff_coords,
    pickupSig:   !!trip.pickup_signature_url,
    dropoffSig:  !!trip.dropoff_signature_url,
    checklist:   trip.pre_trip_checklist_completed,
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-lg">←</button>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{NEMT_TRIP_TYPE_EMOJI[trip.trip_type]}</span>
            <h2 className="text-lg font-bold text-gray-900">{NEMT_TRIP_TYPE_LABELS[trip.trip_type]} Trip</h2>
            <Badge color={statusColor(trip.status)}>
              {trip.status === 'pending'   ? 'Pending'   :
               trip.status === 'assigned'  ? 'Driver assigned' :
               trip.status === 'en_route'  ? 'En route'  :
               trip.status === 'completed' ? 'Completed' : 'Canceled'}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">{fmt(trip.scheduled_datetime)}</p>
        </div>
      </div>

      {/* Trip info */}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        <div className="px-4 py-3">
          <p className="text-xs text-gray-500">Pickup</p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{trip.pickup_address}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-500">Destination</p>
          <p className="text-sm font-medium text-gray-900 mt-0.5">{trip.appointment_address}</p>
          {trip.appointment_provider && <p className="text-xs text-gray-500 mt-0.5">{trip.appointment_provider}</p>}
          {trip.appointment_type && <p className="text-xs text-gray-400">{trip.appointment_type}</p>}
        </div>
        {trip.medicaid_id && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500">Medicaid ID</p>
            <p className="text-sm font-mono text-gray-900 mt-0.5">{trip.medicaid_id}</p>
          </div>
        )}
        {trip.assistance_needed && (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500">Assistance</p>
            <p className="text-sm text-gray-700 mt-0.5">{trip.assistance_needed}</p>
          </div>
        )}
      </div>

      {/* Compliance */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Compliance Evidence</h3>
        <div className="space-y-2">
          <Check ok={complianceOk.checklist}  label="Pre-trip checklist" />
          <Check ok={complianceOk.gpsPickup}  label="GPS at pickup" />
          <Check ok={complianceOk.pickupSig}  label="Pickup signature" />
          <Check ok={complianceOk.gpsDropoff} label="GPS at drop-off" />
          <Check ok={complianceOk.dropoffSig} label="Drop-off signature" />
        </div>
      </div>

      {/* Loaded miles */}
      {trip.status === 'completed' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900">Loaded Miles</h3>
            {!editMiles && (
              <button onClick={() => { setEditMiles(true); setMiles(trip.loaded_miles?.toString() ?? '') }}
                className="text-xs text-[#1a5c38] font-medium">Edit</button>
            )}
          </div>
          {trip.loaded_miles == null && !editMiles && (
            <p className="text-amber-700 text-sm">⚠ Not yet entered — required for claim.</p>
          )}
          {!editMiles && trip.loaded_miles != null && (
            <p className="text-2xl font-bold text-gray-900">{trip.loaded_miles} mi</p>
          )}
          {editMiles && (
            <div className="flex gap-2 items-center">
              <input
                type="number" step="0.1" min="0.1"
                value={miles}
                onChange={e => setMiles(e.target.value)}
                placeholder="0.0"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
              />
              <span className="text-sm text-gray-500">miles (loaded only)</span>
              <Button variant="primary" onClick={saveMiles} loading={savingMiles} className="text-sm py-2 px-4 min-h-0">Save</Button>
              <button onClick={() => setEditMiles(false)} className="text-sm text-gray-500">Cancel</button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-2">Georgia DCH: loaded miles only — pickup signature to drop-off signature.</p>
        </div>
      )}

      {/* Claim draft */}
      {trip.status === 'completed' && !trip.claim_draft_generated_at && (
        <Button fullWidth onClick={generateDraft} loading={drafting}>
          Generate Claim Draft
        </Button>
      )}
      {trip.claim_draft_generated_at && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="text-sm text-green-800 font-medium">✓ Claim draft generated</p>
          <p className="text-xs text-green-700">Visible in admin claims queue for approval.</p>
        </div>
      )}

      {/* Audit log */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Status History</h3>
        </div>
        {logLoading ? (
          <div className="p-4 text-sm text-gray-400">Loading…</div>
        ) : log.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">No status entries yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {log.map(entry => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {FINE_STATUS_LABELS[entry.status] ?? entry.status}
                    </p>
                    {entry.note && <p className="text-xs text-gray-500 mt-0.5">{entry.note}</p>}
                    {(entry.gps_lat != null && entry.gps_lng != null) && (
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        GPS: {entry.gps_lat.toFixed(5)}, {entry.gps_lng.toFixed(5)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(entry.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
