#!/usr/bin/env bash

# Vercel ignore command contract:
# - exit 0 -> skip build
# - exit 1 -> continue with build

set -euo pipefail

FORCE_TOKEN='[force vercel build]'
LAST_MESSAGE="$(git log -1 --pretty=%B || true)"
if [[ "$LAST_MESSAGE" == *"$FORCE_TOKEN"* ]]; then
  echo "Force token found; running build."
  exit 1
fi

# If this is a fresh clone or shallow history edge-case, run the build.
if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  echo "No previous commit available; running build."
  exit 1
fi

CHANGED_FILES="$(git diff --name-only HEAD^ HEAD || true)"
if [[ -z "$CHANGED_FILES" ]]; then
  echo "No changed files detected; running build to be safe."
  exit 1
fi

# Guardrail 1: skip production build when commit only updates transfer windows data file.
ONLY_TRANSFER_WINDOWS=true
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if [[ "$file" != "mgsr-web/public/transfer-windows.json" ]]; then
    ONLY_TRANSFER_WINDOWS=false
    break
  fi
done <<< "$CHANGED_FILES"

if [[ "$ONLY_TRANSFER_WINDOWS" == "true" ]]; then
  echo "Only mgsr-web/public/transfer-windows.json changed; skipping build."
  exit 0
fi

# Guardrail 2: if no web app files changed, skip mgsr-web deployment.
WEB_RELEVANT_REGEX='^(mgsr-web/|\.github/workflows/.*vercel|\.github/workflows/.*web|vercel\.json$)'
HAS_WEB_CHANGES=false
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if [[ "$file" =~ $WEB_RELEVANT_REGEX ]]; then
    HAS_WEB_CHANGES=true
    break
  fi
done <<< "$CHANGED_FILES"

if [[ "$HAS_WEB_CHANGES" == "false" ]]; then
  echo "No mgsr-web related changes detected; skipping build."
  exit 0
fi

echo "Web-relevant changes detected; running build."
exit 1
