# PlayerRefreshWorker — Cloud Run Job

Runs at 02:00 Israel time via Cloud Scheduler. Refreshes all players from Transfermarkt.

## Deploy

```bash
# Build and push to Artifact Registry (replace PROJECT_ID and REGION)
gcloud builds submit --tag gcr.io/PROJECT_ID/player-refresh-job

# Create Cloud Run Job
gcloud run jobs create player-refresh-job \
  --image gcr.io/PROJECT_ID/player-refresh-job \
  --region us-central1 \
  --task-timeout 4h \
  --memory 512Mi \
  --cpu 1 \
  --max-retries 0

# Create Cloud Scheduler to run at 02:00 Israel time
gcloud scheduler jobs create http player-refresh-daily \
  --schedule "0 2 * * *" \
  --time-zone "Asia/Jerusalem" \
  --uri "https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/player-refresh-job:run" \
  --http-method POST \
  --oauth-service-account-email PROJECT_ID@appspot.gserviceaccount.com
```

## Success confirmation

After each run, the job writes to Firestore `WorkerRuns/PlayerRefreshWorker`:

- `status`: "success" | "failed"
- `lastRunAt`: timestamp
- `durationMs`: number
- `summary`: e.g. "150 succeeded, 2 failed out of 200"
- `error`: error message if failed
