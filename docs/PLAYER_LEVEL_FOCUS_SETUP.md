# Roster Intelligence — setup & operations

A weekly background agent flags roster players whose situation changed, from their recent game-by-game log,
and writes `PlayerTiers/{playerId}`. The dashboard section reads it. Nothing runs from the browser.

## Switch on / off
`LEVEL_FOCUS_ENABLED` in `mgsr-web/src/lib/featureFlags.ts`.

## Where the games come from
- **Enrichment at refresh time:** the player-refresh flow now also stores `recentGames` on the player doc
  (via `fetchRecentGames` → TM ceapi, through the proxy).
- **Weekly agent:** reads `recentGames`; if missing/stale it self-enriches (fetches live). So it works on day one.

## Run the agent
- **Weekly (default):** `.github/workflows/tiering-worker.yml` (Sunday 02:00 UTC). "Run workflow" runs it now.
- **Locally:** `cd mgsr-web && npm ci && npx tsx _tiering_worker.ts sweep` (needs `mgsr-web/.env.local`).
- **Debug one player:** `npx tsx _tiering_worker.ts player <playerId>`.

## Configuration
| Name | Type | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | secrets | already used |
| `TM_HTML_PROXY_URL` | variable | **required for cloud runs** (GitHub Actions) — TM blocks server IPs; the proxy your other TM jobs use. Local runs work directly. |

No Gemini, no scout server, no news keys.

## Allowlist
`functions/callables/players.js` now allows `recentGames` + `recentGamesAt` (deploy functions for the refresh enrichment to persist).

## Known limits
- Grades are null outside big leagues → signals use minutes/starts/squad-status/goals/assists there.
- First weekly run self-enriches every player (slower); later runs read the refresh-populated field (fast).
- Tune signal thresholds in `config.ts` after the first real run.
