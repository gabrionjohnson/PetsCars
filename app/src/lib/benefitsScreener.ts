/**
 * Benefits Eligibility Screener — pure utility function.
 * No React or Supabase dependencies. Reusable in onboarding, standalone
 * screener page, and future automated re-screening.
 */

// ---------------------------------------------------------------------------
// Answer types
// ---------------------------------------------------------------------------
export type YesNoNotSure  = 'yes' | 'no' | 'not_sure'
export type YesNoSometimes = 'yes' | 'no' | 'sometimes'
export type VeteranAnswer  = 'yes' | 'yes_surviving_spouse' | 'no'
export type ConnectivityAnswer = 'phone_only' | 'internet_only' | 'both' | 'neither'
export type HousingAnswer = 'rents' | 'owns' | 'lives_with_family'
export type IncomeRange   = 'under_500' | '500_1000' | '1000_1500' | '1500_2000' | 'over_2000'

export interface ScreenerAnswers {
  q1_medicaid:           YesNoNotSure
  q2_medicare:           YesNoNotSure
  q3_social_security:    YesNoNotSure
  q4_veteran:            VeteranAnswer
  q5_food_difficulty:    YesNoSometimes
  q6_utility_difficulty: YesNoSometimes
  q7_connectivity:       ConnectivityAnswer
  q8_disability:         'yes' | 'no'
  q9_housing:            HousingAnswer
  q10_medication:        YesNoSometimes
}

export interface RecommendedProgram {
  id:               string
  name:             string
  description:      string
  estimatedBenefit: string
  priority:         1 | 2 | 3  // 1 = most urgent
  taskCategory:     string      // maps to task_category enum for one-click task creation
}

// ---------------------------------------------------------------------------
// Income threshold helpers
// ---------------------------------------------------------------------------
const UNDER_1500: IncomeRange[] = ['under_500', '500_1000', '1000_1500']
const UNDER_2000: IncomeRange[] = [...UNDER_1500, '1500_2000']

function incomeUnder(income: IncomeRange, threshold: 1500 | 2000): boolean {
  return (threshold === 1500 ? UNDER_1500 : UNDER_2000).includes(income)
}

