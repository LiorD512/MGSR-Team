# Workers Cloud Migration

Workers have been moved from Android WorkManager to cloud services.

## Architecture

| Worker | Service | Schedule | Success confirmation |
|--------|---------|----------|------------------------|
| MandateExpiryWorker | Firebase Cloud Function | 04:00 Israel | `WorkerRuns/MandateExpiryWorker` |
| ReleasesRefreshWorker | Firebase Cloud Function | 03:00 Israel | `WorkerRuns/ReleasesRefreshWorker` |
| PlayerRefreshWorker | Cloud Run Job | 02:00 Israel | `WorkerRuns/PlayerRefreshWorker` |

## Firestore collections

- **WorkerRuns** — One doc per worker (`MandateExpiryWorker`, `ReleasesRefreshWorker`, `PlayerRefreshWorker`). Fields: `status`, `lastRunAt`, `durationMs`, `summary`, `error`, `updatedAt`.
- **WorkerState** — Per-worker state (replaces SharedPreferences): `knownReleaseUrls`, `lastRefreshSuccess`.

## Deploy Cloud Functions

**One-time setup:** Create the Pub/Sub topic for releases refresh (required for `releasesRefreshScheduled`):

```bash
gcloud pubsub topics create releases-refresh-trigger --project=mgsr-64e4b
```

Then deploy:

```bash
cd functions
npm install
firebase deploy --only functions
```

This deploys `mandateExpiryScheduled`, `releasesRefreshScheduled`, `releasesRefreshWorker`, and other functions. The scheduler publishes to Pub/Sub and returns immediately; the worker runs asynchronously with 9 min timeout and automatic retries.

## Deploy PlayerRefresh (Cloud Run Job)

See [workers-job/README.md](../workers-job/README.md).

## Android app

Worker scheduling is **commented out** in `MGSRTeamApplication.kt`. Worker classes remain for now; they can be removed after confirming cloud workers run correctly.

**Note:** `LoginScreenViewModel` still calls `enqueueImmediateRefresh` on login. If you want to disable that too, comment out those calls.

## Monitoring

1. **Firebase Console** → Functions → Logs
2. **Firestore** → `WorkerRuns` collection — check `status`, `lastRunAt`, `summary` for each worker
3. **Cloud Run** → Jobs → player-refresh-job → Executions (for PlayerRefresh)
