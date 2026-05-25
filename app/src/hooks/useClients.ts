import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface Client {
  id:                  string
  name:                string
  phone:               string
  dob:                 string | null
  address:             string | null
  zip:                 string | null
  county:              string | null
  medicaid_id:         string | null
  va_status:           boolean
  insurance_info:      Record<string, string> | null
  income_level:        string | null
  navigator_id:        string | null
  family_proxy_id:     string | null
  subscription_tier:   string | null
  subscription_status: string
  created_at:          string
}

export function useClients() {
  const [clients,  setClients]  = useState<Client[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('name')
    if (error) setError(error.message)
    else setClients(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { clients, loading, error, refetch: fetch }
}

export function useClient(id: string) {
  const [client,  setClient]  = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .single()
    if (error) setError(error.message)
    else setClient(data)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  return { client, loading, error, refetch: fetch }
}
