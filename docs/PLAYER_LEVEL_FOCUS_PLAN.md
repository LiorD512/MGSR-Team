# Roster Intelligence — Phase 1 (men platform)

Mock (open in a browser, EN/HE): [`brit-sport-group-roster-intelligence.html`](./brit-sport-group-roster-intelligence.html)
Setup / operations: [`PLAYER_LEVEL_FOCUS_SETUP.md`](./PLAYER_LEVEL_FOCUS_SETUP.md)

## Goal
One section on the dashboard that answers: **who on our roster is worth working on next window, and at what level do they fit.**
Everything is computed by a background agent. No user interaction in Phase 1 — the dashboard only reads.

## The weekly agent
Runs once a week over the whole roster (GitHub Actions). For each player it reads everything we hold —
notes, contract, mandate, market value + history, match stats, FM ability, injuries/availability, club &
league strength — and the latest **news** (Google News + Gemini with Google Search), then computes:

1. **Quality score (0-100)** — weighted over five criteria, each dropped if we have no data (coverage lowers confidence):
   - Output 30 (match ratings + minutes), Ability 20 (FM CA/PA), Value 25 (market value, log scale),
     League/club 15 (league strength + club Elo), Availability 10 (injuries).
2. **Level / fit prediction** — which **league tier** (1 Elite … 5 Developing) and **role** (starter/rotation/squad)
   he realistically fits, plus a **ceiling** (one tier higher for young, rising players with FM upside) and a confidence.
   The AI may nudge the tier/ceiling by one step with reasons; the engine does the rest.
3. **Urgency (0-100) + push strength** — contract end, mandate expiry, concrete demand (matching open requests + news),
   momentum (form/value trend), neglect (days since contact) → push = now / high / medium / low.
4. **Saleability (0-100)** — how movable he is this window (demand, age curve, contract length, momentum).
5. **Worth (0-100)** — the single ranking score: `0.40·quality + 0.35·saleability + 0.25·urgency`.

## What the dashboard shows
The **top 10 by worth** (min worth 30), one ranked list. Each row: rank, name, **level chip + ceiling**, **push strength**,
the fit label ("Starter in Premium · ceiling Elite"), position/age/club, the strongest reason, and the worth score.
Click a row for a read-only drawer: AI summary, why he's worth it, news (with sources), the criteria breakdown
(how we judged the level), and effort (notes/tasks/last touch).

All weights, thresholds, tier definitions and the board size live in `mgsr-web/src/lib/tiering/config.ts` — tune after seeing real output.

## Alerts (optional)
If `TIERING_ALERT_EMAILS` is set, owners get one weekly digest push naming the top targets. No per-player alerts in Phase 1.

## Phase 2 ideas (not built)
Agent interaction (confirm/override level, mark extra targets), shortlist + the 48k ScoutProfiles universe,
"predicted best destination club" per target, and a learning loop from deals that actually happened.
