/**
 * SMS utility functions — phone normalization and message validation.
 * No Supabase or Twilio deps — pure functions safe for unit testing.
 */

/** Normalize any US phone format to E.164 (+1XXXXXXXXXX). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

/** Maximum SMS segment length (single-part message). */
export const SMS_MAX_LENGTH = 160

export function isMultiPartSms(text: string): boolean {
  return text.length > SMS_MAX_LENGTH
}

const PII_PATTERNS = [
  /\b\d{9}\b/,          // 9-digit SSN (no dashes)
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN with dashes
  /GA\d{7,12}/i,        // Georgia Medicaid ID pattern
]

export function containsPII(text: string): boolean {
  return PII_PATTERNS.some(p => p.test(text))
}

/** Senior name in any SMS must be first name only. */
export function isSafeForSms(name: string): boolean {
  return !name.includes(' ') // passes only if first name, no spaces
}
