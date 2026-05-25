import { useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { Badge } from '../../../../components/ui/Badge'
import { Button } from '../../../../components/ui/Button'
import type { DriverDraft } from '../DriverOnboardingWizard'

interface Props {
  draft:    DriverDraft
  onChange: (partial: Partial<DriverDraft>) => void
  driverId: string | null
}

const STATUS_COLOR: Record<DriverDraft['bgCheckStatus'], 'amber' | 'blue' | 'green' | 'red'> = {
  pending:     'amber',
  in_progress: 'blue',
  approved:    'green',
  denied:      'red',
}

const STATUS_LABEL: Record<DriverDraft['bgCheckStatus'], string> = {
  pending:     'Not yet submitted',
  in_progress: 'In progress — typically 2–5 business days',
  approved:    'Approved ✓',
  denied:      'Not approved',
}

export function StepBackgroundCheck({ draft, onChange, driverId }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!driverId) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { error } = await supabase.functions.invoke('initiate-checkr', {
        body: { driver_id: driverId },
      })
      if (error) throw error
      onChange({ bgCheckSubmitted: true, bgCheckStatus: 'in_progress' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit. Please try again.'
      setSubmitError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const alreadySubmitted = draft.bgCheckSubmitted || draft.bgCheckStatus === 'in_progress' || draft.bgCheckStatus === 'approved'

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">🔍</span>
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Background Check</h3>
            <p className="text-sm text-gray-500">Powered by Checkr</p>
          </div>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          Pathway uses Checkr to run a secure background check on all drivers. This typically includes
          a criminal history search, sex offender registry, and motor vehicle report. Results
          are usually available within 2–5 business days.
        </p>
      </div>

      {/* Current status */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="text-sm font-semibold text-gray-700 mb-2">Current Status</p>
        <div className="flex items-center gap-2">
          <Badge color={STATUS_COLOR[draft.bgCheckStatus]}>
            {STATUS_LABEL[draft.bgCheckStatus]}
          </Badge>
        </div>
      </div>

      {/* Consent */}
      {!alreadySubmitted && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.bgCheckConsent}
              onChange={e => onChange({ bgCheckConsent: e.target.checked })}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-[#1a5c38] accent-[#1a5c38]"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              I consent to a background check by Checkr on behalf of Pathway. I authorize Pathway and
              Checkr to obtain my consumer report for employment screening purposes.
            </span>
          </label>
        </div>
      )}

      {/* Submit button */}
      {!alreadySubmitted && (
        <Button
          fullWidth
          onClick={handleSubmit}
          disabled={!draft.bgCheckConsent || !driverId}
          loading={submitting}
        >
          Submit Background Check
        </Button>
      )}

      {alreadySubmitted && draft.bgCheckStatus !== 'approved' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-4 text-sm text-blue-800">
          ℹ️ Your background check has been submitted. You can continue with the rest of your
          application while we wait for results. You'll receive an SMS when your check is complete.
        </div>
      )}

      {draft.bgCheckStatus === 'approved' && (
        <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-4 text-sm text-green-800 font-medium">
          ✅ Background check approved! You're cleared to drive for Pathway.
        </div>
      )}

      {draft.bgCheckStatus === 'denied' && (
        <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-4 text-sm text-red-800">
          ❌ Your background check was not approved. Please contact{' '}
          <a href="mailto:support@pathway.com" className="underline">support@pathway.com</a>{' '}
          if you believe this is an error.
        </div>
      )}

      {submitError && (
        <p className="text-sm text-red-600">{submitError}</p>
      )}
    </div>
  )
}
