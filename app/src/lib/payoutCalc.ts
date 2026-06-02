/**
 * Payout calculation utilities — pure functions, no Supabase deps.
 * Mirrors the SQL trigger logic in supabase/migrations.
 */

export interface PayoutSplit {
  recipientAmount: number
  platformFee: number
}

/** Navigator earns 60% of subscription revenue. */
export function calcNavigatorPayout(subscriptionPrice: number): PayoutSplit {
  const recipientAmount = Math.round(subscriptionPrice * 0.60 * 100) / 100
  const platformFee     = Math.round((subscriptionPrice - recipientAmount) * 100) / 100
  return { recipientAmount, platformFee }
}

/** Errand driver earns 75% of the flat rate. */
export function calcErrandPayout(flatRate: number): PayoutSplit {
  const recipientAmount = Math.round(flatRate * 0.75 * 100) / 100
  const platformFee     = Math.round((flatRate - recipientAmount) * 100) / 100
  return { recipientAmount, platformFee }
}

/** NEMT driver earns 80% of the total billed amount. */
export function calcNemtPayout(totalBilled: number): PayoutSplit {
  const recipientAmount = Math.round(totalBilled * 0.80 * 100) / 100
  const platformFee     = Math.round((totalBilled - recipientAmount) * 100) / 100
  return { recipientAmount, platformFee }
}

/** Ambassador signup bonus — $20, paid once per referred client. */
export const AMBASSADOR_SIGNUP_BONUS = 20

/** Ambassador retention bonus — $10/month for months 1–6 only. */
export function calcAmbassadorRetentionBonus(retentionMonth: number): number {
  if (retentionMonth < 1 || retentionMonth > 6) return 0
  return 10
}

/** Ambassador tier bonus — $50 when they reach 5 active referrals. */
export const AMBASSADOR_TIER_BONUS = 50

/** Maximum ambassador earnings per client: signup + 6 months retention. */
export const AMBASSADOR_MAX_PER_CLIENT =
  AMBASSADOR_SIGNUP_BONUS + 6 * calcAmbassadorRetentionBonus(1)
