import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'
import { SERVICE_LABELS, SERVICE_EMOJI, type ServiceType, type TripStatus } from '../../../hooks/useTrips'

// ─── Types ────────────────────────────────────────────────────────────────────

type BgCheckStatus = 'pending' | 'in_progress' | 'approved' | 'denied'

interface DriverProfile {
  id: string
  active: boolean
  online: boolean
  county: string | null
  rating: number | null
  total_trips: number
  cancel_flag_count: number
  checkr_candidate_id: string | null
  background_check_status: BgCheckStatus
  checkr_report_id: string | null
  license_expiry: string | null
  insurance_expiry: string | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_year: number | null
  vehicle_color: string | null
  license_plate: string | null
  wav_capable: boolean
  vehicle_photo_urls: string[] | null
  stripe_connect_complete: boolean
  earnings_pending: number | null
  last_payout_at: string | null
  last_payout_amount: number | null
  profiles: { name: string; email: string | null } | null
}

interface TripHistoryRow {
  id: string
  service_type: ServiceType
  flat_rate: number
  driver_payout: number | null
  status: TripStatus
  completed_at: string | null
  clients: { name: string } | null
}

interface DriverRating {
  id: string
  rating: number
  comment: string | null
  created_at: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCurrency(n: number | null) {
  if (n == null) return '—'
  return `$${n.toFixed(2)}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function expiryColor(days: number | null): 'red' | 'amber' | 'green' {
  if (days == null || days < 0 || days < 7) return 'red'
  if (days < 30) return 'amber'
  return 'green'
}

function expiryLabel(days: number | null, label: string): string {
  if (days == null) return `${label}: No date on file`
  if (days < 0)   return `${label}: EXPIRED`
  if (days === 0) return `${label}: Expires today`
  return `${label}: ${days}d remaining`
}

function bgCheckColor(status: BgCheckStatus): 'gray' | 'blue' | 'green' | 'red' {
  switch (status) {
    case 'pending':     return 'gray'
    case 'in_progress': return 'blue'
    case 'approved':    return 'green'
    case 'denied':      return 'red'
  }
}

function bgCheckLabel(status: BgCheckStatus): string {
  return { pending: 'Pending', in_progress: 'In Progress', approved: 'Approved', denied: 'Denied' }[status]
}

function tripStatusBadgeColor(status: TripStatus): 'gray' | 'amber' | 'green' | 'red' | 'blue' {
  switch (status) {
    case 'pending':   return 'gray'
    case 'assigned':  return 'blue'
    case 'en_route':  return 'amber'
    case 'completed': return 'green'
    case 'canceled':  return 'red'
    default:          return 'gray'
  }
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span className="text-amber-400 text-base">
      {'★'.repeat(full)}
      <span className="text-gray-300">{'★'.repeat(5 - full)}</span>
    </span>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DriverProfilePage() {
  const { driverId } = useParams<{ driverId: string }>()
  const navigate = useNavigate()

  const [driver,    setDriver]    = useState<DriverProfile | null>(null)
  const [trips,     setTrips]     = useState<TripHistoryRow[]>([])
  const [ratings,   setRatings]   = useState<DriverRating[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [toast,     setToast]     = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const fetchDriver = useCallback(async () => {
    if (!driverId) return
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('drivers')
      .select('*, profiles(name, email)')
      .eq('id', driverId)
      .single()

    if (err || !data) {
      setError(err?.message ?? 'Driver not found')
      setLoading(false)
      return
    }
    setDriver(data as unknown as DriverProfile)

    // Trip history
    const { data: tripData } = await supabase
      .from('errand_trips')
      .select('id, service_type, flat_rate, driver_payout, status, completed_at, clients(name)')
      .eq('driver_id', driverId)
      .order('completed_at', { ascending: false })
      .limit(10)
    setTrips((tripData ?? []) as unknown as TripHistoryRow[])

    // Ratings
    const { data: ratingData } = await supabase
      .from('driver_ratings')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
    setRatings((ratingData ?? []) as DriverRating[])

    setLoading(false)
  }, [driverId])

  useEffect(() => { fetchDriver() }, [fetchDriver])

  // Toggle active/suspended
  async function toggleActive() {
    if (!driver || !driverId) return
    setSaving(true)
    const newVal = !driver.active
    const { error: err } = await supabase
      .from('drivers')
      .update({ active: newVal })
      .eq('id', driverId)
    if (err) {
      setToast('Failed to update status: ' + err.message)
    } else {
      setDriver(prev => prev ? { ...prev, active: newVal } : prev)
      setToast(`Driver ${newVal ? 'activated' : 'suspended'}.`)
    }
    setSaving(false)
  }

  // Mark background check approved
  async function approveBackground() {
    if (!driverId) return
    setSaving(true)
    const { error: err } = await supabase
      .from('drivers')
      .update({ background_check_status: 'approved', active: true })
      .eq('id', driverId)
    if (err) {
      setToast('Failed: ' + err.message)
    } else {
      setDriver(prev => prev ? { ...prev, background_check_status: 'approved', active: true } : prev)
      setToast('Background check approved. Driver activated.')
    }
    setSaving(false)
  }

  // Reset cancel flags
  async function resetFlags() {
    if (!driverId) return
    setSaving(true)
    const { error: err } = await supabase
      .from('drivers')
      .update({ cancel_flag_count: 0 })
      .eq('id', driverId)
    if (err) {
      setToast('Failed: ' + err.message)
    } else {
      setDriver(prev => prev ? { ...prev, cancel_flag_count: 0 } : prev)
      setToast('Cancel flags reset to 0.')
    }
    setSaving(false)
    setConfirmReset(false)
  }

  // Get signed URL for document viewing
  async function viewDocument(path: string) {
    const { data } = await supabase.storage.from('client-documents').createSignedUrl(path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else setToast('Could not load document.')
  }

  const avgRating = ratings.length > 0
    ? ratings.reduce((s, r) => s + r.rating, 0) / ratings.length
    : null

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
        {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  if (error || !driver) {
    return (
      <div className="p-4">
        <button onClick={() => navigate(-1)} className="text-green text-sm mb-4 min-h-[44px] flex items-center gap-1">
          ← Back
        </button>
        <div className="text-center py-12 text-red-600">
          <p>{error ?? 'Driver not found'}</p>
        </div>
      </div>
    )
  }

  const driverStatusLabel = !driver.active ? 'Suspended' : 'Active'
  const driverStatusColor: 'green' | 'red' = !driver.active ? 'red' : 'green'

  const licenseDays  = daysUntil(driver.license_expiry)
  const insuranceDays = daysUntil(driver.insurance_expiry)

  return (
    <div className="p-4 space-y-4">
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {/* Back */}
      <button onClick={() => navigate(-1)} className="text-green text-sm flex items-center gap-1 min-h-[44px]">
        ← Back
      </button>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{driver.profiles?.name ?? 'Unknown Driver'}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{driver.county ?? 'No county'} County</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge color={driverStatusColor}>{driverStatusLabel}</Badge>
              {driver.active && (
                <span className={`inline-flex items-center gap-1 text-xs font-medium ${driver.online ? 'text-green' : 'text-gray-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${driver.online ? 'bg-green' : 'bg-gray-300'}`} />
                  {driver.online ? 'Online' : 'Offline'}
                </span>
              )}
            </div>
          </div>
          <Button
            variant={driver.active ? 'danger' : 'primary'}
            className="text-sm min-h-[44px]"
            loading={saving}
            onClick={toggleActive}
          >
            {driver.active ? 'Suspend' : 'Activate'}
          </Button>
        </div>
        {driver.profiles?.email && (
          <p className="text-xs text-gray-400 mt-3">{driver.profiles.email}</p>
        )}
      </div>

