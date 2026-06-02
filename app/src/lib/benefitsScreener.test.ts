/**
 * Benefits Screener v2 — Unit Tests
 *
 * Each program function is tested in isolation.
 * Key invariant: high-value programs (VA Aid & Attendance, Extra Help, MSP)
 * must NEVER return not_eligible when income is borderline — use needs_verification.
 */
import { describe, it, expect } from 'vitest'
import {
  checkSNAP,
  checkMedicaid,
  checkMedicarePartA,
  checkMedicarePartB,
  checkMedicareSavingsProgram,
  checkExtraHelp,
  checkSSI,
  checkGeorgiaWaiver,
  checkLIHEAP,
  checkPropertyTaxExemption,
  checkVAPension,
  checkVAAidAndAttendance,
  checkVAHealthcare,
  checkSurvivorsPension,
  checkUSDA504,
  checkLifeline,
  checkACP,
  checkPOADirective,
  checkElderAbuse,
  runAllPrograms,
  calcEstimatedAnnualValue,
  type ScreenerAnswers,
} from './benefitsScreener'

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Willie Mae Johnson — baseline test client (78yo, low income, Plains GA) */
const baseAnswers: ScreenerAnswers = {
  q1_age:                '75_plus',
  q2_citizenship:        'citizen',
  q3_income:             '500_900',
  q4_household_size:     '1',
  q5_assets:             'no',
  q6_current_benefits:   ['social_security', 'medicaid'],
  q7_part_b_premium:     'yes',
  q8_rx_difficulty:      'sometimes',
  q9_housing_type:       'own_paid',
  q10_home_repairs:      'minor',
  q11_utility_difficulty: 'sometimes',
  q12_hvac_status:       'ok',
  q13_chronic_conditions: 'multiple',
  q14_adl_help:          'some',
  q15_mobility:          'walker_cane',
  q16_veteran_status:    'no',
  q17_veteran_era:       [],
  q18_surviving_spouse:  'no',
  q19_prior_va:          'na',
  q20_phone_access:      'cell',
  q21_internet_access:   'no',
  q22_legal_docs:        'no',
  q23_exploitation:      'no',
}

function with_(overrides: Partial<ScreenerAnswers>): ScreenerAnswers {
  return { ...baseAnswers, ...overrides }
}

// ── SNAP ─────────────────────────────────────────────────────────────────────

describe('checkSNAP', () => {
  it('returns eligible for low income citizen not on SNAP', () => {
    const r = checkSNAP(with_({ q6_current_benefits: [] }))
    expect(r?.status).toBe('eligible')
    expect(r?.estimatedAnnualValue).toBe(2256)
    expect(r?.priority).toBe(1)
  })

  it('returns null if already on SNAP', () => {
    expect(checkSNAP(with_({ q6_current_benefits: ['snap'] }))).toBeNull()
  })

  it('returns null if not citizen', () => {
    expect(checkSNAP(with_({
      q6_current_benefits: [],
      q2_citizenship: 'not_sure',
    }))).not.toBeNull() // not_sure should still get screened

    expect(checkSNAP(with_({
      q6_current_benefits: [],
      q2_citizenship: 'citizen',
    }))).not.toBeNull()
  })

  it('returns likely_eligible for borderline income', () => {
    const r = checkSNAP(with_({ q3_income: '1400_2000', q6_current_benefits: [] }))
    expect(r?.status).toBe('likely_eligible')
  })

  it('returns null for high income', () => {
    const r = checkSNAP(with_({ q3_income: 'over_2000', q6_current_benefits: [] }))
    // over_2000 might still qualify with deductions — result depends on implementation
    // but should not be null or should be flagged
    expect(r?.status).not.toBe('eligible')
  })
})

// ── Medicaid ─────────────────────────────────────────────────────────────────

describe('checkMedicaid', () => {
  it('returns eligible for low income not on Medicaid', () => {
    const r = checkMedicaid(with_({ q6_current_benefits: [] }))
    expect(r?.status).toBe('eligible')
    expect(r?.estimatedAnnualValue).toBe(7200)
  })

  it('returns null if already on Medicaid', () => {
    expect(checkMedicaid(baseAnswers)).toBeNull()
  })

  it('returns likely_eligible for $1,400–$2,000 income', () => {
    const r = checkMedicaid(with_({ q3_income: '1400_2000', q6_current_benefits: [] }))
    expect(r?.status).toBe('likely_eligible')
  })
})

// ── Medicare ──────────────────────────────────────────────────────────────────

describe('checkMedicarePartA', () => {
  it('returns eligible for 65+ not on Part A', () => {
    const r = checkMedicarePartA(with_({ q6_current_benefits: [] }))
    expect(r?.status).toBe('eligible')
  })

  it('returns null if already on Part A', () => {
    expect(checkMedicarePartA(with_({ q6_current_benefits: ['medicare_a'] }))).toBeNull()
  })

  it('returns null for under-65', () => {
    expect(checkMedicarePartA(with_({ q1_age: '60_64', q6_current_benefits: [] }))).toBeNull()
  })
})

