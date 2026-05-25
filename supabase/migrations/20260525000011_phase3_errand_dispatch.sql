-- =============================================================================
-- Migration 011: Phase 3 — Errand Network (private-pay driver dispatch)
--
-- Key design decisions:
--   1. trip_status_log is APPEND-ONLY — no UPDATE or DELETE in RLS.
--      This is the authoritative audit trail required for NEMT compliance
--      in Phase 4. The denormalized `status` on errand_trips/nemt_trips
--      is a read-cache only; trip_status_log is the source of truth.
--   2. Driver online/offline is a soft toggle — separate from active (vetted).
--   3. job_dispatch_log tracks every driver notification for each job,
--      enabling zone-expansion logic and "first accept wins" semantics.
--   4. platform_config stores per-county rate overrides as JSONB so rural
--      market adjustments don't require a schema change.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extend drivers table with Phase 3 fields
-- ---------------------------------------------------------------------------

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS zip_codes               TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS online                  BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vehicle_color           TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_photo_urls      TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS license_doc_url         TEXT,
  ADD COLUMN IF NOT EXISTS license_expiry          DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry        DATE,
  ADD COLUMN IF NOT EXISTS checkr_report_id        TEXT,
  ADD COLUMN IF NOT EXISTS stripe_connect_complete BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cancel_flag_count       SMALLINT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earnings_pending        NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_payout_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payout_amount      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS onboarding_step         SMALLINT     NOT NULL DEFAULT 1;

COMMENT ON COLUMN drivers.online IS
  'Driver toggled Online — only online + active + cleared drivers receive new job notifications.';
COMMENT ON COLUMN drivers.cancel_flag_count IS
  'Number of post-accept cancellations. 3 flags triggers admin review.';
COMMENT ON COLUMN drivers.onboarding_step IS
  'Last completed onboarding step (1–6); driver active=TRUE only after step 6 + Checkr clear.';

-- ---------------------------------------------------------------------------
-- Extend errand_trips with Phase 3 fields
-- ---------------------------------------------------------------------------

ALTER TABLE errand_trips
  ADD COLUMN IF NOT EXISTS wav_required            BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS booking_source          TEXT         NOT NULL DEFAULT 'navigator'
    CHECK (booking_source IN ('navigator', 'family_proxy', 'sms')),
  ADD COLUMN IF NOT EXISTS job_details             JSONB,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS refunded_amount         NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS accepted_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zone_expansion_count    SMALLINT     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_driver_alert_sent    BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_photo_url      TEXT,
  ADD COLUMN IF NOT EXISTS rating_requested_at     TIMESTAMPTZ;

COMMENT ON COLUMN errand_trips.job_details IS
  'Service-specific details as JSONB.
   pharmacy_pickup:  {pharmacy_name, pharmacy_address, rx_ready, special_instructions}
   grocery_run:      {store_name, store_address, shopping_list, estimated_total}
   small_errand:     {errand_description, location_name, location_address, items_note}
   ride_and_wait:    {appointment_datetime, estimated_duration_min, appointment_address,
                      wheelchair_needed, special_instructions}';
COMMENT ON COLUMN errand_trips.zone_expansion_count IS
  '0 = original zone only; 1 = expanded one county out after 15 min; etc.';

-- ---------------------------------------------------------------------------
-- TRIP STATUS LOG — append-only audit trail
--
-- This table records every status transition for both errand and NEMT trips.
-- RLS enforces INSERT-only access — no UPDATE or DELETE is permitted for
-- any role. The denormalized status column on the trip tables is updated
-- by the log_trip_status() SECURITY DEFINER function after appending here.
--
-- NEMT compliance (Georgia DCH): status timestamps with GPS coordinates
-- are required evidence for audit and claims. This design ensures they
-- can never be silently overwritten.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_status_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID         NOT NULL,
  trip_type   TEXT         NOT NULL CHECK (trip_type IN ('errand', 'nemt')),
  status      TEXT         NOT NULL CHECK (status IN (
    -- Universal
    'pending', 'dispatched', 'accepted', 'completed', 'canceled',
    -- Errand runs (pharmacy, grocery, small errand)
    'departed_for_errand', 'errand_complete', 'delivered',
    -- Ride & Wait
    'en_route_to_pickup', 'client_picked_up', 'arrived_at_destination',
    'waiting', 'return_trip_started', 'client_returned_home'
  )),
  changed_by  UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  gps_lat     NUMERIC(9,6),
  gps_lng     NUMERIC(9,6),
  note        TEXT,
  photo_url   TEXT,
  -- created_at only — never updated
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trip_status_log_trip ON trip_status_log (trip_id, trip_type, created_at DESC);
CREATE INDEX idx_trip_status_log_driver ON trip_status_log (changed_by, created_at DESC);

