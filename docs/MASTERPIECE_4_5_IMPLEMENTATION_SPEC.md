# Masterpiece Features 4 & 5 — Detailed Implementation Specification

> **English.** Precise technical specification for Living Player Dossier and Multi-Agent Scouting War Room.

---

## Table of Contents

1. [Feature 4: Living Player Dossier](#feature-4-living-player-dossier)
2. [Feature 5: Multi-Agent Scouting War Room](#feature-5-multi-agent-scouting-war-room)

---

# Feature 4: Living Player Dossier — "Always Up to Date"

## Overview

A continuously updated AI-generated intelligence document per player. Data is fetched from multiple sources, stored in Firestore, and synthesized by Gemini into a narrative summary. Refreshed on a schedule (daily for roster, weekly for shortlist).

---

## 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    LIVING DOSSIER ARCHITECTURE                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Firebase Cloud Function (scheduled daily 04:00 Israel)                           │
│       │                                                                          │
│       ├── 1. Get watch list: Players (roster) + Shortlists/team entries          │
│       │                                                                          │
│       ├── 2. For each player (with 15s delay between TM requests):                │
│       │      ├── mgsr-backend: GET /api/transfermarkt/player?url=...             │
│       │      ├── football-scout-server: GET /player_context?player_url=... (NEW) │
│       │      └── NewsAPI: GET /v2/everything?q="Player Name"&...                  │
│       │                                                                          │
│       ├── 3. Compare with previous LivingDossiers/{docId} snapshot               │
│       │      → Detect changes (value, club, contract, stats delta)              │
│       │                                                                          │
│       ├── 4. Call Gemini: synthesize rawChanges + news → summary + highlights   │
│       │                                                                          │
│       └── 5. Write LivingDossiers/{playerDocId} or LivingDossiers/{tmUrlHash}    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4.2 Tools & Technologies

| Component | Tool | Purpose |
|-----------|------|---------|
| **Scheduler** | Firebase Cloud Functions v2 `onSchedule` | Run daily at 04:00 Israel time |
| **Database** | Firestore | Store `LivingDossiers`, read `Players`, `Shortlists` |
| **Transfermarkt data** | mgsr-backend `GET /api/transfermarkt/player?url=...` | Fresh player profile (value, club, contract) |
| **FBref / stats** | football-scout-server **NEW** `GET /player_context?player_url=...` | Per-90 stats, playing style (if exists) |
| **News** | NewsAPI `GET /v2/everything` | News articles mentioning player name |
| **AI synthesis** | Google Gemini 2.5 Flash | Summarize changes into narrative |
| **Web UI** | Next.js, React | Display dossier on player page |

---

## 4.3 Data Sources — Precision & Limitations

### 4.3.1 Transfermarkt (via mgsr-backend)

| Field | Precision | Source | Notes |
|-------|-----------|--------|-------|
| `marketValue` | Exact string (e.g. "€1.5m") | TM HTML scrape | Updated when TM updates; scrape is point-in-time |
| `currentClub.clubName` | Exact | TM | Club change = high-signal event |
| `contractExpires` | Exact string | TM | e.g. "Jun 30, 2026" |
| `fullName`, `age`, `positions` | Exact | TM | Rarely change |
| **Refresh rate** | N/A | Scrape on each run | 15s delay between requests (anti-blocking) |

**Limitation:** TM does not expose historical value; we infer "value dropped" by comparing current scrape vs. previous dossier snapshot.

### 4.3.2 Football Scout Server — New Endpoint

**Endpoint to add:** `GET /player_context?player_url=...&lang=en`

**Returns (JSON):**
```json
{
  "player_url": "https://...",
  "name": "Player X",
  "age": 24,
  "position": "Centre-Forward",
  "club": "Club Y",
  "league": "Ligat Ha'Al",
  "market_value": "€500k",
  "fbref": {
    "goals_per_90": 0.45,
    "assists_per_90": 0.12,
    "minutes": 1200,
    "enriched": true
  },
  "playing_style": "Target man",
  "similar_players_count": 5
}
```

**Precision:**
- FBref stats: per-90 from last 365 days (or season); `enriched: false` when no FBref match
- Playing style: inferred from stats or null
- **Coverage:** ~17k players in DB; FBref enrichment only for top leagues (see SCOUT_IMPROVEMENT_ROADMAP)

### 4.3.3 NewsAPI

**Endpoint:** `GET https://newsapi.org/v2/everything`

**Parameters:**
- `q`: `"Player Full Name"` (quoted for exact phrase) or `"Player Name" football transfer"`
- `language`: `en` (or `he` for Hebrew news if available)
- `sortBy`: `publishedAt`
- `pageSize`: 5
- `from`: 7 days ago (ISO date)
- `apiKey`: from env

**Precision:**
- **Relevance:** Variable. Many players share names; we filter by checking if article body contains club name or "football"/"soccer"
- **False positives:** Possible (e.g. "John Smith" — many matches). Mitigation: prefer `q="First Last"` exact, add `football OR soccer` for broader search
- **Rate limit:** Free tier = 100 requests/day. With 50 roster + 20 shortlist = 70 players → 70 requests. Fits if we batch or cache
- **Alternative:** Google News RSS via `https://news.google.com/rss/search?q=...` — free, no key, but HTML parsing required

**Recommendation:** Start with NewsAPI free tier (100/day). If roster > 50, run every 2 days or prioritize roster over shortlist.

---

## 4.4 Firestore Schema

### Collection: `LivingDossiers`

**Document ID:** `{playerDocId}` (Firebase Players doc ID) OR `{hash(tmProfileUrl)}` for shortlist-only players

```typescript
interface LivingDossier {
  // Identity
  playerDocId: string | null;      // null if shortlist-only
  tmProfileUrl: string;
  fullName: string;

  // Snapshot (for change detection)
  lastSnapshot: {
    marketValue: string;
    clubName: string;
    contractExpires: string;
    fbrefGoalsPer90?: number;
    fbrefMinutes?: number;
    fetchedAt: number;
  };

  // Raw changes (for Gemini input)
  rawChanges: Array<{
    type: 'VALUE_CHANGE' | 'CLUB_CHANGE' | 'CONTRACT_CHANGE' | 'STATS_UPDATE' | 'NEWS';
    oldValue?: string | number;
    newValue?: string | number;
    detail?: string;
    source?: string;
    timestamp: number;
  }>;

  // News snippets (from NewsAPI)
  newsItems: Array<{
    title: string;
    description: string;
    url: string;
    publishedAt: string;
    source: string;
  }>;

  // AI output
  summary: string;                 // 2-4 sentence narrative
  highlights: string[];            // Bullet points, max 5
  lastUpdated: number;
  lastSynthesisAt: number;

  // Metadata
  source: 'roster' | 'shortlist';
}
```

---

## 4.5 Cloud Function — Exact Logic

### File: `functions/livingDossier.js`

```javascript
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

initializeApp();
const db = getFirestore();

const MGSR_BACKEND_URL = process.env.MGSR_BACKEND_URL;
const SCOUT_SERVER_URL = process.env.SCOUT_SERVER_URL || "https://football-scout-server-l38w.onrender.com";
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const DELAY_MS = 15000; // 15s between TM requests

async function getWatchList(db) {
  const urls = new Map(); // tmUrl -> { playerDocId, fullName, source }
  const playersSnap = await db.collection("Players").get();
  playersSnap.docs.forEach((doc) => {
    const d = doc.data();
    const url = d.tmProfile;
    if (url) urls.set(url, { playerDocId: doc.id, fullName: d.fullName || "", source: "roster" });
  });
  const shortlistSnap = await db.collection("Shortlists").doc("team").get();
  const entries = shortlistSnap.data()?.entries || [];
  entries.forEach((e) => {
    const url = e.tmProfileUrl || e.tmProfile;
    if (url && !urls.has(url)) urls.set(url, { playerDocId: null, fullName: e.fullName || "", source: "shortlist" });
  });
  return urls;
}

async function fetchTmPlayer(url) {
  const res = await fetch(`${MGSR_BACKEND_URL}/api/transfermarkt/player?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`TM ${res.status}`);
  return res.json();
}