      {/* ── Background Check ────────────────────────────────────────────── */}
      <Card title="Background Check">
        <Row label="Status" value={
          <Badge color={bgCheckColor(driver.background_check_status)}>
            {bgCheckLabel(driver.background_check_status)}
          </Badge>
        } />
        {driver.checkr_candidate_id && (
          <Row label="Checkr Candidate" value={<code className="text-xs bg-gray-100 px-1 rounded">{driver.checkr_candidate_id}</code>} />
        )}
        {driver.checkr_report_id && (
          <Row label="Checkr Report" value={<code className="text-xs bg-gray-100 px-1 rounded">{driver.checkr_report_id}</code>} />
        )}
        {driver.background_check_status !== 'approved' && (
          <Button
            variant="primary"
            loading={saving}
            onClick={approveBackground}
            className="w-full mt-2"
          >
            Mark Approved
          </Button>
        )}
      </Card>

      {/* ── Documents ───────────────────────────────────────────────────── */}
      <Card title="Documents">
        {/* License */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-800">Driver's License</p>
            <p className={`text-xs font-medium mt-0.5 text-${expiryColor(licenseDays)}-600`}>
              {expiryLabel(licenseDays, 'Expiry')}
              {driver.license_expiry && ` (${formatDate(driver.license_expiry)})`}
            </p>
          </div>
          <button
            onClick={() => viewDocument(`drivers/${driverId}/license`)}
            className="text-xs text-green font-medium hover:underline min-h-[44px] flex items-center"
          >
            View
          </button>
        </div>

        {/* Insurance */}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-800">Insurance</p>
            <p className={`text-xs font-medium mt-0.5 text-${expiryColor(insuranceDays)}-600`}>
              {expiryLabel(insuranceDays, 'Expiry')}
              {driver.insurance_expiry && ` (${formatDate(driver.insurance_expiry)})`}
            </p>
          </div>
          <button
            onClick={() => viewDocument(`drivers/${driverId}/insurance`)}
            className="text-xs text-green font-medium hover:underline min-h-[44px] flex items-center"
          >
            View
          </button>
        </div>

        <Button
          variant="secondary"
          className="w-full mt-2"
          onClick={() => setToast('Feature coming in Phase 5')}
        >
          Request Document Update
        </Button>
      </Card>

      {/* ── Vehicle Info ─────────────────────────────────────────────────── */}
      <Card title="Vehicle Info">
        <Row label="Make / Model" value={`${driver.vehicle_year ?? ''} ${driver.vehicle_make ?? '—'} ${driver.vehicle_model ?? ''}`} />
        <Row label="Color"         value={driver.vehicle_color ?? '—'} />
        <Row label="License Plate" value={driver.license_plate ?? '—'} />
        <Row label="WAV Capable"   value={
          <Badge color={driver.wav_capable ? 'green' : 'gray'}>
            {driver.wav_capable ? 'WAV' : 'Standard'}
          </Badge>
        } />
        {(driver.vehicle_photo_urls ?? []).length > 0 && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Vehicle Photos</p>
            <VehiclePhotos urls={driver.vehicle_photo_urls!} driverId={driverId!} onError={msg => setToast(msg)} />
          </div>
        )}
      </Card>