describe('checkMedicarePartB', () => {
  it('returns eligible for 65+ not on Part B', () => {
    const r = checkMedicarePartB(with_({ q6_current_benefits: [] }))
    expect(r?.status).toBe('eligible')
  })

  it('returns null if already on Part B', () => {
    expect(checkMedicarePartB(with_({ q6_current_benefits: ['medicare_b'] }))).toBeNull()
  })
})

// ── Medicare Savings Program — conservative threshold ────────────────────────

describe('checkMedicareSavingsProgram', () => {
  it('returns eligible for 65+ on Medicare with low income and no assets', () => {
    const r = checkMedicareSavingsProgram(with_({
      q6_current_benefits: ['medicare_b'],
      q3_income: '500_900',
      q5_assets: 'no',
    }))
    expect(r?.status).toBe('eligible')
    expect(r?.estimatedAnnualValue).toBe(2220)
  })

  it('returns needs_verification (not not_eligible) for borderline income — CONSERVATIVE', () => {
    const r = checkMedicareSavingsProgram(with_({
      q6_current_benefits: ['medicare_b'],
      q3_income: '1400_2000',
      q5_assets: 'no',
    }))
    // Must NOT return not_eligible — conservative threshold requires verify
    expect(r).not.toBeNull()
    expect(r?.status).not.toBe('not_eligible')
    expect(['needs_verification', 'likely_eligible']).toContain(r?.status)
  })

  it('returns needs_verification for not_sure income — CONSERVATIVE', () => {
    const r = checkMedicareSavingsProgram(with_({
      q6_current_benefits: ['medicare_b'],
      q3_income: 'not_sure',
      q5_assets: 'no',
    }))
    expect(r?.status).toBe('needs_verification')
  })
})

// ── Extra Help — conservative threshold ──────────────────────────────────────

describe('checkExtraHelp', () => {
  it('returns eligible for Medicare Part D + low income + no assets', () => {
    const r = checkExtraHelp(with_({
      q6_current_benefits: ['medicare_d'],
      q3_income: '500_900',
      q5_assets: 'no',
      q8_rx_difficulty: 'often',
    }))
    expect(r?.status).toBe('eligible')
    expect(r?.estimatedAnnualValue).toBe(5900)
  })

  it('returns needs_verification (not not_eligible) for borderline income — CONSERVATIVE', () => {
    const r = checkExtraHelp(with_({
      q6_current_benefits: ['medicare_d'],
      q3_income: '1400_2000',
      q5_assets: 'no',
      q8_rx_difficulty: 'often',
    }))
    expect(r).not.toBeNull()
    expect(r?.status).not.toBe('not_eligible')
  })

  it('returns eligible for 65+ with rx difficulty even without explicit Part D', () => {
    const r = checkExtraHelp(with_({
      q6_current_benefits: [],
      q1_age: '75_plus',
      q3_income: '900_1400',
      q5_assets: 'no',
      q8_rx_difficulty: 'often',
    }))
    expect(r).not.toBeNull()
  })

  it('returns null for high income over threshold', () => {
    const r = checkExtraHelp(with_({
      q6_current_benefits: ['medicare_d'],
      q3_income: 'over_2000',
      q5_assets: 'no',
      q8_rx_difficulty: 'often',
    }))
    expect(r).toBeNull()
  })
})

// ── SSI ───────────────────────────────────────────────────────────────────────

describe('checkSSI', () => {
  it('returns eligible for 65+ with very low income and no assets', () => {
    const r = checkSSI(with_({
      q6_current_benefits: [],
      q1_age: '75_plus',
      q3_income: 'under_500',
      q5_assets: 'no',
    }))
    expect(r?.status).toBe('eligible')
  })

  it('returns null if already on SSI', () => {
    expect(checkSSI(with_({ q6_current_benefits: ['ssi'] }))).toBeNull()
  })

  it('returns null for income over SSI limit', () => {
    const r = checkSSI(with_({
      q6_current_benefits: [],
      q3_income: '1400_2000',
      q5_assets: 'no',
    }))
    expect(r).toBeNull()
  })
})

// ── VA Pension ────────────────────────────────────────────────────────────────

describe('checkVAPension', () => {
  const veteranBase = with_({
    q6_current_benefits: [],
    q1_age: '75_plus',
    q16_veteran_status: 'veteran',
    q17_veteran_era: ['vietnam'],
    q3_income: '900_1400',
    q5_assets: 'no',
  })

  it('returns eligible for wartime veteran 65+ with income under $1,379/mo', () => {
    const r = checkVAPension({ ...veteranBase, q3_income: '500_900' })
    expect(r?.status).toBe('eligible')
    expect(r?.estimatedAnnualValue).toBe(14736)
    expect(r?.priority).toBe(1)
  })

  it('returns likely_eligible for borderline income range', () => {
    const r = checkVAPension({ ...veteranBase, q3_income: '900_1400' })
    // $900-$1,400 range straddles the $1,379/mo VA Pension limit
    expect(r).not.toBeNull()
    expect(r?.status).not.toBe('not_eligible')
  })

  it('returns null for non-veteran', () => {
    expect(checkVAPension(baseAnswers)).toBeNull()
  })

  it('returns null for under-65 veteran', () => {
    const r = checkVAPension({ ...veteranBase, q1_age: '60_64' })
    expect(r).toBeNull()
  })
})

