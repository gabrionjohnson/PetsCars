/**
 * Benefits Eligibility Screener v2 — pure utility, no React or Supabase deps.
 * 23 intake questions → 30 benefit programs across 7 tiers.
 *
 * Conservative thresholds: VA Aid & Attendance, Extra Help, and Medicare
 * Savings Program return 'needs_verification' when income is borderline
 * rather than 'not_eligible'. Never miss a high-value program.
 */

// ── Answer types ─────────────────────────────────────────────────────────────

export type AgeGroup         = 'under_60' | '60_64' | '65_74' | '75_plus'
export type CitizenshipStatus = 'citizen' | 'qualified_immigrant' | 'not_sure'
export type IncomeRange      = 'under_500' | '500_900' | '900_1400' | '1400_2000' | 'over_2000' | 'not_sure'
export type HouseholdSize    = '1' | '2' | '3' | '4_plus'
export type AssetLevel       = 'no' | 'some' | 'significant' | 'not_sure'
export type PartBPremium     = 'yes' | 'no' | 'not_enrolled' | 'not_sure'
export type RxDifficulty     = 'often' | 'sometimes' | 'no' | 'no_medications'
export type HousingType      = 'own_mortgage' | 'own_paid' | 'rent' | 'family' | 'other'
export type RepairNeeds      = 'significant' | 'minor' | 'no' | 'not_sure'
export type UtilityDifficulty = 'often' | 'sometimes' | 'no'
export type HVACStatus       = 'ok' | 'no_heating' | 'no_cooling' | 'not_sure'
export type ChronicConditions = 'multiple' | 'one' | 'no'
export type ADLHelp          = 'significant' | 'some' | 'no'
export type MobilityIssue    = 'wheelchair' | 'walker_cane' | 'other_mobility' | 'no'
export type VeteranStatus    = 'veteran' | 'active' | 'no' | 'not_sure'
export type VeteranEra       = 'wwii' | 'korea' | 'vietnam' | 'gulf' | 'post911' | 'other'
export type SurvivingSpouse  = 'yes' | 'no'
export type PriorVABenefits  = 'receiving' | 'denied' | 'pending' | 'never' | 'na'
export type PhoneAccess      = 'cell' | 'home_phone' | 'both' | 'none'
export type InternetAccess   = 'broadband' | 'limited' | 'no'
export type LegalDocs        = 'both' | 'one' | 'no' | 'not_sure'
export type ExploitationConcern = 'no' | 'possible' | 'prefer_not'

export type CurrentBenefit =
  | 'social_security' | 'ssi' | 'medicaid'
  | 'medicare_a' | 'medicare_b' | 'medicare_d'
  | 'snap' | 'va_benefits' | 'none' | 'not_sure'

export interface ScreenerAnswers {
  q1_age:                AgeGroup
  q2_citizenship:        CitizenshipStatus
  q3_income:             IncomeRange
  q4_household_size:     HouseholdSize
  q5_assets:             AssetLevel
  q6_current_benefits:   CurrentBenefit[]    // multi-select
  q7_part_b_premium:     PartBPremium
  q8_rx_difficulty:      RxDifficulty
  q9_housing_type:       HousingType
  q10_home_repairs:      RepairNeeds
  q11_utility_difficulty: UtilityDifficulty
  q12_hvac_status:       HVACStatus
  q13_chronic_conditions: ChronicConditions
  q14_adl_help:          ADLHelp
  q15_mobility:          MobilityIssue
  q16_veteran_status:    VeteranStatus
  q17_veteran_era:       VeteranEra[]        // conditional: shown only if q16 = 'veteran'
  q18_surviving_spouse:  SurvivingSpouse
  q19_prior_va:          PriorVABenefits
  q20_phone_access:      PhoneAccess
  q21_internet_access:   InternetAccess
  q22_legal_docs:        LegalDocs
  q23_exploitation:      ExploitationConcern
}

export type EligibilityStatus =
  | 'eligible'
  | 'likely_eligible'
  | 'needs_verification'
  | 'not_eligible'

export interface EligibilityResult {
  programId:             string
  programName:           string
  tier:                  1 | 2 | 3 | 4 | 5 | 6 | 7
  tierName:              string
  status:                EligibilityStatus
  estimatedMonthlyValue: number
  estimatedAnnualValue:  number
  priority:              1 | 2 | 3
  actionLabel:           string
  notes?:                string
}

// Backward-compat alias used by ClientProfilePage, OnboardingWizard, Step3Screener
export type RecommendedProgram = EligibilityResult

// ── Income helpers ────────────────────────────────────────────────────────────

const INCOME_MAX: Record<IncomeRange, number> = {
  under_500:  500,
  '500_900':   900,
  '900_1400':  1400,
  '1400_2000': 2000,
  over_2000:   Infinity,
  not_sure:    Infinity,
}

const INCOME_MIN: Record<IncomeRange, number> = {
  under_500:  0,
  '500_900':   500,
  '900_1400':  900,
  '1400_2000': 1400,
  over_2000:   2000,
  not_sure:    0,
}

type IncomeCheck = 'eligible' | 'likely' | 'verify' | 'ineligible'

function checkMonthlyIncome(
  income: IncomeRange,
  limit: number,
  conservative = false,
): IncomeCheck {
  if (income === 'not_sure') return conservative ? 'verify' : 'verify'
  if (INCOME_MAX[income] <= limit) return 'eligible'
  if (INCOME_MIN[income] < limit)  return conservative ? 'verify' : 'likely'
  return 'ineligible'
}

function checkAnnualIncome(
  income: IncomeRange,
  annualLimit: number,
  conservative = false,
): IncomeCheck {
  return checkMonthlyIncome(income, annualLimit / 12, conservative)
}

function hasBenefit(a: ScreenerAnswers, b: CurrentBenefit): boolean {
  return a.q6_current_benefits.includes(b)
}

function isAge65Plus(a: ScreenerAnswers): boolean {
  return a.q1_age === '65_74' || a.q1_age === '75_plus'
}

function isAge60Plus(a: ScreenerAnswers): boolean {
  return a.q1_age !== 'under_60'
}

