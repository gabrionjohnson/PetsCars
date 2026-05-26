import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Badge } from '../../components/ui/Badge'
import { SERVICE_LABELS, SERVICE_EMOJI, type ServiceType, type TripStatus } from '../../hooks/useTrips'

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

interface AlertItem {
  id: string
  type: 'filing' | 'claim_aging' | 'mileage'
  label: string
  sub: string
  path: string
}

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
  const d  = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'just now'
}

export function AdminDashboard() {
  const navigate = useNavigate()

  const [clientCount,    setClientCount]    = useState<number | null>(null)
  const [navigatorCount, setNavigatorCount] = useState<number | null>(null)
  const [driverCount,    setDriverCount]    = useState<number | null>(null)
  const [weekTripCount,  setWeekTripCount]  = useState<number | null>(null)
  const [pendingClaims,  setPendingClaims]  = useState<number | null>(null)
  const [revenueMtd,     setRevenueMtd]     = useState<number | null>(null)
  const [smsPending,     setSmsPending]     = useState<number | null>(null)
  const [recentTrips,    setRecentTrips]    = useState<RecentTrip[]>([])
  const [recentSms,      setRecentSms]      = useState<RecentSmsRequest[]>([])
  const [alerts,         setAlerts]         = useState<AlertItem[]>([])
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const weekAgo  = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const ago14    = new Date(Date.now() - 14 * 86_400_000).toISOString()
      const ago25    = new Date(Date.now() - 25 * 86_400_000).toISOString()

      const [
        clientRes, navRes, driverRes, weekTripRes, smsPendingRes,
        pendingClaimsRes, revenueMtdRes,
        recentTripsRes, recentSmsRes,
        agingClaimsRes, filingAlertRes, mileageFlagRes,
      ] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('subscription_status', 'active'),
        supabase.from('navigators').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('errand_trips').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
        supabase.from('sms_errand_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('nemt_claims').select('id', { count: 'exact', head: true }).in('status', ['draft', 'ready_to_submit']),
        supabase.from('nemt_claims').select('paid_amount').eq('status', 'paid').gte('paid_at', monthStart),
        supabase.from('errand_trips')
          .select('id, service_type, status, created_at, clients(name)')
          .order('created_at', { ascending: false }).limit(5),
        supabase.from('sms_errand_requests')
          .select('id, keyword, created_at, clients(name)')
          .order('created_at', { ascending: false }).limit(3),
        // Claims aging past 14 days with no submission
        supabase.from('nemt_claims')
          .select('id, created_at, clients(name)')
          .in('status', ['draft', 'ready_to_submit'])
          .lt('created_at', ago14)
          .order('created_at')
          .limit(5),
        // Trips approaching 30-day filing deadline
        supabase.from('nemt_trips')
          .select('id, scheduled_datetime, clients(name)')
          .eq('status', 'completed')
          .lt('scheduled_datetime', ago25)
          .not('id', 'in',
            `(SELECT trip_id FROM nemt_claims WHERE status IN ('submitted','paid'))`
          )
          .order('scheduled_datetime')
          .limit(5),
        // Mileage-flagged claims awaiting review
        supabase.from('nemt_claims')
          .select('id, loaded_miles, clients(name)')
          .eq('mileage_flagged', true)
          .in('status', ['draft', 'ready_to_submit'])
          .limit(5),
      ])

      setClientCount(clientRes.count ?? 0)
      setNavigatorCount(navRes.count ?? 0)
      setDriverCount(driverRes.count ?? 0)
      setWeekTripCount(weekTripRes.count ?? 0)
      setSmsPending(smsPendingRes.count ?? 0)
      setPendingClaims(pendingClaimsRes.count ?? 0)

      const mtd = (revenueMtdRes.data ?? []).reduce(
        (s: number, r: { paid_amount: number | null }) => s + (r.paid_amount ?? 0), 0
      )
      setRevenueMtd(mtd)

      setRecentTrips((recentTripsRes.data ?? []) as unknown as RecentTrip[])
      setRecentSms((recentSmsRes.data ?? []) as unknown as RecentSmsRequest[])

      // Build alerts feed
      const alertItems: AlertItem[] = []

      for (const c of (agingClaimsRes.data ?? []) as unknown as { id: string; created_at: string; clients: { name: string } | null }[]) {
        const d = Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86_400_000)
        alertItems.push({
          id: `aging-${c.id}`, type: 'claim_aging',
          label: `Claim aging ${d} days — ${c.clients?.name ?? 'Client'}`,
          sub:   'Awaiting review or submission',
          path:  `/admin/nemt/claims/${c.id}`,
        })
      }

      for (const t of (filingAlertRes.data ?? []) as unknown as { id: string; scheduled_datetime: string; clients: { name: string } | null }[]) {
        const d = Math.floor((Date.now() - new Date(t.scheduled_datetime).getTime()) / 86_400_000)
        alertItems.push({
          id: `filing-${t.id}`, type: 'filing',
          label: `⏰ ${d}d — ${t.clients?.name ?? 'Client'} — no claim submitted`,
          sub:   'Approaching 30-day Verida timely-filing deadline',
          path:  `/admin/nemt`,
        })
      }

      for (const c of (mileageFlagRes.data ?? []) as unknown as { id: string; loaded_miles: number; clients: { name: string } | null }[]) {
        alertItems.push({
          id: `miles-${c.id}`, type: 'mileage',
          label: `${c.loaded_miles} loaded miles — ${c.clients?.name ?? 'Client'}`,
          sub:   'Mileage exceeds 100-mile threshold — review before submission',
          path:  `/admin/nemt/claims/${c.id}`,
        })
      }

      setAlerts(alertItems)
      setLoading(false)
    }
    load()
  }, [])

  const stats = [
    { label: 'Active Clients',    value: clientCount,    color: 'text-[#1a5c38]', icon: '👥' },
    { label: 'Active Navigators', value: navigatorCount, color: 'text-blue-700',  icon: '🗺️' },
    { label: 'Active Drivers',    value: driverCount,    color: 'text-amber-700', icon: '🚗' },
    { label: 'Trips This Week',   value: weekTripCount,  color: 'text-gray-900',  icon: '📦' },
    { label: 'Pending Claims',    value: pendingClaims,  color: pendingClaims ? 'text-amber-600' : 'text-gray-900', icon: '🏥' },
    { label: 'Revenue MTD',       value: revenueMtd !== null ? `$${revenueMtd.toFixed(0)}` : null, color: 'text-[#1a5c38]', icon: '💰' },
  ]

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Admin Overview</h2>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-6">
        {stats.map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 leading-tight">{card.label}</p>
              <span className="text-base">{card.icon}</span>
            </div>
            {loading ? (
              <div className="h-7 w-10 bg-gray-100 rounded animate-pulse mt-1.5" />
            ) : (
              <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value ?? '—'}</p>
            )}
          </div>
        ))}
      </div>

      {/* Alerts feed */}
      {(loading || alerts.length > 0) && (
        <section>
          <h3 className="text-base font-semibold text-gray-800 mb-2">
            🔔 Alerts
            {!loading && alerts.length > 0 && (
              <span className="ml-2 text-xs bg-red-500 text-white rounded-full px-2 py-0.5">
                {alerts.length}
              </span>
            )}
          </h3>
          <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-2">
                {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : (
              <ul className="divide-y divide-amber-100">
                {alerts.map(alert => (
                  <li
                    key={alert.id}
                    onClick={() => navigate(alert.path)}
                    className="px-4 py-3 flex items-start gap-3 hover:bg-amber-50 cursor-pointer"
                  >
                    <span className="text-lg mt-0.5 shrink-0">
                      {alert.type === 'filing' ? '⏰' : alert.type === 'mileage' ? '📏' : '🕒'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{alert.label}</p>
                      <p className="text-xs text-gray-500">{alert.sub}</p>
                    </div>
                    <span className="ml-auto text-gray-300 shrink-0">→</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Quick links */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Quick Links</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: '🚐 Errand Ops',       path: '/admin/errands' },
            { label: '🏥 NEMT Claims',       path: '/admin/nemt',          badge: pendingClaims },
            { label: '🚗 Driver Roster',     path: '/admin/drivers' },
            { label: '🤝 Ambassadors',       path: '/admin/ambassadors' },
            { label: '📱 SMS Requests',      path: '/admin/errands',       badge: smsPending },
            { label: '⚙️ Settings',          path: '/admin/more' },
          ].map(link => (
            <button
              key={link.path + link.label}
              onClick={() => navigate(link.path)}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3
                         shadow-sm hover:bg-gray-50 transition-colors text-left min-h-[52px]"
            >
              <span className="text-sm font-medium text-gray-900">{link.label}</span>
              <div className="flex items-center gap-1">
                {link.badge != null && link.badge > 0 && (
                  <span className="inline-flex items-center justify-center bg-red-500 text-white
                                   text-xs font-bold rounded-full w-5 h-5">
                    {link.badge > 9 ? '9+' : link.badge}
                  </span>
                )}
                <span className="text-gray-400 text-sm">→</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Recent Activity</h3>

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
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 cursor-pointer"
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
