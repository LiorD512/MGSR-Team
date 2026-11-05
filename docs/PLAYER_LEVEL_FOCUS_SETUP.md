# Roster Intelligence — setup & operations

A weekly background agent stores a stats snapshot for every roster player, flags those whose situation changed,
and writes `PlayerTiers/{playerId}`. The dashboard's **Roster intelligence** section reads it. Nothing runs from the browser.

## Switch on / off
`LEVEL_FOCUS_ENABLED` in `mgsr-web/src/lib/featureFlags.ts`.

## Run the agent
- **Weekly (default):** `.github/workflows/tiering-worker.yml` (Sunday 02:00 UTC). "Run workflow" runs it now; tick *force* to re-fetch stats.
- **Locally (test without merging):** `cd mgsr-web && npm ci && npx tsx _tiering_worker.ts sweep` (needs `mgsr-web/.env.local`).
- **Debug one player:** `npx tsx _tiering_worker.ts player <playerId>`.

## Configuration
GitHub → Settings → Secrets and variables → Actions (or `mgsr-web/.env.local` locally):
| Name | Type | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | secrets | already used by other workflows |
| `SCOUT_SERVER_URL` | variable | optional; defaults to our Render scout server |

No Gemini, no proxy, no news keys — the agent makes no external scrapes.

## How it gets smarter over time
Each run appends one snapshot (last ~12 kept). Week 1 = baseline (standouts only). From week 2 the week-over-week
change detection is active, so the feature is fully powered after the second run.

## Cost & speed
One scout-server call per player per week (season stats), cached in `PlayerTiers`. A ~40-player sweep is seconds.

## Known limits
- Stats are season aggregates → "change" is week-over-week, not literal last-5-games.
- A player the stats API can't match (lower leagues) still appears if a contract/mandate/value signal fires; otherwise he's simply not flagged.
- Calls/meetings show as "last contact" (from notes/tasks), context only — not a signal.
- Tune thresholds in `config.ts` after the first couple of real runs.