function isAge62Plus(a: ScreenerAnswers): boolean {
  return a.q1_age === '60_64' || isAge65Plus(a)
}

function isCitizen(a: ScreenerAnswers): boolean {
  return a.q2_citizenship === 'citizen' || a.q2_citizenship === 'qualified_immigrant'
}

function isVeteran(a: ScreenerAnswers): boolean {
  return a.q16_veteran_status === 'veteran'
}

function hasWartimeService(a: ScreenerAnswers): boolean {
  if (!isVeteran(a)) return false
  const wartime: VeteranEra[] = ['wwii', 'korea', 'vietnam', 'gulf', 'post911']
  return a.q17_veteran_era.some(e => wartime.includes(e))
}

function needsADLHelp(a: ScreenerAnswers): boolean {
  return a.q14_adl_help === 'significant' || a.q14_adl_help === 'some'
}

function isRenter(a: ScreenerAnswers): boolean {
  return a.q9_housing_type === 'rent'
}

function isHomeowner(a: ScreenerAnswers): boolean {
  return a.q9_housing_type === 'own_mortgage' || a.q9_housing_type === 'own_paid'
}

function isDisabled(a: ScreenerAnswers): boolean {
  return a.q15_mobility !== 'no' || a.q13_chronic_conditions !== 'no' || needsADLHelp(a)
}

// ── Tier 1 — Federal Entitlements ────────────────────────────────────────────

export function checkSNAP(a: ScreenerAnswers): EligibilityResult | null {
  if (hasBenefit(a, 'snap')) return null
  if (!isCitizen(a) && a.q2_citizenship !== 'not_sure') return null

  // 2026 SNAP limit 1-person household: $1,473/mo; seniors get medical deductions
  const incomeCheck = checkMonthlyIncome(a.q3_income, 1473)
  const likelyWithDeductions = checkMonthlyIncome(a.q3_income, 1800)

  let status: EligibilityStatus
  if (incomeCheck === 'eligible') {
    status = 'eligible'
  } else if (incomeCheck === 'likely' || likelyWithDeductions !== 'ineligible') {
    status = 'likely_eligible'
  } else if (incomeCheck === 'verify') {
    status = 'needs_verification'
  } else {
    return null
  }

  return {
    programId: 'snap',
    programName: 'SNAP (Food Stamps)',
    tier: 1, tierName: 'Federal Entitlements',
    status,
    estimatedMonthlyValue: 188,
    estimatedAnnualValue: 2256,
    priority: 1,
    actionLabel: 'Start SNAP Application',
    notes: 'Senior SNAP in Georgia requires all household members 66+ with no earned income. Medical deductions can raise the income limit.',
  }
}

export function checkMedicaid(a: ScreenerAnswers): EligibilityResult | null {
  if (hasBenefit(a, 'medicaid')) return null
  if (!isCitizen(a) && a.q2_citizenship !== 'not_sure') return null

  // 138% FPL 2026 single: ~$1,732/mo
  const incomeCheck = checkMonthlyIncome(a.q3_income, 1732)
  const likelyCheck = checkMonthlyIncome(a.q3_income, 2000)

  let status: EligibilityStatus
  if (incomeCheck === 'eligible') {
    status = 'eligible'
  } else if (incomeCheck === 'likely' || likelyCheck !== 'ineligible') {
    status = 'likely_eligible'
  } else if (incomeCheck === 'verify') {
    status = 'needs_verification'
  } else {
    return null
  }

  return {
    programId: 'medicaid',
    programName: 'Medicaid',
    tier: 1, tierName: 'Federal Entitlements',
    status,
    estimatedMonthlyValue: 600,
    estimatedAnnualValue: 7200,
    priority: 1,
    actionLabel: 'Start Medicaid Application',
    notes: 'Apply through Georgia Gateway portal.',
  }
}

export function checkMedicarePartA(a: ScreenerAnswers): EligibilityResult | null {
  if (!isAge65Plus(a)) return null
  if (hasBenefit(a, 'medicare_a')) return null

  return {
    programId: 'medicare_part_a',
    programName: 'Medicare Part A',
    tier: 1, tierName: 'Federal Entitlements',
    status: 'eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 1,
    actionLabel: 'Enroll in Medicare Part A',
    notes: 'Most people get Part A premium-free. Covers hospital stays, skilled nursing, hospice.',
  }
}

export function checkMedicarePartB(a: ScreenerAnswers): EligibilityResult | null {
  if (!isAge65Plus(a)) return null
  if (hasBenefit(a, 'medicare_b')) return null

  return {
    programId: 'medicare_part_b',
    programName: 'Medicare Part B',
    tier: 1, tierName: 'Federal Entitlements',
    status: 'eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 1,
    actionLabel: 'Enroll in Medicare Part B',
    notes: 'Late enrollment penalty applies — enroll within 3 months of turning 65 or losing employer coverage.',
  }
}

export function checkMedicareSavingsProgram(a: ScreenerAnswers): EligibilityResult | null {
  const onMedicare = hasBenefit(a, 'medicare_a') || hasBenefit(a, 'medicare_b') || isAge65Plus(a)
  if (!onMedicare) return null

  // Conservative: income < $1,660/mo; assets < $9,090
  const incomeCheck = checkMonthlyIncome(a.q3_income, 1660, true)
  const assetsOk = a.q5_assets !== 'significant'

  let status: EligibilityStatus
  if (incomeCheck === 'ineligible' && assetsOk === false) return null
  if (incomeCheck === 'eligible' && assetsOk) {
    status = 'eligible'
  } else if (incomeCheck === 'verify' || a.q5_assets === 'not_sure') {
    status = 'needs_verification'
  } else if (incomeCheck !== 'ineligible') {
    status = 'likely_eligible'
  } else {
    return null
  }

  return {
    programId: 'medicare_savings_program',
    programName: 'Medicare Savings Program',
    tier: 1, tierName: 'Federal Entitlements',
    status,
    estimatedMonthlyValue: 185,
    estimatedAnnualValue: 2220,
    priority: 1,
    actionLabel: 'Apply for Medicare Savings Program',
    notes: 'Four tiers — QMB, SLMB, QI, QDWI. Apply through Georgia Gateway (Medicaid portal). Even those who don\'t qualify for full Medicaid may qualify for MSP.',
  }
}

