# Level & Focus — Player Tiering with AI (Men platform)

Status: **draft for discussion** · Interactive mock: [`brit-sport-group-level-focus.html`](./brit-sport-group-level-focus.html) (open in a browser; EN/HE toggle, press `/` for Ask AI)

---

## 1. The problem

- The database is huge (roster + shortlist + ~48K `ScoutProfiles` + Transfer Radar). Nothing tells us **how good** a player is *in our own terms*, nor **how hard** we should work on him.
- Dashboard "Roster intelligence" today = top 6 by market value (`MenDashboard.tsx` ~L793, ~L1427). Static, not clickable, no decision value.
- Existing tiers don't solve it and use overlapping words: `sign/monitor/watch` (`scout-profiles/route.ts`), `A/B/C` + `SIGN/MONITOR/PASS` (Alpha Board). Those are **per-search verdicts**, not a persistent agency judgement.

## 2. Core idea: two separate questions

Mixing "how good" and "how urgent" into one tier is the classic trap (a great player with 3 years of contract needs less effort than an average one whose mandate expires Friday). So we store them separately.

| Axis | Question | Values | Who sets it |
|---|---|---|---|
| **Level** | What can he play at? (current ability, market-adjusted) | L1 Elite · L2 Premium · L3 Core · L4 Depth · L5 Developing | AI proposes → human confirms |
| **Focus** | How much effort now? | F1 Push now · F2 Active · F3 Maintain · F4 Park | AI proposes → human confirms |
| **Trend** (signal) | Rising / flat / falling | ▲ ● ▼ | AI only |

Level × Focus gives a 5×4 matrix = the **effort allocation map** (the main board).

> Naming: "Level 1-5" and "Focus" deliberately avoid A/B/C and sign/monitor/watch so the three concepts never get confused. Alpha Board verdicts remain *search-time* opinions; Level & Focus is the *persistent* one.

### Level definitions (to be confirmed with the team — see open questions)
| Level | Meaning for our market |
|---|---|
| L1 Elite | Moves us into top-5 / Champions-League-level deals |
| L2 Premium | Starter at strong European clubs / top of Ligat Ha’al |
| L3 Core | Reliable top-flight starter |
| L4 Depth | Rotation / lower division |
| L5 Developing | Unproven, long-shot, or declining |

Potential is **not** baked into Level. It shows up as **Trend** and in AI's ±1 upside adjustment (always explained).

## 3. How the AI is involved (the "wow")

Principle: **maths is cheap and runs on everyone; AI is expensive and runs where it matters; humans decide.**

```
Stage 1  Deterministic score (all players, no AI cost)
         weighted: output percentile (position+league adjusted), FM CA/PA, market value percentile,
         league coefficient, form  → score 0-100 → thresholds → base Level
Stage 2  Candidate filter
         roster, shortlist, mandate targets, open-request matches, borderline scores (±3 of a line),
         big movers (value, form, contract) → ~1-2% of universe
Stage 3  Gemini analysis (gemini-2.5-flash, JSON out, existing pattern)
         input: stats + FM + notes + highlights + contract/mandate + demand
         output: adj (-1|0|+1), trend, reasonEn/reasonHe, evidence[], confidence
Stage 4  Delta engine
         only changes to Level/Focus go to the human inbox; everything else updates silently
```

Guard-rails (non-negotiable): AI moves a level **max ±1**; AI **never writes** a confirmed tag — it writes a *suggestion*; every change has reason + history; per-player **lock**; confidence shown; dismissed suggestions aren't repeated until data changes.

### Wow moments in the mock
1. **Before/After** dashboard module (toggle on Overview).
2. **AI inbox** — "accept all ≥ 85% confidence", one-click accept/adjust/dismiss.
3. **Player drawer** — ladder with AI marker, streamed "re-run analysis", evidence chips, signal breakdown, history, same-level peers.
4. **Ask AI** (`/` anywhere) — natural language over the roster: "Who should I push this week?", "Core players expiring in 6 months", "Anyone drifting down?"
5. **Calibration with live impact** — move a weight or threshold and instantly see which players change level before saving.
6. **Effort vs. priority** — compares where your time went to where it should have gone.

## 4. Flows

### 4.1 Nightly loop
```mermaid
flowchart LR
  A[Data refresh: TM, FM, stats, requests, mandates] --> B[Stage 1 score all]
  B --> C[Stage 2 candidates]
  C --> D[Stage 3 Gemini]
  D --> E{Delta vs confirmed tag?}
  E -- no --> F[Update score silently]
  E -- yes --> G[Suggestion in AI inbox]
  G --> H{Human}
  H -- accept --> I[Write tag + history]
  H -- adjust --> I
  H -- dismiss --> J[Snooze until data changes]
```

### 4.2 Agent daily flow
Dashboard → sees "AI needs your call (n)" + "Focus now" → opens drawer → accepts/overrides (reason) → logs contact → effort bars update.

### 4.3 Manual tagging flow
Player profile or board → set Level/Focus (reason optional, required if overriding AI) → history entry → optionally lock.

### 4.4 Universe flow (large DB)
Stage 1 weekly on `ScoutProfiles` after the scout build; Stage 3 only for top ~2% + borderline. AI Scout / War Room gain a **Level filter and badge**. A player promoted from Radar/Scout to roster **inherits** their computed Level.

## 5. Screens (all in the mock)