COMMENT ON TABLE trip_status_log IS
  'Append-only audit log of every trip status transition. '
  'Required for NEMT compliance (Phase 4 Georgia DCH claims). '
  'RLS allows INSERT only — no UPDATE or DELETE for any role including admin.';

ALTER TABLE trip_status_log ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Saved Pharmacies (per client — for fast booking pre-fill)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_pharmacies (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID  NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name       TEXT  NOT NULL,
  address    TEXT  NOT NULL,
  phone      TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE saved_pharmacies ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Driver Ratings (one per completed trip)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_ratings (
  id         UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID     NOT NULL,
  trip_type  TEXT     NOT NULL CHECK (trip_type IN ('errand', 'nemt')),
  driver_id  UUID     NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  rated_by   UUID     REFERENCES auth.users(id) ON DELETE SET NULL,
  stars      SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One rating per trip (not per driver per trip — same thing here)
  CONSTRAINT driver_ratings_trip_unique UNIQUE (trip_id, trip_type)
);

CREATE INDEX idx_driver_ratings_driver ON driver_ratings (driver_id);

ALTER TABLE driver_ratings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Job Dispatch Log — tracks which drivers were notified for each job
-- Used for: first-accept semantics, zone expansion, cancellation tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_dispatch_log (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID  NOT NULL,
  trip_type    TEXT  NOT NULL CHECK (trip_type IN ('errand', 'nemt')),
  driver_id    UUID  NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  zone_round   SMALLINT NOT NULL DEFAULT 1,  -- 1 = original zone, 2 = expanded, etc.
  notified_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  response     TEXT  NOT NULL DEFAULT 'pending'
    CHECK (response IN ('pending', 'accepted', 'declined', 'expired')),
  responded_at TIMESTAMPTZ,
  UNIQUE (trip_id, trip_type, driver_id)
);

CREATE INDEX idx_job_dispatch_log_trip ON job_dispatch_log (trip_id, trip_type);
CREATE INDEX idx_job_dispatch_log_driver ON job_dispatch_log (driver_id, notified_at DESC);

ALTER TABLE job_dispatch_log ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SMS Errand Requests — draft requests created when senior texts PICKUP/RIDE
-- Navigator reviews and confirms before dispatching to a driver
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_errand_requests (
  id                     UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID  REFERENCES clients(id) ON DELETE SET NULL,
  phone                  TEXT  NOT NULL,
  keyword                TEXT  NOT NULL CHECK (keyword IN ('PICKUP', 'RIDE')),
  raw_body               TEXT,
  navigator_id           UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  status                 TEXT  NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'dispatched', 'dismissed')),
  trip_id                UUID,  -- set when navigator dispatches
  navigator_confirmed_at TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sms_errand_requests_navigator ON sms_errand_requests (navigator_id, status, created_at DESC);

