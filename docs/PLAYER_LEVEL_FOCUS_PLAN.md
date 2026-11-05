# Roster Intelligence — weekly signals (men platform)

Mock (open in a browser, EN/HE): [`brit-sport-group-roster-intelligence.html`](./brit-sport-group-roster-intelligence.html)
Setup / operations: [`PLAYER_LEVEL_FOCUS_SETUP.md`](./PLAYER_LEVEL_FOCUS_SETUP.md)

## Goal
One section on the dashboard that answers: **what changed on our roster this week, and who needs attention.**
Not scores or tiers — a list of flagged players, each with the reason and the real numbers behind it.
Computed by a weekly background agent. Read-only (no user interaction).

## How "change" is detected
The stats API gives **season aggregates only** (no per-game log). So the agent **stores a weekly snapshot**
of each player's stats and compares this week to recent weeks. That turns a static season total into real movement.
- **Week 1** has nothing to compare → it flags absolute standouts (strong rating, high output, heavy minutes) + contract/mandate clocks. The UI says "baseline week".
- **Week 2+** → the week-over-week deltas drive everything.

## Signals (each becomes the reason on the card)
| Signal | Fires when | Tone |
|---|---|---|
| 🔥 In form | season rating rose ≥ 0.2 vs a recent snapshot | positive |
| 📉 Form dip | season rating fell ≥ 0.2 | negative |
| ⬆️ Playing more | was fringe, now +minutes / +starts — suddenly playing | positive |
| 🪑 Out of the side | was a regular, minutes stalled for 2+ weeks | negative |
| ⚽ Output surge | goals/assists jumped since last snapshot | positive |
| 💹 / 🔻 Value move | market value ±15% (from marketValueHistory) | positive/watch |
| ⏳ Contract | contract ends within 6 months | watch |
| 📄 Mandate | mandate expires within 30 days | negative |
| ⭐ 🎯 🏃 Standout (week 1) | high rating / high output / heavy minutes, when no history yet | positive/watch |

Each signal carries a **strength (0-100)**; cards sort by the strongest signal. A player can show several (e.g. "In form" +1 more).
All thresholds live in `mgsr-web/src/lib/tiering/config.ts` — tune after seeing real output.

## Data — in-app only (no external scrapers, no AI/news)
- **Our scout server** `/player_stats` (season rating, minutes, starts, goals/assists, per-90) — the one network call, cached ~weekly.
- **Players doc**: market value + history, contract, club, positions, age, notes.
- **PlayerDocuments (MANDATE)**, **ClubRequests**, **AgentTasks + notes** (last touch).

## What the dashboard shows
Up to **20 flagged players**, strongest signal first. Each card: badge icon, name, a chip (In form / Out of the side / …),
the reason with real numbers, position + club, and a **rating sparkline**. Click → read-only drawer: all signals for that
player, the season stats, last contact, and a link to his full profile.

## Phase 2 ideas (not built)
Per-game data if the API ever exposes it (true last-5 streaks), agent actions, shortlist universe.
