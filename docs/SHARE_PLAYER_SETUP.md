# Share Player Profile – Setup

This feature lets users share a player profile via WhatsApp or email. The recipient gets a **public landing page** (no login required) with player info, mandate status, scout report, and contact details.

**Important:** The WhatsApp link preview (player image, title) and working links **require a public URL**. `localhost` links:
- Won't work when opened on a different device (e.g. phone)
- Cause ERR_SSL_PROTOCOL_ERROR when some browsers upgrade http→https
- Don't show preview in WhatsApp (WhatsApp's servers can't reach localhost)

**For local testing:** Use [ngrok](https://ngrok.com):
1. Run `npx ngrok http 3006` (use your dev server port)
2. Copy the https URL (e.g. `https://abc123.ngrok-free.app`)
3. Add to `.env.local`: `NEXT_PUBLIC_APP_URL=https://abc123.ngrok-free.app`
4. Restart the dev server. Share links will use the ngrok URL.

## Flow

1. User taps **Share** on the player page (web or Android).
2. A share link is created: `https://your-app.com/p/{token}`.
3. The link is shared via WhatsApp/email. **WhatsApp shows a preview with the player image** (Open Graph meta tags).
4. Recipient opens the link and sees the styled landing page.

## Firestore Rules

Deploy the rules (merge with your existing rules if needed):

```bash
firebase deploy --only firestore
```

The `SharedPlayers` collection allows:
- **Read**: Anyone (token is unguessable UUID).
- **Create**: Authenticated users only.

## Web App

### Option A: Client-side create (simplest)

No extra setup. The web app creates the share directly in Firestore when the user is logged in. Ensure Firestore rules are deployed.

### Option B: API create (with short AI scout report)

1. Add Firebase Admin credentials to Vercel env vars:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY` (with `\n` as literal newlines)
2. Add `GEMINI_API_KEY` for short scout report generation.
3. Add `NEXT_PUBLIC_APP_URL` (e.g. `https://mgsr-web-xxx.vercel.app`).

## Android App

1. Add to `local.properties`:
   ```
   MGSR_WEB_URL=https://your-mgsr-web.vercel.app
   ```
2. Rebuild. The share button creates the link and opens the share chooser.

## Landing Page Content

- Player name, photo, position, club, market value
- Mandate status (if exists)
- Short scout report (from AI or template)
- Contact phone (agent) for WhatsApp