      {/* ── Payout ──────────────────────────────────────────────────────── */}
      <Card title="Payout">
        <Row label="Stripe Connect" value={
          <Badge color={driver.stripe_connect_complete ? 'green' : 'amber'}>
            {driver.stripe_connect_complete ? 'Connected' : 'Not Connected'}
          </Badge>
        } />
        <Row label="Pending Earnings"   value={formatCurrency(driver.earnings_pending)} />
        <Row label="Last Payout"        value={formatDate(driver.last_payout_at)} />
        <Row label="Last Payout Amount" value={formatCurrency(driver.last_payout_amount)} />
        <Button
          variant="secondary"
          className="w-full mt-2"
          onClick={() => setToast('Manual payouts via Stripe Admin Panel')}
        >
          Trigger Manual Payout
        </Button>
      </Card>

      {/* ── Trip History ─────────────────────────────────────────────────── */}
      <Card title={`Trip History (${driver.total_trips} total · Rating: ${driver.rating?.toFixed(1) ?? '—'} ★)`}>
        {trips.length === 0 ? (
          <p className="text-sm text-gray-400">No trips yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 -mx-4">
            {trips.map(trip => (
              <li key={trip.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {SERVICE_EMOJI[trip.service_type]} {SERVICE_LABELS[trip.service_type]}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {trip.clients?.name ?? 'Unknown client'} · {formatDate(trip.completed_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge color={tripStatusBadgeColor(trip.status)}>
                      {trip.status}
                    </Badge>
                    <span className="text-xs font-semibold text-green">{formatCurrency(trip.driver_payout)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Ratings ─────────────────────────────────────────────────────── */}
      <Card title={`Ratings${avgRating != null ? ` · Avg ${avgRating.toFixed(1)} ★` : ''}`}>
        {ratings.length === 0 ? (
          <p className="text-sm text-gray-400">No ratings yet.</p>
        ) : (
          <ul className="space-y-3">
            {ratings.map(r => (
              <li key={r.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <Stars rating={r.rating} />
                  <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
                </div>
                {r.comment && <p className="text-sm text-gray-600 mt-1 italic">"{r.comment}"</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ── Cancel Flags ─────────────────────────────────────────────────── */}
      <Card title="Cancel Flags">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={`text-2xl font-bold ${driver.cancel_flag_count >= 3 ? 'text-amber-600' : 'text-green'}`}>
              {driver.cancel_flag_count}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {driver.cancel_flag_count >= 3 ? 'Warning threshold reached' : 'Within normal range'}
            </p>
          </div>
          {confirmReset ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmReset(false)}
                className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] px-3"
              >
                Cancel
              </button>
              <Button variant="danger" loading={saving} onClick={resetFlags}>
                Confirm Reset
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmReset(true)}>
              Reset Flags
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

// ─── Vehicle Photos sub-component ─────────────────────────────────────────────

function VehiclePhotos({
  urls, driverId, onError,
}: {
  urls: string[]
  driverId: string
  onError: (msg: string) => void
}) {
  const [signedUrls, setSignedUrls] = useState<string[]>([])

  useEffect(() => {
    async function load() {
      const results: string[] = []
      for (const url of urls) {
        const path = url.startsWith('http') ? null : url
        if (!path) {
          results.push(url)
          continue
        }
        const { data } = await supabase.storage
          .from('client-documents')
          .createSignedUrl(`drivers/${driverId}/vehicle/${path}`, 300)
        if (data?.signedUrl) results.push(data.signedUrl)
      }
      setSignedUrls(results)
    }
    load().catch(() => onError('Could not load vehicle photos.'))
  }, [urls, driverId, onError])

  if (signedUrls.length === 0) return null

  return (
    <div className="flex gap-2 flex-wrap">
      {signedUrls.map((src, i) => (
        <a key={i} href={src} target="_blank" rel="noreferrer">
          <img
            src={src}
            alt={`Vehicle photo ${i + 1}`}
            className="w-20 h-20 rounded-lg object-cover border border-gray-200"
          />
        </a>
      ))}
    </div>
  )
}
