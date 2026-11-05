# Roster Intelligence — Phase 1 (men platform)

Mock (open in a browser, EN/HE): [`brit-sport-group-roster-intelligence.html`](./brit-sport-group-roster-intelligence.html)
Setup / operations: [`PLAYER_LEVEL_FOCUS_SETUP.md`](./PLAYER_LEVEL_FOCUS_SETUP.md)

## Goal
One section on the dashboard answering: **who on our roster is worth working on next window, and at what level do they fit.**
Computed by a weekly background agent. No user interaction in Phase 1 — the dashboard only reads.

## Data — ONLY what we already have (no external scrapers, no AI/news)
Per player, the agent reads:
- **Players doc** (already stored, no network): market value + history, contract expiry, club country, age, positions, mandate flag, notes.
- **FmIntelligenceCache** (Firestore, populated nightly): FM current & potential ability (CA/PA), FM tier.
- **Our scout server** `/player_stats` (Render, we control it): match rating, minutes, goals/90 — the one network call, result cached ~a week.
- **ClubRequests / PlayerMatchResults**: matching open requests (demand).
- **PlayerDocuments (MANDATE)**: mandate expiry.
- **AgentTasks + notes**: last touch / effort.

Removed on purpose: SofaScore, FotMob, ClubElo, Capology, Google News, live FMInside/Transfermarkt scrapes, Gemini — all external and blocked/unreliable from servers. The analysis is pure maths on our own data: fast, free, deterministic.

## The maths
1. **Quality score (0-100)** — weighted over four criteria, each dropped if we have no data (coverage lowers confidence):
   Output 35 (scout-server rating/minutes/goals), Ability 25 (FM CA/PA), Value 25 (market value, log scale), League 15 (club country strength).
2. **Level / fit** — predicted **league tier** (1 Elite … 5 Developing) + **role** (starter/rotation/squad) + a **ceiling** (one tier higher for young, rising players with FM upside) + confidence.
3. **Urgency (0-100) + push strength** — contract, mandate, demand (matching requests), momentum (value trend), neglect (days since contact) → now / high / medium / low.
4. **Saleability (0-100)** — how movable he is this window (demand, age curve, contract length, momentum).
5. **Worth (0-100)** — the single ranking score: `0.40·quality + 0.35·saleability + 0.25·urgency`.

All weights, thresholds, tier definitions and board size live in `mgsr-web/src/lib/tiering/config.ts` — tune after seeing real output.

## What the dashboard shows
The **top 10 by worth** (min worth 30), one ranked list: rank, name, level chip + ceiling, push strength, fit label
("Starter in Premium · ceiling Elite"), the strongest reason, the worth score. Read-only drawer: summary, why he's worth it,
the criteria breakdown (how the level was judged), effort (notes/tasks/last touch).

## Phase 2 ideas (not built)
Agent interaction, shortlist + ScoutProfiles universe, "predicted best destination club", and once we have a reliable feed,
optional news/context enrichment.
