import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import {
  useNemtClaim,
  NEMT_TRIP_TYPE_EMOJI,
  NEMT_TRIP_TYPE_LABELS,
  NEMT_CLAIM_STATUS_LABELS,
  type NemtClaimStatus,
} from '../../../hooks/useNemt'
import { useTripStatusLog, FINE_STATUS_LABELS } from '../../../hooks/useTrips'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function statusColor(s: NemtClaimStatus): 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'orange' {
  const map: Record<NemtClaimStatus, 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'orange'> = {
    draft:              'gray',
    ready_to_submit:    'blue',
    submitted:          'amber',
    paid:               'green',
    denied:             'red',
    needs_resubmission: 'orange',
  }
  return map[s]
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? 'text-green-600 text-base' : 'text-amber-500 text-base'}>{ok ? '✓' : '✗'}</span>
      <span className={`text-sm ${ok ? 'text-gray-700' : 'text-amber-700'}`}>{label}</span>
    </div>
  )
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
        <h3 className="font-bold text-lg text-gray-900">{title}</h3>
        {children}
        <button onClick={onClose} className="text-sm text-gray-500 w-full text-center">Cancel</button>
      </div>
    </div>
  )
}

export function NemtClaimDetailPage() {
  const { claimId } = useParams<{ claimId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const id = claimId ?? ''

  const { claim, loading, refetch } = useNemtClaim(id)
  const { log } = useTripStatusLog(claim?.trip_id ?? '', 'nemt')

  const [toast, setToast]     = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)

  // Edit loaded miles
  const [editMiles,  setEditMiles]  = useState(false)
  const [milesVal,   setMilesVal]   = useState('')

  // Admin notes
  const [notes,      setNotes]      = useState('')
  const [notesSaved, setNotesSaved] = useState(false)

  // Modals
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [veridaId,        setVeridaId]        = useState('')
  const [showPaidModal,   setShowPaidModal]   = useState(false)
  const [paidAmount,      setPaidAmount]      = useState('')
  const [showDenyModal,   setShowDenyModal]   = useState(false)
  const [denyReason,      setDenyReason]      = useState('')

  async function update(payload: Record<string, unknown>) {
    setSaving(true)
    const { error } = await supabase.from('nemt_claims').update(payload).eq('id', id)
    if (error) setToast(`Error: ${error.message}`)
    else refetch()
    setSaving(false)
    return !error
  }

  async function approve() {
    if (!claim?.loaded_miles) { setToast('Set loaded miles before approving.'); return }
    const ok = await update({
      status:            'ready_to_submit',
      admin_approved_by: user?.id,
      admin_approved_at: new Date().toISOString(),
    })
    if (ok) setToast('Claim approved — ready for Verida submission.')
  }

  async function submitToVerida() {
    if (!veridaId.trim()) return
    const ok = await update({
      status:                  'submitted',
      verida_claim_id:         veridaId.trim(),
      submitted_by:            user?.id,
      submitted_at:            new Date().toISOString(),
      verida_submission_date:  new Date().toISOString().slice(0, 10),
    })
    if (ok) { setShowSubmitModal(false); setToast('Claim submitted to Verida.') }
  }

  async function markPaid() {
    const amt = parseFloat(paidAmount)
    if (isNaN(amt) || amt <= 0) { setToast('Enter a valid paid amount.'); return }
    const ok = await update({
      status:     'paid',
      paid_amount: amt,
      paid_at:    new Date().toISOString(),
    })
    if (ok) { setShowPaidModal(false); setToast('Claim marked as paid.') }
  }

  async function markDenied() {
    if (!denyReason.trim()) { setToast('Enter denial reason.'); return }
    const ok = await update({
      status:        'denied',
      denial_reason: denyReason.trim(),
      denied_at:     new Date().toISOString(),
    })
    if (ok) { setShowDenyModal(false); setToast('Claim marked as denied.') }
  }

  async function resubmit() {
    const ok = await update({
      status:              'ready_to_submit',
      resubmission_count:  (claim?.resubmission_count ?? 0) + 1,
    })
    if (ok) setToast('Claim marked ready to resubmit.')
  }

  async function saveMiles() {
    const val = parseFloat(milesVal)
    if (isNaN(val) || val <= 0) { setToast('Enter valid mileage.'); return }
    const newBilled = (claim?.base_fee ?? 0) + val * (claim?.mileage_rate ?? 0)
    const ok = await update({ loaded_miles: val, total_billed: newBilled })
    if (ok) { setEditMiles(false); setToast('Miles updated.') }
  }

  async function saveNotes() {
    const ok = await update({ admin_notes: notes })
    if (ok) setNotesSaved(true)
  }

  if (loading) {
    return <div className="p-4 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
  }

  if (!claim) return <div className="p-4 text-gray-500">Claim not found.</div>

  const status = claim.status as NemtClaimStatus

  // Claim completeness — all required before admin can approve
  const completeness = [
    { ok: claim.loaded_miles != null,              label: 'Loaded miles set' },
    { ok: !!claim.medicaid_id,                     label: 'Medicaid ID on file' },
    { ok: !!claim.pickup_address,                  label: 'Pickup address' },
    { ok: !!claim.appointment_address,             label: 'Appointment address' },
    { ok: !!claim.pickup_signature_url,            label: 'Pickup signature captured' },
    { ok: !!claim.dropoff_signature_url,           label: 'Drop-off signature captured' },
    { ok: claim.pre_trip_checklist_completed,      label: 'Pre-trip checklist completed' },
  ]
  const claimComplete = completeness.every(c => c.ok)
  const missingCount  = completeness.filter(c => !c.ok).length

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 text-lg">←</button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl">{NEMT_TRIP_TYPE_EMOJI[claim.trip_type]}</span>
            <span className="font-bold text-gray-900">{NEMT_TRIP_TYPE_LABELS[claim.trip_type]}</span>
            <Badge color={statusColor(status)}>{NEMT_CLAIM_STATUS_LABELS[status]}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{fmtDate(claim.trip_date)}</p>
        </div>
      </div>

      {/* Billing snapshot */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Billing</h3>
          {status === 'draft' && !editMiles && (
            <button onClick={() => { setEditMiles(true); setMilesVal(claim.loaded_miles?.toString() ?? '') }}
              className="text-xs text-[#1a5c38] font-medium">Edit miles</button>
          )}
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-gray-500 text-xs">Medicaid ID</p><p className="font-mono font-medium">{claim.medicaid_id}</p></div>
            <div><p className="text-gray-500 text-xs">Base Fee</p><p className="font-medium">${claim.base_fee.toFixed(2)}</p></div>
            <div>
              <p className="text-gray-500 text-xs">Loaded Miles</p>
              {editMiles ? (
                <div className="flex gap-2 mt-1">
                  <input type="number" step="0.1" min="0.1" value={milesVal}
                    onChange={e => setMilesVal(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-[#1a5c38]" />
                  <button onClick={saveMiles} disabled={saving}
                    className="text-xs text-[#1a5c38] font-medium disabled:opacity-50">Save</button>
                  <button onClick={() => setEditMiles(false)} className="text-xs text-gray-500">✕</button>
                </div>
              ) : (
                <p className={`font-medium ${claim.loaded_miles == null ? 'text-amber-600' : ''}`}>
                  {claim.loaded_miles != null ? `${claim.loaded_miles} mi` : '⚠ Not set'}
                </p>
              )}
            </div>
            <div><p className="text-gray-500 text-xs">Rate</p><p className="font-medium">${claim.mileage_rate}/mi</p></div>
          </div>
          {claim.loaded_miles != null && (
            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="text-gray-500">
                ${claim.base_fee.toFixed(2)} base + {claim.loaded_miles} mi × ${claim.mileage_rate} =
              </p>
              <p className="text-xl font-bold text-gray-900 mt-1">${(claim.total_billed ?? 0).toFixed(2)} total</p>
            </div>
          )}
          {claim.verida_claim_id && (
            <div><p className="text-gray-500 text-xs">Verida Claim ID</p><p className="font-mono text-sm font-medium">{claim.verida_claim_id}</p></div>
          )}
          {claim.paid_amount != null && (
            <div><p className="text-gray-500 text-xs">Paid Amount</p><p className="text-lg font-bold text-green-700">${claim.paid_amount.toFixed(2)}</p></div>
          )}
          {claim.denial_reason && (
            <div><p className="text-gray-500 text-xs">Denial Reason</p><p className="text-sm text-red-700">{claim.denial_reason}</p></div>
          )}
        </div>
      </div>

      {/* Compliance evidence */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Compliance Evidence</h3>
        <div className="space-y-2">
          <Check ok={claim.pre_trip_checklist_completed} label="Pre-trip safety checklist" />
          <Check ok={!!claim.gps_pickup_coords}          label="GPS at pickup" />
          <Check ok={!!claim.pickup_signature_url}       label="Pickup signature" />
          <Check ok={!!claim.appointment_gps}            label="GPS at appointment" />
          <Check ok={!!claim.gps_dropoff_coords}         label="GPS at drop-off" />
          <Check ok={!!claim.dropoff_signature_url}      label="Drop-off signature" />
        </div>
        {claim.pickup_signature_url && (
          <p className="text-xs text-gray-400 mt-2 font-mono">Pickup sig: {claim.pickup_signature_url}</p>
        )}
        {claim.dropoff_signature_url && (
          <p className="text-xs text-gray-400 font-mono">Drop-off sig: {claim.dropoff_signature_url}</p>
        )}
      </div>

      {/* Workflow timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-2">Claim Timeline</h3>
        <div className="space-y-1 text-sm">
          <p className="text-gray-600">Created: {fmtDateTime(claim.created_at)}</p>
          {claim.admin_approved_at && <p className="text-gray-600">Approved: {fmtDateTime(claim.admin_approved_at)}</p>}
          {claim.submitted_at && <p className="text-gray-600">Submitted: {fmtDateTime(claim.submitted_at)}</p>}
          {claim.paid_at    && <p className="text-green-700 font-medium">Paid: {fmtDateTime(claim.paid_at)}</p>}
          {claim.denied_at  && <p className="text-red-700">Denied: {fmtDateTime(claim.denied_at)}</p>}
          {claim.resubmission_count > 0 && <p className="text-gray-500">Resubmissions: {claim.resubmission_count}</p>}
        </div>
      </div>

      {/* Claim completeness — only shown when draft and something is missing */}
      {status === 'draft' && !claimComplete && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="font-semibold text-amber-900 text-sm mb-2">
            ⚠️ {missingCount} required field{missingCount !== 1 ? 's' : ''} missing before approval
          </p>
          <div className="space-y-1.5">
            {completeness.map(c => (
              <div key={c.label} className="flex items-center gap-2">
                <span className={c.ok ? 'text-green-600' : 'text-red-500'}>{c.ok ? '✓' : '✗'}</span>
                <span className={`text-xs ${c.ok ? 'text-gray-500' : 'text-red-700 font-medium'}`}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-2">
        {status === 'draft' && (
          <Button fullWidth onClick={approve} loading={saving}
            disabled={saving || !claimComplete}>
            {!claimComplete ? `Complete ${missingCount} missing field${missingCount !== 1 ? 's' : ''} to approve` : 'Approve for Submission'}
          </Button>
        )}
        {status === 'ready_to_submit' && (
          <Button fullWidth onClick={() => setShowSubmitModal(true)}>
            Mark as Submitted to Verida
          </Button>
        )}
        {status === 'submitted' && (
          <div className="flex gap-2">
            <Button variant="primary"  className="flex-1" onClick={() => setShowPaidModal(true)}>Mark Paid</Button>
            <Button variant="danger"   className="flex-1" onClick={() => setShowDenyModal(true)}>Mark Denied</Button>
          </div>
        )}
        {(status === 'denied' || status === 'needs_resubmission') && (
          <Button fullWidth onClick={resubmit} loading={saving}>Mark Ready to Resubmit</Button>
        )}
      </div>

      {/* Admin notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <h3 className="font-semibold text-gray-900">Admin Notes</h3>
        <textarea
          rows={3}
          value={notes || claim.admin_notes || ''}
          onChange={e => { setNotes(e.target.value); setNotesSaved(false) }}
          placeholder="Correction notes, audit comments…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
        />
        <Button variant="secondary" onClick={saveNotes} loading={saving} disabled={notesSaved}>
          {notesSaved ? 'Saved ✓' : 'Save Notes'}
        </Button>
      </div>

      {/* Trip audit log */}
      {log.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Trip Status Log</h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {log.map(entry => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-800">{FINE_STATUS_LABELS[entry.status] ?? entry.status}</p>
                  <span className="text-xs text-gray-400 shrink-0">{fmtDateTime(entry.created_at)}</span>
                </div>
                {entry.note && <p className="text-xs text-gray-500 mt-0.5">{entry.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Modals */}
      {showSubmitModal && (
        <Modal title="Submit to Verida" onClose={() => setShowSubmitModal(false)}>
          <p className="text-sm text-gray-600">Enter the Verida Claim ID (required for reconciliation).</p>
          <input
            type="text"
            value={veridaId}
            onChange={e => setVeridaId(e.target.value)}
            placeholder="e.g. VGA-2026-00123456"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
          />
          <Button fullWidth onClick={submitToVerida} disabled={!veridaId.trim() || saving} loading={saving}>
            Confirm Submission
          </Button>
        </Modal>
      )}

      {showPaidModal && (
        <Modal title="Mark as Paid" onClose={() => setShowPaidModal(false)}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount Paid</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number" step="0.01" min="0"
                value={paidAmount}
                onChange={e => setPaidAmount(e.target.value)}
                placeholder={claim.total_billed?.toFixed(2) ?? '0.00'}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
              />
            </div>
          </div>
          <Button fullWidth variant="primary" onClick={markPaid} disabled={!paidAmount || saving} loading={saving}>
            Confirm Payment
          </Button>
        </Modal>
      )}

      {showDenyModal && (
        <Modal title="Mark as Denied" onClose={() => setShowDenyModal(false)}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Denial Reason</label>
            <textarea
              rows={3}
              value={denyReason}
              onChange={e => setDenyReason(e.target.value)}
              placeholder="Missing documentation, invalid Medicaid ID, etc."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a5c38]"
            />
          </div>
          <Button fullWidth variant="danger" onClick={markDenied} disabled={!denyReason.trim() || saving} loading={saving}>
            Confirm Denial
          </Button>
        </Modal>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
