#!/bin/bash
# FM Intelligence Cache Crawler - Weekly Auto-Run
# This script is called by launchd to refresh FM data for all player collections.
# It writes results to Firestore "FmIntelligenceCache" and logs to /tmp/fm-crawl-*.log
#
# To install as a weekly schedule:
#   launchctl load ~/Library/LaunchAgents/com.mgsr.fm-crawl.plist
#
# To run manually:
#   bash ~/AndroidStudioProjects/MGSRTeam/scripts/run-fm-crawl.sh

export GOOGLE_APPLICATION_CREDENTIALS="/Users/lior.dahan/Downloads/mgsr-64e4b-firebase-adminsdk-qa0zl-5c691fe17d.json"
SCRIPT_DIR="/Users/lior.dahan/AndroidStudioProjects/MGSRTeam/workers-job"
LOG_DIR="/tmp"
DATE=$(date +%Y%m%d_%H%M)

cd "$SCRIPT_DIR" || exit 1

echo "=== FM Crawl started at $(date) ===" > "$LOG_DIR/fm-crawl-$DATE.log"

# Crawl men's players
echo "--- Crawling Players (men) ---" >> "$LOG_DIR/fm-crawl-$DATE.log"
node crawl-fminside-cache.js --collection=Players --skip-cached >> "$LOG_DIR/fm-crawl-$DATE.log" 2>&1

# Crawl women's players
echo "--- Crawling PlayersWomen ---" >> "$LOG_DIR/fm-crawl-$DATE.log"
node crawl-fminside-cache.js --collection=PlayersWomen --skip-cached >> "$LOG_DIR/fm-crawl-$DATE.log" 2>&1

# Crawl youth players
echo "--- Crawling PlayersYouth ---" >> "$LOG_DIR/fm-crawl-$DATE.log"
node crawl-fminside-cache.js --collection=PlayersYouth --skip-cached >> "$LOG_DIR/fm-crawl-$DATE.log" 2>&1

echo "=== FM Crawl finished at $(date) ===" >> "$LOG_DIR/fm-crawl-$DATE.log"
