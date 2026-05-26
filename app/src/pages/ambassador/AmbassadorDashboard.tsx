/**
 * Ambassador public dashboard — no auth login required.
 * Accessed via /ambassador/:token (UUID in URL acts as bearer token).
 * Service role is NOT used here — the Edge Function fetches data via token.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Toast } from '../../components/ui/Toast'

interface AmbassadorData {
  id:               string
  name:             string
  phone:            string
  referral_code:    string
  auth_token:       string
  total_referrals:  number
  active_referrals: number
  total_earned:     number
  senior_ambassador: boolean
  active:           boolean
}

interface ReferralRow {
  id:               string
  client_id:        string
  signup_bonus_paid: boolean
  months_paid:      number
  total_bonus_paid: number
  created_at:       string
  clients: { name: string; subscription_status: string } | null
}

interface LedgerRow {
  id:          string
  event_type:  string
  net_amount:  number
  period_start: string
  payout_id:   string | null
  created_at:  string
}

const EVENT_LABELS: Record<string, string> = {
  ambassador_signup:    'Sign-up bonus',
  ambassador_retention: 'Monthly retention bonus',
  ambassador_tier:      'Senior Ambassador bonus ($50)',
}

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function nextPayoutDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  d.setDate(1)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

export function AmbassadorDashboard() {
  const { token } = useParams<{ token: string }>()
  const [amb,      setAmb]      = useState<AmbassadorData | null>(null)
  const [referrals,setReferrals]= useState<ReferralRow[]>([])
  const [ledger,   setLedger]   = useState<LedgerRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState<string | null>(null)
  const [copied,   setCopied]   = useState(false)

  useEffect(() => {
    if (!token) return
    async function load() {
      setLoading(true)
      // Fetch ambassador by auth_token (service role needed — use anon with RLS bypass for public token)
      // In production this should go through an Edge Function. For now we use anon + RLS policy.
      const { data: ambData } = await supabase
        .from('ambassadors')
        .select('*')
        .eq('auth_token', token)
        .single()

      if (!ambData) { setLoading(false); return }
      setAmb(ambData as AmbassadorData)

      const { data: refs } = await supabase
        .from('referrals')
        .select('id, client_id, signup_bonus_paid, months_paid, total_bonus_paid, created_at, clients(name, subscription_status)')
        .eq('ambassador_id', ambData.id)
        .order('created_at', { ascending: false })
      setReferrals((refs ?? []) as unknown as ReferralRow[])

      const { data: led } = await supabase
        .from('payout_ledger')
        .select('id, event_type, net_amount, period_start, payout_id, created_at')
        .eq('recipient_type', 'ambassador')
        .eq('recipient_id', ambData.id)
        .order('created_at', { ascending: false })
      setLedger((led ?? []) as LedgerRow[])

      setLoading(false)
    }
    load()
  }, [token])

  function copyCode() {
    if (!amb) return
    navigator.clipboard.writeText(amb.referral_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copyLink() {
    if (!amb) return
    const link = `${window.location.origin}/join?ref=${amb.referral_code}`
    navigator.clipboard.writeText(link)
    setToast('Referral link copied!')
  }

  async function shareLink() {
    if (!amb) return
    const url  = `${window.location.origin}/join?ref=${amb.referral_code}`
    const text = `I'm a Pathway Ambassador helping seniors in my community. Use my referral code ${amb.referral_code} to sign up!`
    if (navigator.share) {
      try { await navigator.share({ title: 'Join Pathway', text, url }) }
      catch { /* user cancelled share */ }
    } else {
      copyLink()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-8 h-8 border-4 border-[#1a5c38] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!amb) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-4xl mb-4">🔒</p>
          <p className="font-semibold text-gray-800">Dashboard not found.</p>
          <p className="text-sm text-gray-500 mt-1">Check the link you received by SMS.</p>
        </div>
      </div>
    )
  }

  const pendingEarnings = ledger.filter(l => !l.payout_id).reduce((s,l) => s+l.net_amount, 0)
  const paidEarnings    = ledger.filter(l =>  l.payout_id).reduce((s,l) => s+l.net_amount, 0)
  const referralLink    = `${window.location.origin}/join?ref=${amb.referral_code}`

  return (
    <div className="min-h-screen bg-gray-50 pb-10">
      {/* Header */}
      <div className="bg-[#1a5c38] text-white px-4 py-6">
        <p className="text-green-200 text-sm">Pathway Ambassador</p>
        <h1 className="text-2xl font-bold mt-1">{amb.name}</h1>
        {amb.senior_ambassador && (
          <span className="inline-block mt-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full">
            ⭐ Senior Ambassador
          </span>
        )}
      </div>

      <div className="p-4 space-y-4 -mt-2">
        {/* Referral code */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs text-gray-500 mb-2">Your Referral Code</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-center">
              <p className="text-3xl font-black tracking-widest text-[#1a5c38]">{amb.referral_code}</p>
            </div>
            <button
              onClick={copyCode}
              className="bg-[#1a5c38] text-white px-4 py-3 rounded-xl font-medium text-sm"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={copyLink}
              className="flex-1 text-sm text-[#1a5c38] font-medium border border-[#1a5c38] rounded-xl py-2.5"
            >
              📋 Copy Link
            </button>
            <button
              onClick={shareLink}
              className="flex-1 text-sm bg-[#1a5c38] text-white font-medium rounded-xl py-2.5"
            >
              📤 Share
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center truncate">{referralLink}</p>
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
              <p className="text-lg font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>

        {pendingEarnings >= 1 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-sm text-green-800 font-medium">
              💰 {fmt(pendingEarnings)} pending — next payout {nextPayoutDate()}
            </p>
          </div>
        )}

        {/* Your referrals */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Your Referrals</h3>
            <span className="text-sm text-gray-500">{referrals.length} total · {amb.active_referrals} active</span>
          </div>
          {referrals.length === 0 ? (
            <div className="p-6 text-center text-gray-400">
              <p className="text-3xl mb-2">👥</p>
              <p className="text-sm">No referrals yet. Share your code to get started!</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {referrals.map(ref => {
                const isActive = ref.clients?.subscription_status === 'active'
                return (
                  <li key={ref.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {ref.clients?.name?.split(' ')[0] ?? 'Client'} {/* first name only */}
                      </p>
                      <p className={`text-xs ${isActive ? 'text-green-700' : 'text-gray-400'}`}>
                        {isActive ? '● Active' : '○ Inactive'}
                        {ref.signup_bonus_paid && ` · Sign-up bonus ✓`}
                        {ref.months_paid > 0 && ` · ${ref.months_paid}/6 months`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">{fmt(ref.total_bonus_paid)}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Earnings history */}
        {ledger.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Earnings History</h3>
            </div>
            <ul className="divide-y divide-gray-100">
              {ledger.slice(0, 20).map(row => (
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
          </div>
        )}

        {/* How to earn */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">How to Earn</h3>
          <div className="space-y-3">
            {[
              { emoji: '🎉', label: '$20 sign-up bonus', desc: 'When someone you referred completes their first Navigator session' },
              { emoji: '📅', label: '$10/month retention', desc: 'Each month they stay active (up to 6 months = $60/client)' },
              { emoji: '⭐', label: '$50 Senior Ambassador', desc: 'When you have 5 active clients' },
            ].map(item => (
              <div key={item.label} className="flex gap-3">
                <span className="text-xl">{item.emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-gray-50 rounded-lg p-2">
            <p className="text-xs text-gray-500">Max per client: <strong>$80</strong> · Payout: 1st of each month · Minimum: $20</p>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