export function checkExtraHelp(a: ScreenerAnswers): EligibilityResult | null {
  const onPartD = hasBenefit(a, 'medicare_d') || isAge65Plus(a)
  if (!onPartD) return null
  if (a.q8_rx_difficulty === 'no' || a.q8_rx_difficulty === 'no_medications') return null

  // Conservative: income < $1,903/mo; assets < $16,660
  const incomeCheck = checkMonthlyIncome(a.q3_income, 1903, true)
  const assetsOk = a.q5_assets !== 'significant'

  let status: EligibilityStatus
  if (incomeCheck === 'ineligible') return null
  if (incomeCheck === 'eligible' && assetsOk) {
    status = 'eligible'
  } else if (incomeCheck === 'verify' || a.q5_assets === 'not_sure') {
    status = 'needs_verification'
  } else {
    status = 'likely_eligible'
  }

  return {
    programId: 'extra_help',
    programName: 'Extra Help (Low Income Subsidy)',
    tier: 1, tierName: 'Federal Entitlements',
    status,
    estimatedMonthlyValue: 492,
    estimatedAnnualValue: 5900,
    priority: 1,
    actionLabel: 'Apply for Extra Help',
    notes: 'Reduces Medicare Part D prescription costs. Apply through SSA.',
  }
}

export function checkSSI(a: ScreenerAnswers): EligibilityResult | null {
  if (!isAge65Plus(a)) return null
  if (hasBenefit(a, 'ssi')) return null
  if (!isCitizen(a)) return null

  // SSI limit: $967/mo income; $2,000 assets
  const incomeCheck = checkMonthlyIncome(a.q3_income, 967)
  const assetsOk = a.q5_assets === 'no'

  if (incomeCheck === 'ineligible') return null
  if (!assetsOk && a.q5_assets !== 'not_sure') {
    return {
      programId: 'ssi',
      programName: 'SSI (Supplemental Security Income)',
      tier: 1, tierName: 'Federal Entitlements',
      status: 'needs_verification',
      estimatedMonthlyValue: 967,
      estimatedAnnualValue: 11604,
      priority: 1,
      actionLabel: 'Screen for SSI',
      notes: 'Asset limit is $2,000 for individual. Verify asset level with client.',
    }
  }

  const status: EligibilityStatus =
    incomeCheck === 'eligible' && assetsOk ? 'eligible' :
    incomeCheck === 'verify' ? 'needs_verification' : 'likely_eligible'

  return {
    programId: 'ssi',
    programName: 'SSI (Supplemental Security Income)',
    tier: 1, tierName: 'Federal Entitlements',
    status,
    estimatedMonthlyValue: 967,
    estimatedAnnualValue: 11604,
    priority: 1,
    actionLabel: 'Screen for SSI',
    notes: 'Monthly income payment for low-income seniors 65+ and people with disabilities.',
  }
}

export function checkSocialSecurityRSDI(a: ScreenerAnswers): EligibilityResult | null {
  if (!isAge62Plus(a)) return null
  if (hasBenefit(a, 'social_security')) return null

  return {
    programId: 'social_security_rsdi',
    programName: 'Social Security (Retirement/Survivor)',
    tier: 1, tierName: 'Federal Entitlements',
    status: 'needs_verification',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 2,
    actionLabel: 'Review Social Security Options',
    notes: 'Check for unclaimed survivor benefits if widowed — may be worth more than own benefit. Many rural seniors delay claiming.',
  }
}

// ── Tier 2 — Georgia State Programs ──────────────────────────────────────────

export function checkGeorgiaWaiver(a: ScreenerAnswers): EligibilityResult | null {
  const medicaidEligible = hasBenefit(a, 'medicaid') ||
    checkMedicaid(a)?.status === 'eligible' ||
    checkMedicaid(a)?.status === 'likely_eligible'
  if (!medicaidEligible) return null
  if (!needsADLHelp(a)) return null

  return {
    programId: 'georgia_waiver',
    programName: 'Georgia Elderly & Disabled Waiver (NOW/COMP)',
    tier: 2, tierName: 'Georgia State Programs',
    status: 'likely_eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 1,
    actionLabel: 'Apply for Georgia Waiver Program',
    notes: 'Waitlist may exist — apply immediately. Pays for in-home personal care, meals, and community support.',
  }
}

export function checkCCSP(a: ScreenerAnswers): EligibilityResult | null {
  if (!isAge65Plus(a) && !isDisabled(a)) return null
  if (!needsADLHelp(a)) return null
  // CCSP is for those who don't qualify for Medicaid
  const medicaidCheck = checkMedicaid(a)
  if (medicaidCheck?.status === 'eligible') return null

  return {
    programId: 'ccsp',
    programName: 'Community Care Services Program (CCSP)',
    tier: 2, tierName: 'Georgia State Programs',
    status: 'likely_eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 2,
    actionLabel: 'Refer to SOWEGA COA for CCSP',
    notes: 'State-funded alternative to Medicaid waiver for those who don\'t qualify for Medicaid.',
  }
}

export function checkLIHEAP(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q11_utility_difficulty === 'no') return null

  // 150% FPL 2026 single: ~$1,868/mo
  const incomeCheck = checkMonthlyIncome(a.q3_income, 1868)
  if (incomeCheck === 'ineligible') return null

  const status: EligibilityStatus =
    incomeCheck === 'eligible' ? 'eligible' :
    incomeCheck === 'verify' ? 'needs_verification' : 'likely_eligible'

  return {
    programId: 'liheap',
    programName: 'LIHEAP — Home Energy Assistance',
    tier: 2, tierName: 'Georgia State Programs',
    status,
    estimatedMonthlyValue: 35,
    estimatedAnnualValue: 400,
    priority: 1,
    actionLabel: 'Apply for LIHEAP',
    notes: 'Cooling opens April 1 for seniors; heating opens first workday of December. Funds run out fast — apply on opening day.',
  }
}

