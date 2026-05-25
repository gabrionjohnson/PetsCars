import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { enqueueInsert } from '../../../lib/db'
import { sendSms } from '../../../lib/smsClient'
import { useOffline } from '../../../hooks/useOffline'
import { useAuth } from '../../../hooks/useAuth'
import type { Task } from '../../../hooks/useTasks'

interface FamilyProxyRow {
  profiles: { phone: string | null; name: string | null } | null
}

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function formatTaskLabel(task: Task): string {
  return task.title
}

export function LogSessionPage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isOffline } = useOffline()

  const [clientName,  setClientName]  = useState<string>('')
  const [date,        setDate]        = useState(todayString())
  const [duration,    setDuration]    = useState<string>('30')
  const [notes,       setNotes]       = useState('')
  const [openTasks,   setOpenTasks]   = useState<Task[]>([])
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const [submitting,  setSubmitting]  = useState(false)
  const [toast,       setToast]       = useState<string | null>(null)

  function showToast(msg: string, ms = 3500) {
    setToast(msg)
    setTimeout(() => setToast(null), ms)
  }

  useEffect(() => {
    if (!clientId) return

    // Fetch client name
    supabase
      .from('clients')
      .select('name')
      .eq('id', clientId)
      .single()
      .then(({ data }) => { if (data) setClientName(data.name) })

    // Fetch open tasks
    supabase
      .from('tasks')
      .select('*')
      .eq('client_id', clientId)
      .neq('status', 'completed')
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setOpenTasks(data as Task[]) })
  }, [clientId])

  function toggleTask(taskId: string) {
    setSelectedTasks(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) return

    setSubmitting(true)

    const durationMinutes = parseInt(duration, 10) || 0
    const taskTitles = openTasks
      .filter(t => selectedTasks.includes(t.id))
      .map(t => t.title)

    const payload: Record<string, unknown> = {
      client_id:        clientId,
      navigator_id:     user?.id,
      date,
      duration_minutes: durationMinutes,
      tasks_completed:  taskTitles,
      notes:            notes.trim() || null,
      documents_uploaded: [],
      sms_summary_sent: false,
    }

    if (isOffline || !navigator.onLine) {
      await enqueueInsert('sessions', payload)
      setSubmitting(false)
      showToast('Session saved offline — will sync when connected')
      setTimeout(() => navigate(-1), 2000)
      return
    }

    try {
      const { error } = await supabase.from('sessions').insert(payload)
      if (error) throw error

      // Notify family proxy
      try {
        const { data: proxyData } = await supabase
          .from('family_proxies')
          .select('profiles(phone, name)')
          .eq('client_id', clientId)
          .maybeSingle()

        const proxy = proxyData as FamilyProxyRow | null
        const proxyPhone = proxy?.profiles?.phone
        const proxyName  = proxy?.profiles?.name ?? 'Family Contact'

        if (proxyPhone) {
          await sendSms({
            type:            'SESSION_SAVED',
            to:              proxyPhone,
            proxyName:       proxyName,
            clientName:      clientName,
            navigatorName:   user?.email ?? 'Your Navigator',
            durationMinutes: durationMinutes,
            taskList:        taskTitles.join(', ') || 'None',
            nextSteps:       '',
          })
        }
      } catch {
        // Non-fatal
      }

      setSubmitting(false)
      showToast('Session saved.')
      setTimeout(() => navigate(-1), 1500)
    } catch (err) {
      setSubmitting(false)
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1'
  const inputCls = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent bg-white'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 pt-5 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="text-white/80 hover:text-white text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center"
        >
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold">Log Session</h1>
          {clientName && <p className="text-green-100 text-sm">{clientName}</p>}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-5 space-y-6 pb-24">
        {/* Date */}
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className={inputCls}
            required
          />
        </div>

        {/* Duration */}
        <div>
          <label className={labelCls}>Duration (minutes)</label>
          <input
            type="number"
            min="1"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            className={inputCls}
            required
          />
        </div>

        {/* Tasks */}
        {openTasks.length > 0 && (
          <div>
            <label className={labelCls}>Tasks Worked On</label>
            <div className="space-y-2">
              {openTasks.map(task => (
                <label
                  key={task.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors min-h-[48px]
                    ${selectedTasks.includes(task.id)
                      ? 'border-green-700 bg-green-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTasks.includes(task.id)}
                    onChange={() => toggleTask(task.id)}
                    className="w-5 h-5 rounded accent-green-700"
                  />
                  <span className="text-sm font-medium text-gray-800">{formatTaskLabel(task)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className={labelCls}>Session Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="What was accomplished? Any follow-up needed?"
            rows={6}
            className={`${inputCls} resize-none`}
          />
          {(isOffline || !navigator.onLine) && (
            <p className="text-xs text-amber-700 mt-1">Offline — note will sync when connected</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-green-700 text-white font-semibold py-4 rounded-xl text-base
                     hover:bg-green-800 active:bg-green-900 disabled:opacity-50 transition-colors min-h-[56px]"
        >
          {submitting ? 'Saving…' : 'Save Session'}
        </button>
      </form>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-4 right-4 bg-gray-900 text-white text-sm rounded-xl px-4 py-3 shadow-lg z-50 text-center">
          {toast}
        </div>
      )}
    </div>
  )
}
