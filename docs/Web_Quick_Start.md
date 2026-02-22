# MGSR Team Web — Quick Start

Run the web app locally in 5 minutes.

## 1. Start the backend (Transfermarkt proxy)

```bash
cd mgsr-backend
npm install
npm run dev
```

Leave it running. Backend: http://localhost:8080

## 2. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com) → your MGSR project
2. Project Settings → Your apps → Add app → Web (</>)
3. Copy the config object
4. Create `mgsr-web/.env.local`:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

## 3. Start the web app

```bash
cd mgsr-web
npm install
npm run dev
```

Open http://localhost:3000

## 4. Login

Use the same email/password as your Android app.

## What you get

- **Login** — Firebase Auth
- **Dashboard** — Feed events, quick links
- **Tasks** — Agent tasks
- **Players** — List from Firestore (real-time)
- **Add Player** — Search or paste Transfermarkt URL; Add to Roster or Shortlist
- **Player Info** — View player details and notes
- **Shortlist** — Watchlist
- **Contacts** — Club/Agency contacts
- **Releases** — Latest free agents by value range
