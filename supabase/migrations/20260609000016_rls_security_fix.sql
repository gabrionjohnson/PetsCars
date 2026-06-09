-- =============================================================================
-- Migration 000016: RLS Security Fix + Schema Gap Repair
--
-- CRITICAL EXPOSURE FIXED:
--   zip_county_map was created in migration 010 without ENABLE ROW LEVEL
--   SECURITY. Anyone with the anon key could read, insert, update, or delete
--   ZIP→county routing rows — poisoning which navigator receives new senior
--   leads from the Twilio SMS webhook.
--
-- HARDENING:
--   platform_config "rates" read policy had no TO clause — anon-readable.
--   Restricted to authenticated users only.
--
-- SCHEMA BUGS FIXED (discovered during audit):
--   benefits_screenings.results JSONB — screener v2 saves EligibilityResult[]
--     objects; the existing recommended_programs TEXT[] column is incompatible.
--     ClientProfilePage queries "results"; BenefitsScreenerPage saves to
--     "recommended_programs" with the wrong type — both now use "results".
--   tasks.due_date DATE — DashboardPage queries .lt('due_date', today) but
--     this column did not exist.
--   tasks.priority TEXT — BenefitsScreenerPage inserts a priority field that
--     did not exist in the schema.
--
-- CONFIRMED NOT AFFECTED:
--   sms_failures, stripe_processed_events — SELECT-only policies are correct.
--   INSERT on these tables is done exclusively by Edge Functions using the
--   service_role key, which bypasses RLS by design. Direct inserts from the
--   frontend (anon/authenticated) are correctly blocked.
--   payout_ledger — append-only via add_ledger_row() SECURITY DEFINER. No
--   INSERT/UPDATE/DELETE policies required or desired.
--   getPublicUrl() — confirmed zero calls in app/src (grep clean). All
--   document access uses createSignedUrl() with expiry.
-- =============================================================================

-- ── 1. zip_county_map — ENABLE ROW LEVEL SECURITY ─────────────────────────────
--
-- This table holds non-PHI geographic configuration (ZIP → county mapping).
-- • Authenticated users: read-only (needed for booking UI and SMS routing)
-- • Admin: full write access
-- • Service role (Edge Functions): bypasses RLS to route incoming SMS leads
-- ---------------------------------------------------------------------------

ALTER TABLE zip_county_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zip_county_map: read by authenticated"
  ON zip_county_map FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "zip_county_map: admin write"
  ON zip_county_map FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── 2. platform_config — restrict rates read to authenticated users only ───────
--
-- Original policy had no TO clause, defaulting to public/anon access.
-- Service rates ($12 pharmacy, $35 ride_and_wait, etc.) are non-PHI but
-- should not be accessible to unauthenticated requests.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "platform_config: read rates" ON platform_config;

CREATE POLICY "platform_config: read rates authenticated"
  ON platform_config FOR SELECT
  TO authenticated
  USING (config_key = 'rates');

-- ── 3. benefits_screenings — add results JSONB column for screener v2 ──────────
--
-- Screener v2 (runAllPrograms) produces EligibilityResult[] objects containing:
--   programId, programName, status, estimatedAnnualValue, estimatedMonthlyValue,
--   tier, tierName, priority, notes, actionLabel
-- These cannot be stored in the legacy recommended_programs TEXT[] column.
--
-- The frontend (ClientProfilePage, BenefitsScreenerPage) targets "results".
-- recommended_programs TEXT[] is kept for v1 backward compatibility only.
-- ---------------------------------------------------------------------------

ALTER TABLE benefits_screenings
  ADD COLUMN IF NOT EXISTS results JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN benefits_screenings.results IS
  'Screener v2: serialized EligibilityResult[] from runAllPrograms(). '
  'Fields: programId, programName, status, estimatedAnnualValue, '
  'estimatedMonthlyValue, tier, tierName, priority, notes, actionLabel. '
  'Legacy recommended_programs TEXT[] preserved for v1 backward compat.';

-- ── 4. tasks — add due_date and priority columns ───────────────────────────────
--
-- DashboardPage queries .lt('due_date', today) to find overdue tasks.
-- BenefitsScreenerPage inserts priority ('high'/'medium'/'low') when creating
-- tasks from screener results.
-- Both columns were missing from the original schema (migration 002).
-- ---------------------------------------------------------------------------

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS priority TEXT
    CHECK (priority IN ('high', 'medium', 'low') OR priority IS NULL);

COMMENT ON COLUMN tasks.due_date IS
  'Optional deadline for the task. Used by DashboardPage to surface overdue tasks.';

COMMENT ON COLUMN tasks.priority IS
  'Screener-assigned priority: high (tier 1 programs), medium (tier 2), low (tier 3+).';

-- Index for overdue task queries (DashboardPage loads this on every render)
CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON tasks (due_date)
  WHERE due_date IS NOT NULL AND status NOT IN ('completed', 'canceled');

-- ── 5. VERIFICATION QUERIES ────────────────────────────────────────────────────
-- Run these in the Supabase SQL editor after applying this migration.
--
-- A. Confirm zero tables with RLS disabled:
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public' AND rowsecurity = false;
--    → MUST return 0 rows
--
-- B. Confirm every RLS-enabled table has at least one policy:
--    SELECT t.tablename, COUNT(p.policyname) AS policy_count
--    FROM pg_tables t
--    LEFT JOIN pg_policies p
--      ON p.tablename = t.tablename AND p.schemaname = 'public'
--    WHERE t.schemaname = 'public' AND t.rowsecurity = true
--    GROUP BY t.tablename
--    HAVING COUNT(p.policyname) = 0;
--    → MUST return 0 rows
--
-- C. Confirm Storage buckets are private:
--    SELECT id, name, public FROM storage.buckets;
--    → client-documents: public = false
--    → nemt-signatures:  public = false
--
-- D. Confirm no anon access to platform_config rates:
--    SET LOCAL ROLE anon;
--    SELECT * FROM platform_config WHERE config_key = 'rates';
--    → MUST return 0 rows (anon should be blocked)
--    RESET ROLE;
-- =============================================================================
