import { useState } from 'react'
import type { DriverDraft } from '../DriverOnboardingWizard'

interface Props {
  draft:    DriverDraft
  onChange: (partial: Partial<DriverDraft>) => void
}

const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'
const inputCls =
  'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent'

export function StepServiceZone({ draft, onChange }: Props) {
  const [zipInput, setZipInput] = useState('')
  const [zipError, setZipError] = useState<string | null>(null)

  function addZip() {
    const zip = zipInput.trim()
    if (!zip) return
    if (!/^\d{5}$/.test(zip)) { setZipError('Enter a valid 5-digit ZIP code.'); return }
    if (draft.zipCodes.includes(zip)) { setZipError('That ZIP is already added.'); return }
    onChange({ zipCodes: [...draft.zipCodes, zip] })
    setZipInput('')
    setZipError(null)
  }

  function removeZip(zip: string) {
    onChange({ zipCodes: draft.zipCodes.filter(z => z !== zip) })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addZip() }
  }

  const isApproved = draft.bgCheckStatus === 'approved'

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Your Service Area</h3>
        <p className="text-sm text-gray-600">
          Add the ZIP codes you're willing to serve. Jobs will only be dispatched to you when
          they originate in one of these zones.
        </p>
      </div>

      {/* County */}
      <div>
        <label className={labelCls}>Primary County</label>
        <input
          type="text"
          value={draft.county}
          onChange={e => onChange({ county: e.target.value })}
          placeholder="Sumter"
          className={inputCls}
        />
      </div>

      {/* ZIP code entry */}
      <div>
        <label className={labelCls}>Service ZIP Codes *</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={zipInput}
            onChange={e => { setZipInput(e.target.value); setZipError(null) }}
            onKeyDown={handleKeyDown}
            maxLength={5}
            placeholder="31780"
            className={`flex-1 border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent ${zipError ? 'border-red-400' : ''}`}
          />
          <button
            type="button"
            onClick={addZip}
            className="bg-[#1a5c38] text-white rounded-xl px-5 py-3 font-semibold text-sm min-h-[48px] hover:bg-[#2d7a50] active:bg-[#0f3d25] transition-colors"
          >
            Add ZIP
          </button>
        </div>
        {zipError && <p className="text-xs text-red-600 mt-1">{zipError}</p>}
      </div>

      {/* ZIP chips */}
      {draft.zipCodes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {draft.zipCodes.map(zip => (
            <span
              key={zip}
              className="inline-flex items-center gap-1 bg-[#1a5c38]/10 text-[#1a5c38] font-semibold text-sm rounded-full px-3 py-1.5"
            >
              {zip}
              <button
                type="button"
                onClick={() => removeZip(zip)}
                className="ml-1 text-[#1a5c38]/60 hover:text-red-600 transition-colors font-bold"
                aria-label={`Remove ZIP ${zip}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Confirmation message */}
      <div className={`rounded-xl px-4 py-5 border ${isApproved ? 'bg-green-50 border-green-300' : 'bg-[#f7f3ed] border-amber-200'}`}>
        {isApproved ? (
          <>
            <p className="font-bold text-green-800 text-base mb-1">🎉 You're approved!</p>
            <p className="text-sm text-green-700">
              Your background check has cleared. Once you submit, your account will be activated
              and you can start accepting jobs from the driver dashboard.
            </p>
          </>
        ) : (
          <>
            <p className="font-bold text-amber-800 text-base mb-1">Application submitted!</p>
            <p className="text-sm text-amber-700">
              Your application is complete. You'll be notified via SMS when your background check
              clears and you're approved to start driving. This typically takes 2–5 business days.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
