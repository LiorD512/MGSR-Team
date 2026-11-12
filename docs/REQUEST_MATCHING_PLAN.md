# Roster ↔ Club Request Matching — Accuracy Plan

Status: **Phases 0-3 implemented for the men platform on the web** (see §7). Phase 4 and Android / women / youth not started. Goal: for every open club request, return the roster players who genuinely fit, **ranked best-first with reasons**, and the same answer on Web, Android and Cloud Functions.

---

## 1. How it works today

Matching is a **yes/no filter**: no score, no ranking. A player "matches" if **all** of these pass:

| Check | Rule today |
|---|---|
| Position | Any of the player's positions equals the request position (ST→CF) |
| Age | `minAge ≤ age ≤ maxAge`, unless `ageDoesntMatter` or player age is unknown |
| Foot | Equal, unless the request is blank/"any" or the player's foot is unknown |
| Salary | Player tier ≤ request tier + 2 |
| Transfer fee | Player tier ≤ request tier + 1 |
| EU only | Any nationality is EU, unless nationality is unknown |

Results are stored as **id lists only** in `RequestMatchResults` / `PlayerMatchResults` (recomputed by Cloud Function triggers on every Players / ClubRequests / mandate write). Every screen then **sorts matches by market value, highest first**.

### Where it lives (four copies)

| Implementation | File | Used by |
|---|---|---|
| Cloud Function (authoritative, writes results) | `functions/callables/requestMatcher.js` + triggers in `functions/index.js` (~L1690-1790) | Precomputed results |
| Web | `mgsr-web/src/lib/requestMatcher.ts` | Requests board, `/requests/[id]`, shortlist, Press Room (merged **union** with precomputed) |
| Android | `app/.../features/requests/RequestMatcher.kt` | Android reads precomputed only, top 20 by value |
| Mandate matching (3 variants) | `requestMatcher.js` `mandateMatchesClub`, `MenRequests.tsx`, `app/requests/page.tsx`, Android `RequestsViewModel` | Precomputed (server) / badges (clients) |

---

## 2. What makes it inaccurate today

Ordered by impact.

1. **Mandate players match every request regardless of position.** In the Cloud Function a mandate that covers the club/country (or is `WorldWide`) adds the player to the request even if he's a goalkeeper and the request is for a striker; age/fee/EU are skipped too. A worldwide mandate = matches every open request. (The web/Android mandate *badges* do require position, so screens disagree.)
2. **Tier lists are out of sync with the forms.** The request/player forms offer 12 fee tiers and 13 salary tiers (`appConfig.ts` / `Config` docs), but all matchers only know the legacy 5 fee tiers (`Free/Free loan, <200, 300-600, 700-900, 1m+`) and 7 salary tiers. Any other value (`600-900`, `1-1.5m`, `2-3m`, `30-35`, …) falls back to **exact string equality** → good players rejected, wrong ones accepted. Android uses the config salary list, so it disagrees with web/server.
3. **Missing data counts as a pass.** Blank foot, salary, fee, age or nationality → the check passes. Since player `salaryRange`/`transferFee` are manual and often blank, the budget checks effectively don't run for most players. High recall, low precision, and nothing tells the agent "unknown".
4. **Market value is ignored for roster matching.** A €3M player matches a `<200` request whenever his `transferFee` field is blank. (`matchesMarketValueVsTransferFee` exists but is only used by the Press Room.)
5. **Ranking is by market value, highest first** — i.e. the *least affordable* players are shown first.
6. **Position logic is crude.** Primary and secondary positions count the same; no adjacency (CF↔SS, LW↔RW, AM↔CM); web only normalizes ST→CF while server/Android map long names ("Centre-Back") too.
7. **Inconsistent results across surfaces.**
   - Web shows local ∪ precomputed, so a player who *stopped* matching stays listed until the next trigger; Android shows precomputed only → different counts.
   - EU list: server uses a hardcoded 28-country set, web/Android use the `Config/euCountries` doc; web silently skips the EU check if the set hasn't loaded.
   - Age: server swaps min/max if inverted and treats `0` as unset; web/Android don't.