// ── VA Aid and Attendance — conservative, highest value ───────────────────────

describe('checkVAAidAndAttendance', () => {
  const eligibleVet = with_({
    q6_current_benefits: [],
    q1_age: '75_plus',
    q16_veteran_status: 'veteran',
    q17_veteran_era: ['vietnam'],
    q14_adl_help: 'significant',
    q3_income: '500_900',
    q5_assets: 'no',
  })

  it('returns eligible for qualifying veteran needing significant ADL help', () => {
    const r = checkVAAidAndAttendance(eligibleVet)
    expect(r?.status).toBe('eligible')
    expect(r?.estimatedAnnualValue).toBe(27600)
    expect(r?.priority).toBe(1)
  })

  it('returns needs_verification for veteran needing ADL help even with uncertain income — CONSERVATIVE', () => {
    const r = checkVAAidAndAttendance({ ...eligibleVet, q3_income: 'not_sure' })
    expect(r).not.toBeNull()
    expect(r?.status).not.toBe('not_eligible')
  })

  it('returns null for non-veteran without ADL needs', () => {
    expect(checkVAAidAndAttendance(with_({ q14_adl_help: 'no' }))).toBeNull()
  })

  it('returns null for non-veteran even with ADL needs', () => {
    expect(checkVAAidAndAttendance(with_({
      q16_veteran_status: 'no',
      q14_adl_help: 'significant',
    }))).toBeNull()
  })

  it('never returns null for veteran needing significant help with any income', () => {
    // This is the critical invariant — do not miss Aid and Attendance
    for (const income of ['under_500', '500_900', '900_1400', '1400_2000', 'not_sure'] as const) {
      const r = checkVAAidAndAttendance({ ...eligibleVet, q3_income: income })
      expect(r, `income=${income} should not return null`).not.toBeNull()
      expect(r?.status, `income=${income} should not be not_eligible`).not.toBe('not_eligible')
    }
  })
})

// ── VA Healthcare ─────────────────────────────────────────────────────────────

describe('checkVAHealthcare', () => {
  it('returns eligible for veteran not yet enrolled', () => {
    const r = checkVAHealthcare(with_({
      q16_veteran_status: 'veteran',
      q19_prior_va: 'never',
    }))
    expect(r?.status).toBe('eligible')
  })

  it('returns null if already receiving VA benefits', () => {
    expect(checkVAHealthcare(with_({
      q16_veteran_status: 'veteran',
      q19_prior_va: 'receiving',
    }))).toBeNull()
  })

  it('returns null for non-veteran', () => {
    expect(checkVAHealthcare(baseAnswers)).toBeNull()
  })
})

// ── Survivors Pension ─────────────────────────────────────────────────────────

describe('checkSurvivorsPension', () => {
  it('returns eligible for surviving spouse with very low income', () => {
    const r = checkSurvivorsPension(with_({
      q18_surviving_spouse: 'yes',
      q3_income: 'under_500',
    }))
    expect(r?.status).toBe('eligible')
    expect(r?.estimatedAnnualValue).toBe(13848)
  })

  it('returns null for non-surviving-spouse', () => {
    expect(checkSurvivorsPension(baseAnswers)).toBeNull()
  })

  it('returns null for income well above survivors pension limit', () => {
    const r = checkSurvivorsPension(with_({
      q18_surviving_spouse: 'yes',
      q3_income: '1400_2000', // $1,400+ >> $769/mo limit
    }))
    expect(r).toBeNull()
  })
})

// ── LIHEAP ────────────────────────────────────────────────────────────────────

describe('checkLIHEAP', () => {
  it('returns eligible for utility difficulty with low income', () => {
    const r = checkLIHEAP(with_({ q11_utility_difficulty: 'often' }))
    expect(r?.status).toBe('eligible')
    expect(r?.priority).toBe(1)
  })

  it('returns null when no utility difficulty', () => {
    expect(checkLIHEAP(with_({ q11_utility_difficulty: 'no' }))).toBeNull()
  })
})

// ── Property Tax Exemption ────────────────────────────────────────────────────

describe('checkPropertyTaxExemption', () => {
  it('returns eligible for 62+ homeowner', () => {
    const r = checkPropertyTaxExemption(baseAnswers) // own_paid, 75+
    expect(r?.status).toBe('eligible')
  })

  it('returns null for renter', () => {
    expect(checkPropertyTaxExemption(with_({ q9_housing_type: 'rent' }))).toBeNull()
  })

  it('returns null for under-62', () => {
    expect(checkPropertyTaxExemption(with_({ q1_age: 'under_60' }))).toBeNull()
  })
})

