# Football Scout Server — Improvement Proposal

## Executive Summary

The current football scout system returns **identical player recommendations** for requests that share the same position, transfer fee, and salary range—even when the requests come from clubs at different levels, leagues, or with different notes (e.g. "target man", "pace", "experienced"). This is not realistic scouting.

This document proposes improvements to make the system **context-aware** and **personalized** per request, aligned with how professional scouting departments (e.g. Brentford, elite clubs) operate.

---

## 1. Current State Analysis

### 1.1 Architecture

```
┌─────────────────┐     ┌────────────────┐     ┌─────────────────────────────┐
│  mgsr-web       │     │  /api/scout/    │     │  football-scout-server      │
│  / Android app  │────▶│  recruitment    │────▶│  (Render, Python FastAPI)   │
│                 │     │  (proxy)        │     │  /recruitment?position=CF  │
└─────────────────┘     └────────────────┘     └─────────────────────────────┘
```

### 1.2 Parameters Sent to Scout Server

| Parameter    | Sent? | Source                    | Notes |
|-------------|-------|---------------------------|-------|
| position    | ✅    | Request.position          | CF, CM, etc. |
| age_min     | ✅    | Request.minAge            | |
| age_max     | ✅    | Request.maxAge            | |
| foot        | ✅    | Request.dominateFoot      | |
| notes       | ✅    | Request.notes             | Free text ("target man", "pace", etc.) |
| transfer_fee| ✅    | Request.transferFee       | "Free/Free loan", "<200", "300-600", etc. |
| club_url    | ✅    | Request.clubTmProfile     | Transfermarkt club URL |
| club_name   | ✅    | Request.clubName          | |
| club_country| ✅    | Request.clubCountry       | |
| **salary_range** | ❌ | Request.salaryRange | **Not sent** — critical for filtering |

### 1.3 Root Causes of Identical Results

1. **Same search key = same results**  
   The server likely uses a deterministic filter: `position + transfer_fee → value_max → players`. Two requests with CF + 200k + 15k salary produce the same query.

2. **Club context underused**  
   `club_url`, `club_name`, `club_country` are sent but not used to:
   - Infer club level (Premier League vs 2nd division)
   - Filter by league tier (e.g. avoid top-5 leagues for lower-tier clubs)
   - Match players from similar league levels

3. **Notes not affecting search**  
   Free-text notes ("target man", "pace", "experienced") are passed but likely not used for:
   - Semantic search / scoring
   - Playing style filtering
   - Re-ranking

4. **Salary range missing**  
   `salaryRange` is in the Request model but not sent to the scout server. It is used for roster matching but not for online recruitment.

5. **No randomization**  
   Even when results differ, identical requests get identical ordering. No diversity for "same params, different clubs" scenarios.

---

## 2. Best Practices from Research

### 2.1 Elite Scouting (Brentford, etc.)

- **Position-specific profiles** — Six criteria per position; not just "CF" but role-specific attributes.
- **Budget-aware filtering** — Clubs focus on leagues where value exists relative to their financial model.
- **League tier matching** — Scout players from leagues suited to the club’s level (e.g. Scandinavia for mid-tier clubs).
- **Proprietary data** — Different clubs use different data sources; personalization is key.

### 2.2 AI / ML Recommendations

- **Club-specific factors** — Budget, tactical style, squad composition, existing players.
- **Semantic search** — Natural language notes (e.g. "target man", "pace") can be embedded and used for similarity.
- **Context-dependent scoring** — Same player can score differently for different clubs (e.g. ScoutGPT, FootballBERT).

### 2.3 Data Sources

- **Transfermarkt** — squad value, league, market value.
- **Club squad value** — Already available via `ClubSquadValueFetcher` in the app; can be derived from `club_url`.
- **League tier** — Can be inferred from league name or country.

---

## 3. Proposed Improvements

### 3.1 Client-Side (MGSRTeam)

#### A. Add `salary_range` to Scout API

**Current:** `salaryRange` is not sent.  
**Change:** Pass `salary_range` to the scout server.

**Files to modify:**
- `mgsr-web/src/lib/scoutApi.ts` — add `salaryRange` to `RecruitmentParams` and `buildUrl`
- `mgsr-web/src/app/requests/page.tsx` — pass `salaryRange: r.salaryRange`
- `app/.../ScoutApiClient.kt` — add `salaryRange` param and build
- `app/.../AiHelperService.kt` — pass `request.salaryRange` to `findPlayersForRequest`

**Impact:** Server can filter players by salary expectations.

---

#### B. Add `club_squad_value` (optional)

**Current:** `ClubSquadValueFetcher` exists but is only used for "Free/Free loan" in the AI fallback.  
**Change:** Fetch club squad value when `club_url` is present and pass it to the scout server.

**Rationale:**  
- Premier League club: squad value ~€50M+ → target players from leagues at similar level.  
- Lower-tier club: squad value ~€2M → target players from leagues at similar level.

**Implementation:**  
- Add optional `club_squad_value` (or `club_avg_value`) to the API.  
- Web: fetch from backend or a dedicated endpoint; or pass as optional.  
- Android: use `ClubSquadValueFetcher.getAverageSquadValue()` before calling scout API.

---

