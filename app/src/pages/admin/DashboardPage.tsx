import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Badge } from '../../components/ui/Badge'
import { SERVICE_LABELS, SERVICE_EMOJI, type ServiceType, type TripStatus } from '../../hooks/useTrips'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentTrip {
  id: string
  service_type: ServiceType
  status: TripStatus
  created_at: string
  clients: { name: string } | null
}

interface RecentSmsRequest {
  id: string
  keyword: 'PICKUP' | 'RIDE'
  created_at: string
  clients: { name: string } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeColor(status: TripStatus): 'gray' | 'amber' | 'green' | 'red' | 'blue' {
  switch (status) {
    case 'pending':   return 'gray'
    case 'assigned':  return 'blue'
    case 'en_route':  return 'amber'
    case 'completed': return 'green'
    case 'canceled':  return 'red'
    default:          return 'gray'
  }
}

function statusLabel(status: TripStatus): string {
  const map: Record<TripStatus, string> = {
    pending: 'Pending', assigned: 'Assigned', en_route: 'En Route',
    completed: 'Completed', canceled: 'Canceled',
  }
  return map[status] ?? status
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m  = Math.floor(ms / 60_000)
  const h  = Math.floor(m / 60)
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'just now'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminDashboard() {
  const navigate = useNavigate()

  const [clientCount,    setClientCount]    = useState<number | null>(null)
  const [navigatorCount, setNavigatorCount] = useState<number | null>(null)
  const [driverCount,    setDriverCount]    = useState<number | null>(null)
  const [weekTripCount,  setWeekTripCount]  = useState<number | null>(null)
  const [smsPending,     setSmsPending]     = useState<number | null>(null)
  const [recentTrips,    setRecentTrips]    = useState<RecentTrip[]>([])
  const [recentSms,      setRecentSms]      = useState<RecentSmsRequest[]>([])
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

      const [
        clientRes,
        navRes,
        driverRes,
        weekTripRes,
        smsPendingRes,
        recentTripsRes,
        recentSmsRes,
      ] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active'),
        supabase.from('navigators').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('errand_trips').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
        supabase.from('sms_errand_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('errand_trips')
          .select('id, service_type, status, created_at, clients(name)')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase.from('sms_errand_requests')
          .select('id, keyword, created_at, clients(name)')
          .order('created_at', { ascending: false })
          .limit(3),
      ])

      setClientCount(clientRes.count ?? 0)
      setNavigatorCount(navRes.count ?? 0)
      setDriverCount(driverRes.count ?? 0)
      setWeekTripCount(weekTripRes.count ?? 0)
      setSmsPending(smsPendingRes.count ?? 0)
      setRecentTrips((recentTripsRes.data ?? []) as unknown as RecentTrip[])
      setRecentSms((recentSmsRes.data ?? []) as unknown as RecentSmsRequest[])
      setLoading(false)
    }
    load()
  }, [])

  const stats = [
    { label: 'Active Clients',     value: clientCount,    color: 'text-green',      icon: '👥' },
    { label: 'Active Navigators',  value: navigatorCount, color: 'text-blue-700',   icon: '🗺️' },
    { label: 'Active Drivers',     value: driverCount,    color: 'text-amber-700',  icon: '🚗' },
    { label: 'Trips This Week',    value: weekTripCount,  color: 'text-gray-900',   icon: '📦' },
  ]

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Admin Overview</h2>

      {/* ── Stats grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
              <span className="text-lg">{card.icon}</span>
            </div>
            {loading ? (
              <div className="h-8 w-12 bg-gray-100 rounded animate-pulse mt-2" />
            ) : (
              <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value ?? '—'}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Quick links ──────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Quick Links</h3>
        <div className="space-y-2">
          <button
            onClick={() => navigate('/admin/errands')}
            className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-4
                       shadow-sm hover:bg-gray-50 transition-colors text-left min-h-[56px]"
          >
            <span className="font-medium text-gray-900">🚐 Errand Operations</span>
            <span className="text-gray-400">→</span>
          </button>

          <button
            onClick={() => navigate('/admin/drivers')}
            className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-4
                       shadow-sm hover:bg-gray-50 transition-colors text-left min-h-[56px]"
          >
            <span className="font-medium text-gray-900">🚗 Driver Roster</span>
            <span className="text-gray-400">→</span>
          </button>

          <button
            onClick={() => navigate('/admin/errands')}
            className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-4
                       shadow-sm hover:bg-gray-50 transition-colors text-left min-h-[56px]"
          >
            <span className="font-medium text-gray-900">
              📱 Pending SMS Requests
              {smsPending != null && smsPending > 0 && (
                <span className="ml-2 inline-flex items-center justify-center bg-red-500 text-white
                                 text-xs font-bold rounded-full w-5 h-5">
                  {smsPending > 9 ? '9+' : smsPending}
                </span>
              )}
            </span>
            <span className="text-gray-400">→</span>
          </button>
        </div>
      </section>

      {/* ── Recent Activity ──────────────────────────────────────────────── */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Recent Activity</h3>

        {/* Recent trips */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-3">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Latest Errand Trips</p>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : recentTrips.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">No trips yet.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentTrips.map(trip => (
                <li key={trip.id}
                  onClick={() => navigate(`/admin/errands/${trip.id}`)}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50
                             transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {SERVICE_EMOJI[trip.service_type]} {trip.clients?.name ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{SERVICE_LABELS[trip.service_type]}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge color={statusBadgeColor(trip.status)}>{statusLabel(trip.status)}</Badge>
                    <span className="text-xs text-gray-400">{timeAgo(trip.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent SMS requests */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Recent SMS Requests</p>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(2)].map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : recentSms.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">No SMS requests.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentSms.map(req => (
                <li key={req.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {req.clients?.name ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Keyword: {req.keyword}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(req.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
