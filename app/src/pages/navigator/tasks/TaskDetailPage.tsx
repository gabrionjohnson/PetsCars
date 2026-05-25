import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { enqueueTaskStep } from '../../../lib/db'
import { sendSms } from '../../../lib/smsClient'
import { useAuth } from '../../../hooks/useAuth'
import {
  useTask,
  CATEGORY_EMOJI,
  STATUS_CONFIG,
  TASK_CATEGORIES,
  type Task,
} from '../../../hooks/useTasks'

// ── Helpers ────────────────────────────────────────────────────────────────

function formatStepTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function getCategoryLabel(value: string) {
  return TASK_CATEGORIES.find(c => c.value === value)?.label ?? value
}

// ── Status transition map ──────────────────────────────────────────────────

const TRANSITIONS: Record<Task['status'], Task['status'][]> = {
  pending:     ['in_progress', 'on_hold'],
  in_progress: ['on_hold', 'completed'],
  on_hold:     ['in_progress', 'completed'],
  completed:   [],
  canceled:    [],
}

const TRANSITION_LABELS: Record<Task['status'], string> = {
  in_progress: 'Mark In Progress',
  on_hold:     'Needs Attention',
  completed:   'Mark Complete',
  pending:     'Reset to Pending',
  canceled:    'Cancel Task',
}

// ── Document link modal ────────────────────────────────────────────────────

interface DocModalProps {
  clientId:   string
  linkedDocs: string[]
  onClose:    () => void
  onLink:     (docId: string) => void
}

