# MGSR Team Web — Setup Complete

Your web app is ready. Here's what was built and how to run it.

---

## What's Included

### Backend (`mgsr-backend/`)
- **Transfermarkt proxy** — Search and player details (avoids CORS)
- **Endpoints**: `/health`, `/api/transfermarkt/search?q=...`, `/api/transfermarkt/player?url=...`
- **Stack**: Node.js, Express, Cheerio

### Web App (`mgsr-web/`)
- **Login** — Firebase Auth (same credentials as Android)
- **Dashboard** — Feed events, quick links to all sections
- **Tasks** — Agent tasks (pending/done), toggle complete
- **Players** — List from Firestore (real-time)
- **Add Player** — Search by name or paste Transfermarkt URL; supports Add to Shortlist
- **Player Info** — View details and notes
- **Shortlist** — Watchlist, add from Releases or Transfermarkt
- **Contacts** — Club/Agency contacts with filter
- **Releases** — Latest free agents by value range, add to shortlist
- **404** — Custom not-found page
- **Stack**: Next.js 14, React, Tailwind, Firebase

---

## Run Locally (2 terminals)

### Terminal 1 — Backend
```bash
cd mgsr-backend
npm install
npm run dev
```
→ http://localhost:8080

### Terminal 2 — Web
```bash
cd mgsr-web
npm install
```

**Before first run**: Create `mgsr-web/.env.local` with your Firebase config (from Firebase Console → Project Settings → Your apps → Web app):
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```
(Get from Firebase Console → Project Settings → Your apps → Web app)

```bash
npm run dev
```
→ http://localhost:3000

---

## Login

Use the same email/password as your Android app.

---

## File Structure

```
MGSRTeam/
├── mgsr-backend/          # Transfermarkt proxy
│   ├── server.js
│   ├── package.json
│   └── README.md
├── mgsr-web/              # Next.js app
│   ├── src/
│   │   ├── app/           # Pages (login, dashboard, players, etc.)
│   │   ├── components/    # AppLayout
│   │   ├── contexts/     # AuthContext
│   │   └── lib/          # firebase, api
│   ├── package.json
│   └── README.md
└── docs/
    ├── Web_Quick_Start.md
    └── Web_Setup_Complete.md
```

---

## Next Steps

1. Add your Firebase config to `.env.local`
2. Run both backend and web
3. Login and add a player
4. Deploy backend (e.g. Railway, Render) and web (e.g. Vercel) when ready
