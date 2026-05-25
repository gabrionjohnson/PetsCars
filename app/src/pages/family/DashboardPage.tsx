import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { Badge } from '../../components/ui/Badge'
import {
  SERVICE_LABELS,
  SERVICE_EMOJI,
  type TripStatus,
  type ServiceType,
} from '../../hooks/useTrips'

type Tab = 'activity' | 'history' | 'documents'

interface ClientInfo {
  id:   string
  name: string
}

interface TripRow {
  id:            string
  service_type:  ServiceType
  status:        TripStatus
  scheduled_for: string | null
  created_at:    string
  driver_id:     string | null
  driverName?:   string | null
  flat_rate:     number
}

interface SmsRequest {
  id:        string
  keyword:   'PICKUP' | 'RIDE'
  created_at: string
}

interface LastLog {
  created_at: string
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
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function minutesAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────
function ActivityTab({ clientId, clientPhone }: { clientId: string; clientPhone: string }) {
  const navigate = useNavigate()

  const [upcoming,    setUpcoming]    = useState<TripRow[]>([])
  const [inProgress,  setInProgress]  = useState<TripRow[]>([])
  const [smsRequests, setSmsRequests] = useState<SmsRequest[]>([])
  const [lastLogs,    setLastLogs]    = useState<Record<string, LastLog>>({})
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    const [upcomingRes, inProgressRes, smsRes] = await Promise.all([
      supabase
        .from('errand_trips')
        .select('id, service_type, status, scheduled_for, created_at, driver_id, flat_rate')
        .eq('client_id', clientId)
        .in('status', ['pending', 'assigned'])
        .order('created_at', { ascending: false }),
      supabase
        .from('errand_trips')
        .select('id, service_type, status, scheduled_for, created_at, driver_id, flat_rate')
        .eq('client_id', clientId)
        .eq('status', 'en_route')
        .order('created_at', { ascending: false }),
      supabase
        .from('sms_errand_requests')
        .select('id, keyword, created_at, phone')
        .eq('status', 'pending'),
    ])

    // Filter SMS by client phone
    const filteredSms = ((smsRes.data ?? []) as any[]).filter(
      (r) => r.phone === clientPhone
    ) as SmsRequest[]

    const allTrips = [
      ...((upcomingRes.data ?? []) as TripRow[]),
      ...((inProgressRes.data ?? []) as TripRow[]),
    ]

    // Load driver names
    const driverIds = [...new Set(allTrips.map(t => t.driver_id).filter(Boolean))] as string[]
    let driverMap: Record<string, string> = {}
    if (driverIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', driverIds)
      for (const p of profiles ?? []) {
        driverMap[(p as any).id] = (p as any).name
      }
    }

    // Load last status log for in-progress trips
    const inProgressIds = ((inProgressRes.data ?? []) as TripRow[]).map(t => t.id)
    if (inProgressIds.length > 0) {
      const { data: logs } = await supabase
        .from('trip_status_log')
        .select('trip_id, created_at')
        .in('trip_id', inProgressIds)
        .order('created_at', { ascending: false })

      const logMap: Record<string, LastLog> = {}
      for (const log of logs ?? []) {
        const l = log as any
        if (!logMap[l.trip_id]) logMap[l.trip_id] = { created_at: l.created_at }
      }
      setLastLogs(logMap)
    }

    const enrichTrips = (rows: TripRow[]) =>
      rows.map(t => ({ ...t, driverName: t.driver_id ? driverMap[t.driver_id] ?? null : null }))

    setUpcoming(enrichTrips((upcomingRes.data ?? []) as TripRow[]))
    setInProgress(enrichTrips((inProgressRes.data ?? []) as TripRow[]))
    setSmsRequests(filteredSms)
    setLoading(false)
  }, [clientId, clientPhone])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5 pt-2">
      {/* Book button */}
      <button
        onClick={() => navigate('/family/book')}
        className="w-full bg-green text-white font-semibold py-3.5 rounded-xl
                   hover:bg-green-light active:bg-green-dark transition-colors min-h-[52px]"
      >
        + Book a Service
      </button>

      {/* In progress */}
      {inProgress.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            In Progress
          </h3>
          <div className="space-y-2">
            {inProgress.map(trip => {
              const last = lastLogs[trip.id]
              const mins = last ? minutesAgo(last.created_at) : null
              return (
                <div key={trip.id} className="bg-white rounded-xl border border-blue-200 p-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{SERVICE_EMOJI[trip.service_type]}</span>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{SERVICE_LABELS[trip.service_type]}</p>
                      {trip.driverName && (
                        <p className="text-sm text-gray-500">Driver: {trip.driverName}</p>
                      )}
                    </div>
                    <Badge color="blue">En Route</Badge>
                  </div>
                  {mins != null && (
                    <p className="text-xs text-gray-400 mt-2">
                      Last updated {mins < 1 ? 'just now' : `${mins} min ago`}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Upcoming */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Upcoming
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No upcoming trips.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(trip => (
              <div key={trip.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{SERVICE_EMOJI[trip.service_type]}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{SERVICE_LABELS[trip.service_type]}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {trip.scheduled_for ? formatDate(trip.scheduled_for) : '⚡ ASAP'}
                    </p>
                  </div>
                  <Badge color={statusColor(trip.status)}>
                    {trip.status}
                  </Badge>
                </div>
                {trip.driverName && (
                  <p className="text-sm text-gray-500 mt-1">Driver: {trip.driverName}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SMS Requests */}
      {smsRequests.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            SMS Requests
          </h3>
          <div className="space-y-2">
            {smsRequests.map(req => (
              <div key={req.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-900">
                  Client requested a {req.keyword === 'PICKUP' ? 'Pharmacy Pickup' : 'Ride'} —
                  Navigator is reviewing.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab({ clientId }: { clientId: string }) {
  const [trips,   setTrips]   = useState<TripRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('errand_trips')
      .select('id, service_type, status, scheduled_for, created_at, driver_id, flat_rate')
      .eq('client_id', clientId)
      .in('status', ['completed', 'canceled'])
      .order('created_at', { ascending: false })
      .limit(20)

    const rows = (data ?? []) as TripRow[]

    // Load driver names
    const driverIds = [...new Set(rows.map(t => t.driver_id).filter(Boolean))] as string[]
    let driverMap: Record<string, string> = {}
    if (driverIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', driverIds)
      for (const p of profiles ?? []) {
        driverMap[(p as any).id] = (p as any).name
      }
    }

    setTrips(rows.map(t => ({ ...t, driverName: t.driver_id ? driverMap[t.driver_id] ?? null : null })))
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (trips.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 pt-6">
        <p className="text-4xl mb-2">📂</p>
        <p className="text-sm">No completed trips yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 pt-2">
      {trips.map(trip => (
        <div key={trip.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{SERVICE_EMOJI[trip.service_type]}</span>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">{SERVICE_LABELS[trip.service_type]}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatDate(trip.created_at)}</p>
              {(trip as any).driverName && (
                <p className="text-xs text-gray-400">Driver: {(trip as any).driverName}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge color={statusColor(trip.status)}>
                {trip.status}
              </Badge>
              <span className="text-sm font-semibold text-gray-700">${trip.flat_rate}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Documents Tab ────────────────────────────────────────────────────────────
function DocumentsTab() {
  return (
    <div className="text-center py-12 text-gray-400 pt-6">
      <p className="text-4xl mb-2">📄</p>
      <p className="text-sm font-medium text-gray-600">Documents are managed by your Navigator.</p>
      <p className="text-xs text-gray-400 mt-1">Document access coming in a future update.</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function FamilyDashboard() {
  const { user }  = useAuth()
  const [client,  setClient]  = useState<ClientInfo & { phone: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState<Tab>('activity')

  useEffect(() => {
    if (!user) return
    supabase
      .from('family_proxies')
      .select('client_id, clients:client_id(id, name, phone)')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.clients) {
          const c = data.clients as any
          setClient({ id: c.id, name: c.name, phone: c.phone ?? '' })
        }
        setLoading(false)
      })
  }, [user])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'activity',  label: 'Activity'   },
    { key: 'history',   label: 'History'    },
    { key: 'documents', label: 'Documents'  },
  ]

  if (loading) {
    return (
      <div className="px-4 pt-8 space-y-4">
        <div className="h-8 bg-gray-100 rounded animate-pulse w-48" />
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-8">
      {/* Header */}
      <div className="pt-4 pb-2">
        <h1 className="text-xl font-bold text-gray-900">
          Pathway — {client?.name ?? 'Your Senior'}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Family portal</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-2">
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

      {!client ? (
        <div className="text-center py-12 text-gray-400">
          <p>No linked senior found. Contact your Navigator.</p>
        </div>
      ) : (
        <>
          {tab === 'activity'  && <ActivityTab  clientId={client.id} clientPhone={client.phone} />}
          {tab === 'history'   && <HistoryTab   clientId={client.id} />}
          {tab === 'documents' && <DocumentsTab />}
        </>
      )}
    </div>
  )
}
