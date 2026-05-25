# Pathway — Rural Senior Life Operating System

## What this is

Pathway is a three-layer platform serving rural seniors (50+) in low-connectivity communities like Plains, GA (Sumter County). The senior never touches the app — Navigators and Drivers operate on their behalf.

- **Layer 1** Digital Concierge: benefits enrollment, form completion, document uploads
- **Layer 2** Errand Network: private-pay community driver dispatch
- **Layer 3** NEMT Dispatch: Medicaid-billable transport (Georgia Verida broker)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Tailwind CSS (PWA) |
| Backend / DB | Supabase (Postgres + Auth + Storage + Realtime) |
| SMS | Twilio |
| Payments | Stripe (subscriptions + Connect) |
| Background checks | Checkr API |
| Offline sync | IndexedDB + Background Sync API |
| GPS / Maps | Google Maps API |
| Hosting | Vercel (frontend) + Supabase (backend) |

## User roles

| Role | Auth login | Description |
|---|---|---|
| `admin` | Yes | Platform admin; full access |
| `navigator` | Yes | Manages 10–30 senior clients per county |
| `driver` | Yes | Handles errands and NEMT trips |
| `family_proxy` | Yes | Read-only + can book services |
| Senior (client) | **No** | SMS-only; no app login |

## Build phases

- **Phase 1** (current): Supabase schema, RLS, auth
- **Phase 2**: Client onboarding, benefits screener, task management, document vault
- **Phase 3**: Driver onboarding, errand dispatch, family proxy dashboard, Stripe
- **Phase 4**: NEMT booking, Verida integration, GPS/signature capture, claims
- **Phase 5**: Ambassador referral system, county flyer generator, Stripe Connect

## Database

All migrations live in `supabase/migrations/`. Run in order:

| File | Contents |
|---|---|
| `000001_schema_core.sql` | Extensions, enums, profiles, navigators, drivers, clients, family_proxies |
| `000002_schema_concierge.sql` | sessions, tasks, documents, benefits_screenings |
| `000003_schema_trips.sql` | errand_trips, nemt_trips |
| `000004_schema_ambassadors.sql` | ambassadors, referrals |
| `000005_indexes.sql` | All indexes |
| `000006_functions.sql` | Triggers, auth hook, helper functions |
| `000007_rls.sql` | All Row Level Security policies |
| `000008_storage.sql` | Storage bucket object policies |

### Apply migrations

```bash
# Local dev with Supabase CLI
supabase db reset

# Against hosted Supabase project
supabase db push
```

## Auth setup (one-time, in Supabase Dashboard)

### 1. Register the JWT claims hook

Go to **Authentication → Hooks** and register:

- **Hook type**: Custom Access Token
- **Function**: `public.custom_access_token_hook`

This embeds `user_role` in every JWT so RLS policies avoid extra DB round-trips.

### 2. Create Storage buckets

Go to **Storage** and create two **private** buckets:

| Bucket | Max size | Purpose |
|---|---|---|
| `client-documents` | 50 MB | PHI documents (SSN, Medicare card, etc.) |
| `nemt-signatures` | 10 MB | Electronic member signatures for NEMT billing |

### 3. Bootstrap the first admin

1. Create a user in **Authentication → Users** with your admin email
2. In the SQL editor (runs as superuser):
   ```sql
   UPDATE profiles SET role = 'admin', name = 'Platform Admin'
   WHERE email = 'your-admin@example.com';
   ```

### 4. Signup flow for app users

Pass `user_metadata` when calling `supabase.auth.signUp()`. Only `navigator`, `driver`, and `family_proxy` are valid — the trigger blocks `admin` from being claimed via metadata; admin role must be set via SQL editor.

```js
await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      role: 'navigator',   // 'driver' or 'family_proxy' also valid; 'admin' is blocked
      name: 'Jane Smith',
      phone: '+12295550199',
    },
  },
})
```

The `handle_new_user()` trigger auto-creates a `profiles` row on signup.

### 5. Onboarding a family proxy

Family proxies **cannot self-register and link themselves to a client**. The RLS INSERT policy requires a Navigator or Admin to create the `family_proxies` row. Recommended flow:

1. Navigator creates the family proxy's Supabase auth account via invite (Dashboard → Auth → Invite User), with `user_metadata = {role: "family_proxy", name: "..."}`
2. Note the UUID assigned to that auth user
3. Navigator's app calls `INSERT INTO family_proxies (id, client_id, relationship, ...)` — allowed because the client belongs to that navigator
4. Family proxy logs in and sees their client's data immediately

### 6. Deleting a client

Because `family_proxies.client_id` is `ON DELETE RESTRICT`, you must remove the family proxy link before deleting a client:

```sql
-- 1. Remove the family proxy link (and optionally the auth account)
DELETE FROM family_proxies WHERE client_id = '<client-id>';
-- Also delete via Supabase Auth Admin API: auth.admin.deleteUser(proxy_auth_id)

-- 2. Now the client can be deleted
DELETE FROM clients WHERE id = '<client-id>';
```

## RLS summary

- `is_admin()` and `get_user_role()` are `SECURITY DEFINER` — they bypass RLS on the `profiles` table to avoid infinite recursion.
- `get_user_role()` reads the JWT claim first (fast path); falls back to a DB query during local dev before the JWT hook is configured.
- Seniors have no auth identity — their data is accessed only through their assigned Navigator or linked Family Proxy.
- Navigators can only see **active** drivers (preventing PII exposure of offboarded drivers' stripe/checkr data).
- `family_proxies` has `UNIQUE (client_id)` — one proxy per senior, enforced at the schema level.
- `benefits_screenings` SELECT grants access via the client's **current** navigator assignment, not just the original `navigator_id`, so screenings survive navigator reassignment.

## Key business rules encoded in triggers

| Trigger | Rule |
|---|---|
| `errand_trips_compute_payout` | `driver_payout = flat_rate * 0.75` |
| `nemt_trips_compute_billing` | `total_billed = base_fee + (loaded_miles * mileage_rate)` |
| `sessions_check_referral_activation` | Sets `referrals.activated_at` when first session SMS is sent |
| `errand/nemt_trips_increment_driver` | Increments `drivers.total_trips` on completion |
| `ambassadors_set_referral_code` | Auto-generates 6-char referral code if not provided |
| `on_auth_user_created` | Auto-creates `profiles` row on Supabase signup |

## HIPAA considerations

- All client data, documents, and NEMT records are PHI
- RLS ensures strict per-Navigator data isolation
- `client-documents` and `nemt-signatures` Storage buckets are private (no public URLs)
- `share_token` on documents enables time-limited, expiring links for form submissions
- Georgia DCH requires NEMT trip records (GPS, signatures, mileage logs) to be retained per retention schedule
