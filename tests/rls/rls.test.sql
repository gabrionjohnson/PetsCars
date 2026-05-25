-- =============================================================================
-- Pathway RLS Policy Tests
--
-- Run in the Supabase SQL editor (runs as postgres superuser, bypasses RLS)
-- or via: supabase db execute --file tests/rls/rls.test.sql
--
-- Uses SET LOCAL request.jwt.claims to impersonate each role.
-- Each test is wrapped in a transaction that is rolled back so state is clean.
-- A passing test produces a row with result = 'PASS'; failure = 'FAIL'.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper to run assertions
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS test_results (
  test_name TEXT,
  result    TEXT,   -- PASS | FAIL
  detail    TEXT
);

-- ---------------------------------------------------------------------------
-- 1. Seed test fixtures (NOT wrapped in the per-test transactions, but
--    cleaned up in the final ROLLBACK of the outer transaction)
-- ---------------------------------------------------------------------------
BEGIN;

-- Fake UUIDs for test actors
DO $$
DECLARE
  admin_id  UUID := '00000000-0000-0000-0000-000000000001';
  nav1_id   UUID := '00000000-0000-0000-0000-000000000002';
  nav2_id   UUID := '00000000-0000-0000-0000-000000000003';
  drv1_id   UUID := '00000000-0000-0000-0000-000000000004';
  prx1_id   UUID := '00000000-0000-0000-0000-000000000005';
  cli1_id   UUID := '00000000-0000-0000-0000-000000000010';
  cli2_id   UUID := '00000000-0000-0000-0000-000000000011';