export function checkWeatherization(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q10_home_repairs === 'no') return null
  if (!isHomeowner(a) && !isRenter(a)) return null

  // 200% FPL 2026 single: ~$2,489/mo
  const incomeCheck = checkMonthlyIncome(a.q3_income, 2489)
  if (incomeCheck === 'ineligible') return null

  const status: EligibilityStatus =
    incomeCheck === 'eligible' ? 'eligible' :
    incomeCheck === 'verify' ? 'needs_verification' : 'likely_eligible'

  return {
    programId: 'weatherization',
    programName: 'Weatherization Assistance Program',
    tier: 2, tierName: 'Georgia State Programs',
    status,
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 4000,
    priority: 2,
    actionLabel: 'Apply for Weatherization',
    notes: 'One-time grant for insulation, HVAC, and energy improvements. Sumter County is a rural priority area.',
  }
}

export function checkFarmersMarket(a: ScreenerAnswers): EligibilityResult | null {
  if (!isAge60Plus(a)) return null

  // 185% FPL ~$2,302/mo. For 'over_2000' the minimum ($2,000) is only slightly below
  // the limit — not worth flagging a $75/year voucher on a marginal income overlap.
  if (a.q3_income === 'over_2000') return null

  const incomeCheck = checkMonthlyIncome(a.q3_income, 2302)
  if (incomeCheck === 'ineligible') return null

  return {
    programId: 'farmers_market',
    programName: 'GA Senior Farmers Market Nutrition Program',
    tier: 2, tierName: 'Georgia State Programs',
    status: incomeCheck === 'eligible' ? 'eligible' : 'likely_eligible',
    estimatedMonthlyValue: 6,
    estimatedAnnualValue: 75,
    priority: 3,
    actionLabel: 'Register for Farmers Market Vouchers',
    notes: 'Seasonal — register in August each year. $50–$100 in produce vouchers for local farmers markets.',
  }
}

export function checkPropertyTaxExemption(a: ScreenerAnswers): EligibilityResult | null {
  if (!isHomeowner(a)) return null
  if (!isAge62Plus(a)) return null

  return {
    programId: 'property_tax_exemption',
    programName: 'Property Tax Exemption',
    tier: 2, tierName: 'Georgia State Programs',
    status: 'eligible',
    estimatedMonthlyValue: 100,
    estimatedAnnualValue: 1200,
    priority: 2,
    actionLabel: 'Apply at Sumter County Tax Commissioner',
    notes: 'School tax exemption available at 62; additional exemptions at 65+. Must apply by April 1. Stacks with homestead exemption.',
  }
}

export function checkGeorgiaSHIP(a: ScreenerAnswers): EligibilityResult | null {
  const onMedicare = hasBenefit(a, 'medicare_a') || hasBenefit(a, 'medicare_b') || isAge65Plus(a)
  if (!onMedicare) return null

  return {
    programId: 'georgia_ship',
    programName: 'Georgia SHIP Medicare Counseling',
    tier: 2, tierName: 'Georgia State Programs',
    status: 'eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 2,
    actionLabel: 'Schedule SHIP Counseling — 1-866-552-4464',
    notes: 'Free Medicare counseling for all beneficiaries. Especially valuable during open enrollment Oct 15–Dec 7.',
  }
}

// ── Tier 3 — Veteran Benefits ─────────────────────────────────────────────────

export function checkVAPension(a: ScreenerAnswers): EligibilityResult | null {
  if (!isVeteran(a)) return null
  if (!isAge65Plus(a)) return null
  if (hasBenefit(a, 'va_benefits')) return null

  const hasWartime = hasWartimeService(a)
  if (!hasWartime && a.q17_veteran_era.length > 0) return null

  // VA Pension limit: $16,551/year single (~$1,379/mo)
  const incomeCheck = checkAnnualIncome(a.q3_income, 16551)
  if (incomeCheck === 'ineligible') return null

  const status: EligibilityStatus =
    incomeCheck === 'eligible' ? 'eligible' :
    incomeCheck === 'verify' ? 'needs_verification' : 'likely_eligible'

  return {
    programId: 'va_pension',
    programName: 'VA Pension (Non-Service Connected)',
    tier: 3, tierName: 'Veteran Benefits',
    status,
    estimatedMonthlyValue: 1228,
    estimatedAnnualValue: 14736,
    priority: 1,
    actionLabel: 'Apply for VA Pension',
    notes: 'Requires DD-214. Many rural veterans have never applied. High priority — one of the highest-value programs available.',
  }
}

export function checkVAAidAndAttendance(a: ScreenerAnswers): EligibilityResult | null {
  if (!isVeteran(a)) return null
  if (!needsADLHelp(a)) return null

  // Must also meet VA Pension criteria
  const pensionCheck = checkVAPension(a)
  if (!pensionCheck || pensionCheck.status === 'not_eligible') {
    // Still show as needs_verification if veteran needs ADL help (conservative)
    if (a.q14_adl_help === 'significant') {
      return {
        programId: 'va_aid_and_attendance',
        programName: 'VA Aid and Attendance',
        tier: 3, tierName: 'Veteran Benefits',
        status: 'needs_verification',
        estimatedMonthlyValue: 2300,
        estimatedAnnualValue: 27600,
        priority: 1,
        actionLabel: 'Apply for Aid and Attendance',
        notes: 'HIGHEST VALUE BENEFIT IN SCREENER — up to $27,600/year. Do not miss. Requires VA Pension eligibility plus need for daily care.',
      }
    }
    return null
  }

  const status: EligibilityStatus =
    pensionCheck.status === 'eligible' ? 'eligible' : 'needs_verification'

  return {
    programId: 'va_aid_and_attendance',
    programName: 'VA Aid and Attendance',
    tier: 3, tierName: 'Veteran Benefits',
    status,
    estimatedMonthlyValue: 2300,
    estimatedAnnualValue: 27600,
    priority: 1,
    actionLabel: 'Apply for Aid and Attendance',
    notes: 'HIGHEST VALUE BENEFIT IN SCREENER — up to $27,600/year. Requires DD-214 and VA Form 21-2680 (physician statement). Georgia Legal Services can help.',
  }
}

