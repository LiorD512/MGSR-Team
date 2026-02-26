# WhatsApp Link Preview Setup

## Why images may not show

WhatsApp's crawler fetches the `og:image` URL from your page. If the URL points to a **Vercel preview deployment** (e.g. `mgsr-team-xxx-liord512s-projects.vercel.app`), the image request returns **401** and WhatsApp cannot display it.

## Fix: Use production URL for og:image

### Option 1: Vercel system env (recommended)

Enable **"Automatically expose System Environment Variables"** in your Vercel project:
- Project → Settings → Environment Variables
- Enable the checkbox for system variables

This exposes `VERCEL_PROJECT_PRODUCTION_URL` (e.g. `mgsr-team.vercel.app`), which the app uses for og:image URLs so the crawler can fetch them.

### Option 2: Set NEXT_PUBLIC_APP_URL

In Vercel → Environment Variables, add:
```
NEXT_PUBLIC_APP_URL=https://mgsr-team.vercel.app
```
Apply to Production (and Preview if you want).

## WhatsApp requirements

- **Format:** JPG, PNG, or WebP (no SVG)
- **Size:** Under 600KB
- **Dimensions:** Min 100×100px, recommended 1200×630px
- **URL:** Must be absolute HTTPS, publicly accessible (no auth)

## Cache

WhatsApp caches previews. After fixing, old links may still show no image until cache expires. Test with a **new** share link.

## Image proxy

The app proxies player images via `/api/share/image/[token]` because:
- Transfermarkt may block direct fetches from server IPs
- ImageResponse fetches from our own API (same origin, no blocking)

If you see "P" instead of the player photo:
1. Ensure Firebase is configured (Admin or client SDK can read SharedPlayers)
2. Check that the share doc in Firestore has `player.profileImage` set
3. Test the proxy: `curl -I https://mgsr-team.vercel.app/api/share/image/YOUR_TOKEN`
