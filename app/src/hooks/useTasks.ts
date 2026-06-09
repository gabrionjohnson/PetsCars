import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface TaskStep {
  id:        string
  content:   string
  timestamp: string
}

export interface Task {
  id:          string
  client_id:   string
  navigator_id: string
  category:    string
  title:       string
  status:      'pending' | 'in_progress' | 'completed' | 'on_hold' | 'canceled'
  priority:    'high' | 'medium' | 'low' | null
  due_date:    string | null
  steps:       TaskStep[]
  notes:       string | null
  documents:   string[]
  completed_at: string | null
  created_at:  string
  updated_at:  string
}

export const TASK_CATEGORIES: { value: string; label: string; emoji: string }[] = [
  { value: 'government_benefits', label: 'Medicaid / Healthcare',    emoji: '🏥' },
  { value: 'medicare_insurance',  label: 'Medicare / Part D',        emoji: '💊' },
  { value: 'government_benefits', label: 'SNAP / Food Assistance',   emoji: '🍎' },
  { value: 'utility_broadband',   label: 'Utility Assistance',       emoji: '⚡' },
  { value: 'va_benefits',         label: 'VA Benefits',              emoji: '🎖️' },
  { value: 'utility_broadband',   label: 'Phone / Internet',         emoji: '📱' },
  { value: 'housing_assistance',  label: 'Housing Assistance',       emoji: '🏠' },
  { value: 'government_benefits', label: 'Social Security / SSI',    emoji: '💰' },
  { value: 'tech_help',           label: 'Tech Help',                emoji: '💻' },
  { value: 'tech_help',           label: 'Other',                    emoji: '📋' },
]

export const CATEGORY_EMOJI: Record<string, string> = {
  government_benefits: '🏥',
  medicare_insurance:  '💊',
  utility_broadband:   '⚡',
  va_benefits:         '🎖️',
  housing_assistance:  '🏠',
  tech_help:           '💻',
}

export const STATUS_CONFIG: Record<Task['status'], { label: string; color: string }> = {
  pending:     { label: 'Pending',          color: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'In Progress',      color: 'bg-blue-100 text-blue-800' },
  completed:   { label: 'Completed',        color: 'bg-green-100 text-green-800' },
  on_hold:     { label: 'Needs Attention',  color: 'bg-amber-100 text-amber-800' },
  canceled:    { label: 'Canceled',         color: 'bg-red-100 text-red-700' },
}

export function useTasks(clientId?: string) {
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('tasks').select('*').order('created_at', { ascending: false })
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) setError(error.message)
    else setTasks((data ?? []) as Task[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { fetch() }, [fetch])

  return { tasks, loading, error, refetch: fetch }
}

export function useTask(taskId: string) {
  const [task,    setTask]    = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()
    if (error) setError(error.message)
    else setTask(data as Task)
    setLoading(false)
  }, [taskId])

  useEffect(() => { fetch() }, [fetch])

  return { task, loading, error, refetch: fetch }
}
