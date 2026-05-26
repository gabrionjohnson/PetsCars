import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'

interface ClientRecord {
  id: string
  name: string
  subscription_tier: string | null
  subscription_status: string
  stripe_subscription_id: string | null
  sessions_used_this_period: number
  errands_used_this_period: number
  contract_billing: boolean
}

const TIER_INFO = {
  basic:     { label: 'Basic',     price: '$49/mo',  color: 'gray'  as const },
  standard:  { label: 'Standard',  price: '$89/mo',  color: 'blue'  as const },
  full_care: { label: 'Full Care', price: '$129/mo', color: 'green' as const },
}

const STATUS_COLOR: Record<string, 'green'|'amber'|'red'|'gray'> = {
  active:   'green',
  past_due: 'amber',
  canceled: 'red',
  inactive: 'gray',
  paused:   'gray',
}


export function BillingPage() {
  const { user } = useAuth()
  const [client,  setClient]  = useState<ClientRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState<string | null>(null)
  const [showCancel, setShowCancel] = useState(false)
  const [canceling,  setCanceling]  = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data: fp } = await supabase
      .from('family_proxies')
      .select('client_id')
      .eq('id', user.id)
      .single()
    if (!fp) { setLoading(false); return }
    const { data } = await supabase
      .from('clients')
      .select('id, name, subscription_tier, subscription_status, stripe_subscription_id, sessions_used_this_period, errands_used_this_period, contract_billing')
      .eq('id', fp.client_id)
      .single()
    setClient(data as ClientRecord | null)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function handleCancel() {
    if (!client?.stripe_subscription_id) return
    setCanceling(true)
    // In production: call Stripe API via Edge Function to cancel at period end
    // For now: update status locally (the real cancel happens via Stripe dashboard or Edge Function)
    const { error } = await supabase
      .from('clients')
      .update({ subscription_status: 'canceled' })
      .eq('id', client.id)
    if (error) setToast('Error canceling. Please contact support.')
    else { setToast('Subscription canceled at end of billing period.'); setShowCancel(false); load() }
    setCanceling(false)
  }

  if (loading) return <div className="p-4 space-y-3">{[...Array(3)].map((_,i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>

  if (!client) return <div className="p-4 text-gray-500">No client linked to your account.</div>

  const tier   = client.subscription_tier as keyof typeof TIER_INFO | null
  const info   = tier ? TIER_INFO[tier] : null
  const status = client.subscription_status

  return (
    <div className="p-4 space-y-5">
      <h2 className="text-xl font-bold text-gray-900">Billing & Plan</h2>

      {/* Current plan */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Current Plan</p>
            {info ? (
              <p className="text-xl font-bold text-gray-900 mt-0.5">{info.label}</p>
            ) : (
              <p className="text-gray-500 mt-0.5">No active plan</p>
            )}
          </div>
          <div className="text-right">
            {info && <p className="text-lg font-semibold text-[#1a5c38]">{info.price}</p>}
            <Badge color={STATUS_COLOR[status] ?? 'gray'}>{status}</Badge>
          </div>
        </div>

        {client.contract_billing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
            <p className="text-xs text-blue-800">Contract billing — managed by your county program.</p>
          </div>
        )}

        {/* Usage meters */}
        {tier === 'basic' && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-medium text-gray-700">This Period Usage</p>
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Navigator Sessions</span>
                <span>{client.sessions_used_this_period} / 2</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${client.sessions_used_this_period >= 2 ? 'bg-amber-500' : 'bg-[#1a5c38]'}`}
                  style={{ width: `${Math.min(100, client.sessions_used_this_period / 2 * 100)}%` }}
                />
              </div>
              {client.sessions_used_this_period >= 2 && (
                <p className="text-xs text-amber-700 mt-1">Session limit reached for this period.</p>
              )}
            </div>
          </div>
        )}

        {tier === 'standard' && (
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <p className="text-xs font-medium text-gray-700">This Period Usage</p>
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Errand Runs</span>
                <span>{client.errands_used_this_period} / 3</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${client.errands_used_this_period >= 3 ? 'bg-amber-500' : 'bg-[#1a5c38]'}`}
                  style={{ width: `${Math.min(100, client.errands_used_this_period / 3 * 100)}%` }}
                />
              </div>
              {client.errands_used_this_period >= 3 && (
                <p className="text-xs text-amber-700 mt-1">Included errand runs used. Additional runs billed separately.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Plan comparison */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Available Plans</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {(Object.entries(TIER_INFO) as [keyof typeof TIER_INFO, typeof TIER_INFO[keyof typeof TIER_INFO]][]).map(([key, t]) => (
            <div key={key} className={`p-4 flex items-center justify-between ${tier === key ? 'bg-green-50' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{t.label}</p>
                  {tier === key && <Badge color="green">Current</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {key === 'basic'     && '2 Navigator sessions/month'}
                  {key === 'standard'  && 'Unlimited sessions + 3 errand runs/month'}
                  {key === 'full_care' && 'Unlimited sessions, errands + NEMT coordination'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-900">{t.price}</p>
                {tier !== key && status === 'active' && (
                  <button
                    onClick={() => setToast('Plan changes handled by your Navigator. Contact them to upgrade.')}
                    className="text-xs text-[#1a5c38] font-medium mt-1"
                  >
                    {(key === 'basic' && tier && ['standard','full_care'].includes(tier)) ? 'Downgrade' : 'Upgrade'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cancel plan */}
      {status === 'active' && !client.contract_billing && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-1">Cancel Plan</h3>
          <p className="text-sm text-gray-500 mb-3">
            Canceling will end Navigator services at the end of this billing period.
          </p>
          {!showCancel ? (
            <button onClick={() => setShowCancel(true)} className="text-sm text-red-600 font-medium">
              Cancel subscription…
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800 font-medium">Are you sure?</p>
                <p className="text-xs text-red-700 mt-1">
                  Your family member will lose access to Navigator support and errand services at period end.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowCancel(false)} className="flex-1">Keep Plan</Button>
                <Button variant="danger" onClick={handleCancel} loading={canceling} className="flex-1">Yes, Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
