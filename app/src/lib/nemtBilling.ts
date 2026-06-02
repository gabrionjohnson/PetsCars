/**
 * NEMT mileage billing — pure functions, mirrors the SQL trigger logic.
 * Formula: total_billed = base_fee + (loaded_miles * mileage_rate)
 * Loaded miles = miles with client in vehicle (pickup_signed → dropoff_signed only).
 */

export type TripType = 'ambulatory' | 'wheelchair' | 'stretcher'

export interface BillingRate {
  base_fee: number
  mileage_rate: number
}

export const BILLING_RATES: Record<TripType, BillingRate> = {
  ambulatory: { base_fee: 18.00, mileage_rate: 1.85 },
  wheelchair: { base_fee: 28.00, mileage_rate: 2.10 },
  stretcher:  { base_fee: 48.00, mileage_rate: 2.75 },
}

export function calcNemtBill(
  tripType: TripType,
  loadedMiles: number,
): number {
  const { base_fee, mileage_rate } = BILLING_RATES[tripType]
  return Math.round((base_fee + loadedMiles * mileage_rate) * 100) / 100
}

/** Flag trips over 100 loaded miles for admin review. */
export const MILEAGE_REVIEW_THRESHOLD = 100

export function needsMileageReview(loadedMiles: number): boolean {
  return loadedMiles > MILEAGE_REVIEW_THRESHOLD
}