export function checkVAHealthcare(a: ScreenerAnswers): EligibilityResult | null {
  if (!isVeteran(a)) return null
  if (a.q19_prior_va === 'receiving') return null

  return {
    programId: 'va_healthcare',
    programName: 'VA Healthcare Enrollment',
    tier: 3, tierName: 'Veteran Benefits',
    status: 'eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 1,
    actionLabel: 'Enroll in VA Healthcare',
    notes: 'Rural veterans get priority enrollment. Covers medical, dental, mental health, prescriptions at VA facilities.',
  }
}

export function checkSurvivorsPension(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q18_surviving_spouse !== 'yes') return null

  // Survivors Pension: $9,224/year single (~$769/mo)
  const incomeCheck = checkAnnualIncome(a.q3_income, 9224)
  if (incomeCheck === 'ineligible') return null

  const status: EligibilityStatus =
    incomeCheck === 'eligible' ? 'eligible' :
    incomeCheck === 'verify' ? 'needs_verification' : 'likely_eligible'

  return {
    programId: 'survivors_pension',
    programName: "Survivors Pension (Veteran's Surviving Spouse)",
    tier: 3, tierName: 'Veteran Benefits',
    status,
    estimatedMonthlyValue: 1154,
    estimatedAnnualValue: 13848,
    priority: 1,
    actionLabel: 'Apply for Survivors Pension',
    notes: 'Available to low-income surviving spouses of wartime veterans. Apply through VA regional office or accredited VA claims agent.',
  }
}

// ── Tier 4 — Housing and Safety ───────────────────────────────────────────────

export function checkSection8(a: ScreenerAnswers): EligibilityResult | null {
  if (!isRenter(a)) return null

  // 50% AMI for Sumter County ~$900/mo
  const incomeCheck = checkMonthlyIncome(a.q3_income, 900)
  if (incomeCheck === 'ineligible') return null

  return {
    programId: 'section_8',
    programName: 'Section 8 / Housing Choice Voucher',
    tier: 4, tierName: 'Housing and Safety',
    status: incomeCheck === 'eligible' ? 'likely_eligible' : 'needs_verification',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 2,
    actionLabel: 'Check Sumter County Housing Authority Waitlist',
    notes: 'Waitlist may be closed. Apply when open — vouchers cap rent at 30% of household income.',
  }
}

export function checkUSDA504(a: ScreenerAnswers): EligibilityResult | null {
  if (!isHomeowner(a)) return null
  if (a.q10_home_repairs === 'no') return null

  // Very low income: $31,550/year (~$2,629/mo) — but actual grant requires lower
  const incomeCheck = checkAnnualIncome(a.q3_income, 31550)
  if (incomeCheck === 'ineligible') return null

  return {
    programId: 'usda_504',
    programName: 'USDA Section 504 Home Repair',
    tier: 4, tierName: 'Housing and Safety',
    status: 'likely_eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 10000,
    priority: 2,
    actionLabel: 'Apply for USDA 504 Home Repair',
    notes: 'Up to $10,000 grant + $40,000 loan for rural homeowners. Covers ramps, roofs, plumbing, heating. Sumter County qualifies as rural.',
  }
}

export function checkRampProgram(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q15_mobility !== 'wheelchair' && a.q15_mobility !== 'other_mobility') return null
  if (!isHomeowner(a)) return null

  return {
    programId: 'ramp_program',
    programName: 'Ramp Program (SOWEGA COA)',
    tier: 4, tierName: 'Housing and Safety',
    status: 'likely_eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 1,
    actionLabel: 'Refer to SOWEGA COA Ramp Program',
    notes: 'Free wheelchair ramps and home modification for homebound seniors. SOWEGA Area Agency on Aging — contact to verify waitlist.',
  }
}

// ── Tier 5 — Telecom and Digital Access ──────────────────────────────────────

export function checkLifeline(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q20_phone_access === 'both' || a.q20_phone_access === 'cell' || a.q20_phone_access === 'home_phone') {
    // Already has service but check if discount would help — only if income-eligible
    const incomeCheck = checkMonthlyIncome(a.q3_income, 1682) // 135% FPL
    if (incomeCheck === 'ineligible') return null
    // Fall through to create recommendation for discount
  }

  const onQualifyingProgram =
    hasBenefit(a, 'medicaid') || hasBenefit(a, 'snap') || hasBenefit(a, 'ssi')

  const incomeCheck = checkMonthlyIncome(a.q3_income, 1682, true)
  if (incomeCheck === 'ineligible' && !onQualifyingProgram) return null

  return {
    programId: 'lifeline',
    programName: 'Lifeline — Discounted Phone Service',
    tier: 5, tierName: 'Telecom and Digital Access',
    status: onQualifyingProgram ? 'eligible' : (incomeCheck === 'eligible' ? 'eligible' : 'likely_eligible'),
    estimatedMonthlyValue: 9,
    estimatedAnnualValue: 111,
    priority: 2,
    actionLabel: 'Apply for Lifeline',
    notes: '$9.25/month off phone service. Some carriers offer free smartphones. Automatic if enrolled in Medicaid/SNAP/SSI.',
  }
}

export function checkACP(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q21_internet_access === 'broadband') return null

  const onQualifyingProgram =
    hasBenefit(a, 'medicaid') || hasBenefit(a, 'snap') || hasBenefit(a, 'ssi')

  // 200% FPL ~$2,489/mo
  const incomeCheck = checkMonthlyIncome(a.q3_income, 2489)
  if (incomeCheck === 'ineligible' && !onQualifyingProgram) return null

  return {
    programId: 'acp',
    programName: 'Affordable Connectivity Program (ACP)',
    tier: 5, tierName: 'Telecom and Digital Access',
    status: onQualifyingProgram ? 'eligible' : (incomeCheck !== 'ineligible' ? 'likely_eligible' : 'needs_verification'),
    estimatedMonthlyValue: 30,
    estimatedAnnualValue: 360,
    priority: 2,
    actionLabel: 'Apply for ACP',
    notes: 'Up to $30/month off internet service. Automatic if enrolled in Medicaid/SNAP/SSI.',
  }
}

