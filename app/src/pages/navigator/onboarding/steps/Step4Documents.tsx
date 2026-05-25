import { useRef } from 'react'
import type { OnboardingDraft } from '../OnboardingWizard'

interface Props {
  draft: OnboardingDraft
  onFileQueued: (docType: string, file: File) => void
  queuedFiles: Map<string, File>
}

const DOC_TYPES = [
  { type: 'government_id',    label: 'Government-Issued ID', hint: "Driver's license or state ID" },
  { type: 'social_security',  label: 'Social Security Card', hint: 'Original or copy' },
  { type: 'medicare_card',    label: 'Medicare Card',        hint: 'Red, white, and blue card' },
  { type: 'medicaid_card',    label: 'Medicaid Card',        hint: 'State Medicaid card' },
  { type: 'insurance_card',   label: 'Insurance Card',       hint: 'Any private insurance card' },
  { type: 'va_id',            label: 'VA ID / DD-214',       hint: 'Veterans benefits ID or discharge papers' },
  { type: 'proof_of_income',  label: 'Proof of Income',      hint: 'SSI letter, pay stub, or bank statement' },
]

export function Step4Documents({ draft, onFileQueued, queuedFiles }: Props) {
  const capturedCount = queuedFiles.size + draft.documents.length
  const totalDocs = DOC_TYPES.length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">
          {capturedCount} of {totalDocs} documents captured
        </p>
        <div className="h-2 flex-1 mx-3 bg-gray-200 rounded-full">
          <div
            className="bg-[#1a5c38] h-2 rounded-full transition-all"
            style={{ width: `${Math.round((capturedCount / totalDocs) * 100)}%` }}
          />
        </div>
        <span className="text-xs text-gray-500">{Math.round((capturedCount / totalDocs) * 100)}%</span>
      </div>

      <p className="text-xs text-amber-600">
        📷 Documents are stored securely and never shared without consent.
        All fields are optional — capture what's available today.
      </p>

      <div className="space-y-3">
        {DOC_TYPES.map(doc => {
          const isCaptured = queuedFiles.has(doc.type) ||
            draft.documents.some(d => d.type === doc.type)

          return (
            <DocCard
              key={doc.type}
              docType={doc.type}
              label={doc.label}
              hint={doc.hint}
              isCaptured={isCaptured}
              onFileQueued={onFileQueued}
            />
          )
        })}
      </div>
    </div>
  )
}

function DocCard({
  docType,
  label,
  hint,
  isCaptured,
  onFileQueued,
}: {
  docType: string
  label: string
  hint: string
  isCaptured: boolean
  onFileQueued: (docType: string, file: File) => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileQueued(docType, file)
    e.target.value = ''
  }

  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm transition-colors ${isCaptured ? 'border-green-400' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-gray-900 text-base">{label}</p>
          <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
        </div>
        {isCaptured && (
          <span className="text-2xl shrink-0">✅</span>
        )}
      </div>
      {!isCaptured && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="flex-1 border border-[#1a5c38] text-[#1a5c38] rounded-xl py-3 text-sm font-semibold
                       min-h-[48px] hover:bg-green-50 active:bg-green-100 transition-colors"
          >
            📷 Take Photo
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex-1 border border-gray-300 text-gray-700 rounded-xl py-3 text-sm font-semibold
                       min-h-[48px] hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            📁 Upload File
          </button>
        </div>
      )}
      {isCaptured && (
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="w-full border border-gray-200 text-gray-500 rounded-xl py-2 text-sm
                     min-h-[40px] hover:bg-gray-50 transition-colors"
        >
          Replace document
        </button>
      )}

      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
