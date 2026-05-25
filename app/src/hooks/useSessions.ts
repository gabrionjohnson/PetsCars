import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface Session {
  id:                string
  client_id:         string
  navigator_id:      string
  date:              string
  duration_minutes:  number | null
  tasks_completed:   string[]
  notes:             string | null
  documents_uploaded: string[]
  sms_summary_sent:  boolean
  created_at:        string
}

export function useSessions(clientId?: string) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('sessions').select('*').order('date', { ascending: false })
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) setError(error.message)
    else setSessions(data ?? [])
    setLoading(false)
  }, [clientId])

  useEffect(() => { fetch() }, [fetch])

  return { sessions, loading, error, refetch: fetch }
}
