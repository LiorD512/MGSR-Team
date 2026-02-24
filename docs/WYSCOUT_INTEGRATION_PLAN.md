# Wyscout Integration Plan — AI Scout Enhancement

This document outlines how to integrate Wyscout API into the MGSRTeam AI Scout and how it improves each flow.

---

## 1. Current Architecture

```
┌─────────────────┐     ┌────────────────┐     ┌─────────────────────────────┐
│  mgsr-web       │     │  /api/scout/   │     │  football-scout-server       │
│  / Android app  │────▶│  recruitment   │────▶│  (Render, Python FastAPI)   │
│                 │     │  similar_players│     │  Data: TM + FBref            │
└─────────────────┘     └────────────────┘     └─────────────────────────────┘
```

**Current data sources:**
- **Transfermarkt** — market value, age, position, contract, club, nationality
- **FBref** — per-90 stats (goals, dribbles, tackles, etc.) — limited coverage
- **Gemini AI** — fallback for similarity, reports, hidden gem

**Wyscout adds:**
- 600+ leagues, 500k+ players
- Search API (players by name)
- Player Career API (goals, appearances, minutes, cards)
- Match Events API (events tagged per match)
- Better coverage for smaller leagues (e.g. Ligat Ha'Al)

---

## 2. Wyscout API Quick Reference

| Endpoint | Purpose | Usage |
|----------|---------|-------|
| `GET /v2/search?query=...&objType=player` | Search players by name | Match TM player → Wyscout wyId |
| `GET /v2/players/{wyId}/career` | Career stats per season | Goals, appearances, minutes, cards |
| `GET /v2/matches/{wyId}/events` | Match events | Events tagged (optional, advanced) |

**Authentication:** Basic Access `Authorization: Basic base64(username:password)`

**Base URL:** `https://apirest.wyscout.com/v2` (or v3)

**OpenAPI spec:** [apidocs.wyscout.com](https://apidocs.wyscout.com/) — download for full schema

---

## 3. Where to Integrate

**Integration point:** **Football scout server** (Python backend on Render)

- Do **not** call Wyscout from the Android app or mgsr-web directly — credentials would be exposed.
- Keep credentials on the server (env vars: `WYSCOUT_USER`, `WYSCOUT_PASSWORD`).
- Add a Wyscout client module on the scout server, similar to FBref enrichment.

---

## 4. Flow-by-Flow: How Wyscout Helps

### 4.1 Find Similar Players (`/similar_players`)

**Current flow:** User picks a player → server finds similar players from DB (TM + FBref) → returns by similarity score.

**How Wyscout helps:**

| Improvement | Benefit |
|-------------|---------|
| **Coverage** | FBref covers ~top leagues; Wyscout covers 600+ leagues. More players from Ligat Ha'Al, Balkans, Scandinavia get stats. |
| **Statistical similarity** | Wyscout career stats (goals, assists, minutes) can be used for similarity scoring alongside FBref. |
| **Fallback** | When FBref has no match, Wyscout can fill the gap. |

**Implementation:**
- Add `enrich_wyscout` step (similar to `enrich_fbref`) to the player DB.
- Match: TM player name + club → Wyscout search → player wyId → career stats.
- Store: `wyscout_wyid`, `wyscout_goals`, `wyscout_assists`, `wyscout_minutes`, etc.
- In `similarity.py`: use Wyscout stats when FBref is missing for a player.

---

### 4.2 Find Players for Request (`/recruitment`)

**Current flow:** Club request (position, age, foot, value, notes) → server filters and ranks players → returns candidates.

**How Wyscout helps:**

| Improvement | Benefit |
|-------------|---------|
| **Notes-based matching** | Notes like "target man", "pace", "physical" → Wyscout event stats (aerial duels, pressures, progressive carries) can score players. |
| **Playing style** | Wyscout career stats per position (e.g. goals/assists for CFs) improve ranking. |
| **Broader pool** | More candidates from smaller leagues. |

**Implementation:**
- Use Wyscout stats in `_compute_note_fit_score` and `_build_match_explanation`.
- When notes contain "target man" → prefer players with high aerial/duels.
- When notes contain "pace" → prefer players with high progressive carries.
- When notes contain "experienced" → prefer players with high minutes.

---

### 4.3 Generate Scout Report (`generateScoutReport` — Gemini only)

**Current flow:** Player profile (name, age, position, value, club, contract) → Gemini generates report. **No stats** — only profile data.

**How Wyscout helps:**

| Improvement | Benefit |
|-------------|---------|
| **Real stats in context** | Add Wyscout career stats to `buildPlayerContext` so Gemini has goals, assists, minutes, cards. |
| **Factual accuracy** | Today: "Base analysis on profile data only. NEVER invent facts." With Wyscout: real stats → fewer hallucinations. |
| **Ligat Ha'Al fit** | Stats from comparable leagues help Gemini make more accurate "fit for Israeli league" verdicts. |

**Implementation:**
- **Option A (server):** Add endpoint `/player_report_context?player_url=...` that returns enriched context (TM + FBref + Wyscout). Android/Web calls this before `generateScoutReport`. AiHelperService uses it in `buildPlayerContext`.
- **Option B (client):** Server exposes Wyscout stats in `/similar_players` and `/recruitment` responses. When report is needed, client already has the player — if we add a "get player stats" endpoint, the report flow can fetch enriched context before calling Gemini.

**Recommended:** Option A — new endpoint `/player_report_context` that returns full context (TM + FBref + Wyscout) for a given TM URL. Client calls it before Gemini report.

---

### 4.4 Hidden Gem Score (`computeHiddenGemScore`)

**Current flow:** Profile data only → Gemini scores 0–100.

**How Wyscout helps:**

| Improvement | Benefit |
|-------------|---------|
| **Rising stats** | Wyscout career: minutes trend, goals trend. "Young player with rising minutes" → higher hidden gem score. |
| **Data-driven** | Less reliance on Gemini for scoring; more on real stats. |

**Implementation:**
- Add Wyscout stats to `buildPlayerContext` (same as report flow).
- Or: server endpoint `/hidden_gem_context?player_url=...` returns stats + profile for Gemini.

---

### 4.5 Free Agents / Latest Releases (Transfermarkt direct)

**Current flow:** "Free/Free loan" requests → Transfermarkt LatestReleases directly — no scout server.

**How Wyscout helps:**

| Improvement | Benefit |
|-------------|---------|
| **Enrichment** | After fetching free agents from TM, optionally enrich with Wyscout stats before showing. |
| **Filtering** | Filter by minutes played (e.g. "played 500+ minutes last season") — Wyscout career. |

**Implementation:**
- Lower priority: enrichment happens on scout server; free agents flow is client-side. Could add a batch enrichment step if free agents are also sent to server for ranking.

---

## 5. Implementation Phases

### Phase 1: Foundation (1–2 weeks)

| Task | Description | Effort |
|------|-------------|--------|
| 1.1 Wyscout client module | Create `wyscout_client.py` on scout server: search, player career. Basic auth from env. | 2 days |
| 1.2 Player matching | Match TM player (name + club) → Wyscout search → wyId. Handle duplicates, name variations. | 2 days |
| 1.3 Enrichment pipeline | Add `enrich_wyscout` to build pipeline. Store `wyscout_*` fields in DB. | 2 days |
| 1.4 Credentials | Add `WYSCOUT_USER`, `WYSCOUT_PASSWORD` to Render env. | 0.5 day |

### Phase 2: Similar Players & Recruitment (1 week)

| Task | Description | Effort |
|------|-------------|--------|
| 2.1 Similarity scoring | Use Wyscout stats in `similarity.py` when FBref missing. | 1 day |
| 2.2 Recruitment scoring | Use Wyscout stats in note fit and match explanation. | 2 days |
| 2.3 Rate limiting | Wyscout API may have limits; add retries, caching, batch where possible. | 1 day |

### Phase 3: Scout Report & Hidden Gem (1 week)

| Task | Description | Effort |
|------|-------------|--------|
| 3.1 Report context endpoint | Add `/player_report_context?player_url=...` that returns TM + FBref + Wyscout. | 2 days |
| 3.2 Android integration | AiHelperService: fetch report context before `generateScoutReport`, merge into `buildPlayerContext`. | 1 day |
| 3.3 Web integration | Same for mgsr-web if report is generated there. | 0.5 day |
| 3.4 Hidden gem | Use enriched context in `computeHiddenGemScore`. | 0.5 day |

### Phase 4: Advanced (optional)

| Task | Description | Effort |
|------|-------------|--------|
| 4.1 Match events | Use event-level data for "playing style" (e.g. progressive passes, pressures). | 2 weeks |
| 4.2 Video links | Wyscout provides video; if API allows, link to clips in report. | 1 week |

---

## 6. Data Model Additions

**Player record (scout server DB):**

```python
# New fields after Wyscout enrichment
wyscout_wyid: int | None
wyscout_goals: float | None
wyscout_assists: float | None
wyscout_minutes: int | None
wyscout_appearances: int | None
wyscout_yellow_cards: int | None
wyscout_red_cards: int | None
wyscout_team_name: str | None
wyscout_competition: str | None
wyscout_season: str | None  # e.g. "2024"
```

**Matching strategy:**
- TM player: name, club, league
- Wyscout search: `query=player_name`
- Disambiguate: match by team name, competition, or league if multiple results

---

## 7. Security & Credentials

- **Never** store credentials in code or commit to git.
- Use Render env vars: `WYSCOUT_USER`, `WYSCOUT_PASSWORD`.
- For local dev: `.env` file (gitignored).
- Consider rate limits: Wyscout may throttle; add exponential backoff.

---

## 8. Summary Table

| Flow | Current | With Wyscout |
|------|---------|--------------|
| **Find Similar Players** | TM + FBref (limited) | + Wyscout stats for coverage & similarity |
| **Find Players for Request** | TM + FBref + notes | + Wyscout for notes matching, playing style |
| **Generate Scout Report** | Profile only → Gemini | + Real stats in context → better reports |
| **Hidden Gem Score** | Profile only → Gemini | + Real stats → more accurate scoring |
| **Free Agents** | TM only | Optional: enrich with Wyscout |

---

## 9. Next Steps

1. **Verify API access** — Use your credentials to call `GET /v2/search?query=...&objType=player` and confirm response format.
2. **Download OpenAPI spec** — From [apidocs.wyscout.com](https://apidocs.wyscout.com/) for exact schema.
3. **Start Phase 1** — Wyscout client + matching + enrichment on scout server.
4. **Iterate** — Add to similarity/recruitment first (highest impact), then report context.

---

*Document created for MGSRTeam Wyscout integration. Update as implementation progresses.*
