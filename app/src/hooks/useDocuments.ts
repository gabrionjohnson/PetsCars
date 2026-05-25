import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface Document {
  id:            string
  client_id:     string
  document_type: string
  file_url:      string
  file_name:     string | null
  file_size_kb:  number | null
  uploaded_by:   string | null
  share_token:   string | null
  share_expires: string | null
  created_at:    string
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  ssn_card:          'Social Security Card',
  medicare_card:     'Medicare Card',
  birth_certificate: 'Birth Certificate',
  dd214:             'DD-214 (Military)',
  insurance_card:    'Insurance Card',
  pay_stub:          'Pay Stub',
  lease_agreement:   'Lease Agreement',
  prescription_list: 'Prescription List',
  other:             'Other Document',
}

export const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPE_LABELS).map(([value, label]) => ({ value, label }))

export function useDocuments(clientId: string) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setDocuments(data ?? [])
    setLoading(false)
  }, [clientId])

  useEffect(() => { fetch() }, [fetch])

  return { documents, loading, error, refetch: fetch }
}
