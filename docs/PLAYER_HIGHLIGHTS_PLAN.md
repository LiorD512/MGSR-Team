# Player Highlights Video Integration — Implementation Plan

## Overview

Add a **"Highlights"** panel to every player info page that shows curated football highlight videos — compilations, goal reels, skill showcases — from free sources. No interviews, press conferences, or short clips. Videos must be **1+ minutes** and from the **last 2 years**.

---

## Architecture: Multi-Source Pipeline with Smart Caching

```
┌──────────────────────────────────────────────────────────┐
│                     Player Info Page                      │
│  ┌────────────────────────────────────────────────────┐  │
│  │           PlayerHighlightsPanel.tsx                 │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │  │
│  │  │ YouTube  │  │ Scorebat │  │  Cached Results  │ │  │
│  │  │ Carousel │  │ Recent   │  │  (Firestore)     │ │  │
│  │  │          │  │ Matches  │  │                   │ │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │  /api/highlights/   │   ← Next.js API route (server-side)
              │    search           │
              └──────────┬──────────┘
                         │
         ┌───────────────┼────────────────┐
         │               │                │
    ┌────┴────┐   ┌──────┴──────┐   ┌────┴──────┐
    │ YouTube │   │  Scorebat   │   │ Firestore │
    │ Data    │   │  /v3 API    │   │  Cache    │
    │ API v3  │   │  (no key)   │   │  Layer    │
    └─────────┘   └─────────────┘   └───────────┘
```

---

## Data Sources (Ranked by Priority)

### Source 1: YouTube Data API v3 (Primary — Player Compilations)

**Why:** Largest football highlight library on the internet. Every professional player has multiple highlight compilations.

**What we get:**
- Season highlight compilations (5-15 min)
- Goal & skill showcases
- Best-of reels from reliable football channels

**Search Strategy:**
```typescript
// Optimized query to get ONLY highlights, no interviews
const query = `${playerName} highlights goals skills ${season} -interview -press -conference -reaction -news -transfer -podcast`;

// Filters:
// - videoDuration: 'medium' (4-20 min) — excludes shorts & full matches
// - publishedAfter: 2 years ago — fresh content only
// - videoEmbeddable: true — must be embeddable
// - order: 'relevance' — best matches first
// - maxResults: 5 — quality over quantity
```

**Cost:**
- Search: 100 quota units (free tier: 10,000 units/day = 100 searches/day)
- Video details: 1 unit per call (for duration/stats validation)
- Embedding: FREE (no quota cost)

**Caching Strategy:**
- Cache search results in Firestore per player for **48 hours**
- With caching: effectively unlimited players/day
- Re-search only on cache miss or expiry

### Source 2: Scorebat API (Secondary — Recent Match Highlights)

**Why:** Free, no API key, returns official match highlights with goal clips.

**What we get:**
- Recent match highlights (last 1-2 weeks)
- Individual goal clips with scorer names
- Official broadcaster clips

**Integration:**
```typescript
// Fetch all recent highlights, filter by player's current team
const allMatches = await fetch('https://www.scorebat.com/video-api/v3/');
const teamMatches = data.response.filter(match =>
  match.title.toLowerCase().includes(teamName.toLowerCase())
);
```

**Cost:** 100% free, no API key needed.

**Limitations:**
- Only recent matches (~1-2 weeks)
- Match-based, not player-specific (filter by team)
- API marked as "deprecated" but still functional

---

## Detailed Technical Plan

### Phase 1: Backend — API Route + Caching

#### File: `mgsr-web/src/app/api/highlights/search/route.ts`

**New Next.js API route** that:
1. Accepts `playerName`, `teamName`, `position` as query params
2. Checks Firestore cache first (collection: `PlayerHighlightsCache`)
3. If cache miss or expired (>48h), fetches from YouTube + Scorebat
4. Applies smart filtering (title analysis, duration check)
5. Stores results in Firestore cache
6. Returns unified response

```typescript
// Response shape:
interface HighlightVideo {
  id: string;                    // Unique ID (youtube videoId or scorebat id)
  source: 'youtube' | 'scorebat';
  title: string;
  thumbnailUrl: string;
  embedUrl: string;              // Ready-to-use iframe src
  channelName: string;           // e.g. "Premier League", "LaLiga"
  publishedAt: string;           // ISO date
  durationSeconds: number;       // Duration in seconds
  viewCount?: number;            // YouTube views (for sorting)
}

interface HighlightsResponse {
  playerName: string;
  videos: HighlightVideo[];
  cachedAt: number;              // Timestamp of when results were cached
  sources: string[];             // Which sources contributed results
}
```

