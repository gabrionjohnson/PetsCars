-- =============================================================================
-- Migration 007: Row Level Security policies
--
-- Role matrix:
--   admin        — full access to everything
--   navigator    — their own clients, sessions, tasks, documents
--   driver       — their own assigned trips; can see all active drivers
--   family_proxy — read-only on their one linked client; can book errands
--
-- get_user_role() and is_admin() are SECURITY DEFINER — they bypass RLS on
-- profiles to prevent infinite recursion.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------------------------

CREATE POLICY "profiles: own or admin"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "profiles: update own or admin"
  ON profiles FOR UPDATE
  USING (id = auth.uid() OR is_admin());

-- INSERT is handled by the handle_new_user() SECURITY DEFINER trigger.
-- Admin can also manually insert profiles (e.g., to seed the first admin).
CREATE POLICY "profiles: admin insert"
  ON profiles FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "profiles: admin delete"
  ON profiles FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- NAVIGATORS
-- ---------------------------------------------------------------------------

CREATE POLICY "navigators: select"
  ON navigators FOR SELECT
  USING (
    is_admin()
    OR id = auth.uid()
    OR (
      -- family proxy can see their client's assigned navigator
      get_user_role() = 'family_proxy'
      AND id = (
        SELECT c.navigator_id
        FROM clients c
        JOIN family_proxies fp ON fp.client_id = c.id
        WHERE fp.id = auth.uid()
        LIMIT 1
      )
    )
  );

CREATE POLICY "navigators: self-insert or admin"
  ON navigators FOR INSERT
  WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "navigators: update own or admin"
  ON navigators FOR UPDATE
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "navigators: admin delete"
  ON navigators FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- DRIVERS
-- ---------------------------------------------------------------------------

CREATE POLICY "drivers: select"
  ON drivers FOR SELECT
  USING (
    is_admin()
    OR id = auth.uid()
    -- navigators can see all active drivers for dispatch
    OR get_user_role() = 'navigator'
  );

CREATE POLICY "drivers: self-insert or admin"
  ON drivers FOR INSERT
  WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "drivers: update own or admin"
  ON drivers FOR UPDATE
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "drivers: admin delete"
  ON drivers FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- CLIENTS
-- ---------------------------------------------------------------------------

