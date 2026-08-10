# PlayerRefreshWorker — Cloud Run Job

Runs hourly via Cloud Scheduler. Refreshes stale players from Transfermarkt.

## Safety guards

- `JOB_MODE=player-refresh` now acquires a Firestore lease in `WorkerState/PlayerRefreshWorker` so overlapping Cloud Run executions skip instead of double-processing the same backlog.
- `JOB_MODE=player-refresh-status` prints the canonical backlog using the same `lastRefreshedAt` field that the worker updates.

## Safe local catch-up loop

Use the worker's own status mode instead of a custom Firestore snippet. The old ad hoc loop checked `lastProfileRefreshAt`, which does not control this worker and can keep a local loop running forever.

```bash
while true; do
  JOB_MODE=player-refresh node run.js
  exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    echo "[loop-error] worker exited with $exit_code"
    break
  fi

  JOB_MODE=player-refresh-status node run.js
  status_code=$?
  if [[ $status_code -eq 10 ]]; then
    echo "=== backlog drained ==="
    break
  fi
  if [[ $status_code -ne 0 ]]; then
    echo "[loop-error] status check exited with $status_code"
    break
  fi
done
```

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

# Create Cloud Scheduler to run every hour
gcloud scheduler jobs create http player-refresh-daily \
  --schedule "0 * * * *" \
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
