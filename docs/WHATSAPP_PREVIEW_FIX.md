# Why WhatsApp Preview Shows "P" Instead of Player Image

## The Problem

- **Website**: Shows player image ✓ (data loads in the **browser** via Firebase client)
- **WhatsApp preview**: Shows "P" ✗ (image generated on **Vercel server** – server cannot read Firestore)

## Root Cause

When WhatsApp crawls your link, it requests the OG image from Vercel's server. The server runs `getShareData()` to fetch the share from Firestore. **On Vercel, this fails** because:

1. **Firebase Admin** is not configured → returns null
2. **Firebase Client SDK** does not work reliably in serverless Node.js

So the server never gets `profileImage`, and we show the "P" fallback.

## The Fix: Add Firebase Admin to Vercel

You **must** add Firebase Admin credentials so the server can read Firestore.

### Step 1: Get Service Account Key

1. Open [Firebase Console](https://console.firebase.google.com) → your project
2. Project Settings (gear) → **Service accounts**
3. Click **Generate new private key**
4. Download the JSON file

### Step 2: Add to Vercel

1. Vercel → your project → **Settings** → **Environment Variables**
2. Add these (for **Production** and **Preview**):

| Name | Value |
|------|-------|
| `FIREBASE_PROJECT_ID` | From the JSON: `project_id` |
| `FIREBASE_CLIENT_EMAIL` | From the JSON: `client_email` |
| `FIREBASE_PRIVATE_KEY` | From the JSON: `private_key` – **keep the `\n` as literal** (paste the full value including quotes) |

For `FIREBASE_PRIVATE_KEY`, the value looks like:
```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
```
Paste it exactly, including the `\n` characters.

### Step 3: Redeploy

Trigger a new deployment (push a commit or use Vercel dashboard → Deployments → Redeploy).

### Step 4: Verify

After deploy, test the image proxy:
```
curl -I "https://mgsr-team.vercel.app/api/share/image/YOUR_TOKEN"
```
- **200** + `Content-Type: image/...` = working
- **404** = getShareData still returns null (check env vars)

Or use the debug endpoint:
```
curl "https://mgsr-team.vercel.app/api/share/debug/YOUR_TOKEN"
```
Should return `hasProfileImage: true` when working.

## Alternative: FIREBASE_SERVICE_ACCOUNT

Instead of 3 separate vars, you can use one:

| Name | Value |
|------|-------|
| `FIREBASE_SERVICE_ACCOUNT` | The **entire** JSON file content as a string |

This is often easier – just paste the full JSON.
