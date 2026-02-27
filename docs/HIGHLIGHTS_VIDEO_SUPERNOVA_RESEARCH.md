# Player Highlights Video — Supernova Research

**Goal:** Build a bulletproof, supernova-strong video finder to analyze any player by video for scouting.

---

## Executive Summary

The current implementation uses **youtube-sr** (scraping) + **YouTube Data API** (fallback) + **Scorebat**. To reach "supernova" level, we need:

1. **Multi-source redundancy** — Add 2–3 more free/paid video sources
2. **YouTube API as primary when available** — Use filters (videoDuration, publishedAfter, topicId) that scraping cannot
3. **Player name intelligence** — Aliases, nicknames, language variants, Transfermarkt alternate names
4. **League/language targeting** — Nationality → query language hints
5. **Robust fallback chain** — youtube-sr → @distube/ytsr → SerpAPI/Apify → YouTube API
6. **Smarter scoring** — Description relevance, channel authority, engagement signals

---

## 1. Current Limitations (Root Cause Analysis)

| Limitation | Impact | Fix |
|------------|--------|-----|
| **youtube-sr only** | Scraping breaks when YouTube changes HTML; no filters | Add fallbacks + use YouTube API filters when quota allows |
| **No videoDuration filter** | Shorts, 30s clips, full 90min matches pollute results | YouTube API: `videoDuration=medium` (4–20 min) |
| **No publishedAfter** | Old/irrelevant videos rank high | YouTube API: `publishedAfter` = 2 years ago |
| **Single name per search** | "Mohamed Salah" vs "Salah" vs "Salah Jr" — miss content | Add name variants (last name only, nickname, fullNameHe) |
| **No language hint** | Spanish players get English results first | `relevanceLanguage` by nationality |
| **No league/competition** | Generic "Liverpool" vs "Liverpool U21" | Add team + league context |
| **Scorebat only** | Match-only, no player; deprecated API | Add Highlightly, SportSRC, or similar |
| **Cache key = playerName only** | Player moves club → stale team-specific results | Include teamName in cache key |

---

## 2. YouTube API — Underused Power

The YouTube Data API supports parameters that **youtube-sr cannot**:

| Parameter | Value | Effect |
|-----------|-------|--------|
| `videoDuration` | `medium` | 4–20 min only — perfect for highlight compilations |
| `publishedAfter` | `2023-01-01T00:00:00Z` | Last 2 years only |
| `relevanceLanguage` | `es`, `pt`, `ar`, `he` | Prioritize language by player nationality |
| `topicId` | `/m/02vx4` | Football topic — reduces gaming/other sports |
| `videoEmbeddable` | `true` | Already used |
| `order` | `relevance` or `viewCount` | Try both; merge & dedupe |

**Boolean query operators** (API supports these):
- `q: "Mohamed Salah -interview -podcast"` — exclude non-highlight content
- `q: "Salah Liverpool highlights|goals|skills"` — OR for multiple keywords

**Recommendation:** When `YOUTUBE_API_KEY` is set, use **YouTube API as primary** (with filters) for the first 1–2 searches per player. Reserve quota: 100 units/search. With 48h cache, ~50–100 unique players/day is feasible. Use youtube-sr for overflow or when quota is exhausted.

---

## 3. Player Name Intelligence

### 3.1 Name Variants to Search

| Variant | Example | When to use |
|---------|---------|-------------|
| Full name | Mohamed Salah | Always |
| Last name only | Salah | For distinctive names (Salah, Neymar, Haaland) |
| First + last (no middle) | Mohamed Salah | When full name has middle |
| Nickname | "Egyptian King" | If we store nicknames |
| Hebrew name | `fullNameHe` | Israeli/MENA players |
| Alternate spelling | Müller vs Müller | Diacritics handled; consider common misspellings |
| "Jr" / "II" | Salah Jr | If in Transfermarkt data |

### 3.2 Data Sources for Variants

- **Firestore `Players`**: `fullName`, `fullNameHe`
- **Transfermarkt**: Scrape "Name in home country" or alternate names from profile
- **Manual mapping**: Top 100 players nickname → search query

### 3.3 Query Strategy

```
Tier 1: "Mohamed Salah Liverpool highlights goals skills"  (full + team + keywords)
Tier 2: "Mohamed Salah highlights 2024"
Tier 3: "Salah Liverpool goals"  (last name + team when distinctive)
Tier 4: "Mohamed Salah"  (broad — catches agent reels)
```

