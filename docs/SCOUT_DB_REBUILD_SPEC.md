# Football Scout Server — DB Build (Cloud Run Job)

The scout server database is built by a **Cloud Run Job** that runs every Monday at 04:00 Israel time. The job clones the scout server repo, runs the build locally (in GCP), and pushes the result to git. Render auto-deploys from the new commit.

## Flow

```
Cloud Scheduler (Monday 4 AM)
    → Cloud Run Job (scout-db-build-job)
        → Clone scout server repo
        → pip install -r requirements.txt
        → Run build command (e.g. python build.py)
        → git add, commit, push
    → Render auto-deploys from new commit
```

## Build Requirements (Scout Server Repo)

The scout server repo must have:

1. **requirements.txt** or **pyproject.toml** — for `pip install`
2. **Build script** — runnable via `BUILD_COMMAND` (default: `python build.py`)
3. **DB output** — files that get committed (default: `*.db`, `data/*.db`)

## Configuration (Deploy Time)

| Env Var | Default | Description |
|---------|---------|-------------|
| SCOUT_REPO_URL | (required) | e.g. `https://github.com/owner/football-scout-server` |
| BUILD_COMMAND | `python build.py` | Command to run the build |
| DB_FILES_TO_COMMIT | `*.db data/*.db` | Glob of files to commit |
| GIT_BRANCH | `main` | Branch to push to |

## Secrets

| Secret | Purpose |
|--------|---------|
| GITHUB_TOKEN | Clone + push to scout server repo. Needs `repo` scope. |

## Schedule

- **Cron:** `0 4 * * 1` (every Monday 04:00 Israel time)
- **Job:** scout-db-build-job
- **Timeout:** 18 hours (covers 12-14h build)

## Deployment

See [workers-job-scout-build/README.md](../workers-job-scout-build/README.md) and [SCOUT_DB_REBUILD_DEPLOY.md](SCOUT_DB_REBUILD_DEPLOY.md).
