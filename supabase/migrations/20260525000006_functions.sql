-- =============================================================================
-- Migration 006: Functions and triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at auto-stamp
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER navigators_updated_at
  BEFORE UPDATE ON navigators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER drivers_updated_at
  BEFORE UPDATE ON drivers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER family_proxies_updated_at
  BEFORE UPDATE ON family_proxies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER benefits_screenings_updated_at
  BEFORE UPDATE ON benefits_screenings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER errand_trips_updated_at
  BEFORE UPDATE ON errand_trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER nemt_trips_updated_at
  BEFORE UPDATE ON nemt_trips
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ambassadors_updated_at
  BEFORE UPDATE ON ambassadors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile on Supabase auth.users INSERT
-- Role and name are passed via user_metadata during signup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, role, name, phone, email)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'navigator'),
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'phone',
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------------------
-- Custom JWT claims hook
-- Embeds user_role in the JWT so RLS helpers can read it without a DB round-trip.
-- Must be registered in Supabase Dashboard → Authentication → Hooks.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  claims   JSONB;
  u_role   TEXT;
BEGIN
  SELECT role::TEXT INTO u_role
  FROM profiles
  WHERE id = (event->>'user_id')::UUID;

  claims := event->'claims';
  claims := jsonb_set(claims, '{user_role}', to_jsonb(COALESCE(u_role, 'anon')));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- SECURITY DEFINER so they bypass RLS on profiles (prevents infinite recursion).
-- Falls back to a DB query if JWT claim is absent (local dev without the hook).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', TRUE)::JSONB ->> 'user_role', ''),
    (SELECT role::TEXT FROM profiles WHERE id = auth.uid()),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT get_user_role() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Auto-generate ambassador referral codes (6-char, alpha-numeric, no ambiguous chars)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code  TEXT := '';
  i     INT;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, (floor(random() * length(chars)) + 1)::INT, 1);
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  attempts INT := 0;
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    LOOP
      new_code := generate_referral_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM ambassadors WHERE referral_code = new_code);
      attempts := attempts + 1;
      IF attempts > 20 THEN
        RAISE EXCEPTION 'Could not generate a unique referral code after 20 attempts';
      END IF;
    END LOOP;
    NEW.referral_code := new_code;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ambassadors_set_referral_code
  BEFORE INSERT ON ambassadors
  FOR EACH ROW EXECUTE FUNCTION set_referral_code();

-- ---------------------------------------------------------------------------
-- Auto-compute errand driver_payout = flat_rate * 0.75
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_errand_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.flat_rate IS NOT NULL THEN
    NEW.driver_payout := ROUND(NEW.flat_rate * 0.75, 2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER errand_trips_compute_payout
  BEFORE INSERT OR UPDATE OF flat_rate ON errand_trips
  FOR EACH ROW EXECUTE FUNCTION compute_errand_payout();

-- ---------------------------------------------------------------------------
-- Auto-compute NEMT total_billed = base_fee + (loaded_miles * mileage_rate)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_nemt_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.base_fee IS NOT NULL
     AND NEW.loaded_miles IS NOT NULL
     AND NEW.mileage_rate IS NOT NULL
  THEN
    NEW.total_billed := ROUND(NEW.base_fee + (NEW.loaded_miles * NEW.mileage_rate), 2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER nemt_trips_compute_billing
  BEFORE INSERT OR UPDATE OF base_fee, loaded_miles, mileage_rate ON nemt_trips
  FOR EACH ROW EXECUTE FUNCTION compute_nemt_billing();

-- ---------------------------------------------------------------------------
-- Activate referral bonus when first Navigator session SMS is sent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_referral_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.sms_summary_sent = TRUE AND OLD.sms_summary_sent = FALSE THEN
    UPDATE referrals
    SET activated_at = NOW()
    WHERE client_id = NEW.client_id
      AND activated_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sessions_check_referral_activation
  AFTER UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION check_referral_activation();

-- ---------------------------------------------------------------------------
-- Increment driver.total_trips when a trip is marked completed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_driver_trips()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed')
     AND NEW.driver_id IS NOT NULL
  THEN
    UPDATE drivers SET total_trips = total_trips + 1 WHERE id = NEW.driver_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER errand_trips_increment_driver
  AFTER UPDATE ON errand_trips
  FOR EACH ROW EXECUTE FUNCTION increment_driver_trips();

CREATE TRIGGER nemt_trips_increment_driver
  AFTER UPDATE ON nemt_trips
  FOR EACH ROW EXECUTE FUNCTION increment_driver_trips();
