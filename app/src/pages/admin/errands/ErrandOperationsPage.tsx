import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { Badge } from '../../../components/ui/Badge'
import { SERVICE_LABELS, SERVICE_EMOJI, type ServiceType, type TripStatus } from '../../../hooks/useTrips'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminTrip {
  id: string
  flat_rate: number
  driver_payout: number | null
  status: TripStatus
  service_type: ServiceType
  created_at: string
  completed_at: string | null
  no_driver_alert_sent: boolean
  clients: { name: string; county: string | null } | null
  drivers: { profiles: { name: string } | null } | null
}

interface DriverRow {
  id: string
  rating: number | null
  total_trips: number
  cancel_flag_count: number
  active: boolean
  online: boolean
  county: string | null
  profiles: { name: string } | null
}

interface Stats {
  total: number
  revenue: number
  platformTake: number
  driverPayouts: number
}

type DateRange = 'today' | 'week' | 'month' | 'all'
type StatusFilter = 'all' | 'pending' | 'assigned' | 'en_route' | 'completed' | 'canceled'

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
    pending:   'Pending',
    assigned:  'Assigned',
    en_route:  'En Route',
    completed: 'Completed',
    canceled:  'Canceled',
  }
  return map[status] ?? status
}

function formatCurrency(n: number) {
  return `$${n.toFixed(2)}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function elapsed(created_at: string): string {
  const ms = Date.now() - new Date(created_at).getTime()
  const h  = Math.floor(ms / 3_600_000)
  const m  = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m ago`
  return `${m}m ago`
}

