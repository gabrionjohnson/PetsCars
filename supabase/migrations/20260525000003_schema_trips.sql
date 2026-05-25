-- =============================================================================
-- Migration 003: Trip tables —
--                errand_trips (Layer 2, private pay)
--                nemt_trips   (Layer 3, Medicaid-billable)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE errand_service_type AS ENUM (
  'pharmacy_pickup',
  'grocery_run',
  'small_errand',
  'ride_and_wait'
);

CREATE TYPE trip_status AS ENUM (
  'pending',
  'assigned',
  'en_route',
  'completed',
  'canceled'
);

CREATE TYPE nemt_trip_type AS ENUM (
  'ambulatory',
  'wheelchair',
  'stretcher'
);

CREATE TYPE claim_status AS ENUM (
  'not_submitted',
  'submitted',
  'paid',
  'denied',
  'needs_resubmission'
);

-- ---------------------------------------------------------------------------
-- Errand Trips (Layer 2 — Private Pay)
-- Dispatched to community drivers. Payment via Stripe charge to family proxy.
-- driver_payout = flat_rate * 0.75 (computed by trigger).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS errand_trips (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID               NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  driver_id        UUID               REFERENCES drivers(id) ON DELETE SET NULL,
  booked_by        UUID               REFERENCES profiles(id) ON DELETE SET NULL,
  service_type     errand_service_type NOT NULL,
  pickup_address   TEXT               NOT NULL,
  destination      TEXT,
  instructions     TEXT,
  status           trip_status        NOT NULL DEFAULT 'pending',
  flat_rate        NUMERIC(8,2)       NOT NULL,
  driver_payout    NUMERIC(8,2),
  stripe_charge_id TEXT,
  gps_start        JSONB,
  gps_end          JSONB,
  scheduled_for    TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE errand_trips IS
  'Private-pay Layer 2 errand runs dispatched to community drivers. '
  'driver_payout is auto-computed as 75% of flat_rate by trigger.';
COMMENT ON COLUMN errand_trips.gps_start IS 'JSONB: {lat, lng, timestamp}';
COMMENT ON COLUMN errand_trips.gps_end IS 'JSONB: {lat, lng, timestamp}';
COMMENT ON COLUMN errand_trips.booked_by IS
  'profiles.id of the Navigator or Family Proxy who created the booking.';

ALTER TABLE errand_trips ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- NEMT Trips (Layer 3 — Medicaid-Billable)
-- Georgia Verida broker integration. Requires 3-day advance scheduling,
-- GPS coords, member signature, and loaded-mile billing.
-- total_billed = base_fee + (loaded_miles * mileage_rate) (computed by trigger).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nemt_trips (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID          NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  driver_id            UUID          REFERENCES drivers(id) ON DELETE SET NULL,
  booked_by            UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  trip_type            nemt_trip_type NOT NULL,
  pickup_address       TEXT          NOT NULL,
  appointment_address  TEXT          NOT NULL,
  appointment_provider TEXT,
  appointment_type     TEXT,
  -- Must be a future datetime; 3-business-day advance requirement enforced at app layer
  scheduled_datetime   TIMESTAMPTZ   NOT NULL CHECK (scheduled_datetime > NOW()),
  return_scheduled     TIMESTAMPTZ,
  medicaid_id          TEXT          NOT NULL,
  base_fee             NUMERIC(8,2),
  -- NULL until trip is completed; must be positive when set (Georgia DCH loaded-miles billing)
  loaded_miles         NUMERIC(6,2)  CHECK (loaded_miles IS NULL OR loaded_miles > 0),
  mileage_rate         NUMERIC(6,4),
  total_billed         NUMERIC(8,2),
  gps_pickup_coords    JSONB,
  gps_dropoff_coords   JSONB,
  pickup_timestamp     TIMESTAMPTZ,
  dropoff_timestamp    TIMESTAMPTZ,
  member_signature_url TEXT,
  claim_status         claim_status  NOT NULL DEFAULT 'not_submitted',
  verida_claim_id      TEXT,
  paid_amount          NUMERIC(8,2),
  denial_reason        TEXT,
  status               trip_status   NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE nemt_trips IS
  'Medicaid-billable NEMT trips (Georgia Verida broker). '
  'Requires GPS coords, member signature, and 3-business-day advance booking. '
  'Clean claim target: 95%+ for 7–14 day payment cycle.';
COMMENT ON COLUMN nemt_trips.loaded_miles IS
  'Georgia DCH billing uses loaded miles only (pickup to dropoff, not deadhead).';
COMMENT ON COLUMN nemt_trips.mileage_rate IS
  'Georgia DCH per-mile reimbursement rate (e.g., 0.2250).';
COMMENT ON COLUMN nemt_trips.member_signature_url IS
  'Supabase Storage path to captured electronic signature image.';
COMMENT ON COLUMN nemt_trips.gps_pickup_coords IS 'JSONB: {lat, lng}';
COMMENT ON COLUMN nemt_trips.gps_dropoff_coords IS 'JSONB: {lat, lng}';

ALTER TABLE nemt_trips ENABLE ROW LEVEL SECURITY;
