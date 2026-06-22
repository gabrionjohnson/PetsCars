# Home-Ops App

A local-first home-maintenance app for first-time homeowners (years 1-3). It
remembers the upkeep your home needs so you don't have to: a seeded
maintenance schedule with local reminders, appliance/recall tracking, and a
permanent, exportable home history.

No accounts, no cloud sync. Everything lives in an on-device SQLite database.
The only network calls the app makes are: (1) fetching a public recall
dataset, and (2) RevenueCat billing for Pro subscriptions.

**This app provides general reminders and information only. It is not a
safety inspection, a warranty service, or legal/professional advice. Always
consult a licensed professional for safety-critical work.** This disclaimer
is also shown in-app, in Settings.

## Feature phases

- **Phase 1 — Schedule (free).** Onboarding collects a home nickname and,
  optionally, address/year-built/ZIP to infer a home-age band and climate
  zone. A static rules table (`src/data/taskLibrary.ts`) seeds a maintenance
  task list from that profile. Tasks repeat on a cadence (monthly, every 90
  days, seasonal, annual w/ optional anchor month, every 3 years) and get
  local push reminders via `expo-notifications`. The dashboard buckets tasks
  into Due now / Coming up / Later.
- **Phase 2 — Watch (Pro).** Track appliances (name/type/brand/model/purchase
  date) and warranties (provider + expiry, with expiring-soon/expired
  styling). A weekly cron script pulls and slims U.S. CPSC recall data; the
  app downloads that slim JSON and matches it against your appliances
  on-device using brand + product/type keyword overlap (not UPC, since CPSC
  doesn't reliably expose UPCs). Matches and warranty expirations both
  trigger local push alerts.
- **Phase 3 — Record (Pro).** Attach receipts, manuals, and photos to a
  permanent, timestamped home history. Export everything as JSON or a
  formatted PDF for insurance, resale, or your own records.

Out of scope for v1 (by design): renovation/finance dashboards, contractor
marketplaces, social features, multi-property support, accounts, cloud sync.

## Tech stack

- React Native + Expo (managed workflow, SDK 56), TypeScript (strict)
- `expo-sqlite` (on-device storage) behind a hand-rolled, typed query layer
  in `src/db/queries/*` — no ORM
- `expo-notifications` for local reminders/alerts (no push server)
- `react-native-purchases` (RevenueCat) wrapping App Store / Play Billing
- `expo-document-picker` / `expo-image-picker` / `expo-file-system` for
  permanent document storage
- `expo-print` + `expo-sharing` for PDF export
- Jest + ts-jest for testing pure-TypeScript domain logic

## Project layout

```
src/
  data/         static config: task library, climate zones, home-age bands
  db/           SQLite client + typed query modules (one per table)
  domain/       pure-TS business logic: scheduleEngine, recallMatching,
                recallSync, warranty, backgroundSync
  notifications/ local notification setup + scheduling helpers
  billing/      RevenueCat configuration + purchase helpers
  export/       JSON/PDF home-history export
  storage/      permanent on-device document storage
  state/        app-wide React context (home, Pro status, DB readiness)
  navigation/   React Navigation stack + tab structure
  screens/      one file per screen
  components/   shared UI primitives + theme
scripts/recall-ingest/   weekly CPSC recall-ingest job (Node, run outside the app)
__tests__/      Jest tests for the schedule engine and recall matching
```

The domain logic that most needs correctness guarantees — cadence math
(`src/domain/scheduleEngine.ts`) and recall matching
(`src/domain/recallMatching.ts`) — has no React Native dependencies, so it's
covered by plain Jest unit tests independent of any device/simulator.

## Getting started

```bash
npm install
npm run ios       # or: npm run android / npm run web
```

Copy `.env.example` to `.env` and fill in values as needed (see below). All
variables are optional in development — the app falls back to a bundled
sample recall dataset and a local "Pro" dev-stub toggle in Settings when
RevenueCat isn't configured.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_RECALL_DATASET_URL` | URL of the slim recall dataset published by the ingest script (see below). Unset → app uses the bundled fictional sample at `src/data/sampleRecallDataset.json`. |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` / `_ANDROID` | RevenueCat public SDK keys. Unset → Paywall shows a "purchases not available" message and Settings exposes a dev-only Pro toggle instead. |

## Recall data pipeline

`scripts/recall-ingest/fetch-cpsc-recalls.mjs` is a standalone Node script
(no Expo/RN dependencies) meant to run on a weekly cron (GitHub Actions,
any serverless scheduler, etc.), **outside** of the mobile app:

```bash
node scripts/recall-ingest/fetch-cpsc-recalls.mjs --years=5 --out=data/recalls-slim.json
```

It pages through CPSC's public SaferProducts.gov REST API, reduces every
record to `{ id, title, url, hazard, recallDate, keywords }` (keywords are
tokenized from product name/model/type and manufacturer/importer names —
see `tokenize.mjs`), and writes one JSON file. Publish that file to a CDN or
object store and point `EXPO_PUBLIC_RECALL_DATASET_URL` at it; the app
re-fetches it and re-matches on-device on demand (Settings → "Check for
recalls & warranty alerts now") and whenever a user opens Appliances.

Matching (`src/domain/recallMatching.ts`) is deliberately conservative: an
appliance only matches a recall if its brand **and** its product/type both
overlap with the recall's keyword set. Brand-only or product-only overlap is
not enough — this avoids false positives like matching every "dishwasher" in
the dataset to a user's unrelated dishwasher.

## Tests

```bash
npm test
```

Runs Jest against `__tests__/scheduleEngine.test.ts` (cadence math: monthly
day-clamping, every-90-days exact arithmetic, seasonal, annual with/without
an anchor month and year-rollover, every-3-years; due-now/due-soon
boundaries; seed-task selection by home-age-band/climate-zone with
de-duplication) and `__tests__/recallMatching.test.ts` (tokenization,
brand+product overlap requirements, multi-appliance matching).

Tests run against a dedicated `tsconfig.test.json` (extends the app's
`tsconfig.json`, adds Jest's ambient types) so the app's own
`npx tsc --noEmit` stays unaffected by test-only globals.

## Known limitations

- Built and type-checked in a sandbox without an iOS/Android simulator
  available, so UI flows (onboarding, navigation, notification prompts,
  paywall purchase flow) have been reviewed but not exercised live on a
  device. Run `npm run ios`/`npm run android` locally before shipping.
- The CPSC SaferProducts.gov response shape isn't formally documented, so
  `slimRecord()` in the ingest script reads fields defensively with
  fallbacks. Spot-check the output the first time you run it against live
  data.