function rangeStart(range: DateRange): string | null {
  const now = new Date()
  if (range === 'today') {
    const d = new Date(now); d.setHours(0,0,0,0); return d.toISOString()
  }
  if (range === 'week') {
    const d = new Date(now); d.setDate(d.getDate() - 7); return d.toISOString()
  }
  if (range === 'month') {
    const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString()
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ErrandOperationsPage() {
  const navigate = useNavigate()

  const [trips,          setTrips]         = useState<AdminTrip[]>([])
  const [drivers,        setDrivers]       = useState<DriverRow[]>([])
  const [stats,          setStats]         = useState<Stats>({ total: 0, revenue: 0, platformTake: 0, driverPayouts: 0 })
  const [loading,        setLoading]       = useState(true)
  const [driversLoading, setDriversLoading]= useState(true)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search,       setSearch]       = useState('')
  const [dateRange,    setDateRange]    = useState<DateRange>('week')

  // ── Fetch trips ──────────────────────────────────────────────────────────
  const fetchTrips = useCallback(async () => {
    setLoading(true)

    let q = supabase
      .from('errand_trips')
      .select('id, flat_rate, driver_payout, status, service_type, created_at, completed_at, no_driver_alert_sent, clients(name, county), drivers:driver_id(profiles(name))')
      .order('created_at', { ascending: false })

    const start = rangeStart(dateRange)
    if (start) q = q.gte('created_at', start)

    const { data, error } = await q
    if (!error && data) {
      const rows = data as unknown as AdminTrip[]
      setTrips(rows)

      // Compute stats from completed trips
      const completed = rows.filter(t => t.status === 'completed')
      const revenue       = completed.reduce((s, t) => s + (t.flat_rate ?? 0), 0)
      const driverPayouts = completed.reduce((s, t) => s + (t.driver_payout ?? 0), 0)
      setStats({
        total:       rows.length,
        revenue,
        platformTake: revenue - driverPayouts,
        driverPayouts,
      })
    }
    setLoading(false)
  }, [dateRange])

  // ── Fetch drivers ─────────────────────────────────────────────────────────
  const fetchDrivers = useCallback(async () => {
    setDriversLoading(true)
    const { data } = await supabase
      .from('drivers')
      .select('id, rating, total_trips, cancel_flag_count, active, online, county, profiles(name)')
      .order('total_trips', { ascending: false })
    if (data) setDrivers(data as unknown as DriverRow[])
    setDriversLoading(false)
  }, [])

  useEffect(() => { fetchTrips() }, [fetchTrips])
  useEffect(() => { fetchDrivers() }, [fetchDrivers])

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = trips.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const client = t.clients?.name?.toLowerCase() ?? ''
      const driver = t.drivers?.profiles?.name?.toLowerCase() ?? ''
      if (!client.includes(q) && !driver.includes(q)) return false
    }
    return true
  })

  const failedJobs = trips.filter(t => t.no_driver_alert_sent && t.status === 'pending')

  // ── Status pill tabs ──────────────────────────────────────────────────────
  const statusTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all',       label: 'All' },
    { key: 'pending',   label: 'Pending' },
    { key: 'assigned',  label: 'Active' },
    { key: 'en_route',  label: 'En Route' },
    { key: 'completed', label: 'Completed' },
    { key: 'canceled',  label: 'Canceled' },
  ]

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Errand Operations</h2>

      {/* ── Filters bar ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-cream py-2 space-y-3">
        {/* Status pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {statusTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]
                ${statusFilter === tab.key
                  ? 'bg-green text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Search */}
          <input
            type="search"
            placeholder="Search client or driver…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white min-h-[44px]
                       placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green/30"
          />
          {/* Date range */}
          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value as DateRange)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white min-h-[44px]
                       focus:outline-none focus:ring-2 focus:ring-green/30"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {/* ── Stats cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Trips',      value: stats.total.toString(),                color: 'text-gray-900' },
          { label: 'Revenue',          value: formatCurrency(stats.revenue),         color: 'text-green' },
          { label: 'Platform Take',    value: formatCurrency(stats.platformTake),    color: 'text-blue-700' },
          { label: 'Driver Payouts',   value: formatCurrency(stats.driverPayouts),   color: 'text-amber-700' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
            <p className={`text-2xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Trips table ──────────────────────────────────────────────────── */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-3">
          Trips{filtered.length > 0 && <span className="ml-2 text-gray-400 font-normal">({filtered.length})</span>}
        </h3>

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
            <p className="text-lg">No trips found.</p>
            <p className="text-sm mt-1">Try adjusting your filters.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Mobile: card list */}
            <ul className="divide-y divide-gray-100">
              {filtered.map(trip => (
                <li key={trip.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {trip.clients?.name ?? 'Unknown client'}
                        {trip.clients?.county && (
                          <span className="text-gray-400 font-normal"> · {trip.clients.county}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {SERVICE_EMOJI[trip.service_type]} {SERVICE_LABELS[trip.service_type]}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {trip.drivers?.profiles?.name ?? <span className="text-amber-600">Unassigned</span>}
                        {' · '}
                        {formatDate(trip.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge color={statusBadgeColor(trip.status)}>{statusLabel(trip.status)}</Badge>
                      <span className="text-sm font-semibold text-gray-700">{formatCurrency(trip.flat_rate)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/errands/${trip.id}`)}
                    className="mt-3 w-full text-center text-sm text-green font-medium border border-green/30
                               rounded-lg py-2 hover:bg-green/5 transition-colors min-h-[44px]"
                  >
                    View Details →
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Job Failure Log ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-base font-semibold text-gray-800">Job Failure Log</h3>
          {failedJobs.length > 0 && (
            <Badge color="red">{failedJobs.length} need{failedJobs.length === 1 ? 's' : ''} manual follow-up</Badge>
          )}
        </div>

        {failedJobs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
            No unassigned jobs requiring follow-up.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {failedJobs.map(trip => (
                <li key={trip.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{trip.clients?.name ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {SERVICE_EMOJI[trip.service_type]} {SERVICE_LABELS[trip.service_type]}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5 font-medium">{elapsed(trip.created_at)}</p>
                  </div>
                  <button
                    onClick={() => navigate(`/admin/errands/${trip.id}`)}
                    className="shrink-0 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg
                               hover:bg-red-700 transition-colors min-h-[44px]"
                  >
                    Assign Manually
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Driver Performance ────────────────────────────────────────────── */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Driver Performance</h3>

        {driversLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : drivers.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
            No drivers found.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <ul className="divide-y divide-gray-100">
              {drivers.map(driver => {
                const flagAmber  = driver.cancel_flag_count >= 3
                const ratingAmber = (driver.rating ?? 5) < 4.0
                const rowAlert   = flagAmber || ratingAmber

                const driverStatus = !driver.active ? 'Suspended' : 'Active'
                const statusColor: 'green' | 'red' | 'amber' = !driver.active ? 'red' : 'green'

                return (
                  <li key={driver.id} className={`p-4 ${rowAlert ? 'bg-amber-50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">
                          {driver.profiles?.name ?? 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {driver.county ?? 'No county'} · {driver.total_trips} trips
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          {/* Stars */}
                          <span className={`text-xs font-medium ${ratingAmber ? 'text-amber-700' : 'text-gray-600'}`}>
                            {'★'.repeat(Math.round(driver.rating ?? 0))}{'☆'.repeat(5 - Math.round(driver.rating ?? 0))}
                            {' '}
                            {driver.rating?.toFixed(1) ?? '—'}
                          </span>
                          {/* Cancel flags */}
                          <span className={`text-xs font-medium ${flagAmber ? 'text-amber-700' : 'text-gray-500'}`}>
                            {driver.cancel_flag_count} cancel flag{driver.cancel_flag_count !== 1 ? 's' : ''}
                          </span>
                          {/* Online dot */}
                          {driver.active && (
                            <span className={`inline-flex items-center gap-1 text-xs ${driver.online ? 'text-green' : 'text-gray-400'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${driver.online ? 'bg-green' : 'bg-gray-300'}`} />
                              {driver.online ? 'Online' : 'Offline'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Badge color={statusColor}>{driverStatus}</Badge>
                        <button
                          onClick={() => navigate(`/admin/drivers/${driver.id}`)}
                          className="text-xs text-green font-medium hover:underline min-h-[36px] flex items-center"
                        >
                          View Profile →
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
