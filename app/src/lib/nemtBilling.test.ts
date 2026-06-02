import { describe, it, expect } from 'vitest'
import { calcNemtBill, needsMileageReview, BILLING_RATES, MILEAGE_REVIEW_THRESHOLD } from './nemtBilling'

describe('NEMT billing — calcNemtBill', () => {
  it('ambulatory: base $18, $1.85/mile', () => {
    expect(BILLING_RATES.ambulatory.base_fee).toBe(18.00)
    expect(BILLING_RATES.ambulatory.mileage_rate).toBe(1.85)
  })

  it('wheelchair: base $28, $2.10/mile', () => {
    expect(BILLING_RATES.wheelchair.base_fee).toBe(28.00)
    expect(BILLING_RATES.wheelchair.mileage_rate).toBe(2.10)
  })

  it('stretcher: base $48, $2.75/mile', () => {
    expect(BILLING_RATES.stretcher.base_fee).toBe(48.00)
    expect(BILLING_RATES.stretcher.mileage_rate).toBe(2.75)
  })

  it('Plains → DaVita Americus ~10 miles ambulatory: $36.50', () => {
    expect(calcNemtBill('ambulatory', 10)).toBe(36.50)
  })

  it('Plains → Phoebe Putney Albany ~62 miles ambulatory: $132.70', () => {
    expect(calcNemtBill('ambulatory', 62)).toBe(132.70)
  })

  it('wheelchair 10-mile trip: $28 + 10*$2.10 = $49.00', () => {
    expect(calcNemtBill('wheelchair', 10)).toBe(49.00)
  })

  it('zero loaded miles returns just the base fee', () => {
    expect(calcNemtBill('ambulatory', 0)).toBe(18.00)
    expect(calcNemtBill('wheelchair', 0)).toBe(28.00)
    expect(calcNemtBill('stretcher', 0)).toBe(48.00)
  })

  it('stretcher 20 miles: $48 + 20*$2.75 = $103.00', () => {
    expect(calcNemtBill('stretcher', 20)).toBe(103.00)
  })
})

describe('Mileage review threshold', () => {
  it('threshold is 100 miles', () => {
    expect(MILEAGE_REVIEW_THRESHOLD).toBe(100)
  })

  it('exactly 100 miles: no flag', () => {
    expect(needsMileageReview(100)).toBe(false)
  })

  it('101 miles: flagged for admin review', () => {
    expect(needsMileageReview(101)).toBe(true)
  })

  it('62-mile chemo trip (Dorothy Simmons): no flag', () => {
    expect(needsMileageReview(62)).toBe(false)
  })

  it('10-mile dialysis trip (Robert Washington): no flag', () => {
    expect(needsMileageReview(10)).toBe(false)
  })
})
