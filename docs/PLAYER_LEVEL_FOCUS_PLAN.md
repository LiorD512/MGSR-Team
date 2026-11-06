# Roster Intelligence — weekly per-game signals (men platform)

Mock (open in a browser, EN/HE): [`brit-sport-group-roster-intelligence.html`](./brit-sport-group-roster-intelligence.html)
Setup: [`PLAYER_LEVEL_FOCUS_SETUP.md`](./PLAYER_LEVEL_FOCUS_SETUP.md)

## Goal
One dashboard section answering **what changed on the roster this week, and who needs attention** — not scores or tiers.
A list of flagged players, each with the reason and the real numbers behind it. Weekly, background, read-only.

## Data — Transfermarkt per-game log (covers the real roster)
Each player's **game-by-game history** comes from Transfermarkt's internal `ceapi/performance-game/{id}` endpoint
(JSON, reached server-side via the existing `TM_HTML_PROXY_URL`). Unlike the season-stats API (big leagues only),
this covers **all leagues incl. Israel and lower divisions** — proven on real roster-type players.

Per game we read: date, competition, **participationState** (played / in squad / not in squad), **minutes**, **started**,
**goals**, **assists**, **grade** (when the league provides it), injury flag.

**Enrichment, your way:** the data is fetched and stored on the player doc (`recentGames` + `recentGamesAt`) during the
normal **player-refresh job** (profile "Refresh" + any refresh flow). The weekly agent reads that field cheaply, and
**self-enriches** (fetches live) any player whose games are missing/stale — so it works even before a refresh cycle.

## Signals (each becomes the card reason)
| Signal | Fires when |
|---|---|
| 🔥 In form | goals/assists or high grades across the last few games |
| 📉 Form dip | playing but poor grades recently |
| 🪑 Out of the squad | "not in squad" in recent games after previously playing |
| 🛋️ On the bench | in the squad but 0 minutes across recent games |
| ⬆️ Breaking in | became a starter (recent starts, none before) |
| ⚽ Output surge | goals/assists in the last few games |
| 🩹 Back in action | returned after an injury/absence gap |
| 💹/🔻 Value move | market value ±15% (from marketValueHistory) |
| ⏳ Contract / 📄 Mandate | ending within 6 months / 30 days |

Each signal has a strength (0-100); cards sort by the strongest. Thresholds live in `mgsr-web/src/lib/tiering/config.ts`.

## Dashboard
Up to **20 flagged players**, strongest first. Each card: badge icon, name, a chip, the reason with numbers,
position + club, and a form sparkline. Click → drawer: all signals, a recent-form summary (played/starts/G+A/grade),
the **last games table**, and last contact.

## Honest limits
- Grades are null outside big leagues, so for Israeli-market players signals lean on minutes / starts / squad status /
  goals / assists — which is what matters for an agent anyway.
- The TM endpoint is private/undocumented: it works today and is the one TM's own site uses, but if TM changes it the
  enrichment is isolated in one function (`fetchRecentGames`) and easy to repoint. The signal engine is source-agnostic.
