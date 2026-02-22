# MGSR Team — Web App

Web version of the MGSR Team football agent CRM.

## Setup

1. **Firebase**: Use the same Firebase project as your Android app. In Firebase Console → Project Settings → Your apps, add a Web app if you haven't, and copy the config.

2. **Environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Firebase config
   ```

3. **Backend**: Start the Transfermarkt proxy first (see `mgsr-backend/README.md`).

## Run locally

```bash
cd mgsr-web
npm install
npm run dev
```

Open http://localhost:3000

## Login

Use the same email/password as your Android app (Firebase Auth).
