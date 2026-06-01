import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useOffline } from '../../hooks/useOffline'
import { SkeletonCard } from '../../components/ui/Skeleton'

interface Client {
  id: string
  name: string
  phone: string
  county: string | null
  subscription_status: string
  subscription_tier: string | null
}

interface AgendaItem {
  type: 'nemt' | 'task' | 'sms'
  id: string
  label: string
  sub: string
  path: string
}

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-800',
  past_due: 'bg-amber-100 text-amber-800',
  inactive: 'bg-gray-100 text-gray-600',
  canceled: 'bg-red-100 text-red-700',
}

const AGENDA_EMOJI: Record<AgendaItem['type'], string> = {
  nemt: '🏥',
  task: '✅',
  sms:  '📱',
}

interface RenewalAlert {
  id:               string
  client_id:        string
  client_name:      string
  program_name:     string
  days_until_renewal: number
}

export function NavigatorDashboard() {
  const [clients,        setClients]        = useState<Client[]>([])
  const [agenda,         setAgenda]         = useState<AgendaItem[]>([])
  const [overdueIds,     setOverdueIds]     = useState<Set<string>>(new Set())
  const [renewalAlerts,  setRenewalAlerts]  = useState<RenewalAlert[]>([])
  const [benefitsImpact, setBenefitsImpact] = useState(0)
  const [loading,        setLoading]        = useState(true)
  const [queryError,     setQueryError]     = useState<string | null>(null)
  const [debugUid,       setDebugUid]       = useState<string | null>(null)
  const { isOffline, pendingCount } = useOffline()
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setQueryError(null)

    // Capture auth UID for diagnostics
    const { data: { user } } = await supabase.auth.getUser()
    setDebugUid(user?.id ?? null)

    const today     = new Date().toISOString().slice(0, 10)
    const todayStart = `${today}T00:00:00`
    const todayEnd   = `${today}T23:59:59`

    const [
      clientsRes,
      nemtTodayRes,
      overdueTasksRes,
      smsRes,
      renewalsRes,
      impactRes,
    ] = await Promise.all([
      supabase
        .from('clients')
        .select('id,name,phone,county,subscription_status,subscription_tier')
        .order('name'),
      supabase
        .from('nemt_trips')
        .select('id, scheduled_datetime, trip_type, status, clients(name)')
        .gte('scheduled_datetime', todayStart)
        .lte('scheduled_datetime', todayEnd)
        .not('status', 'in', '("canceled","completed")')
        .order('scheduled_datetime'),
      supabase
        .from('tasks')
        .select('client_id')
        .lt('due_date', today)
        .not('status', 'in', '("completed","canceled")'),
      supabase
        .from('sms_errand_requests')
        .select('id, keyword, created_at, clients(id,name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5),
      // Renewal alerts for navigator's clients
      supabase
        .from('benefit_renewal_alerts')
        .select('id,client_id,client_name,program_name,days_until_renewal,navigator_id')
        .eq('navigator_id', user?.id ?? '')
        .order('days_until_renewal'),
      // Benefits impact: sum estimated_annual_value for enrolled programs for navigator's clients
      supabase
        .from('benefit_enrollments')
        .select('estimated_annual_value, clients!inner(navigator_id)')
        .eq('clients.navigator_id', user?.id ?? '')
        .eq('status', 'enrolled'),
    ])

    if (clientsRes.error) {
      setQueryError(`Clients query error: ${clientsRes.error.message} (code: ${clientsRes.error.code})`)
    }
    setClients((clientsRes.data ?? []) as Client[])

    setRenewalAlerts((renewalsRes.data ?? []) as unknown as RenewalAlert[])

    const impact = ((impactRes.data ?? []) as unknown as { estimated_annual_value: number }[])
      .reduce((sum, r) => sum + (r.estimated_annual_value ?? 0), 0)
    setBenefitsImpact(Math.round(impact))

    // Build overdue client ID set
    const overdue = new Set<string>(
      (overdueTasksRes.data ?? []).map((t: { client_id: string }) => t.client_id)
    )
    setOverdueIds(overdue)

    // Build Today's Agenda
    const items: AgendaItem[] = []

    for (const trip of (nemtTodayRes.data ?? []) as unknown as {
      id: string; scheduled_datetime: string; trip_type: string; status: string;
      clients: { name: string } | null
    }[]) {
      const time = new Date(trip.scheduled_datetime).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit',
      })
      items.push({
        type: 'nemt',
        id:   trip.id,
        label: `${trip.clients?.name ?? 'Client'} — NEMT`,
        sub:  `${time} · ${trip.trip_type} · ${trip.status}`,
        path: `/nav/nemt/${trip.id}`,
      })
    }

    for (const req of (smsRes.data ?? []) as unknown as {
      id: string; keyword: string; created_at: string;
      clients: { id: string; name: string } | null
    }[]) {
      items.push({
        type:  'sms',
        id:    req.id,
        label: `${req.clients?.name ?? 'Client'} — ${req.keyword} request`,
        sub:   'Pending SMS request',
        path:  `/nav/clients/${req.clients?.id ?? ''}`,
      })
    }

    setAgenda(items)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-4 space-y-4">
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <strong>Offline mode.</strong> Changes will sync when you reconnect.
          {pendingCount > 0 && ` (${pendingCount} pending)`}
        </div>
      )}

      {/* Benefits impact counter */}
      {benefitsImpact > 0 && (
        <div className="bg-[#1a5c38]/5 border border-[#1a5c38]/20 rounded-xl p-4">
          <p className="text-sm text-[#1a5c38] font-semibold">
            💚 You've helped unlock{' '}
            <span className="text-base font-bold">
              ${benefitsImpact >= 1000
                ? `${(benefitsImpact / 1000).toFixed(1)}k`
                : benefitsImpact.toLocaleString()}
            </span>
            {' '}in benefits for your clients
          </p>
        </div>
      )}

      {/* Renewal Alerts */}
      {!loading && renewalAlerts.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-gray-800 mb-2">🔔 Renewal Alerts</h3>
          <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <ul className="divide-y divide-amber-100">
              {renewalAlerts.slice(0, 5).map(alert => (
                <li
                  key={alert.id}
                  onClick={() => navigate(`/nav/clients/${alert.client_id}`)}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-amber-100/50 cursor-pointer"
                >
                  <span className="text-lg shrink-0">📋</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-amber-900 truncate">
                      {alert.program_name}
                    </p>
                    <p className="text-xs text-amber-700">
                      {alert.client_name} · {alert.days_until_renewal <= 0
                        ? 'Overdue!'
                        : `${alert.days_until_renewal} days`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full
                    ${alert.days_until_renewal <= 14
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'}`}>
                    {alert.days_until_renewal <= 0 ? 'Overdue' : `${alert.days_until_renewal}d`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Today's Agenda */}
      {(loading || agenda.length > 0) && (
        <section>
          <h3 className="text-base font-semibold text-gray-800 mb-2">Today's Agenda</h3>
          {loading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <ul className="divide-y divide-gray-100">
                {agenda.map(item => (
                  <li
                    key={item.id}
                    onClick={() => item.path && navigate(item.path)}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <span className="text-xl shrink-0">{AGENDA_EMOJI[item.type]}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                      <p className="text-xs text-gray-400">{item.sub}</p>
                    </div>
                    <span className="ml-auto text-gray-300 shrink-0">→</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Client list */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">My Clients</h2>
        <span className="text-sm text-gray-500">{clients.length} total</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {queryError ? (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-left">
              <p className="text-sm font-semibold text-red-800 mb-1">Query Error</p>
              <p className="text-xs text-red-700 break-all">{queryError}</p>
              {debugUid && (
                <p className="text-xs text-red-600 mt-1">Your UID: <code className="font-mono">{debugUid}</code></p>
              )}
            </div>
          ) : (
            debugUid && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left">
                <p className="text-xs text-amber-700">
                  No clients matched. Your auth UID is <code className="font-mono text-xs">{debugUid}</code>.
                  Verify this matches <code className="font-mono text-xs">clients.navigator_id</code> in Supabase.
                </p>
              </div>
            )
          )}
          <p className="text-4xl mb-3">👥</p>
          <p className="text-base font-medium">No clients yet.</p>
          <p className="text-sm mt-1">
            <button
              onClick={() => navigate('/nav/onboard')}
              className="text-[#1a5c38] font-medium underline"
            >
              Onboard your first client →
            </button>
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {clients.map(client => {
            const needsAttention = overdueIds.has(client.id)
            return (
              <li key={client.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{client.name}</p>
                      {needsAttention && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                          ⚠️ Needs Attention
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{client.phone}</p>
                    {client.county && (
                      <p className="text-xs text-gray-400 mt-0.5">{client.county} County</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[client.subscription_status] ?? STATUS_COLORS['inactive']}`}>
                    {client.subscription_tier ?? client.subscription_status}
                  </span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => navigate(`/nav/clients/${client.id}/sessions/new`)}
                    className="flex-1 bg-[#1a5c38] text-white text-sm font-medium py-2.5 rounded-lg
                               hover:bg-[#2d7a50] active:bg-[#0f3d25] transition-colors"
                  >
                    Log Session
                  </button>
                  <button
                    onClick={() => navigate(`/nav/clients/${client.id}`)}
                    className="flex-1 border border-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-lg
                               hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    View Profile
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
