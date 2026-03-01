# Deploy MGSR Team to Render

> **Free plan limit**: Render allows only 1 web service on the free tier. If you already have one, use **Vercel for the web app** instead — see [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md).

Deploy both the backend and web app to Render as two Web Services (requires paid plan for 2 services).

---

## 1. Deploy the Backend First

1. Go to [render.com](https://render.com) and sign in (or create an account).
2. Click **New** → **Web Service**.
3. Connect your GitHub repo: `LiorD512/MGSR-Team`.
4. Configure:
   - **Name**: `mgsr-backend` (or any name)
   - **Region**: Choose closest to your users
   - **Branch**: `feature/contract-finisher-web` (or your branch)
   - **Root Directory**: `mgsr-backend`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or paid for better performance)

5. Click **Create Web Service**.
6. Wait for the first deploy. When it’s done, copy the URL, e.g.:
   ```
   https://mgsr-backend-xxxx.onrender.com
   ```
   You’ll use this as `NEXT_PUBLIC_BACKEND_URL` for the web app.

---

## 2. Deploy the Web App

1. Click **New** → **Web Service** again.
2. Connect the same repo: `LiorD512/MGSR-Team`.
3. Configure:
   - **Name**: `mgsr-web` (or any name)
   - **Region**: Same as backend
   - **Branch**: `feature/contract-finisher-web`
   - **Root Directory**: `mgsr-web`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or paid)

4. **Environment Variables** — Add these (click **Advanced** → **Add Environment Variable**):

   | Key | Value |
   |-----|-------|
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | From Firebase Console |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | From Firebase Console |
   | `NEXT_PUBLIC_BACKEND_URL` | `https://mgsr-backend-xxxx.onrender.com` (your backend URL from step 1) |

   Copy the values from your `mgsr-web/.env.local` file.

5. Click **Create Web Service**.
6. Wait for the deploy. Your web app URL will be something like:
   ```
   https://mgsr-web-xxxx.onrender.com
   ```

---

## 3. Add Render Domain to Firebase

Firebase Auth only works on domains you explicitly allow.

1. Go to [Firebase Console](https://console.firebase.google.com) → your project.
2. **Authentication** → **Settings** → **Authorized domains**.
3. Click **Add domain** and add:
   - `mgsr-web-xxxx.onrender.com` (replace with your actual web URL)
   - If you use a custom domain later, add that too.

---

## 4. Optional: Custom Domain

1. In Render: **Settings** → **Custom Domain** for both services.
2. Add your domain (e.g. `app.mgsrteam.com`) and follow the DNS instructions.
3. Add the custom domain to Firebase Authorized domains.

---

## 5. Free Tier Notes

- **Spinning down**: Free instances sleep after ~15 minutes of no traffic. First request after sleep can take 30–60 seconds.
- **Build minutes**: Render gives a limited number of build minutes per month on the free tier.
- **Backend + Web**: You need two services; both can run on the free tier.

---

## Quick Checklist

- [ ] Backend deployed and URL copied
- [ ] Web app deployed with `NEXT_PUBLIC_BACKEND_URL` set to backend URL
- [ ] All Firebase env vars set on the web service
- [ ] Render web domain added to Firebase Authorized domains
- [ ] Test login and main flows on the live site
