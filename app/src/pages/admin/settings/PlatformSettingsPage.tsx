import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'

interface Settings {
  basic_tier_price:       number
  standard_tier_price:    number
  full_care_tier_price:   number
  basic_session_limit:    number
  standard_errand_limit:  number
  payout_cycle:           string
  payout_minimum:         number
  navigator_basic_rate:   number
  driver_errand_pct:      number
  driver_nemt_pct:        number
  twilio_number:          string
  admin_alert_phone:      string
  stripe_publishable_key: string
}

const DEFAULT_SETTINGS: Settings = {
  basic_tier_price:       49,
  standard_tier_price:    89,
  full_care_tier_price:   129,
  basic_session_limit:    2,
  standard_errand_limit:  3,
  payout_cycle:           'biweekly',
  payout_minimum:         20,
  navigator_basic_rate:   14.70,
  driver_errand_pct:      75,
  driver_nemt_pct:        80,
  twilio_number:          '',
  admin_alert_phone:      '',
  stripe_publishable_key: '',
}

type Section = 'billing' | 'payouts' | 'sms' | 'rates'

export function PlatformSettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [saving,   setSaving]   = useState(false)
  const [toast,    setToast]    = useState<string | null>(null)
  const [section,  setSection]  = useState<Section>('billing')
  const [edited,   setEdited]   = useState(false)

  // These settings are stored in a platform_settings table (single row)
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('platform_settings')
      .select('*')
      .limit(1)
      .single()
    if (data) setSettings(data as Settings)
  }, [])

  useEffect(() => { load() }, [load])

  function update(k: keyof Settings, v: string | number) {
    setSettings(prev => ({ ...prev, [k]: v }))
    setEdited(true)
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('platform_settings')
      .upsert(settings)
    if (error) setToast(`Error saving: ${error.message}`)
    else { setToast('Settings saved.'); setEdited(false) }
    setSaving(false)
  }

  const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]'
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'

  const sections: { id: Section; label: string; emoji: string }[] = [
    { id: 'billing', label: 'Billing',  emoji: '💳' },
    { id: 'payouts', label: 'Payouts',  emoji: '💰' },
    { id: 'rates',   label: 'Rates',    emoji: '📊' },
    { id: 'sms',     label: 'SMS',      emoji: '📱' },
  ]

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Platform Settings</h2>
        {edited && (
          <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
        )}
      </div>

      {/* Section tabs */}
      <div className="grid grid-cols-4 gap-2">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-medium transition-colors
              ${section === s.id ? 'bg-[#1a5c38] text-white border-[#1a5c38]' : 'bg-white text-gray-600 border-gray-200'}`}
          >
            <span className="text-lg">{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>

      {/* Billing Section */}
      {section === 'billing' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Subscription Tiers</h3>
          <div>
            <label className={labelCls}>Basic tier price ($/month)</label>
            <input type="number" value={settings.basic_tier_price} onChange={e => update('basic_tier_price', +e.target.value)} className={inputCls} min={0} />
          </div>
          <div>
            <label className={labelCls}>Standard tier price ($/month)</label>
            <input type="number" value={settings.standard_tier_price} onChange={e => update('standard_tier_price', +e.target.value)} className={inputCls} min={0} />
          </div>
          <div>
            <label className={labelCls}>Full Care tier price ($/month)</label>
            <input type="number" value={settings.full_care_tier_price} onChange={e => update('full_care_tier_price', +e.target.value)} className={inputCls} min={0} />
          </div>
          <div>
            <label className={labelCls}>Basic tier: sessions per period</label>
            <input type="number" value={settings.basic_session_limit} onChange={e => update('basic_session_limit', +e.target.value)} className={inputCls} min={1} />
          </div>
          <div>
            <label className={labelCls}>Standard tier: errand runs per period</label>
            <input type="number" value={settings.standard_errand_limit} onChange={e => update('standard_errand_limit', +e.target.value)} className={inputCls} min={1} />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              Price changes take effect on next Stripe subscription renewal. Existing subscribers are unaffected until their next billing cycle.
            </p>
          </div>
        </div>
      )}

      {/* Payouts Section */}
      {section === 'payouts' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Payout Settings</h3>
          <div>
            <label className={labelCls}>Payout cycle</label>
            <select value={settings.payout_cycle} onChange={e => update('payout_cycle', e.target.value)} className={inputCls}>
              <option value="biweekly">Bi-weekly (1st–15th / 16th–end)</option>
              <option value="monthly">Monthly (1st of month)</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Minimum payout threshold ($)</label>
            <input type="number" value={settings.payout_minimum} onChange={e => update('payout_minimum', +e.target.value)} className={inputCls} min={1} />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              Amounts below the minimum roll into the next payout cycle. Payouts are processed via Stripe Connect transfers.
            </p>
          </div>
        </div>
      )}

      {/* Rates Section */}
      {section === 'rates' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">Earnings Rates</h3>
          <div>
            <label className={labelCls}>Navigator credit per Basic session ($)</label>
            <input type="number" value={settings.navigator_basic_rate} onChange={e => update('navigator_basic_rate', +e.target.value)} className={inputCls} min={0} step={0.01} />
            <p className="text-xs text-gray-400 mt-1">Basic tier = $49 × 30% = $14.70 default</p>
          </div>
          <div>
            <label className={labelCls}>Driver payout: errand trips (%)</label>
            <input type="number" value={settings.driver_errand_pct} onChange={e => update('driver_errand_pct', +e.target.value)} className={inputCls} min={1} max={100} />
            <p className="text-xs text-gray-400 mt-1">Default 75% of flat_rate</p>
          </div>
          <div>
            <label className={labelCls}>Driver payout: NEMT trips (%)</label>
            <input type="number" value={settings.driver_nemt_pct} onChange={e => update('driver_nemt_pct', +e.target.value)} className={inputCls} min={1} max={100} />
            <p className="text-xs text-gray-400 mt-1">Default 80% of paid_amount</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              Rate changes apply to new trips only. Existing pending ledger rows are unaffected.
            </p>
          </div>
        </div>
      )}

      {/* SMS Section */}
      {section === 'sms' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h3 className="font-semibold text-gray-900">SMS / Twilio Settings</h3>
          <div>
            <label className={labelCls}>Twilio From Number</label>
            <input
              type="tel"
              value={settings.twilio_number}
              onChange={e => update('twilio_number', e.target.value)}
              placeholder="+12295550100"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Admin Alert Phone</label>
            <input
              type="tel"
              value={settings.admin_alert_phone}
              onChange={e => update('admin_alert_phone', e.target.value)}
              placeholder="+12295550200"
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">Receives escalation alerts (stretcher trips, payout failures)</p>
          </div>
          <div>
            <label className={labelCls}>Stripe Publishable Key</label>
            <input
              type="text"
              value={settings.stripe_publishable_key}
              onChange={e => update('stripe_publishable_key', e.target.value)}
              placeholder="pk_live_..."
              className={inputCls}
            />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              Secret keys (Twilio auth token, Stripe secret key) are stored as Supabase Edge Function secrets — not in this table.
            </p>
          </div>
        </div>
      )}

      <Button fullWidth loading={saving} disabled={saving || !edited} onClick={save}>
        Save Settings
      </Button>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