// ── Tier 6 — Health and Prescription Assistance ───────────────────────────────

export function checkPatientAssistancePrograms(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q8_rx_difficulty === 'no' || a.q8_rx_difficulty === 'no_medications') return null

  return {
    programId: 'patient_assistance',
    programName: 'Patient Assistance Programs (PAPs)',
    tier: 6, tierName: 'Health and Prescription Assistance',
    status: 'needs_verification',
    estimatedMonthlyValue: 250,
    estimatedAnnualValue: 3000,
    priority: 2,
    actionLabel: 'Search NeedyMeds.org for Each Medication',
    notes: 'Every major pharmaceutical manufacturer has a free drug program. Also check GoodRx for immediate savings.',
  }
}

export function checkGeorgiaCares(a: ScreenerAnswers): EligibilityResult | null {
  const onMedicare = hasBenefit(a, 'medicare_a') || hasBenefit(a, 'medicare_b') || isAge65Plus(a)
  if (!onMedicare) return null

  return {
    programId: 'georgia_cares',
    programName: 'GeorgiaCares Medicare Counseling',
    tier: 6, tierName: 'Health and Prescription Assistance',
    status: 'eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 2,
    actionLabel: 'Schedule GeorgiaCares Counseling',
    notes: 'Free Medicare plan review. Critical during open enrollment Oct 15–Dec 7. Can identify better plan options.',
  }
}

// ── Tier 7 — Legal and Safety ─────────────────────────────────────────────────

export function checkPOADirective(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q22_legal_docs === 'both') return null

  return {
    programId: 'poa_directive',
    programName: 'Power of Attorney / Healthcare Directive',
    tier: 7, tierName: 'Legal and Safety',
    status: 'needs_verification',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 2,
    actionLabel: 'Complete Georgia Advance Directive for Healthcare',
    notes: 'Free Georgia form — needs two witnesses. Navigator provides the form and explains it. Encourage family proxy to be involved.',
  }
}

export function checkGeorgiaLegalServices(a: ScreenerAnswers): EligibilityResult | null {
  if (!isAge60Plus(a)) return null
  const hasLegalNeed =
    a.q22_legal_docs !== 'both' ||
    a.q23_exploitation !== 'no' ||
    a.q19_prior_va === 'denied'

  if (!hasLegalNeed) return null

  const isUrgent = a.q23_exploitation !== 'no'

  return {
    programId: 'georgia_legal',
    programName: 'Georgia Legal Services',
    tier: 7, tierName: 'Legal and Safety',
    status: 'eligible',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: isUrgent ? 1 : 2,
    actionLabel: 'Refer to Georgia Legal Services — 1-800-498-9469',
    notes: 'Free for seniors 60+. Covers wills, POA, eviction defense, benefits appeals, VA claims.',
  }
}

export function checkElderAbuse(a: ScreenerAnswers): EligibilityResult | null {
  if (a.q23_exploitation === 'no') return null

  return {
    programId: 'elder_abuse',
    programName: 'Elder Abuse / Financial Exploitation Response',
    tier: 7, tierName: 'Legal and Safety',
    status: 'needs_verification',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 1,
    actionLabel: 'Contact Georgia Elder Abuse Hotline — 1-866-552-4464',
    notes: 'URGENT — Navigator must flag to Admin immediately. Do not investigate alone. Georgia Adult Protective Services investigates financial exploitation.',
  }
}

export function checkSSRepPayee(a: ScreenerAnswers): EligibilityResult | null {
  const cognitiveOrPhysical =
    a.q14_adl_help === 'significant' && (a.q13_chronic_conditions !== 'no' || a.q15_mobility !== 'no')
  if (!cognitiveOrPhysical) return null
  if (!hasBenefit(a, 'social_security') && !hasBenefit(a, 'ssi')) return null

  return {
    programId: 'ss_rep_payee',
    programName: 'Social Security Representative Payee',
    tier: 7, tierName: 'Legal and Safety',
    status: 'needs_verification',
    estimatedMonthlyValue: 0,
    estimatedAnnualValue: 0,
    priority: 2,
    actionLabel: 'Discuss Representative Payee with Family Proxy',
    notes: 'Allows a trusted person to manage Social Security benefits for someone who cannot. Must be approved by SSA.',
  }
}

// ── Master runner ─────────────────────────────────────────────────────────────

const PROGRAM_CHECKERS = [
  checkSNAP,
  checkMedicaid,
  checkMedicarePartA,
  checkMedicarePartB,
  checkMedicareSavingsProgram,
  checkExtraHelp,
  checkSSI,
  checkSocialSecurityRSDI,
  checkGeorgiaWaiver,
  checkCCSP,
  checkLIHEAP,
  checkWeatherization,
  checkFarmersMarket,
  checkPropertyTaxExemption,
  checkGeorgiaSHIP,
  checkVAPension,
  checkVAAidAndAttendance,
  checkVAHealthcare,
  checkSurvivorsPension,
  checkSection8,
  checkUSDA504,
  checkRampProgram,
  checkLifeline,
  checkACP,
  checkPatientAssistancePrograms,
  checkGeorgiaCares,
  checkPOADirective,
  checkGeorgiaLegalServices,
  checkElderAbuse,
  checkSSRepPayee,
]

export function runAllPrograms(answers: ScreenerAnswers): EligibilityResult[] {
  const results: EligibilityResult[] = []
  for (const check of PROGRAM_CHECKERS) {
    const r = check(answers)
    if (r) results.push(r)
  }
  // Sort: priority 1 first, then by estimated annual value descending
  return results.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return b.estimatedAnnualValue - a.estimatedAnnualValue
  })
}

export function calcEstimatedAnnualValue(results: EligibilityResult[]): number {
  return results
    .filter(r => r.status === 'eligible' || r.status === 'likely_eligible')
    .reduce((sum, r) => sum + r.estimatedAnnualValue, 0)
}

