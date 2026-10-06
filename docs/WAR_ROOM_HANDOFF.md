# WAR ROOM & ALPHA BOARD — Full Handoff

> Everything that was done to the War Room feature, why, and where every piece lives.
> Read this alongside `football-scout-server/HANDOFF.md` for the data/infrastructure side.

---

## Table of Contents

1. [Background — What the War Room Is](#background--what-the-war-room-is)
2. [The Redesign: From War Room to Alpha Board](#the-redesign-from-war-room-to-alpha-board)
3. [Design Mocks (Iteration History)](#design-mocks-iteration-history)
4. [Architecture — How the Alpha Board Works End-to-End](#architecture--how-the-alpha-board-works-end-to-end)
5. [Backend Changes (football-scout-server)](#backend-changes-football-scout-server)
6. [Web Frontend Changes (MGSR-Team / mgsr-web)](#web-frontend-changes-mgsr-team--mgsr-web)
7. [All Files Touched (Both Repos)](#all-files-touched-both-repos)
8. [All PRs Related to War Room / Alpha Board](#all-prs-related-to-war-room--alpha-board)
9. [All Commits Related to War Room / Alpha Board](#all-commits-related-to-war-room--alpha-board)
10. [Current Live State](#current-live-state)
11. [Known Issues & Incomplete Work](#known-issues--incomplete-work)
12. [Design Decisions Made by the User](#design-decisions-made-by-the-user)
13. [Held / Parked PRs](#held--parked-prs)

---

## Background — What the War Room Is

The War Room is a feature in the MGSR football agency app. Its purpose (in the
user's words): **"find players to approach before everyone else."** The agency
operates in the **€150k–€2m market value band** (lower/mid leagues, not elite
transfers) and the War Room is **men-only**.

### The original War Room (pre-redesign)

The original War Room page (`/war-room`, file: `mgsr-web/src/app/war-room/page.tsx`,
~1400+ lines) had four tabs:

1. **Discovery** — a feed of candidates from a `/api/war-room/discovery` endpoint,
   with AI-generated dossier reports via `/api/war-room/report`.
2. **Scout Agents** — AI scout agent profiles from `/api/war-room/scout-profiles`,
   filterable by agent and position.
3. **AI Search** — natural-language AI scouting queries via `aiScoutSearch()`.
4. **Find Next** — signature-based star successor search (`FindNextTab` component).

These tabs still exist at `/war-room` and are untouched. The Alpha Board was added
as a **separate new route** (`/war-room/alpha-board`), not a replacement.

---

## The Redesign: From War Room to Alpha Board

### Why

The user wanted something cleaner and more focused than the multi-tab War Room.
Key quotes:
- "I prefer board than a list"
- "Clean and organized that will focus me"
- "Find players to approach before everyone else"
- "150k–2m euro market value" band
- "Men only feature"

### What was built

The **Alpha Board**: a ranked board of signable players (€150k–€2m), scored by a
transparent "Alpha Score" (0–100) that detects "why now" triggers — contract
leverage, form spikes, age-value mismatch, FM potential gap, etc.

It was designed to feel like a **clean intelligence board** (not a long scrollable
list), with card-based layout, tier groupings, lens/position filters, and a player
dossier drawer.

### Relationship to the old War Room

The Alpha Board lives at `/war-room/alpha-board` as a **standalone route under the
War Room umbrella**. The original `/war-room` page (Discovery, Scout Agents, AI
Search, Find Next) is **untouched and still accessible**. The BritRail sidebar
navigation links to `/war-room/alpha-board` as the primary War Room entry point.

There was a plan to restructure the War Room into 4 separate routes (PRs #14/#15)
but the user said **"not gonna merge for now"** — that work is parked.

---

## Design Mocks (Iteration History)

Three mock iterations, all saved as self-contained HTML files in `docs/`:

| File | Version | Description |
|------|---------|-------------|
| `docs/brit-sport-group-war-room-alpha-board.html` | v1 | First concept mock with Sportmonks-shaped data. User: "looking nice but still bit messed, not clean enough." |
| `docs/brit-sport-group-war-room-alpha-board-v2.html` | v2 | Cleaned up list layout with honest per-league data (Serbian SuperLiga test). User: "I prefer board than a list." |
| `docs/brit-sport-group-war-room-alpha-board-v3.html` | v3 | **Final approved design.** Card board, €150k–2m band enforced, real in-band players (Pavlović, Ranđelović, Turgeman, etc.), tier groupings, lens filters. This is what was implemented. |

---

## Architecture — How the Alpha Board Works End-to-End

```
Browser → /war-room/alpha-board (Next.js page)
   ↓
AlphaBoardMen.tsx (React component)
   ↓ fetch
/api/war-room/alpha-board/route.ts (Next.js API route — proxy)
   ↓ fetch (server-side, no CORS)
https://football-scout-server-l38w.onrender.com/alpha_board (Python endpoint)
   ↓
alpha_board.py → build_alpha_board()
   ↓ reads
global_players_slim.json (26,830 players in memory on Render)
   ↓ scoring
similarity.py (_compute_scouting_score, position-specific percentiles)
   ↓
Returns: { board: [...60 ranked players], band: {min, max}, signals: {...}, total_in_band }
```

### Data flow summary

1. **Scout DB** (`data/global_players.json`, ~80MB full / `data/global_players_slim.json`,
   ~53MB server version) — 26,830 players across 54 leagues. Contains TM fields (club,
   contract, market value, position) + API-Football per-90 stats + FMInside attributes.

2. **`alpha_board.py`** on the scout server reads the slim DB, filters to the €150k–2m
   band, computes Alpha Score + detects triggers for each player, ranks them, and
   returns the top 60.

3. **`/api/war-room/alpha-board/route.ts`** in the Next.js web app proxies browser
   requests to the scout server (avoiding CORS). Passes through `position`, `trigger`
   (lens), and `lang` query params.

4. **`AlphaBoardMen.tsx`** renders the board with cards, filters, drawer, shortlist
   actions.

---

## Backend Changes (football-scout-server)

### `alpha_board.py` (311 lines) — PR #5, merged

The core Alpha Board engine. Key components:

**Constants (env-configurable):**
- `BAND_MIN` = €150,000 (`ALPHA_BAND_MIN`)
- `BAND_MAX` = €2,000,000 (`ALPHA_BAND_MAX`)
- `AGE_MAX` = 31 (`ALPHA_AGE_MAX`)

**Functions:**
- `_in_band(p)` — checks if player is in the €150k–2m band. Also includes free
  agents (contract expired) if their last value was within `BAND_MIN/2` to `BAND_MAX`.
- `detect_triggers(p)` — detects "why now" reasons for each player. Returns list of
  trigger dicts with `id`, `label_en`, `label_he`, `weight`. Triggers include:
  - `contract_12mo` / `contract_6mo` — contract expiring soon (leverage)
  - `free_agent` — contract already expired
  - `form_rising` — recent form spike (API rating + goals per 90)
  - `age_value_mismatch` — young player undervalued
  - `fm_potential_gap` — FM potential >> FM current ability
  - `output_above_league` — stats above league level
  - `defensive_intensity` — high defensive output (tackles+interceptions)
  - `minutes_opportunity` — getting significant playing time
  - `value_dropping` — market value recently decreased
- `compute_alpha(p, triggers)` — calculates Alpha Score (0–100). Blends:
  - Base scouting score (from `similarity.py`, position-specific percentiles)
  - Trigger weight bonus (capped)
  - Value headroom factor (cheaper in band = more headroom)
- `_verdict(alpha, triggers)` — returns `SIGN` / `MONITOR` / `PASS` recommendation
- `_tier(alpha)` — returns tier label (`S` / `A` / `B` / `C`) based on score
- `build_alpha_board(players, limit=60, position=None, trigger=None, lang='en')` —
  main entry point. Filters to in-band, scores all, ranks, returns top `limit`.
  Supports position and trigger (lens) filters. Deterministic + cached.
- `_board_signals(candidates)` — aggregates signal counts for the board header

**Server endpoint** (in `server.py`):
- `GET /alpha_board?position=&trigger=&lang=&limit=` — calls `build_alpha_board()`

### `similarity.py` changes — PR #4, merged

Position-specific percentiles for scoring (Tier 1):
- `build_percentile_table()` / `_compute_percentiles()` — computes per-90 stat
  percentiles **within each position group** rather than globally. A striker's goals
  per 90 is compared to other strikers, not goalkeepers.
- This feeds into `_compute_scouting_score()` which `alpha_board.py` uses.

### Other backend changes (supporting)

| PR | What | Why |
|----|------|-----|
| #1 | Dynamic season detection + orjson + slim DB load | The season was hardcoded to 2025 (stale). Fixed to auto-detect via July rollover. orjson for faster JSON. Slim load to fit 512MB Render. |
| #2 | Enrichment must load full objects under slim mode | Bug: enrichment on a slim-loaded server would produce incomplete records. |
| #3 | Memory-safe enrichment + `enrich_only.py` | Enrichment moved off the web dyno (OOM risk). Created `enrich_only.py` for stats-only refresh. |

---

## Web Frontend Changes (MGSR-Team / mgsr-web)

### `AlphaBoardMen.tsx` (706 lines) — PR #17, merged

The main Alpha Board React component. Key sections:

**State:**
- `board: AlphaPlayer[]` — the ranked player list from the API
- `position` / `lens` — filter state (position group + trigger/signal lens)
- `search` — client-side text filter (name/club/league)
- `dismissedUrls` — locally dismissed players (hidden from view)
- `shortlistedUrls` — tracks which players have been added to shortlist
- `selected` — the player whose dossier drawer is open
- `rebuilding` — loading state for the "Rebuild" (actually "Refresh") button
- `lang` — `en` / `he` toggle

**Data fetching:**
- `fetchBoard(opts?)` — fetches `/api/war-room/alpha-board` with position/lens/lang
  params. If `opts.rebuild` is true, appends a cache-buster `_t` param. Called on
  mount and whenever filters change.
- Uses `AbortSignal.timeout(120000)` (2 min) to tolerate Render cold starts.

**UI structure:**
- Uses `.brit-room` chrome (same approach as MenShortlist) — NOT AppLayout nav.
- BritRail sidebar provides navigation.
- Header: date, time, language toggle, band label (€150k–€2m).
- Filter bar: signal lenses (All, Contract ≤12mo, Form Rising, etc.) + position groups.
- Board: cards grouped by tier (S/A/B/C), each showing name, club, position, age,
  market value, Alpha Score, verdict badge, trigger chips.
- Search bar for client-side filtering.
- Dossier drawer: full player detail panel when a card is clicked.
- Actions: shortlist add, dismiss, open on Transfermarkt.

**The "Rebuild" button (lines 322–329):**
```tsx
<button
  className={`brit-ra-refresh${rebuilding ? ' live' : ''}`}
  onClick={() => fetchBoard({ rebuild: true })}
  disabled={rebuilding}
>
  <span>{rebuilding ? (isHe ? 'בונה…' : 'Rebuilding…') : (isHe ? 'בנה מחדש' : 'Rebuild')}</span>
</button>
```
This does **NOT** trigger a database rebuild. It just **re-fetches the board** from
the API with a cache-buster. The label is misleading — it was discussed to rename
to "Refresh" (Hebrew: "רענן") but **this was NOT done yet**.

### `/war-room/alpha-board/page.tsx` — PR #17, merged

Page wrapper. Handles:
- Auth guard → redirect to `/login` if not authenticated
- Platform guard → redirect to `/dashboard` if platform is `women` or `youth`
- Men platform: renders `<AlphaBoardMen />` full-bleed (no AppLayout chrome)

### `/api/war-room/alpha-board/route.ts` — PR #17, merged

Next.js API route that proxies to the scout server:
- `GET` handler forwards `position`, `trigger`, `lang` query params
- Fetches from `${getScoutBaseUrl()}/alpha_board?${params}`
- 120s timeout (Render cold start tolerance)
- Returns JSON with `Cache-Control: no-store`
- Error handling: returns `{ error, board: [] }` with HTTP 502 on failure

### `BritRail.tsx` change — PR #17, merged

Added `'war-room'` to the BritRail navigation type union. The sidebar nav link
at line 130 points to `/war-room/alpha-board` and highlights when the pathname
starts with `/war-room`.

### `globals.css` — PR #17, merged

Added ~1,164 CSS rules for the Alpha Board under `.brit-ab-*` and `.brit-ra-*`
class prefixes. Includes card styles, tier badges, trigger chips, drawer styles,
filter bar, responsive layout.

---

## All Files Touched (Both Repos)

### football-scout-server (on main)

| File | PR | What |
|------|----|------|
| `alpha_board.py` | #5 | Alpha Board engine (scoring, triggers, board builder) |
| `similarity.py` | #4 | Position-specific percentiles for scoring |
| `server.py` | #5 | Added `GET /alpha_board` endpoint |
| `database.py` | #1, #2, #3 | Dynamic season, orjson, slim load, full-load for enrichment |
| `apifootball.py` | #1 | Dynamic `current_season()` with July rollover |
| `enrich_only.py` | #3 | Stats-only enrichment script |
| `run_build.py` | (existing) | Full rebuild script (used by Cloud Run) |
| `run_build_local.py` | #6 | Local full rebuild with change summary |
| `merge_rebuild.py` | #7, #9 | Loss-free merge of partial scrapes |
| `scrape_leagues.py` | #8 | Hardened gap scraper for specific leagues |
| `requirements.txt` | #1 | Added orjson dependency |

### MGSR-Team / mgsr-web (on main)

| File | PR | What |
|------|----|------|
| `mgsr-web/src/components/AlphaBoardMen.tsx` | #17 | Alpha Board React component (706 lines) |
| `mgsr-web/src/app/war-room/alpha-board/page.tsx` | #17 | Page route with auth/platform guards |
| `mgsr-web/src/app/api/war-room/alpha-board/route.ts` | #17 | API proxy to scout server |
| `mgsr-web/src/components/BritRail.tsx` | #17 | Added `'war-room'` nav type + sidebar link |
| `mgsr-web/src/app/globals.css` | #17 | `.brit-ab-*` / `.brit-ra-*` Alpha Board styles |
| `docs/brit-sport-group-war-room-alpha-board.html` | commit | v1 design mock |
| `docs/brit-sport-group-war-room-alpha-board-v2.html` | commit | v2 design mock |
| `docs/brit-sport-group-war-room-alpha-board-v3.html` | commit | v3 final design mock |
| `workers-job-scout-build/deploy.sh` | #18 | Cloud Run: 2Gi memory (fix OOM) |
| `workers-job-scout-build/run.sh` | #18 | Bounded git pack limits (fix push OOM) |

### MGSR-Team / mgsr-web — existing War Room files (NOT changed by us)

| File | What |
|------|------|
| `mgsr-web/src/app/war-room/page.tsx` | Original War Room page (~1400+ lines, 4 tabs: Discovery, Scout Agents, AI Search, Find Next). **Untouched.** |
| `mgsr-web/src/app/api/war-room/discovery/route.ts` | Discovery feed endpoint. **Untouched.** |
| `mgsr-web/src/app/api/war-room/report/route.ts` | AI dossier report endpoint. **Untouched.** |
| `mgsr-web/src/app/api/war-room/scout-profiles/route.ts` | Scout agent profiles endpoint. **Untouched.** |

---

## All PRs Related to War Room / Alpha Board

### football-scout-server

| PR | Title | Status | Branch |
|----|-------|--------|--------|
| #1 | Tier 0: dynamic season + orjson + slim load | ✅ Merged | `fix/dynamic-season-orjson` |
| #2 | fix: enrichment must use full objects under slim mode | ✅ Merged | `fix/enrichment-full-mode-under-slim` |
| #3 | fix: memory-safe enrichment (enrich off web dyno) | ✅ Merged | `fix/memory-safe-enrichment` |
| #4 | feat(scoring): position-specific percentiles (Tier 1) | ✅ Merged | `feat/tier1-smarter-scoring` |
| #5 | feat(alpha-board): /alpha_board ranked signable-deals endpoint | ✅ Merged | `feat/alpha-board` |
| #6 | tooling: run_build_local.py | ✅ Merged | `tooling/local-full-rebuild` |
| #7 | tooling: merge_rebuild.py | ✅ Merged | `tooling/merge-partial-rebuild` |
| #8 | tooling: scrape_leagues.py | ✅ Merged | `tooling/gap-scrape` |
| #9 | fix(merge): --no-drop mode | ⚠️ **OPEN** | `fix/merge-no-drop` |

### MGSR-Team

| PR | Title | Status | Branch |
|----|-------|--------|--------|
| #14 | docs(war-room): BRIT redesign mock UI | ⏸ Open (held) | `feature/war-room-web-restructure` |
| #15 | feat(war-room): split War Room into 4 standalone routes | ⏸ Open (held) | `feature/war-room-redesign-mock` |
| #16 | fix(scout-build): commit JSON DB files + default | ✅ Merged | `fix/scout-build-enrich-json` |
| #17 | feat(war-room): Alpha Board web UI | ✅ Merged | `feat/alpha-board-web` |
| #18 | fix(scout-build): 2Gi memory + bounded git pack | ✅ Merged | `fix/scout-build-oom-hardening` |
| #21 | fix(vercel): skip landing builds (Vercel cost) | ❌ Closed (not merged) | `fix/vercel-skip-landing-builds` |

---

## All Commits Related to War Room / Alpha Board

### MGSR-Team main (chronological, newest first)

```
af04b107  Merge pull request #17 from LiorD512/feat/alpha-board-web
5da99542  feat(war-room): Alpha Board web UI (Step 3 / Tier 2)
e14d18cb  docs(war-room): Alpha Board v3 — card board + €150k–2m acquisition band
2c6f46c5  docs(war-room): Alpha Board v2 — clean/focused + honest per-league data
c4c65f76  docs(war-room): Alpha Board concept mock (Sportmonks-shaped data)
```

### football-scout-server main (Alpha Board specific)

```
bda3dda   Merge pull request #5 from LiorD512/feat/alpha-board
<sha>     feat(alpha-board): /alpha_board ranked signable-deals endpoint
6b65dc6   Merge pull request #4 from LiorD512/feat/tier1-smarter-scoring
f677064   feat(scoring): position-specific percentiles (Tier 1)
```

---

## Current Live State

### Alpha Board endpoint

```
GET https://football-scout-server-l38w.onrender.com/alpha_board

Response:
  board          : 60 ranked players
  band           : { min: 150000, max: 2000000 }
  signals        : { in_band, form_rising, leverage, free, risers }
  total_in_band  : <varies>
```

### Web UI

- Route: `/war-room/alpha-board`
- Component: `AlphaBoardMen.tsx`
- Navigation: BritRail sidebar → "War Room" links to `/war-room/alpha-board`
- Platform: men only (women/youth redirected to dashboard)
- Auth: requires login
- Data: real, live data from the scout DB (26,830 players, 92.7% enriched)

### Original War Room

- Route: `/war-room`
- Component: `mgsr-web/src/app/war-room/page.tsx`
- Still fully functional, all 4 tabs (Discovery, Scout Agents, AI Search, Find Next)
- **Not changed** by any of our work

---

## Known Issues & Incomplete Work

### 1. "Rebuild" button label is misleading
The button in `AlphaBoardMen.tsx` (lines 322–329) says "Rebuild" / "בנה מחדש" but
only re-fetches the board (read-only GET). Should be renamed to "Refresh" / "רענן".
**Not done yet.**

### 2. No "data freshness" indicator
The board doesn't show when the underlying data was last updated. Discussed adding
a "data as of <date>" line to the header. **Not done yet.**

### 3. ~10 leagues still have stale clubs
See `football-scout-server/HANDOFF.md` → "Where We Stopped" section for the full
details. The Alpha Board pulls from whatever's in the live DB — players from stale
leagues show their old clubs. Fresh data for ~45/54 leagues is already live.

### 4. Alpha Score weighting not yet tuned on live data
The scoring weights in `compute_alpha()` were set based on the data structure, not
empirically tuned. Now that the board is live with fresh data, the user may want to
adjust trigger weights, the value-headroom curve, or the base-score blend.

### 5. War Room 4-route restructure (PRs #14/#15) is parked
The plan to split `/war-room` into 4 standalone routes (Discovery, Scout Agents,
AI Search, Find Next — each with its own page under a sidebar group) was designed
but the user decided **"not gonna merge for now."** These PRs are open and can be
revisited independently of the Alpha Board.

### 6. `merge_rebuild.py` `--no-drop` mode (PR #9) is not merged yet
The `--no-drop` flag that prevents false player drops during gap-fill merges is on
the `fix/merge-no-drop` branch. **Must be merged before any more gap-fill merges.**

### 7. Vercel landing build optimization (PR #21) was closed without merging
The fix to stop `mgsr-landing` from rebuilding on every push was closed. It should
be re-created — it's a correct, verified fix that saves Vercel build budget.

---

## Design Decisions Made by the User

These are explicit decisions the user made during the Alpha Board design process:

1. **"I prefer board than a list"** — led to the card-based board layout (v3 mock).
2. **"150k–2m euro market value"** — the exact acquisition band for the Alpha Board.
3. **"Men only feature"** — War Room/Alpha Board is men platform only.
4. **"Clean and organized that will focus me"** — no clutter, no excessive tabs, one
   focused ranked view.
5. **Build on the existing 26K scout DB, NOT new paid data sources** — rejected
   Sportmonks (doesn't cover lower leagues). Keep API-Football Pro ($19/mo) +
   Transfermarkt scraping.
6. **Alpha Board compute in Python scout server, not web JS** — reuses existing
   scoring engine. Web just renders.
7. **$7/mo Render tier** — rejected $25/mo. Slim DB load was built to fit 512MB.
8. **Weekly stats auto-refresh (Cloud Run cron) + manual club refresh locally** —
   stats refresh on Monday autopilot; clubs refreshed by user from their PC when
   needed (around transfer windows).
9. **"Not gonna merge for now"** — War Room 4-route restructure (PRs #14/#15) parked.

---

## Held / Parked PRs

| PR | Repo | Title | User's Words |
|----|------|-------|-------------|
| #14 | MGSR-Team | docs(war-room): BRIT redesign mock UI | "not gonna merge for now" |
| #15 | MGSR-Team | feat(war-room): split War Room into 4 standalone routes | "not gonna merge for now" |

These are independent of the Alpha Board and can be revisited at any time. They
propose restructuring the original `/war-room` page into 4 separate routes under
a sidebar navigation group. The Alpha Board was added as a standalone route and
does not depend on this restructure.
