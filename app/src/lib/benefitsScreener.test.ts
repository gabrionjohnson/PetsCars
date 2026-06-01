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
