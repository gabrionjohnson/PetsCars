import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { DOC_TYPE_LABELS } from '../../hooks/useDocuments'
import { getPreviewUrl } from '../../lib/storage'
import { Toast } from '../../components/ui/Toast'

interface DocumentRow {
  id:            string
  document_type: string
  file_name:     string
  storage_path:  string
  created_at:    string
  navigators: { name: string } | null
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const TYPE_EMOJI: Record<string, string> = {
  ssn_card:          '🔒',
  medicare_card:     '🏥',
  birth_certificate: '📜',
  dd214:             '🎖️',
  insurance_card:    '💳',
  pay_stub:          '💵',
  lease_agreement:   '🏠',
  prescription_list: '💊',
  other:             '📄',
}

export function FamilyDocumentsPage() {
  const { user } = useAuth()
  const [docs,    setDocs]    = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast,   setToast]   = useState<string | null>(null)
  const [opening, setOpening] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)

    // Resolve which client this proxy is linked to
    const { data: fp } = await supabase
      .from('family_proxies')
      .select('client_id')
      .eq('id', user.id)
      .single()

    if (!fp) { setLoading(false); return }

    const { data } = await supabase
      .from('documents')
      .select('id, document_type, file_name, storage_path, created_at, navigators(name)')
      .eq('client_id', fp.client_id)
      .order('created_at', { ascending: false })

    setDocs((data ?? []) as unknown as DocumentRow[])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  async function openDocument(doc: DocumentRow) {
    setOpening(doc.id)
    try {
      const url = await getPreviewUrl(doc.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setToast('Could not open document. Please try again.')
    }
    setOpening(null)
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Your Documents</h2>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
        <p className="text-sm text-blue-800">
          These documents are stored securely by your Navigator. Links expire after 60 minutes for privacy.
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-base font-medium text-gray-600">No documents uploaded yet.</p>
          <p className="text-sm mt-1">Your Navigator will add documents during their next visit.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {docs.map(doc => (
            <li key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="text-2xl mt-0.5 shrink-0">
                    {TYPE_EMOJI[doc.document_type] ?? '📄'}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Uploaded {fmtDate(doc.created_at)}
                    </p>
                    {doc.navigators?.name && (
                      <p className="text-xs text-gray-400">by {doc.navigators.name}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => openDocument(doc)}
                  disabled={opening === doc.id}
                  className="shrink-0 text-sm font-medium text-[#1a5c38] border border-[#1a5c38] rounded-lg px-3 py-1.5 disabled:opacity-50"
                >
                  {opening === doc.id ? 'Opening…' : 'View'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