8. **Stale results.** Triggers don't fire on `marketValue`, `currentClub`, `contractExpired` (players) or `clubName`/`clubCountry` (requests); mandate expiry by date doesn't retrigger. Result docs of deleted players/requests are never cleaned up.
9. **No obvious exclusions.** A player can be matched to his own current club; players already offered to that club are not distinguished.
10. **No feedback loop.** Offers store `clubFeedback` as free text; request `status` never leaves `pending`. Nothing learns which matches were actually useful.

---

## 3. Target design

### 3.1 One engine, one truth

- A single pure matching/scoring module in `functions/` (plain JS, no Firestore access, fully unit-tested). The Cloud Function is the **only** writer of results.
- Web and Android **display** precomputed results (score + reasons); they stop running their own matchers for roster matching. The web local matcher is kept only for instant preview while a just-created request is waiting for its first result (and replaced, not unioned, once the result arrives).
- All tier lists, EU countries and position aliases are read from the `Config` docs (with the current fallbacks), never hardcoded per platform.

### 3.2 Two stages: hard gates → weighted score

**Stage A — hard gates (excluded, never shown):**

| Gate | Rule |
|---|---|
| Position | Player has no position that is exact **or** adjacent to the request position |
| Age (when known) | Outside `[minAge − 1, maxAge + 1]` (1-year soft band, configurable) |
| EU only (when nationality known) | No EU nationality |
| Budget (when market value or fee known) | Market value > 2.5× the top of the request's fee band, or fee tier > request tier + 1 |
| Foot (when both known) | Request is left/right and player is the opposite foot (`both` always OK) |
| Same club | Player currently plays for the requesting club |
| Request status | Request not `pending` |

Unknown data **never** gates — it lowers the score and the confidence instead.

**Stage B — fit score 0-100 (weights configurable in `Config/matchingWeights`):**

| Component | Weight | Scoring |
|---|---|---|
| Position fit | 25 | Primary exact 100 · secondary exact 75 · adjacent 40 |
| Budget fit | 20 | Market value / fee inside band 100 · below band 80 · up to 1.5× top 50 · up to 2.5× 20 · unknown 50. `Free/Free loan` requests: free agents / ≤6-month contracts 100 |
| Availability | 15 | Free agent 100 · contract ≤6 mo 90 · ≤12 mo 70 · on loan (returning) 60 · long contract 30 |
| Level & form | 15 | Recent minutes share + starts (`recentGames`), `PlayerTiers` signals (hot/benched/injury), league level of player's club vs requesting club |
| Age fit | 10 | Inside range 100 (bonus near the middle) · in the 1-year band 50 · unknown 60 · age doesn't matter 100 |
| Salary fit | 10 | Same tier 100 · −1/+1 tier 80 · +2 tier 50 · unknown 50 |
| Foot | 5 | Exact 100 · both 90 · unknown 60 |

**Modifiers (after the weighted sum):**
- **Mandate** covering the club / its country / worldwide: **+10** and a "Mandate" reason (boost, not a bypass — gates still apply).
- `interestedInIsrael` and the club is Israeli: **+5**.
- Already offered to this request or club: shown with an **"Offered"** tag and moved to a separate "Already offered" group; negative club feedback (see Phase 4): **−20** for that club.

**Confidence (0-100%):** share of score weight backed by real data. Shown next to the score so "85, high confidence" is different from "85, mostly unknown".

**Buckets for the UI:** Strong ≥ 75 · Good 55-74 · Stretch < 55 (Stretch hidden behind a toggle).

### 3.3 What gets stored

`RequestMatchResults/{requestId}`:
```jsonc
{
  "matchingPlayerIds": ["…"],   // kept for old app versions, now ordered by score
  "matches": [
    {
      "playerId": "…",
      "score": 86, "bucket": "strong", "confidence": 0.8,
      "reasons": ["primary_position", "budget_in_band", "contract_6m", "mandate_country"],
      "warnings": ["foot_unknown"],
      "offered": false
    }
  ],
  "engineVersion": 2, "updatedAt": 0
}
```
`PlayerMatchResults/{playerId}` gets the mirror (`requestId`, `score`, `bucket`, `reasons`).

