import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { StepPersonalInfo } from './steps/StepPersonalInfo'
import { StepVehicleInfo } from './steps/StepVehicleInfo'
import { StepDocuments } from './steps/StepDocuments'
import { StepBackgroundCheck } from './steps/StepBackgroundCheck'
import { StepPayoutSetup } from './steps/StepPayoutSetup'
import { StepServiceZone } from './steps/StepServiceZone'

export interface DriverDraft {
  // Step 1 — Personal Info
  firstName:   string
  lastName:    string
  phone:       string
  address:     string
  zip:         string
  county:      string

  // Step 2 — Vehicle
  vehicleMake:   string
  vehicleModel:  string
  vehicleYear:   string
  vehicleColor:  string
  licensePlate:  string
  hasWav:        boolean
  vehiclePhotoFile: File | null
  vehiclePhotoUrl:  string | null

  // Step 3 — Documents
  licenseFile:    File | null
  licenseUrl:     string | null
  licenseExpiry:  string
  insuranceFile:  File | null
  insuranceUrl:   string | null
  insuranceExpiry: string

  // Step 4 — Background Check
  bgCheckConsent:  boolean
  bgCheckStatus:   'pending' | 'in_progress' | 'approved' | 'denied'
  bgCheckSubmitted: boolean

  // Step 5 — Payout
  stripeComplete: boolean

  // Step 6 — Service Zone
  zipCodes: string[]
}

const INITIAL_DRAFT: DriverDraft = {
  firstName:   '',
  lastName:    '',
  phone:       '',
  address:     '',
  zip:         '',
  county:      '',
  vehicleMake:   '',
  vehicleModel:  '',
  vehicleYear:   '',
  vehicleColor:  '',
  licensePlate:  '',
  hasWav:        false,
  vehiclePhotoFile: null,
  vehiclePhotoUrl:  null,
  licenseFile:    null,
  licenseUrl:     null,
  licenseExpiry:  '',
  insuranceFile:  null,
  insuranceUrl:   null,
  insuranceExpiry: '',
  bgCheckConsent:  false,
  bgCheckStatus:   'pending',
  bgCheckSubmitted: false,
  stripeComplete:  false,
  zipCodes:        [],
}

const STEP_LABELS = [
  'Personal Info',
  'Vehicle',
  'Documents',
  'Background Check',
  'Payout Setup',
  'Service Zone',
]
const TOTAL_STEPS = STEP_LABELS.length

function validateStep(step: number, draft: DriverDraft): string | null {
  if (step === 1) {
    if (!draft.firstName.trim()) return 'First name is required.'
    if (!draft.lastName.trim())  return 'Last name is required.'
    if (!draft.phone.trim())     return 'Phone number is required.'
    if (!draft.county.trim())    return 'County is required.'
  }
  if (step === 2) {
    if (!draft.vehicleMake.trim())  return 'Vehicle make is required.'
    if (!draft.vehicleModel.trim()) return 'Vehicle model is required.'
    if (!draft.vehicleYear.trim())  return 'Vehicle year is required.'
    if (!draft.vehicleColor.trim()) return 'Vehicle color is required.'
    if (!draft.licensePlate.trim()) return 'License plate is required.'
  }
  if (step === 4) {
    if (!draft.bgCheckConsent) return 'You must consent to the background check to proceed.'
  }
  if (step === 6) {
    if (draft.zipCodes.length === 0) return 'Add at least one ZIP code for your service area.'
  }
  return null
}

