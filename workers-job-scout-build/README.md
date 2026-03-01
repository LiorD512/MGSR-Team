# Scout DB Build — Cloud Run Job

Runs the football scout server database build (12-14 hours) in GCP every Monday at 04:00 Israel time. Pushes the result to git so Render auto-deploys.

## Prerequisites

1. **GITHUB_TOKEN** — Create in Secret Manager (one-time):
   ```bash
   echo -n "ghp_YOUR_GITHUB_PAT" | gcloud secrets create GITHUB_TOKEN --data-file=- --project=mgsr-64e4b
   ```
   The token needs `repo` scope (clone + push).

2. **SCOUT_REPO_URL** — Your football scout server repo, e.g. `https://github.com/you/football-scout-server`

3. **Build command** — The exact command you run locally. Default: `python build.py`. Override with `BUILD_COMMAND` env.

4. **DB output** — Which files the build produces. Default: `*.db data/*.db`. Override with `DB_FILES_TO_COMMIT`.

## Deploy

```bash
cd workers-job-scout-build

# Set your repo URL
export SCOUT_REPO_URL="https://github.com/YOUR_USER/football-scout-server"

# Optional: override build command if different
# export BUILD_COMMAND="python -m server build"

# Optional: override DB files to commit
# export DB_FILES_TO_COMMIT="players.db"

./deploy.sh
```

Or pass repo URL as argument:
```bash
./deploy.sh https://github.com/YOUR_USER/football-scout-server
```

## Manual Run

```bash
gcloud run jobs execute scout-db-build-job --region us-central1 --project mgsr-64e4b
```

## Schedule

- **Cron:** `0 4 * * 1` (every Monday 04:00 Israel time)
- **Timeout:** 18 hours (covers 12-14h build + buffer)

## Flow

1. Cloud Scheduler triggers the job
2. Job clones scout server repo
3. Job runs build (pip install + build command)
4. Job commits DB changes and pushes
5. Render auto-deploys from the new commit

## Monitoring

- **Cloud Run** → Jobs → scout-db-build-job → Executions
- Check execution logs for build progress and push status
