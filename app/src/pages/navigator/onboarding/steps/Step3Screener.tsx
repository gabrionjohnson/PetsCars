import { useState } from 'react'
import {
  SCREENER_QUESTIONS,
  runAllPrograms,
  type ScreenerAnswers,
  type EligibilityResult,
} from '../../../../lib/benefitsScreener'
import { Badge } from '../../../../components/ui/Badge'
import type { OnboardingDraft } from '../OnboardingWizard'

interface Props {
  draft: OnboardingDraft
  onChange: (partial: Partial<OnboardingDraft>) => void
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

export function Step3Screener({ draft, onChange }: Props) {
  const clientName = draft.firstName || 'the client'
  const [subStep, setSubStep] = useState(0)

  const answers = draft.screenerAnswers

  // Filter to questions whose conditional passes given current answers
  const visibleQuestions = SCREENER_QUESTIONS.filter(
    q => !q.conditional || q.conditional(answers)
  )
  const totalQ = visibleQuestions.length

  const allAnswered = visibleQuestions.every(q => {
    const val = answers[q.id]
    if (val === undefined || val === null) return false
    if (Array.isArray(val)) return val.length > 0
    return true
  })

  function handleAnswer(questionId: keyof ScreenerAnswers, value: string, isMulti: boolean) {
    let updated: Partial<ScreenerAnswers>

    if (isMulti) {
      const current = (answers[questionId] as string[] | undefined) ?? []
      const toggled = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value]
      updated = { ...answers, [questionId]: toggled }
    } else {
      updated = { ...answers, [questionId]: value }
    }

    const newVisible = SCREENER_QUESTIONS.filter(
      q => !q.conditional || q.conditional(updated)
    )
    const newAllDone = newVisible.every(q => {
      const val = (updated as Record<string, unknown>)[q.id as string]
      if (val === undefined || val === null) return false
      if (Array.isArray(val)) return val.length > 0
      return true
    })

    const results: EligibilityResult[] = newAllDone
      ? runAllPrograms(updated as ScreenerAnswers)
      : draft.screenerResults

    onChange({ screenerAnswers: updated, screenerResults: results })

    if (!isMulti && subStep < totalQ - 1) {
      setSubStep(s => s + 1)
    }
  }

  const currentQ = visibleQuestions[subStep]

  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
        <p className="text-sm text-amber-800 font-medium">
          🔊 Navigator reads each question aloud to the client.
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-1">
          <div
            className="bg-[#1a5c38] h-1 rounded-full transition-all duration-300"
            style={{ width: `${Math.round(((subStep + 1) / totalQ) * 100)}%` }}
          />
        </div>
        <span className="text-xs text-gray-500 shrink-0">
          {subStep + 1} of {totalQ}
        </span>
      </div>

      {!allAnswered && currentQ && (
        <div className="space-y-4">
          <p className="text-lg font-semibold text-gray-900 leading-snug">
            {currentQ.text(clientName)}
          </p>
          {currentQ.note && (
            <p className="text-sm text-gray-500 italic">{currentQ.note}</p>
          )}
          {currentQ.type === 'multi_select' && (
            <p className="text-xs text-gray-400">Select all that apply</p>
          )}
          <div className="space-y-3">
            {currentQ.options.map(opt => {
              const isMulti = currentQ.type === 'multi_select'
              const current = answers[currentQ.id]
              const selected = isMulti
                ? ((current as string[] | undefined) ?? []).includes(opt.value)
                : current === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleAnswer(currentQ.id as keyof ScreenerAnswers, opt.value, isMulti)}
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
            {currentQ.type === 'multi_select' && subStep < totalQ - 1 && (
              <button
                type="button"
                onClick={() => setSubStep(s => s + 1)}
                className="text-sm text-[#1a5c38] font-medium hover:underline ml-auto"
              >
                Next question →
              </button>
            )}
            {currentQ.type === 'single' && answers[currentQ.id] && subStep < totalQ - 1 && (
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
              🎯 {draft.screenerResults.length} program{draft.screenerResults.length !== 1 ? 's' : ''} recommended
            </p>
            <button
              type="button"
              onClick={() => setSubStep(0)}
              className="text-xs text-[#1a5c38] font-medium hover:underline"
            >
              Re-screen
            </button>
          </div>
          <div className="space-y-3">
            {draft.screenerResults.map(prog => (
              <div
                key={prog.programId}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-gray-900">{prog.programName}</p>
                  <Badge color={priorityColor(prog.priority)}>
                    {priorityLabel(prog.priority)}
                  </Badge>
                </div>
                {prog.notes && <p className="text-sm text-gray-600">{prog.notes}</p>}
                {prog.estimatedAnnualValue > 0 && (
                  <p className="text-sm text-[#1a5c38] font-medium">
                    💰 Up to ${prog.estimatedAnnualValue.toLocaleString()}/year
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