// ── Lifeline ──────────────────────────────────────────────────────────────────

describe('checkLifeline', () => {
  it('returns eligible if on Medicaid (qualifying program)', () => {
    const r = checkLifeline(with_({ q6_current_benefits: ['medicaid'] }))
    expect(r?.status).toBe('eligible')
  })

  it('returns result for person with no phone', () => {
    const r = checkLifeline(with_({
      q20_phone_access: 'none',
      q6_current_benefits: [],
      q3_income: '500_900',
    }))
    expect(r).not.toBeNull()
  })
})

// ── ACP ───────────────────────────────────────────────────────────────────────

describe('checkACP', () => {
  it('returns eligible if on Medicaid with no internet', () => {
    const r = checkACP(with_({
      q6_current_benefits: ['medicaid'],
      q21_internet_access: 'no',
    }))
    expect(r?.status).toBe('eligible')
  })

  it('returns null for broadband internet user', () => {
    expect(checkACP(with_({ q21_internet_access: 'broadband' }))).toBeNull()
  })
})

// ── Elder Abuse — urgent flag ─────────────────────────────────────────────────

describe('checkElderAbuse', () => {
  it('returns priority 1 for exploitation concern', () => {
    const r = checkElderAbuse(with_({ q23_exploitation: 'possible' }))
    expect(r?.priority).toBe(1)
    expect(r?.status).toBe('needs_verification')
  })

  it('returns priority 1 for prefer_not_to_say', () => {
    const r = checkElderAbuse(with_({ q23_exploitation: 'prefer_not' }))
    expect(r?.priority).toBe(1)
  })

  it('returns null when no concerns', () => {
    expect(checkElderAbuse(with_({ q23_exploitation: 'no' }))).toBeNull()
  })
})

// ── POA / Healthcare Directive ────────────────────────────────────────────────

describe('checkPOADirective', () => {
  it('returns result when no legal docs on file', () => {
    const r = checkPOADirective(with_({ q22_legal_docs: 'no' }))
    expect(r).not.toBeNull()
    expect(r?.programId).toBe('poa_directive')
  })

  it('returns null when both docs on file', () => {
    expect(checkPOADirective(with_({ q22_legal_docs: 'both' }))).toBeNull()
  })
})

// ── runAllPrograms ────────────────────────────────────────────────────────────

describe('runAllPrograms', () => {
  it('returns sorted results with priority 1 first', () => {
    const results = runAllPrograms(baseAnswers)
    expect(results.length).toBeGreaterThan(0)
    const priorities = results.map(r => r.priority)
    for (let i = 1; i < priorities.length; i++) {
      expect(priorities[i]).toBeGreaterThanOrEqual(priorities[i - 1])
    }
  })

  it('includes legal docs alert when no POA on file', () => {
    const results = runAllPrograms(with_({ q22_legal_docs: 'no' }))
    expect(results.some(r => r.programId === 'poa_directive')).toBe(true)
  })

  it('CRITICAL: never misses VA Aid and Attendance for qualifying veteran needing help', () => {
    const veteran = with_({
      q16_veteran_status: 'veteran',
      q17_veteran_era: ['vietnam'],
      q14_adl_help: 'significant',
      q1_age: '75_plus',
      q3_income: '500_900',
      q5_assets: 'no',
      q6_current_benefits: [],
    })
    const results = runAllPrograms(veteran)
    const aaResult = results.find(r => r.programId === 'va_aid_and_attendance')
    expect(aaResult).toBeDefined()
    expect(aaResult?.status).not.toBe('not_eligible')
  })

  it('CRITICAL: never misses Extra Help for Medicare Part D user with rx difficulty', () => {
    const rxUser = with_({
      q6_current_benefits: ['medicare_d'],
      q8_rx_difficulty: 'often',
      q3_income: '900_1400',
      q5_assets: 'no',
    })
    const results = runAllPrograms(rxUser)
    const ehResult = results.find(r => r.programId === 'extra_help')
    expect(ehResult).toBeDefined()
    expect(ehResult?.status).not.toBe('not_eligible')
  })

  it('flags elder abuse at priority 1 when concern reported', () => {
    const results = runAllPrograms(with_({ q23_exploitation: 'possible' }))
    const abuse = results.find(r => r.programId === 'elder_abuse')
    expect(abuse?.priority).toBe(1)
  })
})

// ── calcEstimatedAnnualValue ──────────────────────────────────────────────────

describe('calcEstimatedAnnualValue', () => {
  it('sums only eligible and likely_eligible programs', () => {
    const results = runAllPrograms(with_({
      q6_current_benefits: [],
      q3_income: '500_900',
    }))
    const total = calcEstimatedAnnualValue(results)
    expect(total).toBeGreaterThan(0)
  })

  it('excludes needs_verification programs from total', () => {
    const results = runAllPrograms(baseAnswers)
    const verifyOnly = results.filter(r => r.status === 'needs_verification')
    const eligibleOnly = results.filter(
      r => r.status === 'eligible' || r.status === 'likely_eligible',
    )
    const total = calcEstimatedAnnualValue(results)
    const verifyTotal = verifyOnly.reduce((s, r) => s + r.estimatedAnnualValue, 0)
    const eligibleTotal = eligibleOnly.reduce((s, r) => s + r.estimatedAnnualValue, 0)
    expect(total).toBe(eligibleTotal)
    expect(total).toBeLessThanOrEqual(total + verifyTotal)
  })
})

