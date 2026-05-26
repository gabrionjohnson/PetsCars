-- =============================================================================
-- Migration 012: Phase 4 — NEMT Dispatch
--
-- Extends the schema for Medicaid-billable medical transport (Georgia Verida).
--
-- Critical invariants preserved from spec:
--   1. trip_status_log rows are append-only — this migration only EXTENDS the
--      allowed status CHECK; it never removes existing values or policies.
--   2. Signature PNGs live at deterministic Storage paths by trip ID.
--   3. Mileage = loaded miles only (pickup_signed → dropoff_signed window).
--   4. verida_claim_id required when setting claim to 'submitted'.
--   5. No auto-submission — admin must approve every claim before Verida.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend trip_status_log CHECK constraint to cover NEMT execution statuses
--    The original constraint was created inline; drop by its auto-generated
--    name and re-add with the full list including new NEMT statuses.
-- ---------------------------------------------------------------------------
ALTER TABLE trip_status_log
  DROP CONSTRAINT IF EXISTS trip_status_log_status_check;

ALTER TABLE trip_status_log
  ADD CONSTRAINT trip_status_log_status_check
  CHECK (status IN (
    -- Universal
    'pending', 'dispatched', 'accepted', 'completed', 'canceled',
    -- Errand runs (pharmacy_pickup, grocery_run, small_errand)
    'departed_for_errand', 'errand_complete', 'delivered',
    -- Ride & Wait (errand)
    'en_route_to_pickup', 'client_picked_up', 'arrived_at_destination',
    'waiting', 'return_trip_started', 'client_returned_home',
    -- NEMT execution (Phase 4) — append-only, never removed
    'pre_trip_checklist_complete',  -- driver completes pre-trip vehicle check
    'arrived_at_pickup',            -- driver at client home (GPS captured, ≤0.25 mi check)
    'pickup_signed',                -- client e-signs at pickup → loaded miles START
    'departed_to_appointment',      -- vehicle moving with client aboard
    'arrived_at_appointment',       -- at medical facility (GPS captured)
    'waiting_at_appointment',       -- driver waiting during appointment
    'arrived_at_dropoff',           -- back at client home (GPS captured)
    'dropoff_signed'                -- client e-signs at dropoff → loaded miles END
  ));

