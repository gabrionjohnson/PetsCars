-- =============================================================================
-- Migration 013: Phase 5 — Growth Layer
--
-- Subscription billing, Stripe Connect payouts (bi-weekly), ambassador
-- referral system, county management, and Navigator territory tables.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend clients — usage counters, contract billing flag, ambassador link
-- ---------------------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS sessions_used_this_period  INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errands_used_this_period   INTEGER  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contract_billing           BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ambassador_id              UUID;  -- FK added after ambassadors table exists (below)

COMMENT ON COLUMN clients.sessions_used_this_period IS
  'Resets to 0 on invoice.paid Stripe webhook. Basic tier limit = 2/period.';
COMMENT ON COLUMN clients.errands_used_this_period IS
  'Resets to 0 on invoice.paid. Standard tier limit = 3/period.';
COMMENT ON COLUMN clients.contract_billing IS
  'True = county DSS or nonprofit contract; bypasses Stripe subscription requirement.';

-- ---------------------------------------------------------------------------
-- 2. Extend ambassadors — auth token (for URL-based dashboard), ZIP, Connect
-- ---------------------------------------------------------------------------
ALTER TABLE ambassadors
  ADD COLUMN IF NOT EXISTS zip              TEXT,
  ADD COLUMN IF NOT EXISTS auth_token       UUID     NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,    -- Stripe Connect Express account
  ADD COLUMN IF NOT EXISTS senior_ambassador BOOLEAN NOT NULL DEFAULT FALSE;

-- auth_token must be unique — used as URL token for dashboard access
CREATE UNIQUE INDEX IF NOT EXISTS ambassadors_auth_token_unique ON ambassadors (auth_token);

COMMENT ON COLUMN ambassadors.auth_token IS
  'UUID used as URL path token for ambassador dashboard (no login required). '
  'pathway.app/ambassador/[auth_token] — must be rotated if compromised.';
COMMENT ON COLUMN ambassadors.senior_ambassador IS
  'True after ambassador refers 5 active clients (triggers $50 tier bonus).';

-- ---------------------------------------------------------------------------
-- 3. Extend referrals — bonus tracking columns
-- ---------------------------------------------------------------------------
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS signup_bonus_paid    BOOLEAN    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS signup_bonus_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tier_bonus_paid      BOOLEAN    NOT NULL DEFAULT FALSE;

-- months_paid column already exists (Phase 1 schema) — maps to retention_months_paid
COMMENT ON COLUMN referrals.months_paid IS
  'Retention bonus months paid (max 6). Incremented by invoice.paid webhook.';
COMMENT ON COLUMN referrals.signup_bonus_paid IS
  'True after $20 signup bonus credited (fires on first Navigator session).';
COMMENT ON COLUMN referrals.tier_bonus_paid IS
  'True after $50 tier bonus credited (ambassador''s 5th active client referral).';

