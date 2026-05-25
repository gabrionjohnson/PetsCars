-- =============================================================================
-- Migration 002: Concierge layer schema —
--                sessions, tasks, documents, benefits_screenings
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE task_category AS ENUM (
  'government_benefits',
  'va_benefits',
  'medicare_insurance',
  'housing_assistance',
  'utility_broadband',
  'tech_help'
);

CREATE TYPE task_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'on_hold',
  'canceled'
);

CREATE TYPE document_type AS ENUM (
  'ssn_card',
  'medicare_card',
  'birth_certificate',
  'dd214',
  'insurance_card',
  'pay_stub',
  'lease_agreement',
  'prescription_list',
  'other'
);

-- ---------------------------------------------------------------------------
-- Sessions (Concierge)
-- Navigator-logged work sessions with senior clients.
-- Auto-SMS summary is sent to family proxy after each session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  navigator_id       UUID        NOT NULL REFERENCES navigators(id) ON DELETE RESTRICT,
  date               DATE        NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes   INT         CHECK (duration_minutes > 0),
  tasks_completed    TEXT[]      NOT NULL DEFAULT '{}',
  notes              TEXT,
  documents_uploaded UUID[]      NOT NULL DEFAULT '{}',
  sms_summary_sent   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sessions IS
  'Logged Navigator-client work sessions. '
  'Setting sms_summary_sent=true triggers referral activation check.';
COMMENT ON COLUMN sessions.tasks_completed IS
  'Array of free-text task titles completed in this session.';
COMMENT ON COLUMN sessions.documents_uploaded IS
  'Array of document UUIDs uploaded during this session.';

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Tasks
-- Individual service/task items managed by Navigators on behalf of clients.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  navigator_id UUID          NOT NULL REFERENCES navigators(id) ON DELETE RESTRICT,
  category     task_category NOT NULL,
  title        TEXT          NOT NULL,
  status       task_status   NOT NULL DEFAULT 'pending',
  steps        JSONB         NOT NULL DEFAULT '[]',
  notes        TEXT,
  documents    UUID[]        NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tasks IS
  'Individual service tasks managed by Navigators. '
  'steps JSONB: [{title, completed_at, notes}]';

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Documents
-- Metadata for PHI-sensitive files stored in Supabase Storage.
-- Actual files live in the "client-documents" private Storage bucket.
-- file_url is the bucket-relative path, NOT a public URL.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  document_type document_type NOT NULL,
  file_url      TEXT          NOT NULL,
  file_name     TEXT,
  file_size_kb  INT,
  uploaded_by   UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  share_token   TEXT,
  share_expires TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE documents IS
  'PHI-sensitive document metadata. Files stored in "client-documents" '
  'Supabase Storage bucket with RLS. file_url is the bucket path, '
  'not a public URL. share_token enables time-limited form submissions.';

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Benefits Screenings
-- 10-question plain-language eligibility assessment results.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS benefits_screenings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  navigator_id         UUID        REFERENCES navigators(id) ON DELETE SET NULL,
  answers              JSONB       NOT NULL DEFAULT '{}',
  recommended_programs TEXT[]      NOT NULL DEFAULT '{}',
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE benefits_screenings IS
  'Benefits eligibility screener. answers JSONB: {q1: bool, q2: bool, ...}. '
  'recommended_programs: [''SNAP'', ''Medicaid'', ''SSI'', ''LIHEAP'', ...]';

ALTER TABLE benefits_screenings ENABLE ROW LEVEL SECURITY;
