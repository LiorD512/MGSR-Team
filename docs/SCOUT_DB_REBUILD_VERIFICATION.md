# Scout DB Build — Verification

## Design: Cloud Run Job

The scout DB build runs as a **Cloud Run Job** (not on Render, not via HTTP trigger). This design works because:

| Constraint | Cloud Run Job | Result |
|------------|---------------|--------|
| Build duration | 12-14 hours | Max 168h (7 days) — fits ✅ |
| No local machine | Runs in GCP | ✅ |
| Render free tier | Build doesn't run on Render | N/A — build runs in GCP ✅ |
| Git push | Job has GITHUB_TOKEN | Pushes after build ✅ |
| Render deploy | Auto-deploy from git | Triggered by push ✅ |

## Flow Verification

1. **Cloud Scheduler** triggers at Monday 4 AM Israel
2. **Cloud Run Job** starts, clones repo, runs build
3. Build runs for 12-14 hours (TM + FBref + FM)
4. Job commits DB changes, pushes to GitHub
5. **Render** (connected to repo) auto-deploys from new commit

## Prerequisites Checklist

- [ ] GITHUB_TOKEN secret exists in Secret Manager
- [ ] Token has `repo` scope
- [ ] SCOUT_REPO_URL points to correct repo
- [ ] Build command matches local (BUILD_COMMAND)
- [ ] Scout server repo has requirements.txt or pyproject.toml
- [ ] Render is connected to the scout server repo for auto-deploy
