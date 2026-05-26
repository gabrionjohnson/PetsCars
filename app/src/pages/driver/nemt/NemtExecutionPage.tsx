import { useState, useCallback } from 'react'
import {
  NEMT_STATUS_STEPS,
  NEMT_STEP_CTA,
  FINE_STATUS_LABELS,
  type FineStatus,
} from '../../../hooks/useTrips'
import {
  useNemtTrip,
  NEMT_TRIP_TYPE_LABELS,
  NEMT_TRIP_TYPE_EMOJI,
  type NemtTrip,
} from '../../../hooks/useNemt'
import {
  enqueueTripStatus,
  enqueueNemtSignature,
  enqueueNemtChecklist,
} from '../../../lib/db'
import { SignaturePad } from '../../../components/SignaturePad'
import { useOffline } from '../../../hooks/useOffline'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/Badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface GpsCoords {
  lat: number
  lng: number
}

// ---------------------------------------------------------------------------
// GPS capture helper
// ---------------------------------------------------------------------------
async function captureGps(): Promise<GpsCoords | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, enableHighAccuracy: true },
    )
  })
}

function formatCoords(coords: GpsCoords): string {
  return `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Pre-trip checklist items
// ---------------------------------------------------------------------------
interface ChecklistItem {
  key: string
  label: string
  wavOnly?: boolean
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: 'fuel',       label: 'Vehicle fuel ≥ ¼ tank' },
  { key: 'tires',      label: 'Tires properly inflated, no visible damage' },
  { key: 'windshield', label: 'Windshield and mirrors clean' },
  { key: 'seatbelts',  label: 'Seat belts operational for all positions' },
  { key: 'firstaid',   label: 'First aid kit present' },
  { key: 'interior',   label: 'Vehicle interior clean' },
  { key: 'wav_ramp',   label: 'WAV ramp/lift operational', wavOnly: true },
  { key: 'license',    label: "Driver's license and insurance in vehicle" },
]

// ---------------------------------------------------------------------------
// PreTripChecklist component
// ---------------------------------------------------------------------------
interface PreTripChecklistProps {
  tripId:   string
  hasWav:   boolean
  onDone:   () => void
}

function PreTripChecklist({ tripId, hasWav, onDone }: PreTripChecklistProps) {
  const visibleItems = CHECKLIST_ITEMS.filter(item => !item.wavOnly || hasWav)
  const [answers, setAnswers] = useState<Record<string, boolean>>(
    Object.fromEntries(visibleItems.map(i => [i.key, false])),
  )
  const [submitting, setSubmitting] = useState(false)

  const allChecked = visibleItems.every(item => answers[item.key])

  function toggle(key: string) {
    setAnswers(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleSubmit() {
    if (!allChecked) return
    setSubmitting(true)
    try {
      await enqueueNemtChecklist(tripId, answers)
      await enqueueTripStatus(tripId, 'nemt', 'pre_trip_checklist_complete')
      onDone()
    } catch (err) {
      console.error('Pre-trip checklist submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
      <h3 className="font-semibold text-gray-900">Pre-Trip Vehicle Safety Checklist</h3>
      <p className="text-sm text-gray-500">
        All items must be confirmed before the trip can begin.
      </p>

      <div className="space-y-3">
        {visibleItems.map(item => (
          <label
            key={item.key}
            className="flex items-center gap-3 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={answers[item.key] ?? false}
              onChange={() => toggle(item.key)}
              className="w-5 h-5 rounded accent-[#1a5c38] cursor-pointer shrink-0"
            />
            <span className={`text-sm ${answers[item.key] ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
              {item.label}
            </span>
          </label>
        ))}
      </div>

      <Button
        fullWidth
        onClick={handleSubmit}
        loading={submitting}
        disabled={!allChecked || submitting}
      >
        Complete Checklist →
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// GPS Capture panel
// ---------------------------------------------------------------------------
interface GpsCaptureProps {
  label:    string
  onConfirm: (coords: GpsCoords) => void
}

