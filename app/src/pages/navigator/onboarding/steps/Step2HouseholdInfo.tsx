import { INCOME_RANGES } from '../../../../lib/benefitsScreener'
import type { OnboardingDraft } from '../OnboardingWizard'

interface Props {
  draft: OnboardingDraft
  onChange: (partial: Partial<OnboardingDraft>) => void
}

const INSURANCE_OPTIONS = [
  'None',
  'Medicaid',
  'Medicare',
  'Medicare + Medicaid',
  'Private',
  'VA',
  'Other',
]

const VA_OPTIONS: { value: OnboardingDraft['vaStatus']; label: string }[] = [
  { value: 'veteran',          label: 'Yes — Veteran' },
  { value: 'surviving_spouse', label: 'Yes — Surviving Spouse' },
  { value: 'no',               label: 'No' },
]

export function Step2HouseholdInfo({ draft, onChange }: Props) {
  const radioCls =
    'w-full text-left border border-gray-200 rounded-xl px-4 py-3 text-base min-h-[52px] flex items-center gap-3 transition-colors'
  const radioSelected = 'bg-[#1a5c38] text-white border-[#1a5c38]'
  const radioUnselected = 'bg-white text-gray-700 hover:bg-gray-50'

  return (
    <div className="space-y-7">
      {/* Household size stepper */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Household Size *</p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => onChange({ householdSize: Math.max(1, draft.householdSize - 1) })}
            className="w-12 h-12 rounded-xl border border-gray-300 text-xl font-bold text-gray-700
                       hover:bg-gray-50 active:bg-gray-100 flex items-center justify-center"
          >
            −
          </button>
          <span className="text-2xl font-bold text-gray-900 w-8 text-center">
            {draft.householdSize}
          </span>
          <button
            type="button"
            onClick={() => onChange({ householdSize: draft.householdSize + 1 })}
            className="w-12 h-12 rounded-xl border border-gray-300 text-xl font-bold text-gray-700
                       hover:bg-gray-50 active:bg-gray-100 flex items-center justify-center"
          >
            +
          </button>
          <span className="text-sm text-gray-500">
            {draft.householdSize === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>

      {/* Monthly income */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Monthly Household Income *</p>
        <div className="space-y-2">
          {INCOME_RANGES.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ incomeRange: opt.value })}
              className={`${radioCls} ${draft.incomeRange === opt.value ? radioSelected : radioUnselected}`}
            >
              <span className="text-lg">{draft.incomeRange === opt.value ? '🔘' : '⭕'}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Health insurance */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Health Insurance *</p>
        <div className="space-y-2">
          {INSURANCE_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onChange({ insurance: opt })}
              className={`${radioCls} ${draft.insurance === opt ? radioSelected : radioUnselected}`}
            >
              <span className="text-lg">{draft.insurance === opt ? '🔘' : '⭕'}</span>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* VA status */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-3">Veteran / Military Status *</p>
        <div className="space-y-2">
          {VA_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ vaStatus: opt.value })}
              className={`${radioCls} ${draft.vaStatus === opt.value ? radioSelected : radioUnselected}`}
            >
              <span className="text-lg">{draft.vaStatus === opt.value ? '🔘' : '⭕'}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