-- ---------------------------------------------------------------------------
-- 4. Payouts — one row per disbursement event
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payouts (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type   TEXT         NOT NULL CHECK (recipient_type IN ('navigator','driver','ambassador')),
  recipient_id     UUID         NOT NULL,
  stripe_transfer_id TEXT,
  manual_method    TEXT,        -- 'venmo', 'check', etc. for non-Stripe ambassadors
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  period_start     DATE         NOT NULL,
  period_end       DATE         NOT NULL,
  status           TEXT         NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','failed')),
  failure_reason   TEXT,
  paid_at          TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payouts_recipient ON payouts (recipient_type, recipient_id, created_at DESC);
CREATE INDEX idx_payouts_status    ON payouts (status, period_end DESC);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 5. Payout Ledger — append-only earnings log
--    One row per earning event. Rows stay forever (audit trail).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_ledger (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type TEXT         NOT NULL CHECK (recipient_type IN ('navigator','driver','ambassador')),
  recipient_id   UUID         NOT NULL,
  event_type     TEXT         NOT NULL CHECK (event_type IN (
    'session', 'errand', 'nemt_trip',
    'ambassador_signup', 'ambassador_retention', 'ambassador_tier'
  )),
  reference_id   UUID,        -- session_id, errand_trip_id, nemt_claim_id, or referral_id
  gross_amount   NUMERIC(10,2) NOT NULL CHECK (gross_amount >= 0),
  platform_fee   NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  net_amount     NUMERIC(10,2) NOT NULL CHECK (net_amount >= 0),
  period_start   DATE         NOT NULL,
  period_end     DATE         NOT NULL,
  payout_id      UUID         REFERENCES payouts(id) ON DELETE SET NULL,  -- NULL until paid
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  -- NO updated_at — append-only
);

CREATE INDEX idx_payout_ledger_recipient ON payout_ledger (recipient_type, recipient_id, created_at DESC);
CREATE INDEX idx_payout_ledger_unpaid    ON payout_ledger (payout_id, period_end) WHERE payout_id IS NULL;
CREATE INDEX idx_payout_ledger_period    ON payout_ledger (period_start, period_end);

COMMENT ON TABLE payout_ledger IS
  'Append-only earnings log. One row per earning event (session, errand, NEMT, ambassador bonus). '
  'payout_id = NULL means unpaid. Never UPDATE or DELETE rows.';

ALTER TABLE payout_ledger ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. Counties — full county management table (replaces text county columns)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS counties (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT         NOT NULL,
  state                     TEXT         NOT NULL DEFAULT 'GA',
  zip_codes                 TEXT[]       NOT NULL DEFAULT '{}',
  population_65_plus        INTEGER,
  medicaid_rate_estimate    NUMERIC(5,2),  -- % of county population on Medicaid
  expansion_priority_score  SMALLINT,      -- 1–100, computed by admin or trigger
  status                    TEXT         NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','coming_soon','paused')),
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT counties_name_state_unique UNIQUE (name, state)
);

CREATE INDEX idx_counties_state  ON counties (state, status);
CREATE INDEX idx_counties_priority ON counties (expansion_priority_score DESC NULLS LAST)
  WHERE status = 'active';

ALTER TABLE counties ENABLE ROW LEVEL SECURITY;

-- Seed Georgia counties relevant to Pathway's initial territory
INSERT INTO counties (name, state, zip_codes, population_65_plus, medicaid_rate_estimate, status) VALUES
  ('Sumter',    'GA', '{31701,31709,31780}', 4800,  28.5, 'active'),
  ('Webster',   'GA', '{31824}',             1100,  31.2, 'active'),
  ('Schley',    'GA', '{31776}',             900,   27.8, 'active'),
  ('Macon',     'GA', '{31085,31030}',       1400,  30.1, 'active'),
  ('Crisp',     'GA', '{31015}',             3200,  26.9, 'active'),
  ('Dooly',     'GA', '{31077,31093}',       1600,  32.4, 'active'),
  ('Lee',       'GA', '{31763,31787}',       3100,  18.5, 'active'),
  ('Worth',     'GA', '{31771,31768}',       2800,  22.3, 'active'),
  ('Turner',    'GA', '{31793}',             1900,  29.7, 'coming_soon'),
  ('Wilcox',    'GA', '{31001}',             1500,  33.1, 'coming_soon')
ON CONFLICT (name, state) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Navigator County Assignments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS navigator_counties (
  navigator_id UUID NOT NULL REFERENCES navigators(id) ON DELETE CASCADE,
  county_id    UUID NOT NULL REFERENCES counties(id)   ON DELETE CASCADE,
  PRIMARY KEY (navigator_id, county_id)
);

CREATE INDEX idx_nav_counties_county ON navigator_counties (county_id);

ALTER TABLE navigator_counties ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 8. Add ambassador FK to clients (now that ambassadors table is guaranteed)
-- ---------------------------------------------------------------------------
ALTER TABLE clients
  ADD CONSTRAINT clients_ambassador_fk
  FOREIGN KEY (ambassador_id) REFERENCES ambassadors(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 9. Helper function: current_payout_period()
--    Returns {period_start, period_end} for the current bi-weekly window.
--    Periods: 1st–15th and 16th–last day of month.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_payout_period(OUT period_start DATE, OUT period_end DATE)
RETURNS RECORD
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXTRACT(DAY FROM CURRENT_DATE) <= 15 THEN
    period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    period_end   := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '14 days')::DATE;
  ELSE
    period_start := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '15 days')::DATE;
    period_end   := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  END IF;
