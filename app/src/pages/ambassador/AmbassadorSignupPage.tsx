import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'

export function AmbassadorSignupPage() {
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)
  const [dashUrl, setDashUrl] = useState('')

  const [form, setForm] = useState({
    name:       '',
    phone:      '',
    email:      '',
    zip:        '',
    how_heard:  '',
  })

  function update(k: keyof typeof form, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.phone) { setError('Name and phone are required.'); return }
    setSaving(true)
    setError(null)

    // Generate 6-char code (server generates, but we try a simple one first)
    const code = Math.random().toString(36).toUpperCase().slice(2, 8)

    const { data, error: dbErr } = await supabase
      .from('ambassadors')
      .insert({
        name:          form.name.trim(),
        phone:         form.phone.trim(),
        email:         form.email.trim() || null,
        zip:           form.zip.trim() || null,
        referral_code: code,
      })
      .select('auth_token, referral_code')
      .single()

    if (dbErr) {
      setError(dbErr.message.includes('unique')
        ? 'This phone number is already registered as an ambassador.'
        : `Error: ${dbErr.message}`)
      setSaving(false)
      return
    }

    setDashUrl(`${window.location.origin}/ambassador/${data.auth_token}`)
    setStep('success')
    setSaving(false)
  }

  const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38]'

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <p className="text-5xl">🎉</p>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, Ambassador!</h1>
          <p className="text-gray-600 text-sm">
            You're now part of the Pathway Ambassador program. We sent your referral code and dashboard link by SMS.
          </p>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
            <p className="text-xs text-gray-500">Your Dashboard Link</p>
            <p className="font-mono text-xs text-gray-700 break-all">{dashUrl}</p>
            <button
              onClick={() => navigator.clipboard.writeText(dashUrl)}
              className="text-sm text-[#1a5c38] font-medium"
            >
              Copy link
            </button>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-sm text-green-800">
              Text <strong>EARNINGS</strong> to our number anytime to check your balance.
            </p>
          </div>
          <a href={dashUrl} className="block bg-[#1a5c38] text-white rounded-xl py-3 font-semibold text-base">
            Go to My Dashboard
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[#1a5c38]">Pathway</h1>
          <p className="text-gray-600 mt-1 text-sm">Ambassador Program</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm text-green-800 font-medium">Earn up to $80 per referred senior</p>
          <p className="text-xs text-green-700 mt-1">$20 sign-up bonus · $10/month retention · $50 Senior Ambassador bonus</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name *</label>
            <input type="text" required value={form.name} onChange={e => update('name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number *</label>
            <input type="tel" required value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="+1 (229) 555-0100" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Email (optional)</label>
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ZIP Code</label>
            <input type="text" value={form.zip} onChange={e => update('zip', e.target.value)} maxLength={5} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">How did you hear about Pathway?</label>
            <select value={form.how_heard} onChange={e => update('how_heard', e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              <option>Church / faith community</option>
              <option>Food bank / nonprofit</option>
              <option>County office</option>
              <option>Friend or neighbor</option>
              <option>Social media</option>
              <option>Navigator recommendation</option>
              <option>Other</option>
            </select>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button type="submit" fullWidth loading={saving} disabled={saving}>
            Join the Ambassador Program
          </Button>
        </form>

        <p className="text-xs text-center text-gray-400">
          By joining, you agree to represent Pathway honestly in your community.
          No sales pressure — just share your story.
        </p>
      </div>
    </div>
  )
}