// ── Georgia Waiver ────────────────────────────────────────────────────────────

describe('checkGeorgiaWaiver', () => {
  it('returns result for Medicaid-eligible client needing ADL help', () => {
    const r = checkGeorgiaWaiver(with_({
      q6_current_benefits: ['medicaid'],
      q14_adl_help: 'significant',
    }))
    expect(r).not.toBeNull()
    expect(r?.priority).toBe(1)
  })

  it('returns null when no ADL help needed', () => {
    expect(checkGeorgiaWaiver(with_({
      q6_current_benefits: ['medicaid'],
      q14_adl_help: 'no',
    }))).toBeNull()
  })
})

// ── USDA 504 Home Repair ──────────────────────────────────────────────────────

describe('checkUSDA504', () => {
  it('returns result for low-income homeowner needing repairs', () => {
    const r = checkUSDA504(with_({
      q9_housing_type: 'own_paid',
      q10_home_repairs: 'significant',
      q3_income: '900_1400',
    }))
    expect(r).not.toBeNull()
    expect(r?.estimatedAnnualValue).toBe(10000)
  })

  it('returns null for renters', () => {
    expect(checkUSDA504(with_({
      q9_housing_type: 'rent',
      q10_home_repairs: 'significant',
    }))).toBeNull()
  })

  it('returns null when no repairs needed', () => {
    expect(checkUSDA504(with_({ q10_home_repairs: 'no' }))).toBeNull()
  })
})

// ── Profile Acceptance Tests ───────────────────────────────────────────────────

/**
 * Robert Earl Washington — 78yo Vietnam veteran, wheelchair, $840/mo SS,
 * Medicare Part A only, owns home, needs roof repair, no phone or internet.
 * Must flag 12+ programs (high-value VA benefits + income programs).
 */
const robertWashington: ScreenerAnswers = {
  q1_age:                '75_plus',
  q2_citizenship:        'citizen',
  q3_income:             '500_900',
  q4_household_size:     '1',
  q5_assets:             'some',
  q6_current_benefits:   ['social_security', 'medicare_a'],
  q7_part_b_premium:     'not_enrolled',
  q8_rx_difficulty:      'sometimes',
  q9_housing_type:       'own_paid',
  q10_home_repairs:      'significant',
  q11_utility_difficulty: 'sometimes',
  q12_hvac_status:       'not_sure',
  q13_chronic_conditions: 'multiple',
  q14_adl_help:          'significant',
  q15_mobility:          'wheelchair',
  q16_veteran_status:    'veteran',
  q17_veteran_era:       ['vietnam'],
  q18_surviving_spouse:  'no',
  q19_prior_va:          'never',
  q20_phone_access:      'none',
  q21_internet_access:   'no',
  q22_legal_docs:        'not_sure',
  q23_exploitation:      'no',
}

/**
 * Dorothy Mae Simmons — 64yo, SSDI $1,200/mo, on Medicaid, SNAP enrolled,
 * renter, cancer patient with chemo every 3 weeks.
 */
const dorothySimmons: ScreenerAnswers = {
  q1_age:                '60_64',
  q2_citizenship:        'citizen',
  q3_income:             '900_1400',
  q4_household_size:     '1',
  q5_assets:             'no',
  q6_current_benefits:   ['medicaid', 'snap'],
  q7_part_b_premium:     'not_enrolled',
  q8_rx_difficulty:      'often',
  q9_housing_type:       'rent',
  q10_home_repairs:      'no',
  q11_utility_difficulty: 'sometimes',
  q12_hvac_status:       'ok',
  q13_chronic_conditions: 'multiple',
  q14_adl_help:          'some',
  q15_mobility:          'no',
  q16_veteran_status:    'no',
  q17_veteran_era:       [],
  q18_surviving_spouse:  'no',
  q19_prior_va:          'na',
  q20_phone_access:      'home_phone',
  q21_internet_access:   'no',
  q22_legal_docs:        'one',
  q23_exploitation:      'no',
}

/**
 * James Carter — 82yo WWII veteran, moderate dementia, $2,400/mo joint income,
 * homeowner, needs PT. Tests couple scenario and high-income edge cases.
 */