END;
$$;

COMMENT ON FUNCTION current_payout_period IS
  'Returns the current bi-weekly payout period dates. '
  'Period 1: 1st–15th. Period 2: 16th–last day of month.';

-- ---------------------------------------------------------------------------
-- 10. Helper function: add_ledger_row()
--     SECURITY DEFINER so Edge Functions and triggers can INSERT into the
--     append-only payout_ledger without holding INSERT privileges directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_ledger_row(
  p_recipient_type TEXT,
  p_recipient_id   UUID,
  p_event_type     TEXT,
  p_reference_id   UUID    DEFAULT NULL,
  p_gross_amount   NUMERIC DEFAULT 0,
  p_platform_fee   NUMERIC DEFAULT 0,
  p_net_amount     NUMERIC DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id           UUID;
  v_period_start DATE;
  v_period_end   DATE;
BEGIN
  SELECT period_start, period_end
  INTO v_period_start, v_period_end
  FROM current_payout_period();

  INSERT INTO payout_ledger (
    recipient_type, recipient_id, event_type, reference_id,
    gross_amount, platform_fee, net_amount,
    period_start, period_end
  )
  VALUES (
    p_recipient_type, p_recipient_id, p_event_type, p_reference_id,
    p_gross_amount, p_platform_fee, p_net_amount,
    v_period_start, v_period_end
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Trigger: session_create_ledger_row
--     When a session is inserted, credit the navigator's payout ledger.
--     Navigator earns 60% of the monthly subscription value ÷ period sessions.
--     Flat amounts per tier (approximate — exact logic in run-payouts):
--       Basic:     $14.70/session (based on $49 × 60% ÷ 2 sessions)
--       Standard:  $53.40/month flat → $26.70/bi-weekly period
--       Full Care: $77.40/month flat → $38.70/bi-weekly period
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sessions_credit_navigator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_navigator_id UUID;
  v_tier         TEXT;
  v_net          NUMERIC(10,2);
BEGIN
  -- Find the client's navigator and subscription tier
  SELECT c.navigator_id, c.subscription_tier::TEXT
  INTO v_navigator_id, v_tier
  FROM clients c
  WHERE c.id = NEW.client_id;

  IF v_navigator_id IS NULL THEN RETURN NEW; END IF;

  -- Compute per-session credit (Basic only — Standard/Full Care credited monthly by run-payouts)
  v_net := CASE v_tier
    WHEN 'basic'     THEN 14.70
    WHEN 'standard'  THEN 0     -- paid as flat monthly by run-payouts
    WHEN 'full_care' THEN 0     -- paid as flat monthly by run-payouts
    ELSE 0
  END;

  IF v_net > 0 THEN
    PERFORM add_ledger_row(
      'navigator', v_navigator_id, 'session', NEW.id,
      24.50, 24.50 - v_net, v_net
    );
  END IF;

  -- Increment session counter on client (for Basic tier enforcement)
  UPDATE clients
  SET sessions_used_this_period = sessions_used_this_period + 1
  WHERE id = NEW.client_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_after_insert
  AFTER INSERT ON sessions
  FOR EACH ROW EXECUTE FUNCTION sessions_credit_navigator();

-- ---------------------------------------------------------------------------
-- 12. Trigger: errand_complete_ledger_row
--     On errand completion, credit driver (75% flat_rate) and
--     increment errand counter on client.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION errand_credit_driver()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Only fire on completion
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
    IF NEW.driver_id IS NOT NULL AND NEW.driver_payout IS NOT NULL THEN
      PERFORM add_ledger_row(
        'driver', NEW.driver_id, 'errand', NEW.id,
        NEW.flat_rate, NEW.flat_rate - NEW.driver_payout, NEW.driver_payout
      );
    END IF;
    -- Increment errand usage counter
    UPDATE clients
    SET errands_used_this_period = errands_used_this_period + 1
    WHERE id = NEW.client_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER errand_trips_credit_driver
  AFTER UPDATE OF status ON errand_trips
  FOR EACH ROW EXECUTE FUNCTION errand_credit_driver();

-- ---------------------------------------------------------------------------
-- 13. Trigger: nemt_claim_paid_ledger_row
--     When a NEMT claim is marked paid, credit driver 80% of total_billed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nemt_claim_credit_driver()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_driver_id    UUID;
  v_gross        NUMERIC(10,2);
  v_platform_fee NUMERIC(10,2);
  v_net          NUMERIC(10,2);
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid') THEN
    v_driver_id := NEW.driver_id;
    v_gross     := COALESCE(NEW.paid_amount, NEW.total_billed, 0);
    v_platform_fee := ROUND(v_gross * 0.20, 2);
    v_net       := v_gross - v_platform_fee;

    IF v_driver_id IS NOT NULL AND v_gross > 0 THEN
      PERFORM add_ledger_row(
        'driver', v_driver_id, 'nemt_trip', NEW.id,
        v_gross, v_platform_fee, v_net
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER nemt_claims_credit_driver
  AFTER UPDATE OF status ON nemt_claims
  FOR EACH ROW EXECUTE FUNCTION nemt_claim_credit_driver();

-- ---------------------------------------------------------------------------
-- 14. RLS Policies — Phase 5 new tables
-- ---------------------------------------------------------------------------

-- ── payouts ──────────────────────────────────────────────────────────────────
CREATE POLICY "payouts: admin all"
  ON payouts FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "payouts: navigator read own"
  ON payouts FOR SELECT
  USING (get_user_role() = 'navigator' AND recipient_type = 'navigator' AND recipient_id = auth.uid());

CREATE POLICY "payouts: driver read own"
  ON payouts FOR SELECT
  USING (get_user_role() = 'driver' AND recipient_type = 'driver' AND recipient_id = auth.uid());

-- ── payout_ledger — append-only (no UPDATE or DELETE policies) ───────────────
CREATE POLICY "payout_ledger: admin read"
  ON payout_ledger FOR SELECT USING (is_admin());

CREATE POLICY "payout_ledger: navigator read own"
  ON payout_ledger FOR SELECT
  USING (get_user_role() = 'navigator' AND recipient_type = 'navigator' AND recipient_id = auth.uid());

CREATE POLICY "payout_ledger: driver read own"
  ON payout_ledger FOR SELECT
  USING (get_user_role() = 'driver' AND recipient_type = 'driver' AND recipient_id = auth.uid());

-- No INSERT policy (enforced via add_ledger_row SECURITY DEFINER function)
-- No UPDATE policy (append-only)
-- No DELETE policy (append-only)

-- ── counties ─────────────────────────────────────────────────────────────────
CREATE POLICY "counties: read all authenticated"
  ON counties FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "counties: admin write"
  ON counties FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── navigator_counties ────────────────────────────────────────────────────────
CREATE POLICY "navigator_counties: read all authenticated"
  ON navigator_counties FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "navigator_counties: admin write"
  ON navigator_counties FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── ambassadors — extend existing RLS with read for self via auth_token ───────
-- Ambassadors have no auth account; their "identity" is the UUID in the URL.
-- Edge Functions and Service Role bypass RLS; admin reads/writes directly.
CREATE POLICY "ambassadors: admin all"
  ON ambassadors FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ── referrals ────────────────────────────────────────────────────────────────
CREATE POLICY "referrals: admin all"
  ON referrals FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "referrals: navigator read client referrals"
  ON referrals FOR SELECT
  USING (
    get_user_role() = 'navigator'
    AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 15. Index for ambassador auth token lookup (used by public dashboard)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_ambassador ON clients (ambassador_id)
  WHERE ambassador_id IS NOT NULL;
