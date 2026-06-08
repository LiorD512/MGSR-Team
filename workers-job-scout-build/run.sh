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
MIN_API_ENRICHED_PCT="${MIN_API_ENRICHED_PCT:-40}"
ENRICH_GUARD_DISABLED="${ENRICH_GUARD_DISABLED:-false}"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN not set (mount from Secret Manager)"
  exit 1
fi

if [ -z "$APIFOOTBALL_KEY" ]; then
  echo "ERROR: APIFOOTBALL_KEY not set (mount from Secret Manager)"
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
$BUILD_CMD

if [ "$ENRICH_GUARD_DISABLED" != "true" ]; then
  echo "=== Validating API enrichment threshold (min ${MIN_API_ENRICHED_PCT}%) ==="
  export MIN_API_ENRICHED_PCT
  python3 - <<'PY'
import json
import os
import sys
from pathlib import Path

min_pct = float(os.getenv("MIN_API_ENRICHED_PCT", "40"))
candidate_paths = [
  Path("data/global_players.json"),
  Path("global_players.json"),
]

db_path = next((p for p in candidate_paths if p.exists()), None)
if db_path is None:
  print("ERROR: Could not find global players JSON after build (expected data/global_players.json)")
  sys.exit(1)

with db_path.open("r", encoding="utf-8") as f:
  data = json.load(f)

if not isinstance(data, list) or not data:
  print(f"ERROR: Invalid or empty player dataset at {db_path}")
  sys.exit(1)

total = len(data)
enriched = sum(1 for p in data if isinstance(p, dict) and p.get("api_matched"))
pct = round((enriched / total) * 100.0, 2)

print(f"Enrichment summary: {enriched}/{total} players ({pct}%)")
if pct < min_pct:
  print(
    f"ERROR: Enrichment guard failed ({pct}% < {min_pct}%). "
    "Refusing to commit/push this DB snapshot."
  )
  sys.exit(1)

print("Enrichment guard passed")
PY
fi

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
