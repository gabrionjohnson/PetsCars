import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useOffline } from '../../hooks/useOffline'
import { DriverOnboardingWizard } from './onboarding/DriverOnboardingWizard'
import {
  useDriverQueue,
  useActiveTrip,
  SERVICE_EMOJI,
  SERVICE_LABELS,
  ERRAND_STATUS_STEPS,
  RIDE_STATUS_STEPS,
  FINE_STATUS_LABELS,
  type ErrandTrip,
  type FineStatus,
} from '../../hooks/useTrips'
import { enqueueTripStatus } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface DriverRecord {
  id:                   string
  online:               boolean
  rating:               number | null
  total_trips:          number
  earnings_pending:     number | null
  last_payout_at:       string | null
  last_payout_amount:   number | null
  background_check_status: string
  stripe_connect_complete: boolean
  active:               boolean
  onboarding_step:      number | null
}

type Tab = 'jobs' | 'active' | 'earnings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '$0.00'
  return `$${val.toFixed(2)}`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function parseCity(address: string): string {
  // Extract city + ZIP from address like "123 Main St, Plains, GA 31780"
  const parts = address.split(',')
  if (parts.length >= 2) return parts.slice(1).join(',').trim()
  return address
}

function StarRating({ rating }: { rating: number | null }) {
  const val = rating ?? 0
  const full  = Math.floor(val)
  const half  = val - full >= 0.5
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'text-yellow-400' : (i === full && half ? 'text-yellow-300' : 'text-gray-300')}>
          ★
        </span>
      ))}
      <span className="text-sm font-medium text-gray-700 ml-1">{val > 0 ? val.toFixed(1) : 'No ratings yet'}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Tab: Available Jobs
