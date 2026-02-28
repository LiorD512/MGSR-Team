# PlayerRefreshWorker — Step-by-Step Deploy Guide

## Option A: One-command deploy (easiest)

```bash
cd /Users/lior.dahan/AndroidStudioProjects/MGSRTeam/workers-job
chmod +x deploy.sh
./deploy.sh
```

That's it. The script does everything below.

---

## Option B: Manual step-by-step

Run these commands in order. Copy and paste each block.

---

## Step 1: Open terminal and go to the workers-job folder

```bash
cd /Users/lior.dahan/AndroidStudioProjects/MGSRTeam/workers-job
```

---

## Step 2: Get your project number (you'll need it for Step 6)

```bash
gcloud projects describe mgsr-64e4b --format="value(projectNumber)"
```

Write down the number that appears (e.g. `123456789012`). You'll use it in Step 6.

---

## Step 3: Build and push the container image

```bash
gcloud builds submit --tag gcr.io/mgsr-64e4b/player-refresh-job --project mgsr-64e4b
```

Wait for the build to finish (a few minutes).

---

## Step 4: Create the Cloud Run Job

```bash
gcloud run jobs create player-refresh-job \
  --image gcr.io/mgsr-64e4b/player-refresh-job \
  --region us-central1 \
  --project mgsr-64e4b \
  --task-timeout 4h \
  --memory 512Mi \
  --cpu 1 \
  --max-retries 0
```

If it says the job already exists, use this instead to update it:

```bash
gcloud run jobs update player-refresh-job \
  --image gcr.io/mgsr-64e4b/player-refresh-job \
  --region us-central1 \
  --project mgsr-64e4b \
  --task-timeout 4h \
  --memory 512Mi \
  --cpu 1 \
  --max-retries 0
```

---

## Step 5: Grant the default compute service account permission to invoke the job

Replace `YOUR_PROJECT_NUMBER` with the number from Step 2 (e.g. `123456789012`):

```bash
gcloud run jobs add-iam-policy-binding player-refresh-job \
  --region us-central1 \
  --project mgsr-64e4b \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"
```

Example: if your project number is `987654321098`, the command is:

```bash
gcloud run jobs add-iam-policy-binding player-refresh-job \
  --region us-central1 \
  --project mgsr-64e4b \
  --member="serviceAccount:987654321098-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Step 6: Create Cloud Scheduler to run the job at 02:00 Israel time

Replace `YOUR_PROJECT_NUMBER` with the number from Step 2:

```bash
gcloud scheduler jobs create http player-refresh-daily \
  --location us-central1 \
  --project mgsr-64e4b \
  --schedule "0 2 * * *" \
  --time-zone "Asia/Jerusalem" \
  --uri "https://run.googleapis.com/v2/projects/mgsr-64e4b/locations/us-central1/jobs/player-refresh-job:run" \
  --http-method POST \
  --oauth-service-account-email YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com
```

Example: if your project number is `987654321098`:

```bash
gcloud scheduler jobs create http player-refresh-daily \
  --location us-central1 \
  --project mgsr-64e4b \
  --schedule "0 2 * * *" \
  --time-zone "Asia/Jerusalem" \
  --uri "https://run.googleapis.com/v2/projects/mgsr-64e4b/locations/us-central1/jobs/player-refresh-job:run" \
  --http-method POST \
  --oauth-service-account-email 987654321098-compute@developer.gserviceaccount.com
```

If it says the scheduler job already exists, delete it first:

```bash
gcloud scheduler jobs delete player-refresh-daily --location us-central1 --project mgsr-64e4b --quiet
```

Then run the create command again.

---

## Step 7: Test the job manually (optional)

```bash
gcloud run jobs execute player-refresh-job --region us-central1 --project mgsr-64e4b
```

Check Firestore `WorkerRuns/PlayerRefreshWorker` after it finishes to see the result.

---

## Done

The job will now run automatically every day at 02:00 Israel time.
