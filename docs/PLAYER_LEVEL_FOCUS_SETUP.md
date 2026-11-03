# Level & Focus — how it works and how to switch it on (v2, background analyst)

Nobody presses a button. A **background worker** analyses every roster player on its own and keeps the results fresh.
The dashboard only *reads* finished results, so it opens instantly.

## What the worker does for each player
1. **Gathers data** (every source optional, cached, time-boxed — a failing source never blocks the player):
   | Source | What | Refreshed |
   |---|---|---|
   | Google News RSS (EN + HE) | Headlines from the last 45 days that actually name the player | every run (≤5h cache) |
   | Gemini **with Google Search** | Live web check of transfers, injuries, form, contract talk, coach changes | when facts change, or every 24h |
   | Scout server / SofaScore / FotMob | Match rating + minutes | 3 days |
   | Transfermarkt injury history | Days missed, injury-prone | 7 days |
   | ClubElo | Club strength | 7 days |
   | FMInside cache | Current ability / potential | 14 days |
   | Firestore (live) | Contract, mandate expiry, open club requests that match him, notes & tasks, value history | every run |
   | Transfer windows | Days left per country | every run |
2. **Scores five criteria** (0–100, weights): Output 30 · Ability 20 · Value 25 · League/club 15 · Availability 10.
   Missing criteria are dropped and the rest renormalised; the share of data we had becomes *coverage*, which drives confidence.
3. **Base level** from thresholds 78 / 64 / 50 / 36 (per-position offsets in `lib/tiering/config.ts`).
4. **Urgency → Focus** from contract end, mandate expiry, matching club requests, days since last touch and trend.
5. **AI analyst** (Gemini 2.5 Flash + Google Search) receives all of the above and returns:
   - level adjustment −1/0/+1 with a reason (EN/HE) and evidence,
   - a focus nudge −1/0/+1 for time-sensitive news,
   - a **news digest** (what happened and why it matters to us) with source links,
   - **risks**,
   - a **push plan**: *how* (what to do, with which clubs) and *when* (tied to real dates/windows) + timing tag (now / this week / this window / later / hold).
   The analyst only re-runs when the player's facts changed (new headline, new request, value/contract change…) or its read is older than 24h — fast and cheap.
6. **Writes** `PlayerTiers/{playerId}`. Confirmed tags are never overwritten — anything different becomes a suggestion in the AI inbox.
7. **Alerts** the owner by push when a player becomes Push now (confirmed by anyone, or newly recommended by the engine).

## Running it
- **Scheduled (default):** `.github/workflows/tiering-worker.yml` sweeps the roster every 3 hours. "Run workflow" in GitHub Actions starts one now; tick *force* to ignore caches.
- **Near real-time (optional, always-on host):** `npx tsx _tiering_worker.ts watch` re-analyses a player ~15s after his doc changes, sweeps when a mandate or club request changes, plus hourly. Run it on any always-on box (Cloud Run service with min instances 1, a small VM, or the existing worker host).
- **One player now:** the drawer's *Re-run analysis* (≈10–30s), or `npx tsx _tiering_worker.ts player <playerId>`.

## Configuration
GitHub → Settings → Secrets and variables → Actions:
| Name | Type | Notes |
|---|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | secrets | already used by other workflows |
| `GEMINI_API_KEY` | secret | **add** (same key as Vercel). Without it only the criteria engine runs |
| `TIERING_ALERT_EMAILS` | variable | owner account email(s), comma-separated |
| `SCOUT_SERVER_URL` | variable | optional, defaults to the Render scout server |
| `TIERING_APP_ORIGIN` | variable | optional, defaults to `https://management.britsportgroup.com` |

Vercel: `TIERING_ALERT_EMAILS` too (alerts when an agent sets Push now from the dashboard).
`TIERING_RUN_SECRET` is no longer needed.

## Speed & cost
- First sweep of ~40 players: a few minutes (sources fetched for everyone, one AI read each).
- Following sweeps: seconds per unchanged player (all cached, no AI call); only changed players get a new AI read.
- Gemini Flash with search ≈ 40 reads on the first day, then roughly 5–15 a day.

## Firestore rules
`PlayerTiers` block in `firestore.rules` (read for signed-in users, no client writes). Deploy with `firebase deploy --only firestore:rules`. Not required for the feature to work (all access is via the API / Admin SDK).

## Known limits
- Calls and meetings count as effort only when logged as a note or task (there is no contact log linked to players).
- News search is by name + club; very common names may pull unrelated headlines — the analyst is told to ignore other people with the same name.
- The level definitions per market are a draft (`LEVEL_DEFINITIONS` in `lib/tiering/config.ts`); edit them to change how the AI reads levels.
