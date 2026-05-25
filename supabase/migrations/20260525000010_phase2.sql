-- =============================================================================
-- Migration 010: Phase 2 helpers
-- Share-token generator, ZIP→county lookup, task-step helper, sms_log
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ZIP → Georgia county lookup (Sumter / Lee / Terrell / Webster starter set)
-- Extend this table as Pathway expands to new counties.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS zip_county_map (
  zip    TEXT PRIMARY KEY,
  county TEXT NOT NULL,
  state  TEXT NOT NULL DEFAULT 'GA'
);

INSERT INTO zip_county_map (zip, county) VALUES
  ('31780', 'Sumter'),
  ('31781', 'Sumter'),
  ('31709', 'Sumter'),
  ('31763', 'Lee'),
  ('31764', 'Lee'),
  ('31730', 'Colquitt'),
  ('31792', 'Thomas'),
  ('39817', 'Decatur'),
  ('31735', 'Crisp'),
  ('31015', 'Crisp')
ON CONFLICT (zip) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Generate a 24-hour (or N-hour) document share token
-- Returns the token string; caller builds the share URL.
-- RLS: navigator must own the client who owns the document.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_document_share_token(
  p_document_id UUID,
  p_expiry_hours INT DEFAULT 24
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_rows  INT;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');

  UPDATE documents
  SET
    share_token   = v_token,
    share_expires = NOW() + (p_expiry_hours || ' hours')::INTERVAL
  WHERE id = p_document_id
    AND (
      -- navigator owns client
      client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
      OR is_admin()
    );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Document not found or not authorized';
  END IF;

  RETURN v_token;
END;
$$;

-- ---------------------------------------------------------------------------
-- Append a step to a task's JSONB steps array
-- Avoids client-side read-modify-write race.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION append_task_step(
  p_task_id UUID,
  p_content  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_step JSONB;
BEGIN
  v_step := jsonb_build_object(
    'id',        gen_random_uuid(),
    'content',   p_content,
    'timestamp', NOW()
  );

  UPDATE tasks
  SET steps = steps || v_step
  WHERE id = p_task_id
    AND (navigator_id = auth.uid() OR is_admin());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found or not authorized';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- SMS log — tracks every outbound SMS for debugging and audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sms_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number  TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  event_type TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'sent',
  twilio_sid TEXT,
  error_msg  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sms_log IS
  'Audit log for all outbound Twilio SMS messages from Pathway edge functions.';

ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_log: admin only"
  ON sms_log FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX idx_sms_log_event_type ON sms_log (event_type);
CREATE INDEX idx_sms_log_created_at ON sms_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- Expired share token cleanup (run periodically — e.g., pg_cron or Supabase schedule)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_document_share_tokens()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  UPDATE documents
  SET share_token = NULL, share_expires = NULL
  WHERE share_expires < NOW();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
