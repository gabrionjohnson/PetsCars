import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AmbassadorListPage() {
  const navigate = useNavigate()
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([])
  const [loading,     setLoading]     = useState(true)
  const [toast,       setToast]       = useState<string | null>(null)
  const [search,      setSearch]      = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ambassadors')
      .select('*')
      .order('active_referrals', { ascending: false })
    setAmbassadors((data ?? []) as Ambassador[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleActive(amb: Ambassador) {
    const { error } = await supabase
      .from('ambassadors')
      .update({ active: !amb.active })
      .eq('id', amb.id)
    if (error) setToast('Error updating ambassador.')
    else { setToast(`${amb.name} ${amb.active ? 'suspended' : 'reactivated'}.`); load() }
  }

  const filtered = ambassadors.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.phone.includes(search) ||
    a.referral_code.toLowerCase().includes(search.toLowerCase())
  )

  const totalActive  = ambassadors.filter(a => a.active).length
  const totalEarned  = ambassadors.reduce((s, a) => s + a.total_earned, 0)
  const totalClients = ambassadors.reduce((s, a) => s + a.active_referrals, 0)

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Ambassadors</h2>
        <span className="text-sm text-gray-500">{ambassadors.length} total</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Active', value: totalActive },
          { label: 'Clients', value: totalClients },
          { label: 'Paid Out', value: fmt(totalEarned) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-lg font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <input
        type="search"
        placeholder="Search by name, phone, or code…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
      />

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_,i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">🤝</p>
          <p className="text-sm">No ambassadors found.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(amb => (
            <li key={amb.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{amb.name}</p>
                    {amb.senior_ambassador && (
                      <Badge color="green">Senior Ambassador</Badge>
                    )}
                    {!amb.active && <Badge color="red">Suspended</Badge>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{amb.phone} · Code: <span className="font-mono font-medium">{amb.referral_code}</span></p>
                  <p className="text-xs text-gray-400">{fmtDate(amb.created_at)}</p>
                  <div className="flex gap-3 mt-2 text-xs text-gray-600">
                    <span>{amb.active_referrals} active clients</span>
                    <span>{fmt(amb.total_earned)} earned</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 shrink-0 items-end">
                  <button
                    onClick={() => navigate(`/admin/ambassadors/${amb.id}`)}
                    className="text-xs text-[#1a5c38] font-medium"
                  >
                    View Ledger
                  </button>
                  <button
                    onClick={() => toggleActive(amb)}
                    className={`text-xs font-medium ${amb.active ? 'text-red-600' : 'text-green-700'}`}
                  >
                    {amb.active ? 'Suspend' : 'Reactivate'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
