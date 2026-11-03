# Level & Focus — setup and how it works (v1, roster only)

## What shipped
- Dashboard → **Roster intelligence** now shows Level & Focus (flag: `LEVEL_FOCUS_ENABLED` in `mgsr-web/src/lib/featureFlags.ts`; set it to `false` to get the old table back).
- Data lives in the new Firestore collection `PlayerTiers/{playerId}`. The browser never touches it directly: it calls `/api/tiering/*` with the agent's ID token, and the server uses the Admin SDK.
- Any signed-in agent can set Level / Focus / lock. The note is optional. Every change is stored in the player's history (who, when).
- The engine and Gemini only write a **suggestion** (`ai` block). Confirmed tags change only when an agent sets them or accepts a suggestion.

## Environment variables (Vercel)
| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Already used by other routes. Without it the engine still runs (maths only, template reasons). |
| `TIERING_ALERT_EMAILS` | Comma-separated account emails of the owner(s) who get the Push-now push notification. **Without it no alerts are sent.** |
| `TIERING_RUN_SECRET` | Shared secret for the daily scheduled run (also add it as a GitHub Actions secret with the same name). |
| `SCOUT_SERVER_URL` | Optional, already used elsewhere (match ratings). |

## First use
1. Deploy, open the dashboard. The module shows "Run first analysis".
2. Click it — the roster is analysed in small batches (progress is shown). Stats/FM are fetched on a best-effort basis; missing data lowers confidence instead of failing.
3. Review the gold **AI suggests N changes** box → accept, adjust or dismiss.
4. The daily workflow `.github/workflows/tiering-daily.yml` (03:00 Israel) keeps analyses fresh. Needs repo secret `TIERING_RUN_SECRET`; optional repo variable `TIERING_BASE_URL`.

## Alerts (push only)
- When a player's **confirmed** Focus becomes *Push now* (by anyone) → push to the owner(s).
- When the engine newly **recommends** Push now for a player → one push (not repeated until the recommendation clears).
- Delivery reuses the existing FCM tokens on the `Accounts` docs and also adds an item to the account's in-app notifications.

## Firestore rules
`firestore.rules` has a new `PlayerTiers` block (read for authenticated users, no client writes). Deploy with `firebase deploy --only firestore:rules`. The feature works without this deploy because all access goes through the API, but deploy it to keep rules in sync.

## How Level is computed (v1)
Score = weighted average of the signals that exist: match rating (30), FM current ability (25), market value on a log scale (35), league strength of the club's country (10). Thresholds 78 / 64 / 50 / 36 → L1…L4 (below = L5). Per-position offsets exist in `lib/tiering/config.ts` (`POSITION_OFFSETS`, all 0 for now). Gemini may adjust by **at most one level**, using agent notes, trend, contract and data coverage. Confidence drops when data is thin.

**Known limits of v1**
- Without FM/match data the level is mostly market value + league. Check the confidence figure.
- Effort counts **notes and tasks** only. The app has no contact log linked to players, so calls/meetings are not counted unless someone adds a note or task.
- Mandate expiry comes from `PlayerDocuments` (type `MANDATE`); contract expiry is parsed from the Transfermarkt text on the player.