async function fetchScoutContext(url) {
  try {
    const res = await fetch(`${SCOUT_SERVER_URL}/player_context?player_url=${encodeURIComponent(url)}&lang=en`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchNews(playerName) {
  if (!NEWS_API_KEY) return [];
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const q = encodeURIComponent(`"${playerName}" football`);
  const url = `https://newsapi.org/v2/everything?q=${q}&from=${from}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${NEWS_API_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return (data.articles || []).map((a) => ({
      title: a.title,
      description: a.description || "",
      url: a.url,
      publishedAt: a.publishedAt,
      source: a.source?.name || "",
    }));
  } catch {
    return [];
  }
}

function detectChanges(prev, curr, scout) {
  const changes = [];
  if (prev.marketValue !== curr.marketValue)
    changes.push({ type: "VALUE_CHANGE", oldValue: prev.marketValue, newValue: curr.marketValue, timestamp: Date.now() });
  if (prev.clubName !== curr.currentClub?.clubName)
    changes.push({ type: "CLUB_CHANGE", oldValue: prev.clubName, newValue: curr.currentClub?.clubName || "", timestamp: Date.now() });
  if (prev.contractExpires !== curr.contractExpires)
    changes.push({ type: "CONTRACT_CHANGE", oldValue: prev.contractExpires, newValue: curr.contractExpires || "", timestamp: Date.now() });
  if (scout?.fbref?.enriched && prev.fbrefGoalsPer90 !== scout.fbref?.goals_per_90)
    changes.push({ type: "STATS_UPDATE", detail: `Goals/90: ${prev.fbrefGoalsPer90 ?? "?"} → ${scout.fbref?.goals_per_90}`, timestamp: Date.now() });
  return changes;
}

async function synthesizeWithGemini(fullName, rawChanges, newsItems, lang) {
  if (!GEMINI_API_KEY) return { summary: "", highlights: [] };
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const changesText = rawChanges.length
    ? rawChanges.map((c) => `- ${c.type}: ${c.oldValue ?? ""} → ${c.newValue ?? ""} ${c.detail ?? ""}`).join("\n")
    : "No data changes in the last 7 days.";
  const newsText = newsItems.length
    ? newsItems.map((n) => `- ${n.title} (${n.source}, ${n.publishedAt})`).join("\n")
    : "No recent news found.";
  const prompt = `You are a football scout assistant. Summarize the following updates for ${fullName} into a brief intelligence update.

DATA CHANGES (last 7 days):
${changesText}

RECENT NEWS:
${newsText}

Output a JSON object with:
- "summary": 2-4 sentence narrative in ${lang === "he" ? "Hebrew" : "English"}
- "highlights": array of up to 5 bullet points (strings)`;
  const result = await model.generateContent(prompt);
  const text = result.response.text()?.trim() || "{}";
  const json = JSON.parse(text.replace(/```json?|```/g, "").trim());
  return { summary: json.summary || "", highlights: json.highlights || [] };
}

exports.livingDossierScheduled = onSchedule(
  { schedule: "0 4 * * *", timeZone: "Asia/Jerusalem" },
  async () => {
    const watchList = await getWatchList(db);
    const dossierRef = db.collection("LivingDossiers");

    for (const [tmUrl, meta] of watchList) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
      try {
        const [tmData, scoutData, newsData] = await Promise.all([
          fetchTmPlayer(tmUrl),
          fetchScoutContext(tmUrl),
          fetchNews(meta.fullName || tmData?.fullName || "Player"),
        ]);

        const docId = meta.playerDocId || `tm_${Buffer.from(tmUrl).toString("base64url").slice(0, 32)}`;
        const prevSnap = await dossierRef.doc(docId).get();
        const prev = prevSnap.data()?.lastSnapshot || {};

        const curr = {
          marketValue: tmData.marketValue,
          clubName: tmData.currentClub?.clubName || "",
          contractExpires: tmData.contractExpires || "",
          fbrefGoalsPer90: scoutData?.fbref?.goals_per_90,
          fbrefMinutes: scoutData?.fbref?.minutes,
          fetchedAt: Date.now(),
        };

        const rawChanges = detectChanges(prev, tmData, scoutData);
        if (newsData.length) rawChanges.push(...newsData.map((n) => ({ type: "NEWS", detail: n.title, source: n.source, timestamp: Date.now() })));

        const { summary, highlights } = await synthesizeWithGemini(
          meta.fullName || tmData.fullName || "Player",
          rawChanges,
          newsData,
          "en"
        );

        await dossierRef.doc(docId).set({
          playerDocId: meta.playerDocId,
          tmProfileUrl: tmUrl,
          fullName: meta.fullName || tmData.fullName,
          lastSnapshot: curr,
          rawChanges: rawChanges.slice(-20),
          newsItems: newsData,
          summary,
          highlights,
          lastUpdated: Date.now(),
          lastSynthesisAt: Date.now(),
          source: meta.source,
        });
      } catch (err) {
        console.error(`Living Dossier failed for ${tmUrl}:`, err.message);
      }
    }
  }
);
```

---

## 4.6 Football Scout Server — New Endpoint

**File:** `football-scout-server` (Python FastAPI)

**Endpoint:** `GET /player_context?player_url=...&lang=en`

**Logic:**
1. Look up player in DB by `tm_profile_url` or similar
2. If found, return: name, age, position, club, league, market_value, fbref stats (if enriched), playing_style
3. If not found, return 404 or minimal object

**Precision:** Depends on DB coverage. FBref enrichment is partial (see SCOUT_IMPROVEMENT_ROADMAP). When `enriched: false`, omit fbref fields.

---

## 4.7 Web UI

**Location:** `mgsr-web/src/app/players/[id]/page.tsx` — add "Living Dossier" tab/section

**Data fetch:** `doc(db, 'LivingDossiers', playerId)` — real-time listener or one-time fetch

**UI components:**
- **Summary card:** `dossier.summary`
- **Highlights:** `dossier.highlights` as bullet list
- **Timeline:** `dossier.rawChanges` grouped by date
- **Last updated:** `dossier.lastUpdated` (relative time)
- **News links:** `dossier.newsItems` with title, source, link

**Fallback:** If no dossier exists, show "Dossier will be updated daily. Check back tomorrow."

---

## 4.8 Precision Summary

| Aspect | Precision | Notes |
|--------|-----------|-------|
| **Value change detection** | High | Exact string compare; TM is source of truth |
| **Club change** | High | Exact |
| **Contract change** | High | Exact |
| **Stats delta** | Medium | Only when FBref enriched; ~top leagues |
| **News relevance** | Low–Medium | Name collision possible; filter by "football" |
| **Summary quality** | High | Gemini 2.5 Flash; grounded in data |

---

## 4.9 Cost & Limits

| Resource | Estimate |
|----------|----------|
| **Cloud Function** | 1 run/day × ~70 players × ~60s avg = ~70 min compute |
| **mgsr-backend** | 70 HTTP requests (TM scrape) |
| **Scout server** | 70 HTTP requests |
| **NewsAPI** | 70 requests (free tier 100/day) |
| **Gemini** | 70 × ~500 tokens output ≈ 35k tokens ≈ $0.01–0.02 |

---

# Feature 5: Multi-Agent Scouting War Room — "Collaborative AI Brain"

## Overview

Multiple specialized AI agents (Stats, Market, Tactics, Synthesis) work in parallel. Each agent receives structured data and produces a focused analysis. The Synthesis agent combines them into a unified War Room report.

---

## 5.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    WAR ROOM ARCHITECTURE                                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  User: Player URL + optional target context (club, formation)                     │
│       │                                                                          │
│       ▼                                                                          │
│  Next.js API: POST /api/war-room/report                                           │
│       │                                                                          │
│       ├── 1. Fetch data in parallel (single round):                             │
│       │      ├── football-scout-server: /similar_players?player_url=...         │
│       │      ├── football-scout-server: /recruitment (if target context)          │
│       │      ├── mgsr-backend: /api/transfermarkt/player?url=...                  │
│       │      └── football-scout-server: /player_context or /fm-intelligence       │
│       │                                                                          │
│       ├── 2. Invoke 3 agents in parallel (3 Gemini calls):                       │
│       │      ├── Stats Agent:  statsContext → statsAnalysis                       │
│       │      ├── Market Agent: marketContext → marketAnalysis                     │
│       │      └── Tactics Agent: tacticsContext → tacticsAnalysis                  │
│       │                                                                          │
│       ├── 3. Invoke Synthesis Agent (1 Gemini call):                             │
│       │      Input: statsAnalysis + marketAnalysis + tacticsAnalysis              │
│       │      Output: unified report + recommendation                              │
│       │                                                                          │
│       └── 4. Return { stats, market, tactics, synthesis, recommendation }         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5.2 Tools & Technologies

| Component | Tool | Purpose |
|-----------|------|---------|
| **Orchestrator** | Next.js API Route `POST /api/war-room/report` | Coordinate data fetch + agent calls |
| **Data sources** | football-scout-server, mgsr-backend | Player stats, similar players, TM profile |
| **AI agents** | Google Gemini 2.5 Flash (4 calls total) | Stats, Market, Tactics, Synthesis |
| **Web UI** | Next.js, React | Display report with expandable sections |

---

## 5.3 Agent Definitions — Exact Prompts & Inputs

### 5.3.1 Stats Agent

**Input (structured):**
- Player: name, age, position, club, league
- FBref per-90: goals, assists, shots, dribbles, tackles, pressures, etc. (from scout server)
- Percentiles (if available from similar_players response)
- FM data (CA, PA, dimensions) if available

**Prompt (template):**
```
You are the STATS AGENT in a scouting war room. Your job is to analyze the player's statistical profile.

PLAYER: {name}, {age}, {position}
CLUB: {club}, {league}
STATS (per 90): {fbref_stats}
FM: CA {ca}, PA {pa} (if available)

Output a JSON object:
{
  "strengths": ["strength1", "strength2", "strength3"],
  "weaknesses": ["weakness1", "weakness2"],
  "key_metrics": ["metric1: value", "metric2: value"],
  "summary": "2-3 sentence statistical profile"
}

Base analysis ONLY on the data provided. Never invent stats.
```

**Output precision:** High — grounded in numbers. No hallucination if data is provided.

---

### 5.3.2 Market Agent

**Input:**
- TM: market value, contract expiry, club, nationality
- Similar players: their values, clubs, leagues
- Value history (if in player doc)

**Prompt:**
```
You are the MARKET AGENT in a scouting war room. Analyze the player's market positioning.

PLAYER: {name}, {age}, {position}
MARKET VALUE: {marketValue}
CONTRACT: {contractExpires}
CLUB: {club}
SIMILAR PLAYERS (for context): {similarPlayersSummary}

Output a JSON object:
{
  "market_position": "undervalued | fair | overvalued",
  "rationale": "1-2 sentences",
  "comparable_range": "€X–€Y based on similar players",
  "contract_leverage": "high | medium | low",
  "summary": "2-3 sentence market analysis"
}
```

**Output precision:** Medium–High. "Undervalued/fair/overvalued" is subjective but informed by comparables.

---

### 5.3.3 Tactics Agent

**Input:**
- Player: position, height, foot, playing style (from scout)
- Target context (optional): club name, formation (e.g. 4-3-3)
- League: Ligat Ha'Al or other

**Prompt:**
```
You are the TACTICS AGENT in a scouting war room. Analyze tactical fit.

PLAYER: {name}, {position}, {height}, {foot}, playing style: {playingStyle}
TARGET: {targetClub or "general"} — formation {formation or "any"}
LEAGUE FOCUS: Ligat Ha'Al (Israeli Premier League)

Output a JSON object:
{
  "best_role": "e.g. lone striker in 4-3-3",
  "best_system": "e.g. counter-attacking, high press",
  "ligat_haal_fit": "START | ROTATION | SQUAD | BENEATH",
  "club_fit": ["Maccabi Haifa: ...", "Maccabi TA: ..."] (if target is general),
  "summary": "2-3 sentence tactical analysis"
}

Base on profile only. No invented stats.
```

**Output precision:** Medium. Tactical fit is interpretive; we constrain with "profile only."

---

### 5.3.4 Synthesis Agent

**Input:**
- statsAnalysis (full JSON)
- marketAnalysis (full JSON)
- tacticsAnalysis (full JSON)

**Prompt:**
```
You are the SYNTHESIS AGENT. Combine the following three specialist reports into one unified War Room report.

STATS AGENT:
{statsAnalysis}

MARKET AGENT:
{marketAnalysis}

TACTICS AGENT:
{tacticsAnalysis}

Output a JSON object:
{
  "executive_summary": "3-4 sentence overview",
  "recommendation": "SIGN | MONITOR | PASS",
  "recommendation_rationale": "1-2 sentences",
  "key_risks": ["risk1", "risk2"],
  "key_opportunities": ["opp1", "opp2"]
}

Write in {lang}. Be decisive. Reconcile any contradictions between agents.
```

**Output precision:** High — synthesizes existing analyses, no new facts.

---

## 5.4 API Route — Exact Implementation

### File: `mgsr-web/src/app/api/war-room/report/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MGSR_BACKEND = process.env.MGSR_BACKEND_URL || 'http://localhost:8080';
const SCOUT_BASE = process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const playerUrl = (body.player_url || body.playerUrl || '').trim();
  const targetClub = body.target_club || body.targetClub || '';
  const formation = body.formation || '';
  const lang = body.lang === 'he' ? 'he' : 'en';

  if (!playerUrl) return NextResponse.json({ error: 'player_url required' }, { status: 400 });

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // 1. Fetch all data in parallel
  const [tmData, similarData, fmData] = await Promise.all([
    fetchJson<Record<string, unknown>>(`${MGSR_BACKEND}/api/transfermarkt/player?url=${encodeURIComponent(playerUrl)}`),
    fetchJson<{ results?: Record<string, unknown>[] }>(`${SCOUT_BASE}/similar_players?player_url=${encodeURIComponent(playerUrl)}&lang=${lang}&limit=5`),
    fetchJson<Record<string, unknown>>(`${SCOUT_BASE}/fm-intelligence?player_name=${encodeURIComponent((tmData?.fullName as string) || '')}`),
  ]);

  const name = (tmData?.fullName as string) || 'Player';
  const age = (tmData?.age as string) || '';
  const position = ((tmData?.positions as string[]) || [])[0] || '';
  const club = (tmData?.currentClub as { clubName?: string })?.clubName || '';
  const league = (tmData?.currentClub as { clubCountry?: string })?.clubCountry || '';
  const marketValue = (tmData?.marketValue as string) || '';
  const contractExpires = (tmData?.contractExpires as string) || '';
  const height = (tmData?.height as string) || '';
  const foot = (tmData?.foot as string) || '';

  const similarSummary = (similarData?.results || [])
    .slice(0, 5)
    .map((p) => `${p.name} (${p.market_value}, ${p.club})`)
    .join('; ');

  const fbrefStats = similarData?.results?.[0] as Record<string, unknown> | undefined;
  const statsContext = `Goals/90: ${fbrefStats?.fbref_goals ?? '?'}, Assists/90: ${fbrefStats?.fbref_assists ?? '?'}, etc.`;
  const fmContext = fmData ? `CA: ${fmData.ca}, PA: ${fmData.pa}` : 'N/A';

  // 2. Invoke 3 agents in parallel
  const [statsRes, marketRes, tacticsRes] = await Promise.all([
    model.generateContent(`Stats Agent prompt with: ${name}, ${age}, ${position}, ${statsContext}, ${fmContext}`),
    model.generateContent(`Market Agent prompt with: ${name}, ${marketValue}, ${contractExpires}, ${club}, ${similarSummary}`),
    model.generateContent(`Tactics Agent prompt with: ${name}, ${position}, ${height}, ${foot}, ${targetClub || 'general'}, ${formation || 'any'}`),
  ]);

  const statsAnalysis = statsRes.response.text()?.trim() || '{}';
  const marketAnalysis = marketRes.response.text()?.trim() || '{}';
  const tacticsAnalysis = tacticsRes.response.text()?.trim() || '{}';

  // 3. Synthesis agent
  const synthesisPrompt = `Synthesis Agent prompt with stats, market, tactics JSON... lang=${lang}`;
  const synthesisRes = await model.generateContent(synthesisPrompt);
  const synthesisText = synthesisRes.response.text()?.trim() || '{}';

  return NextResponse.json({
    stats: parseJson(statsAnalysis),
    market: parseJson(marketAnalysis),
    tactics: parseJson(tacticsAnalysis),
    synthesis: parseJson(synthesisText),
  });
}

function parseJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s.replace(/```json?|```/g, '').trim());
  } catch {
    return { raw: s };
  }
}
```

*(Above is a skeleton; full prompts would be inlined per agent.)*

---

## 5.5 Web UI

**Location:** New page `mgsr-web/src/app/war-room/page.tsx` or tab in AI Scout / player detail

**Flow:**
1. Input: player URL (or select from roster) + optional target club/formation
2. Button: "Generate War Room Report"
3. Loading: show "Stats Agent...", "Market Agent...", "Tactics Agent..." (or single spinner)
4. Result: Accordion/cards for Stats | Market | Tactics | Synthesis
5. Synthesis card: Executive summary + Recommendation (SIGN/MONITOR/PASS) + Risks & Opportunities

---

## 5.6 Precision Summary

| Agent | Precision | Notes |
|-------|-----------|-------|
| **Stats** | High | Grounded in FBref/FM data; no invention |
| **Market** | Medium–High | Comparables from similar_players; subjective labels |
| **Tactics** | Medium | Profile-based; Ligat Ha'Al focus |
| **Synthesis** | High | Aggregates only; no new facts |

---

## 5.7 Cost & Limits

| Resource | Per report |
|----------|------------|
| **Gemini** | 4 calls × ~800 tokens ≈ 3.2k tokens output ≈ $0.002 |
| **Scout server** | 2–3 requests (similar_players, fm-intelligence) |
| **mgsr-backend** | 1 request (player) |

---

## 5.8 War Room Discovery Feed — Ligat Ha'Al Relevance Filter

When War Room runs as an **automated discovery feed** (not manual player selection), candidates must be **realistic for the Israeli market**. Irrelevant suggestions (e.g. Oscar Gloukh €8m, Arda Güler €25m) reduce trust.

### Filter Rules (apply before running War Room on a candidate)

| Rule | Threshold | Rationale |
|------|------------|-----------|
| **Market value cap** | €0 – €2.5m | Typical Ligat Ha'Al transfer budget. Top clubs may go to €3m for key signings. |
| **League filter** | Reachable leagues only | Balkans (Serbia, Croatia, Slovenia, Bulgaria), Scandinavia, Austria, Poland, Belgium 2nd tier, etc. Exclude: Premier League, La Liga, Serie A, Bundesliga, Ligue 1 (players from these are usually unrealistic unless free/loan). |
| **Club filter** | Exclude top-5 league clubs | Real Madrid, Barcelona, Man City, etc. — their players are rarely realistic for Israeli clubs. |
| **Find The Next** | Reference player must be affordable | When using "Find The Next: X", X must be a player in the realistic value/league range. Do NOT use Musiala, Güler, etc. as references — use Kovacić-at-20, Modrić-at-21, or similar from reachable leagues. |

### Implementation

- **Discovery job:** When collecting candidates (request matches, hidden gems, value drops, Find The Next), apply `value_max <= 2_500_000` (or configurable) and league whitelist.
- **football-scout-server:** Add `ligat_haal_filter: true` to recruitment/find_next params — filters out top-5 league players and value > €2.5m.
- **UI:** Show "Ligat Ha'Al filter: on" badge. Option to toggle off for power users (e.g. monitoring European market).

---

## Summary: Tools Used

| Feature | Tools |
|---------|-------|
| **Living Dossier** | Firebase Cloud Functions, Firestore, mgsr-backend, football-scout-server (new endpoint), NewsAPI, Gemini 2.5 Flash |
| **War Room** | Next.js API, football-scout-server (existing), mgsr-backend, Gemini 2.5 Flash (4 calls) |

---

*Document created for MGSR Team. Update as implementation progresses.*
