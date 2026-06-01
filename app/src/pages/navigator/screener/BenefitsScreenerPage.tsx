import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  SCREENER_QUESTIONS,
  runAllPrograms,
  calcEstimatedAnnualValue,
  type ScreenerAnswers,
  type EligibilityResult,
  type EligibilityStatus,
} from '../../../lib/benefitsScreener'
import { Toast } from '../../../components/ui/Toast'

const DRAFT_KEY = (clientId: string) => `pathway_screener_draft_${clientId}`

interface ClientRow {
  id:           string
  name:         string
  dob:          string | null
  navigator_id: string | null
  family_proxy_id: string | null
}

const STATUS_CONFIG: Record<EligibilityStatus, { label: string; bg: string; text: string }> = {
  eligible:           { label: 'Eligible',           bg: 'bg-green-100',  text: 'text-green-800' },
  likely_eligible:    { label: 'Likely Eligible',    bg: 'bg-yellow-100', text: 'text-yellow-800' },
  needs_verification: { label: 'Needs Verification', bg: 'bg-gray-100',   text: 'text-gray-700' },
  not_eligible:       { label: 'Not Eligible',       bg: 'bg-red-100',    text: 'text-red-700' },
}

function fmtDollar(n: number): string {
  return n >= 1000
    ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
    : `$${n}`
}

