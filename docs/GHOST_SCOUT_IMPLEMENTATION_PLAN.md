# Ghost Scout — Implementation Plan

> **Vision:** An AI that never sleeps — monitors your players 24/7 and alerts you when opportunities arise: value drops, benchings, contract situations, and more.

---

## 1. Current State vs. Target

### What Exists Today

| Component | Where | Limitation |
|-----------|-------|-------------|
| **PlayerRefreshWorker** | Android (WorkManager) | Runs at 02:00 Israel time, **only on authorized device**. If phone is off → no refresh. |
| **ReleasesRefreshWorker** | Android (WorkManager) | Same — device-dependent, nightly at 03:00. |
| **MandateExpiryWorker** | Android | Same — device-dependent. |
| **onNewFeedEvent** | Firebase Cloud Function | Sends push when FeedEvent is created. Works 24/7. |
| **onTaskRemindersScheduled** | Firebase Cloud Function | Runs at 9:00 AM Israel time. **Server-side** — true 24/7. |

**Key insight:** The *detection* logic runs on the device. The *notification* logic runs in the cloud. Ghost Scout must move *detection* to the cloud.

### What Ghost Scout Adds

| Alert Type | Description | Data Source |
|------------|-------------|-------------|
| **VALUE_DROP** | Market value dropped significantly (e.g. >10%) | Transfermarkt |
| **BENCHED** | Playing time dropped sharply (e.g. 3+ games without minutes) | FBref (via scout server) |
| **CONTRACT_EXPIRING_SOON** | Contract ends in <6 months | Transfermarkt |
| **BECAME_FREE_AGENT** | Player left club | Transfermarkt |
| **CLUB_CHANGE** | Player moved to new club | Transfermarkt |
| **NEW_RELEASE** | New free agent in market | Transfermarkt |

*(Some already exist from PlayerRefreshWorker; Ghost Scout will run server-side and cover more players.)*

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GHOST SCOUT ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────┐     ┌─────────────────────┐                      │
│   │ Firebase Cloud      │     │ mgsr-backend        │                      │
│   │ Functions           │     │ (Express)           │                      │
│   │                     │     │                     │                      │
│   │ ghostScoutScheduled │────▶│ /api/transfermarkt/ │                      │
│   │ (every 6h)          │     │ player?url=...      │                      │
│   │                     │     │                     │                      │
│   └─────────┬───────────┘     └─────────────────────┘                      │
│             │                              │                                │
│             │ 1. Get watch list             │ 2. Fetch fresh TM data         │
│             │    (Firestore)                │                                │
│             ▼                              │                                │
│   ┌─────────────────────┐                   │                                │
│   │ Firestore           │                   │                                │
│   │ - Players (roster)  │                   │                                │
│   │ - Shortlists       │                   │                                │
│   └─────────┬───────────┘                   │                                │
│             │                              │                                │
│             │ 3. Compare & detect          │                                │
│             │ 4. Write FeedEvent           │                                │
│             ▼                              │                                │
│   ┌─────────────────────┐     ┌─────────────────────┐                      │
│   │ FeedEvents          │────▶│ onNewFeedEvent      │                      │
│   │ (Firestore)         │     │ → FCM push          │                      │
│   └─────────────────────┘     └─────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Phases

### Phase 1: Foundation — Server-Side Scheduler (1–2 weeks)

**Goal:** Move Ghost Scout detection to Firebase Cloud Functions so it runs 24/7 regardless of device.

#### Step 1.1: Add Ghost Scout Watch List

**Firestore structure:**

- **Watch list:** Roster + Shortlist players (no new collection needed).
- **Deduplication:** Collect all `tmProfile` URLs from:
  - `Players` collection (roster)
  - `Shortlists/team` — `entries[].tmProfileUrl` (shared shortlist doc ID)

**Implementation:**

