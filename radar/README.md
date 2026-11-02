# B.S.G. Transfer Radar - pipeline

Runs on GitHub Actions, stores to Turso (libSQL). Spec: `../.kiro/specs/transfer-radar/`. Architecture: `../ARCHITECTURE.md` section 21.

## First-time setup (one time)
1. **Turso**: create a database, copy its URL (`libsql://...`) and create a read/write token.
2. **GitHub -> Settings -> Secrets and variables -> Actions -> Secrets**: `TURSO_URL`, `TURSO_TOKEN`, `RADAR_GEMINI_KEY` (the existing Gemini key); optional `RADAR_GEMINI_FREE_KEY`.
3. **Vercel -> Environment Variables**: `TURSO_URL`, `TURSO_TOKEN`. Recommended for the first weeks: `RADAR_ALLOWED_EMAILS=your@email` (only listed emails can open the radar; delete it to open to everyone). Optional `RADAR_ADMIN_EMAILS`. Redeploy.
4. Run the **Transfer Radar pipeline** workflow once (Actions tab -> Run workflow). Check the run summary.
5. When happy, merge the PR (GitHub only runs schedules from `main`), then set the repository **variable** `RADAR_ENABLED=true`: the pipeline then runs every 3rd day at 01:30 UTC and cleans up at the end of each run. The free collect-only job (`radar-collect.yml`, every 3 h, no AI) starts by itself once it is on `main`; set `RADAR_COLLECT_DISABLED=true` to stop it.

## Local development
```bash
cd radar && npm ci
npx tsx src/cli.ts seed                     # schema + config + 48 seed sources into ./radar-local.db
npx tsx src/cli.ts run --no-analyze         # live collection, no AI, no cost
npx tsx src/cli.ts import-poc <file.json>   # optional: load saved PoC extraction results (kept on branch feat/transfer-radar-poc)
npx tsx src/cli.ts status
```
Without `TURSO_URL` the CLI uses a local SQLite file, so nothing touches production.

## Cost controls
`config.llm`: `monthlyCapUsd` (5), `ceilingUsd` (6), `dailyCapDivisor` (20), `enabled` (kill switch), `paidMaxRequestsPerRun`. Spend is computed from token counts returned by the API and stored in `quota_ledger`. Free-tier key is used first when present.


## Transfermarkt identification (v3)
Every player is matched to ONE Transfermarkt profile automatically (`src/stages/identify.ts`, `src/tm.ts`) before he can appear on the radar:
club squad -> name search -> transfer history -> AI tie-break; stars above `identify.maxValueEur` (EUR 5M), other sports, coaches and retired players are filtered out with a reason.
Google News redirect links are resolved to the publisher's article URL (`src/stages/links.ts`).
- Needs `TM_HTML_PROXY_URL` (defaults to the production html-proxy; set in `radar-pipeline.yml`).
- Backfill / re-run on existing data: `npx tsx src/cli.ts identify` (add `--reset` to retry UNIDENTIFIED players now).
- On the `feat/transfer-radar` branch a push runs the pipeline only when the commit message contains `[radar-run]` (and the change touches `radar/**` or the workflow).
  The first run after the v3 upgrade applies migration 4 and identifies the existing players; until then the web screen shows "Identifying players".
