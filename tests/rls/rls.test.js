/**
 * Pathway RLS Integration Tests
 *
 * Runs against a live Supabase project using real auth sessions.
 * Creates isolated test users, seeds data, verifies access control,
 * then deletes everything.
 *
 * Usage:
 *   SUPABASE_URL=https://xyz.supabase.co \
 *   SUPABASE_ANON_KEY=eyJ... \
 *   SUPABASE_SERVICE_KEY=eyJ... \
 *   node rls.test.js
 *
 * The service key is needed only for seeding/teardown (bypasses RLS).
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL         = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY')
  process.exit(1)
}

// Admin client: bypasses RLS (used for seeding and teardown)
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
const results = []
let passed = 0, failed = 0

async function test(name, fn) {
  try {
    await fn()
    results.push({ name, result: 'PASS', detail: '' })
    passed++
    process.stdout.write(`  ✓ ${name}\n`)
  } catch (err) {
    results.push({ name, result: 'FAIL', detail: err.message })
    failed++
    process.stdout.write(`  ✗ ${name}\n    ${err.message}\n`)
  }
}

function expect(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ---------------------------------------------------------------------------
// Test users (email+password auth)
// ---------------------------------------------------------------------------
const SUFFIX   = `test-${Date.now()}`
const PASS     = 'PathwayTest!2026'
const EMAILS   = {
  admin:   `admin-${SUFFIX}@pathway.test`,
  nav1:    `nav1-${SUFFIX}@pathway.test`,
  nav2:    `nav2-${SUFFIX}@pathway.test`,
  driver:  `drv1-${SUFFIX}@pathway.test`,
  proxy:   `prx1-${SUFFIX}@pathway.test`,
}

const ids = {}      // filled by setup
const clientIds = {}

// ---------------------------------------------------------------------------
// Setup: create auth users + seed data via admin client
// ---------------------------------------------------------------------------
async function setup() {
  process.stdout.write('\n── Setup ──────────────────────────────────────\n')

  // Create auth users
  for (const [key, email] of Object.entries(EMAILS)) {
    const role = key === 'admin' ? 'navigator' : key === 'nav1' || key === 'nav2' ? 'navigator'
               : key === 'driver' ? 'driver' : key === 'proxy' ? 'family_proxy' : 'navigator'

    const { data, error } = await admin.auth.admin.createUser({
      email, password: PASS,
      user_metadata: { role: key === 'admin' ? 'navigator' : role, name: `Test ${key}` },
      email_confirm: true,
    })
    if (error) throw new Error(`Failed to create user ${key}: ${error.message}`)
    ids[key] = data.user.id
    process.stdout.write(`  created ${key}: ${data.user.id.slice(0, 8)}…\n`)
  }

  // Promote admin manually (as per platform rules — admin cannot self-assign)
  const { error: roleErr } = await admin
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', ids.admin)
  if (roleErr) throw new Error(`Failed to promote admin: ${roleErr.message}`)

  // Create navigator rows
  await admin.from('navigators').insert([
    { id: ids.nav1, county: 'Sumter', zip_codes: ['31780'], background_check_status: 'approved', training_complete: true, active: true },
    { id: ids.nav2, county: 'Lee',    zip_codes: ['31763'], background_check_status: 'approved', training_complete: true, active: true },
  ])

  // Create driver row
  await admin.from('drivers').insert([
    { id: ids.driver, county: 'Sumter', background_check_status: 'approved', active: true },
  ])

  // Create two clients — nav1 owns client1, nav2 owns client2
  const { data: c1 } = await admin.from('clients').insert({
    name: 'Rosa Mae Johnson', phone: `+15550001${Date.now() % 1000}`,
    navigator_id: ids.nav1, subscription_status: 'active',
  }).select('id').single()
  clientIds.c1 = c1.id

  const { data: c2 } = await admin.from('clients').insert({
    name: 'Earl Washington', phone: `+15550002${Date.now() % 1000}`,
    navigator_id: ids.nav2, subscription_status: 'active',
  }).select('id').single()
  clientIds.c2 = c2.id

  // Create family proxy link: proxy → client1 (nav1's client)
  await admin.from('family_proxies').insert({
    id: ids.proxy, client_id: clientIds.c1, relationship: 'child',
  })

  process.stdout.write(`  clients: c1=${clientIds.c1.slice(0, 8)}… (nav1), c2=${clientIds.c2.slice(0, 8)}… (nav2)\n`)
}

// ---------------------------------------------------------------------------
// Helper: sign in as a user and return a role-scoped client
// ---------------------------------------------------------------------------
async function signInAs(key) {
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { error } = await anonClient.auth.signInWithPassword({
    email: EMAILS[key], password: PASS
  })
  if (error) throw new Error(`Sign-in as ${key} failed: ${error.message}`)
  return anonClient
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests() {
  process.stdout.write('\n── Tests ───────────────────────────────────────\n')

  // --- NAVIGATOR 1 ---
  const nav1 = await signInAs('nav1')

  await test('Navigator sees their own clients', async () => {
    const { data, error } = await nav1.from('clients').select('id')
    if (error) throw new Error(error.message)
    const ids_ = data.map(r => r.id)
    expect('includes c1', ids_.includes(clientIds.c1), true)
    expect('excludes c2', ids_.includes(clientIds.c2), false)
  })

  await test('Navigator cannot see another navigator\'s client by ID', async () => {
    const { data } = await nav1.from('clients').select('id').eq('id', clientIds.c2)
    expect('row count', data?.length ?? 0, 0)
  })

  await test('Navigator can INSERT a client for their county', async () => {
    const { error } = await nav1.from('clients').insert({
      name: 'New Client Test', phone: `+15550099${Date.now() % 999}`,
      subscription_status: 'inactive',
    })
    // Should succeed (navigator can create clients — they become the navigator)
    if (error) throw new Error(`Insert blocked unexpectedly: ${error.message}`)
  })

  await test('Navigator sees only active drivers', async () => {
    // Create an inactive driver via admin
    const { data: inactiveUser } = await admin.auth.admin.createUser({
      email: `inactive-drv-${SUFFIX}@pathway.test`, password: PASS,
      user_metadata: { role: 'driver', name: 'Inactive Driver' }, email_confirm: true,
    })
    ids.inactiveDriver = inactiveUser.user.id
    await admin.from('drivers').insert({ id: ids.inactiveDriver, county: 'Sumter', background_check_status: 'approved', active: false })

    const { data } = await nav1.from('drivers').select('id, active')
    const saw = data?.find(d => d.id === ids.inactiveDriver)
    expect('inactive driver hidden', saw, undefined)
  })

  // --- NAVIGATOR 2 ---
  const nav2 = await signInAs('nav2')

  await test('Navigator 2 cannot see Navigator 1\'s clients', async () => {
    const { data } = await nav2.from('clients').select('id').eq('id', clientIds.c1)
    expect('row count', data?.length ?? 0, 0)
  })

  // --- FAMILY PROXY ---
  const proxy = await signInAs('proxy')

  await test('Family proxy sees their linked client', async () => {
    const { data, error } = await proxy.from('clients').select('id').eq('id', clientIds.c1)
    if (error) throw new Error(error.message)
    expect('sees c1', data?.length ?? 0, 1)
  })

  await test('Family proxy CANNOT read another client\'s data (c2)', async () => {
    const { data } = await proxy.from('clients').select('id').eq('id', clientIds.c2)
    expect('blocked from c2', data?.length ?? 0, 0)
  })

  await test('Family proxy cannot read c2 sessions', async () => {
    // Seed a session for c2 via admin
    const { data: sess } = await admin.from('sessions').insert({
      client_id: clientIds.c2, navigator_id: ids.nav2,
      date: new Date().toISOString().split('T')[0], duration_minutes: 30,
    }).select('id').single()

    const { data } = await proxy.from('sessions').select('id').eq('id', sess?.id)
    expect('session hidden', data?.length ?? 0, 0)
  })

  await test('Family proxy cannot read c2 documents', async () => {
    const { data: doc } = await admin.from('documents').insert({
      client_id: clientIds.c2, document_type: 'other',
      file_url: 'test/placeholder.pdf',
    }).select('id').single()

    const { data } = await proxy.from('documents').select('id').eq('id', doc?.id)
    expect('document hidden', data?.length ?? 0, 0)
  })

  await test('Family proxy cannot INSERT a family_proxy row for c2 (PHI attack)', async () => {
    const { error } = await proxy.from('family_proxies').insert({
      id: ids.proxy,         // their own id
      client_id: clientIds.c2,  // pointing to c2 — should be blocked
      relationship: 'other',
    })
    // Must fail (RLS blocks, or unique constraint on client_id fires)
    if (!error) throw new Error('DANGER: proxy self-linked to c2 — PHI access gained')
  })

  // --- DRIVER ---
  const driver = await signInAs('driver')

  await test('Driver cannot read clients table', async () => {
    const { data } = await driver.from('clients').select('id')
    expect('no clients', data?.length ?? 0, 0)
  })

  await test('Driver can read their own profile', async () => {
    const { data, error } = await driver.from('profiles').select('id').eq('id', ids.driver)
    if (error) throw new Error(error.message)
    expect('sees own profile', data?.length ?? 0, 1)
  })

  // --- ADMIN ---
  const adminClient = await signInAs('admin')

  await test('Admin sees all clients', async () => {
    const { data, error } = await adminClient.from('clients').select('id')
    if (error) throw new Error(error.message)
    const allIds = data.map(r => r.id)
    expect('sees c1', allIds.includes(clientIds.c1), true)
    expect('sees c2', allIds.includes(clientIds.c2), true)
  })

  await test('Admin can read all drivers including inactive', async () => {
    const { data } = await adminClient.from('drivers').select('id, active')
    const sawInactive = data?.some(d => !d.active)
    expect('sees inactive drivers', sawInactive, true)
  })

  // --- UNAUTHENTICATED ---
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  await test('Unauthenticated user sees no clients', async () => {
    const { data } = await anon.from('clients').select('id')
    expect('zero rows', data?.length ?? 0, 0)
  })

  await test('Unauthenticated user sees no profiles', async () => {
    const { data } = await anon.from('profiles').select('id')
    expect('zero rows', data?.length ?? 0, 0)
  })
}

// ---------------------------------------------------------------------------
// Teardown: delete all test data
// ---------------------------------------------------------------------------
async function teardown() {
  process.stdout.write('\n── Teardown ────────────────────────────────────\n')

  // Delete in FK-safe order
  await admin.from('documents').delete().in('client_id', Object.values(clientIds))
  await admin.from('sessions').delete().in('client_id', Object.values(clientIds))
  await admin.from('family_proxies').delete().in('client_id', Object.values(clientIds))
  await admin.from('clients').delete().like('phone', `+1555009%`)  // test inserts
  await admin.from('clients').delete().in('id', Object.values(clientIds))
  await admin.from('drivers').delete().in('id', [ids.driver, ids.inactiveDriver].filter(Boolean))
  await admin.from('navigators').delete().in('id', [ids.nav1, ids.nav2])

  for (const uid of Object.values(ids)) {
    await admin.auth.admin.deleteUser(uid).catch(() => {})
  }
  process.stdout.write('  done\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  process.stdout.write('Pathway RLS Integration Tests\n')
  process.stdout.write(`Target: ${SUPABASE_URL}\n`)

  try {
    await setup()
    await runTests()
  } finally {
    await teardown()
  }

  process.stdout.write('\n── Results ─────────────────────────────────────\n')
  for (const r of results) {
    process.stdout.write(`  ${r.result === 'PASS' ? '✓' : '✗'} ${r.name}${r.detail ? `\n    ${r.detail}` : ''}\n`)
  }
  process.stdout.write(`\n${passed} passed, ${failed} failed\n\n`)

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
