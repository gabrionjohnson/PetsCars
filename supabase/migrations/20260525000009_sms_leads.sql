-- =============================================================================
-- Migration 009: SMS lead capture
-- Stores inbound SMS leads from Twilio before they become full clients.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sms_leads (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                 TEXT        NOT NULL,
  zip                   TEXT,
  county                TEXT,
  message_body          TEXT        NOT NULL,
  assigned_navigator_id UUID        REFERENCES navigators(id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'new'
                          CHECK (status IN ('new', 'contacted', 'enrolled', 'declined')),
  navigator_notified_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sms_leads IS
  'Inbound SMS leads captured by the Twilio webhook. '
  'When a senior texts a ZIP code, a row is created here and the county '
  'navigator is notified. Graduates to a clients row during in-person onboarding.';

ALTER TABLE sms_leads ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER sms_leads_updated_at
  BEFORE UPDATE ON sms_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_sms_leads_assigned_navigator ON sms_leads (assigned_navigator_id);
CREATE INDEX idx_sms_leads_status             ON sms_leads (status);

-- Navigators see their own assigned leads; admins see all
CREATE POLICY "sms_leads: admin or assigned navigator"
  ON sms_leads FOR ALL
  USING (
    is_admin()
    OR assigned_navigator_id = auth.uid()
  )
  WITH CHECK (
    is_admin()
    OR assigned_navigator_id = auth.uid()
  );
