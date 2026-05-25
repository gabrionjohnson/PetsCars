import { useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { Button } from '../../../../components/ui/Button'
import { Badge } from '../../../../components/ui/Badge'
import type { DriverDraft } from '../DriverOnboardingWizard'

interface Props {
  draft:    DriverDraft
  onChange: (partial: Partial<DriverDraft>) => void
  driverId: string | null
}

export function StepPayoutSetup({ draft, onChange, driverId }: Props) {
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  async function handleConnect() {
    if (!driverId) return
    setConnecting(true)
    setConnectError(null)
    try {
      const { error } = await supabase.functions.invoke('create-stripe-connect', {
        body: { driver_id: driverId },
      })
      if (error) throw error
      // In production this would redirect to Stripe's OAuth flow.
      // For dev, we just mark it as triggered.
      onChange({ stripeComplete: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start Stripe setup. Please try again.'
      setConnectError(msg)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">💰</span>
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Payout Setup</h3>
            <p className="text-sm text-gray-500">Powered by Stripe Connect</p>
          </div>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          Set up your payout account to receive earnings from completed trips. Pathway pays out
          bi-weekly via direct deposit. You'll need a bank account or debit card to complete setup.
        </p>
      </div>

      {/* Payout details card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
        <h4 className="font-semibold text-gray-900">Payout Details</h4>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Payout schedule</span>
          <span className="font-medium text-gray-900">Bi-weekly</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Your share (errand)</span>
          <span className="font-medium text-gray-900">75% of flat rate</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Payment method</span>
          <span className="font-medium text-gray-900">Direct deposit</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Stripe Connect status</span>
          <Badge color={draft.stripeComplete ? 'green' : 'amber'}>
            {draft.stripeComplete ? 'Connected' : 'Not connected'}
          </Badge>
        </div>
      </div>

      {!draft.stripeComplete ? (
        <>
          <Button fullWidth onClick={handleConnect} loading={connecting} disabled={!driverId}>
            Connect with Stripe →
          </Button>
          <p className="text-xs text-gray-500 text-center">
            You'll be redirected to Stripe to securely enter your bank details.
            Pathway never stores your account credentials.
          </p>
        </>
      ) : (
        <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-4 text-sm text-green-800 font-medium">
          ✅ Stripe Connect Onboarding — your payout account is connected.
        </div>
      )}

      {!draft.stripeComplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          ℹ️ You can skip this step for now and set up payouts later from your dashboard.
          You won't receive earnings until Stripe setup is complete.
        </div>
      )}

      {connectError && (
        <p className="text-sm text-red-600">{connectError}</p>
      )}
    </div>
  )
}