-- ---------------------------------------------------------------------------
-- 2. Replace log_trip_status() to handle NEMT Phase 4 statuses
--    Uses CREATE OR REPLACE — safe to run multiple times.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_trip_status(
  p_trip_id   UUID,
  p_trip_type TEXT,
  p_status    TEXT,
  p_by        UUID    DEFAULT NULL,
  p_lat       NUMERIC DEFAULT NULL,
  p_lng       NUMERIC DEFAULT NULL,
  p_note      TEXT    DEFAULT NULL,
  p_photo_url TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_log_id      UUID;
  v_trip_status trip_status;
BEGIN
  -- Map fine-grained statuses to the coarser trip_status enum on trip records.
  v_trip_status := CASE p_status
    -- Universal
    WHEN 'pending'                      THEN 'pending'::trip_status
    WHEN 'dispatched'                   THEN 'pending'::trip_status
    WHEN 'accepted'                     THEN 'assigned'::trip_status
    WHEN 'completed'                    THEN 'completed'::trip_status
    WHEN 'canceled'                     THEN 'canceled'::trip_status
    -- Errand
    WHEN 'departed_for_errand'          THEN 'en_route'::trip_status
    WHEN 'errand_complete'              THEN 'en_route'::trip_status
    WHEN 'delivered'                    THEN 'en_route'::trip_status
    WHEN 'en_route_to_pickup'           THEN 'en_route'::trip_status
    WHEN 'client_picked_up'             THEN 'en_route'::trip_status
    WHEN 'arrived_at_destination'       THEN 'en_route'::trip_status
    WHEN 'waiting'                      THEN 'en_route'::trip_status
    WHEN 'return_trip_started'          THEN 'en_route'::trip_status
    WHEN 'client_returned_home'         THEN 'en_route'::trip_status
    -- NEMT Phase 4
    WHEN 'pre_trip_checklist_complete'  THEN 'assigned'::trip_status
    WHEN 'arrived_at_pickup'            THEN 'en_route'::trip_status
    WHEN 'pickup_signed'                THEN 'en_route'::trip_status
    WHEN 'departed_to_appointment'      THEN 'en_route'::trip_status
    WHEN 'arrived_at_appointment'       THEN 'en_route'::trip_status
    WHEN 'waiting_at_appointment'       THEN 'en_route'::trip_status
    WHEN 'arrived_at_dropoff'           THEN 'en_route'::trip_status
    WHEN 'dropoff_signed'               THEN 'en_route'::trip_status
    ELSE 'pending'::trip_status
  END;

  -- Append to audit log (never modified after this INSERT)
  INSERT INTO trip_status_log (
    trip_id, trip_type, status, changed_by,
    gps_lat, gps_lng, note, photo_url
  )
  VALUES (
    p_trip_id, p_trip_type, p_status, p_by,
    p_lat, p_lng, p_note, p_photo_url
  )
  RETURNING id INTO v_log_id;

  -- Update denormalized fields on the trip record.
  IF p_trip_type = 'errand' THEN
    UPDATE errand_trips
    SET status       = v_trip_status,
        accepted_at  = CASE WHEN p_status = 'accepted'   THEN NOW() ELSE accepted_at  END,
        completed_at = CASE WHEN p_status = 'completed'  THEN NOW() ELSE completed_at END
    WHERE id = p_trip_id;

  ELSIF p_trip_type = 'nemt' THEN
    UPDATE nemt_trips
    SET
      status = v_trip_status,
      -- Checklist
      pre_trip_checklist_completed = CASE
        WHEN p_status = 'pre_trip_checklist_complete' THEN TRUE
        ELSE pre_trip_checklist_completed END,
      pre_trip_checklist_at = CASE
        WHEN p_status = 'pre_trip_checklist_complete' THEN NOW()
        ELSE pre_trip_checklist_at END,
      -- GPS at pickup arrival (≤0.25 mi proximity check happens at app layer)
      gps_pickup_coords = CASE
        WHEN p_status = 'arrived_at_pickup' AND p_lat IS NOT NULL
          THEN jsonb_build_object('lat', p_lat, 'lng', p_lng)
        ELSE gps_pickup_coords END,
      -- Loaded miles START: client signs at pickup
      pickup_timestamp = CASE
        WHEN p_status = 'pickup_signed' THEN NOW()
        ELSE pickup_timestamp END,
      -- GPS at appointment (≤0.25 mi proximity check at app layer)
      appointment_gps = CASE
        WHEN p_status = 'arrived_at_appointment' AND p_lat IS NOT NULL
          THEN jsonb_build_object('lat', p_lat, 'lng', p_lng)
        ELSE appointment_gps END,
      -- GPS at dropoff arrival
      gps_dropoff_coords = CASE
        WHEN p_status = 'arrived_at_dropoff' AND p_lat IS NOT NULL
          THEN jsonb_build_object('lat', p_lat, 'lng', p_lng)
        ELSE gps_dropoff_coords END,
      -- Loaded miles END: client signs at dropoff
      dropoff_timestamp = CASE
        WHEN p_status = 'dropoff_signed' THEN NOW()
        ELSE dropoff_timestamp END,
      -- Trip completion
      updated_at = NOW()
    WHERE id = p_trip_id;
  END IF;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION log_trip_status IS
  'Append-only status logger for errand and NEMT trips. '
  'Never call UPDATE/DELETE on trip_status_log directly — always go through this function.';

-- ---------------------------------------------------------------------------
-- 3. ALTER nemt_trips — add Phase 4 execution and recurring columns
-- ---------------------------------------------------------------------------

-- Booking metadata
ALTER TABLE nemt_trips
  ADD COLUMN IF NOT EXISTS booking_source         TEXT
    CHECK (booking_source IN ('navigator', 'family_proxy', 'admin')),
  ADD COLUMN IF NOT EXISTS estimated_duration_min SMALLINT,
  ADD COLUMN IF NOT EXISTS assistance_needed      TEXT,         -- mobility notes for driver
  ADD COLUMN IF NOT EXISTS appointment_type_other TEXT;         -- free-text when type = 'other'

-- Return trip (separated from return_scheduled to make intent explicit)
ALTER TABLE nemt_trips
  ADD COLUMN IF NOT EXISTS return_included   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS return_pickup_time TIMESTAMPTZ;       -- when to pick up after appt

-- Recurring series linkage
ALTER TABLE nemt_trips
  ADD COLUMN IF NOT EXISTS recurring_series_id UUID,             -- FK added after table created below
  ADD COLUMN IF NOT EXISTS occurrence_number   SMALLINT;

-- Pre-trip compliance checklist
ALTER TABLE nemt_trips
  ADD COLUMN IF NOT EXISTS pre_trip_checklist_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pre_trip_checklist_at        TIMESTAMPTZ;

-- Dual signatures (pickup + dropoff) — deterministic path: {trip_id}/pickup.png, {trip_id}/dropoff.png
-- member_signature_url (legacy) kept for backward compat; new code uses these two columns.
ALTER TABLE nemt_trips
  ADD COLUMN IF NOT EXISTS pickup_signature_url  TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_signature_url TEXT;

-- GPS at appointment location (captured when arrived_at_appointment logged)
ALTER TABLE nemt_trips
  ADD COLUMN IF NOT EXISTS appointment_gps JSONB;

-- Claim lifecycle timestamps
ALTER TABLE nemt_trips
  ADD COLUMN IF NOT EXISTS claim_draft_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verida_submission_date   DATE;

COMMENT ON COLUMN nemt_trips.pickup_signature_url IS
  'Storage path: {trip_id}/pickup.png — captured when driver logs pickup_signed. Never deletable.';
COMMENT ON COLUMN nemt_trips.dropoff_signature_url IS
  'Storage path: {trip_id}/dropoff.png — captured when driver logs dropoff_signed. Never deletable.';
COMMENT ON COLUMN nemt_trips.loaded_miles IS
  'Georgia DCH: loaded miles only — distance while client is in vehicle (pickup_signed → dropoff_signed). '
  'Entered by driver post-trip; validated by admin before claim submission.';
COMMENT ON COLUMN nemt_trips.appointment_gps IS
  'JSONB: {lat, lng} — captured on arrived_at_appointment for Georgia DCH compliance.';

-- ---------------------------------------------------------------------------
-- 4. ALTER drivers — add NEMT-specific compliance columns
-- ---------------------------------------------------------------------------
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS license_number      TEXT,
  ADD COLUMN IF NOT EXISTS wav_inspection_url  TEXT,   -- Storage path for WAV inspection certificate
  ADD COLUMN IF NOT EXISTS wav_inspection_date DATE;   -- Date of most recent WAV inspection

COMMENT ON COLUMN drivers.wav_inspection_url IS
  'Storage path for wheelchair-accessible vehicle inspection certificate. Required for has_wav=TRUE drivers.';

-- ---------------------------------------------------------------------------
-- 5. nemt_claim_status enum and nemt_claims snapshot table
--
-- nemt_claims is an immutable billing snapshot generated when admin approves
-- a trip for submission. The snapshot decouples Verida submission records
-- from the live trip record (which may be corrected post-submission).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nemt_claim_status') THEN
    CREATE TYPE nemt_claim_status AS ENUM (
      'draft',              -- auto-generated, pending admin review
      'ready_to_submit',    -- admin has approved; awaiting manual Verida submission
      'submitted',          -- admin submitted to Verida (verida_claim_id required)
      'paid',               -- Verida paid
      'denied',             -- Verida denied
      'needs_resubmission'  -- denied but correctable; admin corrects and resubmits
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS nemt_claims (
  id                    UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id               UUID              NOT NULL REFERENCES nemt_trips(id) ON DELETE RESTRICT,
  client_id             UUID              NOT NULL REFERENCES clients(id)    ON DELETE RESTRICT,
  driver_id             UUID              REFERENCES drivers(id)             ON DELETE SET NULL,

  -- Billing snapshot (frozen at draft generation time)
  trip_type             nemt_trip_type    NOT NULL,
  trip_date             DATE              NOT NULL,
  pickup_address        TEXT              NOT NULL,
  appointment_address   TEXT              NOT NULL,
  appointment_provider  TEXT,
  appointment_type      TEXT,
  medicaid_id           TEXT              NOT NULL,
  base_fee              NUMERIC(8,2)      NOT NULL,
  loaded_miles          NUMERIC(6,2),     -- must be set before status → ready_to_submit
  mileage_rate          NUMERIC(6,4)      NOT NULL,
  total_billed          NUMERIC(8,2),     -- recomputed from loaded_miles × mileage_rate

  -- Compliance evidence (paths only; files in private nemt-signatures bucket)
  gps_pickup_coords     JSONB,
  gps_dropoff_coords    JSONB,
  appointment_gps       JSONB,
  pickup_signature_url  TEXT,
  dropoff_signature_url TEXT,
  pre_trip_checklist_completed BOOLEAN NOT NULL DEFAULT FALSE,

  -- Claim workflow
  status                nemt_claim_status NOT NULL DEFAULT 'draft',

  -- Admin approval (required before status → submitted)
  admin_approved_by     UUID              REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_approved_at     TIMESTAMPTZ,

  -- Verida submission (verida_claim_id REQUIRED when status = submitted)
  verida_claim_id       TEXT,             -- reconciliation key; required at submit time
  submitted_by          UUID              REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at          TIMESTAMPTZ,
  verida_submission_date DATE,

  -- Payment / denial
  paid_amount           NUMERIC(8,2),
  paid_at               TIMESTAMPTZ,
  denial_reason         TEXT,
  denied_at             TIMESTAMPTZ,
  resubmission_count    SMALLINT          NOT NULL DEFAULT 0,

  -- Admin notes (correction notes, audit comments)
  admin_notes           TEXT,

  created_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- One claim draft per trip (enforced — prevents duplicate billing)
  CONSTRAINT nemt_claims_trip_unique UNIQUE (trip_id),

  -- Verida claim ID required if status is submitted/paid/denied
  CONSTRAINT nemt_claims_verida_id_required CHECK (
    status NOT IN ('submitted', 'paid', 'denied', 'needs_resubmission')
    OR verida_claim_id IS NOT NULL
  ),

  -- Admin must approve before submission
  CONSTRAINT nemt_claims_approval_required CHECK (
    status NOT IN ('submitted', 'paid', 'denied', 'needs_resubmission')
    OR admin_approved_at IS NOT NULL
  )
);

CREATE INDEX idx_nemt_claims_trip       ON nemt_claims (trip_id);
CREATE INDEX idx_nemt_claims_client     ON nemt_claims (client_id);
CREATE INDEX idx_nemt_claims_status     ON nemt_claims (status, created_at DESC);
CREATE INDEX idx_nemt_claims_driver     ON nemt_claims (driver_id, trip_date DESC);

COMMENT ON TABLE nemt_claims IS
  'Immutable billing snapshot for Verida (Georgia NEMT broker) claim submission. '
  'Generated by generate_nemt_claim_draft(). '
  'Admin must approve (admin_approved_at set) before status can reach ''submitted''. '
  'verida_claim_id is mandatory at submit time — it is the Medicaid reconciliation key.';

ALTER TABLE nemt_claims ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 6. nemt_recurring_series — template for auto-scheduling repeating NEMT trips
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nemt_recurring_series (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  booked_by            UUID          REFERENCES profiles(id) ON DELETE SET NULL,

  -- Trip template (used when generating each occurrence)
  trip_type            nemt_trip_type NOT NULL,
  pickup_address       TEXT          NOT NULL,
  appointment_address  TEXT          NOT NULL,
  appointment_provider TEXT,
  appointment_type     TEXT,
  assistance_needed    TEXT,
  return_included      BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Schedule
  frequency            TEXT          NOT NULL
    CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  day_of_week          SMALLINT      CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
  appointment_time     TIME          NOT NULL,
  return_offset_minutes SMALLINT,   -- minutes after appointment_time to schedule return

  -- State
  active               BOOLEAN       NOT NULL DEFAULT TRUE,
  series_start_date    DATE          NOT NULL,
  series_end_date      DATE,         -- NULL = indefinite
  next_occurrence_date DATE,
  occurrence_count     SMALLINT      NOT NULL DEFAULT 0,

  -- Medicaid
  medicaid_id          TEXT          NOT NULL,

  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nemt_recurring_client ON nemt_recurring_series (client_id, active);
CREATE INDEX idx_nemt_recurring_next   ON nemt_recurring_series (next_occurrence_date)
  WHERE active = TRUE;

COMMENT ON TABLE nemt_recurring_series IS
  'Template for recurring NEMT trips (weekly dialysis, chemo, etc.). '
  'Admin or Navigator generates the next occurrence 72+ hours in advance '
  'by calling a scheduler function that reads this table.';

ALTER TABLE nemt_recurring_series ENABLE ROW LEVEL SECURITY;

-- Add FK from nemt_trips → nemt_recurring_series (now that the table exists)
ALTER TABLE nemt_trips
  ADD CONSTRAINT nemt_trips_recurring_series_fk
  FOREIGN KEY (recurring_series_id)
  REFERENCES nemt_recurring_series(id)
  ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 7. saved_providers — frequently used medical providers per client
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_providers (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID  NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT  NOT NULL,
  address     TEXT  NOT NULL,
  phone       TEXT,
  specialty   TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_providers_client ON saved_providers (client_id);

ALTER TABLE saved_providers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 8. Helper: business_days_from_now(p_days INT)
--    Returns the date that is exactly p_days business days (Mon–Fri) from today.
--    Used to enforce the Verida 3-business-day advance booking requirement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION business_days_from_now(p_days INT)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_date DATE := CURRENT_DATE;
  v_counted INT := 0;
BEGIN
  WHILE v_counted < p_days LOOP
    v_date := v_date + 1;
    -- Skip Saturday (6) and Sunday (0)
    IF EXTRACT(DOW FROM v_date) NOT IN (0, 6) THEN
      v_counted := v_counted + 1;
    END IF;
  END LOOP;
  RETURN v_date;
END;
$$;

COMMENT ON FUNCTION business_days_from_now IS
  'Returns the date p_days business days (Mon–Fri) from today. '
  'Used to enforce Verida 3-business-day advance scheduling requirement.';

-- ---------------------------------------------------------------------------
-- 9. generate_nemt_claim_draft(p_trip_id UUID)
--    Creates a draft claim snapshot from the completed NEMT trip record.
--    SECURITY DEFINER so it can INSERT into nemt_claims regardless of caller role.
--    Returns the new claim id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_nemt_claim_draft(p_trip_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_trip      nemt_trips%ROWTYPE;
  v_claim_id  UUID;
  v_rate      NUMERIC(6,4);
  v_billed    NUMERIC(8,2);
BEGIN
  SELECT * INTO v_trip FROM nemt_trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NEMT trip % not found', p_trip_id;
  END IF;

  -- Require at minimum: completed trip with dropoff captured
  IF v_trip.status != 'completed' THEN
    RAISE EXCEPTION 'Cannot draft claim: trip % is not yet completed (status: %)',
      p_trip_id, v_trip.status;
  END IF;

  -- Pull mileage_rate from trip or fall back to platform_config
  v_rate := COALESCE(v_trip.mileage_rate, (
    SELECT (config_value -> v_trip.trip_type::TEXT ->> 'mileage_rate')::NUMERIC
    FROM platform_config
    WHERE config_key = 'nemt_rates' AND county IS NULL
    LIMIT 1
  ));

  -- Compute total_billed if loaded_miles are already set
  IF v_trip.loaded_miles IS NOT NULL AND v_trip.base_fee IS NOT NULL THEN
    v_billed := v_trip.base_fee + (v_trip.loaded_miles * COALESCE(v_rate, 0));
  END IF;

  INSERT INTO nemt_claims (
    trip_id, client_id, driver_id,
    trip_type, trip_date, pickup_address, appointment_address,
    appointment_provider, appointment_type, medicaid_id,
    base_fee, loaded_miles, mileage_rate, total_billed,
    gps_pickup_coords, gps_dropoff_coords, appointment_gps,
    pickup_signature_url, dropoff_signature_url,
    pre_trip_checklist_completed,
    status
  )
  VALUES (
    p_trip_id, v_trip.client_id, v_trip.driver_id,
    v_trip.trip_type, v_trip.scheduled_datetime::DATE,
    v_trip.pickup_address, v_trip.appointment_address,
    v_trip.appointment_provider, v_trip.appointment_type, v_trip.medicaid_id,
    v_trip.base_fee, v_trip.loaded_miles, v_rate, v_billed,
    v_trip.gps_pickup_coords, v_trip.gps_dropoff_coords, v_trip.appointment_gps,
    v_trip.pickup_signature_url, v_trip.dropoff_signature_url,
    v_trip.pre_trip_checklist_completed,
    'draft'
  )
  ON CONFLICT (trip_id) DO NOTHING  -- idempotent — never overwrite existing claim
  RETURNING id INTO v_claim_id;

  -- Stamp claim_draft_generated_at on the trip
  UPDATE nemt_trips
  SET claim_draft_generated_at = NOW(),
      updated_at = NOW()
  WHERE id = p_trip_id;

  RETURN v_claim_id;
END;
$$;

COMMENT ON FUNCTION generate_nemt_claim_draft IS
  'Creates a draft nemt_claims row from a completed NEMT trip. '
  'Idempotent — safe to call multiple times; existing draft is never overwritten. '
  'Admin then reviews, corrects loaded_miles if needed, and approves before submission.';

-- ---------------------------------------------------------------------------
-- 10. Trigger: auto-recompute total_billed when loaded_miles or mileage_rate
--     is updated on nemt_claims (admin may correct values pre-submission).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_nemt_claim_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.loaded_miles IS NOT NULL AND NEW.base_fee IS NOT NULL AND NEW.mileage_rate IS NOT NULL THEN
    NEW.total_billed := NEW.base_fee + (NEW.loaded_miles * NEW.mileage_rate);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER nemt_claims_recompute_billing
  BEFORE INSERT OR UPDATE OF loaded_miles, mileage_rate, base_fee
  ON nemt_claims
  FOR EACH ROW EXECUTE FUNCTION recompute_nemt_claim_billing();

-- ---------------------------------------------------------------------------
-- 11. Seed NEMT rates in platform_config
--     ambulatory: $18 base + $1.85/mi
--     wheelchair: $28 base + $2.10/mi
--     stretcher:  $48 base + $2.75/mi
-- ---------------------------------------------------------------------------
INSERT INTO platform_config (county, config_key, config_value)
VALUES (
  NULL,
  'nemt_rates',
  '{
    "ambulatory": { "base_fee": 18.00, "mileage_rate": 1.85 },
    "wheelchair": { "base_fee": 28.00, "mileage_rate": 2.10 },
    "stretcher":  { "base_fee": 48.00, "mileage_rate": 2.75 }
  }'::jsonb
)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12. RLS policies — Phase 4 new tables
-- ---------------------------------------------------------------------------

-- ── nemt_claims ──────────────────────────────────────────────────────────────
-- SELECT: admin sees all; navigator sees their clients'; driver sees own trips;
--         family_proxy sees their client's claims.
CREATE POLICY "nemt_claims: admin read all"
  ON nemt_claims FOR SELECT
  USING (is_admin());

CREATE POLICY "nemt_claims: navigator read own clients"
  ON nemt_claims FOR SELECT
  USING (
    get_user_role() = 'navigator'
    AND client_id IN (
      SELECT id FROM clients WHERE navigator_id = auth.uid()
    )
  );

CREATE POLICY "nemt_claims: driver read own"
  ON nemt_claims FOR SELECT
  USING (
    get_user_role() = 'driver'
    AND driver_id = auth.uid()
  );

CREATE POLICY "nemt_claims: family proxy read own client"
  ON nemt_claims FOR SELECT
  USING (
    get_user_role() = 'family_proxy'
    AND client_id IN (
      SELECT client_id FROM family_proxies WHERE id = auth.uid()
    )
  );

-- INSERT: admin only (generate_nemt_claim_draft is SECURITY DEFINER, so it bypasses this)
CREATE POLICY "nemt_claims: admin insert"
  ON nemt_claims FOR INSERT
  WITH CHECK (is_admin());

-- UPDATE: admin only (loaded_miles correction, approval, status transitions)
CREATE POLICY "nemt_claims: admin update"
  ON nemt_claims FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- No DELETE policy — claims are permanent billing records.
-- Admin must set status='draft' and re-generate if a trip was booked in error.

-- ── nemt_recurring_series ─────────────────────────────────────────────────
CREATE POLICY "nemt_recurring: admin all"
  ON nemt_recurring_series FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "nemt_recurring: navigator own clients"
  ON nemt_recurring_series FOR SELECT
  USING (
    get_user_role() = 'navigator'
    AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  );

CREATE POLICY "nemt_recurring: navigator insert for own clients"
  ON nemt_recurring_series FOR INSERT
  WITH CHECK (
    get_user_role() = 'navigator'
    AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  );

CREATE POLICY "nemt_recurring: navigator update own clients"
  ON nemt_recurring_series FOR UPDATE
  USING (
    get_user_role() = 'navigator'
    AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  );

CREATE POLICY "nemt_recurring: family proxy read own client"
  ON nemt_recurring_series FOR SELECT
  USING (
    get_user_role() = 'family_proxy'
    AND client_id IN (SELECT client_id FROM family_proxies WHERE id = auth.uid())
  );

-- ── saved_providers ───────────────────────────────────────────────────────
CREATE POLICY "saved_providers: admin all"
  ON saved_providers FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "saved_providers: navigator own clients"
  ON saved_providers FOR ALL
  USING (
    get_user_role() = 'navigator'
    AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  )
  WITH CHECK (
    get_user_role() = 'navigator'
    AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  );

CREATE POLICY "saved_providers: family proxy read own client"
  ON saved_providers FOR SELECT
  USING (
    get_user_role() = 'family_proxy'
    AND client_id IN (SELECT client_id FROM family_proxies WHERE id = auth.uid())
  );
