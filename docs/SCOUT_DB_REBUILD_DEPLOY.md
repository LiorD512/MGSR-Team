# Scout DB Build — Deployment Guide

Weekly build of the football scout server database. Runs **every Monday at 04:00 Israel time** via Cloud Run Job. Build takes 12-14 hours; runs in GCP, then pushes to git so Render auto-deploys.

## Prerequisites

1. **GITHUB_TOKEN** — GitHub Personal Access Token with `repo` scope (clone + push to scout server repo)
2. **SCOUT_REPO_URL** — Your football scout server repo URL
3. **Build command** — The exact command you run locally (default: `python build.py`)

## One-Time Setup

### 1. Create the GitHub token secret

```bash
# Create token at: GitHub → Settings → Developer settings → Personal access tokens
# Scope: repo (full control of private repositories)

echo -n "ghp_YOUR_TOKEN" | gcloud secrets create GITHUB_TOKEN --data-file=- --project=mgsr-64e4b
```

### 2. Deploy the job

```bash
cd workers-job-scout-build

# Set your scout server repo
export SCOUT_REPO_URL="https://github.com/YOUR_USER/football-scout-server"

# Optional: if your build command is different
# export BUILD_COMMAND="python -m server build"

# Optional: if your DB output path is different
# export DB_FILES_TO_COMMIT="players.db"

./deploy.sh
```

## Verify

1. **Cloud Run** → Jobs → scout-db-build-job — should exist
2. **Cloud Scheduler** → scout-db-build-weekly — Monday 4 AM Israel
3. **Manual test:** `gcloud run jobs execute scout-db-build-job --region us-central1 --project mgsr-64e4b`

## Schedule

| Cron | Meaning |
|------|---------|
| `0 4 * * 1` | Minute 0, hour 4 (04:00), every Monday, Asia/Jerusalem |

## Monitoring

- **Cloud Run** → Jobs → scout-db-build-job → Executions — view logs, duration, status
- Build runs 12-14 hours; check back next day for completion

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `GITHUB_TOKEN not set` | Create secret: `gcloud secrets create GITHUB_TOKEN --data-file=-` |
| `SCOUT_REPO_URL required` | Set before deploy: `export SCOUT_REPO_URL="https://github.com/..."` |
| Clone fails (404) | Token needs `repo` scope; repo must be accessible |
| Push fails | Token needs write access; check branch name (GIT_BRANCH) |
| Build command fails | Override BUILD_COMMAND to match your local command |
| No changes to commit | DB_FILES_TO_COMMIT may not match your output; check build output path |