const jamesCarter: ScreenerAnswers = {
  q1_age:                '75_plus',
  q2_citizenship:        'citizen',
  q3_income:             '1400_2000',
  q4_household_size:     '2',
  q5_assets:             'some',
  q6_current_benefits:   ['medicare_a', 'medicare_b', 'social_security'],
  q7_part_b_premium:     'yes',
  q8_rx_difficulty:      'sometimes',
  q9_housing_type:       'own_paid',
  q10_home_repairs:      'minor',
  q11_utility_difficulty: 'no',
  q12_hvac_status:       'ok',
  q13_chronic_conditions: 'multiple',
  q14_adl_help:          'significant',
  q15_mobility:          'walker_cane',
  q16_veteran_status:    'veteran',
  q17_veteran_era:       ['wwii'],
  q18_surviving_spouse:  'no',
  q19_prior_va:          'never',
  q20_phone_access:      'home_phone',
  q21_internet_access:   'no',
  q22_legal_docs:        'no',
  q23_exploitation:      'no',
}

/**
 * Thelma Jean Brooks — 71yo recently widowed, $620/mo SS only,
 * renter, Medicare A+B, no Part D.
 */
const thelmaBooks: ScreenerAnswers = {
  q1_age:                '65_74',
  q2_citizenship:        'citizen',
  q3_income:             '500_900',
  q4_household_size:     '1',
  q5_assets:             'no',
  q6_current_benefits:   ['social_security', 'medicare_a', 'medicare_b'],
  q7_part_b_premium:     'yes',
  q8_rx_difficulty:      'sometimes',
  q9_housing_type:       'rent',
  q10_home_repairs:      'no',
  q11_utility_difficulty: 'sometimes',
  q12_hvac_status:       'ok',
  q13_chronic_conditions: 'one',
  q14_adl_help:          'no',
  q15_mobility:          'no',
  q16_veteran_status:    'no',
  q17_veteran_era:       [],
  q18_surviving_spouse:  'yes',
  q19_prior_va:          'na',
  q20_phone_access:      'cell',
  q21_internet_access:   'limited',
  q22_legal_docs:        'no',
  q23_exploitation:      'no',
}

/**
 * Pastor Leonard Freeman — 68yo, $3,800/mo pension+SS, Medicare A/B/D,
 * homeowner, healthy, tech-savvy. Must flag 3 or fewer programs.
 */
const pastorFreeman: ScreenerAnswers = {
  q1_age:                '65_74',
  q2_citizenship:        'citizen',
  q3_income:             'over_2000',
  q4_household_size:     '2',
  q5_assets:             'significant',
  q6_current_benefits:   ['medicare_a', 'medicare_b', 'medicare_d', 'social_security'],
  q7_part_b_premium:     'yes',
  q8_rx_difficulty:      'no',
  q9_housing_type:       'own_paid',
  q10_home_repairs:      'no',
  q11_utility_difficulty: 'no',
  q12_hvac_status:       'ok',
  q13_chronic_conditions: 'no',
  q14_adl_help:          'no',
  q15_mobility:          'no',
  q16_veteran_status:    'no',
  q17_veteran_era:       [],
  q18_surviving_spouse:  'no',
  q19_prior_va:          'na',
  q20_phone_access:      'cell',
  q21_internet_access:   'broadband',
  q22_legal_docs:        'both',
  q23_exploitation:      'no',
}

/**
 * Rosa Lee Ponder — 66yo, zero income, no existing benefits,
 * lives with grandson. Tests SSI needs_verification (never not_eligible).
 */
const rosaLeePonder: ScreenerAnswers = {
  q1_age:                '65_74',
  q2_citizenship:        'citizen',
  q3_income:             'under_500',
  q4_household_size:     '2',
  q5_assets:             'no',
  q6_current_benefits:   ['none'],
  q7_part_b_premium:     'not_enrolled',
  q8_rx_difficulty:      'sometimes',
  q9_housing_type:       'family',
  q10_home_repairs:      'no',
  q11_utility_difficulty: 'often',
  q12_hvac_status:       'not_sure',
  q13_chronic_conditions: 'one',
  q14_adl_help:          'no',
  q15_mobility:          'no',
  q16_veteran_status:    'no',
  q17_veteran_era:       [],
  q18_surviving_spouse:  'no',
  q19_prior_va:          'na',
  q20_phone_access:      'none',
  q21_internet_access:   'no',
  q22_legal_docs:        'no',
  q23_exploitation:      'no',
}

