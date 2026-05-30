#!/bin/bash
# Setup script for the local Contract Finishers worker.
# Run once to install dependencies and register the launchd schedule.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST="com.mgsr.contract-finishers-refresh.plist"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

echo "=== 1. Installing dependencies ==="
cd "$SCRIPT_DIR"
npm install

echo ""
echo "=== 2. Creating logs directory ==="
mkdir -p "$SCRIPT_DIR/logs"

echo ""
echo "=== 3. Checking service account ==="
if [ ! -f "$SCRIPT_DIR/service-account.json" ]; then
  echo "⚠️  No service-account.json found!"
  echo "   Place your Firebase service account key at:"
  echo "   $SCRIPT_DIR/service-account.json"
  echo ""
  echo "   Download from: https://console.firebase.google.com/project/mgsr-64e4b/settings/serviceaccounts/adminsdk"
  echo ""
fi

echo "=== 4. Detecting node path ==="
# Use Node 22+ (required for impit)
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use 22 2>/dev/null || nvm use node
fi
NODE_PATH=$(which node)
echo "   Node: $NODE_PATH ($(node --version))"

# Update plist with correct node path
sed -i '' "s|/usr/local/bin/node|$NODE_PATH|g" "$SCRIPT_DIR/$PLIST"
echo "   Updated plist to use: $NODE_PATH"

echo ""
echo "=== 5. Installing launchd job (every 3 days) ==="
mkdir -p "$LAUNCH_AGENTS"
cp "$SCRIPT_DIR/$PLIST" "$LAUNCH_AGENTS/$PLIST"

# Unload if already loaded
launchctl unload "$LAUNCH_AGENTS/$PLIST" 2>/dev/null || true
launchctl load "$LAUNCH_AGENTS/$PLIST"

echo "   ✅ Launchd job registered: $PLIST"
echo "   Runs every 3 days + on boot/login"
echo ""
echo "=== Done! ==="
echo ""
echo "Manual run:  cd $SCRIPT_DIR && node contract-finishers-refresh.js"
echo "Check logs:  tail -f $SCRIPT_DIR/logs/stdout.log"
echo "Uninstall:   launchctl unload ~/Library/LaunchAgents/$PLIST && rm ~/Library/LaunchAgents/$PLIST"
