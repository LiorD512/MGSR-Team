#!/bin/bash
# Deploy PlayerRefreshWorker Cloud Run Job
# Run from workers-job folder: ./deploy.sh

set -e
PROJECT_ID="mgsr-64e4b"
REGION="us-central1"
JOB_NAME="player-refresh-job"

echo "=== Step 1: Getting project number ==="
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
echo "Project number: $PROJECT_NUMBER"

echo ""
echo "=== Step 2: Building and pushing container ==="
gcloud builds submit --tag gcr.io/$PROJECT_ID/$JOB_NAME --project $PROJECT_ID

echo ""
echo "=== Step 3: Creating/updating Cloud Run Job ==="
if gcloud run jobs describe $JOB_NAME --region $REGION --project $PROJECT_ID 2>/dev/null; then
  gcloud run jobs update $JOB_NAME \
    --image gcr.io/$PROJECT_ID/$JOB_NAME \
    --region $REGION \
    --project $PROJECT_ID \
    --task-timeout 4h \
    --memory 512Mi \
    --cpu 1 \
    --max-retries 0 \
    --set-env-vars "SCOUT_TM_PROXY_URL=https://mgsr-backend.onrender.com/tm_proxy" \
    --set-secrets "SCOUT_ENRICH_SECRET=SCOUT_ENRICH_SECRET:latest"
else
  gcloud run jobs create $JOB_NAME \
    --image gcr.io/$PROJECT_ID/$JOB_NAME \
    --region $REGION \
    --project $PROJECT_ID \
    --task-timeout 4h \
    --memory 512Mi \
    --cpu 1 \
    --max-retries 0 \
    --set-env-vars "SCOUT_TM_PROXY_URL=https://mgsr-backend.onrender.com/tm_proxy" \
    --set-secrets "SCOUT_ENRICH_SECRET=SCOUT_ENRICH_SECRET:latest"
fi

echo ""
echo "=== Step 4: Granting invoke permission ==="
gcloud run jobs add-iam-policy-binding $JOB_NAME \
  --region $REGION \
  --project $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"

echo ""
echo "=== Step 5: Creating Cloud Scheduler (02:00 Israel time) ==="
gcloud scheduler jobs delete player-refresh-daily --location $REGION --project $PROJECT_ID --quiet 2>/dev/null || true
gcloud scheduler jobs create http player-refresh-daily \
  --location $REGION \
  --project $PROJECT_ID \
  --schedule "0 2 * * *" \
  --time-zone "Asia/Jerusalem" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/$JOB_NAME:run" \
  --http-method POST \
  --oauth-service-account-email ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com

echo ""
echo "=== Done! Job will run daily at 02:00 Israel time. ==="
echo "Test manually: gcloud run jobs execute $JOB_NAME --region $REGION --project $PROJECT_ID"
