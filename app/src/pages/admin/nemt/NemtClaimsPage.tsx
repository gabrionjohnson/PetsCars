import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useNemtClaims,
  NEMT_TRIP_TYPE_LABELS,
  NEMT_TRIP_TYPE_EMOJI,
  NEMT_CLAIM_STATUS_LABELS,
  NEMT_CLAIM_STATUS_COLOR,
  type NemtClaim,
  type NemtClaimStatus,
} from '../../../hooks/useNemt'
import { Badge } from '../../../components/ui/Badge'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toFixed(2)}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

function SummaryStats() {
  const { claims: draftClaims,   loading: l1 } = useNemtClaims('draft')
  const { claims: readyClaims,   loading: l2 } = useNemtClaims('ready_to_submit')
  const { claims: submitClaims,  loading: l3 } = useNemtClaims('submitted')
  const { claims: paidClaims,    loading: l4 } = useNemtClaims('paid')

  const loading = l1 || l2 || l3 || l4

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const totalReadyAmt = readyClaims.reduce((s, c) => s + (c.total_billed ?? 0), 0)
  const totalSubmittedAmt = submitClaims.reduce((s, c) => s + (c.total_billed ?? 0), 0)
  const paidThisMonth = paidClaims
    .filter(c => c.paid_at && c.paid_at >= monthStart)
    .reduce((s, c) => s + (c.paid_amount ?? 0), 0)

  const stats = [
    { label: 'Needs Review',         value: loading ? '…' : draftClaims.length.toString(), color: 'text-gray-700' },
    { label: 'Ready to Submit ($)',   value: loading ? '…' : fmt(totalReadyAmt),            color: 'text-blue-700' },
    { label: 'Submitted ($)',         value: loading ? '…' : fmt(totalSubmittedAmt),         color: 'text-amber-700' },
    { label: 'Paid This Month ($)',   value: loading ? '…' : fmt(paidThisMonth),             color: 'text-green-700' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
          <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ─── Claim Card ───────────────────────────────────────────────────────────────

function ClaimCard({ claim }: { claim: NemtClaim }) {
  const navigate = useNavigate()
  const color = NEMT_CLAIM_STATUS_COLOR[claim.status] as 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'orange'

  const gps     = claim.gps_pickup_coords != null
  const pickSig = claim.pickup_signature_url != null
  const dropSig = claim.dropoff_signature_url != null
  const check   = claim.pre_trip_checklist_completed

  return (
    <li
      className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => navigate(`/admin/nemt/claims/${claim.id}`)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Top row: medicaid id + trip date */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm">{claim.medicaid_id}</span>
            <span className="text-gray-400 text-xs">·</span>
            <span className="text-xs text-gray-500">{fmtDate(claim.trip_date)}</span>
          </div>

          {/* Trip type */}
          <p className="text-xs text-gray-600 mt-0.5">
            {NEMT_TRIP_TYPE_EMOJI[claim.trip_type]} {NEMT_TRIP_TYPE_LABELS[claim.trip_type]}
          </p>

          {/* Loaded miles */}
          {claim.loaded_miles == null ? (
            <p className="text-xs text-amber-700 font-medium mt-0.5">⚠ Miles not set</p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">{claim.loaded_miles} loaded miles</p>
          )}

          {/* Compliance row */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <CompliancePip label="GPS" ok={gps} />
            <CompliancePip label="Pickup sig" ok={pickSig} />
            <CompliancePip label="Dropoff sig" ok={dropSig} />
            <CompliancePip label="Checklist" ok={check} />
          </div>

          {/* Verida claim ID */}
          {claim.verida_claim_id && (
            <p className="text-xs text-gray-400 mt-1">Verida: {claim.verida_claim_id}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <Badge color={color}>{NEMT_CLAIM_STATUS_LABELS[claim.status]}</Badge>
          <span className="text-sm font-semibold text-gray-700">{fmt(claim.total_billed)}</span>
        </div>
      </div>
    </li>
  )
}

function CompliancePip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

// ─── Tab Panel ────────────────────────────────────────────────────────────────

function ClaimsTab({ statuses }: { statuses: NemtClaimStatus | NemtClaimStatus[] }) {
  const { claims, loading, error } = useNemtClaims(statuses)

  if (loading) {
    return (
      <div className="space-y-2 mt-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  if (error) {
    return <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
  }

  if (claims.length === 0) {
    return (
      <div className="mt-4 text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-200">
        <p className="text-lg">No claims here.</p>
      </div>
    )
  }

  return (
    <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {claims.map(c => <ClaimCard key={c.id} claim={c} />)}
      </ul>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabKey = 'draft' | 'ready_to_submit' | 'submitted' | 'denied'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'draft',            label: 'Needs Review' },
  { key: 'ready_to_submit',  label: 'Ready to Submit' },
  { key: 'submitted',        label: 'Submitted' },
  { key: 'denied',           label: 'Denied / Resubmit' },
]

const TAB_STATUSES: Record<TabKey, NemtClaimStatus | NemtClaimStatus[]> = {
  draft:           'draft',
  ready_to_submit: 'ready_to_submit',
  submitted:       'submitted',
  denied:          ['denied', 'needs_resubmission'],
}

export function NemtClaimsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('draft')

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">NEMT Claims</h2>

      {/* Summary stats */}
      <SummaryStats />

      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[36px]
              ${activeTab === tab.key
                ? 'bg-[#1a5c38] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <ClaimsTab statuses={TAB_STATUSES[activeTab]} />
    </div>
  )
}
