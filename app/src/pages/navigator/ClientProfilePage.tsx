import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useClient } from '../../hooks/useClients'
import { useSessions } from '../../hooks/useSessions'
import { useTasks } from '../../hooks/useTasks'
import { supabase } from '../../lib/supabase'
import { DocumentVaultPage } from './documents/DocumentVaultPage'
import { SessionHistoryPage } from './sessions/SessionHistoryPage'
import { TaskListPage } from './tasks/TaskListPage'
import type { RecommendedProgram } from '../../lib/benefitsScreener'
import { useNemtTrips, NEMT_TRIP_TYPE_EMOJI, NEMT_TRIP_TYPE_LABELS } from '../../hooks/useNemt'
import { Badge } from '../../components/ui/Badge'

type Tab = 'overview' | 'tasks' | 'sessions' | 'documents' | 'nemt' | 'info'

interface BenefitsScreening {
  id: string
  results: RecommendedProgram[]
  answers: Record<string, unknown> | null
  created_at: string
}

// Key documents that should be in vault for complete client records
const KEY_DOC_TYPES: { type: string; label: string; when?: (c: ReturnType<typeof useClient>['client']) => boolean }[] = [
  { type: 'medicare_card',    label: 'Medicare Card' },
  { type: 'ssn_card',         label: 'Social Security Card' },
  { type: 'insurance_card',   label: 'Insurance Card' },
  { type: 'dd214',            label: 'DD-214', when: c => !!c?.va_status },
]

interface InfoForm {
  name: string
  dob: string
  phone: string
  address: string
  zip: string
  county: string
  income_level: string
  insurance_info: string
  va_status: boolean
}

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const TIER_COLORS: Record<string, string> = {
  essential:   'bg-gray-100 text-gray-700',
  standard:    'bg-blue-100 text-blue-800',
  comprehensive: 'bg-purple-100 text-purple-800',
}
const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-800',
  past_due: 'bg-amber-100 text-amber-800',
  inactive: 'bg-gray-100 text-gray-600',
  canceled: 'bg-red-100 text-red-700',
}

