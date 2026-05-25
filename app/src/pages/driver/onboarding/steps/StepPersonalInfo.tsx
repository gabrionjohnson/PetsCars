import type { ChangeEvent } from 'react'
import type { DriverDraft } from '../DriverOnboardingWizard'

interface Props {
  draft:    DriverDraft
  onChange: (partial: Partial<DriverDraft>) => void
}

const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'
const inputCls =
  'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent'

export function StepPersonalInfo({ draft, onChange }: Props) {
  function field(key: keyof DriverDraft) {
    return (e: ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.value })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[#1a5c38] font-medium bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        👤 Tell us about yourself. This information is used to verify your identity.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>First Name *</label>
          <input
            type="text"
            value={draft.firstName}
            onChange={field('firstName')}
            placeholder="James"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Last Name *</label>
          <input
            type="text"
            value={draft.lastName}
            onChange={field('lastName')}
            placeholder="Brown"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Phone Number *</label>
        <input
          type="tel"
          value={draft.phone}
          onChange={field('phone')}
          placeholder="+1 (229) 555-0199"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Home Address</label>
        <input
          type="text"
          value={draft.address}
          onChange={field('address')}
          placeholder="123 Main St, Plains, GA"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>ZIP Code</label>
          <input
            type="text"
            value={draft.zip}
            onChange={field('zip')}
            maxLength={5}
            placeholder="31780"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>County *</label>
          <input
            type="text"
            value={draft.county}
            onChange={field('county')}
            placeholder="Sumter"
            className={inputCls}
          />
        </div>
      </div>
    </div>
  )
}