For players with `fullNameHe` (e.g. Israeli leagues): add `"שם בעברית highlights"` or similar.

---

## 4. League & Language Targeting

### 4.1 Nationality → Language

| Nationality | Primary language | YouTube relevanceLanguage |
|-------------|------------------|----------------------------|
| Spain, Argentina, Mexico, Chile, etc. | Spanish | `es` |
| Brazil, Portugal | Portuguese | `pt` |
| France, Belgium (FR), Switzerland (FR) | French | `fr` |
| Germany, Austria, Switzerland (DE) | German | `de` |
| Italy | Italian | `it` |
| Egypt, Saudi, UAE, etc. | Arabic | `ar` |
| Israel | Hebrew | `he` |
| UK, USA, Netherlands, etc. | English | `en` |

### 4.2 Club Country → League

`currentClub.clubCountry` can hint: "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Liga Portugal", "Eredivisie", "Süper Lig", "Liga MX", "Argentine Primera", etc.

Add a tier: `"${playerName} ${leagueName} highlights"` when league is known.

---

## 5. Additional Video Sources

### 5.1 Free / Low-Cost

| Source | Type | Player-specific? | Notes |
|--------|------|------------------|-------|
| **Scorebat** | Match highlights | No (team only) | Already integrated; deprecated but works |
| **SportSRC** | Match streams/highlights | No | Free, no key; CORS enabled; `api.sportsrc.org` |
| **Highlightly** | Match highlights | Yes (filter by player) | API key; free tier on RapidAPI; `/highlights/team/{team}` |
| **Football Highlights API** (publicapi.dev) | Match highlights | Team filter | Highlightsly backend; requires auth |

### 5.2 Paid / Professional

| Source | Type | Cost | Notes |
|--------|------|------|-------|
| **Wyscout** | Full match + events + clips | Subscription | 600+ leagues; player-specific clips; API v2 |
| **InStat** | Scouting video | Enterprise | Used by professional clubs |
| **Opta** | Event data + video | Enterprise | Part of Hudl ecosystem |

### 5.3 YouTube Search Alternatives (When youtube-sr Fails)

| Service | Cost | Reliability |
|---------|------|-------------|
| **@distube/ytsr** | Free | npm package; fork of ytsr; supports locale |
| **SerpAPI YouTube** | ~$50/5k searches | Structured JSON; cached results free |
| **Apify YouTube Search** | Free + usage | No quota; returns JSON |
| **Poix** | $0.002/search | No rate limits; full data |

**Recommendation:** Add `@distube/ytsr` as second scraper (fallback when youtube-sr fails). Add SportSRC or Highlightly for match highlights when team is known. Consider SerpAPI or Apify for paid tier if youtube-sr reliability drops.

---

## 6. Query Architecture — Tiered Search

### 6.1 Proposed Tier Structure

```
Phase A — Team-specific (always run all)
  A1: "{fullName} {team} highlights {positionKeywords}"     [EN]
  A2: "{fullName} {team} goles jugadas"                     [ES]
  A3: "{fullName} {team} highlights {currentYear}"
  A4: "{fullName} {team} {league} highlights"              [when league known]
  A5: "{fullName} {parentClub} highlights"                 [when on loan]

Phase B — Name variants
  B1: "{lastName} {team} highlights"                       [when last name distinctive]
  B2: "{fullNameHe} highlights"                            [when Israeli/MENA]
  B3: "{fullName} highlights {positionKeywords}"
  B4: "{fullName} highlights {prevYear}"
  B5: "{fullName} goals"
  B6: "{fullName}"                                         [broad catch]

Phase C — API-only (when quota available)
  C1: YouTube API with videoDuration=medium, publishedAfter, topicId=/m/02vx4
  C2: Same query with relevanceLanguage=es|pt|ar|he based on nationality
```

### 6.2 Exclusion Keywords in Query

Append to search query: `-interview -podcast -press -conference -reaction -news -transfer -fifa -pes`

YouTube API supports `-word` in the `q` parameter.

---

## 7. Scoring & Ranking — Supercharged

### 7.1 New Signals

| Signal | Weight | Source |
|--------|--------|--------|
| **Title match** | +30 | "highlight", "goals", "skills" in title |
| **Team in title** | +120 | Current or parent club |
| **League in title** | +40 | "Premier League", "La Liga", etc. |
| **Trusted channel** | +50 | Existing TRUSTED_CHANNELS |
| **Duration 3–15 min** | +20 | Ideal highlight length |
| **View count** (log) | +0–30 | Social proof |
| **Recency** | +5–15 | Last 1–3 years |
| **Description contains player** | +25 | If we fetch description (API extra call) |
| **College/amateur** | -60 | NCAA, high school, etc. |
| **Blacklisted words** | reject | Existing TITLE_BLACKLIST |

