import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { Badge } from '../../../components/ui/Badge'
import { Toast } from '../../../components/ui/Toast'

interface Ambassador {
  id:               string
  name:             string
  phone:            string
  email:            string | null
  zip:              string | null
  referral_code:    string
  auth_token:       string
  total_referrals:  number
  active_referrals: number
  total_earned:     number
  senior_ambassador: boolean
  active:           boolean
  created_at:       string
}

interface LedgerRow {
  id:           string
  event_type:   string
  net_amount:   number
  period_start: string
  payout_id:    string | null
  created_at:   string
}

interface ReferralRow {
  id:                string
  client_id:         string
  signup_bonus_paid: boolean
  months_paid:       number
  total_bonus_paid:  number
  activated_at:      string | null
  created_at:        string
  clients: { name: string; subscription_status: string } | null
}

const EVENT_LABELS: Record<string, string> = {
  ambassador_signup:    'Sign-up bonus ($20)',
  ambassador_retention: 'Monthly retention ($10)',
  ambassador_tier:      'Senior Ambassador bonus ($50)',
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AmbassadorLedgerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [amb,      setAmb]      = useState<Ambassador | null>(null)
  const [ledger,   setLedger]   = useState<LedgerRow[]>([])
  const [referrals,setReferrals]= useState<ReferralRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<'referrals' | 'ledger'>('referrals')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [ambRes, ledRes, refRes] = await Promise.all([
      supabase.from('ambassadors').select('*').eq('id', id).single(),
      supabase
        .from('payout_ledger')
        .select('id, event_type, net_amount, period_start, payout_id, created_at')
        .eq('recipient_type', 'ambassador')
        .eq('recipient_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('referrals')
        .select('id, client_id, signup_bonus_paid, months_paid, total_bonus_paid, activated_at, created_at, clients(name, subscription_status)')
        .eq('ambassador_id', id)
        .order('created_at', { ascending: false }),
    ])
    setAmb(ambRes.data as Ambassador | null)
    setLedger((ledRes.data ?? []) as LedgerRow[])
    setReferrals((refRes.data ?? []) as unknown as ReferralRow[])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function toggleActive() {
    if (!amb) return
    const { error } = await supabase
      .from('ambassadors')
      .update({ active: !amb.active })
      .eq('id', amb.id)
    if (error) setToast('Error updating ambassador.')
    else { setToast(`${amb.name} ${amb.active ? 'suspended' : 'reactivated'}.`); load() }
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  if (!amb) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p className="text-3xl mb-2">❓</p>
        <p>Ambassador not found.</p>
        <button onClick={() => navigate(-1)} className="text-[#1a5c38] text-sm mt-2">← Back</button>
      </div>
    )
  }

  const pendingEarnings = ledger.filter(l => !l.payout_id).reduce((s, l) => s + l.net_amount, 0)
  const paidEarnings    = ledger.filter(l =>  l.payout_id).reduce((s, l) => s + l.net_amount, 0)
  const dashUrl         = `${window.location.origin}/ambassador/${amb.auth_token}`

  return (
    <div className="p-4 space-y-4">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="text-[#1a5c38] text-sm font-medium">← Ambassadors</button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900">{amb.name}</h2>
              {amb.senior_ambassador && <Badge color="green">Senior Ambassador</Badge>}
              {!amb.active && <Badge color="red">Suspended</Badge>}
            </div>
            <p className="text-sm text-gray-600 mt-1">{amb.phone}</p>
            {amb.email && <p className="text-xs text-gray-400">{amb.email}</p>}
            {amb.zip && <p className="text-xs text-gray-400">ZIP {amb.zip}</p>}
            <p className="text-xs text-gray-400 mt-1">Joined {fmtDate(amb.created_at)}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-center">
              <p className="text-xs text-gray-500">Code</p>
              <p className="font-mono font-bold text-[#1a5c38]">{amb.referral_code}</p>
            </div>
            <button
              onClick={toggleActive}
              className={`text-xs font-medium ${amb.active ? 'text-red-600' : 'text-green-700'}`}
            >
              {amb.active ? 'Suspend' : 'Reactivate'}
            </button>
          </div>
        </div>
      </div>

      {/* Earnings summary */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Pending',   value: fmt(pendingEarnings) },
          { label: 'Paid Out',  value: fmt(paidEarnings) },
          { label: 'Total',     value: fmt(amb.total_earned) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-base font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-500">Total Referrals</p>
          <p className="text-base font-bold text-gray-900">{amb.total_referrals}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-500">Active Clients</p>
          <p className="text-base font-bold text-gray-900">{amb.active_referrals}</p>
        </div>
      </div>

      {/* Dashboard link */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
        <p className="text-xs text-gray-500 mb-1">Ambassador Dashboard Link</p>
        <p className="text-xs font-mono text-gray-700 break-all">{dashUrl}</p>
        <button
          onClick={() => { navigator.clipboard.writeText(dashUrl); setToast('Link copied!') }}
          className="text-xs text-[#1a5c38] font-medium mt-1"
        >
          Copy link
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['referrals', 'ledger'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium capitalize transition-colors
              ${tab === t ? 'border-b-2 border-[#1a5c38] text-[#1a5c38]' : 'text-gray-500'}`}
          >
            {t === 'referrals' ? `Referrals (${referrals.length})` : `Ledger (${ledger.length})`}
          </button>
        ))}
      </div>

      {/* Referrals tab */}
      {tab === 'referrals' && (
        <div className="bg-white rounded-xl border border-gray-200">
          {referrals.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <p className="text-3xl mb-2">👥</p>
              <p className="text-sm">No referrals yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {referrals.map(ref => {
                const isActive = ref.clients?.subscription_status === 'active'
                return (
                  <li key={ref.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {ref.clients?.name ?? 'Client'}
                      </p>
                      <p className={`text-xs mt-0.5 ${isActive ? 'text-green-700' : 'text-gray-400'}`}>
                        {isActive ? '● Active' : '○ Inactive'}
                        {ref.signup_bonus_paid && ' · Sign-up ✓'}
                        {ref.months_paid > 0 && ` · ${ref.months_paid}/6 mo`}
                      </p>
                      <p className="text-xs text-gray-400">Referred {fmtDate(ref.created_at)}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">{fmt(ref.total_bonus_paid)}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Ledger tab */}
      {tab === 'ledger' && (
        <div className="bg-white rounded-xl border border-gray-200">
          {ledger.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm">No ledger entries yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {ledger.map(row => (
                <li key={row.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-800">{EVENT_LABELS[row.event_type] ?? row.event_type}</p>
                    <p className="text-xs text-gray-400">{fmtDate(row.created_at)}</p>
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

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
