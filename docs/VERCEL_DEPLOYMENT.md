# Deploy MGSR Team to Vercel

The web app includes the Transfermarkt backend as Next.js API routes. Deploy **only** to Vercel — no separate backend service needed.

---

## Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New** → **Project**.
3. Import `LiorD512/MGSR-Team`.
4. Configure:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `mgsr-web` (click **Edit** and set this)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: (leave default)

5. **Environment Variables** — Add:

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | From Firebase Console |
   | `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/apikey) — required for scout report (portfolio/share) |

   **Do not** set `NEXT_PUBLIC_BACKEND_URL` — the app uses built-in API routes.

6. Click **Deploy**.
7. Your app will be at `https://mgsr-web-xxxx.vercel.app`.

**Note:** Scout report generation (portfolio, share) needs up to 60 seconds. Vercel Hobby limits functions to 10s — upgrade to Pro or the scout report may fail. Add `GEMINI_API_KEY` in Environment Variables.

---

## Add Vercel Domain to Firebase

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
2. Add: `mgsr-web-xxxx.vercel.app` (your actual Vercel URL)
3. Vercel often adds `*.vercel.app` — if so, `*.vercel.app` may already be allowed; check the list.

---

## Summary

| Service      | Host   | URL                          |
|-------------|--------|------------------------------|
| Web app + API | Vercel | `https://mgsr-web-xxx.vercel.app` |

Vercel’s free tier is generous for Next.js and doesn’t count against your Render limit.
