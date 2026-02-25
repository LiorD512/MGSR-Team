# Predictive Club Needs — Implementation Plan

> **Vision:** "These 8 clubs will need a striker in 6 months" — predict which clubs will be in the market before they post a request, so you can build relationships and prepare players ahead of time.

---

## 1. What We're Predicting

| Output | Example |
|--------|---------|
| **Club** | Maccabi Haifa |
| **Position needed** | CF (striker) |
| **Urgency** | High / Medium / Low |
| **Time horizon** | Next 6 months |
| **Why** | "2 of 3 strikers' contracts expire in June; 1 is on loan" |

---

## 2. Data Foundation — What Exactly We Use

### 2.1 Data Source: Transfermarkt Squad Page

**URL format:**
```
https://www.transfermarkt.com/{club-slug}/kader/verein/{club-id}/saison_id/{year}
```

**Example:** `https://www.transfermarkt.com/maccabi-haifa-fc/kader/verein/859/saison_id/2025`

**What we scrape from the squad page:**

| Field | Purpose |
|-------|---------|
| **Position** | CF, SS, LW, RW, etc. — to count strikers, midfielders, etc. |
| **Player name** | For context in "why" explanation |
| **Age** | Aging squad → renewal need |
| **Contract expiry** | "Jun 30, 2025" — main signal for need |
| **Market value** | Star player → might be sold |
| **On loan** | Key player on loan → need replacement when he returns |

**Transfermarkt squad page structure (typical):**
- Table rows: `table.items tr.odd`, `table.items tr.even`
- Position: in `inline-table` or `td` text
- Contract: column with date like "Jun 30, 2025" or "-"
- Loan: ribbon/badge "On loan" or similar

### 2.2 Club List — Where We Get Clubs to Analyze

