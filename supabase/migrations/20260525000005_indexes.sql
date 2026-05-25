-- =============================================================================
-- Migration 005: Indexes for common query patterns
-- =============================================================================

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_navigator_id
  ON clients (navigator_id);

CREATE INDEX IF NOT EXISTS idx_clients_family_proxy_id
  ON clients (family_proxy_id);

CREATE INDEX IF NOT EXISTS idx_clients_phone
  ON clients (phone);

CREATE INDEX IF NOT EXISTS idx_clients_county
  ON clients (county);

CREATE INDEX IF NOT EXISTS idx_clients_subscription_status
  ON clients (subscription_status);

-- ---------------------------------------------------------------------------
-- navigators
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_navigators_county
  ON navigators (county);

CREATE INDEX IF NOT EXISTS idx_navigators_active
  ON navigators (active);

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_drivers_county
  ON drivers (county);

CREATE INDEX IF NOT EXISTS idx_drivers_active
  ON drivers (active);

CREATE INDEX IF NOT EXISTS idx_drivers_has_wav
  ON drivers (has_wav);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_client_id
  ON sessions (client_id);

CREATE INDEX IF NOT EXISTS idx_sessions_navigator_id
  ON sessions (navigator_id);

CREATE INDEX IF NOT EXISTS idx_sessions_date
  ON sessions (date DESC);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tasks_client_id
  ON tasks (client_id);

CREATE INDEX IF NOT EXISTS idx_tasks_navigator_id
  ON tasks (navigator_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks (status);

CREATE INDEX IF NOT EXISTS idx_tasks_category
  ON tasks (category);

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_client_id
  ON documents (client_id);

CREATE INDEX IF NOT EXISTS idx_documents_document_type
  ON documents (document_type);

CREATE INDEX IF NOT EXISTS idx_documents_share_token
  ON documents (share_token)
  WHERE share_token IS NOT NULL;

-- ---------------------------------------------------------------------------
-- benefits_screenings
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_benefits_screenings_client_id
  ON benefits_screenings (client_id);

-- ---------------------------------------------------------------------------
-- errand_trips
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_errand_trips_client_id
  ON errand_trips (client_id);

CREATE INDEX IF NOT EXISTS idx_errand_trips_driver_id
  ON errand_trips (driver_id);

CREATE INDEX IF NOT EXISTS idx_errand_trips_status
  ON errand_trips (status);

CREATE INDEX IF NOT EXISTS idx_errand_trips_scheduled_for
  ON errand_trips (scheduled_for)
  WHERE scheduled_for IS NOT NULL;

-- ---------------------------------------------------------------------------
-- nemt_trips
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_nemt_trips_client_id
  ON nemt_trips (client_id);

CREATE INDEX IF NOT EXISTS idx_nemt_trips_driver_id
  ON nemt_trips (driver_id);

CREATE INDEX IF NOT EXISTS idx_nemt_trips_status
  ON nemt_trips (status);

CREATE INDEX IF NOT EXISTS idx_nemt_trips_claim_status
  ON nemt_trips (claim_status);

CREATE INDEX IF NOT EXISTS idx_nemt_trips_scheduled_datetime
  ON nemt_trips (scheduled_datetime);

CREATE INDEX IF NOT EXISTS idx_nemt_trips_medicaid_id
  ON nemt_trips (medicaid_id);

-- ---------------------------------------------------------------------------
-- referrals
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_referrals_ambassador_id
  ON referrals (ambassador_id);

CREATE INDEX IF NOT EXISTS idx_referrals_client_id
  ON referrals (client_id);
