import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useEffect } from 'react'
import {
  CATEGORY_EMOJI,
  STATUS_CONFIG,
  type Task,
} from '../../../hooks/useTasks'

interface TaskWithClient extends Task {
  clients: { name: string } | null
}

type FilterTab = 'all' | 'in_progress' | 'needs_attention' | 'completed'

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all',             label: 'All' },
  { id: 'in_progress',     label: 'In Progress' },
  { id: 'needs_attention', label: 'Needs Attention' },
  { id: 'completed',       label: 'Completed' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function TaskListPage() {
  const navigate = useNavigate()
  const [tasks,   setTasks]   = useState<TaskWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  useEffect(() => {
    supabase
      .from('tasks')
      .select('*, clients(name)')
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setTasks(data as TaskWithClient[])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    switch (activeTab) {
      case 'in_progress':     return tasks.filter(t => t.status === 'in_progress')
      case 'needs_attention': return tasks.filter(t => t.status === 'on_hold')
      case 'completed':       return tasks.filter(t => t.status === 'completed')
      default:                return tasks
    }
  }, [tasks, activeTab])

  // Group by client name
  const grouped = useMemo(() => {
    const map = new Map<string, TaskWithClient[]>()
    for (const task of filtered) {
      const name = task.clients?.name ?? 'Unknown Client'
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push(task)
    }
    return map
  }, [filtered])

  return (
    <div className="min-h-screen bg-[#f7f3ed] pb-24">
      {/* Header */}
      <div className="bg-[#1a5c38] text-white px-4 pt-5 pb-4">
        <h1 className="text-xl font-bold">Tasks</h1>
      </div>

      {/* Filter tabs */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex gap-2 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors min-h-[36px]
              ${activeTab === tab.id
                ? 'bg-[#1a5c38] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-6">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-xl animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-base font-medium">No tasks yet.</p>
            <p className="text-sm mt-1">Tap + to create your first task.</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([clientName, clientTasks]) => (
            <div key={clientName}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                {clientName}
              </h2>
              <ul className="space-y-2">
                {clientTasks.map(task => {
                  const statusCfg = STATUS_CONFIG[task.status]
                  const emoji     = CATEGORY_EMOJI[task.category] ?? '📋'
                  return (
                    <li key={task.id}>
                      <button
                        onClick={() => navigate(`/nav/tasks/${task.id}`)}
                        className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 shadow-sm
                                   hover:border-[#1a5c38] active:bg-gray-50 transition-colors min-h-[64px]"
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-2xl leading-none mt-0.5">{emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-gray-900 text-sm leading-snug">{task.title}</p>
                              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.color}`}>
                                {statusCfg.label}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {clientName} · Updated {formatDate(task.updated_at)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => navigate('/nav/tasks/new')}
        className="fixed bottom-24 right-4 bg-[#1a5c38] text-white rounded-full shadow-lg
                   w-14 h-14 flex items-center justify-center text-2xl font-light
                   hover:bg-[#2d7a50] active:bg-[#0f3d25] transition-colors z-10"
        aria-label="New Task"
      >
        ＋
      </button>
    </div>
  )
}