ALTER TABLE sms_errand_requests ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Platform Config — per-county rate overrides and settings
-- config_key examples: 'rates', 'zone_timeout_minutes', 'zone_expansion_counties'
-- county = NULL means global default
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_config (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  county       TEXT,
  config_key   TEXT  NOT NULL,
  config_value JSONB NOT NULL,
  updated_by   UUID  REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (county, config_key)
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- Seed default service rates
INSERT INTO platform_config (county, config_key, config_value) VALUES
  (NULL, 'rates', '{
    "pharmacy_pickup": {"flat_rate": 12.00, "driver_payout": 9.00},
    "grocery_run":     {"flat_rate": 18.00, "driver_payout": 13.50},
    "small_errand":    {"flat_rate": 12.00, "driver_payout": 9.00},
    "ride_and_wait":   {"flat_rate": 35.00, "driver_payout": 26.25}
  }'::jsonb),
  (NULL, 'dispatch', '{
    "first_timeout_minutes": 15,
    "second_timeout_minutes": 45,
    "max_zone_expansions": 2
  }'::jsonb)
ON CONFLICT (county, config_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Function: log_trip_status
-- Atomically appends to trip_status_log AND updates the denormalized status
-- on the trip record. SECURITY DEFINER bypasses per-table RLS restrictions
-- (the Edge Function caller validates auth before calling this).
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
RETURNS UUID   -- returns the new log row id
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  -- Map fine-grained Phase 3 statuses to the coarser trip_status enum
  -- used on the trip record (for backward-compatible queries).
  v_trip_status trip_status;
BEGIN
  v_trip_status := CASE p_status
    WHEN 'pending'                THEN 'pending'::trip_status
    WHEN 'dispatched'             THEN 'pending'::trip_status
    WHEN 'accepted'               THEN 'assigned'::trip_status
    WHEN 'departed_for_errand'    THEN 'en_route'::trip_status
    WHEN 'errand_complete'        THEN 'en_route'::trip_status
    WHEN 'delivered'              THEN 'en_route'::trip_status
    WHEN 'en_route_to_pickup'     THEN 'en_route'::trip_status
    WHEN 'client_picked_up'       THEN 'en_route'::trip_status
    WHEN 'arrived_at_destination' THEN 'en_route'::trip_status
    WHEN 'waiting'                THEN 'en_route'::trip_status
    WHEN 'return_trip_started'    THEN 'en_route'::trip_status
    WHEN 'client_returned_home'   THEN 'en_route'::trip_status
    WHEN 'completed'              THEN 'completed'::trip_status
    WHEN 'canceled'               THEN 'canceled'::trip_status
    ELSE 'pending'::trip_status
  END;

  -- Append to audit log (never modified after this)
  INSERT INTO trip_status_log (trip_id, trip_type, status, changed_by, gps_lat, gps_lng, note, photo_url)
  VALUES (p_trip_id, p_trip_type, p_status, p_by, p_lat, p_lng, p_note, p_photo_url)
  RETURNING id INTO v_log_id;

  -- Update denormalized status on the trip record
  IF p_trip_type = 'errand' THEN
    UPDATE errand_trips
    SET status = v_trip_status,
        accepted_at  = CASE WHEN p_status = 'accepted'   THEN NOW() ELSE accepted_at  END,
        completed_at = CASE WHEN p_status = 'completed'  THEN NOW() ELSE completed_at END
    WHERE id = p_trip_id;
  ELSIF p_trip_type = 'nemt' THEN
    UPDATE nemt_trips
    SET status           = v_trip_status,
        pickup_timestamp  = CASE WHEN p_status = 'client_picked_up' THEN NOW() ELSE pickup_timestamp  END,
        dropoff_timestamp = CASE WHEN p_status = 'completed'         THEN NOW() ELSE dropoff_timestamp END
    WHERE id = p_trip_id;
  END IF;

  RETURN v_log_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: get_driver_rate
-- Returns the flat_rate for a service type, checking county override first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_driver_rate(
  p_service_type TEXT,
  p_county       TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rates JSONB;
BEGIN
  -- Try county-specific override first, then global default
  SELECT config_value INTO v_rates
  FROM platform_config
  WHERE config_key = 'rates'
    AND (county = p_county OR county IS NULL)
  ORDER BY county NULLS LAST
  LIMIT 1;

  RETURN (v_rates -> p_service_type ->> 'flat_rate')::NUMERIC;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function: recalc_driver_rating
-- Recomputes the rolling average rating on drivers after a new rating insert.
-- Called by trigger on driver_ratings.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalc_driver_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE drivers
  SET rating = (
    SELECT ROUND(AVG(stars::NUMERIC), 2)
    FROM driver_ratings
    WHERE driver_id = NEW.driver_id
  )
  WHERE id = NEW.driver_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER driver_ratings_recalc
  AFTER INSERT ON driver_ratings
  FOR EACH ROW EXECUTE FUNCTION recalc_driver_rating();

-- ---------------------------------------------------------------------------
-- RLS Policies — Phase 3 new tables
-- ---------------------------------------------------------------------------

-- trip_status_log: INSERT only — no UPDATE or DELETE for any role
-- This is the core NEMT compliance guarantee.
CREATE POLICY "trip_status_log: insert by participants"
  ON trip_status_log FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      -- Driver can only log status on their own assigned trips
      get_user_role() = 'driver'
      AND (
        (trip_type = 'errand' AND trip_id IN (SELECT id FROM errand_trips WHERE driver_id = auth.uid()))
        OR
        (trip_type = 'nemt'   AND trip_id IN (SELECT id FROM nemt_trips   WHERE driver_id = auth.uid()))
      )
    )
    OR (
      -- Navigator can log status on trips for their clients
      get_user_role() = 'navigator'
      AND (
        (trip_type = 'errand' AND trip_id IN (
          SELECT et.id FROM errand_trips et
          JOIN clients c ON c.id = et.client_id
          WHERE c.navigator_id = auth.uid()
        ))
        OR
        (trip_type = 'nemt' AND trip_id IN (
          SELECT nt.id FROM nemt_trips nt
          JOIN clients c ON c.id = nt.client_id
          WHERE c.navigator_id = auth.uid()
        ))
      )
    )
  );

-- SELECT: participants can read the audit log for their trips
CREATE POLICY "trip_status_log: select by participants"
  ON trip_status_log FOR SELECT
  USING (
    is_admin()
    OR (
      get_user_role() = 'driver'
      AND (
        (trip_type = 'errand' AND trip_id IN (SELECT id FROM errand_trips WHERE driver_id = auth.uid()))
        OR
        (trip_type = 'nemt'   AND trip_id IN (SELECT id FROM nemt_trips   WHERE driver_id = auth.uid()))
      )
    )
    OR (
      get_user_role() = 'navigator'
      AND (
        (trip_type = 'errand' AND trip_id IN (
          SELECT et.id FROM errand_trips et
          JOIN clients c ON c.id = et.client_id WHERE c.navigator_id = auth.uid()
        ))
        OR
        (trip_type = 'nemt' AND trip_id IN (
          SELECT nt.id FROM nemt_trips nt
          JOIN clients c ON c.id = nt.client_id WHERE c.navigator_id = auth.uid()
        ))
      )
    )
    OR (
      get_user_role() = 'family_proxy'
      AND (
        (trip_type = 'errand' AND trip_id IN (
          SELECT et.id FROM errand_trips et
          WHERE et.client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
        ))
        OR
        (trip_type = 'nemt' AND trip_id IN (
          SELECT nt.id FROM nemt_trips nt
          WHERE nt.client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
        ))
      )
    )
  );

-- NO UPDATE policy for trip_status_log — append-only is enforced by omission.
-- NO DELETE policy — same reason.

-- saved_pharmacies
CREATE POLICY "saved_pharmacies: select by client stakeholders"
  ON saved_pharmacies FOR SELECT
  USING (
    is_admin()
    OR (get_user_role() = 'navigator' AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid()))
    OR (get_user_role() = 'family_proxy' AND client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1))
  );