CREATE POLICY "clients: select"
  ON clients FOR SELECT
  USING (
    is_admin()
    OR navigator_id = auth.uid()
    OR (
      get_user_role() = 'family_proxy'
      AND id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "clients: navigator or admin insert"
  ON clients FOR INSERT
  WITH CHECK (
    is_admin()
    OR get_user_role() = 'navigator'
  );

CREATE POLICY "clients: navigator or admin update"
  ON clients FOR UPDATE
  USING (
    is_admin()
    OR navigator_id = auth.uid()
  );

CREATE POLICY "clients: admin delete"
  ON clients FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- FAMILY PROXIES
-- ---------------------------------------------------------------------------

CREATE POLICY "family_proxies: select"
  ON family_proxies FOR SELECT
  USING (
    is_admin()
    OR id = auth.uid()
    OR (
      -- navigator can see the family proxy for their clients
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
  );

CREATE POLICY "family_proxies: self-insert or admin"
  ON family_proxies FOR INSERT
  WITH CHECK (id = auth.uid() OR is_admin());

CREATE POLICY "family_proxies: update own or admin"
  ON family_proxies FOR UPDATE
  USING (id = auth.uid() OR is_admin());

CREATE POLICY "family_proxies: admin delete"
  ON family_proxies FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- SESSIONS (Concierge)
-- ---------------------------------------------------------------------------

CREATE POLICY "sessions: select"
  ON sessions FOR SELECT
  USING (
    is_admin()
    OR navigator_id = auth.uid()
    OR (
      get_user_role() = 'family_proxy'
      AND client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "sessions: navigator or admin insert"
  ON sessions FOR INSERT
  WITH CHECK (
    is_admin()
    OR navigator_id = auth.uid()
  );

CREATE POLICY "sessions: navigator or admin update"
  ON sessions FOR UPDATE
  USING (
    is_admin()
    OR navigator_id = auth.uid()
  );

CREATE POLICY "sessions: admin delete"
  ON sessions FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- TASKS
-- ---------------------------------------------------------------------------

CREATE POLICY "tasks: select"
  ON tasks FOR SELECT
  USING (
    is_admin()
    OR navigator_id = auth.uid()
    OR (
      get_user_role() = 'family_proxy'
      AND client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "tasks: navigator or admin insert"
  ON tasks FOR INSERT
  WITH CHECK (
    is_admin()
    OR navigator_id = auth.uid()
  );

CREATE POLICY "tasks: navigator or admin update"
  ON tasks FOR UPDATE
  USING (
    is_admin()
    OR navigator_id = auth.uid()
  );

CREATE POLICY "tasks: navigator or admin delete"
  ON tasks FOR DELETE
  USING (
    is_admin()
    OR navigator_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- DOCUMENTS
-- ---------------------------------------------------------------------------

CREATE POLICY "documents: select"
  ON documents FOR SELECT
  USING (
    is_admin()
    OR (
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
    OR (
      get_user_role() = 'family_proxy'
      AND client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "documents: navigator or admin insert"
  ON documents FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
  );

-- Document metadata updates (e.g., setting share_token) are admin-only
CREATE POLICY "documents: admin update"
  ON documents FOR UPDATE
  USING (is_admin());

CREATE POLICY "documents: admin delete"
  ON documents FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- BENEFITS SCREENINGS
-- ---------------------------------------------------------------------------

CREATE POLICY "benefits_screenings: select"
  ON benefits_screenings FOR SELECT
  USING (
    is_admin()
    OR navigator_id = auth.uid()
    OR (
      get_user_role() = 'family_proxy'
      AND client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "benefits_screenings: navigator or admin insert"
  ON benefits_screenings FOR INSERT
  WITH CHECK (
    is_admin()
    OR navigator_id = auth.uid()
  );

CREATE POLICY "benefits_screenings: navigator or admin update"
  ON benefits_screenings FOR UPDATE
  USING (
    is_admin()
    OR navigator_id = auth.uid()
  );

CREATE POLICY "benefits_screenings: admin delete"
  ON benefits_screenings FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- ERRAND TRIPS
-- ---------------------------------------------------------------------------

CREATE POLICY "errand_trips: select"
  ON errand_trips FOR SELECT
  USING (
    is_admin()
    OR driver_id = auth.uid()
    OR (
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
    OR (
      get_user_role() = 'family_proxy'
      AND client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "errand_trips: navigator or family_proxy insert"
  ON errand_trips FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
    OR (
      get_user_role() = 'family_proxy'
      AND client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "errand_trips: navigator, driver, or admin update"
  ON errand_trips FOR UPDATE
  USING (
    is_admin()
    OR driver_id = auth.uid()
    OR (
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
  );

CREATE POLICY "errand_trips: admin delete"
  ON errand_trips FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- NEMT TRIPS
-- ---------------------------------------------------------------------------

CREATE POLICY "nemt_trips: select"
  ON nemt_trips FOR SELECT
  USING (
    is_admin()
    OR driver_id = auth.uid()
    OR (
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
    OR (
      get_user_role() = 'family_proxy'
      AND client_id = (SELECT client_id FROM family_proxies WHERE id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY "nemt_trips: navigator or admin insert"
  ON nemt_trips FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
  );

CREATE POLICY "nemt_trips: navigator, driver, or admin update"
  ON nemt_trips FOR UPDATE
  USING (
    is_admin()
    -- driver logs GPS coords, timestamps, and signature at pickup/dropoff
    OR driver_id = auth.uid()
    OR (
      get_user_role() = 'navigator'
      AND client_id IN (SELECT id FROM clients WHERE navigator_id = auth.uid())
    )
  );

CREATE POLICY "nemt_trips: admin delete"
  ON nemt_trips FOR DELETE
  USING (is_admin());

-- ---------------------------------------------------------------------------
-- AMBASSADORS
-- Phase 1: admin-managed only. Phase 5 adds ambassador self-service portal.
-- ---------------------------------------------------------------------------

CREATE POLICY "ambassadors: admin only"
  ON ambassadors FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- REFERRALS
-- ---------------------------------------------------------------------------

CREATE POLICY "referrals: admin only"
  ON referrals FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
