import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'

interface LedgerRow {
  id:           string
  event_type:   string
  gross_amount: number
  platform_fee: number
  net_amount:   number
  period_start: string
  period_end:   string
  payout_id:    string | null
  created_at:   string
}

interface PayoutRow {
  id:                 string
  amount:             number
  status:             string
  period_start:       string
  period_end:         string
  stripe_transfer_id: string | null
  paid_at:            string | null
  created_at:         string
}

const EVENT_LABELS: Record<string, string> = {
  session:  'Navigator session',
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtPeriod(start: string, end: string) {
  const s = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const e = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${s} – ${e}`
}

export function NavigatorEarningsPage() {
  const { user } = useAuth()
  const [ledger,   setLedger]   = useState<LedgerRow[]>([])
  const [payouts,  setPayouts]  = useState<PayoutRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState<'current' | 'history' | 'payouts'>('current')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    const [ledRes, payRes] = await Promise.all([
      supabase
        .from('payout_ledger')
        .select('id, event_type, gross_amount, platform_fee, net_amount, period_start, period_end, payout_id, created_at')
        .eq('recipient_type', 'navigator')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('payouts')
        .select('id, amount, status, period_start, period_end, stripe_transfer_id, paid_at, created_at')
        .eq('recipient_type', 'navigator')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    setLedger((ledRes.data ?? []) as LedgerRow[])
    setPayouts((payRes.data ?? []) as PayoutRow[])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  const pendingRows = ledger.filter(l => !l.payout_id)
  const pendingNet  = pendingRows.reduce((s, l) => s + l.net_amount, 0)
  const totalNet    = ledger.reduce((s, l) => s + l.net_amount, 0)
  const lastPayout  = payouts[0] ?? null

  // Current period rows — period_start matches latest pending
  const currentPeriodRows = pendingRows

  function nextPayoutDate() {
    const d = new Date()
    const day = d.getDate()
    if (day <= 15) {
      d.setDate(16)
    } else {
      d.setMonth(d.getMonth() + 1)
      d.setDate(1)
    }
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900">My Earnings</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Pending',    value: fmt(pendingNet) },
          { label: 'Last Paid',  value: lastPayout ? fmt(lastPayout.amount) : '—' },
          { label: 'All Time',   value: fmt(totalNet) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-base font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {pendingNet >= 1 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="text-sm text-green-800 font-medium">
            💰 {fmt(pendingNet)} pending — next payout {nextPayoutDate()}
          </p>
          <p className="text-xs text-green-700 mt-0.5">Minimum payout threshold: $20</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['current', 'history', 'payouts'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium capitalize transition-colors
              ${tab === t ? 'border-b-2 border-[#1a5c38] text-[#1a5c38]' : 'text-gray-500'}`}
          >
            {t === 'current' ? 'Current Period' : t === 'history' ? 'All Earnings' : 'Payouts'}
          </button>
        ))}
      </div>

      {/* Current Period */}
      {tab === 'current' && (
        <div className="bg-white rounded-xl border border-gray-200">
          {currentPeriodRows.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <p className="text-3xl mb-2">📊</p>
              <p className="text-sm">No earnings this period yet.</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm font-semibold text-gray-700">
                  {currentPeriodRows[0]
                    ? fmtPeriod(currentPeriodRows[0].period_start, currentPeriodRows[0].period_end)
                    : 'Current period'}
                </p>
                <p className="text-sm font-bold text-[#1a5c38]">{fmt(pendingNet)}</p>
              </div>
              <ul className="divide-y divide-gray-100">
                {currentPeriodRows.map(row => (
                  <li key={row.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-800">{EVENT_LABELS[row.event_type] ?? row.event_type}</p>
                      <p className="text-xs text-gray-400">{fmtDate(row.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-green-700">+{fmt(row.net_amount)}</p>
                      <p className="text-xs text-gray-400">Pending</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* All Earnings History */}
      {tab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200">
          {ledger.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">No earnings recorded yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {ledger.map(row => (
                <li key={row.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-800">{EVENT_LABELS[row.event_type] ?? row.event_type}</p>
                    <p className="text-xs text-gray-400">
                      {fmtDate(row.created_at)} · {fmtPeriod(row.period_start, row.period_end)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-700">+{fmt(row.net_amount)}</p>
                    <p className="text-xs text-gray-400">{row.payout_id ? 'Paid' : 'Pending'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Payout History */}
      {tab === 'payouts' && (
        <div className="bg-white rounded-xl border border-gray-200">
          {payouts.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <p className="text-3xl mb-2">💳</p>
              <p className="text-sm">No payouts yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {payouts.map(p => (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{fmt(p.amount)}</p>
                      <p className="text-xs text-gray-500">{fmtPeriod(p.period_start, p.period_end)}</p>
                      {p.stripe_transfer_id && (
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{p.stripe_transfer_id}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        p.status === 'paid' ? 'bg-green-100 text-green-800' :
                        p.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {p.status}
                      </span>
                      {p.paid_at && <p className="text-xs text-gray-400 mt-1">{fmtDate(p.paid_at)}</p>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* How earnings work */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">How Navigator Earnings Work</h3>
        <div className="space-y-2 text-sm text-gray-600">
          <p>• <strong>Basic clients:</strong> $14.70 per Navigator session</p>
          <p>• <strong>Standard/Full Care clients:</strong> Flat monthly amount (credited each period)</p>
          <p>• <strong>Payout cycle:</strong> 1st–15th and 16th–last of each month</p>
          <p>• <strong>Minimum payout:</strong> $20 (smaller amounts roll to next cycle)</p>
          <p>• Paid via Stripe to your connected bank account</p>
        </div>
      </div>
    </div>
  )
}
