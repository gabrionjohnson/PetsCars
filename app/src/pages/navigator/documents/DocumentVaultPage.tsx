import { useRef, useState } from 'react'
import { useDocuments, DOC_TYPE_LABELS, DOC_TYPE_OPTIONS } from '../../../hooks/useDocuments'
import { uploadDocument, generateShareLink, deleteDocument } from '../../../lib/storage'
import { sendSms } from '../../../lib/smsClient'
import { supabase } from '../../../lib/supabase'
import { useOffline } from '../../../hooks/useOffline'

interface Props {
  clientId: string
  clientName?: string
}

interface FamilyProxy {
  profiles: { phone: string | null } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatSize(kb: number | null): string {
  if (kb === null) return ''
  if (kb < 1024) return `${kb} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function DocumentVaultPage({ clientId, clientName = 'Client' }: Props) {
  const { documents, loading, error, refetch } = useDocuments(clientId)
  const { isOffline } = useOffline()

  const photoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef  = useRef<HTMLInputElement>(null)

  const [pendingDocType, setPendingDocType]   = useState<string>('')
  const [showTypeModal,  setShowTypeModal]    = useState(false)
  const [uploadTarget,   setUploadTarget]     = useState<'photo' | 'file' | null>(null)
  const [uploading,      setUploading]        = useState(false)
  const [toast,          setToast]            = useState<string | null>(null)

  const [shareLink,      setShareLink]        = useState<string | null>(null)
  const [shareDocId,     setShareDocId]       = useState<string | null>(null)
  const [copied,         setCopied]           = useState(false)

  function showToast(msg: string, ms = 3000) {
    setToast(msg)
    setTimeout(() => setToast(null), ms)
  }

  function openTypeModal(target: 'photo' | 'file') {
    setUploadTarget(target)
    setPendingDocType('')
    setShowTypeModal(true)
  }

  function handleTypeChosen() {
    if (!pendingDocType) return
    setShowTypeModal(false)
    if (uploadTarget === 'photo') {
      photoInputRef.current?.click()
    } else {
      fileInputRef.current?.click()
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !pendingDocType) return
    e.target.value = ''

    setUploading(true)
    try {
      const filePath = await uploadDocument(clientId, pendingDocType, file)

      const fileSizeKb = Math.round(file.size / 1024)
      const { error: dbErr } = await supabase.from('documents').insert({
        client_id:     clientId,
        document_type: pendingDocType,
        file_url:      filePath,
        file_name:     file.name,
        file_size_kb:  fileSizeKb,
      })

      if (dbErr) throw new Error(dbErr.message)

      // Notify family proxy if one exists
      try {
        const { data: proxyData } = await supabase
          .from('family_proxies')
          .select('profiles(phone)')
          .eq('client_id', clientId)
          .maybeSingle()

        const proxy = proxyData as FamilyProxy | null
        const proxyPhone = proxy?.profiles?.phone
        if (proxyPhone) {
          await sendSms({
            type:       'DOCUMENT_UPLOADED',
            to:         proxyPhone,
            clientName: clientName,
            docType:    DOC_TYPE_LABELS[pendingDocType] ?? pendingDocType,
          })
        }
      } catch {
        // Non-fatal: SMS failure doesn't block the upload
      }

      showToast('Document uploaded successfully.')
      refetch()
    } catch (err) {
      if (isOffline || !navigator.onLine) {
        showToast('✓ Saved offline — will sync when connected')
      } else {
        showToast(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleShare(docId: string) {
    try {
      const link = await generateShareLink(docId)
      setShareLink(link)
      setShareDocId(docId)
      setCopied(false)
    } catch (err) {
      showToast(`Could not generate share link: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleDelete(docId: string, filePath: string) {
    if (!window.confirm('Delete this document? This cannot be undone.')) return
    try {
      await deleteDocument(filePath)
      await supabase.from('documents').delete().eq('id', docId)
      showToast('Document deleted.')
      refetch()
    } catch (err) {
      showToast(`Delete failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleCopy() {
    if (!shareLink) return
    await navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>
  }

  return (
    <div className="p-4 space-y-4">
      {/* Upload buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => openTypeModal('photo')}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 bg-green-700 text-white
                     font-semibold py-3 px-4 rounded-xl text-sm min-h-[48px]
                     hover:bg-green-800 active:bg-green-900 disabled:opacity-50 transition-colors"
        >
          📷 Take Photo
        </button>
        <button
          onClick={() => openTypeModal('file')}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-2 border border-gray-300 bg-white
                     text-gray-700 font-semibold py-3 px-4 rounded-xl text-sm min-h-[48px]
                     hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          📁 Upload File
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handleFileSelected}
      />

      {uploading && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
          Uploading…
        </div>
      )}

      {/* Document grid */}
      {documents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-base font-medium">No documents yet.</p>
          <p className="text-sm mt-1">Tap to add the first document.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {documents.map(doc => (
            <div
              key={doc.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-col gap-2"
            >
              <p className="font-semibold text-sm text-gray-900 leading-snug">
                {DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}
              </p>
              <p className="text-xs text-gray-500">{formatDate(doc.created_at)}</p>
              {doc.file_size_kb !== null && (
                <p className="text-xs text-gray-400">{formatSize(doc.file_size_kb)}</p>
              )}
              <div className="flex gap-1 mt-auto">
                <button
                  onClick={() => handleShare(doc.id)}
                  className="flex-1 text-xs text-center border border-gray-200 rounded-lg py-2 min-h-[36px]
                             hover:bg-gray-50 active:bg-gray-100 transition-colors text-gray-700"
                >
                  🔗 Share
                </button>
                <button
                  onClick={() => handleDelete(doc.id, doc.file_url)}
                  className="flex-1 text-xs text-center border border-red-200 rounded-lg py-2 min-h-[36px]
                             hover:bg-red-50 active:bg-red-100 transition-colors text-red-600"
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Doc type selection modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white rounded-t-2xl w-full p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900">Select Document Type</h3>
            <div className="space-y-2">
              {DOC_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPendingDocType(opt.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-colors min-h-[48px]
                    ${pendingDocType === opt.value
                      ? 'border-green-700 bg-green-50 text-green-800'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowTypeModal(false)}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm font-medium min-h-[48px]"
              >
                Cancel
              </button>
              <button
                onClick={handleTypeChosen}
                disabled={!pendingDocType}
                className="flex-1 bg-green-700 text-white py-3 rounded-xl text-sm font-semibold
                           disabled:opacity-40 min-h-[48px] hover:bg-green-800"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share link modal */}
      {shareLink && shareDocId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Shareable Link</h3>
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 break-all text-xs text-gray-700">
              {shareLink}
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Link expires in 24 hours.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShareLink(null); setShareDocId(null) }}
                className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-xl text-sm font-medium min-h-[48px]"
              >
                Close
              </button>
              <button
                onClick={handleCopy}
                className="flex-1 bg-green-700 text-white py-3 rounded-xl text-sm font-semibold min-h-[48px] hover:bg-green-800"
              >
                {copied ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-4 right-4 bg-gray-900 text-white text-sm rounded-xl px-4 py-3 shadow-lg z-50 text-center">
          {toast}
        </div>
      )}
    </div>
  )
}
