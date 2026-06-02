import { describe, it, expect } from 'vitest'
import { normalizePhone, isMultiPartSms, containsPII, isSafeForSms, SMS_MAX_LENGTH } from './smsUtils'

describe('Phone normalization', () => {
  it('(229) 555-1234 → +12295551234', () => {
    expect(normalizePhone('(229) 555-1234')).toBe('+12295551234')
  })

  it('229-555-1234 → +12295551234', () => {
    expect(normalizePhone('229-555-1234')).toBe('+12295551234')
  })

  it('2295551234 → +12295551234', () => {
    expect(normalizePhone('2295551234')).toBe('+12295551234')
  })

  it('12295551234 → +12295551234', () => {
    expect(normalizePhone('12295551234')).toBe('+12295551234')
  })

  it('+12295551234 → +12295551234', () => {
    expect(normalizePhone('+12295551234')).toBe('+12295551234')
  })

  it('invalid number returns null', () => {
    expect(normalizePhone('555-1234')).toBeNull()
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})

describe('SMS length validation', () => {
  it('SMS_MAX_LENGTH is 160', () => {
    expect(SMS_MAX_LENGTH).toBe(160)
  })

  it('message under 160 chars: not multi-part', () => {
    expect(isMultiPartSms('Hello')).toBe(false)
    expect(isMultiPartSms('A'.repeat(160))).toBe(false)
  })

  it('message over 160 chars: flagged as multi-part', () => {
    expect(isMultiPartSms('A'.repeat(161))).toBe(true)
  })
})

describe('PII detection', () => {
  it('plain text message: no PII', () => {
    expect(containsPII('Your ride is on the way!')).toBe(false)
    expect(containsPII('Task completed for Willie Mae.')).toBe(false)
  })

  it('9-digit SSN without dashes: detected', () => {
    expect(containsPII('SSN: 123456789')).toBe(true)
  })

  it('SSN with dashes: detected', () => {
    expect(containsPII('SSN: 123-45-6789')).toBe(true)
  })

  it('Georgia Medicaid ID: detected', () => {
    expect(containsPII('GA12345678')).toBe(true)
    expect(containsPII('GA1234567890')).toBe(true)
  })

  it('dollar amounts and phone numbers: not flagged as PII', () => {
    expect(containsPII('$188/month benefit approved')).toBe(false)
    expect(containsPII('Call (229) 555-1234')).toBe(false)
  })
})

describe('Senior name safety for SMS', () => {
  it('first name only: safe', () => {
    expect(isSafeForSms('Willie')).toBe(true)
    expect(isSafeForSms('Robert')).toBe(true)
  })

  it('full name with space: not safe for SMS', () => {
    expect(isSafeForSms('Willie Mae')).toBe(false)
    expect(isSafeForSms('Robert Washington')).toBe(false)
  })
})
