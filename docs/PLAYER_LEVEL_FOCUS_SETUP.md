# Roster Intelligence — setup & operations (Phase 1)

A weekly background agent scores the whole men roster from **in-app data only** and writes `PlayerTiers/{playerId}`.
The dashboard's **Roster intelligence** section reads it and shows the top targets. Nothing is triggered from the browser.

## Switch on / off
`LEVEL_FOCUS_ENABLED` in `mgsr-web/src/lib/featureFlags.ts`.

## Run the agent
- **Weekly (default):** `.github/workflows/tiering-worker.yml` (Sunday 02:00 UTC). "Run workflow" runs it now; tick *force* to ignore caches.
- **Locally (test without merging):** `cd mgsr-web && npm ci && npx tsx _tiering_worker.ts sweep` (needs `mgsr-web/.env.local`, see below).
- **Debug one player:** `npx tsx _tiering_worker.ts player <playerId>`.

## Configuration
GitHub → Settings → Secrets and variables → Actions (or `mgsr-web/.env.local` for local runs):
| Name | Type | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | secrets | already used by other workflows |
| `SCOUT_SERVER_URL` | variable | optional; defaults to our Render scout server (match ratings) |
| `TIERING_ALERT_EMAILS` | variable | optional; owner email(s) for the weekly digest push |

No `GEMINI_API_KEY`, no proxy, no news keys — the agent makes no external scrapes.

## Data sources (all in-app)
Players doc · FmIntelligenceCache (nightly) · our scout server `/player_stats` · ClubRequests / PlayerMatchResults ·
PlayerDocuments (MANDATE) · AgentTasks + notes · transfer-windows JSON (our own repo file, optional, for the "window closes" caption).

## Cost & speed
The only network call is to our own scout server (one per player per week; result cached in `PlayerTiers`). FM comes from Firestore (free).
A full ~40-player sweep is seconds, re-runs reuse the cache.

## Firestore rules
`PlayerTiers` block in `firestore.rules` (read for signed-in users, no client writes). Deploy with `firebase deploy --only firestore:rules`. Not required for the feature (all access is server-side).

## Known limits (Phase 1)
- A player with no FM cache entry and no scout-stats match is scored on market value + league only — the confidence figure shows this.
- Calls/meetings count as effort only when logged as a note or task.
- Level definitions per market are a draft in `config.ts` (`TIER_DEFINITIONS`). Tune weights/thresholds there after the first real ranking.
