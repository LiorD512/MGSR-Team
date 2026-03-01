# FMInside Women Player Lookup — Complete Flow Log

This document traces **exactly** what happens when we try to find a women's player (e.g. Diana Bieliakova) on FMInside. Step-by-step, with URLs, regexes, and decision points.

---

## Entry Point

**API**: `GET /api/fminside/women-player`

**Called from**: `FmInsideWomenPanel` component when a women's player page loads.

**Request params** (example for Diana Bieliakova):
```
name=Diana Bieliakova
positions=ST          (optional, from player.positions)
nationality=Ukraine   (optional)
age=21                (optional)
club=                 (optional)
fmInsideId=           (optional, if we have it)
fmInsideUrl=          (optional, if we have it)
```

---

## Flow Overview

```
1. Parse params, validate name
2. Direct lookup? (fmInsideUrl or fmInsideId) → SKIP search if yes
3. searchFmInsideWomen()     → FMInside HTML
4. searchViaDuckDuckGo()     → DuckDuckGo site: search
5. searchViaSerper()         → Google via Serper (if API key set)
6. searchViaDuckDuckGoBroad()→ DuckDuckGo broad search
7. searchViaDuckDuckGo(lastNameOnly) → retry with last name
8. If hit found → fetchPlayerDetail()
9. Return JSON or { found: false }
```

---

## Step 1: Direct Lookup (Skip Search)

**Condition**: `fmInsideUrl` contains `fminside.net/players/7-fm-26/` **OR** `fmInsideId` is a numeric string.

**If fmInsideUrl provided** (e.g. `https://fminside.net/players/7-fm-26/2000351404-diana-bieliakova`):
- Normalize: ensure `https://`, strip `?` and `#`
- Set `hit = { url: cleanUrl, name, positions, club, age, score: 100 }`
- **GOTO Step 8** (fetchPlayerDetail)

**If fmInsideId provided** (e.g. `2000351404`):
- Build slug from name: `diana-bieliakova` (lowercase, spaces→hyphens, strip non-alphanumeric)
- Set `hit.url = https://fminside.net/players/7-fm-26/2000351404-diana-bieliakova`
- **GOTO Step 8**

**If neither**: Continue to Step 2.

---

## Step 2: searchFmInsideWomen()

**Purpose**: Get search results via FMInside's AJAX API (discovered in `functions.js`).

**Flow** (3 requests with session cookies):

1. **GET** `https://fminside.net/players` — obtain PHPSESSID and fingerprint cookies.
2. **POST** `https://fminside.net/resources/inc/ajax/update_filter.php`  
   - Body: `page=players&database_version=7&gender=2&name=Diana+Bieliakova`  
   - `gender=2` = Female (form uses value="2", not "female")  
   - Response sets GENDER, PHPSESSID — must merge into cookie header.
3. **GET** `https://fminside.net/beheer/modules/players/resources/inc/frontend/generate-player-table.php?ajax_request=1`  
   - Uses cookies from step 2 — returns filtered player list HTML.

**Parsing logic**:
1. Regex: `href="(\/players\/7-fm-26\/(\d+)-([^"]+))"` — find all FM26 player links
2. For each `<tr>`, extract: link, display name, positions (MC, ST, etc.), age, club
3. Score each: `nameScore*0.5 + posScore*0.25 + ageScore*0.25`
4. Keep only rows with `nameScore >= 50`
5. Return best hit, or `null` if no name match

**Result for Diana Bieliakova**: `null` — she never appears in the HTML because the server returns the default list.

---

## Step 3: searchViaDuckDuckGo()

**Purpose**: Use DuckDuckGo to find FMInside player pages indexed by the search engine.

**URL fetched**:
```
GET https://html.duckduckgo.com/html/?q=site%3Afminside.net%2Fplayers%2F7-fm-26+Diana+Bieliakova
```
Decoded: `site:fminside.net/players/7-fm-26 Diana Bieliakova`

**What we expect**: DuckDuckGo results containing links like `fminside.net/players/7-fm-26/2000351404-diana-bieliakova`

**Parsing logic**:
1. Regex: `\[(fminside\.net\/players\/7-fm-26\/(\d+)-([^\]]+))\]` — DuckDuckGo wraps links in `[url]` format
2. For each match: extract id, slug, build `displayName` from slug (e.g. `diana-bieliakova` → `Diana Bieliakova`)
3. Compute `nameMatchScore(name, displayName)`
4. Return first hit with `score >= 60`

**Result for Diana Bieliakova**: `null` — her FMInside page is not indexed by DuckDuckGo. The HTML contains no matching links.

---

## Step 4: searchViaSerper()

**Purpose**: Use Google Search via Serper.dev API (if `SERPER_API_KEY` is set).

**Request**:
```
POST https://google.serper.dev/search
Headers: X-API-KEY: <SERPER_API_KEY>, Content-Type: application/json
Body: { "q": "site:fminside.net/players/7-fm-26 Diana Bieliakova", "num": 10 }
```

