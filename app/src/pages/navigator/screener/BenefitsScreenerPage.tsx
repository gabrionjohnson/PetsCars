import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  SCREENER_QUESTIONS,
  scoreScreener,
  getAgeFromDob,
  INCOME_RANGES,
  type ScreenerAnswers,
  type IncomeRange,
  type RecommendedProgram,
} from '../../../lib/benefitsScreener'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Toast } from '../../../components/ui/Toast'

type TaskCategory = string

interface ClientRow {
  id:         string
  name:       string
  dob:        string | null
  income_level: string | null
  navigator_id: string | null
}

function dbLevelToIncomeRange(level: string | null): IncomeRange {
  const map: Record<string, IncomeRange> = {
    very_low:       'under_500',
    low:            '500_1000',
    moderate:       '1500_2000',
    above_moderate: 'over_2000',
  }
  return (level && map[level]) ? map[level] : 'under_500'
}

function priorityColor(p: 1 | 2 | 3): 'red' | 'amber' | 'blue' {
  if (p === 1) return 'red'
  if (p === 2) return 'amber'
  return 'blue'
}

function priorityLabel(p: 1 | 2 | 3): string {
  if (p === 1) return 'High Priority'
  if (p === 2) return 'Medium Priority'
  return 'Low Priority'
}

const TOTAL_Q = SCREENER_QUESTIONS.length