function NemtTab({ clientId, clientName, navigate }: { clientId: string; clientName: string; navigate: (to: string) => void }) {
  const { trips, loading } = useNemtTrips(clientId)

  if (loading) {
    return <div className="p-4 space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">NEMT Trips</h3>
        <button
          onClick={() => navigate(`/nav/nemt/new?clientId=${clientId}`)}
          className="bg-[#1a5c38] text-white text-sm px-3 py-1.5 rounded-xl font-medium"
        >
          + Book Trip
        </button>
      </div>

      {trips.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-3xl mb-2">🏥</p>
          <p className="text-sm font-medium text-gray-500">No NEMT trips for {clientName}.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {trips.map(trip => {
            const statusColor = trip.status === 'completed' ? 'green'
              : trip.status === 'canceled'  ? 'red'
              : trip.status === 'en_route'  ? 'blue'
              : trip.status === 'assigned'  ? 'amber' : 'gray'
            return (
              <li
                key={trip.id}
                onClick={() => navigate(`/nav/nemt/${trip.id}`)}
                className="bg-white border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-[#1a5c38] transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span>{NEMT_TRIP_TYPE_EMOJI[trip.trip_type]}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{NEMT_TRIP_TYPE_LABELS[trip.trip_type]}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(trip.scheduled_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <Badge color={statusColor as 'green' | 'red' | 'blue' | 'amber' | 'gray'}>
                    {trip.status === 'completed' ? 'Done' : trip.status === 'canceled' ? 'Canceled' :
                     trip.status === 'en_route'  ? 'En route' : trip.status === 'assigned' ? 'Assigned' : 'Pending'}
                  </Badge>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const id = clientId ?? ''

  const { client, loading: clientLoading } = useClient(id)
  const { sessions } = useSessions(id)
  const { tasks } = useTasks(id)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Benefits screening
  const [screening, setScreening] = useState<BenefitsScreening | null>(null)
  const [screeningLoaded, setScreeningLoaded] = useState(false)

  // Document gap tracking (doc types present in vault)
  const [uploadedDocTypes, setUploadedDocTypes] = useState<Set<string>>(new Set())

  // Navigator name
  const [navigatorName, setNavigatorName] = useState<string>('')

  // Info form state
  const [infoForm, setInfoForm]   = useState<InfoForm | null>(null)
  const [infoSaving, setInfoSaving] = useState(false)
  const [infoSaved, setInfoSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase
      .from('benefits_screenings')
      .select('id, results, answers, created_at')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setScreening(data as BenefitsScreening | null)
        setScreeningLoaded(true)
      })
  }, [id])

  useEffect(() => {
    if (!id) return
    supabase
      .from('documents')
      .select('document_type')
      .eq('client_id', id)
      .then(({ data }) => {
        setUploadedDocTypes(new Set((data ?? []).map((d: { document_type: string }) => d.document_type)))
      })
  }, [id])

  useEffect(() => {
    if (!client?.navigator_id) return
    supabase
      .from('profiles')
      .select('name, email')
      .eq('id', client.navigator_id)
      .single()
      .then(({ data }) => {
        if (data) setNavigatorName(data.name ?? data.email ?? '')
      })
  }, [client?.navigator_id])

  useEffect(() => {
    if (!client) return
    setInfoForm({
      name:           client.name,
      dob:            client.dob ?? '',
      phone:          client.phone,
      address:        client.address ?? '',
      zip:            client.zip ?? '',
      county:         client.county ?? '',
      income_level:   client.income_level ?? '',
      insurance_info: client.insurance_info ? JSON.stringify(client.insurance_info) : '',
      va_status:      client.va_status,
    })
  }, [client])

  async function handleInfoSave(e: React.FormEvent) {
    e.preventDefault()
    if (!infoForm || !id) return
    setInfoSaving(true)
    const { error } = await supabase.from('clients').update({
      name:         infoForm.name,
      dob:          infoForm.dob || null,
      phone:        infoForm.phone,
      address:      infoForm.address || null,
      zip:          infoForm.zip || null,
      county:       infoForm.county || null,
      income_level: infoForm.income_level || null,
      va_status:    infoForm.va_status,
    }).eq('id', id)
    setInfoSaving(false)
    if (!error) {
      setInfoSaved(true)
      setTimeout(() => setInfoSaved(false), 2000)
    }
  }

  const openTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'canceled')
  const lastSession = sessions[0]

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'tasks',      label: 'Tasks' },
    { id: 'sessions',   label: 'Sessions' },
    { id: 'documents',  label: 'Documents' },
    { id: 'nemt',       label: 'NEMT' },
    { id: 'info',       label: 'Info' },
  ]

  const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-700 bg-white'
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'

  if (clientLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-28 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="p-4 text-center text-gray-500 py-12">
        <p className="text-lg font-medium">Client not found.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-green-700 underline text-sm"
        >
          Go back
        </button>
      </div>
    )
  }

  const tierBadgeCls = TIER_COLORS[client.subscription_tier ?? ''] ?? 'bg-gray-100 text-gray-700'
  const statusBadgeCls = STATUS_COLORS[client.subscription_status] ?? STATUS_COLORS['inactive']

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Back button */}
      <div className="bg-green-700 px-4 pt-4 pb-3">
        <button
          onClick={() => navigate(-1)}
          className="text-white/80 hover:text-white text-sm flex items-center gap-1 min-h-[44px]"
        >
          ← Back
        </button>
      </div>

      {/* Header card */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{client.name}</h1>
          <div className="flex gap-1 flex-wrap justify-end">
            {client.subscription_tier && (
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${tierBadgeCls}`}>
                {client.subscription_tier}
              </span>
            )}
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadgeCls}`}>
              {client.subscription_status}
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-600">{client.phone}</p>
        {client.county && (
          <p className="text-sm text-gray-500">{client.county} County</p>
        )}
        <p className="text-xs text-gray-400 mt-1">
          {lastSession
            ? `Last session: ${formatDate(lastSession.date)}`
            : 'No sessions yet'}
        </p>
        {navigatorName && (
          <p className="text-xs text-gray-400">Navigator: {navigatorName}</p>
        )}
        {/* Document gap indicator */}
        {(() => {
          const missing = KEY_DOC_TYPES
            .filter(doc => !doc.when || doc.when(client))
            .filter(doc => !uploadedDocTypes.has(doc.type))
          if (missing.length === 0) return null
          return (
            <button
              onClick={() => setActiveTab('documents')}
              className="mt-2 w-full text-left text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
            >
              Missing: {missing.map(d => d.label).join(', ')} →
            </button>
          )
        })()}
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 flex overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors min-h-[48px]
              ${activeTab === tab.id
                ? 'border-green-700 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pb-24">

        {/* === OVERVIEW === */}
        {activeTab === 'overview' && (
          <div className="p-4 space-y-5">
            {/* Benefits screener */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Benefits Screener</h2>
              </div>
              <div className="p-4">
                {!screeningLoaded ? (
                  <div className="h-12 bg-gray-100 rounded-lg animate-pulse" />
                ) : !screening ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 mb-3">No benefits screener completed yet.</p>
                    <Link
                      to={`/nav/clients/${id}/screener`}
                      className="inline-block bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg min-h-[44px] flex items-center"
                    >
                      Run Screener →
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(screening.results ?? []).slice(0, 5).map((program: RecommendedProgram) => (
                      <div key={program.programId} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{program.programName}</p>
                          {program.estimatedAnnualValue > 0 && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              Up to ${program.estimatedAnnualValue.toLocaleString()}/year
                            </p>
                          )}
                        </div>
                        <Link
                          to={`/nav/tasks/new?clientId=${id}&programId=${program.programId}`}
                          className="shrink-0 text-xs text-green-700 border border-green-200 rounded-lg px-2 py-1 min-h-[36px] flex items-center hover:bg-green-50"
                        >
                          Create Task →
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Grief/isolation navigator note — not visible to family proxy or senior */}
            {screening?.answers?.q18_surviving_spouse === 'yes' && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-xs text-purple-800">
                <strong>Navigator note:</strong> This client may be recently widowed. Consider extra check-ins during the first 30 days and look into grief support resources.
              </div>
            )}

            {/* Active tasks mini list */}
            <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">
                  Open Tasks <span className="text-green-700 ml-1">({openTasks.length})</span>
                </h2>
                <button
                  onClick={() => setActiveTab('tasks')}
                  className="text-xs text-green-700 min-h-[36px] px-2"
                >
                  View all
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {openTasks.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-500">No open tasks.</p>
                ) : (
                  openTasks.slice(0, 3).map(task => (
                    <div key={task.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{task.title}</p>
                      <p className="text-xs text-gray-500 capitalize mt-0.5">{task.status.replace('_', ' ')}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Quick log session */}
            <div className="flex gap-3">
              <Link
                to={`/nav/clients/${id}/sessions/new`}
                className="flex-1 flex items-center justify-center bg-green-700 text-white font-semibold py-3 rounded-xl text-sm min-h-[48px] hover:bg-green-800"
              >
                ＋ Log Session
              </Link>
              {lastSession && (
                <button
                  onClick={() => setActiveTab('sessions')}
                  className="flex-1 border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl text-sm min-h-[48px] hover:bg-gray-50"
                >
                  View Sessions
                </button>
              )}
            </div>
          </div>
        )}

        {/* === TASKS === */}
        {activeTab === 'tasks' && (
          <div>
            <div className="px-4 pt-4 flex justify-end">
              <Link
                to={`/nav/tasks/new?clientId=${id}`}
                className="inline-flex items-center gap-1 bg-green-700 text-white text-sm font-medium px-3 py-2 rounded-lg min-h-[48px]"
              >
                ＋ New Task
              </Link>
            </div>
            <TaskListPage />
          </div>
        )}

        {/* === SESSIONS === */}
        {activeTab === 'sessions' && (
          <div>
            <div className="px-4 pt-4 flex justify-end">
              <Link
                to={`/nav/clients/${id}/sessions/new`}
                className="inline-flex items-center gap-1 bg-green-700 text-white text-sm font-medium px-3 py-2 rounded-lg min-h-[48px]"
              >
                ＋ Log Session
              </Link>
            </div>
            <SessionHistoryPage clientId={id} />
          </div>
        )}

        {/* === DOCUMENTS === */}
        {activeTab === 'documents' && (
          <DocumentVaultPage clientId={id} clientName={client.name} />
        )}

        {/* === NEMT === */}
        {activeTab === 'nemt' && (
          <NemtTab clientId={id} clientName={client.name} navigate={navigate} />
        )}

        {/* === INFO === */}
        {activeTab === 'info' && infoForm && (
          <form onSubmit={handleInfoSave} className="p-4 space-y-5 pb-24">
            <div>
              <label className={labelCls}>Full Name</label>
              <input
                type="text"
                value={infoForm.name}
                onChange={e => setInfoForm(prev => prev ? { ...prev, name: e.target.value } : prev)}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input
                type="date"
                value={infoForm.dob}
                onChange={e => setInfoForm(prev => prev ? { ...prev, dob: e.target.value } : prev)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                value={infoForm.phone}
                onChange={e => setInfoForm(prev => prev ? { ...prev, phone: e.target.value } : prev)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input
                type="text"
                value={infoForm.address}
                onChange={e => setInfoForm(prev => prev ? { ...prev, address: e.target.value } : prev)}
                className={inputCls}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelCls}>ZIP Code</label>
                <input
                  type="text"
                  value={infoForm.zip}
                  onChange={e => setInfoForm(prev => prev ? { ...prev, zip: e.target.value } : prev)}
                  className={inputCls}
                  maxLength={10}
                />
              </div>
              <div className="flex-1">
                <label className={labelCls}>County</label>
                <input
                  type="text"
                  value={infoForm.county}
                  onChange={e => setInfoForm(prev => prev ? { ...prev, county: e.target.value } : prev)}
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Income Level</label>
              <select
                value={infoForm.income_level}
                onChange={e => setInfoForm(prev => prev ? { ...prev, income_level: e.target.value } : prev)}
                className={inputCls}
              >
                <option value="">Select…</option>
                <option value="under_500">Under $500/month</option>
                <option value="500_1000">$500 – $1,000/month</option>
                <option value="1000_1500">$1,000 – $1,500/month</option>
                <option value="1500_2000">$1,500 – $2,000/month</option>
                <option value="over_2000">Over $2,000/month</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Insurance Info</label>
              <input
                type="text"
                value={infoForm.insurance_info}
                onChange={e => setInfoForm(prev => prev ? { ...prev, insurance_info: e.target.value } : prev)}
                className={inputCls}
                placeholder="e.g. Medicaid, Medicare Part A/B"
              />
            </div>
            <div>
              <label className={`flex items-center gap-3 cursor-pointer min-h-[48px]`}>
                <input
                  type="checkbox"
                  checked={infoForm.va_status}
                  onChange={e => setInfoForm(prev => prev ? { ...prev, va_status: e.target.checked } : prev)}
                  className="w-5 h-5 rounded accent-green-700"
                />
                <span className="text-sm font-semibold text-gray-700">Veteran / VA Status</span>
              </label>
            </div>
            <button
              type="submit"
              disabled={infoSaving}
              className="w-full bg-green-700 text-white font-semibold py-4 rounded-xl text-base
                         hover:bg-green-800 active:bg-green-900 disabled:opacity-50 transition-colors min-h-[56px]"
            >
              {infoSaving ? 'Saving…' : infoSaved ? '✓ Saved' : 'Save Changes'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