export function BenefitsScreenerPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate     = useNavigate()

  const [client,        setClient]        = useState<ClientRow | null>(null)
  const [loadingClient, setLoadingClient] = useState(true)
  const [clientError,   setClientError]   = useState<string | null>(null)

  // Answers — partial until all questions answered
  const [answers,   setAnswers]   = useState<Partial<ScreenerAnswers>>({})
  const [subStep,   setSubStep]   = useState(0)
  const [results,   setResults]   = useState<EligibilityResult[]>([])
  const [showResults, setShowResults] = useState(false)

  // Save / enroll state
  const [saving,        setSaving]        = useState(false)
  const [toast,         setToast]         = useState<string | null>(null)
  const [enrollingId,   setEnrollingId]   = useState<string | null>(null)
  const [dismissedIds,  setDismissedIds]  = useState<Set<string>>(new Set())

  // Load client
  useEffect(() => {
    if (!clientId) return
    // Restore draft
    try {
      const saved = localStorage.getItem(DRAFT_KEY(clientId))
      if (saved) setAnswers(JSON.parse(saved) as Partial<ScreenerAnswers>)
    } catch { /* ignore */ }

    supabase.from('clients')
      .select('id,name,dob,navigator_id,family_proxy_id')
      .eq('id', clientId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setClientError(error?.message ?? 'Client not found')
        else setClient(data as ClientRow)
        setLoadingClient(false)
      })
  }, [clientId])

  const clientName = client?.name ?? 'the client'

  // Build visible question list (skip conditional questions when condition not met)
  const visibleQuestions = SCREENER_QUESTIONS.filter(q => {
    if (!q.conditional) return true
    return q.conditional(answers)
  })

  const totalVisible = visibleQuestions.length
  const allAnswered  = visibleQuestions.every(q => {
    const val = answers[q.id]
    if (q.type === 'multi_select') return Array.isArray(val) && (val as string[]).length > 0
    return val !== undefined
  })

  const currentQ = visibleQuestions[subStep]

  function saveAnswersDraft(updated: Partial<ScreenerAnswers>) {
    if (!clientId) return
    try { localStorage.setItem(DRAFT_KEY(clientId), JSON.stringify(updated)) }
    catch { /* storage full */ }
  }

  function handleSingleAnswer(qId: keyof ScreenerAnswers, value: string) {
    const updated = { ...answers, [qId]: value } as Partial<ScreenerAnswers>
    setAnswers(updated)
    saveAnswersDraft(updated)
    if (subStep < visibleQuestions.length - 1) setSubStep(s => s + 1)
  }

  function toggleMultiAnswer(qId: keyof ScreenerAnswers, value: string) {
    const current = (answers[qId] as string[] | undefined) ?? []
    let updated: string[]
    if (value === 'none' || value === 'not_sure') {
      updated = current.includes(value) ? [] : [value]
    } else {
      const without = current.filter(v => v !== 'none' && v !== 'not_sure')
      updated = without.includes(value)
        ? without.filter(v => v !== value)
        : [...without, value]
    }
    const newAnswers = { ...answers, [qId]: updated } as Partial<ScreenerAnswers>
    setAnswers(newAnswers)
    saveAnswersDraft(newAnswers)
  }

  function proceedFromMulti() {
    if (subStep < visibleQuestions.length - 1) setSubStep(s => s + 1)
  }

  function computeResults() {
    const scored = runAllPrograms(answers as ScreenerAnswers)
    setResults(scored)
    setShowResults(true)
  }

  async function saveScreening() {
    if (!clientId || !client) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const annualValue = calcEstimatedAnnualValue(results)
      const priorityPrograms = results.filter(r => r.priority === 1).map(r => r.programId)

      const { data: screeningRow, error } = await supabase
        .from('benefits_screenings')
        .insert({
          client_id:             clientId,
          navigator_id:          user?.id ?? client.navigator_id,
          answers,
          recommended_programs:  results,
          screener_version:      2,
          estimated_annual_value: annualValue,
          priority_programs:     priorityPrograms,
        })
        .select('id')
        .single()
      if (error) throw new Error(error.message)

      // Auto-SMS to family proxy if linked
      if (client.family_proxy_id) {
        const actionable = results.filter(
          r => r.status === 'eligible' || r.status === 'likely_eligible',
        )
        await sendFamilyProxySMS(clientId, actionable.length, annualValue, screeningRow?.id)
      }

      // Clear draft
      if (clientId) localStorage.removeItem(DRAFT_KEY(clientId))
      setToast('Screening saved.')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to save screening.')
    } finally {
      setSaving(false)
    }
  }

  async function sendFamilyProxySMS(
    cId: string,
    count: number,
    annualValue: number,
    screeningId?: string,
  ) {
    try {
      await supabase.functions.invoke('sms-dispatcher', {
        body: {
          type:       'benefits_screener_complete',
          client_id:  cId,
          program_count: count,
          annual_value:  annualValue,
          screening_id:  screeningId,
        },
      })
    } catch { /* non-blocking — SMS failure should not fail the save */ }
  }

  async function createTask(prog: EligibilityResult) {
    if (!clientId || !client) return
    setEnrollingId(prog.programId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('tasks').insert({
        client_id:    clientId,
        navigator_id: user?.id ?? client.navigator_id,
        title:        `Enroll in ${prog.programName}`,
        category:     'government_benefits',
        status:       'pending',
        priority:     prog.priority === 1 ? 'high' : prog.priority === 2 ? 'medium' : 'low',
        notes:        prog.notes ?? prog.actionLabel,
      })
      setToast(`Task created: ${prog.actionLabel}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to create task.')
    } finally {
      setEnrollingId(null)
    }
  }

  async function markEnrolled(prog: EligibilityResult) {
    if (!clientId || !client) return
    setEnrollingId(`enrolled_${prog.programId}`)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('benefit_enrollments').upsert({
        client_id:                clientId,
        program_id:               prog.programId,
        program_name:             prog.programName,
        status:                   'enrolled',
        enrollment_date:          new Date().toISOString().slice(0, 10),
        estimated_monthly_value:  prog.estimatedMonthlyValue,
        estimated_annual_value:   prog.estimatedAnnualValue,
        created_by:               user?.id,
      }, { onConflict: 'client_id,program_id' })
      setDismissedIds(prev => new Set([...prev, prog.programId]))
      setToast(`Marked enrolled: ${prog.programName}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to mark enrolled.')
    } finally {
      setEnrollingId(null)
    }
  }

  function dismissProgram(programId: string) {
    setDismissedIds(prev => new Set([...prev, programId]))
  }

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (loadingClient) {
    return (
      <div className="min-h-screen bg-[#f7f3ed] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#1a5c38] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (clientError) {
    return (
      <div className="min-h-screen bg-[#f7f3ed] flex items-center justify-center p-8">
        <div className="text-center space-y-3">
          <p className="text-red-600 font-semibold">{clientError}</p>
          <button onClick={() => navigate(-1)} className="text-[#1a5c38] underline text-sm">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  // ── Results view ─────────────────────────────────────────────────────────

  if (showResults) {
    const annualValue = calcEstimatedAnnualValue(results)
    const priority1   = results.filter(r => r.priority === 1 && !dismissedIds.has(r.programId))
    const otherActive = results.filter(
      r => r.priority !== 1 && r.status !== 'not_eligible' && !dismissedIds.has(r.programId),
    )
    const dismissed = results.filter(r => dismissedIds.has(r.programId))

    return (
      <div className="min-h-screen bg-[#f7f3ed] flex flex-col">
        <header className="bg-[#1a5c38] text-white px-4 pb-3 pt-4">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => navigate(-1)} className="text-white/80 hover:text-white text-sm">
              ← Back
            </button>
            <h1 className="font-bold text-base flex-1">Benefits Review</h1>
          </div>
          <p className="text-white/70 text-xs">{clientName} · {new Date().toLocaleDateString()}</p>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 pb-10 space-y-5">
          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
            <p className="font-semibold text-gray-900">
              {clientName}&apos;s Benefits Summary
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-[#1a5c38]">{results.length}</p>
                <p className="text-xs text-gray-500">Programs flagged</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-[#1a5c38]">
                  {annualValue >= 1000 ? `$${Math.round(annualValue / 1000)}k` : `$${annualValue}`}
                </p>
                <p className="text-xs text-gray-500">Est. annual value</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{priority1.length}</p>
                <p className="text-xs text-gray-500">Enroll now</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveScreening}
                disabled={saving}
                className="flex-1 bg-[#1a5c38] text-white text-sm font-medium py-2.5 rounded-lg
                           hover:bg-[#2d7a50] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : '💾 Save Screening'}
              </button>
              <button
                onClick={() => { setAnswers({}); setResults([]); setShowResults(false); setSubStep(0) }}
                className="border border-gray-200 text-gray-700 text-sm font-medium px-3 py-2.5 rounded-lg
                           hover:bg-gray-50 transition-colors"
              >
                Re-screen
              </button>
            </div>
          </div>

          {/* Elder abuse alert — surface immediately */}
          {results.filter(r => r.programId === 'elder_abuse').map(r => (
            <div key="elder_abuse" className="bg-red-50 border border-red-300 rounded-xl p-4">
              <p className="font-semibold text-red-800 text-sm mb-1">⚠️ Urgent: Possible Exploitation</p>
              <p className="text-xs text-red-700">{r.notes}</p>
              <p className="text-xs font-medium text-red-800 mt-2">{r.actionLabel}</p>
            </div>
          ))}

          {/* Enroll Now — Priority 1 */}
          {priority1.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Enroll Now ({priority1.length})
              </h3>
              <div className="space-y-3">
                {priority1.map(prog => (
                  <ProgramCard
                    key={prog.programId}
                    prog={prog}
                    enrollingId={enrollingId}
                    onTask={createTask}
                    onEnrolled={markEnrolled}
                    onDismiss={dismissProgram}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Other programs */}
          {otherActive.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Other Programs ({otherActive.length})
              </h3>
              <div className="space-y-3">
                {otherActive.map(prog => (
                  <ProgramCard
                    key={prog.programId}
                    prog={prog}
                    enrollingId={enrollingId}
                    onTask={createTask}
                    onEnrolled={markEnrolled}
                    onDismiss={dismissProgram}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Dismissed */}
          {dismissed.length > 0 && (
            <details className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <summary className="px-4 py-3 text-sm text-gray-500 cursor-pointer select-none">
                Dismissed / Enrolled ({dismissed.length})
              </summary>
              <div className="px-4 pb-4 space-y-2">
                {dismissed.map(prog => (
                  <div key={prog.programId} className="flex items-center justify-between py-2 border-t border-gray-100">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{prog.programName}</p>
                      <p className="text-xs text-gray-400">{prog.tierName}</p>
                    </div>
                    <button
                      onClick={() => setDismissedIds(prev => {
                        const next = new Set(prev); next.delete(prog.programId); return next
                      })}
                      className="text-xs text-[#1a5c38] hover:underline"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </main>

        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      </div>
    )
  }

  // ── Question flow ─────────────────────────────────────────────────────────

  const progress = Math.round(((subStep + 1) / totalVisible) * 100)

  return (
    <div className="min-h-screen bg-[#f7f3ed] flex flex-col">
      <header className="bg-[#1a5c38] text-white px-4 pb-3 pt-4">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => navigate(-1)}
            className="text-white/80 hover:text-white text-sm py-1 pr-3"
          >
            ← Back
          </button>
          <h1 className="font-bold text-base">Benefits Screener</h1>
          <span className="text-white/60 text-sm">{subStep + 1}/{totalVisible}</span>
        </div>
        <p className="text-white/70 text-xs text-center">{clientName}</p>
        <div className="mt-3 w-full bg-white/20 rounded-full h-1.5">
          <div
            className="bg-white h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-10 space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-800 font-medium">
            🔊 Read each question aloud — client answers, Navigator selects.
          </p>
        </div>

        {/* Draft resume banner */}
        {Object.keys(answers).length > 0 && subStep === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
            <p className="text-sm text-blue-800">Draft restored from previous session.</p>
            <button
              onClick={() => {
                setAnswers({})
                if (clientId) localStorage.removeItem(DRAFT_KEY(clientId))
              }}
              className="text-xs text-blue-700 font-medium underline"
            >
              Start fresh
            </button>
          </div>
        )}

        {currentQ && (
          <div className="space-y-4">
            {/* Section label */}
            <p className="text-xs font-semibold text-[#1a5c38] uppercase tracking-wide">
              {currentQ.section}
            </p>

            {/* Question text */}
            <p className="text-lg font-semibold text-gray-900 leading-snug">
              {currentQ.text(clientName)}
            </p>

            {/* Navigator note */}
            {currentQ.note && (
              <p className="text-xs text-gray-500 italic">{currentQ.note}</p>
            )}

            {/* Options */}
            {currentQ.type === 'single' ? (
              <div className="space-y-3">
                {currentQ.options.map(opt => {
                  const selected = answers[currentQ.id] === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSingleAnswer(currentQ.id, opt.value)}
                      className={`w-full text-left rounded-xl px-5 py-4 text-base font-medium min-h-[56px]
                        border transition-colors flex items-center gap-3
                        ${selected
                          ? 'bg-[#1a5c38] text-white border-[#1a5c38]'
                          : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50 active:bg-gray-100'
                        }`}
                    >
                      <span className="text-xl">{selected ? '✅' : '⬜'}</span>
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            ) : (
              // Multi-select
              <div className="space-y-3">
                {currentQ.options.map(opt => {
                  const selected = ((answers[currentQ.id] as string[] | undefined) ?? []).includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleMultiAnswer(currentQ.id, opt.value)}
                      className={`w-full text-left rounded-xl px-5 py-4 text-base font-medium min-h-[56px]
                        border transition-colors flex items-center gap-3
                        ${selected
                          ? 'bg-[#1a5c38] text-white border-[#1a5c38]'
                          : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50 active:bg-gray-100'
                        }`}
                    >
                      <span className="text-xl">{selected ? '☑️' : '⬜'}</span>
                      {opt.label}
                    </button>
                  )
                })}
                {/* Continue button for multi-select */}
                {((answers[currentQ.id] as string[] | undefined) ?? []).length > 0 && (
                  <button
                    type="button"
                    onClick={proceedFromMulti}
                    className="w-full bg-[#1a5c38] text-white rounded-xl py-3 text-sm font-medium mt-2"
                  >
                    Continue →
                  </button>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-2 pt-2">
              {subStep > 0 && (
                <button
                  type="button"
                  onClick={() => setSubStep(s => s - 1)}
                  className="text-sm text-[#1a5c38] font-medium hover:underline"
                >
                  ← Previous
                </button>
              )}
            </div>
          </div>
        )}

        {/* Final CTA when all answered */}
        {allAnswered && !showResults && (
          <div className="bg-white rounded-xl border border-[#1a5c38] p-4 text-center space-y-3">
            <p className="font-semibold text-gray-900">All {totalVisible} questions answered.</p>
            <button
              onClick={computeResults}
              className="w-full bg-[#1a5c38] text-white text-base font-semibold py-3 rounded-xl
                         hover:bg-[#2d7a50] transition-colors"
            >
              See Benefits Results →
            </button>
          </div>
        )}
      </main>

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

// ── Program Card component ────────────────────────────────────────────────────

interface ProgramCardProps {
  prog:        EligibilityResult
  enrollingId: string | null
  onTask:      (prog: EligibilityResult) => void
  onEnrolled:  (prog: EligibilityResult) => void
  onDismiss:   (id: string) => void
}

function ProgramCard({ prog, enrollingId, onTask, onEnrolled, onDismiss }: ProgramCardProps) {
  const cfg = STATUS_CONFIG[prog.status]
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 leading-tight">{prog.programName}</p>
          <p className="text-xs text-gray-400 mt-0.5">{prog.tierName}</p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>

      {prog.estimatedAnnualValue > 0 && (
        <p className="text-base font-bold text-[#1a5c38]">
          {fmtDollar(prog.estimatedAnnualValue)}/year
          {prog.estimatedMonthlyValue > 0 && (
            <span className="text-sm font-normal text-gray-500 ml-1">
              ({fmtDollar(prog.estimatedMonthlyValue)}/mo)
            </span>
          )}
        </p>
      )}

      {prog.notes && (
        <p className="text-xs text-gray-600 leading-relaxed">{prog.notes}</p>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onTask(prog)}
          disabled={enrollingId === prog.programId}
          className="flex-1 min-w-[100px] bg-[#1a5c38] text-white text-sm font-medium py-2 rounded-lg
                     hover:bg-[#2d7a50] disabled:opacity-50 transition-colors"
        >
          {enrollingId === prog.programId ? 'Creating…' : prog.actionLabel}
        </button>
        <button
          onClick={() => onEnrolled(prog)}
          disabled={enrollingId === `enrolled_${prog.programId}`}
          className="border border-gray-200 text-gray-700 text-sm font-medium py-2 px-3 rounded-lg
                     hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {enrollingId === `enrolled_${prog.programId}` ? '…' : 'Enrolled ✓'}
        </button>
        <button
          onClick={() => onDismiss(prog.programId)}
          className="text-gray-400 text-sm px-2 py-2 rounded-lg hover:text-gray-600"
          title="Not applicable"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
