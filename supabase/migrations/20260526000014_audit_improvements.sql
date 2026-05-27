-- =============================================================================
-- Migration 000014: Audit & Compliance Improvements
-- =============================================================================
-- Changes:
--   1. stripe_processed_events — Stripe webhook idempotency table
--   2. sms_failures — SMS delivery failure log
--   3. trip_status_log index (trip_id, created_at)
--   4. nemt_trips constraint: loaded_miles must be set on completed trips
--   5. nemt_claims: mileage_flagged column + auto-flag trigger
--   6. nemt_filing_alerts view: trips approaching 30-day Verida timely filing deadline
--   7. check_duplicate_nemt_trip() helper function
--   8. increment_ambassador_earned() helper for atomic increment
--   9. Additional missing indexes
-- =============================================================================

-- ── 1. Stripe webhook idempotency ─────────────────────────────────────────────
-- Stores processed Stripe event IDs to prevent double-processing on retries.
CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id     TEXT        PRIMARY KEY,
  event_type   TEXT        NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-purge events older than 30 days (beyond Stripe's retry window)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_processed_events (processed_at);

COMMENT ON TABLE stripe_processed_events IS
  'Stores processed Stripe event IDs for idempotency. '
  'Prune rows WHERE processed_at < now() - INTERVAL ''30 days'' periodically.';

ALTER TABLE stripe_processed_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stripe_events: admin read"
  ON stripe_processed_events FOR SELECT USING (is_admin());

-- ── 2. SMS delivery failure log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_failures (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID        REFERENCES clients(id) ON DELETE SET NULL,
  to_phone         TEXT        NOT NULL,
  message_preview  TEXT,        -- First 80 chars of message (no full content)
  twilio_error_code TEXT,
  twilio_error_msg  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_failures_client
  ON sms_failures (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_failures_created
  ON sms_failures (created_at DESC);

ALTER TABLE sms_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_failures: admin read"
  ON sms_failures FOR SELECT USING (is_admin());
CREATE POLICY "sms_failures: navigator read own clients"
  ON sms_failures FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM clients WHERE navigator_id = auth.uid()
    )
  );

-- ── 3. trip_status_log index ──────────────────────────────────────────────────
-- Speeds up execution flow queries (status history per trip)
CREATE INDEX IF NOT EXISTS idx_trip_status_log_trip
  ON trip_status_log (trip_id, created_at DESC);

-- ── 4. nemt_trips: completed trips must have loaded_miles ─────────────────────
-- ADD CONSTRAINT IF NOT EXISTS is not valid SQL — use a DO block to guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'nemt_trips_completed_loaded_miles'
      AND conrelid   = 'nemt_trips'::regclass
  ) THEN
    ALTER TABLE nemt_trips
      ADD CONSTRAINT nemt_trips_completed_loaded_miles CHECK (
        status != 'completed' OR loaded_miles IS NOT NULL
      );
  END IF;
END;
$$;

-- ── 5. nemt_claims: mileage reasonableness flag ───────────────────────────────
ALTER TABLE nemt_claims
  ADD COLUMN IF NOT EXISTS mileage_flagged     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mileage_flag_reason TEXT;

CREATE OR REPLACE FUNCTION nemt_claims_flag_high_mileage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.loaded_miles IS NOT NULL AND NEW.loaded_miles > 100 THEN
    NEW.mileage_flagged     := TRUE;
    NEW.mileage_flag_reason := 'Loaded miles (' || NEW.loaded_miles ||
      ') exceed 100-mile threshold — review before submission';
  ELSIF NEW.loaded_miles IS NOT NULL AND NEW.loaded_miles <= 100 THEN
    NEW.mileage_flagged     := FALSE;
    NEW.mileage_flag_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nemt_claims_mileage_check ON nemt_claims;
CREATE TRIGGER nemt_claims_mileage_check
  BEFORE INSERT OR UPDATE OF loaded_miles ON nemt_claims
  FOR EACH ROW EXECUTE FUNCTION nemt_claims_flag_high_mileage();

