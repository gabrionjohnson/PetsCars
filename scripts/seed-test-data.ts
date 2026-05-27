#!/usr/bin/env ts-node
/**
 * Pathway Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates one test account per role + realistic Sumter County, GA test data.
 * Safe to re-run — cleans up previous seed data before inserting fresh rows.
 *
 * Accounts created:
 *   admin@pathway.app        PathwayAdmin2024!   — Platform Admin
 *   navigator@pathway.app    PathwayNav2024!     — Marcus Williams, Sumter Co.
 *   driver@pathway.app       PathwayDrv2024!     — Darnell Hayes, WAV Toyota Sienna
 *   family@pathway.app       PathwayFam2024!     — Keisha Johnson (daughter proxy)
 *
 * Senior client: Willie Mae Johnson, 312 Hudson St, Plains GA 31780
 * Ambassador:    Rev. Clarence Davis, referral code PLAINS1
 *
 * Run from repo root (install deps first if needed):
 *   npm install               # one-time root install
 *   npx ts-node scripts/seed-test-data.ts
 *
 * Required env (in .env.seed at repo root, or exported in your shell):
 *   SUPABASE_URL              — e.g. https://abcdefg.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — Project Settings → API → service_role key
 *   ⚠️  Never commit .env.seed — the service key bypasses all RLS.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as fs   from 'fs'
import * as path from 'path'

// ── Env loading ───────────────────────────────────────────────────────────────
// Searches .env.seed, .env.local, then falls back to process.env.

function loadEnvFile(): void {
  const candidates = [
    path.join(__dirname, '..', '.env.seed'),
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '.env'),
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

Find the service role key in:
  Supabase Dashboard → Project Settings → API → service_role
`)
  process.exit(1)
}

// ── Supabase client (service role — bypasses RLS for seeding) ────────────────

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Log helpers ───────────────────────────────────────────────────────────────

const ok   = (label: string): void => { process.stdout.write(`     ✓  ${label}\n`) }
const skip = (label: string): void => { process.stdout.write(`     –  ${label}\n`) }
const step = (text: string):  void => { console.log(`\n  ▶  ${text}`) }

// ── Date utilities ────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

/** Skip weekends to get n business days from today (for NEMT 3-day advance rule). */
function businessDaysFromNow(n: number): Date {
  const d = new Date()
  let added = 0
  while (added < n) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  d.setHours(9, 0, 0, 0)
  return d
}

function iso(d: Date): string { return d.toISOString() }
function dateStr(d: Date): string { return d.toISOString().slice(0, 10) }

// ── Error helper ──────────────────────────────────────────────────────────────

function assertOk(error: unknown, context: string): void {
  if (!error) return
  const msg = (error as Record<string, unknown>)?.message ?? String(error)
  throw new Error(`[${context}] ${msg}`)
}

// ── Auth user factory ─────────────────────────────────────────────────────────

interface CreatedUser { id: string; email: string }

async function createAuthUser(
  email: string,
  password: string,
  meta: { role: string; name: string; phone: string },
): Promise<CreatedUser> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,      // skip confirmation email in dev
    user_metadata: meta,      // triggers handle_new_user() → profiles row
  })
  assertOk(error, `createUser(${email})`)
  return { id: data!.user!.id, email }
}

// ── Cleanup — idempotent, safe to re-run ──────────────────────────────────────

