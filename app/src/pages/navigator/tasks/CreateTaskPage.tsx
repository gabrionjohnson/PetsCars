import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../hooks/useAuth'
import { TASK_CATEGORIES } from '../../../hooks/useTasks'

interface ClientOption {
  id:   string
  name: string
}

const TITLE_SUGGESTIONS: Record<string, string[]> = {
  government_benefits: ['Medicaid Enrollment', 'SNAP Application', 'SSI Application', 'Social Security Screening'],
  medicare_insurance:  ['Medicare Enrollment (Part A/B)', 'Medicare Part D Enrollment', 'Extra Help Application'],
  utility_broadband:   ['LIHEAP Application', 'Lifeline Phone Enrollment', 'ACP Internet Enrollment'],
  va_benefits:         ['VA Benefits Screening', 'VA Healthcare Enrollment', 'VA Pension Application'],
  housing_assistance:  ['Section 8 Application', 'HUD Housing Counseling', 'Rental Assistance Application'],
  tech_help:           ['Email Setup', 'Telehealth Portal Setup', 'Prescription Portal Setup'],
}

// Deduplicate TASK_CATEGORIES for the visual grid (some values repeat)
const CATEGORY_GRID = TASK_CATEGORIES

const labelCls  = 'block text-sm font-semibold text-gray-700 mb-1'
const inputCls  = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#1a5c38] focus:border-transparent bg-white'

export function CreateTaskPage() {
  const navigate  = useNavigate()
  const { user }  = useAuth()

  const [clients,    setClients]    = useState<ClientOption[]>([])
  const [clientId,   setClientId]   = useState('')
  const [category,   setCategory]   = useState('')
  const [title,      setTitle]      = useState('')
  const [priority,   setPriority]   = useState<'normal' | 'urgent'>('normal')
  const [dueDate,    setDueDate]    = useState('')
  const [notes,      setNotes]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('clients')
      .select('id,name')
      .order('name')
      .then(({ data }) => {
        if (data) setClients(data)
      })
  }, [])

  function handleCategorySelect(value: string) {
    setCategory(value)
    setTitle('')
  }

  function handleSuggestionClick(suggestion: string) {
    setTitle(suggestion)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId)  { setError('Please select a client.'); return }
    if (!category)  { setError('Please choose a category.'); return }
    if (!title.trim()) { setError('Please enter a task title.'); return }

    setSubmitting(true)
    setError(null)

    const payload: Record<string, unknown> = {
      client_id:    clientId,
      navigator_id: user?.id,
      category,
      title:        title.trim(),
      status:       'pending',
      steps:        [],
      notes:        notes.trim() || null,
      documents:    [],
    }
    if (dueDate) payload.due_date = dueDate

    const { data, error: err } = await supabase
      .from('tasks')
      .insert(payload)
      .select('id')
      .single()

    if (err) {
      setError(err.message)
      setSubmitting(false)
      return
    }

    navigate(`/nav/tasks/${data.id}`)
  }

  const suggestions = category ? (TITLE_SUGGESTIONS[category] ?? []) : []

  return (
    <div className="min-h-screen bg-[#f7f3ed]">
      {/* Header */}
      <div className="bg-[#1a5c38] text-white px-4 pt-5 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-white/80 hover:text-white text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center"
          aria-label="Go back"
        >
          ←
        </button>
        <h1 className="text-xl font-bold">New Task</h1>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-5 space-y-6 pb-24">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Client */}
        <div>
          <label className={labelCls}>Client *</label>
          <select
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            className={inputCls}
            required
          >
            <option value="">Select a client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Category grid */}
        <div>
          <label className={labelCls}>Category *</label>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_GRID.map((cat, i) => (
              <button
                key={`${cat.value}-${i}`}
                type="button"
                onClick={() => handleCategorySelect(cat.value)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors min-h-[56px]
                  ${category === cat.value
                    ? 'border-[#1a5c38] bg-[#1a5c38]/5'
                    : 'border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <span className="text-2xl leading-none">{cat.emoji}</span>
                <span className={`text-sm font-medium leading-tight ${category === cat.value ? 'text-[#1a5c38]' : 'text-gray-700'}`}>
                  {cat.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className={labelCls}>Task Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Describe the task…"
            className={inputCls}
            required
          />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSuggestionClick(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#1a5c38] text-[#1a5c38]
                             hover:bg-[#1a5c38] hover:text-white transition-colors min-h-[32px]"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Priority */}
        <div>
          <label className={labelCls}>Priority</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPriority('normal')}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors min-h-[48px]
                ${priority === 'normal'
                  ? 'border-[#1a5c38] bg-[#1a5c38] text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setPriority('urgent')}
              className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-colors min-h-[48px]
                ${priority === 'urgent'
                  ? 'border-amber-500 bg-amber-500 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}
            >
              Urgent
              {priority === 'urgent' && (
                <span className="ml-2 inline-block bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">!</span>
              )}
            </button>
          </div>
        </div>

        {/* Due date */}
        <div>
          <label className={labelCls}>Due Date <span className="font-normal text-gray-400">(optional)</span></label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>Notes <span className="font-normal text-gray-400">(optional)</span></label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any background context or initial notes…"
            rows={4}
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-[#1a5c38] text-white font-semibold py-4 rounded-xl text-base
                     hover:bg-[#2d7a50] active:bg-[#0f3d25] disabled:opacity-50 transition-colors min-h-[56px]"
        >
          {submitting ? 'Creating…' : 'Create Task'}
        </button>
      </form>
    </div>
  )
}