function GpsCapturePanel({ label, onConfirm }: GpsCaptureProps) {
  const [capturing, setCapturing] = useState(false)
  const [coords, setCoords]       = useState<GpsCoords | null>(null)
  const [error, setError]         = useState<string | null>(null)

  async function handleCapture() {
    setCapturing(true)
    setError(null)
    const result = await captureGps()
    if (result) {
      setCoords(result)
    } else {
      setError('Could not get location. Make sure location access is enabled.')
    }
    setCapturing(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <p className="text-sm font-medium text-gray-700">{label}</p>

      {!coords && (
        <Button
          fullWidth
          variant="secondary"
          onClick={handleCapture}
          loading={capturing}
          disabled={capturing}
        >
          {capturing ? 'Capturing GPS…' : '📍 Capture GPS Location'}
        </Button>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {coords && (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800">
            <span className="font-medium">📍 Location captured:</span>
            <br />
            <code className="text-xs">{formatCoords(coords)}</code>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setCoords(null); setError(null) }}
              className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-semibold min-h-[48px]"
            >
              Recapture
            </button>
            <Button className="flex-1" onClick={() => onConfirm(coords)}>
              Confirm Location ✓
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main NemtExecutionPage
// ---------------------------------------------------------------------------
interface NemtExecutionPageProps {
  trip: NemtTrip
  onRefetch: () => void
}

export function NemtExecutionPage({ trip, onRefetch }: NemtExecutionPageProps) {
  const { isOffline } = useOffline()
  // Use the live trip from the hook for reactive updates after status changes
  const { trip: liveTripData, refetch: refetchTrip } = useNemtTrip(trip.id)
  const liveTrip = liveTripData ?? trip

  const [advancing, setAdvancing] = useState(false)
  // Local UI state — which special sub-panel is active
  const [showChecklist, setShowChecklist]           = useState(false)
  const [gpsConfirmed, setGpsConfirmed]             = useState<GpsCoords | null>(null)
  const [showSignaturePad, setShowSignaturePad]     = useState(false)
  const [signatureCaptured, setSignatureCaptured]   = useState(false)
  const [, setCapturedSignatureUrl] = useState<string | null>(null)

  const currentStatus = liveTrip.status as FineStatus
  const currentIdx    = NEMT_STATUS_STEPS.indexOf(currentStatus)
  const nextStatus    = NEMT_STATUS_STEPS[currentIdx + 1] ?? null
  const isComplete    = currentStatus === 'completed' || currentStatus === 'canceled'

  // Reset sub-panel state whenever the trip status changes
  const resetLocalState = useCallback(() => {
    setShowChecklist(false)
    setGpsConfirmed(null)
    setShowSignaturePad(false)
    setSignatureCaptured(false)
    setCapturedSignatureUrl(null)
  }, [])

  async function advanceStatus(status: FineStatus, opts?: { gpsLat?: number; gpsLng?: number }) {
    setAdvancing(true)
    try {
      if (isOffline) {
        await enqueueTripStatus(trip.id, 'nemt', status, opts)
      } else {
        const { error } = await supabase.functions.invoke('update-trip-status', {
          body: {
            trip_id:   trip.id,
            trip_type: 'nemt',
            status,
            gps_lat:   opts?.gpsLat ?? null,
            gps_lng:   opts?.gpsLng ?? null,
          },
        })
        if (error) throw error
      }
      resetLocalState()
      await refetchTrip()
      onRefetch()
    } catch (err) {
      console.error('NEMT status advance failed:', err)
    } finally {
      setAdvancing(false)
    }
  }

  // ── Step: accepted → show checklist, then auto-advance after checklist done
  async function handleChecklistDone() {
    resetLocalState()
    await refetchTrip()
    onRefetch()
  }

  // ── Steps requiring GPS: arrived_at_pickup, arrived_at_appointment, arrived_at_dropoff
  const gpsSteps: FineStatus[] = ['arrived_at_pickup', 'arrived_at_appointment', 'arrived_at_dropoff']
  // ── Steps requiring signature after GPS: arrived_at_pickup → pickup_signed, arrived_at_dropoff → dropoff_signed
  const signatureSteps: FineStatus[] = ['arrived_at_pickup', 'arrived_at_dropoff']

  function requiresGps(status: FineStatus): boolean {
    return gpsSteps.includes(status)
  }

  function requiresSignature(status: FineStatus): boolean {
    return signatureSteps.includes(status)
  }

  async function handleSignatureCapture(dataUrl: string) {
    const sigType = currentStatus === 'arrived_at_pickup' ? 'pickup' : 'dropoff'
    try {
      await enqueueNemtSignature(trip.id, sigType, dataUrl)
      // Attempt immediate upload (non-blocking — offline queue will handle it)
      setCapturedSignatureUrl(dataUrl)
      setSignatureCaptured(true)
      setShowSignaturePad(false)
    } catch (err) {
      console.error('Signature enqueue failed:', err)
    }
  }

  async function handleMainCta() {
    if (!nextStatus) return

    // Step: accepted → show checklist UI
    if (currentStatus === 'accepted') {
      setShowChecklist(true)
      return
    }

    // Steps that need GPS first
    if (requiresGps(currentStatus)) {
      // GPS not yet confirmed → show GPS panel (already showing)
      if (!gpsConfirmed) return

      // GPS confirmed; if step also needs signature, show signature pad next
      if (requiresSignature(currentStatus)) {
        if (!signatureCaptured) {
          setShowSignaturePad(true)
          return
        }
        // Both GPS + signature done → advance
        await advanceStatus(nextStatus, { gpsLat: gpsConfirmed.lat, gpsLng: gpsConfirmed.lng })
        return
      }

      // GPS-only step (arrived_at_appointment)
      await advanceStatus(nextStatus, { gpsLat: gpsConfirmed.lat, gpsLng: gpsConfirmed.lng })
      return
    }

    // All other steps — plain advance
    await advanceStatus(nextStatus)
  }

  // Determine whether the main CTA button should be disabled
  function isCtaDisabled(): boolean {
    if (advancing) return true
    if (currentStatus === 'accepted') return false // will show checklist
    if (requiresGps(currentStatus) && !gpsConfirmed) return true
    if (requiresSignature(currentStatus) && gpsConfirmed && !signatureCaptured) return true
    return false
  }

  const ctaLabel = (() => {
    if (currentStatus === 'accepted') return 'Begin Pre-Trip Checklist'
    if (requiresGps(currentStatus) && !gpsConfirmed) return '📍 Confirm GPS First'
    if (requiresSignature(currentStatus) && gpsConfirmed && !signatureCaptured) return '✍️ Capture Signature First'
    if (nextStatus) return `${NEMT_STEP_CTA[currentStatus] ?? 'Next Step'} →`
    return 'Trip Complete'
  })()

  const typeEmoji = NEMT_TRIP_TYPE_EMOJI[liveTrip.trip_type] ?? '🚑'
  const typeLabel = NEMT_TRIP_TYPE_LABELS[liveTrip.trip_type] ?? liveTrip.trip_type

  const hasWav = liveTrip.trip_type === 'wheelchair' || liveTrip.trip_type === 'stretcher'

  return (
    <div className="p-4 space-y-4">
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          📶 Offline — status updates will sync when you reconnect.
        </div>
      )}

      {/* ── Trip header ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">{typeEmoji}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900 text-lg">{typeLabel}</span>
              <Badge color="blue">NEMT</Badge>
            </div>
            <p className="text-sm text-gray-500">
              {formatDateTime(liveTrip.scheduled_datetime)}
            </p>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-500 shrink-0">Pickup:</span>
            <span className="text-gray-900 font-medium">{liveTrip.pickup_address}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 shrink-0">Appt:</span>
            <span className="text-gray-900 font-medium">{liveTrip.appointment_address}</span>
          </div>
          {liveTrip.appointment_provider && (
            <div className="flex gap-2">
              <span className="text-gray-500 shrink-0">Provider:</span>
              <span className="text-gray-900">{liveTrip.appointment_provider}</span>
            </div>
          )}
          {liveTrip.appointment_type && (
            <div className="flex gap-2">
              <span className="text-gray-500 shrink-0">Type:</span>
              <span className="text-gray-900">{liveTrip.appointment_type}</span>
            </div>
          )}
          {liveTrip.assistance_needed && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              <span className="text-amber-800 text-sm">⚠️ {liveTrip.assistance_needed}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Progress stepper ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <h4 className="font-semibold text-gray-900 mb-3">Trip Progress</h4>
        <div className="space-y-2">
          {NEMT_STATUS_STEPS.map((status, idx) => {
            const isDone    = idx < currentIdx
            const isCurrent = idx === currentIdx
            const isFuture  = idx > currentIdx
            return (
              <div key={status} className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
                    ${isDone    ? 'bg-[#1a5c38] text-white' : ''}
                    ${isCurrent ? 'bg-[#1a5c38] text-white ring-4 ring-[#1a5c38]/20' : ''}
                    ${isFuture  ? 'bg-gray-200 text-gray-400' : ''}`}
                >
                  {isDone ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-sm leading-tight flex-1
                    ${isCurrent ? 'font-semibold text-gray-900' : isDone ? 'text-gray-400 line-through' : 'text-gray-400'}`}
                >
                  {FINE_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}
                </span>
                {isCurrent && (
                  <Badge color="green">Now</Badge>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Special UI panels by current status ── */}

      {/* Pre-trip checklist */}
      {currentStatus === 'accepted' && showChecklist && (
        <PreTripChecklist
          tripId={trip.id}
          hasWav={hasWav}
          onDone={handleChecklistDone}
        />
      )}

      {/* GPS panels — shown when at a GPS step and GPS not yet confirmed */}
      {requiresGps(currentStatus) && !gpsConfirmed && !isComplete && (
        <GpsCapturePanel
          label={
            currentStatus === 'arrived_at_pickup'
              ? '📍 Capture GPS at pickup location'
              : currentStatus === 'arrived_at_appointment'
              ? '📍 Capture GPS at appointment'
              : '📍 Capture GPS at drop-off location'
          }
          onConfirm={(coords) => {
            setGpsConfirmed(coords)
            if (requiresSignature(currentStatus)) {
              setShowSignaturePad(true)
            }
          }}
        />
      )}

      {/* GPS confirmed indicator */}
      {gpsConfirmed && !isComplete && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <span className="text-lg">📍</span>
          <div>
            <p className="font-medium">GPS confirmed</p>
            <code className="text-xs">{formatCoords(gpsConfirmed)}</code>
          </div>
        </div>
      )}

      {/* Signature pad */}
      {showSignaturePad && !signatureCaptured && !isComplete && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <SignaturePad
            label={
              currentStatus === 'arrived_at_pickup'
                ? 'Client signature — confirms ride start (loaded miles begin)'
                : 'Client signature — confirms drop-off (loaded miles end)'
            }
            onCapture={handleSignatureCapture}
            onCancel={() => setShowSignaturePad(false)}
          />
        </div>
      )}

      {/* Signature captured indicator */}
      {signatureCaptured && !isComplete && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <span className="text-lg">✍️</span>
          <div>
            <p className="font-medium">Signature captured</p>
            <p className="text-xs text-green-700">Will upload to secure storage when online.</p>
          </div>
        </div>
      )}

      {/* ── Main CTA button ── */}
      {!isComplete && (
        <Button
          fullWidth
          onClick={handleMainCta}
          loading={advancing}
          disabled={isCtaDisabled()}
        >
          {ctaLabel}
        </Button>
      )}

      {/* ── Completed state ── */}
      {isComplete && (
        <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-5 text-center space-y-1">
          <p className="text-2xl">✅</p>
          <p className="font-bold text-green-800">
            {currentStatus === 'canceled' ? 'Trip Canceled' : 'NEMT Trip Complete!'}
          </p>
          {currentStatus === 'completed' && (
            <p className="text-sm text-green-700">
              Claim record will be generated by the billing team.
            </p>
          )}
        </div>
      )}

      {/* ── Return trip indicator ── */}
      {liveTrip.return_included && !isComplete && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
          🔄 Return trip included — client must be brought back home after appointment.
          {liveTrip.return_pickup_time && (
            <span className="block text-xs text-blue-600 mt-0.5">
              Scheduled return pickup: {formatDateTime(liveTrip.return_pickup_time)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