CREATE POLICY "saved_pharmacies: navigator or admin insert"
  ON saved_pharmacies FOR INSERT
  WITH CHECK (
    is_admin()
    OR (get_user_role() = 'navigator' AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid()))
  );

CREATE POLICY "saved_pharmacies: navigator or admin update"
  ON saved_pharmacies FOR UPDATE
  USING (
    is_admin()
    OR (get_user_role() = 'navigator' AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid()))
  );

CREATE POLICY "saved_pharmacies: admin delete"
  ON saved_pharmacies FOR DELETE USING (is_admin());

-- driver_ratings: navigator/family_proxy INSERT, driver SELECT own ratings, admin all
CREATE POLICY "driver_ratings: insert by navigator or proxy"
  ON driver_ratings FOR INSERT
  WITH CHECK (
    is_admin()
    OR get_user_role() IN ('navigator', 'family_proxy')
  );

CREATE POLICY "driver_ratings: select"
  ON driver_ratings FOR SELECT
  USING (
    is_admin()
    OR driver_id = auth.uid()
    OR get_user_role() IN ('navigator', 'family_proxy')
  );

-- job_dispatch_log: admin or service-account INSERT; driver can see their own entries
CREATE POLICY "job_dispatch_log: admin insert"
  ON job_dispatch_log FOR INSERT
  WITH CHECK (is_admin() OR get_user_role() = 'navigator');

CREATE POLICY "job_dispatch_log: select"
  ON job_dispatch_log FOR SELECT
  USING (
    is_admin()
    OR driver_id = auth.uid()
    OR get_user_role() = 'navigator'
  );

CREATE POLICY "job_dispatch_log: driver update response"
  ON job_dispatch_log FOR UPDATE
  USING (driver_id = auth.uid() OR is_admin());

-- sms_errand_requests: navigator sees their clients' requests; admin sees all
CREATE POLICY "sms_errand_requests: select"
  ON sms_errand_requests FOR SELECT
  USING (
    is_admin()
    OR navigator_id = auth.uid()
  );

CREATE POLICY "sms_errand_requests: admin or service insert"
  ON sms_errand_requests FOR INSERT
  WITH CHECK (is_admin() OR get_user_role() = 'navigator');

CREATE POLICY "sms_errand_requests: navigator or admin update"
  ON sms_errand_requests FOR UPDATE
  USING (is_admin() OR navigator_id = auth.uid());

-- platform_config: admin only
CREATE POLICY "platform_config: admin only"
  ON platform_config FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Navigators and family proxies can read rates (for booking UI)
CREATE POLICY "platform_config: read rates"
  ON platform_config FOR SELECT
  USING (config_key = 'rates');