```javascript
// functions/ghostScout.js

async function getWatchListUrls(db) {
  const urls = new Set();

  // 1. Roster players
  const playersSnap = await db.collection('Players').get();
  playersSnap.docs.forEach(doc => {
    const tmProfile = doc.data()?.tmProfile;
    if (tmProfile) urls.add(tmProfile);
  });

  // 2. Shortlist
  const shortlistSnap = await db.collection('Shortlists').doc('team').get();
  const entries = shortlistSnap.data()?.entries || [];
  entries.forEach(e => {
    if (e.tmProfileUrl) urls.add(e.tmProfileUrl);
  });

  return Array.from(urls);
}
```

#### Step 1.2: Create mgsr-backend Batch Endpoint (Optional)

**Current:** `GET /api/transfermarkt/player?url=...` — one player at a time.

**Option A:** Keep one-by-one. Cloud Function calls with 12–15s delay between requests (Transfermarkt anti-blocking). For 100 players: ~25 min per run.

**Option B:** Add `POST /api/transfermarkt/player-batch` that accepts up to 10 URLs, fetches with internal delays, returns array. Reduces Cloud Function invocations.

**Recommendation:** Start with Option A. Simpler, reuses existing logic. Optimize later if needed.

#### Step 1.3: Ghost Scout Cloud Function

**File:** `functions/ghostScout.js`

```javascript
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

const BACKEND_URL = process.env.MGSR_BACKEND_URL || "https://your-backend.onrender.com";
const DELAY_BETWEEN_REQUESTS_MS = 15000; // 15s - Transfermarkt anti-blocking

exports.ghostScoutScheduled = onSchedule(
  { schedule: "0 */6 * * *", timeZone: "Asia/Jerusalem" }, // Every 6 hours
  async () => {
    const db = getFirestore();
    const urls = await getWatchListUrls(db);
    if (urls.length === 0) return;

    const feedRef = db.collection("FeedEvents");
    const playersRef = db.collection("Players");

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS_MS));

      try {
        const fresh = await fetch(`${BACKEND_URL}/api/transfermarkt/player?url=${encodeURIComponent(url)}`).then(r => r.json());
        const existing = await playersRef.where("tmProfile", "==", url).limit(1).get();
        const playerDoc = existing.docs[0]?.data();
        const playerId = existing.docs[0]?.id;

        if (!playerDoc) continue; // Not in roster - might be shortlist only; check shortlist doc for name/image

        const events = detectChanges(playerDoc, fresh, url);
        for (const ev of events) {
          await feedRef.add(ev);
        }

        // Optionally update Firestore player with fresh data
        if (existing.docs[0] && (events.length > 0 || shouldUpdate(playerDoc, fresh))) {
          await existing.docs[0].ref.update(buildUpdatePayload(fresh));
        }
      } catch (err) {
        console.error(`Ghost Scout failed for ${url}:`, err.message);
      }
    }
  }
);
```

#### Step 1.4: Change Detection Logic

```javascript
function detectChanges(existing, fresh, tmProfile) {
  const events = [];
  const now = Date.now();

  // Market value drop >10%
  const oldVal = parseMarketValue(existing.marketValue);
  const newVal = parseMarketValue(fresh.marketValue);
  if (oldVal > 0 && newVal > 0 && newVal < oldVal * 0.9) {
    events.push({
      type: "MARKET_VALUE_CHANGE",
      playerName: fresh.fullName || existing.fullName,
      playerImage: fresh.profileImage || existing.profileImage,
      playerTmProfile: tmProfile,
      oldValue: existing.marketValue,
      newValue: fresh.marketValue,
      extraInfo: "GHOST_SCOUT",
      timestamp: now,
    });
  }

  // Club change
  const oldClub = existing.currentClub?.clubName || "";
  const newClub = fresh.currentClub?.clubName || "";
  if (oldClub && newClub && oldClub !== newClub) {
    const isFreeAgent = !newClub || newClub.toLowerCase().includes("without club");
    events.push({
      type: isFreeAgent ? "BECAME_FREE_AGENT" : "CLUB_CHANGE",
      playerName: fresh.fullName || existing.fullName,
      playerImage: fresh.profileImage || existing.profileImage,
      playerTmProfile: tmProfile,
      oldValue: oldClub,
      newValue: isFreeAgent ? "Without club" : newClub,
      extraInfo: "GHOST_SCOUT",
      timestamp: now,
    });
  }

  // Contract expiring in <6 months (parse contractExpires / contractExpired)
  const expDate = parseContractDate(fresh.contractExpires || existing.contractExpired);
  if (expDate && isWithinMonths(expDate, 6)) {
    // Check if we haven't already sent this recently (dedupe)
    events.push({
      type: "CONTRACT_EXPIRING",
      playerName: fresh.fullName || existing.fullName,
      playerImage: fresh.profileImage || existing.profileImage,
      playerTmProfile: tmProfile,
      oldValue: null,
      newValue: fresh.contractExpires || existing.contractExpired,
      extraInfo: "GHOST_SCOUT",
      timestamp: now,
    });
  }

  return events;
}
```