| # | Screen | Purpose |
|---|---|---|
| 1 | **Overview → Roster intelligence (After)** | Replaces the top-6 table: level distribution bar (clickable), Focus-now list with AI "why", AI-needs-your-call, attention gaps, effort-vs-priority, Ask AI box |
| 2 | **Level & Focus board** | Matrix (Level×Focus, pills with gold dot = pending AI suggestion) + list; filters; bulk set |
| 3 | **Player drawer** | Ladder, focus, AI read, evidence, signals, override reason, lock, peers, history |
| 4 | **AI inbox** | Review queue sorted by impact; batch accept |
| 5 | **Engine** | Pipeline visibility, populations & cadence, cost, guard-rails |
| 6 | **Calibration** | Weights, thresholds, position presets, live impact preview |
| 7 | **Ask AI overlay** | Natural-language roster queries |

Dashboard replacement is the primary deliverable; the rest are what makes it trustworthy.

## 6. Data model (proposal)

New collection, keyed by Transfermarkt id so it covers **non-roster** players too:

`PlayerTiers/{tmId}`
```
level: 1-5            // confirmed (human)
focus: 1-4            // confirmed (human)
locked: bool
confirmedBy, confirmedAt
ai: { baseLevel, adj, suggestedLevel, suggestedFocus, trend, score, urgency,
      confidence, reasonEn, reasonHe, evidence[], model, computedAt, dataHash }
dismissedUntilHash?: string
history/{auto}: { at, by, kind: manual|ai-accepted|bulk|system, from, to, reason }
```
Roster `Players` gets denormalised `tierLevel`, `tierFocus` (read by dashboard without a join; add to `ALLOWED_UPDATE_FIELDS` in `functions/callables/players.js` or write only through a dedicated callable). Config doc `Config/tiering` holds weights/thresholds/presets by position.

Rules: read for authenticated users; writes only via callable (audit trail) + backend job for `ai.*`.

## 7. Scoring (v1)

- `score = Σ wᵢ·signalᵢ / Σ wᵢ`, signals 0-100: output (percentile within position, league-coefficient adjusted), FM CA/PA index, market-value percentile, league strength, form. Defaults 30/25/20/10/15.
- Thresholds (L1…L4): 78 / 64 / 50 / 36.
- `urgency = .38·time + .27·demand + .17·gap + .18·momentum` (time = contract months & mandate days; demand = matching open requests; gap = days since last touch).
- `focus = f(.7·urgency + .3·levelWeight)`; thresholds 62 / 50 / 39.
- Position presets (forwards weight output, GK weight form, youth weight potential).
- Reuse: `parseMarketValue`, `computeVerdict` ingredients in `scout-profiles/route.ts`, FM data via `playerIntel.ts`, stats via `fetchPlayerStats`.

## 8. Technical plan (where it lands)

| Layer | Work |
|---|---|
| Lib | `lib/tiering/{score,urgency,thresholds,types}.ts` (pure, unit-testable) |
| API | `POST /api/tiering/analyze` (Gemini, single player), `GET /api/tiering/list` (paginated, server-side — no whole-collection listeners), `POST /api/tiering/ask` |
| Jobs | Nightly/weekly GitHub Actions or Cloud Run worker, same pattern as `radar-pipeline.yml` / scout build |
| Callables | `tiersSet`, `tiersAcceptSuggestion`, `tiersBulkSet` (with history) |
| UI | `components/tiering/{LevelChip,FocusChip,TierMatrix,TierDrawer,TierInbox,RosterIntelligence}.tsx`; replace the module in `MenDashboard.tsx`; new routes `/tiering` (+ `/tiering/inbox`, `/tiering/calibration`) |
| i18n | EN + HE keys in `LanguageContext.tsx`; RTL verified (mock already has it) |
| Flags | `featureFlags.ts` → `TIERING_ENABLED` for staged rollout |
| Integrations | Level badge in `/players`, shortlist, AI Scout, War Room; task creation from "attention gaps" |

## 9. Rollout

1. **MVP (roster only):** Stage 1 + manual tagging + dashboard module + board + drawer. No Gemini yet.
2. **AI layer:** Gemini analysis, inbox, history, Ask AI.
3. **Calibration + effort tracking** (needs contact/task logging hooks).
4. **Universe:** shortlist + ScoutProfiles scoring, badges in AI Scout / War Room.
5. **Learning loop:** feed accept/dismiss decisions back as few-shot examples and auto-suggest weight changes.

## 10. Risks

- **Trust:** wrong early suggestions kill adoption → start roster-only, show confidence, keep humans in control.
- **Cost / rate limits:** Gemini free-tier limits already shaped `war-room/report`; the candidate filter keeps volume ~1-2%.
- **Data gaps:** many players lack FM/stats → compute confidence from coverage and say "low data" instead of guessing.
- **Scale:** don't use `onSnapshot` on the universe; paginate server-side.
- **Concept collision** with Alpha Board tiers → naming + UI separation (see §2).

## 11. Open questions — need your decisions

1. **Scope of "database":** is the first target the **roster (~40)** + shortlist, or the full **ScoutProfiles universe** from day one? (Plan assumes roster first.)
2. **Level definitions:** are 5 levels right, and what do they mean *for your market* (Ligat Ha’al vs. Europe vs. Gulf)? Do you want position-specific bars?
3. **Who may change tags:** any agent, or only admins/owners? Should overrides of AI require a reason?
4. **Focus drivers:** besides contract/mandate/requests, do you want revenue potential (commission estimate) as a driver?
5. **Effort tracking:** can we count "touches" from notes/tasks/contacts automatically, or do we need a quick-log button?
6. **Alerts:** push/WhatsApp when a player becomes F1 or an Elite player's contract <6 months?
7. **Women/Youth platforms:** men only for now, or design the collection to be platform-aware from the start (`PlayerTiersWomen`, …)?
