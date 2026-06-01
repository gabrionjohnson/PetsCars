-- =============================================================================
-- Migration 000015: Benefits Screener v2 — 32-Program Coverage
-- =============================================================================
-- Changes:
--   1. Expand benefits_screenings (version, aggregates, audit mode)
--   2. benefit_enrollments table — per-program enrollment tracking
--   3. benefit_renewal_alerts view — programs expiring within 60 days
--   4. RLS policies for benefit_enrollments
-- =============================================================================

-- ── 1. Expand benefits_screenings ─────────────────────────────────────────────
ALTER TABLE benefits_screenings
  ADD COLUMN IF NOT EXISTS screener_version        INTEGER     NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS estimated_annual_value  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS priority_programs       TEXT[],
  ADD COLUMN IF NOT EXISTS enrolled_programs       TEXT[],
  ADD COLUMN IF NOT EXISTS audit_mode              BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS previous_screening_id   UUID        REFERENCES benefits_screenings(id);

COMMENT ON COLUMN benefits_screenings.screener_version IS
  '1 = original 10-question screener, 2 = expanded 23-question screener (v2)';

COMMENT ON COLUMN benefits_screenings.estimated_annual_value IS
  'Sum of estimated annual value for all programs with status eligible or likely_eligible';

COMMENT ON COLUMN benefits_screenings.audit_mode IS
  'TRUE when this is an annual re-screen; previous_screening_id links to prior record';

-- ── 2. benefit_enrollments — per-program tracking ────────────────────────────
CREATE TABLE IF NOT EXISTS benefit_enrollments (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID          NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  program_id            TEXT          NOT NULL,
  program_name          TEXT          NOT NULL,
  status                TEXT          NOT NULL
    CHECK (status IN ('enrolled', 'pending', 'denied', 'needs_renewal', 'not_applicable')),
  enrollment_date       DATE,
  estimated_monthly_value NUMERIC(8,2),
  estimated_annual_value  NUMERIC(10,2),
  renewal_date          DATE,
  notes                 TEXT,
  task_id               UUID          REFERENCES tasks(id) ON DELETE SET NULL,
  created_by            UUID          REFERENCES navigators(id) ON DELETE SET NULL,
  screening_id          UUID          REFERENCES benefits_screenings(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (client_id, program_id)    -- one row per program per client; upsert on re-screen
);

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_client
  ON benefit_enrollments (client_id);

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_renewal
  ON benefit_enrollments (renewal_date)
  WHERE status = 'enrolled' AND renewal_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_benefit_enrollments_status
  ON benefit_enrollments (status, created_at DESC);

ALTER TABLE benefit_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benefit_enrollments: navigator or admin select"
  ON benefit_enrollments FOR SELECT
  USING (
    is_admin()
    OR client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  );

CREATE POLICY "benefit_enrollments: navigator or admin insert"
  ON benefit_enrollments FOR INSERT
  WITH CHECK (
    is_admin()
    OR client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  );

CREATE POLICY "benefit_enrollments: navigator or admin update"
  ON benefit_enrollments FOR UPDATE
  USING (
    is_admin()
    OR client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
  );

CREATE POLICY "benefit_enrollments: family_proxy read own client"
  ON benefit_enrollments FOR SELECT
  USING (
    get_user_role() = 'family_proxy'
    AND client_id IN (
      SELECT fp.client_id
      FROM family_proxies fp
      WHERE fp.id = auth.uid()
    )
  );

-- ── 3. Renewal alert view ─────────────────────────────────────────────────────
-- Surfaces enrolled programs with renewal dates within the next 60 days.
CREATE OR REPLACE VIEW benefit_renewal_alerts AS
SELECT
  be.id,
  be.client_id,
  c.name                                         AS client_name,
  c.navigator_id,
  be.program_id,
  be.program_name,
  be.renewal_date,
  (be.renewal_date - CURRENT_DATE)::INT          AS days_until_renewal,
  be.estimated_annual_value,
  be.status
FROM benefit_enrollments be
JOIN clients c ON c.id = be.client_id
WHERE be.status = 'enrolled'
  AND be.renewal_date IS NOT NULL
  AND be.renewal_date <= CURRENT_DATE + INTERVAL '60 days'
ORDER BY be.renewal_date ASC;

COMMENT ON VIEW benefit_renewal_alerts IS
  'Enrolled benefit programs with renewal dates in the next 60 days. '
  'Filtered by navigator via client.navigator_id in application layer.';

-- ── 4. updated_at trigger for benefit_enrollments ────────────────────────────
CREATE OR REPLACE FUNCTION benefit_enrollments_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS benefit_enrollments_updated_at ON benefit_enrollments;
CREATE TRIGGER benefit_enrollments_updated_at
  BEFORE UPDATE ON benefit_enrollments
  FOR EACH ROW EXECUTE FUNCTION benefit_enrollments_set_updated_at();