| Source | Collection | Field | Notes |
|--------|------------|-------|------|
| **Contacts** | `Contacts` | `clubTmProfile` | Clubs we have relationships with. Filter: `contactType == CLUB` |
| **Club Requests** | `ClubRequests` | `clubTmProfile` | Clubs that have made requests — we know they're active |
| **Watch list** | `PredictiveClubWatchList` (new) | `clubTmProfile` | User adds clubs to monitor (e.g. Ligat Ha'Al, target leagues) |

**Recommendation:** Start with **Contacts + ClubRequests**. Add Watch list in Phase 2.

---

## 3. Prediction Signals — The "Why"

### 3.1 Position Mapping

Group positions into "striker", "midfielder", "defender", "goalkeeper":

```javascript
const STRIKER_POSITIONS = ['CF', 'SS', 'ST', 'LW', 'RW'];  // LW/RW can play striker
const MIDFIELDER_POSITIONS = ['CM', 'DM', 'AM', 'LM', 'RM'];
const DEFENDER_POSITIONS = ['CB', 'LB', 'RB'];
const GK_POSITIONS = ['GK'];
```

### 3.2 Signals That Indicate "Will Need Position X in 6 Months"

| Signal | Weight | Description | Example |
|--------|--------|-------------|---------|
| **Contract expiry** | High | Players in position X have contract ending in next 6 months | 2 strikers expire Jun 2025 |
| **Squad depth** | High | Only 1 player in position X | Only 1 CF in squad |
| **All aging** | Medium | All players in position X are 30+ | All 3 strikers are 31, 32, 33 |
| **Loan return** | High | Key player in position X is on loan (returns to parent) | Main striker on loan from parent club |
| **Single point of failure** | Medium | 1 star player, no backup | 1 high-value CF, rest are youth |

### 3.3 Scoring Algorithm (Per Club, Per Position)

```
NeedScore(position) = 
  w1 * contractExpiryScore +   // 0–40 pts: how many expire in 6 months
  w2 * depthScore +             // 0–30 pts: 1 player = 30, 2 = 15, 3+ = 0
  w3 * ageScore +              // 0–20 pts: avg age 30+ = 20, 28 = 10, 25 = 0
  w4 * loanScore               // 0–10 pts: key player on loan = 10
```

**Urgency bands:**
- **High:** Score ≥ 60 — "Act now, build relationship"
- **Medium:** Score 30–59 — "Monitor, prepare shortlist"
- **Low:** Score 10–29 — "Awareness only"

---

## 4. Technical Implementation

### 4.1 New Backend Endpoint: Club Squad

**File:** `mgsr-backend/server.js`

**Endpoint:** `GET /api/transfermarkt/club-squad?url=...`

**Input:** `url` = Transfermarkt club profile URL (e.g. `https://www.transfermarkt.com/maccabi-haifa-fc/startseite/verein/859`)

**Logic:**
1. Parse URL to get club slug and id (e.g. `maccabi-haifa-fc`, `859`)
2. Build kader URL: `https://www.transfermarkt.com/maccabi-haifa-fc/kader/verein/859/saison_id/2025`
3. Fetch HTML, parse with Cheerio
4. Extract per-row: position, age, contract expiry, market value, on loan
5. Return structured JSON

**Output:**
```json
{
  "clubName": "Maccabi Haifa",
  "clubTmProfile": "https://...",
  "season": "2025",
  "players": [
    {
      "name": "Player A",
      "position": "CF",
      "age": 28,
      "contractExpires": "2025-06-30",
      "marketValue": "€2.5m",
      "isOnLoan": false
    }
  ],
  "byPosition": {
    "CF": [...],
    "SS": [...],
    "LW": [...]
  }
}
```

**Contract expiry parsing:** Transfermarkt shows "Jun 30, 2025" or "-" (no contract) or "?" (unknown). Parse to `YYYY-MM-DD` or null.

### 4.2 Prediction Logic (Node.js or Cloud Function)

**File:** `mgsr-backend/server.js` or `functions/predictiveClubNeeds.js`

**Function:** `computeNeedScore(players, position)`

```javascript
function computeNeedScore(players, position) {
  const posPlayers = players.filter(p => STRIKER_POSITIONS.includes(p.position));
  if (posPlayers.length === 0) return { score: 0, reasons: [] };

  const now = new Date();
  const sixMonthsFromNow = new Date(now);
  sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);

  let contractScore = 0;
  const expiring = posPlayers.filter(p => {
    const exp = parseContractDate(p.contractExpires);
    return exp && exp <= sixMonthsFromNow && exp >= now;
  });
  if (expiring.length >= 2) contractScore = 40;
  else if (expiring.length === 1) contractScore = 25;
  else if (expiring.length === 0 && posPlayers.some(p => !p.contractExpires || p.contractExpires === '-'))
    contractScore = 15; // Unknown contract = risk

  let depthScore = 0;
  if (posPlayers.length === 1) depthScore = 30;
  else if (posPlayers.length === 2) depthScore = 15;

  let ageScore = 0;
  const avgAge = posPlayers.reduce((s, p) => s + (p.age || 0), 0) / posPlayers.filter(p => p.age).length;
  if (avgAge >= 30) ageScore = 20;
  else if (avgAge >= 28) ageScore = 10;

  let loanScore = 0;
  if (posPlayers.some(p => p.isOnLoan)) loanScore = 10;

  const score = contractScore + depthScore + ageScore + loanScore;
  const reasons = [];
  if (expiring.length > 0) reasons.push(`${expiring.length} striker(s) contract expires in 6 months`);
  if (posPlayers.length === 1) reasons.push('Only 1 striker in squad');
  if (avgAge >= 30) reasons.push('All strikers 30+');
  if (posPlayers.some(p => p.isOnLoan)) reasons.push('Key striker on loan');

  return { score, reasons, expiringCount: expiring.length };
}
```

### 4.3 API Endpoint: Get Predictive Needs

**Endpoint:** `GET /api/predictive-club-needs?positions=CF,SS&minScore=30`

**Flow:**
1. Get club URLs from Firestore (Contacts + ClubRequests) — or pass as param for MVP
2. For each club (with 15s delay — Transfermarkt anti-blocking):
   - Call `/api/transfermarkt/club-squad?url=...`
   - For each position (CF, SS, etc.), compute `computeNeedScore`
   - If score ≥ minScore, add to results
3. Sort by score descending
4. Return list

**Output:**
```json
{
  "predictions": [
    {
      "clubTmProfile": "https://...",
      "clubName": "Maccabi Haifa",
      "clubLogo": "...",
      "position": "CF",
      "score": 75,
      "urgency": "high",
      "reasons": [
        "2 striker(s) contract expires in 6 months",
        "Only 1 permanent striker in squad"
      ],
      "expiringPlayers": ["Player A", "Player B"],
      "lastUpdated": 1730000000000
    }
  ]
}
```

---

## 5. Where This Runs

### Option A: On-Demand (Web/App Request)

- User opens "Predictive Club Needs" screen
- Frontend calls `GET /api/predictive-club-needs`
- mgsr-backend fetches club list from Firestore (needs Firebase Admin in backend) OR frontend passes club URLs
- Backend fetches each squad, computes, returns

**Pros:** Simple, no new infra  
**Cons:** Slow (many clubs × 15s delay), user waits

### Option B: Scheduled Job + Cache (Recommended)

- **Firebase Cloud Function** runs weekly (e.g. Sunday 2 AM Israel time)
- Fetches club URLs from Firestore (Contacts + ClubRequests)
- Calls mgsr-backend for each club (or batches)
- Writes results to Firestore `PredictiveClubNeeds` collection
- Web/App reads from Firestore — instant

**Pros:** Fast UX, runs in background  
**Cons:** Data can be up to 7 days old

### Option C: Hybrid

- Scheduled job populates cache
- On-demand "Refresh" button for user to trigger re-run (optional)

---

## 6. Firestore Schema

### 6.1 PredictiveClubNeeds (Cache)

```
PredictiveClubNeeds/{docId}
  - lastRunAt: number (timestamp)
  - predictions: array of {
      clubTmProfile: string,
      clubName: string,
      clubLogo: string,
      position: string,
      score: number,
      urgency: "high" | "medium" | "low",
      reasons: string[],
      expiringPlayers: string[],
      expiringCount: number
    }
  - totalClubsAnalyzed: number
  - clubsSkipped: number (e.g. no squad data)
```

**Alternative:** One doc per club for finer granularity:
```
PredictiveClubNeeds/{clubId}
  - clubTmProfile: string
  - clubName: string
  - lastAnalyzedAt: number
  - needs: [{ position, score, urgency, reasons, expiringPlayers }]
```

### 6.2 PredictiveClubWatchList (Optional, Phase 2)

```
PredictiveClubWatchList/team
  - clubUrls: string[]  // Transfermarkt club URLs to monitor
  - addedBy: string
  - addedAt: number
```

---

## 7. Implementation Phases

### Phase 1: Backend + On-Demand (2–3 weeks)

| Step | Task | Effort |
|------|------|--------|
| 1.1 | Add `GET /api/transfermarkt/club-squad?url=...` to mgsr-backend | 2–3 days |
| 1.2 | Implement squad page parsing (position, age, contract, loan) | 2 days |
| 1.3 | Add `computeNeedScore` and position grouping | 1 day |
| 1.4 | Add `GET /api/predictive-club-needs` — accepts `clubUrls` as JSON body or query | 1 day |
| 1.5 | Web: New page "Predictive Club Needs" — fetch clubs from Contacts+ClubRequests, call API, display table | 2 days |

**MVP:** User sees "Clubs that will need a striker" for their contacts + request clubs. On-demand, may take 2–5 min for 20 clubs.

### Phase 2: Scheduled + Cache (1–2 weeks)

| Step | Task | Effort |
|------|------|--------|
| 2.1 | Firebase Cloud Function `predictiveClubNeedsScheduled` — weekly | 1 day |
| 2.2 | Function: get club URLs from Firestore, call backend (or inline logic), write to `PredictiveClubNeeds` | 2 days |
| 2.3 | Web/App: Read from Firestore, show cached results + "Last updated X ago" | 0.5 day |
| 2.4 | Optional: "Refresh" button to trigger one-time run | 0.5 day |

### Phase 3: Watch List + Polish (1 week)

| Step | Task | Effort |
|------|------|--------|
| 3.1 | Add "Watch list" — user adds clubs (e.g. Ligat Ha'Al clubs) to monitor | 1 day |
| 3.2 | Include watch list in scheduled run | 0.5 day |
| 3.3 | Filter by position (CF only, or all), urgency | 0.5 day |
| 3.4 | Link to Contact or Request when club matches | 0.5 day |

---

## 8. Transfermarkt Squad Page Parsing (Detail)

**URL derivation:**
- Input: `https://www.transfermarkt.com/maccabi-haifa-fc/startseite/verein/859`
- Kader: Replace `startseite` with `kader`, append `/saison_id/2025` if needed
- Or: Extract `/verein/(\d+)/` and slug, build `/{slug}/kader/verein/{id}/saison_id/2025`

**HTML structure (typical):**
- Main table: `table.items` or `div.responsive-table table`
- Rows: `tbody tr` or `tr.odd`, `tr.even`
- Player link: `a[href*="/profil/spieler/"]` or `a[href*="/profile/player/"]`
- Position: often in `table.inline-table tr:nth-child(2)` or `td` with position text
- Contract: column with date format "Jun 30, 2025" or "30.06.2025"
- Loan: `span` or `div` with "On loan" / "Leihe" text

**Fallback:** If squad page structure differs, use Transfermarkt's "Detailed" view URL with `plus=1` parameter for more columns.

---

## 9. Limitations & Caveats

| Limitation | Mitigation |
|------------|------------|
| **Transfermarkt blocking** | 15s delay between club requests. 20 clubs ≈ 5 min. |
| **Squad page structure changes** | Monitor; add fallback selectors. |
| **Contract format varies** | Support multiple date formats (Jun 30 2025, 30.06.25, etc.). |
| **Loan detection** | Look for "on loan", "Leihe", ribbon/badge. |
| **Position mapping** | Transfermarkt uses "Centre Forward", "Second Striker" — map to CF, SS. |
| **No FBref/playing time** | We don't predict "underperforming" — only contract/depth/age/loan. |

---

## 10. Success Metrics

- **Accuracy:** Spot-check 5 clubs — do our "need striker" predictions match reality?
- **Actionability:** Do agents use the list to reach out? (Qualitative)
- **Coverage:** How many clubs can we analyze? (Contacts + Requests count)
- **Freshness:** Cache updated weekly; "Last run" visible to user.

---

## 11. File Changes Summary

| File | Change |
|------|--------|
| `mgsr-backend/server.js` | Add `GET /api/transfermarkt/club-squad`, `GET /api/predictive-club-needs` |
| `mgsr-web/src/app/predictive-needs/page.tsx` | **New** — Predictive Club Needs page |
| `functions/predictiveClubNeeds.js` | **New** — Scheduled function (Phase 2) |
| `app/.../PredictiveNeedsScreen.kt` | **New** — Android screen (optional) |
| `mgsr-web/src/components/AppLayout.tsx` | Add nav item "Predictive Needs" |

---

*Document created for MGSR Team Predictive Club Needs. Update as implementation progresses.*