async function cleanup(): Promise<void> {
  step('Cleaning up previous seed data…')

  // Find existing test client by the seed phone number.
  const { data: existingClients } = await supabase
    .from('clients')
    .select('id')
    .eq('phone', '+12295550101')

  if (existingClients?.length) {
    const clientIds = existingClients.map(c => c.id as string)

    // Collect trip IDs for status log cleanup (no FK, just a loose trip_id reference).
    const [{ data: errands }, { data: nemts }] = await Promise.all([
      supabase.from('errand_trips').select('id').in('client_id', clientIds),
      supabase.from('nemt_trips').select('id').in('client_id', clientIds),
    ])
    const tripIds = [...(errands ?? []), ...(nemts ?? [])].map(t => t.id as string)
    if (tripIds.length) {
      await supabase.from('trip_status_log').delete().in('trip_id', tripIds)
    }

    // Trips must go before clients (RESTRICT FK).
    await supabase.from('errand_trips').delete().in('client_id', clientIds)
    await supabase.from('nemt_trips').delete().in('client_id', clientIds)

    // Referrals have RESTRICT FK on client_id.
    await supabase.from('referrals').delete().in('client_id', clientIds)

    // Null out the circular family_proxy_id FK on clients before deleting family_proxies.
    await supabase.from('clients').update({ family_proxy_id: null }).in('id', clientIds)

    // family_proxies.client_id is ON DELETE RESTRICT — remove before client.
    await supabase.from('family_proxies').delete().in('client_id', clientIds)

    // Clients cascade-delete tasks, sessions, documents, benefits_screenings.
    await supabase.from('clients').delete().in('id', clientIds)
    ok(`Removed ${clientIds.length} test client(s) and all related data`)
  } else {
    skip('No existing test client found')
  }

  // Delete test auth users (cascades profiles → navigators / drivers).
  const TEST_EMAILS = [
    'admin@pathway.app',
    'navigator@pathway.app',
    'driver@pathway.app',
    'family@pathway.app',
  ]
  const { data: userList } = await supabase.auth.admin.listUsers()
  const toDelete = (userList?.users ?? []).filter(u => TEST_EMAILS.includes(u.email ?? ''))
  await Promise.all(toDelete.map(u => supabase.auth.admin.deleteUser(u.id)))
  if (toDelete.length) ok(`Removed ${toDelete.length} test auth user(s)`)

  // Ambassador (no auth account — delete by phone).
  await supabase.from('ambassadors').delete().eq('phone', '+12295550099')
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('\n🌱  Pathway Seed Script')
  console.log('═'.repeat(60))
  console.log(`   Target: ${SUPABASE_URL}`)
  console.log('═'.repeat(60))

  await cleanup()

  // ── 1. Admin ──────────────────────────────────────────────────────────────
  step('Creating admin account…')
  const admin = await createAuthUser('admin@pathway.app', 'PathwayAdmin2024!', {
    role: 'admin',   // handle_new_user trigger blocks this → promote below
    name: 'Platform Admin',
    phone: '+12295550000',
  })
  // The trigger defaults to 'navigator' when role='admin' in metadata.
  // Promote via direct UPDATE (service role bypasses RLS on profiles).
  const { error: adminRoleErr } = await supabase
    .from('profiles')
    .update({ role: 'admin', name: 'Platform Admin', phone: '+12295550000' })
    .eq('id', admin.id)
  assertOk(adminRoleErr, 'promote admin role')
  ok(`admin@pathway.app  ·  id: ${admin.id.slice(0, 8)}…`)

  // ── 2. Navigator ──────────────────────────────────────────────────────────
  step('Creating navigator account…')
  const navigator = await createAuthUser('navigator@pathway.app', 'PathwayNav2024!', {
    role:  'navigator',
    name:  'Marcus Williams',
    phone: '+12295550102',
  })
  const { error: navErr } = await supabase.from('navigators').insert({
    id:                      navigator.id,
    county:                  'Sumter',
    zip_codes:               ['31780', '31781', '31709'],
    background_check_status: 'approved',
    training_complete:       true,
    active:                  true,
    onboarding_completed_at: iso(daysAgo(30)),
  })
  assertOk(navErr, 'insert navigator')
  ok(`navigator@pathway.app  ·  Marcus Williams  ·  Sumter County  ·  id: ${navigator.id.slice(0, 8)}…`)

  // ── 3. Driver ─────────────────────────────────────────────────────────────
  step('Creating driver account…')
  const driver = await createAuthUser('driver@pathway.app', 'PathwayDrv2024!', {
    role:  'driver',
    name:  'Darnell Hayes',
    phone: '+12295550103',
  })
  const { error: drvErr } = await supabase.from('drivers').insert({
    id:                       driver.id,
    county:                   'Sumter',
    zip_codes:                ['31780', '31781', '31709', '31763'],
    vehicle_make:             'Toyota',
    vehicle_model:            'Sienna',
    vehicle_year:             2019,
    vehicle_color:            'Silver',
    license_plate:            'GAB-7741',
    has_wav:                  true,       // Wheelchair-accessible vehicle
    background_check_status:  'approved',
    drivers_license_verified: true,
    active:                   true,
    online:                   true,
    rating:                   4.92,
    total_trips:              47,
    stripe_connect_complete:  true,
    onboarding_step:          6,
    earnings_pending:         0.00,
  })
  assertOk(drvErr, 'insert driver')
  ok(`driver@pathway.app  ·  Darnell Hayes  ·  2019 Toyota Sienna WAV  ·  id: ${driver.id.slice(0, 8)}…`)

  // ── 4. Senior client ──────────────────────────────────────────────────────
  step('Creating senior client (Willie Mae Johnson)…')
  //
  // Willie Mae Johnson — 78-year-old resident of Plains, GA (President Carter's hometown).
  // Dual-eligible Medicare/Medicaid. SNAP enrolled. Lives alone, daughter Keisha in Atlanta.
  //
  const { data: clientRow, error: clientErr } = await supabase
    .from('clients')
    .insert({
      name:                'Willie Mae Johnson',
      dob:                 '1948-03-15',
      phone:               '+12295550101',
      address:             '312 Hudson St, Plains, GA 31780',
      zip:                 '31780',
      county:              'Sumter',
      medicaid_id:         'GA-2024-557823',
      va_status:           false,
      insurance_info:      {
        type:      'Medicare',
        carrier:   'CMS',
        member_id: '1EG4-TE5-MK72',
        plan:      'Part A + Part B',
      },
      income_level:        'low',        // ~$640/mo Social Security
      navigator_id:        navigator.id,
      subscription_tier:   'standard',
      subscription_status: 'active',
      notes: [
        'SNAP enrolled (case #GA-2024-SNAP-44821).',
        'Dual-eligible Medicare/Medicaid.',
        'Lives alone — no transportation. Daughter Keisha (Atlanta) is family proxy.',
        'Prefers morning appointments before 11am.',
        'Hard of hearing — speak clearly, no phone calls after 8pm.',
      ].join(' '),
    })
    .select('id')
    .single()
  assertOk(clientErr, 'insert client')
  const clientId = clientRow!.id as string
  ok(`Willie Mae Johnson  ·  312 Hudson St, Plains GA 31780  ·  id: ${clientId.slice(0, 8)}…`)
  ok('Medicaid: GA-2024-557823  ·  Medicare: 1EG4-TE5-MK72  ·  Subscription: Standard/active')

  // ── 5. Family proxy ───────────────────────────────────────────────────────
  step('Creating family proxy (Keisha Johnson, daughter)…')
  const familyProxy = await createAuthUser('family@pathway.app', 'PathwayFam2024!', {
    role:  'family_proxy',
    name:  'Keisha Johnson',
    phone: '+14045550210',
  })
  const { error: proxyErr } = await supabase.from('family_proxies').insert({
    id:           familyProxy.id,
    client_id:    clientId,
    relationship: 'child',
  })
  assertOk(proxyErr, 'insert family_proxy')
  // Back-reference from client → proxy (deferred FK set after both rows exist).
  await supabase.from('clients').update({ family_proxy_id: familyProxy.id }).eq('id', clientId)
  ok(`family@pathway.app  ·  Keisha Johnson  ·  daughter  ·  id: ${familyProxy.id.slice(0, 8)}…`)

  // ── 6. Ambassador ─────────────────────────────────────────────────────────
  step('Creating ambassador (Rev. Clarence Davis, First Baptist Plains)…')
  //
  // Ambassadors have no auth account — they access their dashboard via UUID link.
  // The referral_code is set manually here; normally auto-generated by trigger.
  //
  const { data: ambRow, error: ambErr } = await supabase
    .from('ambassadors')
    .insert({
      name:             'Rev. Clarence Davis',
      phone:            '+12295550099',
      email:            'clarence@firstbaptistplains.org',
      referral_code:    'PLAINS1',
      county:           'Sumter',
      zip:              '31780',
      total_referrals:  1,
      active_referrals: 1,
      total_earned:     30.00,   // $20 signup + $10 first month retention
      active:           true,
    })
    .select('id, referral_code, auth_token')
    .single()
  assertOk(ambErr, 'insert ambassador')
  const ambId        = ambRow!.id as string
  const referralCode = ambRow!.referral_code as string
  const authToken    = ambRow!.auth_token as string
  ok(`Rev. Clarence Davis  ·  referral code: ${referralCode}  ·  id: ${ambId.slice(0, 8)}…`)
  ok(`Ambassador dashboard: /ambassador/${authToken}`)

  // ── 7. Link client ↔ ambassador via referral record ───────────────────────
  step('Linking client to ambassador (referral activated 14 days ago)…')
  await supabase.from('clients').update({ ambassador_id: ambId }).eq('id', clientId)

  const { error: refErr } = await supabase.from('referrals').insert({
    ambassador_id:        ambId,
    client_id:            clientId,
    activated_at:         iso(daysAgo(14)),   // triggered when first session SMS sent
    months_paid:          1,                  // one retention bonus paid so far
    signup_bonus_paid:    true,
    signup_bonus_paid_at: iso(daysAgo(14)),
    total_bonus_paid:     30.00,              // $20 signup + $10 month-1 retention
  })
  assertOk(refErr, 'insert referral')

  // Record the two ledger events that match total_earned above.
  const ledgerEvents = [
    { type: 'ambassador_signup',    amount: 20.00, dt: daysAgo(14) },
    { type: 'ambassador_retention', amount: 10.00, dt: daysAgo(1)  },
  ]
  for (const ev of ledgerEvents) {
    await supabase.from('payout_ledger').insert({
      recipient_type: 'ambassador',
      recipient_id:   ambId,
      event_type:     ev.type,
      reference_id:   clientId,
      gross_amount:   ev.amount,
      platform_fee:   0,
      net_amount:     ev.amount,
      period_start:   dateStr(ev.dt),
      period_end:     dateStr(ev.dt),
    })
  }
  ok('Referral record: signup bonus $20 paid + 1 month retention $10 paid')
  ok('Payout ledger: 2 entries (ambassador_signup + ambassador_retention)')

  // ── 8. Benefits screening ─────────────────────────────────────────────────
  step('Creating benefits screening results…')
  const { error: screenErr } = await supabase.from('benefits_screenings').insert({
    client_id:    clientId,
    navigator_id: navigator.id,
    answers: {
      snap:            true,   // income below 130% federal poverty
      medicare:        true,   // age 65+, Part A + B enrolled
      medicaid:        true,   // dual-eligible
      va_benefits:     false,  // no military service
      liheap:          true,   // income-eligible for utility assistance
      ssi:             false,  // income slightly above SSI threshold
      housing_subsidy: false,  // owns home outright
      acp_broadband:   true,   // income-eligible for Affordable Connectivity Program
    },
    recommended_programs: [
      'SNAP',
      'Medicare Savings Program',
      'LIHEAP',
      'ACP Broadband',
    ],
    completed_at: iso(daysAgo(14)),
  })
  assertOk(screenErr, 'insert benefits_screening')
  ok('Screener complete  ·  SNAP ✓  Medicare ✓  LIHEAP ✓  ACP Broadband ✓')

  // ── 9. Concierge session ──────────────────────────────────────────────────
  step('Creating initial concierge session (14 days ago, 75 min)…')
  const { error: sessErr } = await supabase.from('sessions').insert({
    client_id:        clientId,
    navigator_id:     navigator.id,
    date:             dateStr(daysAgo(14)),
    duration_minutes: 75,
    tasks_completed:  ['LIHEAP Utility Assistance Application'],
    notes: [
      'Initial enrollment session at client home.',
      'Completed full benefits screener — flagged SNAP, Medicare Savings, LIHEAP, ACP.',
      'Applied for LIHEAP online via Georgia DHS portal (case #2024-LIHEAP-88432).',
      'Compared Medicare Part D plans on Plan Finder; WellCare Value Script saves ~$28/mo.',
      'Scanned and uploaded SSN card and Medicare card.',
      'Family proxy Keisha Johnson introduced — proxy account to be activated.',
    ].join(' '),
    sms_summary_sent: true,   // triggers referral activation check (handled by DB trigger)
  })
  assertOk(sessErr, 'insert session')
  ok('Session logged  ·  sms_summary_sent=true  ·  referral activation triggered')

  // ── 10. Tasks ─────────────────────────────────────────────────────────────
  step('Creating 3 tasks (pending / in_progress / completed)…')

  // Task 1 — PENDING
  const { error: t1Err } = await supabase.from('tasks').insert({
    client_id:    clientId,
    navigator_id: navigator.id,
    category:     'government_benefits',
    title:        'Apply for SNAP (Food Stamps)',
    status:       'pending',
    steps: [
      {
        id:        'step-1a',
        content:   'Collected SSN card and income documentation (Social Security award letter)',
        timestamp: iso(daysAgo(14)),
      },
    ],
    notes: [
      'Georgia DFCS SNAP application — client meets income criteria ($640/mo Social Security, 1-person HH).',
      'Still needs: proof of residence (utility bill or lease), completed GA-DHS Form 826.',
      'Next step: navigator to bring printed form to next in-person visit.',
    ].join(' '),
  })
  assertOk(t1Err, 'insert task 1')
  ok('Task 1  [pending]   Apply for SNAP (Food Stamps)')

  // Task 2 — IN PROGRESS
  const { error: t2Err } = await supabase.from('tasks').insert({
    client_id:    clientId,
    navigator_id: navigator.id,
    category:     'medicare_insurance',
    title:        'Medicare Part D Plan Review & Switch',
    status:       'in_progress',
    steps: [
      {
        id:        'step-2a',
        content:   'Reviewed current plan: Humana Enhanced ($47.50/mo, $400 deductible)',
        timestamp: iso(daysAgo(14)),
      },
      {
        id:        'step-2b',
        content:   'Compared 3 alternatives on Medicare Plan Finder — WellCare Value Script saves ~$28/mo for metformin, lisinopril, atorvastatin',
        timestamp: iso(daysAgo(7)),
      },
      {
        id:        'step-2c',
        content:   'Scheduled call with Georgia CARES SHIP counselor for Oct 18 — open enrollment Oct 15–Dec 7',
        timestamp: iso(daysAgo(3)),
      },
    ],
    notes: [
      'WellCare Value Script ($19.40/mo) covers all 3 of her generics at Tier 1/2.',
      'Enrollment window: Oct 15–Dec 7. New plan effective Jan 1.',
      'Client agreed to switch pending SHIP counselor confirmation.',
    ].join(' '),
  })
  assertOk(t2Err, 'insert task 2')
  ok('Task 2  [in_progress]  Medicare Part D Plan Review  (3 steps logged)')

  // Task 3 — COMPLETED
  const { error: t3Err } = await supabase.from('tasks').insert({
    client_id:    clientId,
    navigator_id: navigator.id,
    category:     'utility_broadband',
    title:        'LIHEAP Utility Assistance Application',
    status:       'completed',
    completed_at: iso(daysAgo(7)),
    steps: [
      {
        id:        'step-3a',
        content:   'Gathered documents: photo ID, most recent Georgia Power bill, SSN card',
        timestamp: iso(daysAgo(14)),
      },
      {
        id:        'step-3b',
        content:   'Submitted LIHEAP application online via Georgia DHS portal — case #2024-LIHEAP-88432',
        timestamp: iso(daysAgo(14)),
      },
      {
        id:        'step-3c',
        content:   'Received email confirmation from DHS — processing 5–7 business days',
        timestamp: iso(daysAgo(13)),
      },
      {
        id:        'step-3d',
        content:   'APPROVED — $400 credited directly to Georgia Power account. Client notified by SMS.',
        timestamp: iso(daysAgo(7)),
      },
    ],
    notes: 'Application approved. $400 applied to Georgia Power account ending 4421. Eligible to reapply next calendar year.',
  })
  assertOk(t3Err, 'insert task 3')
  ok('Task 3  [completed ✓]  LIHEAP Application  ·  $400 approved to Georgia Power')

  // ── 11. Scheduled NEMT trip (4 business days out) ────────────────────────
  step('Creating scheduled NEMT trip (4 business days from today)…')
  //
  // Georgia Verida requires 3-business-day advance booking.
  // nemt_trips.scheduled_datetime > NOW() is a DB CHECK constraint.
  //
  const nemtDatetime = businessDaysFromNow(4)
  const nemtReturn   = new Date(nemtDatetime.getTime() + 2 * 60 * 60 * 1000)  // +2h for return

  const { data: nemtRow, error: nemtErr } = await supabase
    .from('nemt_trips')
    .insert({
      client_id:            clientId,
      driver_id:            driver.id,
      booked_by:            navigator.id,
      trip_type:            'ambulatory',
      pickup_address:       '312 Hudson St, Plains, GA 31780',
      appointment_address:  'Sumter Regional Medical Center, 126 Highway 280 W, Americus, GA 31709',
      appointment_provider: 'Dr. James Carter, MD — Internal Medicine',
      appointment_type:     'Primary Care',
      scheduled_datetime:   iso(nemtDatetime),
      return_included:      true,
      return_pickup_time:   iso(nemtReturn),
      medicaid_id:          'GA-2024-557823',
      booking_source:       'navigator',
      base_fee:             29.50,
      mileage_rate:         0.2250,         // Georgia DCH per-mile reimbursement
      status:               'assigned',
      estimated_duration_min: 120,
      assistance_needed:    null,
      pre_trip_checklist_completed: false,
    })
    .select('id')
    .single()
  assertOk(nemtErr, 'insert nemt_trip')
  const nemtTripId = nemtRow!.id as string

  // Status log: pending → accepted
  await supabase.from('trip_status_log').insert({
    trip_id:    nemtTripId,
    trip_type:  'nemt',
    status:     'pending',
    changed_by: navigator.id,
    note:       'Trip booked by navigator. Medicaid ID GA-2024-557823 confirmed. Return trip included (+2h).',
  })
  await supabase.from('trip_status_log').insert({
    trip_id:    nemtTripId,
    trip_type:  'nemt',
    status:     'accepted',
    changed_by: driver.id,
    note:       `Driver Darnell Hayes accepted. 2019 Toyota Sienna WAV (ambulatory-only trip). GAB-7741.`,
  })

  ok(`NEMT trip  ·  ${nemtDatetime.toDateString()} at 9:00 AM  ·  [assigned]`)
  ok('Route: Plains 31780 → Sumter Regional MC, Americus 31709  ·  Return included at 11:00 AM')
  ok(`id: ${nemtTripId.slice(0, 8)}…  ·  Medicaid: GA-2024-557823  ·  Base fee: $29.50 + $0.2250/mi`)

  // ── 12. Completed errand trip with full status log ────────────────────────
  step('Creating completed errand trip (pharmacy pickup, 2 days ago)…')
  //
  // Plains, GA → Americus, GA (≈ 12 miles one-way).
  // Real GPS coords: Plains ≈ 32.0344° N, 84.3963° W
  //                 Sumter Drugs Americus ≈ 32.0735° N, 84.2318° W
  //
  const errandDate     = daysAgo(2)
  errandDate.setHours(14, 0, 0, 0)   // 2:00 PM
  const errandBase     = errandDate.getTime()

  const { data: errandRow, error: errandErr } = await supabase
    .from('errand_trips')
    .insert({
      client_id:      clientId,
      driver_id:      driver.id,
      booked_by:      navigator.id,
      service_type:   'pharmacy_pickup',
      pickup_address: '312 Hudson St, Plains, GA 31780',
      destination:    'Sumter Drugs, 123 Lee St, Americus, GA 31709',
      instructions:   'Pick up prescriptions for Willie Mae Johnson. Ask for Ms. Betty. Rx been waiting since yesterday. Client will pay with Medicare Part D — no cash needed.',
      status:         'completed',
      flat_rate:      20.00,
      driver_payout:  15.00,          // 75% of flat_rate — computed by DB trigger normally
      booking_source: 'navigator',
      wav_required:   false,
      job_details: {
        pharmacy_name:        'Sumter Drugs',
        pharmacy_address:     '123 Lee St, Americus, GA 31709',
        pharmacy_phone:       '+12297244000',
        rx_ready:             true,
        special_instructions: 'Ask for Ms. Betty at the counter. 3 prescriptions: metformin 500mg, lisinopril 10mg, atorvastatin 20mg.',
      },
      gps_start:    { lat: 32.0735, lng: -84.2318, timestamp: iso(new Date(errandBase + 48 * 60 * 1000)) },
      gps_end:      { lat: 32.0344, lng: -84.3963, timestamp: iso(new Date(errandBase + 62 * 60 * 1000)) },
      scheduled_for: iso(errandDate),
      accepted_at:   iso(new Date(errandBase + 8 * 60 * 1000)),
      completed_at:  iso(new Date(errandBase + 65 * 60 * 1000)),
    })
    .select('id')
    .single()
  assertOk(errandErr, 'insert errand_trip')
  const errandTripId = errandRow!.id as string

  // Full status log — every transition a real pharmacy pickup generates.
  const statusLog = [
    {
      status:     'pending',
      dt:         errandBase,
      by:         navigator.id,
      lat:        null as number | null,
      lng:        null as number | null,
      note:       'Pharmacy pickup booked for Willie Mae Johnson. Sumter Drugs, Americus. Rx ready.',
    },
    {
      status:     'dispatched',
      dt:         errandBase + 2 * 60 * 1000,
      by:         navigator.id,
      lat:        null,
      lng:        null,
      note:       'Dispatched to Darnell Hayes (zone 1 — Sumter County match). ETA 20 min.',
    },
    {
      status:     'accepted',
      dt:         errandBase + 8 * 60 * 1000,
      by:         driver.id,
      lat:        32.0501,
      lng:        -84.3701,
      note:       'Driver accepted. En route to client home. 2019 Toyota Sienna GAB-7741.',
    },
    {
      status:     'en_route_to_pickup',
      dt:         errandBase + 10 * 60 * 1000,
      by:         driver.id,
      lat:        32.0501,
      lng:        -84.3701,
      note:       'Navigating to 312 Hudson St, Plains GA.',
    },
    {
      status:     'departed_for_errand',
      dt:         errandBase + 28 * 60 * 1000,
      by:         driver.id,
      lat:        32.0344,
      lng:        -84.3963,
      note:       'Picked up from client — confirmed client home. Departing for Sumter Drugs, Americus.',
    },
    {
      status:     'errand_complete',
      dt:         errandBase + 48 * 60 * 1000,
      by:         driver.id,
      lat:        32.0735,
      lng:        -84.2318,
      note:       'Prescriptions collected from Ms. Betty: metformin 500mg, lisinopril 10mg, atorvastatin 20mg. Returning to client.',
    },
    {
      status:     'delivered',
      dt:         errandBase + 62 * 60 * 1000,
      by:         driver.id,
      lat:        32.0344,
      lng:        -84.3963,
      note:       'Prescriptions delivered to client at front door. Client confirmed receipt.',
    },
    {
      status:     'completed',
      dt:         errandBase + 65 * 60 * 1000,
      by:         driver.id,
      lat:        null,
      lng:        null,
      note:       'Trip complete. Total time: 65 min. Driver payout: $15.00.',
    },
  ]

  for (const entry of statusLog) {
    const { error: logErr } = await supabase.from('trip_status_log').insert({
      trip_id:    errandTripId,
      trip_type:  'errand',
      status:     entry.status,
      changed_by: entry.by,
      gps_lat:    entry.lat,
      gps_lng:    entry.lng,
      note:       entry.note,
      created_at: iso(new Date(entry.dt)),
    })
    assertOk(logErr, `status_log(${entry.status})`)
  }

  // Payout ledger entry for the completed errand (driver's 75% cut).
  await supabase.from('payout_ledger').insert({
    recipient_type: 'driver',
    recipient_id:   driver.id,
    event_type:     'errand',
    reference_id:   errandTripId,
    gross_amount:   20.00,
    platform_fee:   5.00,    // $5 platform take (25%)
    net_amount:     15.00,   // $15 to driver (75%)
    period_start:   dateStr(errandDate),
    period_end:     dateStr(errandDate),
  })

  ok(`Errand trip  ·  pharmacy_pickup  ·  2 days ago  ·  [completed]  ·  id: ${errandTripId.slice(0, 8)}…`)
  ok(`Route: Plains 31780 → Sumter Drugs, Americus 31709  ·  65 min  ·  $20 flat → $15 driver payout`)
  ok(`Status log: ${statusLog.map(e => e.status).join(' → ')}`)
  ok('Payout ledger: driver errand entry ($15.00 net, unpaid)')

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60))
  console.log('✅  Seed complete!\n')

  console.log('  Test accounts')
  console.log('  ─────────────────────────────────────────────────────')
  console.log('  admin@pathway.app         PathwayAdmin2024!  → /admin')
  console.log('  navigator@pathway.app     PathwayNav2024!    → /nav')
  console.log('  driver@pathway.app        PathwayDrv2024!    → /driver')
  console.log('  family@pathway.app        PathwayFam2024!    → /family')

  console.log('\n  Senior client')
  console.log('  ─────────────────────────────────────────────────────')
  console.log(`  Willie Mae Johnson  ·  312 Hudson St, Plains GA 31780`)
  console.log(`  Medicaid: GA-2024-557823  ·  Medicare: 1EG4-TE5-MK72`)
  console.log(`  id: ${clientId}`)

  console.log('\n  Ambassador dashboard (no login required)')
  console.log('  ─────────────────────────────────────────────────────')
  const appOrigin = SUPABASE_URL.includes('localhost') ? 'http://localhost:5173' : 'http://localhost:5173'
  console.log(`  ${appOrigin}/ambassador/${authToken}`)
  console.log(`  Referral link: ${appOrigin}/join?ref=${referralCode}`)

  console.log('\n  What was seeded')
  console.log('  ─────────────────────────────────────────────────────')
  console.log('  ✓  4 auth users (admin, navigator, driver, family proxy)')
  console.log('  ✓  1 senior client — Willie Mae Johnson, Plains GA')
  console.log('  ✓  1 ambassador — Rev. Clarence Davis, referral code PLAINS1')
  console.log('  ✓  1 benefits screening (SNAP + Medicare + LIHEAP flagged)')
  console.log('  ✓  1 concierge session (75 min, 14 days ago)')
  console.log('  ✓  3 tasks: pending → in_progress → completed')
  console.log('  ✓  1 NEMT trip (ambulatory, 4 business days out, assigned)')
  console.log('  ✓  1 errand trip (pharmacy pickup, completed 2 days ago)')
  console.log('  ✓  8-step errand status log (pending → completed)')
  console.log('  ✓  3 payout ledger entries (driver $15 + ambassador $20 + $10)')
  console.log('  ✓  1 referral record (activated, 1 month retention paid)')

  console.log('\n  Run the app: cd app && npm run dev')
  console.log('═'.repeat(60) + '\n')
}

main().catch(err => {
  console.error('\n❌  Seed failed:', (err as Error).message ?? err)
  process.exit(1)
})