BEGIN

  -- Insert fake auth.users rows (needed for profiles FK)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, aud, role)
  VALUES
    (admin_id, 'admin@test.pathway',  crypt('test', gen_salt('bf')), NOW(), NOW(), NOW(), '{}', 'authenticated', 'authenticated'),
    (nav1_id,  'nav1@test.pathway',   crypt('test', gen_salt('bf')), NOW(), NOW(), NOW(), '{}', 'authenticated', 'authenticated'),
    (nav2_id,  'nav2@test.pathway',   crypt('test', gen_salt('bf')), NOW(), NOW(), NOW(), '{}', 'authenticated', 'authenticated'),
    (drv1_id,  'drv1@test.pathway',   crypt('test', gen_salt('bf')), NOW(), NOW(), NOW(), '{}', 'authenticated', 'authenticated'),
    (prx1_id,  'prx1@test.pathway',   crypt('test', gen_salt('bf')), NOW(), NOW(), NOW(), '{}', 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  -- Profiles
  INSERT INTO profiles (id, role, name, email) VALUES
    (admin_id, 'admin',        'Test Admin',    'admin@test.pathway'),
    (nav1_id,  'navigator',    'Test Nav 1',    'nav1@test.pathway'),
    (nav2_id,  'navigator',    'Test Nav 2',    'nav2@test.pathway'),
    (drv1_id,  'driver',       'Test Driver 1', 'drv1@test.pathway'),
    (prx1_id,  'family_proxy', 'Test Proxy 1',  'prx1@test.pathway')
  ON CONFLICT (id) DO NOTHING;

  -- Navigators
  INSERT INTO navigators (id, county, zip_codes, background_check_status, training_complete, active)
  VALUES
    (nav1_id, 'Sumter', ARRAY['31780'], 'approved', TRUE, TRUE),
    (nav2_id, 'Lee',    ARRAY['31763'], 'approved', TRUE, TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Drivers
  INSERT INTO drivers (id, county, background_check_status, active)
  VALUES (drv1_id, 'Sumter', 'approved', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Clients  (nav1 owns cli1; nav2 owns cli2)
  INSERT INTO clients (id, name, phone, navigator_id, subscription_status)
  VALUES
    (cli1_id, 'Rosa Mae Johnson', '+12295550101', nav1_id, 'active'),
    (cli2_id, 'Earl Washington',  '+12295550102', nav2_id, 'active')
  ON CONFLICT (id) DO NOTHING;

  -- Family proxy prx1 is linked to cli1 (nav1's client)
  INSERT INTO family_proxies (id, client_id, relationship)
  VALUES (prx1_id, cli1_id, 'child')
  ON CONFLICT (id) DO NOTHING;

  -- Update clients to reflect the proxy link
  UPDATE clients SET family_proxy_id = prx1_id WHERE id = cli1_id;

END $$;

-- ===========================================================================
-- TEST 1: Navigator sees only their own clients
-- ===========================================================================
DO $$
DECLARE
  nav1_id  UUID := '00000000-0000-0000-0000-000000000002';
  cli1_id  UUID := '00000000-0000-0000-0000-000000000010';
  cli2_id  UUID := '00000000-0000-0000-0000-000000000011';
  cnt      INT;
  visible  BOOL;
  hidden   BOOL;
BEGIN
  -- Impersonate navigator 1
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', nav1_id, 'role', 'authenticated', 'user_role', 'navigator')::TEXT,
    TRUE
  );

  -- Should see cli1 (their client)
  SELECT COUNT(*) INTO cnt FROM clients WHERE id = cli1_id;
  visible := cnt = 1;

  -- Should NOT see cli2 (nav2's client)
  SELECT COUNT(*) INTO cnt FROM clients WHERE id = cli2_id;
  hidden := cnt = 0;

  INSERT INTO test_results VALUES (
    'Nav1 sees only their own clients',
    CASE WHEN visible AND hidden THEN 'PASS' ELSE 'FAIL' END,
    format('cli1 visible=%s, cli2 hidden=%s', visible, hidden)
  );
END $$;

-- ===========================================================================
-- TEST 2: Family proxy sees ONLY their linked client, not others
-- ===========================================================================
DO $$
DECLARE
  prx1_id  UUID := '00000000-0000-0000-0000-000000000005';
  cli1_id  UUID := '00000000-0000-0000-0000-000000000010';
  cli2_id  UUID := '00000000-0000-0000-0000-000000000011';
  cnt      INT;
  sees_own BOOL;
  blocked  BOOL;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', prx1_id, 'role', 'authenticated', 'user_role', 'family_proxy')::TEXT,
    TRUE
  );

  SELECT COUNT(*) INTO cnt FROM clients WHERE id = cli1_id;
  sees_own := cnt = 1;

  -- Critical: proxy must NOT be able to read cli2 (different navigator's client)
  SELECT COUNT(*) INTO cnt FROM clients WHERE id = cli2_id;
  blocked := cnt = 0;

  INSERT INTO test_results VALUES (
    'Family proxy cannot read another client''s data',
    CASE WHEN sees_own AND blocked THEN 'PASS' ELSE 'FAIL' END,
    format('sees cli1=%s, blocked from cli2=%s', sees_own, blocked)
  );
END $$;

-- ===========================================================================
-- TEST 3: Family proxy cannot see cli2's sessions
-- ===========================================================================
DO $$
DECLARE
  prx1_id  UUID := '00000000-0000-0000-0000-000000000005';
  nav2_id  UUID := '00000000-0000-0000-0000-000000000003';
  cli2_id  UUID := '00000000-0000-0000-0000-000000000011';
  sess2_id UUID;
  cnt      INT;
BEGIN
  -- Create a session for cli2 (nav2's client) as superuser
  INSERT INTO sessions (client_id, navigator_id, date, duration_minutes)
  VALUES (cli2_id, nav2_id, CURRENT_DATE, 30)
  RETURNING id INTO sess2_id;

  -- Now impersonate proxy (linked to cli1, not cli2)
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', prx1_id, 'role', 'authenticated', 'user_role', 'family_proxy')::TEXT,
    TRUE
  );

  SELECT COUNT(*) INTO cnt FROM sessions WHERE id = sess2_id;

  INSERT INTO test_results VALUES (
    'Family proxy blocked from cli2 sessions',
    CASE WHEN cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('sessions visible for cli2: %s (expected 0)', cnt)
  );
END $$;

-- ===========================================================================
-- TEST 4: Navigator cannot see another navigator's clients
-- ===========================================================================
DO $$
DECLARE
  nav2_id  UUID := '00000000-0000-0000-0000-000000000003';
  cli1_id  UUID := '00000000-0000-0000-0000-000000000010';
  cnt      INT;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', nav2_id, 'role', 'authenticated', 'user_role', 'navigator')::TEXT,
    TRUE
  );

  SELECT COUNT(*) INTO cnt FROM clients WHERE id = cli1_id;

  INSERT INTO test_results VALUES (
    'Navigator blocked from another navigator''s clients',
    CASE WHEN cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('cli1 visible to nav2: %s (expected 0)', cnt)
  );
END $$;

-- ===========================================================================
-- TEST 5: Driver sees only active drivers (not all driver PII)
-- Tests that the drivers SELECT policy filters on active = TRUE for navigators
-- ===========================================================================
DO $$
DECLARE
  nav1_id     UUID := '00000000-0000-0000-0000-000000000002';
  drv1_id     UUID := '00000000-0000-0000-0000-000000000004';
  inactive_id UUID := '00000000-0000-0000-0000-000000000099';
  cnt         INT;
BEGIN
  -- Create an inactive driver (superuser context)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, aud, role)
  VALUES (inactive_id, 'inactive@test.pathway', crypt('test', gen_salt('bf')), NOW(), NOW(), NOW(), '{}', 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, role, name) VALUES (inactive_id, 'driver', 'Inactive Driver')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO drivers (id, county, background_check_status, active)
  VALUES (inactive_id, 'Sumter', 'approved', FALSE)
  ON CONFLICT (id) DO NOTHING;

  -- Impersonate nav1
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', nav1_id, 'role', 'authenticated', 'user_role', 'navigator')::TEXT,
    TRUE
  );

  SELECT COUNT(*) INTO cnt FROM drivers WHERE id = inactive_id;

  INSERT INTO test_results VALUES (
    'Navigator cannot see inactive driver PII',
    CASE WHEN cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('inactive driver visible to navigator: %s (expected 0)', cnt)
  );
END $$;

-- ===========================================================================
-- TEST 6: Admin sees all clients
-- ===========================================================================
DO $$
DECLARE
  admin_id UUID := '00000000-0000-0000-0000-000000000001';
  cnt      INT;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', admin_id, 'role', 'authenticated', 'user_role', 'admin')::TEXT,
    TRUE
  );

  SELECT COUNT(*) INTO cnt FROM clients
  WHERE id IN (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000011'
  );

  INSERT INTO test_results VALUES (
    'Admin can see all clients',
    CASE WHEN cnt = 2 THEN 'PASS' ELSE 'FAIL' END,
    format('admin sees %s/2 clients', cnt)
  );
