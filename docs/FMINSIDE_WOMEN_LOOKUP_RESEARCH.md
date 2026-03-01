# FMInside Women Player Lookup — Research & Implementation

## Problem

Players like **Diana Bieliakova** exist on FMInside (e.g. `https://fminside.net/players/7-fm-26/2000351404-diana-bieliakova`) but cannot be found by name-only search. The women's player info page needs to fetch FMInside data live (no DB) for display.

## Key Findings

### 1. FMInside Search is Client-Side Only

- **URL**: `https://fminside.net/players?name=diana+bieliakova&gender=female`
- **Behavior**: The server returns the **same generic HTML** regardless of query params. Search filtering happens entirely in JavaScript after page load.
- **Implication**: Server-side `fetch()` cannot get search results. No server-side API for search.

### 2. FMInside URL Structure

```
https://fminside.net/players/[VERSION]-[GAME]/[PLAYER_ID]-[SLUG]
```

- **FM26**: `7-fm-26`
- **Example**: `2000351404-diana-bieliakova` (ID + slug from name)
- **Direct fetch works**: When the URL is known, the player page HTML can be scraped successfully.

### 3. Search Engine Fallbacks

| Source | Result for Diana Bieliakova |
|--------|----------------------------|
| **DuckDuckGo** `site:fminside.net/players/7-fm-26 diana bieliakova` | Not indexed — her page not in results |
| **DuckDuckGo** broad `fminside.net players diana bieliakova FM26` | Not indexed |
| **Google** (direct fetch blocked 403) | N/A |
| **Serper.dev** (Google Search API) | Can find pages if Google has indexed them. Free tier: 2,500 queries. |

### 4. Other Data Sources

- **SoccerDonna**: Has Diana Bieliakova (`soccerdonna.de/.../spieler_39790.html`) but **no FMInside links** on profile pages.
- **Wosostat**: API for women's players; no FMInside ID mapping.
- **FMInside club pages**: List players (e.g. `/clubs/7-fm-26/2000232701-olimpia-cluj`) but require knowing the club ID.

### 5. No Public FMInside API

- No documented REST/GraphQL API.
- `index.php?p=includes%2Fspelers` returns generic content, not search results.
- `/api/players?name=...` returns unrelated article page.

## Implemented Solutions

### 1. Serper.dev Fallback (Optional)

When `SERPER_API_KEY` is set, the API uses Google Search via Serper to find FMInside player URLs:

- Query: `site:fminside.net/players/7-fm-26 {playerName}`
- Parses `organic` results for links matching FMInside player URL pattern
- Runs after DuckDuckGo, before broad DuckDuckGo search

**Setup**: Add `SERPER_API_KEY` to env (get free key at https://serper.dev)

### 2. Paste FMInside URL in No-Match UI

When search fails, the `FmInsideWomenPanel` shows a "Paste FMInside URL" input:

- User goes to fminside.net, searches in browser (client-side search works)
- Copies the player URL
- Pastes into the input and clicks "Load"
- `onFmUrlFound` saves the URL; component refetches with direct lookup

### 3. Direct Lookup (Existing)

When `fmInsideUrl` or `fmInsideId` is provided (from edit form or saved player), the API skips search and fetches the player page directly.

## Search Chain (API)

1. **Direct**: `fmInsideUrl` or `fmInsideId` → immediate fetch
2. **FMInside HTML**: `/players?name=...&gender=female` → always generic (no-op)
3. **DuckDuckGo** `site:fminside.net/players/7-fm-26 {name}`
4. **Serper** (if `SERPER_API_KEY` set) `site:fminside.net/players/7-fm-26 {name}`
5. **DuckDuckGo broad** `fminside.net players {name} FM26`
6. **Last name only** (DuckDuckGo) for multi-word names

## Recommendations

1. **Set `SERPER_API_KEY`** in production for better coverage (Google indexes more FMInside pages).
2. **User flow**: When search fails, instruct user to search on FMInside in browser and paste the URL. The paste UI is now in the panel.
3. **Future**: If FMInside adds server-side search or an API, integrate it. Headless browser (Puppeteer) is possible but heavy for this use case.