### 3.4 UI changes

- Requests board and `/requests/[id]`: **sort by score**, show score + bucket, "why" chips (reasons/warnings), "Already offered" group, Stretch toggle.
- Player page "Matching requests": sorted by score with the same reasons.
- Android: same ordering and score badge (old versions keep working via `matchingPlayerIds`).
- A per-match **"Not a fit"** button with a quick reason (level / budget / profile / other) → `RequestMatchFeedback` collection. It hides the player for that request and feeds tuning.

---

## 4. Phased rollout

### Phase 0 — Data audit + baseline (read-only, ~1 day)
- Script (same pattern as `_youth_birthdays.ts`) that reports for men's data:
  - Coverage % of `positions`, `age`, `foot`, `marketValue`, `salaryRange`, `transferFee`, `nationalities`, `contractExpired`, `recentGames`.
  - Every distinct tier value actually present in requests and players (vs the `Config` lists); every distinct position string.
  - Whether `positions[0]` is the Transfermarkt main position (sample check).
  - Counts of offers with non-empty `clubFeedback`.
  - Current per-request match counts, and how many come only from the mandate shortcut.
- **Golden set:** for ~10 real open requests, agents mark the 3-5 roster players they would actually offer. This is the yardstick (precision@5) for everything after.

### Phase 1 — Fix correctness bugs (small, safe, high impact)
- Mandate must pass position (and the other gates); it becomes a boost later.
- Tier lists from `Config` everywhere; map legacy values (`700-900`, `1m+`) onto the new tiers instead of string equality.
- Use market value vs fee band as a gate for roster players.
- One position alias map (long names) on web too; one EU list (`Config`) on the server.
- Add retrigger fields: player `marketValue`, `currentClub`, `contractExpired`; request `clubName`, `clubCountry`, `clubTmProfile`. Delete result docs for deleted players/requests.
- Exclude players at the requesting club.
- Web: stop the union — show precomputed results, local only as a placeholder.

### Phase 2 — Scoring engine (core of the plan)
- Implement gates + score + confidence + reasons in the shared module, with unit tests for each component.
- **Shadow mode:** write `matches` alongside the existing ids; compare against the golden set; tune weights in `Config/matchingWeights` without redeploying.
- Switch web (then Android) to score ordering and reason chips; add "Not a fit".

### Phase 3 — Enrichment for "Level & form"
- Persist on the player: club league + league level (TM competition / `ClubEloIntel` level) and a season minutes/starts summary (the weekly tiering engine already fetches `recentGames`).
- Persist on the request at creation: club league, league level, squad average market value (from `clubTmProfile`). This lets us score "is this player the right level for this club".
- Prompt agents to fill missing `salaryRange`/`transferFee`/`foot` (show "missing data" warnings on matches).

### Phase 4 — Feedback loop
- Structured offer outcome next to the free-text feedback: `interested / rejected / no answer / signed` (backfill existing text with a simple classifier).
- Request lifecycle: `pending → fulfilled / cancelled`.
- Use outcomes + "Not a fit" reasons to re-tune weights; optionally parse request `notes` (e.g. "tall", "fast", "Israeli passport") into extra structured criteria with an LLM.

---

## 5. How we'll measure "super accurate"

| Metric | Target |
|---|---|
| Precision@5 vs agents' golden set | ≥ 80% (baseline measured in Phase 0) |
| Same matches + order on Web / Android / server | 100% |
| Matches shown with confidence ≥ 70% | Tracked; rises as Phase 3 fills data |
| "Not a fit" rate on Strong matches | < 10% |
| Offers that get positive feedback (once Phase 4 exists) | Trending up |

---

## 6. Decisions needed

1. **Strictness:** OK with a 1-year age band and 2.5× market-value cap as hard gates? Or stricter?
2. **Mandate:** confirm mandates become a **boost** (position + gates required), not an automatic match.
3. **Positions:** should adjacent positions (CF↔SS, LW↔RW, AM↔CM, DM↔CM, CB↔DM, RB↔RW…) be allowed as lower-scored matches, or exact positions only?
4. **Scope:** men first, then women/youth (youth requests have no salary/fee, so a lighter model)?
5. **Android:** include the Android UI update in Phase 2, or web first?
6. **Golden set:** who on the team can label ~10 requests for Phase 0?

