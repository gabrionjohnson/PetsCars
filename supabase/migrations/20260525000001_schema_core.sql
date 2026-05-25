-- =============================================================================
-- Migration 001: Core schema — extensions, enums, profiles,
--                navigators, drivers, clients, family_proxies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('admin', 'navigator', 'driver', 'family_proxy');

CREATE TYPE check_status AS ENUM ('pending', 'in_progress', 'approved', 'denied');

CREATE TYPE subscription_tier AS ENUM ('basic', 'standard', 'full_care');

CREATE TYPE subscription_status AS ENUM ('inactive', 'active', 'past_due', 'canceled');

CREATE TYPE income_level AS ENUM ('below_poverty', 'low', 'moderate', 'not_disclosed');

CREATE TYPE relationship_type AS ENUM ('spouse', 'child', 'sibling', 'parent', 'other');

-- ---------------------------------------------------------------------------
-- Profiles
-- One row per authenticated Supabase user. Seniors have NO auth account —
-- they interact via SMS only and are stored in the clients table instead.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        user_role   NOT NULL,
  name        TEXT,
  phone       TEXT,
  email       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS
  'App-level user profiles linked to Supabase auth.users. '
  'Seniors (clients) are NOT in this table — they have no app login.';

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Navigators
-- Community members who manage senior client rosters (10–30 per county).
-- id is the same UUID as profiles.id (1-to-1).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS navigators (
  id                      UUID         PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  county                  TEXT,
  zip_codes               TEXT[]       NOT NULL DEFAULT '{}',
  background_check_status check_status NOT NULL DEFAULT 'pending',
  checkr_candidate_id     TEXT,
  training_complete       BOOLEAN      NOT NULL DEFAULT FALSE,
  stripe_account_id       TEXT,
  active                  BOOLEAN      NOT NULL DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE navigators IS
  'Community Navigators who onboard seniors and manage their service requests.';

ALTER TABLE navigators ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Drivers
-- Vetted local transport providers for errand runs and NEMT trips.
-- id is the same UUID as profiles.id (1-to-1).
-- A person can be both a Navigator and a Driver (dual-role).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
  id                       UUID         PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  county                   TEXT,
  vehicle_make             TEXT,
  vehicle_model            TEXT,
  vehicle_year             SMALLINT,
  license_plate            TEXT,
  has_wav                  BOOLEAN      NOT NULL DEFAULT FALSE,
  background_check_status  check_status NOT NULL DEFAULT 'pending',
  checkr_candidate_id      TEXT,
  insurance_doc_url        TEXT,
  drivers_license_verified BOOLEAN      NOT NULL DEFAULT FALSE,
  stripe_account_id        TEXT,
  active                   BOOLEAN      NOT NULL DEFAULT FALSE,
  rating                   NUMERIC(3,2) DEFAULT 5.00
                             CHECK (rating >= 1.00 AND rating <= 5.00),
  total_trips              INT          NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE drivers IS
  'Community Drivers for private-pay errand runs and Medicaid NEMT trips.';
COMMENT ON COLUMN drivers.has_wav IS
  'Has Wheelchair Accessible Vehicle — required for wheelchair-level NEMT trips.';

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Clients (Seniors)
-- Created by a Navigator during in-person onboarding.
-- Seniors do NOT have Supabase auth accounts.
-- family_proxy_id FK is added via ALTER TABLE after family_proxies is created.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id                     UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT               NOT NULL,
  dob                    DATE,
  address                TEXT,
  zip                    TEXT,
  county                 TEXT,
  phone                  TEXT               NOT NULL,
  medicaid_id            TEXT,
  va_status              BOOLEAN            NOT NULL DEFAULT FALSE,
  insurance_info         JSONB,
  income_level           income_level,
  navigator_id           UUID               REFERENCES navigators(id) ON DELETE SET NULL,
  family_proxy_id        UUID,
  subscription_tier      subscription_tier,
  subscription_status    subscription_status NOT NULL DEFAULT 'inactive',
  stripe_subscription_id TEXT,
  sms_enrollment_zip     TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  CONSTRAINT clients_phone_unique UNIQUE (phone)
);

COMMENT ON TABLE clients IS
  'Senior clients created and managed by Navigators. '
  'No app login — SMS-only interaction.';
COMMENT ON COLUMN clients.sms_enrollment_zip IS
  'ZIP captured from initial SMS enrollment; routes new leads to the correct county Navigator.';
COMMENT ON COLUMN clients.insurance_info IS
  'JSONB: {type, carrier, member_id, group_id}';

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Family Proxies
-- Remote caregivers who pay and monitor senior activity via a read-heavy dashboard.
-- id is the same UUID as profiles.id (1-to-1).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS family_proxies (
  id                 UUID              PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  client_id          UUID              NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  relationship       relationship_type,
  stripe_customer_id TEXT,
  created_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE family_proxies IS
  'Remote family members or caregivers with read access to senior activity '
  'and the ability to book services and pay subscriptions.';

ALTER TABLE family_proxies ENABLE ROW LEVEL SECURITY;

-- Add the deferred FK from clients → family_proxies now that the table exists
ALTER TABLE clients
  ADD CONSTRAINT clients_family_proxy_id_fkey
    FOREIGN KEY (family_proxy_id) REFERENCES family_proxies(id) ON DELETE SET NULL;