export function DriverOnboardingWizard() {
  const navigate     = useNavigate()
  const { user }     = useAuth()
  const [driverId, setDriverId] = useState<string | null>(null)

  const [step, setStep]                   = useState(1)
  const [draft, setDraft]                 = useState<DriverDraft>(INITIAL_DRAFT)
  const [validationErr, setValidationErr] = useState<string | null>(null)
  const [saving, setSaving]               = useState(false)

  // Load driver record and profile on mount
  useEffect(() => {
    if (!user) return
    async function load() {
      // Load profile phone
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', user!.id)
        .maybeSingle()

      // Load driver record
      const { data: driver } = await supabase
        .from('drivers')
        .select('id, county, onboarding_step, background_check_status, stripe_connect_complete')
        .eq('id', user!.id)
        .maybeSingle()

      const nameParts = (profile?.name ?? '').split(' ')
      setDraft(prev => ({
        ...prev,
        firstName: nameParts[0] ?? '',
        lastName:  nameParts.slice(1).join(' '),
        phone:     profile?.phone ?? '',
        county:    driver?.county ?? '',
        bgCheckStatus:  (driver?.background_check_status as DriverDraft['bgCheckStatus']) ?? 'pending',
        stripeComplete: driver?.stripe_connect_complete ?? false,
      }))

      if (driver?.id) {
        setDriverId(driver.id)
        // Resume from saved step
        const savedStep = driver.onboarding_step
        if (savedStep && savedStep > 0 && savedStep < TOTAL_STEPS) {
          setStep(savedStep + 1)
        }
      }
    }
    load()
  }, [user])

  const updateDraft = useCallback((partial: Partial<DriverDraft>) => {
    setDraft(prev => ({ ...prev, ...partial }))
    setValidationErr(null)
  }, [])

  async function saveStep(currentStep: number): Promise<boolean> {
    if (!user) return false
    setSaving(true)
    try {
      const uid = driverId ?? user.id

      if (currentStep === 1) {
        const name = `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim()
        const { error: profileErr } = await supabase
          .from('profiles')
          .update({ name, phone: draft.phone })
          .eq('id', user.id)
        if (profileErr) throw profileErr

        const { error: driverErr } = await supabase
          .from('drivers')
          .upsert({ id: uid, county: draft.county, onboarding_step: 1 })
        if (driverErr) throw driverErr
        setDriverId(uid)
      }

      if (currentStep === 2) {
        // Upload vehicle photo if provided
        let vehiclePhotoUrls: string[] = []
        if (draft.vehiclePhotoFile) {
          const file = draft.vehiclePhotoFile
          const ext  = file.name.split('.').pop() ?? 'jpg'
          const path = `${uid}/vehicle_front.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('driver-documents')
            .upload(path, file, { upsert: true, contentType: file.type })
          if (uploadErr) throw uploadErr
          vehiclePhotoUrls = [path]
          updateDraft({ vehiclePhotoUrl: path })
        } else if (draft.vehiclePhotoUrl) {
          vehiclePhotoUrls = [draft.vehiclePhotoUrl]
        }

        const { error } = await supabase
          .from('drivers')
          .update({
            vehicle_make:       draft.vehicleMake,
            vehicle_model:      draft.vehicleModel,
            vehicle_year:       parseInt(draft.vehicleYear, 10) || null,
            vehicle_color:      draft.vehicleColor,
            license_plate:      draft.licensePlate,
            has_wav:            draft.hasWav,
            vehicle_photo_urls: vehiclePhotoUrls,
            onboarding_step:    2,
          })
          .eq('id', uid)
        if (error) throw error
      }

      if (currentStep === 3) {
        let licenseUrl = draft.licenseUrl
        let insuranceUrl = draft.insuranceUrl

        if (draft.licenseFile) {
          const ext  = draft.licenseFile.name.split('.').pop() ?? 'jpg'
          const path = `${uid}/license.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('driver-documents')
            .upload(path, draft.licenseFile, { upsert: true, contentType: draft.licenseFile.type })
          if (uploadErr) throw uploadErr
          licenseUrl = path
          updateDraft({ licenseUrl: path })
        }

        if (draft.insuranceFile) {
          const ext  = draft.insuranceFile.name.split('.').pop() ?? 'jpg'
          const path = `${uid}/insurance.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('driver-documents')
            .upload(path, draft.insuranceFile, { upsert: true, contentType: draft.insuranceFile.type })
          if (uploadErr) throw uploadErr
          insuranceUrl = path
          updateDraft({ insuranceUrl: path })
        }

        const { error } = await supabase
          .from('drivers')
          .update({
            license_doc_url:  licenseUrl,
            license_expiry:   draft.licenseExpiry || null,
            insurance_doc_url: insuranceUrl,
            insurance_expiry:  draft.insuranceExpiry || null,
            onboarding_step:   3,
          })
          .eq('id', uid)
        if (error) throw error
      }

      if (currentStep === 4) {
        const { error } = await supabase
          .from('drivers')
          .update({
            background_check_status: 'in_progress',
            onboarding_step: 4,
          })
          .eq('id', uid)
        if (error) throw error
        updateDraft({ bgCheckStatus: 'in_progress', bgCheckSubmitted: true })
      }

      if (currentStep === 5) {
        const { error } = await supabase
          .from('drivers')
          .update({ onboarding_step: 5 })
          .eq('id', uid)
        if (error) throw error
      }

      if (currentStep === 6) {
        const isApproved = draft.bgCheckStatus === 'approved'
        const { error } = await supabase
          .from('drivers')
          .update({
            zip_codes:       draft.zipCodes,
            county:          draft.county,
            onboarding_step: 6,
            ...(isApproved ? { active: true } : {}),
          })
          .eq('id', uid)
        if (error) throw error
      }

      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed. Please try again.'
      setValidationErr(msg)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function goNext() {
    const validErr = validateStep(step, draft)
    if (validErr) { setValidationErr(validErr); return }
    setValidationErr(null)

    const ok = await saveStep(step)
    if (!ok) return

    if (step < TOTAL_STEPS) {
      setStep(s => s + 1)
    }
  }

  function goBack() {
    setValidationErr(null)
    if (step === 1) { navigate(-1); return }
    setStep(s => Math.max(s - 1, 1))
  }

  function renderStep() {
    switch (step) {
      case 1: return <StepPersonalInfo draft={draft} onChange={updateDraft} />
      case 2: return <StepVehicleInfo draft={draft} onChange={updateDraft} />
      case 3: return <StepDocuments draft={draft} onChange={updateDraft} />
      case 4: return <StepBackgroundCheck draft={draft} onChange={updateDraft} driverId={driverId} />
      case 5: return <StepPayoutSetup draft={draft} onChange={updateDraft} driverId={driverId} />
      case 6: return <StepServiceZone draft={draft} onChange={updateDraft} />
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
            className="text-white/80 hover:text-white text-sm font-medium py-1 pr-3 min-h-[44px] flex items-center"
          >
            ← Back
          </button>
          <h1 className="font-bold text-base">Driver Application</h1>
          <span className="text-white/60 text-sm">{step}/{TOTAL_STEPS}</span>
        </div>
        <ProgressBar step={step} total={TOTAL_STEPS} />
        <p className="text-white/80 text-xs mt-2 text-center font-medium">
          {STEP_LABELS[step - 1]}
        </p>
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto px-4 py-5 pb-32">
        {renderStep()}
      </main>

      {/* Validation error banner */}
      {validationErr && (
        <div className="fixed bottom-24 inset-x-4 z-40 bg-red-600 text-white text-sm rounded-xl px-4 py-3 shadow-lg">
          ⚠️ {validationErr}
        </div>
      )}

      {/* Fixed bottom nav */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3">
        <Button variant="secondary" onClick={goBack} className="flex-1" disabled={saving}>
          Back
        </Button>
        <Button onClick={goNext} className="flex-1" loading={saving}>
          {isLastStep ? 'Submit Application' : 'Next →'}
        </Button>
      </div>
    </div>
  )
}