---

## 7. Implementation status (men platform, web only)

Scope decision: **men platform, web app only**. Cloud Functions, Android, women and youth are untouched — they keep the
legacy matcher and the precomputed `RequestMatchResults`. The men web screens no longer read those results; they run
engine v2 directly in the browser (≈900 players × ≈40 requests evaluates in milliseconds).

Defaults chosen for the open decisions (all tunable, see below): 1-year age band, 2.5× budget gate, mandate = boost
(+10, gates still apply).

**Position rule (agency decision):** only the player's **main** position counts (`positions[0]`), except for wingers
and central/defensive midfielders. For LW / RW / CM / DM requests a secondary position also counts, and the paired
role counts as an adjacent fit (LW↔RW, CM↔DM), capped at 70 so it is never "Strong".

| Phase | What was built | Where |
|---|---|---|
| 0 — Audit + golden set | Read-only audit: field coverage, distinct/unparseable values, old vs new counts per request, legacy mandate-shortcut matches, exclusion reasons, precision@5/@10 vs agents' verdicts | `mgsr-web/_matching_audit.ts` (`npx tsx _matching_audit.ts [--request=<id>] [--json]`) |
| 0 — Golden set capture | 👍 Good fit / 👎 Not a fit (reason: level / budget / profile / availability / other) on every match | `/requests/[id]`, `app/api/matching/feedback` → `RequestMatchFeedback` (Admin SDK) |
| 1 — Correctness | Tier labels parsed to numeric bands (any Config tier, legacy labels too); one position alias map; market value vs fee band as a gate; mandate requires position; same-club exclusion; EU from `Config/euCountries`; min/max age swap; no precomputed ∪ local union | `src/lib/matching/{tiers,positions,engine}.ts` |
| 2 — Scoring engine | Hard gates → weighted 0-100 score, confidence, reasons/warnings, Strong / Good / Stretch, offered tags | `src/lib/matching/engine.ts`, labels `src/lib/matching/i18n.ts` |
| 2 — UI | Board counts/avatars = Strong + Good by score; request page grouped (main, Stretch toggle, Already offered, Not a fit) with score badge, bucket, confidence, reason chips; player page "Matching requests" ranked with score + reasons | `components/MenRequests.tsx`, `app/requests/[id]/page.tsx`, `app/players/[id]/page.tsx`, `components/MatchingRequestsSection.tsx` |
| 3 — Enrichment | Requesting club level = median market value of its current squad (per position, fallback whole squad), scraped and cached 14 days; form = minutes share over recent league games (player doc or `PlayerTiers`) + Roster Intelligence signals | `app/api/matching/club-profiles` → `ScrapingCache/matchClub_{vereinId}`; `hooks/useMatchingContext.ts` |

### Tuning without a deploy

Create `Config/matchingWeights` (Firestore console) with any of these numeric keys to override the defaults in
`DEFAULT_WEIGHTS`: `position, budget, availability, level, form, age, salary, foot, mandateBonus, israelBonus,
ageBandYears, budgetGateMultiplier, strongMin, goodMin, adjacentCap`. Re-run the audit to see the effect on the golden set.

### Not done (by scope)

- Phase 4 (structured offer outcomes, request lifecycle, learning from outcomes).
- Cloud Functions / Android / women / youth still use the legacy matcher, so Android counts can differ from the men web.
- Shortlist and Press Room "matching requests" still use the legacy `requestMatcher.ts`.

---

## 8. Club Fit model — "would THIS club sign a player like him?" (men web)

### Why
Engine v2 scored Anderson Niangbo and Jesse Akila **83 / Strong** for Pafos FC (CF, fee <200): free agent + in budget
outweighed a 10%-weight "level" check that could never exclude anyone.

