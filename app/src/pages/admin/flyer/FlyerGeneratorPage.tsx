import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

interface FlyerConfig {
  county:           string
  navigator_name:   string
  navigator_phone:  string
  referral_code:    string
  include_qr:       boolean
  tagline:          string
}

const COUNTIES = [
  'Sumter', 'Webster', 'Schley', 'Macon', 'Crisp',
  'Dooly', 'Lee', 'Worth', 'Turner', 'Wilcox',
]

const TAGLINES = [
  'Benefits help for rural Georgia seniors.',
  'Your neighbor helping your neighbor.',
  'Free help with Medicaid, Medicare & more.',
  'We come to you — no smartphone needed.',
  'Local help for local seniors.',
]

export function FlyerGeneratorPage() {
  const [config, setConfig] = useState<FlyerConfig>({
    county:          'Sumter',
    navigator_name:  '',
    navigator_phone: '',
    referral_code:   '',
    include_qr:      true,
    tagline:         TAGLINES[0],
  })
  const [loading,  setLoading]  = useState(false)
  const [preview,  setPreview]  = useState(false)
  const [ambassadors, setAmbassadors] = useState<{ id: string; name: string; referral_code: string; phone: string }[]>([])
  const [loadingAmb, setLoadingAmb] = useState(false)

  function update(k: keyof FlyerConfig, v: string | boolean) {
    setConfig(prev => ({ ...prev, [k]: v }))
  }

  async function loadAmbassadors() {
    setLoadingAmb(true)
    const { data } = await supabase
      .from('ambassadors')
      .select('id, name, referral_code, phone')
      .eq('active', true)
      .order('name')
    setAmbassadors((data ?? []) as { id: string; name: string; referral_code: string; phone: string }[])
    setLoadingAmb(false)
  }

  function fillFromAmbassador(amb: { name: string; phone: string; referral_code: string }) {
    setConfig(prev => ({
      ...prev,
      navigator_name:  amb.name,
      navigator_phone: amb.phone,
      referral_code:   amb.referral_code,
    }))
  }

  function handlePrint() {
    setLoading(true)
    window.print()
    setLoading(false)
  }

  const joinUrl = config.referral_code
    ? `pathway.app/join?ref=${config.referral_code}`
    : 'pathway.app/join'

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Flyer Generator</h2>
        <button
          onClick={() => setPreview(p => !p)}
          className="text-sm text-[#1a5c38] font-medium"
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {!preview ? (
        <div className="space-y-4">
          {/* Ambassador quick-fill */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p className="text-sm font-medium text-blue-900 mb-2">Quick-fill from Ambassador</p>
            {ambassadors.length === 0 ? (
              <button
                onClick={loadAmbassadors}
                disabled={loadingAmb}
                className="text-sm text-blue-700 font-medium"
              >
                {loadingAmb ? 'Loading…' : 'Load ambassadors…'}
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ambassadors.map(amb => (
                  <button
                    key={amb.id}
                    onClick={() => fillFromAmbassador(amb)}
                    className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-lg font-medium"
                  >
                    {amb.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Config form */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">County</label>
              <select
                value={config.county}
                onChange={e => update('county', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
              >
                {COUNTIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Name</label>
              <input
                type="text"
                value={config.navigator_name}
                onChange={e => update('navigator_name', e.target.value)}
                placeholder="Navigator or Ambassador name"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={config.navigator_phone}
                onChange={e => update('navigator_phone', e.target.value)}
                placeholder="+1 (229) 555-0100"
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Referral Code (optional)</label>
              <input
                type="text"
                value={config.referral_code}
                onChange={e => update('referral_code', e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Tagline</label>
              <select
                value={config.tagline}
                onChange={e => update('tagline', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
              >
                {TAGLINES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.include_qr}
                onChange={e => update('include_qr', e.target.checked)}
                className="w-4 h-4 accent-[#1a5c38]"
              />
              <span className="text-sm text-gray-700">Include QR code placeholder</span>
            </label>
          </div>

          <button
            onClick={() => setPreview(true)}
            className="w-full bg-[#1a5c38] text-white rounded-xl py-3 font-semibold text-base"
          >
            Preview Flyer
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Flyer preview */}
          <div
            id="flyer-print"
            className="bg-white border-2 border-gray-300 rounded-2xl p-6 space-y-4 max-w-sm mx-auto print:border-0 print:rounded-none print:max-w-none"
          >
            {/* Header */}
            <div className="text-center border-b-2 border-[#1a5c38] pb-4">
              <h1 className="text-4xl font-black text-[#1a5c38]">Pathway</h1>
              <p className="text-sm text-gray-600 mt-1">{config.tagline}</p>
            </div>

            {/* Main message */}
            <div className="text-center space-y-2">
              <p className="text-2xl font-bold text-gray-900">
                Free Benefits Help<br/>for {config.county} County Seniors
              </p>
              <p className="text-sm text-gray-600">
                We help seniors 50+ find and enroll in benefits they've earned —
                Medicaid, SNAP, Medicare Savings, and more. <strong>No smartphone needed.</strong>
              </p>
            </div>

            {/* Services */}
            <div className="bg-green-50 rounded-xl p-3 space-y-1.5">
              {[
                '✅ Benefits enrollment & form help',
                '✅ Errand & grocery delivery',
                '✅ Medical transport',
                '✅ We come to your home',
              ].map(item => (
                <p key={item} className="text-sm text-green-900 font-medium">{item}</p>
              ))}
            </div>

            {/* Contact */}
            {(config.navigator_name || config.navigator_phone) && (
              <div className="border border-gray-200 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">Your local contact</p>
                {config.navigator_name && (
                  <p className="font-bold text-gray-900">{config.navigator_name}</p>
                )}
                {config.navigator_phone && (
                  <p className="text-lg font-semibold text-[#1a5c38]">{config.navigator_phone}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Text or call — no app needed</p>
              </div>
            )}

            {/* Referral code + QR */}
            {config.referral_code && (
              <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-gray-500">Sign-up code</p>
                  <p className="text-2xl font-black tracking-widest text-[#1a5c38]">{config.referral_code}</p>
                  <p className="text-xs text-gray-500">{joinUrl}</p>
                </div>
                {config.include_qr && (
                  <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                    <p className="text-xs text-gray-400 text-center">QR<br/>code</p>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="text-center border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400">
                Pathway is a community service platform. All services comply with state regulations.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setPreview(false)}
              className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3 font-medium text-sm"
            >
              Edit
            </button>
            <button
              onClick={handlePrint}
              disabled={loading}
              className="flex-1 bg-[#1a5c38] text-white rounded-xl py-3 font-semibold text-sm"
            >
              {loading ? 'Opening…' : '🖨️ Print / Save PDF'}
            </button>
          </div>

          <p className="text-xs text-center text-gray-400">
            Use your browser's Print dialog to save as PDF or print copies.
          </p>
        </div>
      )}
    </div>
  )
}
