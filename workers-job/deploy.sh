#!/bin/bash
# Deploy Workers — Cloud Run Jobs (Player Refresh + Releases Refresh)
# Run from workers-job folder: ./deploy.sh

set -e
PROJECT_ID="mgsr-64e4b"
REGION="us-central1"
IMAGE_NAME="mgsr-workers-job"
PLAYER_JOB="player-refresh-job"
RELEASES_JOB="releases-refresh-job"

echo "=== Step 1: Getting project number ==="
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
echo "Project number: $PROJECT_NUMBER"

echo ""
echo "=== Step 2: Building and pushing container ==="
gcloud builds submit --tag gcr.io/$PROJECT_ID/$IMAGE_NAME --project $PROJECT_ID

# ── Player Refresh Job (hourly) ──────────────────────────────────────

echo ""
echo "=== Step 3a: Creating/updating Player Refresh Job ==="
if gcloud run jobs describe $PLAYER_JOB --region $REGION --project $PROJECT_ID 2>/dev/null; then
  gcloud run jobs update $PLAYER_JOB \
    --image gcr.io/$PROJECT_ID/$IMAGE_NAME \
    --region $REGION \
    --project $PROJECT_ID \
    --task-timeout 2h \
    --memory 512Mi \
    --cpu 1 \
    --max-retries 0 \
    --set-env-vars "JOB_MODE=player-refresh,SCOUT_TM_PROXY_URL=https://mgsr-backend.onrender.com/tm_proxy" \
    --set-secrets "SCOUT_ENRICH_SECRET=SCOUT_ENRICH_SECRET:latest"
else
  gcloud run jobs create $PLAYER_JOB \
    --image gcr.io/$PROJECT_ID/$IMAGE_NAME \
    --region $REGION \
    --project $PROJECT_ID \
    --task-timeout 2h \
    --memory 512Mi \
    --cpu 1 \
    --max-retries 0 \
    --set-env-vars "JOB_MODE=player-refresh,SCOUT_TM_PROXY_URL=https://mgsr-backend.onrender.com/tm_proxy" \
    --set-secrets "SCOUT_ENRICH_SECRET=SCOUT_ENRICH_SECRET:latest"
fi

echo ""
echo "=== Step 3b: Granting invoke permission for Player Refresh ==="
gcloud run jobs add-iam-policy-binding $PLAYER_JOB \
  --region $REGION \
  --project $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"

echo ""
echo "=== Step 3c: Creating Cloud Scheduler for Player Refresh (every hour) ==="
gcloud scheduler jobs delete player-refresh-daily --location $REGION --project $PROJECT_ID --quiet 2>/dev/null || true
gcloud scheduler jobs delete player-refresh-hourly --location $REGION --project $PROJECT_ID --quiet 2>/dev/null || true
gcloud scheduler jobs create http player-refresh-hourly \
  --location $REGION \
  --project $PROJECT_ID \
  --schedule "0 * * * *" \
  --time-zone "Asia/Jerusalem" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/$PLAYER_JOB:run" \
  --http-method POST \
  --oauth-service-account-email ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com

# ── Releases Refresh Job (daily at 03:00 Israel) ────────────────────

echo ""
echo "=== Step 4a: Creating/updating Releases Refresh Job ==="
if gcloud run jobs describe $RELEASES_JOB --region $REGION --project $PROJECT_ID 2>/dev/null; then
  gcloud run jobs update $RELEASES_JOB \
    --image gcr.io/$PROJECT_ID/$IMAGE_NAME \
    --region $REGION \
    --project $PROJECT_ID \
    --task-timeout 30m \
    --memory 512Mi \
    --cpu 1 \
    --max-retries 0 \
    --set-env-vars "JOB_MODE=releases-refresh"
else
  gcloud run jobs create $RELEASES_JOB \
    --image gcr.io/$PROJECT_ID/$IMAGE_NAME \
    --region $REGION \
    --project $PROJECT_ID \
    --task-timeout 30m \
    --memory 512Mi \
    --cpu 1 \
    --max-retries 0 \
    --set-env-vars "JOB_MODE=releases-refresh"
fi

echo ""
echo "=== Step 4b: Granting invoke permission for Releases Refresh ==="
gcloud run jobs add-iam-policy-binding $RELEASES_JOB \
  --region $REGION \
  --project $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"

echo ""
echo "=== Step 4c: Creating Cloud Scheduler for Releases Refresh (daily 03:00 IST) ==="
gcloud scheduler jobs delete releases-refresh-daily --location $REGION --project $PROJECT_ID --quiet 2>/dev/null || true
gcloud scheduler jobs create http releases-refresh-daily \
  --location $REGION \
  --project $PROJECT_ID \
  --schedule "0 3 * * *" \
  --time-zone "Asia/Jerusalem" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/$RELEASES_JOB:run" \
  --http-method POST \
  --oauth-service-account-email ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com

echo ""
echo "=== Done! ==="
echo "Player Refresh:   runs every hour (200 stalest players/batch)"
echo "Releases Refresh: runs daily at 03:00 Israel time"
echo ""
echo "Test manually:"
echo "  gcloud run jobs execute $PLAYER_JOB --region $REGION --project $PROJECT_ID"
echo "  gcloud run jobs execute $RELEASES_JOB --region $REGION --project $PROJECT_ID"
