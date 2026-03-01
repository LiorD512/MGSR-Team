#!/bin/bash
# Deploy Scout DB Build Cloud Run Job
# Run from workers-job-scout-build folder: ./deploy.sh
#
# One-time: Create GITHUB_TOKEN secret:
#   echo -n "ghp_xxx" | gcloud secrets create GITHUB_TOKEN --data-file=- --project=mgsr-64e4b
#
# Set SCOUT_REPO_URL before deploy (or pass as env):
#   export SCOUT_REPO_URL="https://github.com/OWNER/football-scout-server"

set -e
PROJECT_ID="mgsr-64e4b"
REGION="us-central1"
JOB_NAME="scout-db-build-job"

# Required: repo URL. Override with env or pass as first arg.
SCOUT_REPO_URL="${SCOUT_REPO_URL:-${1}}"
if [ -z "$SCOUT_REPO_URL" ]; then
  echo "ERROR: Set SCOUT_REPO_URL (e.g. https://github.com/you/football-scout-server)"
  echo "  export SCOUT_REPO_URL=\"https://github.com/owner/repo\""
  echo "  or: ./deploy.sh https://github.com/owner/repo"
  exit 1
fi

echo "=== Step 1: Getting project number ==="
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
echo "Project number: $PROJECT_NUMBER"

echo ""
echo "=== Step 2: Building and pushing container ==="
gcloud builds submit --tag gcr.io/$PROJECT_ID/$JOB_NAME --project $PROJECT_ID

echo ""
echo "=== Step 3: Creating/updating Cloud Run Job ==="
BUILD_CMD="${BUILD_COMMAND:-python build.py}"
DB_FILES="${DB_FILES_TO_COMMIT:-*.db data/*.db}"
BRANCH="${GIT_BRANCH:-main}"
# Quote BUILD_COMMAND if it contains spaces (gcloud requirement)
ENV_VARS="SCOUT_REPO_URL=$SCOUT_REPO_URL,BUILD_COMMAND=\"$BUILD_CMD\",DB_FILES_TO_COMMIT=$DB_FILES,GIT_BRANCH=$BRANCH"

if gcloud run jobs describe $JOB_NAME --region $REGION --project $PROJECT_ID 2>/dev/null; then
  gcloud run jobs update $JOB_NAME \
    --image gcr.io/$PROJECT_ID/$JOB_NAME \
    --region $REGION \
    --project $PROJECT_ID \
    --task-timeout 18h \
    --memory 1Gi \
    --cpu 1 \
    --max-retries 0 \
    --set-env-vars "$ENV_VARS" \
    --set-secrets "GITHUB_TOKEN=GITHUB_TOKEN:latest"
else
  gcloud run jobs create $JOB_NAME \
    --image gcr.io/$PROJECT_ID/$JOB_NAME \
    --region $REGION \
    --project $PROJECT_ID \
    --task-timeout 18h \
    --memory 1Gi \
    --cpu 1 \
    --max-retries 0 \
    --set-env-vars "$ENV_VARS" \
    --set-secrets "GITHUB_TOKEN=GITHUB_TOKEN:latest"
fi

echo ""
echo "=== Step 4: Granting invoke permission ==="
gcloud run jobs add-iam-policy-binding $JOB_NAME \
  --region $REGION \
  --project $PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"

echo ""
echo "=== Step 5: Granting Secret Manager access ==="
gcloud secrets add-iam-policy-binding GITHUB_TOKEN \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project $PROJECT_ID 2>/dev/null || echo "(Secret access may already be granted)"

echo ""
echo "=== Step 6: Creating Cloud Scheduler (Monday 04:00 Israel time) ==="
gcloud scheduler jobs delete scout-db-build-weekly --location $REGION --project $PROJECT_ID --quiet 2>/dev/null || true
gcloud scheduler jobs create http scout-db-build-weekly \
  --location $REGION \
  --project $PROJECT_ID \
  --schedule "0 4 * * 1" \
  --time-zone "Asia/Jerusalem" \
  --uri "https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/$JOB_NAME:run" \
  --http-method POST \
  --oauth-service-account-email ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com

echo ""
echo "=== Done! Job will run every Monday at 04:00 Israel time. ==="
echo "Test manually: gcloud run jobs execute $JOB_NAME --region $REGION --project $PROJECT_ID"