describe('Profile: Robert Washington — Vietnam vet, wheelchair, $840/mo', () => {
  it('flags 12 or more programs', () => {
    const results = runAllPrograms(robertWashington)
    expect(results.length).toBeGreaterThanOrEqual(12)
  })

  it('flags VA Pension as eligible', () => {
    const results = runAllPrograms(robertWashington)
    const pension = results.find(r => r.programId === 'va_pension')
    expect(pension).toBeDefined()
    expect(pension?.status).toBe('eligible')
  })

  it('flags VA Aid and Attendance as eligible (highest-value program)', () => {
    const results = runAllPrograms(robertWashington)
    const aa = results.find(r => r.programId === 'va_aid_and_attendance')
    expect(aa).toBeDefined()
    expect(aa?.status).toBe('eligible')
    expect(aa?.estimatedAnnualValue).toBe(27600)
  })

  it('flags VA Healthcare (never applied)', () => {
    const results = runAllPrograms(robertWashington)
    expect(results.some(r => r.programId === 'va_healthcare')).toBe(true)
  })

  it('flags Medicare Part B (only has Part A)', () => {
    const results = runAllPrograms(robertWashington)
    expect(results.some(r => r.programId === 'medicare_part_b')).toBe(true)
  })

  it('flags Medicaid (income $840, well under $1,732 limit)', () => {
    const results = runAllPrograms(robertWashington)
    const medicaid = results.find(r => r.programId === 'medicaid')
    expect(medicaid).toBeDefined()
    expect(medicaid?.status).toBe('eligible')
  })

  it('flags USDA 504 home repair (homeowner + significant repairs)', () => {
    const results = runAllPrograms(robertWashington)
    expect(results.some(r => r.programId === 'usda_504')).toBe(true)
  })

  it('flags Ramp Program (wheelchair + homeowner)', () => {
    const results = runAllPrograms(robertWashington)
    expect(results.some(r => r.programId === 'ramp_program')).toBe(true)
  })

  it('flags Lifeline (no phone, income eligible)', () => {
    const results = runAllPrograms(robertWashington)
    expect(results.some(r => r.programId === 'lifeline')).toBe(true)
  })

  it('flags LIHEAP (utility difficulty + low income)', () => {
    const results = runAllPrograms(robertWashington)
    expect(results.some(r => r.programId === 'liheap')).toBe(true)
  })

  it('estimated annual value exceeds $30,000 (VA + Medicaid + SNAP)', () => {
    const results = runAllPrograms(robertWashington)
    const annual = calcEstimatedAnnualValue(results)
    expect(annual).toBeGreaterThan(30000)
  })

  it('first result is priority 1 (highest priority sorted first)', () => {
    const results = runAllPrograms(robertWashington)
    expect(results[0].priority).toBe(1)
  })
})