### Data (verified on live Transfermarkt pages, Nov 2026)
| Data | Source |
|---|---|
| Club strength = median market value of the current squad (+ per position) | `/kader/verein/{id}` |
| Club's real signings, last 3 seasons: value at signing, age, position, origin club, fee (returns from loan / U19-U23 excluded) | `/transfers/verein/{id}/saison_id/{s}/…/plus/1` (new parser — the old `scrapeClubTransfers` mangles names and loses the origin club) |
| League code, league ø value, UEFA rank | squad header + `/startseite/wettbewerb/{code}` |
| Free agent's last club | `/ceapi/transferHistory/list/{playerId}` |
| Last game actually played | `/ceapi/performance-game` (existing `fetchRecentGames`) or `PlayerTiers` |

### Model (`src/lib/matching/level.ts`)
- **Gate:** excluded when his market value < 0.5 × the club's 10th-percentile signing value, or his (last) club's strength
  < 0.5 × the 10th percentile of the clubs it signs from. Needs ≥ 10 signings with values; unknown data never gates.
- **Score (30% weight):** average percentile of his value and his club's strength among the club's signings
  (≥ 40th percentile = 100).
- **Evidence caps:** no game for 12+ months → max Stretch; 6-12 months → max Good; level score < 25 → max Stretch;
  value > 3× the club's 90th-percentile signing → max Good ("far above what the club signs"), > 8× → max Stretch.

### Proof (shipped code, live data, `_matching_worker` builders → engine)
| Club (squad median) | Own real signings passing its gate | Level score AUC vs weaker club's signings |
|---|---|---|
| Pafos FC (€1m) | 43/43 | 0.96 vs KF Teuta · 0.74 vs Panetolikos |
| Panetolikos (€450k) | 42/42 | 0.91 vs KF Teuta |
| KF Teuta (€250k) | 43/45 | — |

CF request, no fee / age limits:
| Player | Pafos FC | KF Teuta | Panetolikos |
|---|---|---|---|
| Anderson Niangbo (€50k, last game May 2025) | **excluded (level)** | 54 Stretch (inactive 18 m) | **excluded (level)** |
| Jesse Akila (€100k, Shirak Gyumri) | **excluded (level)** | 87 Strong | 54 Stretch (level 4) |
| Landry Dimata (€2.5m — a real Pafos signing, control) | 95 Strong | 74 Good (far above level) | 95 Strong |

Caps applied to the clubs' own real signings (false-cap rate): level < 25 → 1-3 per club (≤ 7%), > 3× p90 → ≤ 1, > 8× → 0.
130 Transfermarkt fetches for 3 clubs + 3 players, no blocks.

### Running it
- **Weekly worker:** `.github/workflows/matching-worker.yml` (Mon 03:00 UTC, or *Run workflow*; options: force, single club)
  → `npx tsx _matching_worker.ts`. Writes `MatchingClubLevels/{vereinId}`, `MatchingData/{clubStrength,leagues,playerLevels}`.
  First run ≈ 40 clubs × ~40 pages + one lookup per free agent; later runs only refresh stale entries (clubs 7 d, strengths 30 d, players 7 d).
- **New request clubs** (before the next weekly run) are built on demand by `/api/matching/club-profiles` (≤ 25 pages, 45 s).
- **Audit:** `npx tsx _matching_audit.ts` now also prints coverage of the level data, the per-club backtest (own signings
  passing, AUC) and how many players each request excludes for level.
- Tunable in `Config/matchingWeights`: `level`, `levelGateFactor` (0.5), `levelMinSignings` (10) and the other weights.

### AI scout check (optional, button on `/requests/[id]`)
- `POST /api/matching/ai-check` → Gemini 2.5 Flash-Lite judges the top 10 with the facts above; **advice only, never hides a player**.
- **Hard cost cap:** max **60 calls / month** and recorded spend < $0.80, reserved with a Firestore transaction on
  `MatchingAiChecks/_budget_{YYYY-MM}` *before* calling; answers cached per request + inputs. Normal use ≈ $0.01-0.05 / month;
  worst case at 10× today's price ≈ $0.30 / month. Logged in `GeminiUsage` as feature `request-match`.
