/**
 * Supabase Storage helpers for the client-documents bucket.
 * All paths follow: clients/{client_id}/{doc_type}_{timestamp}.{ext}
 */

import { supabase } from './supabase'

const BUCKET      = 'client-documents'
const NEMT_BUCKET = 'nemt-signatures'

export function buildDocPath(
  clientId:  string,
  docType:   string,
  fileName:  string,
): string {
  const ext  = fileName.includes('.') ? fileName.split('.').pop() : 'bin'
  const ts   = Date.now()
  return `${clientId}/${docType}_${ts}.${ext}`
}

/** Upload a file and return the storage path (not a public URL). */
export async function uploadDocument(
  clientId: string,
  docType:  string,
  file:     File,
): Promise<string> {
  const path = buildDocPath(clientId, docType, file.name)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })

  if (error) throw new Error(`Upload failed: ${error.message}`)
  return path
}

/** Get a short-lived signed URL for in-app preview of client documents (60 seconds). */
export async function getPreviewUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60)

  if (error || !data?.signedUrl) throw new Error('Could not generate preview URL')
  return data.signedUrl
}

/**
 * Get a signed URL for an NEMT signature PNG from the private nemt-signatures bucket.
 * Expiry: 5 minutes — long enough for admin review but short-lived per HIPAA guidance.
 */
export async function getNemtSignatureUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(NEMT_BUCKET)
    .createSignedUrl(path, 300) // 5-minute expiry

  if (error || !data?.signedUrl) throw new Error('Could not generate NEMT signature URL')
  return data.signedUrl
}

/** Generate a 24-hour share URL via the DB function, then sign the storage path. */
export async function generateShareLink(documentId: string): Promise<string> {
  // 1. Generate + store the share token in the documents table
  const { data, error } = await supabase.rpc('generate_document_share_token', {
    p_document_id:   documentId,
    p_expiry_hours:  24,
  })
  if (error) throw new Error(`Share token error: ${error.message}`)

  const token = data as string

  // 2. The share URL is the app route — the app validates the token at load time
  const base = window.location.origin
  return `${base}/share/${documentId}?token=${token}`
}

/** Delete a document from storage by its path. */
export async function deleteDocument(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw new Error(`Delete failed: ${error.message}`)
}