export function BenefitsScreenerPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate      = useNavigate()

  const [client,       setClient]       = useState<ClientRow | null>(null)
  const [loadingClient, setLoadingClient] = useState(true)
  const [clientError,  setClientError]  = useState<string | null>(null)

  // Income range override (shown only if client income is unknown)
  const [incomeOverride, setIncomeOverride] = useState<IncomeRange | null>(null)

  // Screener state
  const [subStep,   setSubStep]   = useState(0)
  const [answers,   setAnswers]   = useState<Partial<ScreenerAnswers>>({})
  const [results,   setResults]   = useState<RecommendedProgram[]>([])
  const allAnswered = Object.keys(answers).length >= TOTAL_Q

  // Save / task state
  const [saving,     setSaving]   = useState(false)
  const [toast,      setToast]    = useState<string | null>(null)
  const [creatingTask, setCreatingTask] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return
    supabase
      .from('clients')
      .select('id,name,dob,income_level,navigator_id')
      .eq('id', clientId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) setClientError(error?.message ?? 'Client not found')
        else setClient(data as ClientRow)
        setLoadingClient(false)
      })
  }, [clientId])

  const clientName  = client?.name ?? 'the client'
  const clientIncome: IncomeRange = incomeOverride ?? dbLevelToIncomeRange(client?.income_level ?? null)
  const clientAge   = client?.dob ? getAgeFromDob(client.dob) : 65

  function handleAnswer(questionId: keyof ScreenerAnswers, value: string) {
    const updated = { ...answers, [questionId]: value } as Partial<ScreenerAnswers>
    setAnswers(updated)

    const done = Object.keys(updated).length >= TOTAL_Q
    if (done) {
      const scored = scoreScreener(updated as ScreenerAnswers, clientAge, clientIncome)
      setResults(scored)
    }

    if (subStep < TOTAL_Q - 1) setSubStep(s => s + 1)
  }

  async function saveScreening() {
    if (!clientId || !client) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('benefits_screenings').insert({
        client_id:            clientId,
        navigator_id:         user?.id ?? client.navigator_id,
        answers:              answers,
        recommended_programs: results,
        income_range:         clientIncome,
      })
      if (error) throw new Error(error.message)
      setToast('Screening saved successfully.')
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to save screening.')
    } finally {
      setSaving(false)
    }
  }

  async function createTask(prog: RecommendedProgram) {
    if (!clientId || !client) return
    setCreatingTask(prog.id)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('tasks').insert({
        client_id:    clientId,
        navigator_id: user?.id ?? client.navigator_id,
        title:        `Enroll in ${prog.name}`,
        category:     prog.taskCategory as TaskCategory,
        status:       'pending',
        priority:     prog.priority === 1 ? 'high' : prog.priority === 2 ? 'medium' : 'low',
        notes:        prog.description,
      })
      if (error) throw new Error(error.message)
      setToast(`Task created: Enroll in ${prog.name}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to create task.')
    } finally {
      setCreatingTask(null)
    }
  }

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
          <Button variant="secondary" onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    )
  }

  const currentQ = SCREENER_QUESTIONS[subStep]

  return (
    <div className="min-h-screen bg-[#f7f3ed] flex flex-col">
      {/* Header */}
      <header className="bg-[#1a5c38] text-white px-4 pb-3 pt-4">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => navigate(-1)}
            className="text-white/80 hover:text-white text-sm font-medium py-1 pr-3"
          >
            ← Back
          </button>
          <h1 className="font-bold text-base">Benefits Screener</h1>
          <span className="text-white/60 text-sm">{subStep + 1}/{TOTAL_Q}</span>
        </div>
        <p className="text-white/70 text-xs text-center">{clientName}</p>
        <div className="mt-3 w-full bg-white/20 rounded-full h-1.5">
          <div
            className="bg-white h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.round(((subStep + 1) / TOTAL_Q) * 100)}%` }}
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 pb-10 space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-sm text-amber-800 font-medium">
            🔊 Navigator reads each question aloud to the client.
          </p>
        </div>

        {/* Income override if not set on client */}
        {!client?.income_level && !incomeOverride && !allAnswered && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            <p className="text-sm font-semibold text-gray-700">
              Monthly Income (for eligibility calculation)
            </p>
            <div className="space-y-2">
              {INCOME_RANGES.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setIncomeOverride(opt.value)}
                  className="w-full text-left rounded-xl border border-gray-200 px-4 py-3 text-sm
                             hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Question flow */}
        {!allAnswered && currentQ && (
          <div className="space-y-4">
            <p className="text-lg font-semibold text-gray-900 leading-snug">
              {currentQ.text(clientName)}
            </p>
            <div className="space-y-3">
              {currentQ.options.map(opt => {
                const selected = answers[currentQ.id] === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleAnswer(currentQ.id as keyof ScreenerAnswers, opt.value)}
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

            <div className="flex gap-2 pt-2">
              {subStep > 0 && (
                <button
                  type="button"
                  onClick={() => setSubStep(s => s - 1)}
                  className="text-sm text-[#1a5c38] font-medium hover:underline"
                >
                  ← Previous question
                </button>
              )}
              {answers[currentQ.id] && subStep < TOTAL_Q - 1 && (
                <button
                  type="button"
                  onClick={() => setSubStep(s => s + 1)}
                  className="text-sm text-[#1a5c38] font-medium hover:underline ml-auto"
                >
                  Next question →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {allAnswered && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">
                🎯 {results.length} program{results.length !== 1 ? 's' : ''} recommended
              </p>
              <button
                type="button"
                onClick={() => { setAnswers({}); setResults([]); setSubStep(0) }}
                className="text-xs text-[#1a5c38] font-medium hover:underline"
              >
                Re-screen
              </button>
            </div>

            <Button fullWidth loading={saving} onClick={saveScreening} variant="secondary">
              💾 Save Screening Results
            </Button>

            <div className="space-y-3">
              {results.map(prog => (
                <div
                  key={prog.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900">{prog.name}</p>
                    <Badge color={priorityColor(prog.priority)}>
                      {priorityLabel(prog.priority)}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600">{prog.description}</p>
                  <p className="text-sm text-[#1a5c38] font-medium">
                    💰 {prog.estimatedBenefit}
                  </p>
                  <Button
                    variant="ghost"
                    onClick={() => createTask(prog)}
                    loading={creatingTask === prog.id}
                    className="text-sm py-2 px-3 min-h-[40px] border border-[#1a5c38]/30"
                  >
                    + Create Task
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {toast && (
        <Toast message={toast} onDismiss={() => setToast(null)} />
      )}
    </div>
  )
}
