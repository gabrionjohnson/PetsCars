import { type ChangeEvent } from 'react'
import type { OnboardingDraft } from '../OnboardingWizard'

interface Props {
  draft: OnboardingDraft
  onChange: (partial: Partial<OnboardingDraft>) => void
}

const RELATIONSHIP_OPTIONS = ['Spouse', 'Child', 'Sibling', 'Parent', 'Other']

export function Step5FamilyProxy({ draft, onChange }: Props) {
  const inputCls =
    'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent'
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'

  function field(name: keyof OnboardingDraft) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ [name]: e.target.value })
  }

  return (
    <div className="space-y-6">
      <p className="text-gray-700 text-base leading-relaxed">
        Does this person have a family member who should be kept updated about their care?
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onChange({ hasProxy: true })}
          className={`flex-1 rounded-xl border py-4 text-base font-semibold min-h-[56px] transition-colors
            ${draft.hasProxy === true
              ? 'bg-[#1a5c38] text-white border-[#1a5c38]'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
        >
          ✅ Yes
        </button>
        <button
          type="button"
          onClick={() => onChange({ hasProxy: false })}
          className={`flex-1 rounded-xl border py-4 text-base font-semibold min-h-[56px] transition-colors
            ${draft.hasProxy === false
              ? 'bg-[#1a5c38] text-white border-[#1a5c38]'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
        >
          ❌ No
        </button>
      </div>

      {draft.hasProxy === true && (
        <div className="space-y-4 bg-[#f7f3ed] rounded-xl p-4 border border-amber-100">
          <p className="text-sm text-amber-700 font-medium">
            ℹ️ A family proxy account will need to be set up by an admin after client activation.
            Collect their contact info now.
          </p>

          <div>
            <label className={labelCls}>Family Member Name *</label>
            <input
              type="text"
              value={draft.proxyName}
              onChange={field('proxyName')}
              placeholder="John Smith"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Phone Number</label>
            <input
              type="tel"
              value={draft.proxyPhone}
              onChange={field('proxyPhone')}
              placeholder="+1 (229) 555-0100"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Email Address *</label>
            <input
              type="email"
              value={draft.proxyEmail}
              onChange={field('proxyEmail')}
              placeholder="john@example.com"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Relationship *</label>
            <select
              value={draft.proxyRelationship}
              onChange={field('proxyRelationship')}
              className={inputCls}
            >
              <option value="">Select relationship…</option>
              {RELATIONSHIP_OPTIONS.map(r => (
                <option key={r} value={r.toLowerCase()}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {draft.hasProxy === false && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-sm text-gray-600">
            No family proxy will be added. This can be changed later from the client profile.
          </p>
        </div>
      )}
    </div>
  )
}