#### Smart Filtering Pipeline (server-side):

```
Raw YouTube Results (5 videos)
  │
  ├── Title filter: reject if contains "interview", "press", 
  │   "conference", "reaction", "news", "podcast", "transfer",
  │   "preview", "prediction", "debate", "analysis show"
  │
  ├── Duration filter: reject if < 60 seconds
  │
  ├── Channel quality filter: boost results from known channels:
  │   - "Premier League", "LaLiga", "Bundesliga", "Serie A", "Ligue 1"
  │   - "UEFA Champions League", "FIFA", "BT Sport", "Sky Sports"
  │   - Common highlight channels
  │
  └── Final: return top 6 videos sorted by (channel_quality × relevance)
```

#### Firestore Caching Schema:

```
Collection: PlayerHighlightsCache
Document ID: normalized_player_name (e.g., "mohamed_salah")
Fields:
  - playerName: string
  - teamName: string
  - videos: HighlightVideo[]       // Array of video objects
  - cachedAt: Timestamp            // When cached
  - searchQuery: string            // The query used
  - expiresAt: Timestamp           // cachedAt + 48 hours
```

### Phase 2: Frontend — PlayerHighlightsPanel Component

#### File: `mgsr-web/src/components/PlayerHighlightsPanel.tsx`

**Design Spec (matches existing mgsr dark-theme style):**

```
┌──────────────────────────────────────────────────────────┐
│  🎬 Highlights                                    ▼/▲   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                                                     │ │
│  │              ▶ YouTube Embed Player                 │ │
│  │              (selected video plays here)            │ │
│  │              16:9 aspect ratio                      │ │
│  │                                                     │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │ thumb1  │ │ thumb2  │ │ thumb3  │ │ thumb4  │  →    │
│  │ 3:24    │ │ 8:15    │ │ 5:02    │ │ 12:30   │      │
│  │ ● active│ │         │ │         │ │         │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
│  "Season 25/26" "Best Goals" "Skills"  "UCL High..."   │
│                                                          │
│  ── Recent Matches ──────────────────────────────────── │
│  ┌─────────┐ ┌─────────┐                               │
│  │ match1  │ │ match2  │                               │
│  │ ⚽ 2-1  │ │ ⚽ 3-0  │                               │
│  └─────────┘ └─────────┘                               │
│  "vs Arsenal" "vs Madrid"                               │
│                                                          │
│  Powered by YouTube & Scorebat        Last updated 2h  │
└──────────────────────────────────────────────────────────┘
```

**Component Features:**
- Collapsible panel (same pattern as FmIntelligencePanel / SimilarPlayersPanel)
- Main video player: embedded YouTube iframe (16:9, responsive)
- Horizontal scrolling thumbnail strip below the player
- Click thumbnail → swap video in main player
- Separate "Recent Matches" section for Scorebat results
- Loading skeleton while fetching
- Graceful empty state: "No highlights found yet"
- YouTube branding attribution (required by YouTube ToS)
- Lazy-loaded (only fetch when panel is expanded / in viewport)

### Phase 3: Integration into Player Info Page

#### File: `mgsr-web/src/app/players/[id]/page.tsx`

Add the panel in the right column, after SimilarPlayersPanel:

```tsx
import PlayerHighlightsPanel from '@/components/PlayerHighlightsPanel';

// In the JSX, after SimilarPlayersPanel:
{(merged.fullName || player?.fullName) && (
  <PlayerHighlightsPanel
    playerName={merged.fullName || player?.fullName || ''}
    teamName={merged.currentClub?.clubName || player?.currentClub?.clubName || ''}
    position={merged.positions?.[0] || player?.positions?.[0] || ''}
    isRtl={isRtl}
  />
)}
```

---

## YouTube API Key Setup

### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Create new project: "MGSR-Highlights"
3. Enable "YouTube Data API v3"
4. Create API key (restrict to YouTube Data API v3 only)
5. Optional: restrict by HTTP referrer to your domains

### Step 2: Add to Environment
```bash
# .env.local (development)
YOUTUBE_API_KEY=AIza...your_key_here

# .env.vercel (production - set in Vercel dashboard)
YOUTUBE_API_KEY=AIza...your_key_here
```

### Step 3: Quota Management
- Default: 10,000 units/day = 100 YouTube searches/day
- With 48-hour caching: serves ~500+ unique players/day
- Request quota increase (free) if needed: up to 50,000 units/day
- Monitor at https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas

---

## File-by-File Implementation Checklist

### New Files to Create:

| # | File | Purpose |
|---|------|---------|
| 1 | `mgsr-web/src/app/api/highlights/search/route.ts` | API route: YouTube search + Scorebat + caching |
| 2 | `mgsr-web/src/lib/highlightsApi.ts` | Client-side API wrapper (fetch from route) |
| 3 | `mgsr-web/src/components/PlayerHighlightsPanel.tsx` | Main highlights UI component |

### Files to Modify:

| # | File | Change |
|---|------|--------|
| 4 | `mgsr-web/src/app/players/[id]/page.tsx` | Add `<PlayerHighlightsPanel>` |
| 5 | `mgsr-web/.env.local` | Add `YOUTUBE_API_KEY=` |
| 6 | `mgsr-web/.env.example` | Add `YOUTUBE_API_KEY=` placeholder |
| 7 | `mgsr-web/src/contexts/LanguageContext.tsx` | Add translation keys for highlights panel |

### Translation Keys Needed:

```typescript
// English
highlights_title: 'Highlights',
highlights_loading: 'Loading highlights...',
highlights_empty: 'No highlights found',
highlights_recent_matches: 'Recent Matches',
highlights_powered_by: 'Powered by YouTube & Scorebat',
highlights_updated: 'Updated',
highlights_ago: 'ago',
highlights_views: 'views',

// Hebrew
highlights_title: 'הדגשות',
highlights_loading: 'טוען הדגשות...',
highlights_empty: 'לא נמצאו הדגשות',
highlights_recent_matches: 'משחקים אחרונים',
highlights_powered_by: 'מבוסס על YouTube ו-Scorebat',
highlights_updated: 'עודכן',
highlights_ago: 'לפני',
highlights_views: 'צפיות',
```

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| No YouTube API key configured | Skip YouTube, use Scorebat only |
| YouTube quota exhausted | Return cache (even expired) + Scorebat only |
| Player name too generic (e.g., "Ahmed") | Append team name to search query |
| No results found at all | Show elegant empty state with explanation |
| Scorebat API down/deprecated | Gracefully degrade to YouTube only |
| Video removed from YouTube | oEmbed check before display, filter dead links |
| Slow network | Skeleton loading + progressive reveal |
| RTL layout | Full RTL support with dir attribute |

---

## Security & Compliance

1. **YouTube API Key**: Server-side only (in API route, never exposed to client)
2. **YouTube ToS**: Include YouTube branding, link to YouTube watch page
3. **Content Safety**: Server-side title filtering prevents inappropriate content
4. **No Scraping**: All sources are official APIs (YouTube Data API, Scorebat public API)
5. **Rate Limiting**: Firestore caching prevents API abuse
6. **CORS**: API route acts as proxy, no CORS issues

---

## Performance Optimizations

1. **Lazy Loading**: Panel only fetches data when expanded or scrolled into view
2. **Firestore Cache**: 48-hour TTL eliminates repeated API calls
3. **Thumbnail Lazy Load**: Use `loading="lazy"` on thumbnail images
4. **YouTube Lite Embed**: Use `srcdoc` technique for YouTube embeds (loads 200KB instead of 1MB initially)
5. **Progressive Enhancement**: Show thumbnails first, load player on click
6. **Intersection Observer**: Only load panel content when visible in viewport

---

## Future Enhancements (Out of Scope for V1)

- [ ] Video bookmarking (save favorite highlights per player)
- [ ] AI-generated summary of player's playing style from video titles
- [ ] Wyscout/InStat integration (paid tier)
- [ ] Share highlight video via WhatsApp
- [ ] Mobile app integration (Android)
- [ ] Custom highlight playlists per scout
- [ ] Video clip tagging (mark specific moments)
- [ ] Integration with player reports

---

## Timeline Estimate

| Phase | Task | Time |
|-------|------|------|
| 1 | YouTube API key setup | 10 min |
| 2 | API route (`/api/highlights/search`) | 45 min |
| 3 | Client API wrapper (`highlightsApi.ts`) | 15 min |
| 4 | PlayerHighlightsPanel component | 60 min |
| 5 | Integration into player page | 10 min |
| 6 | Translation keys | 10 min |
| 7 | Testing & polish | 30 min |
| **Total** | | **~3 hours** |

---

## Ready to Implement?

All sources are **free**. All APIs are **available today**. The architecture uses the same patterns already in the codebase (API route proxy, Firestore caching, collapsible panels). 

Say **"Let's build it"** and I'll start implementing file by file.
