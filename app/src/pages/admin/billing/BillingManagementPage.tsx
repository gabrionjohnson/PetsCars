import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { Badge } from '../../../components/ui/Badge'
import { Toast } from '../../../components/ui/Toast'

interface ClientBilling {
  id:                         string
  name:                       string
  subscription_tier:          string | null
  subscription_status:        string
  stripe_customer_id:         string | null
  stripe_subscription_id:     string | null
  contract_billing:           boolean
  sessions_used_this_period:  number
  errands_used_this_period:   number
  navigators:                 { name: string } | null
}

const TIER_LABELS: Record<string, string> = {
  basic:     'Basic ($49)',
  standard:  'Standard ($89)',
  full_care: 'Full Care ($129)',
}

const STATUS_COLOR: Record<string, 'green' | 'amber' | 'red' | 'gray'> = {
  active:   'green',
  past_due: 'amber',
  canceled: 'red',
  inactive: 'gray',
  paused:   'gray',
}


export function BillingManagementPage() {
  const [clients,  setClients]  = useState<ClientBilling[]>([])
  const [loading,  setLoading]  = useState(true)
  const [toast,    setToast]    = useState<string | null>(null)
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState<'all' | 'active' | 'past_due' | 'canceled' | 'contract'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('id, name, subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id, contract_billing, sessions_used_this_period, errands_used_this_period, navigators(name)')
      .order('name')
    setClients((data ?? []) as unknown as ClientBilling[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function resetUsage(client: ClientBilling) {
    const { error } = await supabase
      .from('clients')
      .update({ sessions_used_this_period: 0, errands_used_this_period: 0 })
      .eq('id', client.id)
    if (error) setToast('Error resetting usage.')
    else { setToast(`Usage reset for ${client.name}.`); load() }
  }

  async function toggleContract(client: ClientBilling) {
    const { error } = await supabase
      .from('clients')
      .update({ contract_billing: !client.contract_billing })
      .eq('id', client.id)
    if (error) setToast('Error updating billing type.')
    else { setToast(`${client.name} updated.`); load() }
  }

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.stripe_customer_id ?? '').includes(search) ||
      (c.stripe_subscription_id ?? '').includes(search)
    const matchFilter =
      filter === 'all'      ? true :
      filter === 'contract' ? c.contract_billing :
      c.subscription_status === filter
    return matchSearch && matchFilter
  })

  const totalActive   = clients.filter(c => c.subscription_status === 'active' && !c.contract_billing).length
  const totalContract = clients.filter(c => c.contract_billing).length
  const totalPastDue  = clients.filter(c => c.subscription_status === 'past_due').length

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Billing Management</h2>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Stripe Active', value: totalActive },
          { label: 'Contract',      value: totalContract },
          { label: 'Past Due',      value: totalPastDue, warn: totalPastDue > 0 },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl border p-3 text-center ${(s as {warn?: boolean}).warn ? 'border-amber-300' : 'border-gray-200'}`}>
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-lg font-bold ${(s as {warn?: boolean}).warn ? 'text-amber-600' : 'text-gray-900'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'active', 'past_due', 'canceled', 'contract'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
              ${filter === f ? 'bg-[#1a5c38] text-white' : 'bg-white border border-gray-200 text-gray-600'}`}
          >
            {f === 'past_due' ? 'Past Due' : f === 'contract' ? 'Contract' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <input
        type="search"
        placeholder="Search by name or Stripe ID…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
      />

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">💳</p>
          <p className="text-sm">No clients found.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(client => (
            <li key={client.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{client.name}</p>
                    {client.contract_billing && <Badge color="blue">Contract</Badge>}
                    <Badge color={STATUS_COLOR[client.subscription_status] ?? 'gray'}>
                      {client.subscription_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {client.subscription_tier ? TIER_LABELS[client.subscription_tier] ?? client.subscription_tier : 'No plan'}
                    {client.navigators?.name && ` · Navigator: ${client.navigators.name}`}
                  </p>
                  {!client.contract_billing && client.subscription_status === 'active' && (
                    <p className="text-xs text-gray-400 mt-1">
                      Sessions: {client.sessions_used_this_period} · Errands: {client.errands_used_this_period}
                    </p>
                  )}
                  {client.stripe_subscription_id && (
                    <p className="text-xs text-gray-300 font-mono mt-1 truncate">{client.stripe_subscription_id}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0 items-end">
                  <button
                    onClick={() => toggleContract(client)}
                    className="text-xs text-[#1a5c38] font-medium"
                  >
                    {client.contract_billing ? 'Make Stripe' : 'Make Contract'}
                  </button>
                  <button
                    onClick={() => resetUsage(client)}
                    className="text-xs text-gray-500 font-medium"
                  >
                    Reset Usage
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
