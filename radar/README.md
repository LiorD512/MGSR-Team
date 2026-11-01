# B.S.G. Transfer Radar - pipeline

Runs on GitHub Actions, stores to Turso (libSQL). Spec: `../.kiro/specs/transfer-radar/`. Architecture: `../ARCHITECTURE.md` section 21.

## First-time setup (one time)
1. **Turso**: create a database, copy its URL (`libsql://...`) and create a read/write token.
2. **GitHub -> Settings -> Secrets and variables -> Actions -> Secrets**: `TURSO_URL`, `TURSO_TOKEN`, `RADAR_GEMINI_KEY` (the existing Gemini key); optional `RADAR_GEMINI_FREE_KEY`.
3. **Vercel -> Environment Variables**: `TURSO_URL`, `TURSO_TOKEN` (and optionally `RADAR_ADMIN_EMAILS`). Redeploy.
4. Run the **Transfer Radar pipeline** workflow once (Actions tab -> Run workflow). Check the run summary.
5. When happy, set the repository **variable** `RADAR_ENABLED=true` to enable the hourly schedule and the nightly sweep.

## Local development
```bash
cd radar && npm ci
npx tsx src/cli.ts seed                     # schema + config + 48 seed sources into ./radar-local.db
npx tsx src/cli.ts run --no-analyze         # live collection, no AI, no cost
npx tsx src/cli.ts import-poc               # load the real PoC extraction results (no AI key needed)
npx tsx src/cli.ts status
```
Without `TURSO_URL` the CLI uses a local SQLite file, so nothing touches production.

## Cost controls
`config.llm`: `monthlyCapUsd` (5), `ceilingUsd` (6), `dailyCapDivisor` (20), `enabled` (kill switch), `paidMaxRequestsPerRun`. Spend is computed from token counts returned by the API and stored in `quota_ledger`. Free-tier key is used first when present.