**What we expect**: JSON with `organic` array of results, each with `link` (full URL).

**Parsing logic**:
1. For each `item` in `data.organic`:
2. Regex on `item.link`: `fminside\.net\/players\/7-fm-26\/(\d+)-([a-z0-9-]+)`
3. If match, build displayName from slug, compute nameMatchScore
4. Return first hit with `score >= 60`

**Result for Diana Bieliakova**: Depends on whether Google has indexed her page. If `SERPER_API_KEY` is not set, this step is skipped.

---

## Step 5: searchViaDuckDuckGoBroad()

**Purpose**: Broader DuckDuckGo search without `site:` — sometimes finds FMInside pages in snippets.

**URL fetched**:
```
GET https://html.duckduckgo.com/html/?q=fminside.net+players+Diana+Bieliakova+FM26
```

**Parsing logic**:
1. Regex: `fminside\.net\/players\/7-fm-26\/(\d+)-([a-z0-9-]+)` (case-insensitive, anywhere in HTML)
2. Same scoring as Step 3, but require `score >= 70`

**Result for Diana Bieliakova**: `null` — still no indexed FMInside link in DuckDuckGo results.

---

## Step 6: searchViaDuckDuckGo(lastNameOnly)

**Purpose**: Retry DuckDuckGo with only the last name (e.g. "Bieliakova").

**URL fetched**:
```
GET https://html.duckduckgo.com/html/?q=site%3Afminside.net%2Fplayers%2F7-fm-26+Bieliakova
```

**Parsing**: Same as Step 3.

**Result for Diana Bieliakova**: `null` — "Bieliakova" alone also doesn't return her FMInside page.

---

## Step 7: No Hit

If all steps return `null`:
```json
{
  "found": false,
  "message": "No matching player found on FMInside (women's database)."
}
```

---

## Step 8: fetchPlayerDetail() (when we have a hit)

**Purpose**: Fetch the player's FMInside page and parse CA, attributes, position fit, height.

**URL fetched**:
```
GET https://fminside.net/players/7-fm-26/2000351404-diana-bieliakova
```
(Or whatever URL we got from direct lookup / search.)

**Verification**: `verifyPlayerNameOnPage(html, expectedName)`
- Extract `<title>` and `<h1>` from HTML
- Normalize both (lowercase, remove diacritics, strip non-alphanumeric)
- Check that at least 2 words from expected name appear, or 1 word if name is single-word

**Parsing**:
1. **CA/Rating**: Regex `(\d{2})\s*FM\s*26` or `rating["\s:]+(\d{2})` → scale 0–100 to CA (×2)
2. **Attributes**: Regex `|\s*([A-Za-z][A-Za-z\s]*?)\s*\|\s*(\d{1,2})\s*|` for markdown-style tables (Crossing | 20 |)
3. **Position fit**: Regex `\(([A-Z]{2,3})\)\s*(\d{2}(?:\.\d)?)` for roles like (AMC)84.7
4. **Height**: Regex `Height\s*(\d+)\s*CM` or `(\d+)\s*CM`
5. **Best position**: Regex `Position\(s\)\s*[:\-]?\s*([A-Za-z,\s]+)`

**If verification fails**: Return `null` → API returns `"Found a possible match but could not load details."`

---

## Step 9: Response (success)

```json
{
  "found": true,
  "player_name": "Diana Bieliakova",
  "ca": 96,
  "pa": 96,
  "potential_gap": 0,
  "tier": "prospect",
  "dimension_scores": { "technical": 45, "mental": 42, "physical": 55, "overall": 48 },
  "top_attributes": [...],
  "weak_attributes": [...],
  "all_attributes": {...},
  "position_fit": {...},
  "best_position": { "position": "ST", "fit": 50 },
  "foot": { "left": 50, "right": 50 },
  "height_cm": 166,
  "fminside_url": "https://fminside.net/players/7-fm-26/2000351404-diana-bieliakova"
}
```

---

## Summary: Why Diana Bieliakova Fails

| Step | What we do | Result |
|------|------------|--------|
| 1 | Direct lookup | Skip — no fmInsideUrl/fmInsideId |
| 2 | FMInside `/players?name=...&gender=female` | Server returns generic HTML, never Diana |
| 3 | DuckDuckGo `site:fminside.net/players/7-fm-26 Diana Bieliakova` | No indexed link to her page |
| 4 | Serper (Google) | Depends on API key + Google index |
| 5 | DuckDuckGo `fminside.net players Diana Bieliakova FM26` | No indexed link |
| 6 | DuckDuckGo `site:... Bieliakova` | No indexed link |
| 7 | — | `found: false` |

**Root cause**: We have no way to get from "Diana Bieliakova" to `2000351404` without either:
- A search engine that has indexed her FMInside page, or
- The user providing the URL/ID (paste or edit form).
