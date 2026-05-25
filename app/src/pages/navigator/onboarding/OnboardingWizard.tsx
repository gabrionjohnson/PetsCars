import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { Button } from '../../../components/ui/Button'
import { Step1BasicInfo } from './steps/Step1BasicInfo'
import { Step2HouseholdInfo } from './steps/Step2HouseholdInfo'
import { Step3Screener } from './steps/Step3Screener'
import { Step4Documents } from './steps/Step4Documents'
import { Step5FamilyProxy } from './steps/Step5FamilyProxy'
import { Step6Confirmation } from './steps/Step6Confirmation'
import { useAuth } from '../../../hooks/useAuth'
import type { ScreenerAnswers, IncomeRange, RecommendedProgram } from '../../../lib/benefitsScreener'

export interface OnboardingDraft {
  // Step 1
  firstName: string
  lastName:  string
  dob:       string
  phone:     string
  address:   string
  zip:       string
  county:    string

  // Step 2
  householdSize: number
  incomeRange:   IncomeRange | ''
  insurance:     string
  vaStatus:      'veteran' | 'surviving_spouse' | 'no'

  // Step 3
  screenerAnswers: Partial<ScreenerAnswers>
  screenerResults: RecommendedProgram[]

  // Step 4
  documents: { type: string; path: string }[]

  // Step 5
  hasProxy:          boolean | null
  proxyName:         string
  proxyPhone:        string
  proxyEmail:        string
  proxyRelationship: string
}

const INITIAL_DRAFT: OnboardingDraft = {
  firstName:         '',
  lastName:          '',
  dob:               '',
  phone:             '',
  address:           '',
  zip:               '',
  county:            '',
  householdSize:     1,
  incomeRange:       '',
  insurance:         '',
  vaStatus:          'no',
  screenerAnswers:   {},
  screenerResults:   [],
  documents:         [],
  hasProxy:          null,
  proxyName:         '',
  proxyPhone:        '',
  proxyEmail:        '',
  proxyRelationship: '',
}

const STEP_LABELS = [
  'Basic Info',
  'Household',
  'Benefits Screener',
  'Documents',
  'Family Proxy',
  'Confirm',
]
const TOTAL_STEPS = STEP_LABELS.length

function validateStep(step: number, draft: OnboardingDraft): string | null {
  if (step === 1) {
    if (!draft.firstName.trim()) return 'First name is required.'
    if (!draft.lastName.trim())  return 'Last name is required.'
    if (!draft.dob)              return 'Date of birth is required.'
    if (!draft.phone.trim())     return 'Phone number is required.'
    if (!draft.address.trim())   return 'Address is required.'
    if (!draft.zip.trim())       return 'ZIP code is required.'
  }
  if (step === 2) {
    if (!draft.incomeRange) return 'Please select an income range.'
    if (!draft.insurance)   return 'Please select an insurance type.'
  }
  if (step === 5) {
    if (draft.hasProxy === true && !draft.proxyName.trim())  return 'Family proxy name is required.'
    if (draft.hasProxy === true && !draft.proxyEmail.trim()) return 'Family proxy email is required.'
  }
  return null
}

export function OnboardingWizard() {
  const navigate       = useNavigate()
  const { user }       = useAuth()
  const navigatorName  = user?.email ?? 'Navigator'

  const [step, setStep]                   = useState(1)
  const [draft, setDraft]                 = useState<OnboardingDraft>(INITIAL_DRAFT)
  const [validationErr, setValidationErr] = useState<string | null>(null)

  // Queued document files (before clientId is known)
  const [queuedFiles, setQueuedFiles] = useState<Map<string, File>>(new Map())

  const updateDraft = useCallback((partial: Partial<OnboardingDraft>) => {
    setDraft(prev => ({ ...prev, ...partial }))
    setValidationErr(null)
  }, [])

  function handleFileQueued(docType: string, file: File) {
    setQueuedFiles(prev => new Map(prev).set(docType, file))
  }

  function goNext() {
    const err = validateStep(step, draft)
    if (err) { setValidationErr(err); return }
    setValidationErr(null)
    setStep(s => Math.min(s + 1, TOTAL_STEPS))
  }

  function goBack() {
    setValidationErr(null)
    if (step === 1) { navigate(-1); return }
    setStep(s => Math.max(s - 1, 1))
  }

  function renderStep() {
    switch (step) {
      case 1: return <Step1BasicInfo draft={draft} onChange={updateDraft} />
      case 2: return <Step2HouseholdInfo draft={draft} onChange={updateDraft} />
      case 3: return <Step3Screener draft={draft} onChange={updateDraft} />
      case 4: return (
        <Step4Documents
          draft={draft}
          onFileQueued={handleFileQueued}
          queuedFiles={queuedFiles}
        />
      )
      case 5: return <Step5FamilyProxy draft={draft} onChange={updateDraft} />
      case 6: return (
        <Step6Confirmation
          draft={draft}
          queuedFiles={queuedFiles}
          navigatorName={navigatorName}
        />
      )
      default: return null
    }
  }

  const isLastStep = step === TOTAL_STEPS

  return (
    <div className="min-h-screen bg-[#f7f3ed] flex flex-col">
      {/* Header */}
      <header className="bg-[#1a5c38] text-white px-4 pb-3 pt-4">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={goBack}
            className="text-white/80 hover:text-white text-sm font-medium py-1 pr-3"
          >
            ← Back
          </button>
          <h1 className="font-bold text-base">New Client Onboarding</h1>
          <span className="text-white/60 text-sm">{step}/{TOTAL_STEPS}</span>
        </div>
        <ProgressBar step={step} total={TOTAL_STEPS} />
        <p className="text-white/80 text-xs mt-2 text-center font-medium">
          {STEP_LABELS[step - 1]}
        </p>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto px-4 py-5 pb-28">
        {renderStep()}
      </main>

      {/* Validation error toast-style banner */}
      {validationErr && (
        <div className="fixed bottom-24 inset-x-4 z-40 bg-red-600 text-white text-sm
                        rounded-xl px-4 py-3 shadow-lg">
          ⚠️ {validationErr}
        </div>
      )}

      {/* Fixed bottom nav — hidden on last step (Activate button is inline there) */}
      {!isLastStep && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3">
          <Button variant="secondary" onClick={goBack} className="flex-1">
            Back
          </Button>
          <Button onClick={goNext} className="flex-1">
            {step === TOTAL_STEPS - 1 ? 'Review' : 'Next'} →
          </Button>
        </div>
      )}
    </div>
  )
}
