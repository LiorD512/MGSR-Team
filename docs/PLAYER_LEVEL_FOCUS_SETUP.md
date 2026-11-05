# Roster Intelligence — setup & operations (Phase 1)

A weekly background agent scores the whole men roster and writes `PlayerTiers/{playerId}`. The dashboard's
**Roster intelligence** section reads it and shows the top targets. Nothing is triggered from the browser.

## Switch on / off
`LEVEL_FOCUS_ENABLED` in `mgsr-web/src/lib/featureFlags.ts` (true = new section, false = old value table).

## Run the agent
- **Weekly (default):** `.github/workflows/tiering-worker.yml` (Sunday 02:00 UTC). "Run workflow" runs it now; tick *force* to ignore caches.
- **Debug one player:** `cd mgsr-web && npx tsx _tiering_worker.ts player <playerId>`.

## Configuration
GitHub → Settings → Secrets and variables → Actions:
| Name | Type | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | secrets | already used by other workflows |
| `GEMINI_API_KEY` | secret | **add** (same key as Vercel). Without it the maths engine still runs; no AI summary/news |
| `TIERING_ALERT_EMAILS` | variable | owner email(s) for the weekly digest push (optional) |
| `SCOUT_SERVER_URL` | variable | optional (match ratings) |
| `TIERING_APP_ORIGIN` | variable | optional, defaults to `https://management.britsportgroup.com` (live FMInside fallback) |

## Cost
First sweep of ~40 players: a few minutes, one AI read each. Weekly after that: unchanged players reuse cache and skip the AI;
only players whose facts changed get a fresh AI read. Gemini Flash + search ≈ one call per analysed player per week.

## Data sources per player
Google News RSS (EN+HE, 45 days) · Gemini + Google Search · scout server / SofaScore / FotMob ratings · Transfermarkt
injuries · ClubElo · FMInside cache · Firestore (contract, mandate from `PlayerDocuments`, matching `ClubRequests`,
notes & tasks for effort, value history) · transfer windows JSON.

## Firestore rules
`PlayerTiers` block in `firestore.rules` (read for signed-in users, no client writes). Deploy with
`firebase deploy --only firestore:rules`. Not required for the feature (all access is server-side / Admin SDK).

## Known limits (Phase 1)
- Level leans on market value + league when match/FM data is missing — the confidence figure shows this.
- Calls/meetings count as effort only when logged as a note or task (no contact log is linked to players).
- Level definitions per market are a draft in `config.ts` (`TIER_DEFINITIONS`) — edit to change how the AI reads tiers.
- Tune weights/thresholds in `config.ts` after reviewing the first real ranking.