### 7.2 Description Relevance (Optional)

YouTube API `snippet` includes `description`. We could:
- Fetch descriptions for top 20 results (already in search response)
- Score +25 if player name appears in first 200 chars of description
- Avoids false positives from unrelated titles

---

## 8. Reliability — Bulletproof Fallback Chain

```
1. youtube-sr (primary, free)
   ↓ on timeout/empty
2. @distube/ytsr (alternative scraper)
   ↓ on timeout/empty
3. YouTube Data API (if key set, with filters)
   ↓ on quota/error
4. SerpAPI or Apify (if configured, paid)
   ↓ on error
5. Return cached (even stale) + Scorebat
```

### 8.1 Retry Logic

- **Exponential backoff**: 1s, 2s, 4s between retries
- **Query variants**: If `"A B highlights"` fails, try `"A B goals"`, then `"A highlights"`
- **Per-tier timeout**: 15s per tier; max 60s total for all tiers

### 8.2 MIN_ACCEPTABLE_RESULTS

Use `MIN_ACCEPTABLE_RESULTS = 2`:
- If Phase A returns < 2, run Phase B
- If Phase B returns < 2, trigger YouTube API fallback immediately
- If Phase A returns ≥ 6, skip Phase B (save time)

---

## 9. Caching Improvements

| Change | Benefit |
|--------|---------|
| **Cache key**: `playerName + teamName` | Fresher when player moves |
| **Empty cache**: Don't cache for generic names (e.g. "John Smith") | Retry sooner |
| **Stale-while-revalidate**: Return cache, refresh in background | Faster UX |
| **Cache empty results**: 1h TTL instead of 4h | Less stuck on "no results" |

---

## 10. Implementation Priority

### Phase 1 — Quick Wins (1–2 days)

1. **YouTube API as primary when key available** — Use `videoDuration=medium`, `publishedAfter`, `topicId=/m/02vx4`
2. **Exclusion in query** — `-interview -podcast -press -conference -reaction -news -transfer`
3. **relevanceLanguage** — Map nationality → language code
4. **Add @distube/ytsr** — Fallback when youtube-sr fails
5. **Use MIN_ACCEPTABLE_RESULTS** — Early exit, early fallback

### Phase 2 — Name & Language (2–3 days)

6. **Name variants** — Last name only for distinctive names; fullNameHe tier
7. **League in query** — When `currentClub.clubCountry` maps to league
8. **Expand TRUSTED_CHANNELS** — Add more leagues, regional channels
9. **Cache key**: include teamName

### Phase 3 — Multi-Source (3–5 days)

10. **SportSRC or Highlightly** — Match highlights by team
11. **SerpAPI fallback** — If configured and youtube-sr fails
12. **Description scoring** — When using YouTube API, score by description

### Phase 4 — Supernova (Ongoing)

13. **Transfermarkt alternate names** — Scrape "name in home country"
14. **Nickname database** — Top 200 players
15. **A/B test scoring** — Tune weights based on scout feedback
16. **Wyscout integration** — If budget allows (professional tier)

---

## 11. Metrics to Track

| Metric | Target |
|--------|--------|
| **Hit rate** | > 90% of players have ≥ 1 video |
| **Relevance** | > 80% of top 3 are actual player highlights |
| **Latency** | p95 < 8s |
| **youtube-sr success rate** | Log; alert if < 70% |
| **YouTube API fallback rate** | Log; monitor quota usage |

---

## 12. Summary

To make the highlights finder **supernova strong**:

1. **Use YouTube API filters** when available — `videoDuration=medium`, `publishedAfter`, `topicId`, `relevanceLanguage`
2. **Add player name intelligence** — Aliases, fullNameHe, last-name-only for distinctive names
3. **Target by league/language** — Nationality → query language; club country → league
4. **Multi-source redundancy** — youtube-sr → ytsr → YouTube API → SerpAPI → Scorebat
5. **Exclude junk in query** — `-interview -podcast` etc.
6. **Add more video sources** — SportSRC, Highlightly for match highlights
7. **Smarter caching** — Cache key includes team; stale-while-revalidate
8. **Robust retries** — Exponential backoff; query variants; per-tier timeouts

This architecture transforms the finder from "best effort" to "bulletproof" for professional scouting use.