-- Back-fill for any existing claims with high mileage
UPDATE nemt_claims
SET
  mileage_flagged     = TRUE,
  mileage_flag_reason = 'Loaded miles (' || loaded_miles ||
    ') exceed 100-mile threshold — review before submission'
WHERE loaded_miles > 100
  AND mileage_flagged = FALSE;

-- ── 6. NEMT filing deadline alert view ───────────────────────────────────────
-- Surfaces completed trips where no claim has been submitted within 25 days
-- (giving 5-day buffer before the 30-day Verida timely-filing deadline).
CREATE OR REPLACE VIEW nemt_filing_alerts AS
SELECT
  t.id                                                       AS trip_id,
  t.client_id,
  c.name                                                     AS client_name,
  t.scheduled_datetime,
  t.loaded_miles,
  EXTRACT(DAY FROM now() - t.scheduled_datetime)::int        AS days_since_trip,
  nc.id                                                      AS claim_id,
  nc.status                                                  AS claim_status
FROM nemt_trips t
JOIN clients      c  ON c.id  = t.client_id
LEFT JOIN nemt_claims nc ON nc.trip_id = t.id
WHERE
  t.status = 'completed'
  AND t.scheduled_datetime < now() - INTERVAL '25 days'
  AND (nc.id IS NULL OR nc.status NOT IN ('submitted', 'paid'))
ORDER BY t.scheduled_datetime ASC;

COMMENT ON VIEW nemt_filing_alerts IS
  'Completed NEMT trips approaching or past the 30-day Verida timely-filing deadline. '
  'Alert fires at 25 days (5-day buffer). Query this view for admin alerts.';

-- ── 7. Duplicate NEMT trip detection ─────────────────────────────────────────
-- Returns TRUE if another non-canceled trip exists for the same client
-- within 2 hours of the given datetime.
CREATE OR REPLACE FUNCTION check_duplicate_nemt_trip(
  p_client_id          UUID,
  p_scheduled_datetime TIMESTAMPTZ,
  p_exclude_trip_id    UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM nemt_trips
    WHERE client_id = p_client_id
      AND status NOT IN ('canceled')
      AND ABS(EXTRACT(EPOCH FROM (scheduled_datetime - p_scheduled_datetime))) < 7200
      AND (p_exclude_trip_id IS NULL OR id != p_exclude_trip_id)
  );
$$;

-- ── 8. Ambassador total_earned atomic increment ───────────────────────────────
-- Safe atomic increment for ambassador.total_earned — avoids the read-modify-write
-- race condition in stripe-webhook.
CREATE OR REPLACE FUNCTION increment_ambassador_earned(
  p_id     UUID,
  p_amount NUMERIC
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE ambassadors
  SET total_earned = total_earned + p_amount
  WHERE id = p_id;
$$;

-- ── 9. Additional indexes ─────────────────────────────────────────────────────
-- clients.ambassador_id — full (non-partial) index for JOIN queries
CREATE INDEX IF NOT EXISTS idx_clients_ambassador_id_full
  ON clients (ambassador_id);

-- nemt_claims.status ordering for claims queue (already has idx_nemt_claims_status
-- but add one with created_at for admin queue ordering)
CREATE INDEX IF NOT EXISTS idx_nemt_claims_status_created
  ON nemt_claims (status, created_at DESC);

-- nemt_claims.mileage_flagged — admin review queue
CREATE INDEX IF NOT EXISTS idx_nemt_claims_flagged
  ON nemt_claims (mileage_flagged) WHERE mileage_flagged = TRUE;

-- payouts recipient + status lookup
CREATE INDEX IF NOT EXISTS idx_payouts_recipient_status
  ON payouts (recipient_type, recipient_id, status);

COMMENT ON FUNCTION check_duplicate_nemt_trip IS
  'Returns TRUE if a non-canceled NEMT trip already exists for the given client '
  'within 2 hours of p_scheduled_datetime. Used by the booking wizard to warn navigators.';

COMMENT ON FUNCTION increment_ambassador_earned IS
  'Atomically increments ambassadors.total_earned. '
  'Use instead of read-modify-write in application code.';