#### C. Add `request_id` for diversity

**Current:** Same params → same results.  
**Change:** Pass `request_id` (or a unique identifier) so the server can:
- Add deterministic randomness per request (e.g. `hash(request_id) % N` for seed)
- Avoid returning identical lists for different requests

**Implementation:**  
- Add optional `request_id` param.  
- Server uses it for seeding or diversification when results would otherwise be identical.

---

### 3.2 Server-Side (football-scout-server)

**Note:** The server code is hosted on Render; these changes assume you have access to modify it.

#### A. Use club context for filtering and ranking

1. **Club squad value**  
   - If `club_url` is provided, fetch squad value (or accept `club_squad_value` from client).  
   - Filter players by league tier:  
     - High squad value → allow top-5 leagues.  
     - Low squad value → prefer lower leagues (e.g. Scandinavia, Balkans, Israel).

2. **League tier**  
   - Map league names to tiers (e.g. 1–5).  
   - Score players by league tier vs club level.

3. **Club country**  
   - Use `club_country` to prefer players from similar leagues or nearby markets.

---

#### B. Use notes for semantic search / re-ranking

1. **Keyword extraction**  
   - Parse notes for common terms: "target man", "pace", "experienced", "young", "physical", "technical", etc.

2. **Embedding-based search**  
   - If player descriptions exist, embed them and use notes as query.  
   - Re-rank players by similarity to notes.

3. **Rule-based scoring**  
   - Fallback: simple keyword scoring (e.g. "pace" → prefer younger players).  
   - "experienced" → prefer older players.

---

#### C. Use salary range for filtering

1. **Map salary range to value**  
   - `">5"` → €5k–€10k  
   - `"6-10"` → €6k–€10k  
   - `"11-15"` → €11k–€15k  
   - etc.

2. **Filter players**  
   - Exclude players whose market value suggests salary far above the request range.

---

#### D. Request fingerprint / diversification

1. **Per-request hash**  
   - Use `request_id` or `hash(club_url + notes + position + ...)` as seed.

2. **Randomization**  
   - When multiple players have similar scores, shuffle or rotate by seed.  
   - Ensures different clubs get different lists even with similar criteria.

3. **Exclude recently seen**  
   - If `exclude_urls` is used, consider excluding players recently seen for the same club.

---

### 3.3 Data Model

#### Request fingerprint (for deduplication / diversity)

```python
# Example: request fingerprint for diversification
def request_fingerprint(club_url: str, club_name: str, notes: str, position: str, ...) -> int:
    s = f"{club_url}|{club_name}|{notes}|{position}|..."
    return hash(s) % (2**32)
```

#### League tier mapping (example)

```python
LEAGUE_TIERS = {
    "premier league": 1, "la liga": 1, "serie a": 1, "bundesliga": 1, "ligue 1": 1,
    "eredivisie": 2, "liga portugal": 2, "belgian pro league": 2,
    "championship": 2, "2. bundesliga": 2,
    "israeli premier league": 3, "greek super league": 3, "austrian bundesliga": 3,
    # ...
}
```

---

## 4. Implementation Roadmap

### Phase 1: Quick wins (client + server)

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 1 | Add `salary_range` to Scout API (client + server) | 1–2 days | High |
| 2 | Add `request_id` for diversification (server) | 0.5 day | Medium |
| 3 | Pass `club_squad_value` when available (client) | 1 day | Medium |

### Phase 2: Server-side context

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 4 | Use club squad value for league tier filtering | 2–3 days | High |
| 5 | Use club country for league preference | 2 days | Medium |
| 6 | Keyword-based notes scoring (target man, pace, etc.) | 2 days | Medium |

### Phase 3: Advanced (optional)

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| 7 | Embedding-based notes search (optional) | 1–2 weeks | High |
| 8 | League tier mapping (full) | 1 week | Medium |
| 9 | Caching with request fingerprint | 2–3 days | Low |

---

## 5. Summary

**Problem:** Two requests with CF + 200k + 15k from different clubs get the same players.

**Solution:**  
1. **Client:** Send `salary_range`, optional `club_squad_value`, and `request_id`.  
2. **Server:** Use club context (squad value, country, league tier) for filtering and ranking.  
3. **Server:** Use notes for keyword or semantic scoring.  
4. **Server:** Use `request_id` for diversification when results would otherwise be identical.

**Result:** Different clubs, different notes, or different levels → different, contextually appropriate player recommendations.

---

## 6. References

- [Brentford recruitment – The Athletic](https://theathletic.com/4709058/2023/07/26/access-all-areas-brentford-recruitment)
- [Building a Modern Scouting Department – The Football Analyst](https://the-footballanalyst.com/building-a-modern-scouting-department-lessons-from-elite-clubs/)
- [Data-Driven Player Recruitment – IEEE](https://ieeexplore.ieee.org/document/10404860/)
- [Footballer Player Recommendation – Graph Convolutional Networks](https://link.springer.com/chapter/10.1007/978-3-032-12983-3_48)
- [SoccerRAG – Multimodal Soccer Information Retrieval](https://arxiv.org/html/2406.01273v1)
- [ScoutGPT – Player Impact from Team Action Sequences](https://arxiv.org/html/2512.17266v1)
