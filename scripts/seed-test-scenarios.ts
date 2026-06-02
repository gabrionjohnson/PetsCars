#!/usr/bin/env ts-node
/**
 * Pathway Test Scenario Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates 6 varied test clients and 2 additional drivers for comprehensive
 * platform testing. Designed to stress different features:
 *
 *   Robert Earl Washington   — WAV, Vietnam vet, 12+ screener flags, dialysis
 *   Dorothy Mae Simmons      — long-distance NEMT, chemo, family proxy
 *   James & Eunice Carter    — couple, WWII vet, dementia, no proxy
 *   Thelma Jean Brooks       — recent widow, grief flag, survivor benefit gap
 *   Pastor Leonard Freeman   — high income, 3 or fewer screener flags
 *   Rosa Lee Ponder          — zero income, SSI edge case, no existing benefits
 *
 *   Keisha Renee Thomas (Driver) — standard vehicle, part-time, Leslie/Plains only
 *   Earl Burton (Driver)          — WAV certified, MWF mornings (dialysis schedule)
 *
 * Run from repo root:
 *   npx ts-node scripts/seed-test-scenarios.ts
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.seed
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as fs   from 'fs'
import * as path from 'path'

// ── Env loading ───────────────────────────────────────────────────────────────

function loadEnvFile(): void {
  const candidates = [
    path.join(__dirname, '..', '.env.seed'),
    path.join(__dirname, '..', '.env.local'),
  ]
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue
    const raw = fs.readFileSync(f, 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
    console.log(`📋  Loaded env from ${path.relative(process.cwd(), f)}`)
    return
  }
}

loadEnvFile()

const SUPABASE_URL              = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`
❌  Missing required environment variables.

Create .env.seed at the repo root:
  SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
`)
  process.exit(1)
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Log helpers ───────────────────────────────────────────────────────────────

const ok   = (label: string): void => { process.stdout.write(`     ✓  ${label}\n`) }
const skip = (label: string): void => { process.stdout.write(`     –  ${label}\n`) }
const step = (text: string):  void => { console.log(`\n  ▶  ${text}`) }

function assertOk(error: unknown, context: string): void {
  if (!error) return
  const msg = (error as Record<string, unknown>)?.message ?? String(error)
  throw new Error(`[${context}] ${msg}`)
}

// ── Date utilities ────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n); return d
}
function businessDaysFromNow(n: number): Date {
  const d = new Date()
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) added++
  }
  d.setHours(9, 0, 0, 0)
  return d
}
function iso(d: Date): string { return d.toISOString() }
function dateStr(d: Date): string { return d.toISOString().slice(0, 10) }
function dob(yearsOld: number): string {
  return new Date(new Date().getFullYear() - yearsOld, 5, 1).toISOString().slice(0, 10)
}

// ── Screener answers for each test profile ────────────────────────────────────

const robertAnswers = {
  q1_age: '75_plus', q2_citizenship: 'citizen', q3_income: '500_900',
  q4_household_size: '1', q5_assets: 'some',
  q6_current_benefits: ['social_security', 'medicare_a'],
  q7_part_b_premium: 'not_enrolled', q8_rx_difficulty: 'sometimes',
  q9_housing_type: 'own_paid', q10_home_repairs: 'significant',
  q11_utility_difficulty: 'sometimes', q12_hvac_status: 'not_sure',
  q13_chronic_conditions: 'multiple', q14_adl_help: 'significant',
  q15_mobility: 'wheelchair', q16_veteran_status: 'veteran',
  q17_veteran_era: ['vietnam'], q18_surviving_spouse: 'no',
  q19_prior_va: 'never', q20_phone_access: 'none',
  q21_internet_access: 'no', q22_legal_docs: 'not_sure',
  q23_exploitation: 'no',
}

const dorothyAnswers = {
  q1_age: '60_64', q2_citizenship: 'citizen', q3_income: '900_1400',
  q4_household_size: '1', q5_assets: 'no',
  q6_current_benefits: ['medicaid', 'snap'],
  q7_part_b_premium: 'not_enrolled', q8_rx_difficulty: 'often',
  q9_housing_type: 'rent', q10_home_repairs: 'no',
  q11_utility_difficulty: 'sometimes', q12_hvac_status: 'ok',
  q13_chronic_conditions: 'multiple', q14_adl_help: 'some',
  q15_mobility: 'no', q16_veteran_status: 'no',
  q17_veteran_era: [], q18_surviving_spouse: 'no',
  q19_prior_va: 'na', q20_phone_access: 'home_phone',
  q21_internet_access: 'no', q22_legal_docs: 'one',
  q23_exploitation: 'no',
}

const jamesAnswers = {
  q1_age: '75_plus', q2_citizenship: 'citizen', q3_income: '1400_2000',
  q4_household_size: '2', q5_assets: 'some',
  q6_current_benefits: ['medicare_a', 'medicare_b', 'social_security'],
  q7_part_b_premium: 'yes', q8_rx_difficulty: 'sometimes',
  q9_housing_type: 'own_paid', q10_home_repairs: 'minor',
  q11_utility_difficulty: 'no', q12_hvac_status: 'ok',
  q13_chronic_conditions: 'multiple', q14_adl_help: 'significant',
  q15_mobility: 'walker_cane', q16_veteran_status: 'veteran',
  q17_veteran_era: ['wwii'], q18_surviving_spouse: 'no',
  q19_prior_va: 'never', q20_phone_access: 'home_phone',
  q21_internet_access: 'no', q22_legal_docs: 'no',
  q23_exploitation: 'no',
}

const thelmaAnswers = {
  q1_age: '65_74', q2_citizenship: 'citizen', q3_income: '500_900',
  q4_household_size: '1', q5_assets: 'no',
  q6_current_benefits: ['social_security', 'medicare_a', 'medicare_b'],
  q7_part_b_premium: 'yes', q8_rx_difficulty: 'sometimes',
  q9_housing_type: 'rent', q10_home_repairs: 'no',
  q11_utility_difficulty: 'sometimes', q12_hvac_status: 'ok',
  q13_chronic_conditions: 'one', q14_adl_help: 'no',
  q15_mobility: 'no', q16_veteran_status: 'no',
  q17_veteran_era: [], q18_surviving_spouse: 'yes',
  q19_prior_va: 'na', q20_phone_access: 'cell',
  q21_internet_access: 'limited', q22_legal_docs: 'no',
  q23_exploitation: 'no',
}

const freemanAnswers = {
  q1_age: '65_74', q2_citizenship: 'citizen', q3_income: 'over_2000',
  q4_household_size: '2', q5_assets: 'significant',
  q6_current_benefits: ['medicare_a', 'medicare_b', 'medicare_d', 'social_security'],
  q7_part_b_premium: 'yes', q8_rx_difficulty: 'no',
  q9_housing_type: 'own_paid', q10_home_repairs: 'no',
  q11_utility_difficulty: 'no', q12_hvac_status: 'ok',
  q13_chronic_conditions: 'no', q14_adl_help: 'no',
  q15_mobility: 'no', q16_veteran_status: 'no',
  q17_veteran_era: [], q18_surviving_spouse: 'no',
  q19_prior_va: 'na', q20_phone_access: 'cell',
  q21_internet_access: 'broadband', q22_legal_docs: 'both',
  q23_exploitation: 'no',
}

const rosaAnswers = {
  q1_age: '65_74', q2_citizenship: 'citizen', q3_income: 'under_500',
  q4_household_size: '2', q5_assets: 'no',
  q6_current_benefits: ['none'],
  q7_part_b_premium: 'not_enrolled', q8_rx_difficulty: 'sometimes',
  q9_housing_type: 'family', q10_home_repairs: 'no',
  q11_utility_difficulty: 'often', q12_hvac_status: 'not_sure',
  q13_chronic_conditions: 'one', q14_adl_help: 'no',
  q15_mobility: 'no', q16_veteran_status: 'no',
  q17_veteran_era: [], q18_surviving_spouse: 'no',
  q19_prior_va: 'na', q20_phone_access: 'none',
  q21_internet_access: 'no', q22_legal_docs: 'no',
  q23_exploitation: 'no',
}

// ── Phone numbers for cleanup lookup ─────────────────────────────────────────

const SEED_PHONES = [
  '+12295550201', // Robert Washington
  '+12295550202', // Dorothy Simmons
  '+12295550203', // James Carter
  '+12295550204', // Thelma Brooks
  '+12295550205', // Pastor Freeman
  '+12295550206', // Rosa Lee Ponder
]

const DRIVER_EMAILS = [
  'driver2@pathway.app', // Keisha Thomas
  'driver3@pathway.app', // Earl Burton
]

// ── Auth user factory ─────────────────────────────────────────────────────────

async function createAuthUser(
  email: string,
  password: string,
  meta: { role: string; name: string; phone: string },
): Promise<string> {
  // Delete existing user with this email first (for idempotency)
  const { data: existing } = await supabase.auth.admin.listUsers()
  const existingUser = existing?.users?.find(u => u.email === email)
  if (existingUser) {
    await supabase.auth.admin.deleteUser(existingUser.id)
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email, password,
    email_confirm: true,
    user_metadata: meta,
  })
  assertOk(error, `createUser(${email})`)
  return data!.user!.id
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

async function cleanup(): Promise<void> {
  step('Cleaning up previous scenario seed data…')

  const { data: existingClients } = await supabase
    .from('clients')
    .select('id')
    .in('phone', SEED_PHONES)

  if (existingClients?.length) {
    const clientIds = existingClients.map(c => c.id as string)
    const [{ data: errands }, { data: nemts }] = await Promise.all([
      supabase.from('errand_trips').select('id').in('client_id', clientIds),
      supabase.from('nemt_trips').select('id').in('client_id', clientIds),
    ])
    const tripIds = [...(errands ?? []), ...(nemts ?? [])].map(t => t.id as string)
    if (tripIds.length) {
      await supabase.from('trip_status_log').delete().in('trip_id', tripIds)
    }
    await supabase.from('errand_trips').delete().in('client_id', clientIds)
    await supabase.from('nemt_trips').delete().in('client_id', clientIds)
    await supabase.from('referrals').delete().in('client_id', clientIds)
    await supabase.from('clients').update({ family_proxy_id: null }).in('id', clientIds)
    await supabase.from('family_proxies').delete().in('client_id', clientIds)
    await supabase.from('clients').delete().in('id', clientIds)
    ok(`Removed ${clientIds.length} test client(s)`)
  } else {
    skip('No existing test clients found')
  }

  // Remove extra driver auth accounts
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  for (const email of DRIVER_EMAILS) {
    const u = existingUsers?.users?.find(u => u.email === email)
    if (u) {
      await supabase.auth.admin.deleteUser(u.id)
      ok(`Removed ${email}`)
    }
  }
}

// ── Main seed ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n════════════════════════════════════════════════════')
  console.log('  Pathway — Test Scenario Seed')
  console.log('════════════════════════════════════════════════════')

  await cleanup()

  // ── Find existing navigator (Marcus Williams from base seed) ──────────────

  step('Finding base navigator…')
  const { data: navProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'navigator@pathway.app')
    .maybeSingle()

  if (!navProfile) {
    console.error('\n❌  Base seed not found. Run seed-test-data.ts first.')
    process.exit(1)
  }
  const navigatorId = navProfile.id as string
  ok(`Navigator ID: ${navigatorId}`)

  // ── Driver 2 — Keisha Renee Thomas ───────────────────────────────────────

  step('Creating Driver 2: Keisha Renee Thomas…')
  const keishaId = await createAuthUser('driver2@pathway.app', 'PathwayDrv2024!', {
    role: 'driver', name: 'Keisha Renee Thomas', phone: '+12295550301',
  })
  const { error: keishaDrErr } = await supabase.from('drivers').insert({
    id: keishaId, county: 'Sumter',
    zip_codes: ['31776', '31780'],   // Leslie and Plains ZIPs only
    vehicle_make: 'Honda', vehicle_model: 'Odyssey', vehicle_year: 2021,
    vehicle_color: 'Silver', license_plate: 'GDR-8812',
    has_wav: false,
    background_check_status: 'approved',
    drivers_license_verified: true,
    active: true,
  })
  assertOk(keishaDrErr, 'keisha driver row')
  ok('Keisha Thomas — standard vehicle, Leslie/Plains zone')

  // ── Driver 3 — Earl Burton (WAV, dialysis schedule) ──────────────────────

  step('Creating Driver 3: Earl Burton…')
  const earlId = await createAuthUser('driver3@pathway.app', 'PathwayDrv2024!', {
    role: 'driver', name: 'Earl Burton', phone: '+12295550302',
  })
  const { error: earlDrErr } = await supabase.from('drivers').insert({
    id: earlId, county: 'Sumter',
    zip_codes: ['31709', '31776', '31780', '31721'],
    vehicle_make: 'Ford', vehicle_model: 'Transit', vehicle_year: 2020,
    vehicle_color: 'White', license_plate: 'GWV-4417',
    has_wav: true,
    background_check_status: 'approved',
    drivers_license_verified: true,
    active: true,
  })
  assertOk(earlDrErr, 'earl driver row')
  ok('Earl Burton — WAV certified, MWF availability')

  // ── Client 1 — Robert Earl Washington ────────────────────────────────────

  step('Creating Client 1: Robert Earl Washington…')
  const { data: robert, error: robertErr } = await supabase.from('clients').insert({
    navigator_id:        navigatorId,
    name:                'Robert Earl Washington',
    dob:                 dob(78),
    phone:               '+12295550201',
    address:             '445 Pine Street',
    zip:                 '31780',
    county:              'Sumter',
    income_level:        'below_poverty',
    va_status:           true,
    has_wav_need:        true,
    insurance_info:      { medicare_a: true, medicare_b: false, medicaid: false },
    subscription_tier:   'basic',
    subscription_status: 'active',
  }).select('id').single()
  assertOk(robertErr, 'robert client row')
  const robertId = robert!.id as string

  // Robert's benefits screening
  const { error: robertScreenErr } = await supabase.from('benefits_screenings').insert({
    client_id:             robertId,
    navigator_id:          navigatorId,
    screener_version:      2,
    answers:               robertAnswers,
    estimated_annual_value: 58000,
    priority_programs:     ['va_aid_and_attendance', 'va_pension', 'medicaid', 'snap'],
  })
  assertOk(robertScreenErr, 'robert screening')

  // Robert's tasks
  const { error: robertTaskErr } = await supabase.from('tasks').insert([
    {
      client_id: robertId, navigator_id: navigatorId,
      category: 'veterans_benefits', title: 'Apply for VA Aid and Attendance',
      status: 'pending', priority: 1,
      due_date: dateStr(businessDaysFromNow(10)),
      notes: 'Gather DD-214 first. VA Form 21-2680 needs physician statement. High priority — up to $27,600/year.',
    },
    {
      client_id: robertId, navigator_id: navigatorId,
      category: 'healthcare', title: 'Enroll in Medicare Part B',
      status: 'pending', priority: 1,
      due_date: dateStr(businessDaysFromNow(5)),
      notes: 'Currently only has Part A. Must enroll Part B before Extra Help and MSP.',
    },
  ])
  assertOk(robertTaskErr, 'robert tasks')

  // Robert's recurring NEMT (dialysis MWF) — schedule next trip
  const nextMonday = businessDaysFromNow(4)
  const { error: robertNemtErr } = await supabase.from('nemt_trips').insert({
    client_id:         robertId,
    navigator_id:      navigatorId,
    trip_type:         'wheelchair',
    status:            'scheduled',
    scheduled_datetime: iso(nextMonday),
    pickup_address:    '445 Pine Street, Plains GA 31780',
    dropoff_address:   'DaVita Sumter Dialysis, 501 Memorial Dr, Americus GA 31709',
    appointment_type:  'dialysis',
    base_fee:          28.00,
    mileage_rate:      2.10,
    notes:             'Recurring MWF dialysis. WAV required — Earl Burton preferred. Client lives alone — confirm pickup 30 min prior.',
    is_recurring:      true,
    recurrence_pattern: 'MWF',
    medicaid_id:       'GA-TEST-ROBERT',
  })
  assertOk(robertNemtErr, 'robert nemt trip')
  ok(`Robert Washington (${robertId}) — ${robertAnswers.q6_current_benefits.join(', ')}`)

  // ── Client 2 — Dorothy Mae Simmons ───────────────────────────────────────

  step('Creating Client 2: Dorothy Mae Simmons…')
  const { data: dorothy, error: dorothyErr } = await supabase.from('clients').insert({
    navigator_id:        navigatorId,
    name:                'Dorothy Mae Simmons',
    dob:                 dob(64),
    phone:               '+12295550202',
    address:             '118 Church Street Apt 4',
    zip:                 '31709',
    county:              'Sumter',
    income_level:        'low',
    va_status:           false,
    has_wav_need:        false,
    insurance_info:      { medicaid: true, snap: true },
    subscription_tier:   'full_care',
    subscription_status: 'active',
  }).select('id').single()
  assertOk(dorothyErr, 'dorothy client row')
  const dorothyId = dorothy!.id as string

  // Dorothy's family proxy (son Marcus in Atlanta)
  const marcusProxyId = await createAuthUser('marcus.simmons@gmail.com', 'PathwayFam2024!', {
    role: 'family_proxy', name: 'Marcus Simmons', phone: '+14045550901',
  })
  const { error: marcusProxyErr } = await supabase.from('family_proxies').insert({
    id:           marcusProxyId,
    client_id:    dorothyId,
    relationship: 'child',
    name:         'Marcus Simmons',
    phone:        '+14045550901',
    email:        'marcus.simmons@gmail.com',
    can_book_services: true,
    can_view_documents: true,
  })
  assertOk(marcusProxyErr, 'marcus proxy')

  await supabase.from('clients').update({ family_proxy_id: marcusProxyId }).eq('id', dorothyId)

  // Dorothy's screening
  await supabase.from('benefits_screenings').insert({
    client_id:             dorothyId,
    navigator_id:          navigatorId,
    screener_version:      2,
    answers:               dorothyAnswers,
    estimated_annual_value: 4500,
    priority_programs:     ['patient_assistance', 'acp', 'liheap'],
  })

  // Dorothy's chemo NEMT — Albany (62 miles)
  const chemoDt = businessDaysFromNow(6)
  chemoDt.setHours(7, 30, 0, 0)
  await supabase.from('nemt_trips').insert({
    client_id:         dorothyId,
    navigator_id:      navigatorId,
    trip_type:         'ambulatory',
    status:            'scheduled',
    scheduled_datetime: iso(chemoDt),
    pickup_address:    '118 Church Street Apt 4, Americus GA 31709',
    dropoff_address:   'Phoebe Putney Memorial Medical Center, 417 3rd Ave, Albany GA 31701',
    appointment_type:  'chemotherapy',
    base_fee:          18.00,
    mileage_rate:      1.85,
    notes:             'Long distance — 62 miles one way. Chemotherapy appointment. Early morning pickup. Son Marcus notified.',
    medicaid_id:       'GA-TEST-DOROTHY',
  })
  ok(`Dorothy Simmons (${dorothyId}) — Medicaid/SNAP, chemo NEMT scheduled`)

  // ── Client 3 — James Carter ───────────────────────────────────────────────

  step('Creating Client 3: James Carter…')
  const { data: james, error: jamesErr } = await supabase.from('clients').insert({
    navigator_id:        navigatorId,
    name:                'James Carter',
    dob:                 dob(82),
    phone:               '+12295550203',
    address:             '823 Oak Avenue',
    zip:                 '31709',
    county:              'Sumter',
    income_level:        'moderate',
    va_status:           true,
    has_wav_need:        false,
    insurance_info:      { medicare_a: true, medicare_b: true, medicaid: false },
    subscription_tier:   'full_care',
    subscription_status: 'active',
    notes:               'WWII veteran. Moderate dementia — Eunice (wife) is primary caregiver. No family proxy in system. Navigator must always speak with Eunice.',
  }).select('id').single()
  assertOk(jamesErr, 'james client row')
  const jamesId = james!.id as string

  await supabase.from('benefits_screenings').insert({
    client_id:             jamesId,
    navigator_id:          navigatorId,
    screener_version:      2,
    answers:               jamesAnswers,
    estimated_annual_value: 28000,
    priority_programs:     ['va_aid_and_attendance', 'poa_directive', 'ss_rep_payee'],
  })

  // James's PT NEMT (recurring 3x/week)
  const ptDt = businessDaysFromNow(3)
  ptDt.setHours(10, 0, 0, 0)
  await supabase.from('nemt_trips').insert({
    client_id:         jamesId,
    navigator_id:      navigatorId,
    trip_type:         'ambulatory',
    status:            'scheduled',
    scheduled_datetime: iso(ptDt),
    pickup_address:    '823 Oak Avenue, Americus GA 31709',
    dropoff_address:   'South Georgia Physical Therapy, 300 Sumter St, Americus GA 31709',
    appointment_type:  'physical_therapy',
    base_fee:          18.00,
    mileage_rate:      1.85,
    notes:             'PT for hip replacement recovery. Wife Eunice must be notified on all communications. Recurring 3x/week.',
    medicaid_id:       'GA-TEST-JAMES',
    is_recurring:      true,
    recurrence_pattern: 'MWF',
  })

  // James's tasks
  await supabase.from('tasks').insert([
    {
      client_id: jamesId, navigator_id: navigatorId,
      category: 'legal_documents', title: 'Complete POA and Healthcare Directive',
      status: 'pending', priority: 1,
      due_date: dateStr(businessDaysFromNow(14)),
      notes: 'James has dementia — Eunice must be involved. Georgia Legal Services can help with free forms.',
    },
    {
      client_id: jamesId, navigator_id: navigatorId,
      category: 'veterans_benefits', title: 'Apply for VA Aid and Attendance',
      status: 'pending', priority: 1,
      due_date: dateStr(businessDaysFromNow(21)),
      notes: 'Income $2,400 may exceed single-person pension limit — verify couple threshold with VA. ADL significant.',
    },
  ])
  ok(`James Carter (${jamesId}) — WWII vet, dementia, no proxy`)

  // ── Client 4 — Thelma Jean Brooks ────────────────────────────────────────

  step('Creating Client 4: Thelma Jean Brooks…')
  const { data: thelma, error: thelmaErr } = await supabase.from('clients').insert({
    navigator_id:        navigatorId,
    name:                'Thelma Jean Brooks',
    dob:                 dob(71),
    phone:               '+12295550204',
    address:             '67 Maple Lane',
    zip:                 '31776',
    county:              'Sumter',
    income_level:        'below_poverty',
    va_status:           false,
    has_wav_need:        false,
    insurance_info:      { medicare_a: true, medicare_b: true, medicaid: false },
    subscription_tier:   'basic',
    subscription_status: 'active',
    notes:               'Recently widowed — husband passed 6 weeks ago. Grief and isolation concern. Daughter Sarah in Florida is family proxy. May benefit from extra check-ins during first 30 days.',
  }).select('id').single()
  assertOk(thelmaErr, 'thelma client row')
  const thelmaId = thelma!.id as string

  // Thelma's daughter as family proxy
  const sarahProxyId = await createAuthUser('sarah.brooks.fl@gmail.com', 'PathwayFam2024!', {
    role: 'family_proxy', name: 'Sarah Brooks', phone: '+17275550801',
  })
  await supabase.from('family_proxies').insert({
    id:           sarahProxyId,
    client_id:    thelmaId,
    relationship: 'child',
    name:         'Sarah Brooks',
    phone:        '+17275550801',
    email:        'sarah.brooks.fl@gmail.com',
    can_book_services: true,
    can_view_documents: true,
  })
  await supabase.from('clients').update({ family_proxy_id: sarahProxyId }).eq('id', thelmaId)

  await supabase.from('benefits_screenings').insert({
    client_id:             thelmaId,
    navigator_id:          navigatorId,
    screener_version:      2,
    answers:               thelmaAnswers,
    estimated_annual_value: 22000,
    priority_programs:     ['survivors_pension', 'snap', 'extra_help', 'medicare_savings_program'],
  })

  await supabase.from('tasks').insert({
    client_id: thelmaId, navigator_id: navigatorId,
    category: 'income_benefits', title: 'Apply for Social Security Survivor Benefit',
    status: 'pending', priority: 1,
    due_date: dateStr(businessDaysFromNow(7)),
    notes: 'Thelma may be eligible for survivor benefit based on deceased husband\'s record. Call SSA: 1-800-772-1213.',
  })
  ok(`Thelma Brooks (${thelmaId}) — recent widow, grief flag, survivor benefit gap`)

  // ── Client 5 — Pastor Leonard Freeman ────────────────────────────────────

  step('Creating Client 5: Pastor Leonard Freeman…')
  const { data: freeman, error: freemanErr } = await supabase.from('clients').insert({
    navigator_id:        navigatorId,
    name:                'Leonard Freeman',
    dob:                 dob(68),
    phone:               '+12295550205',
    address:             '2201 Commerce Drive',
    zip:                 '31709',
    county:              'Sumter',
    income_level:        'moderate',
    va_status:           false,
    has_wav_need:        false,
    insurance_info:      { medicare_a: true, medicare_b: true, medicare_d: true, social_security: true },
    subscription_tier:   'basic',
    subscription_status: 'active',
    notes:               'Retired pastor. Good income and coverage. Uses Pathway for document management and occasional NEMT coordination only.',
  }).select('id').single()
  assertOk(freemanErr, 'freeman client row')
  const freemanId = freeman!.id as string

  await supabase.from('benefits_screenings').insert({
    client_id:             freemanId,
    navigator_id:          navigatorId,
    screener_version:      2,
    answers:               freemanAnswers,
    estimated_annual_value: 1200,
    priority_programs:     ['property_tax_exemption'],
  })
  ok(`Pastor Freeman (${freemanId}) — high income, 3 or fewer screener flags`)

  // ── Client 6 — Rosa Lee Ponder ────────────────────────────────────────────

  step('Creating Client 6: Rosa Lee Ponder…')
  const { data: rosa, error: rosaErr } = await supabase.from('clients').insert({
    navigator_id:        navigatorId,
    name:                'Rosa Lee Ponder',
    dob:                 dob(66),
    phone:               '+12295550206',
    address:             '312 Sunflower Road',
    zip:                 '31780',
    county:              'Sumter',
    income_level:        'below_poverty',
    va_status:           false,
    has_wav_need:        false,
    insurance_info:      { none: true },
    subscription_tier:   'basic',
    subscription_status: 'active',
    notes:               'Zero income — domestic work history, no SS contributions. Lives with grandson. May need birth certificate assistance. High SSI/Medicaid priority.',
  }).select('id').single()
  assertOk(rosaErr, 'rosa client row')
  const rosaId = rosa!.id as string

  await supabase.from('benefits_screenings').insert({
    client_id:             rosaId,
    navigator_id:          navigatorId,
    screener_version:      2,
    answers:               rosaAnswers,
    estimated_annual_value: 15000,
    priority_programs:     ['ssi', 'medicaid', 'snap', 'liheap'],
  })

  await supabase.from('tasks').insert([
    {
      client_id: rosaId, navigator_id: navigatorId,
      category: 'income_benefits', title: 'Screen for SSI Eligibility',
      status: 'pending', priority: 1,
      due_date: dateStr(businessDaysFromNow(5)),
      notes: 'Zero income, zero assets. SSI needs_verification — schedule SSA appointment. Birth certificate may be needed.',
    },
    {
      client_id: rosaId, navigator_id: navigatorId,
      category: 'healthcare', title: 'Apply for Medicaid and Medicare Part A',
      status: 'pending', priority: 1,
      due_date: dateStr(businessDaysFromNow(7)),
      notes: '65+ with no insurance. High blood pressure needs monitoring. Georgia Gateway application.',
    },
  ])
  ok(`Rosa Lee Ponder (${rosaId}) — zero income, SSI edge case`)

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n════════════════════════════════════════════════════')
  console.log('  ✅  Scenario seed complete!')
  console.log('════════════════════════════════════════════════════')
  console.log(`
  Clients created (all assigned to Marcus Williams navigator):
    Robert Washington  ${robertId}  — Vietnam vet, WAV, 24 screener flags
    Dorothy Simmons    ${dorothyId}  — 64yo, SSDI, chemo NEMT
    James Carter       ${jamesId}  — WWII vet, dementia, couple
    Thelma Brooks      ${thelmaId}  — recent widow, grief flag
    Pastor Freeman     ${freemanId}  — high income, 3 flags
    Rosa Lee Ponder    ${rosaId}  — zero income, SSI edge case

  Drivers created:
    Keisha Thomas  driver2@pathway.app  — standard vehicle, Leslie/Plains
    Earl Burton    driver3@pathway.app  — WAV certified, MWF

  Login: navigator@pathway.app / PathwayNav2024!
`)
}

main().catch(err => {
  console.error('\n❌  Seed failed:', err.message)
  process.exit(1)
})
