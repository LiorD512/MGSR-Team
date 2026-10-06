#!/usr/bin/env bash

# Vercel ignore command contract:
# - exit 0 -> SKIP build
# - exit 1 -> CONTINUE with build
#
# mgsr-landing is a self-contained static site. It should only ever rebuild
# when files inside mgsr-landing/ (or its own vercel.json) actually change.
# Everything else in the monorepo — the Android app, Firebase functions, the
# scout workers, docs, and mgsr-web — must NOT trigger a landing deploy.

set -euo pipefail

FORCE_TOKEN='[force vercel build]'
LAST_MESSAGE="$(git log -1 --pretty=%B || true)"
if [[ "$LAST_MESSAGE" == *"$FORCE_TOKEN"* ]]; then
  echo "Force token found; running build."
  exit 1
fi

# Fresh clone / shallow-history edge case: build to be safe.
if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  echo "No previous commit available; running build."
  exit 1
fi

CHANGED_FILES="$(git diff --name-only HEAD^ HEAD || true)"
if [[ -z "$CHANGED_FILES" ]]; then
  echo "No changed files detected; running build to be safe."
  exit 1
fi

# Build only when a landing-relevant file changed.
LANDING_RELEVANT_REGEX='^(mgsr-landing/|\.github/workflows/.*landing)'
HAS_LANDING_CHANGES=false
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if [[ "$file" =~ $LANDING_RELEVANT_REGEX ]]; then
    HAS_LANDING_CHANGES=true
    break
  fi
done <<< "$CHANGED_FILES"

if [[ "$HAS_LANDING_CHANGES" == "false" ]]; then
  echo "No mgsr-landing related changes detected; skipping build."
  exit 0
fi

echo "Landing-relevant changes detected; running build."
exit 1
