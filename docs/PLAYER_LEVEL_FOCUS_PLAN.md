# Push board — Roster intelligence v3 (men platform)

Mock (open in a browser, EN/HE): [`brit-sport-group-push-board.html`](./brit-sport-group-push-board.html)
Setup / operations: [`PLAYER_LEVEL_FOCUS_SETUP.md`](./PLAYER_LEVEL_FOCUS_SETUP.md)

## The question the dashboard answers
Not "what does the roster look like?" but **"who do I act on?"** Only two groups appear:

| | Push now | Window targets |
|---|---|---|
| Who decides | Automatic (background analyst) | Any agent marks a player |
| Meaning | Something time-critical is happening | "We work hard on him in the next window" |
| Each row shows | Why (top reasons) · next step · deadline | Plan / next step · target clubs · days since contact |
| Leaves when | Agent presses **Done** (comes back only if a *new* reason appears) or the reasons go away | Agent unmarks |

Everyone else stays off the dashboard (still analysed in the background, visible on the player's drawer/profile).

## What puts a player on Push now
Each reason has a severity (3 = act today, 2 = this week, 1 = context). A player is on Push now when they add up to **3 or more**.

| Reason | Severity |
|---|---|
| Mandate expires | ≤7 days → 3 · ≤21 → 2 · ≤45 → 1 |
| Contract ends | ≤3 months → 3 · ≤6 → 2 · ≤12 → 1 (one lower for L4–L5 players) |
| Matching open club request | 2+ new (≤14 days) → 3 · 1 new → 2 · older → 1 (one lower for L4–L5) |
| News (AI: interest, transfer talk, injury, lost place) | 2 |
| AI plan says act now / this week | 3 / 2 |
| Window target with no contact for 14+ days | 3 |

Examples: mandate in 6 days → on. Contract in 5 months alone → off; plus a new matching request → on.

## Window targets
- Mark from the dashboard (**+ Add player** — list sorted by AI window-fit), from AI suggestions (one click), from the player drawer, or with the **Window target** switch on the player profile.
- On marking, the analyst immediately re-runs for that player and builds the plan around the coming window (targets, how, when, next step).
- The header shows the nearest window (Israel first).

## The analyst (background, no buttons)
Unchanged engine, new outputs: every roster player is analysed every 3 hours (news, match data, FM, injuries, club strength, contract, mandate, requests, windows, notes/tasks) and Gemini + Google Search returns: level (±1), news digest, risks, push plan **with a one-line next step**, and a **window-fit score** (used for suggestions).

## Alerts
Push to the owner once when a player lands on Push now with a new set of reasons: "Push now: Amit Rosen — Mandate expires in 6 days → Renew the mandate today, then call Beer Sheva". AI-worded reasons are keyed by type only, so rephrasing never re-alerts.

## Level
Still computed (five weighted criteria) but no longer the headline: it is shown as a small L1–L5 chip and on the drawer ("how we judged him"), and it tempers contract/request urgency for low-level players.
