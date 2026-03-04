#!/bin/bash
# Add IFA fetch endpoint to football-scout-server.
# Usage: ./scripts/setup-ifa-scout-server.sh [path-to-scout-server]
#   Or:  SCOUT_REPO_URL=https://github.com/you/football-scout-server ./scripts/setup-ifa-scout-server.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MGSR_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IFA_MODULE="$MGSR_ROOT/docs/ifa_fetch_for_scout_server.py"
TARGET_DIR=""

if [ -n "$1" ]; then
  TARGET_DIR="$(cd "$1" && pwd)"
elif [ -n "$SCOUT_SERVER_PATH" ]; then
  TARGET_DIR="$(cd "$SCOUT_SERVER_PATH" && pwd)"
elif [ -n "$SCOUT_REPO_URL" ]; then
  CLONE_DIR="/tmp/football-scout-server-ifa-setup"
  rm -rf "$CLONE_DIR"
  git clone --depth 1 "$SCOUT_REPO_URL" "$CLONE_DIR"
  TARGET_DIR="$CLONE_DIR"
  echo "Cloned to $TARGET_DIR"
else
  echo "Usage: $0 <path-to-football-scout-server>"
  echo "   Or: SCOUT_REPO_URL=https://github.com/owner/repo $0"
  echo "   Or: SCOUT_SERVER_PATH=/path/to/scout $0"
  exit 1
fi

if [ ! -f "$IFA_MODULE" ]; then
  echo "Error: $IFA_MODULE not found"
  exit 1
fi

# Copy module (as ifa_fetch.py for clean import)
cp "$IFA_MODULE" "$TARGET_DIR/ifa_fetch.py"
echo "Copied ifa_fetch.py to $TARGET_DIR"

# Add to requirements.txt if not present
REQ="$TARGET_DIR/requirements.txt"
if [ -f "$REQ" ]; then
  for pkg in playwright beautifulsoup4; do
    if ! grep -qi "^${pkg}" "$REQ" 2>/dev/null; then
      echo "$pkg" >> "$REQ"
      echo "Added $pkg to requirements.txt"
    fi
  done
else
  echo "playwright" > "$REQ"
  echo "beautifulsoup4" >> "$REQ"
  echo "Created requirements.txt"
fi

# Find app file and add router
APP_FILES=("$TARGET_DIR/main.py" "$TARGET_DIR/server.py" "$TARGET_DIR/app/main.py" "$TARGET_DIR/src/main.py")
APP_FILE=""
for f in "${APP_FILES[@]}"; do
  if [ -f "$f" ]; then
    APP_FILE="$f"
    break
  fi
done

if [ -n "$APP_FILE" ]; then
  if grep -q "ifa_router\|ifa_fetch" "$APP_FILE" 2>/dev/null; then
    echo "IFA router already added to $APP_FILE"
  else
    # Add import after other imports (before first def or class)
    if ! grep -q "from ifa_fetch import router as ifa_router" "$APP_FILE"; then
      # Add after last import line
      if grep -q "^from fastapi import\|^import fastapi" "$APP_FILE"; then
        sed -i.bak '/^from fastapi import\|^import fastapi/{
          a\
\
# IFA player profile fetch (football.org.il)
from ifa_fetch import router as ifa_router
          :a
          n
          ba
        }' "$APP_FILE" 2>/dev/null || true
      fi
      # Simpler: append before app = FastAPI or after it
      if ! grep -q "ifa_router" "$APP_FILE"; then
        echo "" >> "$APP_FILE"
        echo "# IFA player profile fetch (football.org.il)" >> "$APP_FILE"
        echo "from ifa_fetch import router as ifa_router" >> "$APP_FILE"
        echo "app.include_router(ifa_router, prefix=\"/ifa\", tags=[\"ifa\"])" >> "$APP_FILE"
        echo "Added IFA router to $APP_FILE (check placement - include_router must be after app = FastAPI())"
      fi
    fi
  fi
else
  echo "Could not find main.py or server.py. Manually add to your FastAPI app:"
  echo "  from ifa_fetch import router as ifa_router"
  echo "  app.include_router(ifa_router, prefix=\"/ifa\", tags=[\"ifa\"])"
fi

echo ""
echo "Next steps:"
echo "  1. cd $TARGET_DIR"
echo "  2. pip install playwright beautifulsoup4"
echo "  3. playwright install chromium"
echo "  4. Fix app.include_router placement if needed (must be after app = FastAPI())"
echo "  5. git add ifa_fetch.py requirements.txt && git commit -m 'Add IFA fetch endpoint' && git push"
echo "  6. Render will auto-deploy"
