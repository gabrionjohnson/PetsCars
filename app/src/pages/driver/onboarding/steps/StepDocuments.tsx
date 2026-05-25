import { useRef, type ChangeEvent } from 'react'
import type { DriverDraft } from '../DriverOnboardingWizard'

interface Props {
  draft:    DriverDraft
  onChange: (partial: Partial<DriverDraft>) => void
}

const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'
const inputCls =
  'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent'

function DocUploadCard({
  label,
  hint,
  file,
  expiryValue,
  expiryLabel,
  onFileChange,
  onExpiryChange,
}: {
  label:         string
  hint:          string
  file:          File | null
  expiryValue:   string
  expiryLabel:   string
  onFileChange:  (file: File) => void
  onExpiryChange:(val: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) onFileChange(f)
    e.target.value = ''
  }

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm ${file ? 'border-green-400' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-base">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
        </div>
        {file && <span className="text-2xl shrink-0">✅</span>}
      </div>

      {file ? (
        <p className="text-sm text-green-700 font-medium mb-3 truncate">{file.name}</p>
      ) : null}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`w-full border rounded-xl py-3 text-sm font-semibold min-h-[48px] transition-colors
          ${file
            ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
            : 'border-[#1a5c38] text-[#1a5c38] hover:bg-green-50'
          }`}
      >
        {file ? '📷 Replace photo' : '📷 Take photo or upload'}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />

      <div className="mt-3">
        <label className={labelCls}>{expiryLabel}</label>
        <input
          type="date"
          value={expiryValue}
          onChange={e => onExpiryChange(e.target.value)}
          className={inputCls}
        />
      </div>
    </div>
  )
}

export function StepDocuments({ draft, onChange }: Props) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        📋 Documents are stored securely. We verify your license and insurance before activating your account.
      </p>

      <DocUploadCard
        label="Driver's License"
        hint="Front of your valid state driver's license"
        file={draft.licenseFile}
        expiryValue={draft.licenseExpiry}
        expiryLabel="License Expiry Date"
        onFileChange={file => onChange({ licenseFile: file })}
        onExpiryChange={val => onChange({ licenseExpiry: val })}
      />

      <DocUploadCard
        label="Auto Insurance Card"
        hint="Current insurance card — must cover the vehicle you registered"
        file={draft.insuranceFile}
        expiryValue={draft.insuranceExpiry}
        expiryLabel="Insurance Expiry Date"
        onFileChange={file => onChange({ insuranceFile: file })}
        onExpiryChange={val => onChange({ insuranceExpiry: val })}
      />
    </div>
  )
}
