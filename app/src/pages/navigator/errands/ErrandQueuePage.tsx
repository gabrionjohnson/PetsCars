import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { Badge } from '../../../components/ui/Badge'
import { Toast } from '../../../components/ui/Toast'
import {
  SERVICE_LABELS,
  SERVICE_EMOJI,
  type TripStatus,
  type ServiceType,
  type SmsErrandRequest,
} from '../../../hooks/useTrips'

type Tab = 'sms' | 'active' | 'history'

// SMS request row type (with joined client)
interface SmsRequest extends SmsErrandRequest {
  clients: { name: string } | null
}

// Errand trip row type (with joined client + driver)
interface TripRow {
  id:           string
  client_id:    string
  service_type: ServiceType
  status:       TripStatus
  scheduled_for: string | null
  created_at:   string
  driver_id:    string | null
  clients:      { name: string } | null
  driver:       { name: string } | null
}

function statusColor(status: TripStatus): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (status === 'completed') return 'green'
  if (status === 'canceled')  return 'red'
  if (status === 'en_route')  return 'blue'
  if (status === 'assigned')  return 'amber'
  return 'gray'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  const h = Math.floor(diff / 60)
  return `${h}h ago`
}

// ─── SMS Requests Tab ─────────────────────────────────────────────────────────
function SmsTab({
  uid,
  onNavigate,
}: {
  uid: string
  onNavigate: (path: string) => void
}) {
  const [requests, setRequests] = useState<SmsRequest[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('sms_errand_requests')
      .select('*, clients(name)')
      .eq('navigator_id', uid)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    setRequests((data ?? []) as SmsRequest[])
    setLoading(false)
  }, [uid])

  useEffect(() => { load() }, [load])

  async function dismiss(id: string) {
    await supabase.from('sms_errand_requests').update({ status: 'dismissed' }).eq('id', id)
    setToast('Request dismissed.')
    load()
  }

  if (loading) return <LoadingSkeletons />

  return (
    <div className="space-y-3">
      {requests.length === 0 ? (
        <EmptyState message="No pending SMS requests." />
      ) : (
        requests.map(req => {
          const serviceHint = req.keyword === 'PICKUP' ? 'pharmacy_pickup' : 'ride_and_wait'
          const reviewPath  = `/nav/errands/new?clientId=${req.client_id ?? ''}&service=${serviceHint}`
          return (
            <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-900">
                    {req.clients?.name ?? req.phone}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge color={req.keyword === 'PICKUP' ? 'blue' : 'amber'}>
                      {req.keyword}
                    </Badge>
                    <span className="text-xs text-gray-500">{timeAgo(req.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onNavigate(reviewPath)}
                  className="flex-1 bg-green text-white text-sm font-medium py-2.5 rounded-lg
                             hover:bg-green-light active:bg-green-dark transition-colors min-h-[44px]"
                >
                  Review & Confirm
                </button>
                <button
                  onClick={() => dismiss(req.id)}
                  className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-lg
                             hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )
        })
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ─── Active / History Tabs ────────────────────────────────────────────────────
function TripsTab({
  uid,
  mode,
  onNavigate,
}: {
  uid:        string
  mode:       'active' | 'history'
  onNavigate: (path: string) => void
}) {
  const [trips,   setTrips]   = useState<TripRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    // First get client IDs for this navigator
    const { data: clientData } = await supabase
      .from('clients')
      .select('id')
      .eq('navigator_id', uid)

    const clientIds = (clientData ?? []).map((c: { id: string }) => c.id)

    if (clientIds.length === 0) {
      setTrips([])
      setLoading(false)
      return
    }

    const activeStatuses  = ['pending', 'assigned', 'en_route']
    const historyStatuses = ['completed', 'canceled']

    const { data } = await supabase
      .from('errand_trips')
      .select(`
        id, client_id, service_type, status, scheduled_for, created_at, driver_id,
        clients:client_id(name),
        driver:driver_id(profiles(name))
      `)
      .in('client_id', clientIds)
      .in('status', mode === 'active' ? activeStatuses : historyStatuses)
      .order('created_at', { ascending: false })
      .limit(mode === 'history' ? 20 : 100)

    // Map nested driver -> name
    const rows = (data ?? []).map((row: any) => ({
      ...row,
      driver: row.driver?.profiles ? { name: row.driver.profiles.name } : null,
    }))

    setTrips(rows as TripRow[])
    setLoading(false)
  }, [uid, mode])

  useEffect(() => { load() }, [load])

  if (loading) return <LoadingSkeletons />

  return (
    <div className="space-y-3">
      {trips.length === 0 ? (
        <EmptyState
          message={
            mode === 'active'
              ? 'No active jobs.'
              : 'No completed trips yet.'
          }
        />
      ) : (
        trips.map(trip => (
          <button
            key={trip.id}
            onClick={() => onNavigate(`/nav/errands/${trip.id}`)}
            className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 shadow-sm
                       hover:border-green-light active:bg-gray-50 transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{SERVICE_EMOJI[trip.service_type]}</span>
                <div>
                  <p className="font-semibold text-gray-900">
                    {trip.clients?.name ?? '—'}
                  </p>
                  <p className="text-sm text-gray-600">{SERVICE_LABELS[trip.service_type]}</p>
                </div>
              </div>
              <Badge color={statusColor(trip.status)}>
                {trip.status.replace('_', ' ')}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
              <span>
                {trip.scheduled_for
                  ? `📅 ${formatTime(trip.scheduled_for)}`
                  : '⚡ ASAP'}
              </span>
              {trip.driver && (
                <span>· 🚗 {trip.driver.name}</span>
              )}
            </div>
          </button>
        ))
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function LoadingSkeletons() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
      ))}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <p className="text-4xl mb-2">📭</p>
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function ErrandQueuePage() {
  const { user }   = useAuth()
  const navigate    = useNavigate()
  const [tab, setTab] = useState<Tab>('sms')

  const TABS: { key: Tab; label: string }[] = [
    { key: 'sms',    label: 'SMS Requests' },
    { key: 'active', label: 'Active Jobs'  },
    { key: 'history', label: 'History'    },
  ]

  if (!user) return null

  return (
    <div className="max-w-lg mx-auto px-4 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between pt-4 pb-3">
        <h1 className="text-xl font-bold text-gray-900">Errands</h1>
        <button
          onClick={() => navigate('/nav/errands/new')}
          className="bg-green text-white text-sm font-semibold px-4 py-2 rounded-xl
                     hover:bg-green-light active:bg-green-dark transition-colors min-h-[44px]"
        >
          + Book Errand
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-green text-green'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'sms'     && <SmsTab     uid={user.id} onNavigate={navigate} />}
      {tab === 'active'  && <TripsTab   uid={user.id} mode="active"  onNavigate={navigate} />}
      {tab === 'history' && <TripsTab   uid={user.id} mode="history" onNavigate={navigate} />}
    </div>
  )
}