// ── Age helper ────────────────────────────────────────────────────────────────

export function getAgeFromDob(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

export function ageToGroup(age: number): AgeGroup {
  if (age < 60) return 'under_60'
  if (age < 65) return '60_64'
  if (age < 75) return '65_74'
  return '75_plus'
}

// ── Question definitions (for screener UI) ────────────────────────────────────

export type QuestionType = 'single' | 'multi_select'

export interface ScreenerQuestion {
  id:         keyof ScreenerAnswers
  section:    string
  type:       QuestionType
  text:       (name: string) => string
  note?:      string
  conditional?: (answers: Partial<ScreenerAnswers>) => boolean
  options:    { value: string; label: string }[]
}

export const SCREENER_QUESTIONS: ScreenerQuestion[] = [
  // Section A — Basic Eligibility
  {
    id: 'q1_age', section: 'Basic Eligibility', type: 'single',
    text: name => `How old is ${name}?`,
    options: [
      { value: 'under_60', label: 'Under 60' },
      { value: '60_64',    label: '60 – 64' },
      { value: '65_74',    label: '65 – 74' },
      { value: '75_plus',  label: '75 or older' },
    ],
  },
  {
    id: 'q2_citizenship', section: 'Basic Eligibility', type: 'single',
    text: name => `Is ${name} a U.S. citizen or qualified immigrant?`,
    note: 'Qualified immigrant includes legal permanent residents, refugees, asylees, and others. If not sure, select Not sure.',
    options: [
      { value: 'citizen',              label: 'Yes — U.S. citizen' },
      { value: 'qualified_immigrant',  label: 'Yes — qualified immigrant' },
      { value: 'not_sure',             label: 'Not sure' },
    ],
  },
  {
    id: 'q3_income', section: 'Basic Eligibility', type: 'single',
    text: name => `What is ${name}'s approximate monthly income from all sources?`,
    options: [
      { value: 'under_500',   label: 'Under $500' },
      { value: '500_900',     label: '$500 – $900' },
      { value: '900_1400',    label: '$900 – $1,400' },
      { value: '1400_2000',   label: '$1,400 – $2,000' },
      { value: 'over_2000',   label: 'Over $2,000' },
      { value: 'not_sure',    label: 'Not sure' },
    ],
  },
  {
    id: 'q4_household_size', section: 'Basic Eligibility', type: 'single',
    text: name => `How many people live in ${name}'s household and share meals?`,
    options: [
      { value: '1',      label: 'Just them (lives alone)' },
      { value: '2',      label: '2 people' },
      { value: '3',      label: '3 people' },
      { value: '4_plus', label: '4 or more people' },
    ],
  },
  {
    id: 'q5_assets', section: 'Basic Eligibility', type: 'single',
    text: name => `Does ${name} own significant assets — property (other than home), savings over $2,000, or investments?`,
    options: [
      { value: 'no',          label: 'No' },
      { value: 'some',        label: 'Yes — some assets' },
      { value: 'significant', label: 'Yes — significant assets' },
      { value: 'not_sure',    label: 'Not sure' },
    ],
  },
  // Section B — Current Benefits
  {
    id: 'q6_current_benefits', section: 'Current Benefits', type: 'multi_select',
    text: name => `Which of these does ${name} currently receive? Select all that apply.`,
    options: [
      { value: 'social_security', label: 'Social Security (retirement or survivor)' },
      { value: 'ssi',             label: 'SSI (Supplemental Security Income)' },
      { value: 'medicaid',        label: 'Medicaid' },
      { value: 'medicare_a',      label: 'Medicare Part A (hospital)' },
      { value: 'medicare_b',      label: 'Medicare Part B (doctor visits)' },
      { value: 'medicare_d',      label: 'Medicare Part D (prescriptions)' },
      { value: 'snap',            label: 'SNAP / food stamps' },
      { value: 'va_benefits',     label: 'VA pension or disability' },
      { value: 'none',            label: 'None of the above' },
      { value: 'not_sure',        label: 'Not sure' },
    ],
  },
  {
    id: 'q7_part_b_premium', section: 'Current Benefits', type: 'single',
    text: name => `Does ${name} currently pay a monthly premium for Medicare Part B?`,
    options: [
      { value: 'yes',          label: 'Yes' },
      { value: 'no',           label: 'No' },
      { value: 'not_enrolled', label: 'Not enrolled in Part B' },
      { value: 'not_sure',     label: 'Not sure' },
    ],
  },
  {
    id: 'q8_rx_difficulty', section: 'Current Benefits', type: 'single',
    text: name => `Does ${name} have difficulty affording prescription medications?`,
    options: [
      { value: 'often',          label: 'Yes — often' },
      { value: 'sometimes',      label: 'Yes — sometimes' },
      { value: 'no',             label: 'No' },
      { value: 'no_medications', label: 'Does not take regular medications' },
    ],
  },
  // Section C — Living Situation
  {
    id: 'q9_housing_type', section: 'Living Situation', type: 'single',
    text: name => `Does ${name} rent or own their home?`,
    options: [
      { value: 'own_mortgage', label: 'Own — paying mortgage' },
      { value: 'own_paid',     label: 'Own — paid off' },
      { value: 'rent',         label: 'Rent' },
      { value: 'family',       label: 'Live with family' },
      { value: 'other',        label: 'Other' },
    ],
  },
  {
    id: 'q10_home_repairs', section: 'Living Situation', type: 'single',
    text: name => `Is ${name}'s home in need of repairs — roof, plumbing, heating, ramps, or safety improvements?`,
    options: [
      { value: 'significant', label: 'Yes — significant repairs needed' },
      { value: 'minor',       label: 'Yes — minor repairs' },
      { value: 'no',          label: 'No' },
      { value: 'not_sure',    label: 'Not sure' },
    ],
  },
  {
    id: 'q11_utility_difficulty', section: 'Living Situation', type: 'single',
    text: name => `Does ${name} have difficulty paying utility bills — electric, gas, water?`,
    options: [
      { value: 'often',     label: 'Yes — often' },
      { value: 'sometimes', label: 'Yes — sometimes' },
      { value: 'no',        label: 'No' },
    ],
  },
  {
    id: 'q12_hvac_status', section: 'Living Situation', type: 'single',
    text: name => `Is ${name}'s home heating or cooling system working properly?`,
    options: [
      { value: 'ok',          label: 'Yes' },
      { value: 'no_heating',  label: 'No — heating issue' },
      { value: 'no_cooling',  label: 'No — cooling issue' },
      { value: 'not_sure',    label: 'Not sure' },
    ],
  },
  // Section D — Health and Functional Status
  {
    id: 'q13_chronic_conditions', section: 'Health and Functional Status', type: 'single',
    text: name => `Does ${name} have a chronic health condition that requires regular medical visits?`,
    options: [
      { value: 'multiple', label: 'Yes — multiple conditions' },
      { value: 'one',      label: 'Yes — one condition' },
      { value: 'no',       label: 'No' },
    ],
  },
  {
    id: 'q14_adl_help', section: 'Health and Functional Status', type: 'single',
    text: name => `Does ${name} need help with daily activities — bathing, dressing, cooking, or managing medications?`,
    options: [
      { value: 'significant', label: 'Yes — significant help needed' },
      { value: 'some',        label: 'Yes — some help needed' },
      { value: 'no',          label: 'No' },
    ],
  },
  {
    id: 'q15_mobility', section: 'Health and Functional Status', type: 'single',
    text: name => `Does ${name} have a disability that limits mobility or daily function?`,
    options: [
      { value: 'wheelchair',      label: 'Yes — uses wheelchair' },
      { value: 'walker_cane',     label: 'Yes — uses walker or cane' },
      { value: 'other_mobility',  label: 'Yes — other mobility limitation' },
      { value: 'no',              label: 'No' },
    ],
  },
  // Section E — Veteran Status
  {
    id: 'q16_veteran_status', section: 'Veteran Status', type: 'single',
    text: name => `Did ${name} serve in the U.S. military?`,
    options: [
      { value: 'veteran', label: 'Yes — veteran' },
      { value: 'active',  label: 'Yes — currently active' },
      { value: 'no',      label: 'No' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    id: 'q17_veteran_era', section: 'Veteran Status', type: 'multi_select',
    conditional: (a) => a.q16_veteran_status === 'veteran',
    text: name => `What era did ${name} serve? Select all that apply.`,
    options: [
      { value: 'wwii',     label: 'World War II' },
      { value: 'korea',    label: 'Korea' },
      { value: 'vietnam',  label: 'Vietnam' },
      { value: 'gulf',     label: 'Gulf War' },
      { value: 'post911',  label: 'Post-9/11' },
      { value: 'other',    label: 'Other' },
    ],
  },
  {
    id: 'q18_surviving_spouse', section: 'Veteran Status', type: 'single',
    text: name => `Is ${name} the surviving spouse of a U.S. military veteran?`,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no',  label: 'No' },
    ],
  },
  {
    id: 'q19_prior_va', section: 'Veteran Status', type: 'single',
    text: name => `Has ${name} ever applied for VA benefits or VA healthcare?`,
    options: [
      { value: 'receiving', label: 'Yes — currently receiving' },
      { value: 'denied',    label: 'Yes — was denied' },
      { value: 'pending',   label: 'Applied but never heard back' },
      { value: 'never',     label: 'Never applied' },
      { value: 'na',        label: 'Not applicable' },
    ],
  },
  // Section F — Digital and Communication Access
  {
    id: 'q20_phone_access', section: 'Digital and Communication Access', type: 'single',
    text: name => `Does ${name} currently have a working cell phone or home phone?`,
    options: [
      { value: 'cell',       label: 'Yes — cell phone' },
      { value: 'home_phone', label: 'Yes — home phone' },
      { value: 'both',       label: 'Yes — both' },
      { value: 'none',       label: 'No phone at all' },
    ],
  },
  {
    id: 'q21_internet_access', section: 'Digital and Communication Access', type: 'single',
    text: name => `Does ${name} have home internet access?`,
    options: [
      { value: 'broadband', label: 'Yes — broadband' },
      { value: 'limited',   label: 'Yes — limited/slow' },
      { value: 'no',        label: 'No' },
    ],
  },
  // Section G — Legal and Safety
  {
    id: 'q22_legal_docs', section: 'Legal and Safety', type: 'single',
    text: name => `Does ${name} have a current Power of Attorney or Healthcare Directive on file?`,
    options: [
      { value: 'both',     label: 'Yes — both' },
      { value: 'one',      label: 'Yes — one of them' },
      { value: 'no',       label: 'No' },
      { value: 'not_sure', label: 'Not sure' },
    ],
  },
  {
    id: 'q23_exploitation', section: 'Legal and Safety', type: 'single',
    text: name => `Is ${name} aware of any financial exploitation or abuse concerns?`,
    note: 'Flag immediately for Navigator attention if yes.',
    options: [
      { value: 'no',          label: 'No concerns' },
      { value: 'possible',    label: 'Yes — possible concern' },
      { value: 'prefer_not',  label: 'Prefer not to say' },
    ],
  },
]

export const TIER_NAMES: Record<number, string> = {
  1: 'Federal Entitlements',
  2: 'Georgia State Programs',
  3: 'Veteran Benefits',
  4: 'Housing and Safety',
  5: 'Telecom and Digital Access',
  6: 'Health and Prescription Assistance',
  7: 'Legal and Safety',
}

// Legacy alias — keeps onboarding wizard working until it's migrated
export type { ScreenerAnswers as LegacyScreenerAnswers }

// Income ranges for display
export const INCOME_RANGES: { value: IncomeRange; label: string }[] = [
  { value: 'under_500',   label: 'Under $500/month' },
  { value: '500_900',     label: '$500 – $900/month' },
  { value: '900_1400',    label: '$900 – $1,400/month' },
  { value: '1400_2000',   label: '$1,400 – $2,000/month' },
  { value: 'over_2000',   label: 'Over $2,000/month' },
  { value: 'not_sure',    label: 'Not sure' },
]