// ---------------------------------------------------------------------------
// Core scoring function
// Re-exported so it can be unit-tested independently.
// ---------------------------------------------------------------------------
export function scoreScreener(
  answers:  ScreenerAnswers,
  ageYears: number,
  income:   IncomeRange,
): RecommendedProgram[] {
  const out: RecommendedProgram[] = []
  const push = (p: RecommendedProgram) => {
    if (!out.find(x => x.id === p.id)) out.push(p)
  }

  // Q1 — Medicaid
  if (answers.q1_medicaid !== 'yes') {
    push({
      id: 'medicaid', priority: 1,
      name: 'Medicaid',
      description: 'Free or low-cost health coverage for people with limited income.',
      estimatedBenefit: 'Full health insurance with no premiums for eligible individuals',
      taskCategory: 'government_benefits',
    })
  }

  // Q2 — Medicare (age ≥ 65)
  if (answers.q2_medicare !== 'yes' && ageYears >= 65) {
    push({
      id: 'medicare', priority: 1,
      name: 'Medicare',
      description: 'Federal health insurance for adults 65 and older.',
      estimatedBenefit: 'Hospital and medical coverage; Part B premium ~$174/month (2025)',
      taskCategory: 'medicare_insurance',
    })
  }

  // Q3 — Social Security / SSI
  if (answers.q3_social_security !== 'yes') {
    push({
      id: 'social_security', priority: 1,
      name: 'Social Security / SSI',
      description: 'Monthly income for retirees, people with disabilities, and low-income seniors.',
      estimatedBenefit: 'Up to $943/month in SSI (2025) or Social Security based on work history',
      taskCategory: 'government_benefits',
    })
  }

  // Q4 — VA Benefits
  if (answers.q4_veteran !== 'no') {
    push({
      id: 'va_benefits', priority: 1,
      name: 'VA Benefits',
      description: 'Federal benefits for veterans and surviving spouses — healthcare, disability, pension.',
      estimatedBenefit: 'Disability compensation, pension, and healthcare vary by service history',
      taskCategory: 'va_benefits',
    })
    push({
      id: 'va_healthcare', priority: 1,
      name: 'VA Healthcare Enrollment',
      description: 'Free or low-cost healthcare at VA facilities for eligible veterans.',
      estimatedBenefit: 'Primary care, mental health, and prescriptions at VA facilities',
      taskCategory: 'va_benefits',
    })
  }

  // Q5 — SNAP (food + income < $1,500)
  if (answers.q5_food_difficulty !== 'no' && incomeUnder(income, 1500)) {
    push({
      id: 'snap', priority: 1,
      name: 'SNAP (Food Stamps)',
      description: 'Monthly grocery benefits loaded to an EBT card at any participating store.',
      estimatedBenefit: 'Up to $281/month in grocery assistance for a single-person household',
      taskCategory: 'government_benefits',
    })
  }

  // Q6 — LIHEAP (utilities + income < $2,000)
  if (answers.q6_utility_difficulty !== 'no' && incomeUnder(income, 2000)) {
    push({
      id: 'liheap', priority: 2,
      name: 'LIHEAP — Low Income Home Energy Assistance',
      description: 'Helps pay heating and cooling bills and covers emergency energy costs.',
      estimatedBenefit: 'Typically $300–$1,200/year depending on usage and state rates',
      taskCategory: 'utility_broadband',
    })
  }

  // Q7 — Lifeline (phone without internet or no service)
  if (answers.q7_connectivity === 'phone_only' || answers.q7_connectivity === 'neither') {
    push({
      id: 'lifeline', priority: 2,
      name: 'Lifeline — Discounted Phone Service',
      description: 'Up to $9.25/month discount on phone service for eligible households.',
      estimatedBenefit: '$9.25/month off phone bill; some carriers offer free smartphones',
      taskCategory: 'utility_broadband',
    })
  }

  // Q7 — ACP (no internet)
  if (answers.q7_connectivity === 'internet_only' || answers.q7_connectivity === 'neither') {
    push({
      id: 'acp', priority: 2,
      name: 'ACP — Affordable Connectivity Program',
      description: 'Discount on home internet service for eligible households.',
      estimatedBenefit: 'Up to $30/month off internet bills ($75 on Tribal lands)',
      taskCategory: 'utility_broadband',
    })
  }

  // Q8 — Extra Help + Medicaid Waiver (disability)
  if (answers.q8_disability === 'yes') {
    push({
      id: 'extra_help', priority: 2,
      name: 'Extra Help (Medicare Part D)',
      description: 'Reduces prescription drug costs for Medicare recipients with limited income.',
      estimatedBenefit: 'Saves an estimated $5,300/year on prescription drug costs',
      taskCategory: 'medicare_insurance',
    })
    push({
      id: 'medicaid_waiver', priority: 2,
      name: 'Medicaid Waiver / HCBS Program',
      description: 'Home and community-based services to help people with disabilities stay at home.',
      estimatedBenefit: 'In-home care aides and support services',
      taskCategory: 'government_benefits',
    })
  }

  // Q9 — Section 8 / HUD (rents + income < $1,500)
  if (answers.q9_housing === 'rents' && incomeUnder(income, 1500)) {
    push({
      id: 'section8', priority: 3,
      name: 'Section 8 / HUD Housing Assistance',
      description: 'Rental vouchers that cap rent at 30% of household income.',
      estimatedBenefit: 'Rent subsidy typically covers 50–70% of fair market rent in the area',
      taskCategory: 'housing_assistance',
    })
  }

  // Q10 — Extra Help via medication difficulty (if not already added by Q8)
  if (answers.q10_medication !== 'no') {
    push({
      id: 'extra_help', priority: 2,
      name: 'Extra Help (Medicare Part D Low Income Subsidy)',
      description: 'Reduces prescription drug costs for Medicare recipients with limited income.',
      estimatedBenefit: 'Saves an estimated $5,300/year on prescription drug costs',
      taskCategory: 'medicare_insurance',
    })
  }

  return out.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Age helper
// ---------------------------------------------------------------------------
export function getAgeFromDob(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ---------------------------------------------------------------------------
// Question definitions — used by both the screener UI and the onboarding wizard
// ---------------------------------------------------------------------------
export const SCREENER_QUESTIONS = [
  {
    id:      'q1_medicaid' as const,
    text:    (name: string) => `Is ${name} currently enrolled in Medicaid?`,
    options: [
      { value: 'yes',      label: 'Yes' },
      { value: 'no',       label: 'No' },
      { value: 'not_sure', label: 'Not Sure' },
    ],
  },
  {
    id:      'q2_medicare' as const,
    text:    (name: string) => `Is ${name} currently enrolled in Medicare?`,
    options: [
      { value: 'yes',      label: 'Yes' },
      { value: 'no',       label: 'No' },
      { value: 'not_sure', label: 'Not Sure' },
    ],
  },
  {
    id:      'q3_social_security' as const,
    text:    (name: string) => `Is ${name} currently receiving Social Security or SSI payments?`,
    options: [
      { value: 'yes',      label: 'Yes' },
      { value: 'no',       label: 'No' },
      { value: 'not_sure', label: 'Not Sure' },
    ],
  },
  {
    id:      'q4_veteran' as const,
    text:    (name: string) => `Is ${name} a U.S. military veteran or surviving spouse of a veteran?`,
    options: [
      { value: 'yes',                label: 'Yes — Veteran' },
      { value: 'yes_surviving_spouse', label: 'Yes — Surviving Spouse' },
      { value: 'no',                 label: 'No' },
    ],
  },
  {
    id:      'q5_food_difficulty' as const,
    text:    (name: string) => `Does ${name}'s household have difficulty paying for groceries or food?`,
    options: [
      { value: 'yes',       label: 'Yes' },
      { value: 'sometimes', label: 'Sometimes' },
      { value: 'no',        label: 'No' },
    ],
  },
  {
    id:      'q6_utility_difficulty' as const,
    text:    (name: string) => `Does ${name} have difficulty paying utility bills (electric, gas, water)?`,
    options: [
      { value: 'yes',       label: 'Yes' },
      { value: 'sometimes', label: 'Sometimes' },
      { value: 'no',        label: 'No' },
    ],
  },
  {
    id:      'q7_connectivity' as const,
    text:    (name: string) => `Does ${name} currently have a cell phone or home internet service?`,
    options: [
      { value: 'both',          label: 'Both Phone and Internet' },
      { value: 'phone_only',    label: 'Phone Only' },
      { value: 'internet_only', label: 'Internet Only' },
      { value: 'neither',       label: 'Neither' },
    ],
  },
  {
    id:      'q8_disability' as const,
    text:    (name: string) => `Does ${name} have a disability or chronic health condition that limits daily activities?`,
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'no',  label: 'No' },
    ],
  },
  {
    id:      'q9_housing' as const,
    text:    (name: string) => `Does ${name} rent their home?`,
    options: [
      { value: 'rents',             label: 'Yes — Rents' },
      { value: 'owns',              label: 'No — Owns' },
      { value: 'lives_with_family', label: 'No — Lives with Family' },
    ],
  },
  {
    id:      'q10_medication' as const,
    text:    (name: string) => `Has ${name} had trouble affording prescription medications in the past 12 months?`,
    options: [
      { value: 'yes',       label: 'Yes' },
      { value: 'sometimes', label: 'Sometimes' },
      { value: 'no',        label: 'No' },
    ],
  },
] as const

export type QuestionId = typeof SCREENER_QUESTIONS[number]['id']

export const INCOME_RANGES: { value: IncomeRange; label: string }[] = [
  { value: 'under_500',  label: 'Under $500/month' },
  { value: '500_1000',   label: '$500 – $1,000/month' },
  { value: '1000_1500',  label: '$1,000 – $1,500/month' },
  { value: '1500_2000',  label: '$1,500 – $2,000/month' },
  { value: 'over_2000',  label: 'Over $2,000/month' },
]