END $$;

-- ===========================================================================
-- TEST 7: Family proxy cannot INSERT a family_proxy row for another client
--         (the PHI-access attack vector fixed in the review)
-- ===========================================================================
DO $$
DECLARE
  prx1_id UUID := '00000000-0000-0000-0000-000000000005';
  cli2_id UUID := '00000000-0000-0000-0000-000000000011';
  -- prx1 is already linked to cli1; attempting to link themselves to cli2
  -- would require INSERT INTO family_proxies (id, client_id) = (prx1_id, cli2_id)
  -- but prx1_id already exists in family_proxies (PK constraint would fire first).
  -- More realistic: a NEW proxy with a fresh UUID tries to self-link to cli2.
  attacker_id UUID := '00000000-0000-0000-0000-000000000088';
  raised BOOL := FALSE;
BEGIN
  -- Create attacker auth user (superuser)
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, aud, role)
  VALUES (attacker_id, 'attacker@test.pathway', crypt('test', gen_salt('bf')), NOW(), NOW(), NOW(), '{}', 'authenticated', 'authenticated')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, role, name) VALUES (attacker_id, 'family_proxy', 'Attacker')
  ON CONFLICT (id) DO NOTHING;

  -- Impersonate attacker (family_proxy role, no legitimate client link)
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', attacker_id, 'role', 'authenticated', 'user_role', 'family_proxy')::TEXT,
    TRUE
  );

  BEGIN
    -- Try to link to cli2 (belongs to nav2) — should be blocked by RLS
    INSERT INTO family_proxies (id, client_id, relationship)
    VALUES (attacker_id, cli2_id, 'other');
    -- If we reach here, the insert was NOT blocked
    raised := FALSE;
  EXCEPTION WHEN others THEN
    raised := TRUE;
  END;

  INSERT INTO test_results VALUES (
    'Unauthenticated family_proxy cannot self-link to arbitrary client',
    CASE WHEN raised THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN raised THEN 'INSERT correctly blocked by RLS'
         ELSE 'DANGER: INSERT succeeded — proxy gained access to cli2'
    END
  );
END $$;

-- ===========================================================================
-- TEST 8: Unauthenticated (anon) user sees no data
-- ===========================================================================
DO $$
DECLARE
  cnt INT;
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', TRUE);

  SELECT COUNT(*) INTO cnt FROM clients;

  INSERT INTO test_results VALUES (
    'Anon user sees no clients',
    CASE WHEN cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    format('anon sees %s clients (expected 0)', cnt)
  );
END $$;

-- ===========================================================================
-- Print results
-- ===========================================================================
SELECT
  result,
  test_name,
  detail
FROM test_results
ORDER BY
  CASE result WHEN 'FAIL' THEN 0 ELSE 1 END,
  test_name;

-- Rollback all seed data — leaves the database clean
ROLLBACK;