function DocumentLinkModal({ clientId, linkedDocs, onClose, onLink }: DocModalProps) {
  const [docs,    setDocs]    = useState<{ id: string; filename: string; doc_type: string }[]>([])
  const [loading, setLoading] = useState(true)

  // Load docs once on mount
  useState(() => {
    supabase
      .from('documents')
      .select('id,filename,doc_type')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setDocs(data)
        setLoading(false)
      })
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div
        className="bg-white w-full rounded-t-2xl p-4 pb-8 max-h-[70vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-base">Link a Document</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            ×
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No documents in this client's vault yet.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map(doc => {
              const isLinked = linkedDocs.includes(doc.id)
              return (
                <li key={doc.id}>
                  <button
                    disabled={isLinked}
                    onClick={() => { onLink(doc.id); onClose() }}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors min-h-[48px]
                      ${isLinked
                        ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-default'
                        : 'border-gray-200 bg-white hover:border-[#1a5c38] hover:bg-[#1a5c38]/5'}`}
                  >
                    <span className="font-medium text-sm">{doc.filename}</span>
                    <span className="ml-2 text-xs text-gray-400">{doc.doc_type}</span>
                    {isLinked && <span className="ml-2 text-xs text-green-600 font-medium">linked</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate   = useNavigate()
  const { user }   = useAuth()

  const { task, loading, refetch } = useTask(taskId ?? '')

  const [stepContent,    setStepContent]    = useState('')
  const [savingStep,     setSavingStep]     = useState(false)
  const [stepToast,      setStepToast]      = useState<string | null>(null)

  const [completionNote, setCompletionNote] = useState('')
  const [showCompletion, setShowCompletion] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const [showDocModal,   setShowDocModal]   = useState(false)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    setStepToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setStepToast(null), 3500)
  }

  // ── Save step ────────────────────────────────────────────────────────────

  async function handleSaveStep() {
    const content = stepContent.trim()
    if (!content || !taskId) return
    setSavingStep(true)

    if (navigator.onLine) {
      const { error } = await supabase.rpc('append_task_step', {
        p_task_id: taskId,
        p_content: content,
      })
      if (error) {
        showToast('Error saving step: ' + error.message)
      } else {
        setStepContent('')
        await refetch()
      }
    } else {
      await enqueueTaskStep(taskId, content)
      setStepContent('')
      showToast('Saved offline — will sync when connected')
    }

    setSavingStep(false)
  }

  // ── Status transition ────────────────────────────────────────────────────

  async function handleStatusTransition(newStatus: Task['status']) {
    if (!task) return

    if (newStatus === 'completed') {
      setShowCompletion(true)
      return
    }

    setUpdatingStatus(true)
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id)
    await refetch()
    setUpdatingStatus(false)
  }

  async function handleConfirmComplete() {
    if (!task || !completionNote.trim()) return
    setUpdatingStatus(true)

    const updatedNotes = task.notes
      ? `${task.notes}\n\n[Completion] ${completionNote.trim()}`
      : `[Completion] ${completionNote.trim()}`

    await supabase
      .from('tasks')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        notes:        updatedNotes,
      })
      .eq('id', task.id)

    // Fetch client + proxy info for SMS
    const { data: clientData } = await supabase
      .from('clients')
      .select('phone, name, family_proxy_id')
      .eq('id', task.client_id)
      .single()

    if (clientData?.phone) {
      const navigatorName = user?.email ?? 'Your Navigator'

      await sendSms({
        type:          'TASK_COMPLETE',
        to:            clientData.phone,
        clientName:    clientData.name,
        navigatorName,
        taskTitle:     task.title,
      })

      if (clientData.family_proxy_id) {
        const { data: proxyData } = await supabase
          .from('family_proxies')
          .select('profiles(phone)')
          .eq('id', clientData.family_proxy_id)
          .single()

        const proxyPhone = (proxyData?.profiles as { phone?: string } | null)?.phone
        if (proxyPhone) {
          await sendSms({
            type:          'TASK_COMPLETE',
            to:            proxyPhone,
            clientName:    clientData.name,
            navigatorName,
            taskTitle:     task.title,
          })
        }
      }
    }

    setShowCompletion(false)
    setCompletionNote('')
    await refetch()
    setUpdatingStatus(false)
  }

  // ── Link document ────────────────────────────────────────────────────────

  async function handleLinkDoc(docId: string) {
    if (!task) return
    const updated = [...(task.documents ?? []), docId]
    await supabase.from('tasks').update({ documents: updated }).eq('id', task.id)
    await refetch()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f3ed] p-4 space-y-4">
        <div className="h-16 bg-white rounded-xl animate-pulse" />
        <div className="h-32 bg-white rounded-xl animate-pulse" />
        <div className="h-48 bg-white rounded-xl animate-pulse" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[#f7f3ed] flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-4xl mb-3">🔍</p>
          <p className="font-medium">Task not found.</p>
        </div>
      </div>
    )
  }

  const statusCfg     = STATUS_CONFIG[task.status]
  const emoji         = CATEGORY_EMOJI[task.category] ?? '📋'
  const categoryLabel = getCategoryLabel(task.category)
  const transitions   = TRANSITIONS[task.status]

  return (
    <div className="min-h-screen bg-[#f7f3ed]">
      {/* Toast */}
      {stepToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm
                        px-4 py-3 rounded-xl shadow-lg max-w-[90vw] text-center pointer-events-none">
          {stepToast}
        </div>
      )}

      {/* Header */}
      <div className="bg-[#1a5c38] text-white px-4 pt-5 pb-4">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-white/80 hover:text-white text-2xl leading-none
                       min-w-[44px] min-h-[44px] flex items-center shrink-0"
            aria-label="Go back"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <h1 className="text-lg font-bold leading-snug flex-1 min-w-0">{task.title}</h1>
              <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold ${statusCfg.color}`}>
                {statusCfg.label}
              </span>
            </div>
            <p className="text-white/70 text-sm mt-1">{emoji} {categoryLabel}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 pb-10">

        {/* Status transitions */}
        {transitions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {transitions.map(newStatus => (
                <button
                  key={newStatus}
                  disabled={updatingStatus}
                  onClick={() => handleStatusTransition(newStatus)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors
                              disabled:opacity-50 min-h-[48px]
                    ${newStatus === 'completed'
                      ? 'border-green-600 text-green-700 hover:bg-green-50'
                      : newStatus === 'on_hold'
                        ? 'border-amber-500 text-amber-700 hover:bg-amber-50'
                        : 'border-blue-500 text-blue-700 hover:bg-blue-50'}`}
                >
                  {TRANSITION_LABELS[newStatus]}
                </button>
              ))}
            </div>

            {/* Completion note prompt */}
            {showCompletion && (
              <div className="mt-4 space-y-3 border-t pt-4 border-gray-100">
                <p className="text-sm font-semibold text-gray-700">Add a completion note: *</p>
                <textarea
                  value={completionNote}
                  onChange={e => setCompletionNote(e.target.value)}
                  placeholder="Describe what was accomplished…"
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none
                             focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowCompletion(false); setCompletionNote('') }}
                    className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold
                               text-gray-600 hover:bg-gray-50 transition-colors min-h-[48px]"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!completionNote.trim() || updatingStatus}
                    onClick={handleConfirmComplete}
                    className="flex-1 py-3 rounded-xl bg-[#1a5c38] text-white text-sm font-semibold
                               hover:bg-[#2d7a50] disabled:opacity-50 transition-colors min-h-[48px]"
                  >
                    {updatingStatus ? 'Saving…' : 'Confirm Complete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Steps log */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Activity Log</p>

          {task.steps.length === 0 ? (
            <p className="text-sm text-gray-400 italic mb-4">No steps logged yet.</p>
          ) : (
            <ol className="relative border-l-2 border-[#1a5c38]/20 ml-2 mb-4 space-y-4 pl-4">
              {task.steps.map(step => (
                <li key={step.id}>
                  <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-[#1a5c38]" />
                  <p className="text-xs text-gray-400 mb-0.5">{formatStepTime(step.timestamp)}</p>
                  <p className="text-sm text-gray-800 leading-relaxed">{step.content}</p>
                </li>
              ))}
            </ol>
          )}

          {/* Add step */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <textarea
              value={stepContent}
              onChange={e => setStepContent(e.target.value)}
              placeholder="Note what you did or what's next…"
              rows={3}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none
                         focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent resize-none"
            />
            <button
              disabled={!stepContent.trim() || savingStep}
              onClick={handleSaveStep}
              className="w-full bg-[#1a5c38] text-white font-semibold py-3 rounded-xl text-sm
                         hover:bg-[#2d7a50] active:bg-[#0f3d25] disabled:opacity-50 transition-colors min-h-[48px]"
            >
              {savingStep ? 'Saving…' : 'Save Step'}
            </button>
          </div>
        </div>

        {/* Notes */}
        {task.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{task.notes}</p>
          </div>
        )}

        {/* Documents */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</p>
            <button
              onClick={() => setShowDocModal(true)}
              className="text-sm text-[#1a5c38] font-semibold hover:underline min-h-[44px] px-2 flex items-center"
            >
              + Link Document
            </button>
          </div>
          {(!task.documents || task.documents.length === 0) ? (
            <p className="text-sm text-gray-400 italic">No documents linked yet.</p>
          ) : (
            <ul className="space-y-2">
              {task.documents.map(docId => (
                <li key={docId} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-base">📄</span>
                  <span className="font-mono text-xs text-gray-500 truncate">{docId}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      {/* Document modal */}
      {showDocModal && (
        <DocumentLinkModal
          clientId={task.client_id}
          linkedDocs={task.documents ?? []}
          onClose={() => setShowDocModal(false)}
          onLink={handleLinkDoc}
        />
      )}
    </div>
  )
}
