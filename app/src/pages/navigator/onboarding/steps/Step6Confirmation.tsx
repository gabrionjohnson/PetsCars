import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../../lib/supabase'
import { uploadDocument } from '../../../../lib/storage'
import { sendSms } from '../../../../lib/smsClient'
import { Button } from '../../../../components/ui/Button'
import { Badge } from '../../../../components/ui/Badge'
import type { OnboardingDraft } from '../OnboardingWizard'
import type { IncomeRange } from '../../../../lib/benefitsScreener'

interface Props {
  draft: OnboardingDraft
  queuedFiles: Map<string, File>
  navigatorName: string
  onSuccess?: () => void
}

function incomeToDbLevel(range: string): string {
  const map: Record<string, string> = {
    under_500:  'very_low',
    '500_1000': 'low',
    '1000_1500':'low',
    '1500_2000':'moderate',
    over_2000:  'above_moderate',
  }
  return map[range] ?? 'unknown'
}

export function Step6Confirmation({ draft, queuedFiles, navigatorName, onSuccess }: Props) {
  const navigate = useNavigate()
  const [activating, setActivating] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const clientName = `${draft.firstName} ${draft.lastName}`.trim()
  const docCount   = queuedFiles.size + draft.documents.length

  async function activate() {
    setActivating(true)
    setError(null)

    try {
      // 1. Get current user (navigator)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // 2. Insert client
      const vaStatusBool = draft.vaStatus !== 'no'
      const proxyNotes   = draft.hasProxy
        ? `Family proxy: ${draft.proxyName} (${draft.proxyRelationship}), ${draft.proxyPhone}, ${draft.proxyEmail}. Admin invite required.`
        : null

      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .insert({
          name:                clientName,
          dob:                 draft.dob || null,
          phone:               draft.phone,
          address:             draft.address || null,
          zip:                 draft.zip || null,
          county:              draft.county || null,
          income_level:        draft.incomeRange ? incomeToDbLevel(draft.incomeRange) : null,
          va_status:           vaStatusBool,
          insurance_info:      draft.insurance ? { type: draft.insurance } : null,
          navigator_id:        user.id,
          subscription_status: 'inactive',
          notes:               proxyNotes,
        })
        .select('id')
        .single()

      if (clientErr || !client) throw new Error(clientErr?.message ?? 'Failed to create client')
      const clientId = client.id

      // 3. Upload queued documents
      const uploadedPaths: { type: string; path: string }[] = [...draft.documents]
      for (const [docType, file] of queuedFiles.entries()) {
        const path = await uploadDocument(clientId, docType, file)
        uploadedPaths.push({ type: docType, path })
      }

      // 4. Insert document records
      if (uploadedPaths.length > 0) {
        const { error: docsErr } = await supabase.from('documents').insert(
          uploadedPaths.map(d => ({
            client_id:     clientId,
            navigator_id:  user.id,
            document_type: d.type,
            storage_path:  d.path,
          }))
        )
        if (docsErr) console.error('Documents insert error:', docsErr)
      }

      // 5. Insert benefits screening if answers exist
      const answerCount = Object.keys(draft.screenerAnswers).length
      if (answerCount > 0) {
        const { error: screenErr } = await supabase.from('benefits_screenings').insert({
          client_id:             clientId,
          navigator_id:          user.id,
          answers:               draft.screenerAnswers,
          recommended_programs:  draft.screenerResults,
          income_range:          (draft.incomeRange as IncomeRange) || null,
        })
        if (screenErr) console.error('Screening insert error:', screenErr)
      }

      // 6. Send welcome SMS
      if (draft.phone) {
        await sendSms({
          type:          'CLIENT_WELCOME',
          to:            draft.phone,
          clientName:    clientName,
          navigatorName: navigatorName,
        })
      }

      // 7. Navigate to client profile
      onSuccess?.()
      navigate(`/nav/clients/${clientId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      setActivating(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-gray-700">
        Review the information below, then tap <strong>Activate Client</strong> to create the record.
      </p>

      {/* Client summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <p className="font-bold text-gray-900 text-lg">{clientName || '—'}</p>
        <p className="text-sm text-gray-600">📞 {draft.phone || '—'}</p>
        {draft.dob && <p className="text-sm text-gray-600">🎂 DOB: {draft.dob}</p>}
        {draft.address && <p className="text-sm text-gray-600">🏠 {draft.address}, {draft.zip}</p>}
        {draft.county && <p className="text-sm text-gray-600">📍 {draft.county} County</p>}
        {draft.insurance && (
          <p className="text-sm text-gray-600">🏥 Insurance: {draft.insurance}</p>
        )}
        {draft.vaStatus !== 'no' && (
          <p className="text-sm text-gray-600">
            🎖️ {draft.vaStatus === 'veteran' ? 'Veteran' : 'Surviving Spouse of Veteran'}
          </p>
        )}
      </div>

      {/* Benefits screener summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <p className="font-semibold text-gray-900">
          🎯 Benefits Screener
        </p>
        {draft.screenerResults.length === 0 ? (
          <p className="text-sm text-gray-500">No screener completed</p>
        ) : (
          <>
            <p className="text-sm text-gray-600">
              {draft.screenerResults.length} program{draft.screenerResults.length !== 1 ? 's' : ''} recommended
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {draft.screenerResults.map(p => (
                <Badge key={p.programId} color={p.priority === 1 ? 'red' : p.priority === 2 ? 'amber' : 'blue'}>
                  {p.programName}
                </Badge>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="font-semibold text-gray-900">
          📄 Documents
        </p>
        <p className="text-sm text-gray-600 mt-1">
          {docCount} of 7 documents captured
        </p>
      </div>

      {/* Family proxy */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <p className="font-semibold text-gray-900">👨‍👩‍👧 Family Proxy</p>
        {draft.hasProxy && draft.proxyName ? (
          <div className="mt-1 space-y-0.5">
            <p className="text-sm text-gray-600">{draft.proxyName} ({draft.proxyRelationship})</p>
            <p className="text-sm text-gray-500">{draft.proxyEmail}</p>
            <p className="text-xs text-amber-700 mt-1">
              ⚠️ Family proxy invite will be sent by admin after activation.
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500 mt-1">None added</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          ❌ {error}
        </div>
      )}

      <Button
        fullWidth
        loading={activating}
        onClick={activate}
        className="text-lg py-4"
      >
        {activating ? 'Activating…' : '🚀 Activate Client'}
      </Button>
    </div>
  )
}
