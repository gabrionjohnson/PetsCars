import { type ChangeEvent } from 'react'
import { supabase } from '../../../../lib/supabase'
import type { OnboardingDraft } from '../OnboardingWizard'

interface Props {
  draft: OnboardingDraft
  onChange: (partial: Partial<OnboardingDraft>) => void
}

export function Step1BasicInfo({ draft, onChange }: Props) {
  function field(name: keyof OnboardingDraft) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      onChange({ [name]: e.target.value })
  }

  async function handleZipBlur() {
    const zip = draft.zip.trim()
    if (zip.length !== 5) return
    const { data } = await supabase
      .from('zip_county_map')
      .select('county')
      .eq('zip', zip)
      .maybeSingle()
    if (data?.county) onChange({ county: data.county })
  }

  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'
  const inputCls =
    'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent'

  return (
    <div className="space-y-5">
      <p className="text-sm text-amber-600 font-medium">
        📋 Navigator fills this out on behalf of the client.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>First Name *</label>
          <input
            type="text"
            value={draft.firstName}
            onChange={field('firstName')}
            placeholder="Jane"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Last Name *</label>
          <input
            type="text"
            value={draft.lastName}
            onChange={field('lastName')}
            placeholder="Smith"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Date of Birth *</label>
        <input
          type="date"
          value={draft.dob}
          onChange={field('dob')}
          className={inputCls}
        />
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
        <label className={labelCls}>Home Address *</label>
        <input
          type="text"
          value={draft.address}
          onChange={field('address')}
          placeholder="123 Main St"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>ZIP Code *</label>
          <input
            type="text"
            value={draft.zip}
            onChange={field('zip')}
            onBlur={handleZipBlur}
            maxLength={5}
            placeholder="31780"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>County</label>
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