// ---------------------------------------------------------------------------
function JobsTab({
  driverId,
  online,
  onToggleOnline,
}: {
  driverId: string
  online:   boolean
  onToggleOnline: () => Promise<void>
}) {
  const { jobs, loading, refetch } = useDriverQueue(driverId)
  const { isOffline } = useOffline()
  const [accepting, setAccepting] = useState<string | null>(null)
  const [toggling, setToggling]   = useState(false)

  async function handleAccept(job: ErrandTrip) {
    setAccepting(job.id)
    try {
      const { error } = await supabase.functions.invoke('update-trip-status', {
        body: {
          trip_id:   job.id,
          trip_type: 'errand',
          status:    'accepted',
        },
      })
      if (error) throw error
      await refetch()
    } catch (err) {
      console.error('Accept job failed:', err)
    } finally {
      setAccepting(null)
    }
  }

  async function handleToggle() {
    setToggling(true)
    try {
      await onToggleOnline()
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Online/Offline toggle */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div>
          <p className="font-semibold text-gray-900">
            {online ? '🟢 Online' : '⭕ Offline'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {online ? 'You\'re receiving job notifications' : 'Job notifications paused'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggling}
          className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors min-w-[56px]
            ${online ? 'bg-[#1a5c38]' : 'bg-gray-300'}
            ${toggling ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          aria-label={online ? 'Go offline' : 'Go online'}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform
              ${online ? 'translate-x-8' : 'translate-x-1'}`}
          />
        </button>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          📶 You're offline — job notifications paused. Jobs will appear when you reconnect.
        </div>
      )}

      {/* Job list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#1a5c38] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !online ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">⭕</p>
          <p className="font-medium">You're offline</p>
          <p className="text-sm mt-1">Toggle online above to see available jobs.</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📭</p>
          <p className="font-medium">No jobs available in your zone right now.</p>
          <p className="text-sm mt-1">Check back soon — new jobs arrive throughout the day.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              accepting={accepting === job.id}
              onAccept={() => handleAccept(job)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function JobCard({
  job,
  accepting,
  onAccept,
}: {
  job:      ErrandTrip
  accepting: boolean
  onAccept:  () => void
}) {
  const emoji = SERVICE_EMOJI[job.service_type] ?? '📦'
  const label = SERVICE_LABELS[job.service_type] ?? job.service_type

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{emoji}</span>
            <span className="font-semibold text-gray-900">{label}</span>
            {job.wav_required && (
              <Badge color="blue">WAV</Badge>
            )}
          </div>
          <p className="text-sm text-gray-600">{parseCity(job.pickup_address)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-[#1a5c38] text-lg">{formatCurrency(job.driver_payout)}</p>
          <p className="text-xs text-gray-500">your payout</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600">
          🕐 {job.scheduled_for ? formatDateTime(job.scheduled_for) : 'ASAP'}
        </p>
        {job.booking_source === 'sms' && (
          <Badge color="amber">SMS Request</Badge>
        )}
      </div>

      <Button
        fullWidth
        onClick={onAccept}
        loading={accepting}
      >
        Accept Job →
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Active Trip
// ---------------------------------------------------------------------------
function ActiveTripTab({ driverId }: { driverId: string }) {
  const { trip, loading, refetch } = useActiveTrip(driverId)
  const { isOffline } = useOffline()
  const [advancing, setAdvancing] = useState(false)
  const [flagging, setFlagging]   = useState(false)
  const [flagNote, setFlagNote]   = useState('')
  const [showFlagForm, setShowFlagForm] = useState(false)

  async function getGps(): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 },
      )
    })
  }

  async function handleMarkNext() {
    if (!trip) return
    const steps = trip.service_type === 'ride_and_wait' ? RIDE_STATUS_STEPS : ERRAND_STATUS_STEPS
    // Find current fine status from the job — look at accepted_at/status to infer position
    const currentStatus = trip.status as FineStatus
    const currentIdx = steps.indexOf(currentStatus)
    const nextStatus = steps[currentIdx + 1] ?? steps[steps.length - 1]

    setAdvancing(true)
    try {
      const gps = await getGps()

      if (isOffline) {
        await enqueueTripStatus(trip.id, 'errand', nextStatus, {
          gpsLat: gps?.lat,
          gpsLng: gps?.lng,
        })
      } else {
        const { error } = await supabase.functions.invoke('update-trip-status', {
          body: {
            trip_id:   trip.id,
            trip_type: 'errand',
            status:    nextStatus,
            gps_lat:   gps?.lat ?? null,
            gps_lng:   gps?.lng ?? null,
          },
        })
        if (error) throw error
      }
      await refetch()
    } catch (err) {
      console.error('Mark next step failed:', err)
    } finally {
      setAdvancing(false)
    }
  }

  async function handleFlag() {
    if (!trip) return
    setFlagging(true)
    try {
      const { error } = await supabase.functions.invoke('update-trip-status', {
        body: {
          trip_id:   trip.id,
          trip_type: 'errand',
          status:    'canceled',
          note:      flagNote,
        },
      })
      if (error) throw error
      setShowFlagForm(false)
      setFlagNote('')
      await refetch()
    } catch (err) {
      console.error('Flag job failed:', err)
    } finally {
      setFlagging(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-[#1a5c38] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="p-4 text-center py-12 text-gray-500">
        <p className="text-4xl mb-3">🚗</p>
        <p className="font-medium">No active trip.</p>
        <p className="text-sm mt-1">Accept a job from the Available tab to get started.</p>
      </div>
    )
  }

  const steps = trip.service_type === 'ride_and_wait' ? RIDE_STATUS_STEPS : ERRAND_STATUS_STEPS
  const currentStatus = trip.status as FineStatus
  const currentIdx = steps.indexOf(currentStatus)
  const nextStatus = steps[currentIdx + 1] ?? null
  const isComplete = currentStatus === 'completed' || currentStatus === 'canceled'
  const emoji = SERVICE_EMOJI[trip.service_type] ?? '📦'
  const label = SERVICE_LABELS[trip.service_type] ?? trip.service_type

  // Extract first name only (HIPAA — no last name)
  const clientFirstName = (() => {
    const jobDetails = trip.job_details as Record<string, unknown> | null
    if (jobDetails?.client_first_name) return String(jobDetails.client_first_name)
    return 'Client'
  })()

  return (
    <div className="p-4 space-y-4">
      {/* Offline notice */}
      {isOffline && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          📶 Offline — status updates will sync when you reconnect.
        </div>
      )}

      {/* Trip header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{emoji}</span>
          <span className="font-bold text-gray-900 text-lg">{label}</span>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">For:</span> {clientFirstName}
          </p>
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-900">Pickup:</span> {trip.pickup_address}
          </p>
          {trip.destination && (
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">Destination:</span> {trip.destination}
            </p>
          )}
          {trip.instructions && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
              📋 {trip.instructions}
            </p>
          )}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
          <span className="text-sm text-gray-500">Your payout</span>
          <span className="font-bold text-[#1a5c38]">{formatCurrency(trip.driver_payout)}</span>
        </div>
      </div>

      {/* Status timeline */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <h4 className="font-semibold text-gray-900 mb-3">Progress</h4>
        <div className="space-y-2">
          {steps.map((status, idx) => {
            const isDone    = idx < currentIdx
            const isCurrent = idx === currentIdx
            const isFuture  = idx > currentIdx
            return (
              <div key={status} className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold
                  ${isDone    ? 'bg-[#1a5c38] text-white' : ''}
                  ${isCurrent ? 'bg-[#1a5c38] text-white ring-4 ring-[#1a5c38]/20' : ''}
                  ${isFuture  ? 'bg-gray-200 text-gray-400' : ''}`}
                >
                  {isDone ? '✓' : idx + 1}
                </div>
                <span className={`text-sm ${isCurrent ? 'font-semibold text-gray-900' : isDone ? 'text-gray-400 line-through' : 'text-gray-400'}`}>
                  {FINE_STATUS_LABELS[status] ?? status.replace(/_/g, ' ')}
                </span>
                {isCurrent && (
                  <span className="ml-auto">
                    <Badge color="green">Now</Badge>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Mark Next Step */}
      {!isComplete && nextStatus && (
        <Button fullWidth onClick={handleMarkNext} loading={advancing}>
          Mark: {FINE_STATUS_LABELS[nextStatus] ?? nextStatus.replace(/_/g, ' ')} →
        </Button>
      )}

      {isComplete && (
        <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-4 text-sm text-green-800 font-medium text-center">
          ✅ Trip {currentStatus === 'canceled' ? 'canceled' : 'completed'}!
        </div>
      )}

      {/* Flag Job */}
      {!isComplete && (
        <>
          {!showFlagForm ? (
            <button
              type="button"
              onClick={() => setShowFlagForm(true)}
              className="w-full text-sm text-red-600 border border-red-200 rounded-xl py-3 min-h-[48px] hover:bg-red-50 transition-colors"
            >
              🚩 Flag / Cancel Job
            </button>
          ) : (
            <div className="bg-white border border-red-200 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-red-700 text-sm">Flag this job</p>
              <textarea
                value={flagNote}
                onChange={e => setFlagNote(e.target.value)}
                placeholder="Describe the issue (e.g., client not available, address incorrect, safety concern)..."
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowFlagForm(false); setFlagNote('') }}
                  className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-semibold min-h-[48px]"
                >
                  Cancel
                </button>
                <Button variant="danger" onClick={handleFlag} loading={flagging} className="flex-1">
                  Submit Flag
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Earnings
// ---------------------------------------------------------------------------
function EarningsTab({ driverId }: { driverId: string }) {
  const [driverData, setDriverData] = useState<DriverRecord | null>(null)
  const [history, setHistory]       = useState<ErrandTrip[]>([])
  const [loading, setLoading]       = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [{ data: driver }, { data: trips }] = await Promise.all([
      supabase
        .from('drivers')
        .select('id, online, rating, total_trips, earnings_pending, last_payout_at, last_payout_amount, background_check_status, stripe_connect_complete, active, onboarding_step')
        .eq('id', driverId)
        .single(),
      supabase
        .from('errand_trips')
        .select('*')
        .eq('driver_id', driverId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50),
    ])
    setDriverData(driver as DriverRecord | null)
    setHistory((trips ?? []) as ErrandTrip[])
    setLoading(false)
  }, [driverId])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-[#1a5c38] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Summary card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-4">
        <h3 className="font-bold text-gray-900 text-lg">Earnings Summary</h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#f7f3ed] rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Pending Payout</p>
            <p className="font-bold text-[#1a5c38] text-xl">{formatCurrency(driverData?.earnings_pending)}</p>
          </div>
          <div className="bg-[#f7f3ed] rounded-xl p-3">
            <p className="text-xs text-gray-500 mb-1">Total Trips</p>
            <p className="font-bold text-gray-900 text-xl">{driverData?.total_trips ?? 0}</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Last payout</span>
            <span className="font-medium text-gray-900">
              {driverData?.last_payout_amount
                ? `${formatCurrency(driverData.last_payout_amount)} on ${formatDate(driverData.last_payout_at)}`
                : 'No payouts yet'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Next payout</span>
            <span className="font-medium text-gray-900">Bi-weekly (estimated)</span>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3">
          <p className="text-sm text-gray-600 mb-1">Your rating</p>
          <StarRating rating={driverData?.rating ?? null} />
        </div>
      </div>

      {/* Trip history */}
      <div>
        <h4 className="font-semibold text-gray-900 mb-3">Completed Trips</h4>
        {history.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-white rounded-xl border border-gray-200">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm">No completed trips yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map(trip => (
              <div key={trip.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                <div>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span>{SERVICE_EMOJI[trip.service_type] ?? '📦'}</span>
                    <span className="text-sm font-medium text-gray-900">
                      {SERVICE_LABELS[trip.service_type] ?? trip.service_type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{formatDate(trip.completed_at)}</p>
                </div>
                <span className="font-bold text-[#1a5c38]">{formatCurrency(trip.driver_payout)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Driver onboarding gate
// ---------------------------------------------------------------------------
function OnboardingPrompt({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <span className="text-6xl mb-4">🚗</span>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Welcome to Pathway Driver</h2>
      <p className="text-gray-600 text-sm mb-6 max-w-xs">
        Complete your driver application to start accepting jobs in your area.
        The process takes about 10 minutes.
      </p>
      <Button onClick={onStart} className="w-full max-w-xs">
        Start Driver Application →
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export function DriverDashboard() {
  const { user }       = useAuth()
  const [tab, setTab]  = useState<Tab>('jobs')
  const [driverRecord, setDriverRecord] = useState<DriverRecord | null>(null)
  const [driverLoading, setDriverLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  const loadDriver = useCallback(async () => {
    if (!user) return
    setDriverLoading(true)
    const { data } = await supabase
      .from('drivers')
      .select('id, online, rating, total_trips, earnings_pending, last_payout_at, last_payout_amount, background_check_status, stripe_connect_complete, active, onboarding_step')
      .eq('id', user.id)
      .maybeSingle()
    setDriverRecord(data as DriverRecord | null)
    setDriverLoading(false)
  }, [user])

  useEffect(() => { loadDriver() }, [loadDriver])

  async function toggleOnline() {
    if (!user || !driverRecord) return
    const newOnline = !driverRecord.online
    await supabase
      .from('drivers')
      .update({ online: newOnline })
      .eq('id', user.id)
    setDriverRecord(prev => prev ? { ...prev, online: newOnline } : prev)
  }

  if (driverLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-[#1a5c38] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // No driver record or incomplete onboarding
  if (!driverRecord || !driverRecord.active) {
    if (showOnboarding) {
      return <DriverOnboardingWizard />
    }
    return <OnboardingPrompt onStart={() => setShowOnboarding(true)} />
  }

  const driverId = driverRecord.id

  const tabs: { id: Tab; label: string; emoji: string }[] = [
    { id: 'jobs',     label: 'Available Jobs', emoji: '📋' },
    { id: 'active',   label: 'Active Trip',    emoji: '🚗' },
    { id: 'earnings', label: 'Earnings',       emoji: '💰' },
  ]

  return (
    <div className="flex flex-col min-h-full">
      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 flex sticky top-0 z-10">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors min-h-[56px]
              ${tab === t.id
                ? 'text-[#1a5c38] border-b-2 border-[#1a5c38]'
                : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span className="text-lg">{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1">
        {tab === 'jobs' && (
          <JobsTab
            driverId={driverId}
            online={driverRecord.online}
            onToggleOnline={toggleOnline}
          />
        )}
        {tab === 'active' && <ActiveTripTab driverId={driverId} />}
        {tab === 'earnings' && <EarningsTab driverId={driverId} />}
      </div>
    </div>
  )
}
