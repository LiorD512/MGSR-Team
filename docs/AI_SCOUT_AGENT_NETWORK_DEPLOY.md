# AI Scout Agent Network — Deployment

## Overview

The AI Scout Agent Network runs as a **Firebase Cloud Function** (`scoutAgentScheduled`) daily at **05:00 Israel time**. It fetches players from the football-scout-server recruitment API, assigns them to country agents by league, matches scouting profiles, and writes to Firestore `ScoutProfiles`.

## Prerequisites

- Firebase project with Blaze plan (for outbound HTTP)
- `SCOUT_SERVER_URL` env var (optional — defaults to football-scout-server on Render)

## Deploy Firebase Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

The following function will be deployed:
- `scoutAgentScheduled` — runs at 05:00 Israel time

## Firestore Indexes

If you add a composite query (e.g. `where('agentId','==',x).orderBy('lastRefreshedAt','desc')`), create the index in Firebase Console or via `firestore.indexes.json`. The current API filters in memory to avoid index requirements.

## Firestore Rules

Ensure `firestore.rules` includes:

```
match /ScoutProfiles/{profileId} {
  allow read: if request.auth != null;
  allow write: if false;
}
match /ScoutAgentRuns/{runId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

Deploy rules: `firebase deploy --only firestore:rules`

## Environment Variables

Set in Firebase Functions config (optional):

```bash
firebase functions:config:set scout.server_url="https://football-scout-server-l38w.onrender.com"
```

Or use `process.env.SCOUT_SERVER_URL` if set in your deployment environment.

## Manual Trigger (Testing)

To run the scout agent manually without waiting for schedule:

```bash
# Via Firebase Emulator or HTTP trigger (if you add one)
# Or invoke the function from Firebase Console > Functions > scoutAgentScheduled > Run
```

## War Room UI

The AI Scout Agents tab appears in War Room when:
1. User is authenticated
2. `ScoutProfiles` collection has data (populated by the scheduled run)

Profiles are grouped by agent (Portugal, Serbia, Poland, etc.) with clear source attribution.

## Scout Profiles Schema

Each document in `ScoutProfiles`:

- `tmProfileUrl` — Transfermarkt URL
- `agentId` — portugal | serbia | poland | greece | belgium | netherlands | turkey | austria
- `profileType` — HIGH_VALUE_BENCHED | YOUNG_STRIKER_HOT | HIDDEN_GEM | etc.
- `playerName`, `age`, `position`, `marketValue`, `club`, `league`
- `matchReason` — why this player matched the profile
- `discoveredAt`, `lastRefreshedAt`

## Troubleshooting

- **No profiles:** Check `ScoutAgentRuns` for last run status and error
- **Scout server timeout:** Increase delay between requests or reduce position count
- **Wrong agent assignment:** Update `LEAGUE_TO_AGENT` in `functions/workers/scoutAgent.js`