#### Step 1.5: Deduplication

Before writing a FeedEvent, check if we already sent one for this player+type recently (e.g. last 7 days):

```javascript
const recent = await feedRef
  .where("playerTmProfile", "==", url)
  .where("type", "==", eventType)
  .where("timestamp", ">", Date.now() - 7 * 24 * 60 * 60 * 1000)
  .limit(1)
  .get();
if (!recent.empty) return; // Skip duplicate
```

#### Step 1.6: Environment & Deployment

- **Firebase:** Set `MGSR_BACKEND_URL` in Firebase Functions config.
- **mgsr-backend:** Must be deployed and reachable from Cloud Functions (public URL).
- **Firebase Blaze plan:** Required for outbound HTTP from Cloud Functions (or use Vercel serverless if preferred).

---

### Phase 2: Shortlist-Only Players (1 week)

**Goal:** Ghost Scout currently gets player data from `Players` (roster). Shortlist-only players may not be in `Players` — they're just URLs in Shortlists.

**Options:**

1. **Fetch from Transfermarkt only** — We have URL, we get `fullName`, `profileImage`, `marketValue`, `currentClub` from TM. We don't have "previous" state. For shortlist-only:
   - Store last-known state in a new collection `GhostScoutState/{tmProfileHash}` with `marketValue`, `clubName`, `lastChecked`.
   - On each run, compare fresh vs. stored. If changed → FeedEvent, update stored.

2. **Create minimal Player doc** — When adding to shortlist, also create a minimal `Players` doc (or a `GhostScoutWatchList` doc) with `tmProfile`, `fullName`, `profileImage`, `marketValue`, `currentClub`. Then same logic as roster.

**Recommendation:** Option 1 — new collection `GhostScoutState`:

```javascript
// Firestore: GhostScoutState/{base64url}
{
  tmProfile: "https://...",
  fullName: "Player X",
  profileImage: "...",
  marketValue: "€500k",
  clubName: "Club Y",
  lastChecked: 1730000000000,
  source: "shortlist" // or "roster"
}
```

---

### Phase 3: New Alert Types — "Benched" (2–3 weeks)

**Goal:** Detect when a player's playing time drops sharply (e.g. benched 3+ games).

**Data source:** FBref. The football-scout-server has FBref data. We need an endpoint like:

```
GET /player_minutes?tm_url=... 
→ { minutes_last_5: 450, minutes_prev_5: 0, trend: "dropping" }
```

**Implementation:**

1. **football-scout-server:** Add endpoint that returns recent minutes/appearances for a player (from FBref or internal DB).
2. **Ghost Scout:** For each watched player, call this endpoint. If `minutes_last_5` is 0 or very low and `minutes_prev_5` was high → "BENCHED" alert.
3. **FeedEvent:** New type `TYPE_BENCHED` = "BENCHED". Add to `NOTIFIABLE_TYPES` in `onNewFeedEvent`.

**Caveat:** FBref coverage is limited. Many players won't have data. Only alert when we have sufficient data.

---

### Phase 4: Proactive Discovery — Request-Matched Players (2–3 weeks)

**Goal:** For each active ClubRequest, find players that match. Periodically check if those players' situations changed (value drop, contract, etc.).

**Flow:**

1. Fetch active `ClubRequests` from Firestore.
2. For each request, call football-scout-server `/recruitment` with request params.
3. Get top 20–30 candidate URLs.
4. Add these to the watch list for this run (or a separate "request-matched" watch list).
5. Run same change detection. If a candidate's value dropped or he became free → FeedEvent with `extraInfo: "MATCHES_REQUEST_${requestId}"`.

