#!/bin/bash
# Scout DB Build — Cloud Run Job
# 1. Clone scout server repo
# 2. Run build (12-14 hours)
# 3. Commit and push — Render auto-deploys

set -e

REPO_URL="${SCOUT_REPO_URL:?SCOUT_REPO_URL required}"
BUILD_CMD="${BUILD_COMMAND:-python3 build.py}"
DB_FILES="${DB_FILES_TO_COMMIT:-*.db data/*.db}"
GIT_BRANCH="${GIT_BRANCH:-main}"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN not set (mount from Secret Manager)"
  exit 1
fi

# Inject token into clone URL: https://github.com/owner/repo -> https://TOKEN@github.com/owner/repo
CLONE_URL="${REPO_URL/https:\/\//https://${GITHUB_TOKEN}@}"

echo "=== Cloning $REPO_URL ==="
git clone --depth 1 --branch "$GIT_BRANCH" "$CLONE_URL" repo
cd repo

echo "=== Installing dependencies ==="
if [ -f requirements.txt ]; then
  pip install -q -r requirements.txt
elif [ -f pyproject.toml ]; then
  pip install -q -e .
else
  echo "No requirements.txt or pyproject.toml — skipping pip install"
fi

echo "=== Running build: $BUILD_CMD ==="
eval "$BUILD_CMD"

echo "=== Committing and pushing ==="
git config user.email "scout-build@mgsr.local"
git config user.name "Scout Build Bot"

# Remote already has token from clone URL
DATE=$(date +%Y-%m-%d)

# Add DB files (configurable glob). Fallback: add all changes.
if git add $DB_FILES 2>/dev/null; then
  : # added
else
  git add -A
fi

if git diff --staged --quiet; then
  echo "No changes to commit — DB may be unchanged"
else
  git commit -m "chore: weekly DB rebuild $DATE"
  git push origin "$GIT_BRANCH"
  echo "=== Pushed successfully. Render will auto-deploy. ==="
fi
