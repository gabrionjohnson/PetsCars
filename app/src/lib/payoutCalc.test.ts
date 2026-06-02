import { describe, it, expect } from 'vitest'
import {
  calcNavigatorPayout,
  calcErrandPayout,
  calcNemtPayout,
  calcAmbassadorRetentionBonus,
  AMBASSADOR_SIGNUP_BONUS,
  AMBASSADOR_TIER_BONUS,
  AMBASSADOR_MAX_PER_CLIENT,
} from './payoutCalc'

describe('Navigator payout (60% split)', () => {
  it('Community $19: navigator $11.40, platform $7.60', () => {
    const { recipientAmount, platformFee } = calcNavigatorPayout(19)
    expect(recipientAmount).toBe(11.40)
    expect(platformFee).toBe(7.60)
  })

  it('Basic $49: navigator $29.40, platform $19.60', () => {
    const { recipientAmount, platformFee } = calcNavigatorPayout(49)
    expect(recipientAmount).toBe(29.40)
    expect(platformFee).toBe(19.60)
  })

  it('Standard $79: navigator $47.40, platform $31.60', () => {
    const { recipientAmount, platformFee } = calcNavigatorPayout(79)
    expect(recipientAmount).toBe(47.40)
    expect(platformFee).toBe(31.60)
  })

  it('Full Care $119: navigator $71.40, platform $47.60', () => {
    const { recipientAmount, platformFee } = calcNavigatorPayout(119)
    expect(recipientAmount).toBe(71.40)
    expect(platformFee).toBe(47.60)
  })

  it('split always totals the subscription price', () => {
    for (const price of [19, 39, 49, 79, 119]) {
      const { recipientAmount, platformFee } = calcNavigatorPayout(price)
      expect(recipientAmount + platformFee).toBeCloseTo(price, 2)
    }
  })
})

describe('Errand driver payout (75% split)', () => {
  it('$12 pharmacy: driver $9.00, platform $3.00', () => {
    const { recipientAmount, platformFee } = calcErrandPayout(12)
    expect(recipientAmount).toBe(9.00)
    expect(platformFee).toBe(3.00)
  })

  it('$18 grocery: driver $13.50, platform $4.50', () => {
    const { recipientAmount, platformFee } = calcErrandPayout(18)
    expect(recipientAmount).toBe(13.50)
    expect(platformFee).toBe(4.50)
  })

  it('split always totals the flat rate', () => {
    for (const rate of [10, 12, 15, 18, 25]) {
      const { recipientAmount, platformFee } = calcErrandPayout(rate)
      expect(recipientAmount + platformFee).toBeCloseTo(rate, 2)
    }
  })
})

describe('NEMT driver payout (80% split)', () => {
  it('ambulatory $42: driver $33.60, platform $8.40', () => {
    const { recipientAmount, platformFee } = calcNemtPayout(42)
    expect(recipientAmount).toBe(33.60)
    expect(platformFee).toBe(8.40)
  })

  it('wheelchair $58: driver $46.40, platform $11.60', () => {
    const { recipientAmount, platformFee } = calcNemtPayout(58)
    expect(recipientAmount).toBe(46.40)
    expect(platformFee).toBe(11.60)
  })

  it('split always totals total_billed', () => {
    for (const billed of [36.50, 42, 58, 132.70]) {
      const { recipientAmount, platformFee } = calcNemtPayout(billed)
      expect(recipientAmount + platformFee).toBeCloseTo(billed, 2)
    }
  })
})

describe('Ambassador bonuses', () => {
  it('signup bonus is $20', () => {
    expect(AMBASSADOR_SIGNUP_BONUS).toBe(20)
  })

  it('tier bonus (5 active referrals) is $50', () => {
    expect(AMBASSADOR_TIER_BONUS).toBe(50)
  })

  it('retention month 1-6: $10 each', () => {
    for (let m = 1; m <= 6; m++) {
      expect(calcAmbassadorRetentionBonus(m)).toBe(10)
    }
  })

  it('retention month 7+: $0 (stops after 6 months)', () => {
    expect(calcAmbassadorRetentionBonus(7)).toBe(0)
    expect(calcAmbassadorRetentionBonus(12)).toBe(0)
  })

  it('retention month 0 or negative: $0', () => {
    expect(calcAmbassadorRetentionBonus(0)).toBe(0)
    expect(calcAmbassadorRetentionBonus(-1)).toBe(0)
  })

  it('max per client: signup + 6 months retention = $80', () => {
    expect(AMBASSADOR_MAX_PER_CLIENT).toBe(80)
  })
})
