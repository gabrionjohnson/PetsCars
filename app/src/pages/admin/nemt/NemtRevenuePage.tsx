import { useNemtClaims, NEMT_TRIP_TYPE_LABELS, type NemtTripType } from '../../../hooks/useNemt'

function fmt(n: number | null | undefined): string {
  if (n == null) return '$0.00'
  return `$${n.toFixed(2)}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function monthKey(iso: string): string {
  return iso.slice(0, 7) // "YYYY-MM"
}

function monthLabel(key: string): string {
  return new Date(`${key}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export function NemtRevenuePage() {
  const { claims, loading } = useNemtClaims()

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  const thisMonth = new Date().toISOString().slice(0, 7)

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const billed     = claims.filter(c => ['submitted','paid'].includes(c.status)).reduce((s,c) => s + (c.total_billed ?? 0), 0)
  const paid       = claims.filter(c => c.status === 'paid').reduce((s,c) => s + (c.paid_amount ?? 0), 0)
  const pending    = claims.filter(c => c.status === 'submitted').reduce((s,c) => s + (c.total_billed ?? 0), 0)
  const paidThisMonth = claims
    .filter(c => c.status === 'paid' && c.paid_at && monthKey(c.paid_at) === thisMonth)
    .reduce((s,c) => s + (c.paid_amount ?? 0), 0)
  const totalPaid   = claims.filter(c => c.status === 'paid').length
  const totalDenied = claims.filter(c => c.status === 'denied').length
  const cleanRate   = totalPaid + totalDenied > 0
    ? Math.round(totalPaid / (totalPaid + totalDenied) * 100)
    : null
  const milesArr    = claims.filter(c => c.loaded_miles != null).map(c => c.loaded_miles!)
  const avgMiles    = milesArr.length ? (milesArr.reduce((s,m) => s+m, 0) / milesArr.length).toFixed(1) : null

  // ── By type ───────────────────────────────────────────────────────────────
  const byType = (['ambulatory','wheelchair','stretcher'] as NemtTripType[]).map(t => {
    const subset = claims.filter(c => c.trip_type === t && ['submitted','paid'].includes(c.status))
    const paidSubset = claims.filter(c => c.trip_type === t && c.status === 'paid')
    return {
      type:    t,
      count:   subset.length,
      avgBill: subset.length ? subset.reduce((s,c) => s+(c.total_billed??0), 0) / subset.length : 0,
      total:   paidSubset.reduce((s,c) => s+(c.paid_amount??0), 0),
    }
  })

  // ── Recent payments ───────────────────────────────────────────────────────
  const recentPaid = [...claims]
    .filter(c => c.status === 'paid' && c.paid_at)
    .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
    .slice(0, 10)

  // ── Monthly trend (last 6 months) ─────────────────────────────────────────
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    months.push(d.toISOString().slice(0, 7))
  }
  const monthlyData = months.map(m => ({
    month: m,
    count: claims.filter(c => c.status === 'paid' && c.paid_at && monthKey(c.paid_at) === m).length,
    total: claims.filter(c => c.status === 'paid' && c.paid_at && monthKey(c.paid_at) === m)
                 .reduce((s,c) => s+(c.paid_amount??0), 0),
  }))

  return (
    <div className="p-4 space-y-5">
      <h2 className="text-xl font-bold text-gray-900">NEMT Revenue</h2>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Total Billed" value={fmt(billed)} sub="submitted + paid" />
        <KpiCard label="Total Paid" value={fmt(paid)} />
        <KpiCard label="Pending Payment" value={fmt(pending)} sub="submitted to Verida" />
        <KpiCard label="This Month Paid" value={fmt(paidThisMonth)} />
        <KpiCard
          label="Clean Claim Rate"
          value={cleanRate != null ? `${cleanRate}%` : '—'}
          sub="target ≥ 95%"
        />
        <KpiCard label="Avg Loaded Miles" value={avgMiles ? `${avgMiles} mi` : '—'} />
      </div>

      {/* By trip type */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">By Trip Type</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Type</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Trips</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Avg Billed</th>
              <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Total Paid</th>
            </tr>
          </thead>
          <tbody>
            {byType.map(row => (
              <tr key={row.type} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">{NEMT_TRIP_TYPE_LABELS[row.type]}</td>
                <td className="px-4 py-2 text-right text-gray-700">{row.count}</td>
                <td className="px-4 py-2 text-right text-gray-700">{row.count > 0 ? fmt(row.avgBill) : '—'}</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{fmt(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Monthly trend */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Monthly Payments (Last 6 Months)</h3>
        </div>
        <ul className="divide-y divide-gray-100">
          {monthlyData.map(row => (
            <li key={row.month} className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-700">{monthLabel(row.month)}</span>
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500">{row.count} trip{row.count !== 1 ? 's' : ''}</span>
                <span className="text-sm font-semibold text-gray-900">{fmt(row.total)}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Recent payments */}
      {recentPaid.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Recent Payments</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {recentPaid.map(c => (
              <li key={c.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 font-mono">{c.medicaid_id}</p>
                    <p className="text-xs text-gray-500">{NEMT_TRIP_TYPE_LABELS[c.trip_type]} · {fmtDate(c.paid_at)}</p>
                    {c.verida_claim_id && <p className="text-xs text-gray-400 font-mono">{c.verida_claim_id}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-green-700">{fmt(c.paid_amount)}</p>
                    <p className="text-xs text-gray-400">billed: {fmt(c.total_billed)}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