**UI:** In the alert, link to the request: "Player X's value dropped — he matches your request for Maccabi Haifa."

---

### Phase 5: UI & Tuning (1 week)

#### 5.1 Ghost Scout Settings (Optional)

- **Enable/disable** Ghost Scout per account.
- **Alert preferences:** Which types to receive (value drop, benched, contract, etc.).
- **Quiet hours:** Don't push between 22:00–07:00 Israel time (optional).

#### 5.2 Feed Event Badge

- Add a small "Ghost Scout" badge on FeedEvent cards when `extraInfo === "GHOST_SCOUT"`.
- Filter: "Show only Ghost Scout alerts."

#### 5.3 Dashboard Widget

- "Ghost Scout last run: 2 hours ago."
- "3 opportunities in the last 24h."

---

## 4. Technical Stack Summary

| Component | Technology |
|-----------|------------|
| **Scheduler** | Firebase Cloud Functions v2 `onSchedule` |
| **Data store** | Firestore (Players, Shortlists, FeedEvents, GhostScoutState) |
| **Transfermarkt fetch** | mgsr-backend `/api/transfermarkt/player` |
| **Push notifications** | Existing `onNewFeedEvent` → FCM topic `mgsr_all` |
| **Optional: Benched** | football-scout-server new endpoint |
| **Optional: Request-matched** | football-scout-server `/recruitment` |

---

## 5. New FeedEvent Types

Add to `FeedEvent.kt` and `functions/index.js`:

```kotlin
// FeedEvent.kt
const val TYPE_BENCHED = "BENCHED"  // Playing time dropped sharply
```

```javascript
// functions/index.js - NOTIFIABLE_TYPES
"BENCHED",
```

---

## 6. Rate Limits & Cost

| Concern | Mitigation |
|---------|------------|
| **Transfermarkt blocking** | 15s delay between requests. 100 players ≈ 25 min. Run every 6h. |
| **Cloud Function timeout** | 60 min max (Gen 2). 100 players × 15s = 25 min. OK. |
| **Firebase invocations** | 1 scheduled run per 6h = 4/day. Negligible. |
| **mgsr-backend load** | 100 HTTP requests per run. Ensure backend can handle. |

---

## 7. Rollout Checklist

- [ ] Deploy mgsr-backend with public URL (if not already)
- [ ] Create `functions/ghostScout.js` with `getWatchListUrls`, `detectChanges`, `ghostScoutScheduled`
- [ ] Add `MGSR_BACKEND_URL` to Firebase config
- [ ] Add deduplication for FeedEvents (avoid spam)
- [ ] Handle shortlist-only players (GhostScoutState collection)
- [ ] Test with 5–10 players first (reduce schedule to 1 run for testing)
- [ ] Add `TYPE_BENCHED` and handler when Phase 3 is ready
- [ ] Update Android `FeedEventCard` for "Ghost Scout" badge
- [ ] Document new env vars in README

---

## 8. File Changes Summary

| File | Change |
|------|--------|
| `functions/ghostScout.js` | **New** — Ghost Scout scheduled function |
| `functions/index.js` | Export `ghostScoutScheduled`; add `BENCHED` to NOTIFIABLE_TYPES when ready |
| `app/.../FeedEvent.kt` | Add `TYPE_BENCHED` constant |
| `app/.../DashboardScreen.kt` | Add badge/handler for `TYPE_BENCHED`, Ghost Scout badge |
| `mgsr-backend/server.js` | Optional: add batch endpoint |
| `mgsr-web/.../dashboard` | Optional: Ghost Scout status/last run |

---

## 9. Success Metrics

- **Uptime:** Ghost Scout runs every 6h without failure
- **Alerts:** Agents receive timely value-drop and contract alerts
- **Accuracy:** No duplicate alerts for same event
- **Latency:** Alert within 6h of change (or faster if we add more frequent runs for high-priority list)

---

*Document created for MGSR Team Ghost Scout implementation. Update as implementation progresses.*