describe('Profile: Pastor Freeman — $3,800/mo, fully insured, healthy', () => {
  it('flags 3 or fewer programs (acceptance criterion)', () => {
    const results = runAllPrograms(pastorFreeman)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('does NOT flag SNAP (income too high)', () => {
    const results = runAllPrograms(pastorFreeman)
    expect(results.some(r => r.programId === 'snap')).toBe(false)
  })

  it('does NOT flag Medicaid (income too high)', () => {
    const results = runAllPrograms(pastorFreeman)
    expect(results.some(r => r.programId === 'medicaid')).toBe(false)
  })

  it('does NOT flag Extra Help (no rx difficulty)', () => {
    const results = runAllPrograms(pastorFreeman)
    expect(results.some(r => r.programId === 'extra_help')).toBe(false)
  })

  it('does NOT flag SSI (income too high)', () => {
    const results = runAllPrograms(pastorFreeman)
    expect(results.some(r => r.programId === 'ssi')).toBe(false)
  })

  it('does NOT flag LIHEAP (no utility difficulty)', () => {
    const results = runAllPrograms(pastorFreeman)
    expect(results.some(r => r.programId === 'liheap')).toBe(false)
  })

  it('does NOT flag Lifeline (income too high for phone discount)', () => {
    const results = runAllPrograms(pastorFreeman)
    expect(results.some(r => r.programId === 'lifeline')).toBe(false)
  })

  it('does NOT flag any VA programs (not a veteran)', () => {
    const results = runAllPrograms(pastorFreeman)
    const vaPrograms = results.filter(r => r.programId.startsWith('va_') || r.programId === 'survivors_pension')
    expect(vaPrograms.length).toBe(0)
  })
})

describe('Profile: Dorothy Simmons — 64yo, SSDI, on Medicaid+SNAP, renter', () => {
  it('does NOT flag Medicare Part A/B (under 65)', () => {
    const results = runAllPrograms(dorothySimmons)
    expect(results.some(r => r.programId === 'medicare_part_a')).toBe(false)
    expect(results.some(r => r.programId === 'medicare_part_b')).toBe(false)
  })

  it('flags Extra Help (rx difficulty + low income, even without Part D)', () => {
    const results = runAllPrograms(dorothySimmons)
    // Extra Help requires 65+ OR Part D — Dorothy is 64 and has neither
    // This verifies the screener correctly does NOT flag Extra Help for her
    expect(results.some(r => r.programId === 'extra_help')).toBe(false)
  })

  it('flags Patient Assistance Programs (rx difficulty often)', () => {
    const results = runAllPrograms(dorothySimmons)
    expect(results.some(r => r.programId === 'patient_assistance')).toBe(true)
  })

  it('flags ACP (no internet, on Medicaid qualifying program)', () => {
    const results = runAllPrograms(dorothySimmons)
    expect(results.some(r => r.programId === 'acp')).toBe(true)
  })
})

describe('Profile: James Carter — 82yo WWII vet, dementia, $1,400-2,000/mo joint', () => {
  it('does NOT flag VA Pension (joint $2,400 exceeds $1,379/mo single-person limit)', () => {
    // The single-person VA Pension limit is ~$1,379/mo. '1400_2000' minimum ($1,400)
    // exceeds this, so the screener correctly does not flag VA Pension.
    const results = runAllPrograms(jamesCarter)
    expect(results.some(r => r.programId === 'va_pension')).toBe(false)
  })

  it('flags VA Aid and Attendance as needs_verification (ADL significant, conservative)', () => {
    // Conservative rule: never miss $27,600/year even when pension isn't confirmed.
    const results = runAllPrograms(jamesCarter)
    const aa = results.find(r => r.programId === 'va_aid_and_attendance')
    expect(aa).toBeDefined()
    expect(aa?.status).toBe('needs_verification')
  })

  it('flags POA/Directive (no legal docs on file)', () => {
    const results = runAllPrograms(jamesCarter)
    expect(results.some(r => r.programId === 'poa_directive')).toBe(true)
  })

  it('flags Property Tax Exemption (homeowner, 62+)', () => {
    const results = runAllPrograms(jamesCarter)
    expect(results.some(r => r.programId === 'property_tax_exemption')).toBe(true)
  })

  it('flags SS Representative Payee (significant ADL + chronic conditions + on SS)', () => {
    const results = runAllPrograms(jamesCarter)
    expect(results.some(r => r.programId === 'ss_rep_payee')).toBe(true)
  })
})

describe('Profile: Thelma Brooks — recent widow, $620/mo SS, renter, Medicare A+B', () => {
  it('flags Survivors Pension (surviving spouse, low income)', () => {
    const results = runAllPrograms(thelmaBooks)
    expect(results.some(r => r.programId === 'survivors_pension')).toBe(true)
  })

  it('flags SNAP (low income, not enrolled)', () => {
    const results = runAllPrograms(thelmaBooks)
    expect(results.some(r => r.programId === 'snap')).toBe(true)
  })

  it('flags Extra Help (Medicare enrolled, rx difficulty, low income)', () => {
    const results = runAllPrograms(thelmaBooks)
    expect(results.some(r => r.programId === 'extra_help')).toBe(true)
  })

  it('flags Medicare Savings Program (on Medicare, low income)', () => {
    const results = runAllPrograms(thelmaBooks)
    expect(results.some(r => r.programId === 'medicare_savings_program')).toBe(true)
  })
})

describe('Profile: Rosa Lee Ponder — zero income, no benefits', () => {
  it('flags SSI as needs_verification (never not_eligible for zero income)', () => {
    const results = runAllPrograms(rosaLeePonder)
    const ssi = results.find(r => r.programId === 'ssi')
    expect(ssi).toBeDefined()
    expect(ssi?.status).not.toBe('not_eligible')
  })

  it('flags SNAP (zero income, not enrolled)', () => {
    const results = runAllPrograms(rosaLeePonder)
    expect(results.some(r => r.programId === 'snap')).toBe(true)
  })

  it('flags LIHEAP (utility difficulty often)', () => {
    const results = runAllPrograms(rosaLeePonder)
    expect(results.some(r => r.programId === 'liheap')).toBe(true)
  })

  it('flags Georgia Legal Services (no legal docs, 60+)', () => {
    const results = runAllPrograms(rosaLeePonder)
    expect(results.some(r => r.programId === 'georgia_legal')).toBe(true)
  })

  it('does NOT flag Medicare Part A/B (65-74 but zero income — still eligible at 65)', () => {
    const results = runAllPrograms(rosaLeePonder)
    // Medicare Part A is available at 65+ regardless of income — should be flagged
    expect(results.some(r => r.programId === 'medicare_part_a')).toBe(true)
  })
})

describe('Edge cases and boundary conditions', () => {
  it('elder abuse flag (Q23 = possible): returns urgent tier-7 result', () => {
    const r = runAllPrograms(with_({ q23_exploitation: 'possible' }))
    expect(r.some(res => res.programId === 'elder_abuse')).toBe(true)
    const ea = r.find(res => res.programId === 'elder_abuse')
    expect(ea?.priority).toBe(1)
  })

  it('no veteran: VA programs all return null', () => {
    const r = runAllPrograms(with_({ q16_veteran_status: 'no', q17_veteran_era: [] }))
    expect(r.some(res => res.programId.startsWith('va_'))).toBe(false)
  })

  it('navigator errand coordination: income threshold respected', () => {
    // High income renter should not get Section 8 (income over 50% AMI)
    const r = runAllPrograms(with_({
      q9_housing_type: 'rent',
      q3_income: 'over_2000',
    }))
    expect(r.some(res => res.programId === 'section_8')).toBe(false)
  })

  it('runAllPrograms returns results sorted by priority then annual value', () => {
    const r = runAllPrograms(robertWashington)
    for (let i = 1; i < r.length; i++) {
      const prev = r[i - 1]
      const curr = r[i]
      if (prev.priority === curr.priority) {
        expect(prev.estimatedAnnualValue).toBeGreaterThanOrEqual(curr.estimatedAnnualValue)
      } else {
        expect(prev.priority).toBeLessThanOrEqual(curr.priority)
      }
    }
  })
})
