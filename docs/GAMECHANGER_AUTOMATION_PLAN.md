# MGSR Game-Changer Automation Plan

**Constraint:** Every feature must be **200% automation** — no user action required to *generate* value. The system runs in the background and **pushes** results (push notification, Feed, or one-glance surface). If the user has to remember to open a screen or click repeatedly, they will churn. The system must **push** value and **surface** it where the user already is.

**Out of scope (already implemented or planned elsewhere):** AI Scout search, Find The Next, War Room Discovery/Agents, Scout report on demand, similar players, hidden gems, voice requests, FM Intelligence, mandate generation. **Deal Pipeline** is excluded from this plan—it is not fully automated (user must create/move deals); it does not meet the 200% automation bar. Existing mocks for Live Market Radar, Squad Gap Analyzer, Agent Analytics, AI Negotiation are **UI references only**; the plan below treats them as **automation-first** builds where applicable.

---

## Research summary — landscape & data sources

Web research (tools, APIs, competitors) surfaces the following:

- **Competitors:** EnskAI, ATHLIVO, ScoutDecision, Inter AI (CRMs with request storage, tracking). Comparisonator/CompAI (virtual transfer, similar players, 271 leagues). TransferRoom: "Predicted Requirements" (≈85% accuracy club will recruit in 6 months), "Contingency AI" (clause triggers). None offer a fully automated, push-first, injury + rumor + sentiment pipeline for agents.
- **Transfer / market data:** Transfermarkt (scrapers e.g. Apify, no official API), Football Transfers News API (Zyla), Sportmonks (transfer rumours by player/team/date, probability LOW/MED/HIGH).
- **Injuries / availability:** API-Football (Injuries endpoint), Football Feeds, SportDevs (injuries updated every 1–20 min). Critical for "club has a gap now" automation.
- **Contracts / free agents:** Capology API (contracts by league/club), Transfermarkt scraper (contract expiry, free agents).
- **News / sentiment:** Sport News API (sentiment per article: positive/neutral/negative), Sportmonks News endpoint. Enables "buzz" alerts for roster players.
- **FIFA:** Professional Football Landscape (transfer value benchmarking from TMS)—web, no public API; third-party valuations (e.g. SciSports, Off The Pitch) exist.
- **Israeli league:** Transfermarkt Ligat Ha'Al, Statorium Israel Premier League API, PlayerStats.Football for stats.

**Gap:** No agent platform combines injury-driven opportunity + rumor-to-roster + media sentiment + "who to call first" in one automated, push-only flow. MGSR can own this.

---

## Boom features at a glance (200% automated — wow / boom effect)

| # | Feature | One-line wow |
|---|---------|----------------|
| 10 | **Injury-driven opportunity** | "Their key player is out → we push: you have 2 players that fit. Present now." |
| 11 | **Rumor-to-roster bridge** | "Your player is in a rumor with Club X" or "Rumor validates your open request." |
| 12 | **Media sentiment swing** | "Negative buzz on [Player] — accelerate deal" / "Positive buzz — leverage now." |
| 13 | **Who to call first** | Daily ranking: "Top 3 clubs to call today: 1. Beitar (CB injury) 2. Hapoel TA …" |
| 14 | **Contract clause countdown** | "3 roster players expire in 60 days" / "Mandate for [Player] expires in 30 days." |
| 15 | **Club-signed instant gap** | "Club X signed [position] — they may still need [other position]" or "Your player has competition." |
| 16 | **Opponent weakness before match** | "Hapoel TA play Saturday; 2 key players out. Pitch replacements now." |
| 17 | **Silent auction detector** | "Shortlist player [X] heating up — 3 clubs linked. Move or lose." |

---

## 1. Ghost Scout (24/7 server-side)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (Firebase Cloud Functions) + **Android** (push) + **Web** (Feed) |
| **What** | Scheduled job every 6h: fetch roster + shortlist from Firestore, call mgsr-backend for fresh TM data per player, detect value drop (>10%), contract expiring (<6m), club change, became free agent. Write `FeedEvent`; existing `onNewFeedEvent` sends FCM push. |
| **User action** | None. User gets push: "Marko Petković value dropped 12%". Tap → player or feed. |
| **Why game-changer** | Today refresh is device-bound (WorkManager). Ghost Scout runs in the cloud 24/7. Agents never miss a drop or contract window. |
| **Reference** | [GHOST_SCOUT_IMPLEMENTATION_PLAN.md](GHOST_SCOUT_IMPLEMENTATION_PLAN.md) |

---

## 2. Live Market Radar (automated signal feed + AI digest)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled ingest + Gemini) + **Web** (dedicated feed page) + **Android** (push for high-relevance) |
| **What** | Scheduled job: ingest signals (TM transfers/values, optional news RSS) for configured leagues. AI scores each signal for relevance to **my roster**, **my requests**, **my contacts**. Store in Firestore `MarketRadarSignals`. Daily 08:00: AI digest (3–5 bullets) written to `MarketRadarDigest/{date}`. Web: single page with digest at top + filterable signal feed. Push only for "roster/request impact" (e.g. "Hapoel TA fired coach — 2 of your deals affected"). |
| **User action** | Open Radar once to read digest and scroll; optional filter by league/type. No search or form. |
| **Why game-changer** | Market moves are scattered; agents lose deals by not knowing a club changed coach or a rival signed. One automated feed + one daily push = always informed. |
| **Reference** | [live-market-radar-mock.html](live-market-radar-mock.html) |

---

## 3. Predictive Club Needs (weekly run + push)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (mgsr-backend club-squad + Cloud Function) + **Web** (single page) + **Android** (push when high-urgency count changes) |
| **What** | Weekly job: get club list from Contacts + ClubRequests, call `GET /api/transfermarkt/club-squad` per club (with rate limit), compute need score per position (contract expiry, depth, age, loan). Write `PredictiveClubNeeds` cache. Web: one page listing "Clubs that will need CF/LW/… in 6 months" with urgency and reasons. Push: "5 clubs now need a striker (high urgency)" when cache updates and high-urgency count > 0. |
| **User action** | Open page to see list and act; optionally add "watch list" clubs. No per-club form. |
| **Why game-changer** | Agents who know a club will need a position **before** the request can prepare and pitch first. Fully automated from existing contacts/requests. |
| **Reference** | [PREDICTIVE_CLUB_NEEDS_PLAN.md](PREDICTIVE_CLUB_NEEDS_PLAN.md) |

---

## 4. Living Player Dossier (auto-refresh per player)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled Cloud Function) + **Web** (player detail tab) + **Android** (player detail section) |
| **What** | Daily job: for each roster + shortlist player, fetch TM + (if available) FBref, optional news headline. Call Gemini to synthesize: "Last 7 days: value -10%, 2 goals in 3 games, linked with Club X." Store in `LivingDossiers/{playerId}`. Player detail gets a "Dossier" tab/section: timeline of updates + current summary. No "Refresh" button—always last night's run. |
| **User action** | Open player → open Dossier. Zero clicks to refresh. |
| **Why game-changer** | Scouting reports go stale. One place per player that stays current without the agent chasing TM/news. |
| **Reference** | [MASTERPIECE_AI_FEATURES_PLAN.md](MASTERPIECE_AI_FEATURES_PLAN.md) § Living Player Dossier |

---

## 5. Request Match push (instant when request is added)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (Firestore trigger or Cloud Function on `ClubRequests` create/update) + **Android** (push) + **Web** (toast or Feed) |
| **What** | On new or updated Club Request: run existing War Room discovery (or recruitment) for that request's criteria; get top 5–10 matches. Write a FeedEvent or dedicated doc "RequestMatches/{requestId}" and push: "Hapoel TA new request: 4 players from your shortlist match." Deep link to War Room filtered by that request or to request detail with matches. |
| **User action** | Tap push → see matches. Optionally "Add all to shortlist" in one tap. |
| **Why game-changer** | Request comes in → agent gets a ready shortlist in seconds. No opening AI Scout and typing; automation does the match. |

---

## 6. AI Fair Value (automatic on player surfaces)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scout-server or new endpoint; can run on roster refresh or on-demand with cache) + **Web** (player card, shortlist row) + **Android** (player detail) |
| **What** | For each roster/shortlist player, backend computes or caches: predicted value, confidence band, vs. TM value (e.g. "Undervalued 19%"). Stored in Firestore or served from API. Web/Android show on player card: "AI Fair Value €2.5M (TM €2.1M) — 19% undervalued". No extra screen—always visible where the player is shown. |
| **User action** | None. Read the line when viewing a player. |
| **Why game-changer** | Negotiation without a fair-value anchor is blind. Automatic display removes friction and supports every conversation. |
| **Reference** | [MASTERPIECE_AI_FEATURES_PLAN.md](MASTERPIECE_AI_FEATURES_PLAN.md) § AI Fair Value Engine |

---

## 7. Morning Briefing (single daily push)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (Cloud Function 08:00) + **Android** (single FCM) + **Web** (optional in-app "Briefing" banner or email) |
| **What** | One job after Ghost Scout + Market Radar digest + Predictive Needs: aggregate counts (e.g. "2 value drops, 1 contract expiring, 3 request matches, 5 clubs need CF"). Single push: "Your MGSR Briefing: 2 drops, 3 request matches, 5 club needs. Open app." Tap opens Dashboard or a dedicated Briefing view listing the same bullets with deep links. |
| **User action** | One tap to open; scroll briefing items. No configuration after initial opt-in. |
| **Why game-changer** | One notification instead of many; agent starts the day with a full picture and no manual checking. |

---

## 8. Squad Gap Analyzer (scheduled + one screen)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (reuse club-squad + need logic from Predictive Needs) + **Web** (single page) + **Android** (optional screen) |
| **What** | Reuse club list (Contacts + ClubRequests) and squad/need computation. Store "SquadGaps" per club: positions with depth/contract/age issues and severity. One page: club selector → pitch view + list of gaps with "Your roster matches" (from existing request-match or discovery). No manual club search—only pick from list. |
| **User action** | Open page, pick club, read. Optional: tap "Present player" from match. |
| **Why game-changer** | Before a call, agent sees exactly where the club is short and which of their players fit—all precomputed. |
| **Reference** | [squad-gap-analyzer-mock.html](squad-gap-analyzer-mock.html) |

---

## 9. Agent Performance Analytics (auto-computed dashboard)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled or on Firestore writes) + **Web** (Analytics page) + **Android** (optional summary in Dashboard) |
| **What** | From existing data (deals, stages, commissions, shortlist adds, request matches): compute conversion funnel, revenue by agent/position/market, scout accuracy (e.g. shortlist → signed). Store in `AgentAnalytics` or derive on read. One page: charts + tables, no input. Optional weekly push: "This week: 2 signed, €45K pipeline added." |
| **User action** | Open Analytics to view. No configuration. |
| **Why game-changer** | Data-driven decisions and team accountability without spreadsheets or manual reporting. |
| **Reference** | [agent-performance-analytics-mock.html](agent-performance-analytics-mock.html) |

---

## 10. Injury-driven opportunity engine (200% automated — BOOM)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled or trigger; injury API) + **Android** (push) + **Web** (Feed / Opportunity list) |
| **What** | For clubs in Contacts/ClubRequests: poll injury/suspension API (e.g. API-Football, Football Feeds, SportDevs) for key players. When a key player at a tracked club is out (e.g. "starting CB, 3 months"), auto-match our roster for that position (existing discovery or recruitment). Push: "Beitar's starting CB out 3 months. You have 2 CBs that fit. Present now." Deep link to pre-filtered shortlist or War Room. |
| **User action** | None. Consume push → tap → present. |
| **Why game-changer** | Clubs buy when they have a hole. Injury = instant hole. No competitor automatically bridges "their player is out" → "your player fits." **Wow:** Agent is first to know and first to pitch. |
| **Data** | API-Football Injuries, Football Feeds, or SportDevs; club squad + position from mgsr-backend/Transfermarkt. |

---

## 11. Rumor-to-roster bridge (200% automated — BOOM)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled ingest; transfer rumours API) + **Android** (push) + **Web** (Feed) |
| **What** | Ingest transfer rumours (e.g. Sportmonks: by player/team/date, probability LOW/MED/HIGH). If rumour involves (a) a player in our roster/shortlist → push "Your player [X] linked with [Club Y]. Follow up?" (b) a club we have an open request for, and rumour is about position/player type that matches request → push "Rumor: [Club] want [position] — validates your open request. Consider accelerating." |
| **User action** | None. Read push and act. |
| **Why game-changer** | Rumours are leading indicators. Connecting them to *my* players and *my* requests is unique. Agent never misses "your guy is in the news." |
| **Data** | Sportmonks transfer rumours API; roster/shortlist and ClubRequests from Firestore. |

---

## 12. Media sentiment swing alerts (200% automated — BOOM)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled; news/sentiment API) + **Android** (push) + **Web** (player Dossier or Feed) |
| **What** | For roster (and optionally shortlist) players: pull news/sentiment (e.g. Sport News API — sentiment per article). When sentiment drops sharply (controversy, bad run) → push "Negative buzz on [Player] — consider accelerating deal before value drops." When sentiment spikes → push "Positive buzz on [Player] — leverage for negotiation." Store last sentiment state; only push on meaningful change. |
| **User action** | None. Act on signal. |
| **Why game-changer** | Value and demand follow perception. Automated sentiment = never caught off guard in a negotiation or by a sudden drop. |
| **Data** | Sport News API (sentiment), or Sportmonks News + Gemini sentiment; roster from Firestore. |

---

## 13. "Who to call first" daily ranking (200% automated — BOOM)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (single daily job after other jobs) + **Android** (push) + **Web** (Briefing or Dashboard) |
| **What** | AI ranks clubs (from Contacts + ClubRequests) by: Predictive Needs urgency + injury at club (gap now) + recent rumor/news about club + request match with our roster. Output top 3–5 "clubs to call today" with one-line reason each. Single push: "Today's top 3 to call: 1. Beitar (CB injury) 2. Hapoel TA (coach change) 3. Maccabi Haifa (request match)." Tap → Briefing view with deep links to club/request/players. |
| **User action** | None. One tap to open list; call. |
| **Why game-changer** | Removes "who do I call today?" — system decides from data. Maximum impact per call. |
| **Data** | PredictiveClubNeeds, injury API, Market Radar / rumours, RequestMatches; all already in plan. |

---

## 14. Contract clause & expiry countdown (200% automated)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled; contract data) + **Android** (push) + **Web** (player card badge or Feed) |
| **What** | For roster: track contract expiry and release clauses (from Transfermarkt/Capology or existing refresh). At 90 / 60 / 30 days before expiry or option deadline: push "3 roster players have contracts expiring in 60 days. Review mandates." Per-player: "Mandate for [Player] expires in 30 days." No user input. |
| **User action** | None. Act on reminder. |
| **Why game-changer** | Lost mandates and missed option windows cost deals. Fully automated countdown = zero slip-ups. |
| **Data** | Transfermarkt scraper (contract expiry), Capology API (if available); roster from Firestore. |

---

## 15. Club-signed instant gap (200% automated — BOOM)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (trigger or scheduled; transfer feed) + **Android** (push) + **Web** (Feed) |
| **What** | When ingest sees "Club X signed Player Y (position Z)" (Transfermarkt or news API): (a) If we have Club X in Contacts/Requests and Predictive Needs says they still need another position → push "Club X filled [Z]. They may still need [other position] — see Predictive Needs." (b) If we have a player in roster/shortlist in same position who was linked to Club X or in pipeline → push "Club X signed [Z]. Your player [A] (same position) now has competition — consider other clubs." |
| **User action** | None. Read and act. |
| **Why game-changer** | Signings change the board. Auto-interpreting them for *my* clubs and *my* players = stay one step ahead. |
| **Data** | Transfer feed (TM or Football Transfers News API), PredictiveClubNeeds, roster/shortlist. |

---

## 16. Opponent weakness before match (200% automated)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled; injury API + fixtures) + **Android** (push) + **Web** (Feed) |
| **What** | For tracked clubs (Contacts/Requests): get next fixture; get injury/suspension list for that club. If key players out before match day → push "Hapoel TA play Saturday; 2 key players out. Opportunity to pitch replacements to their sporting director." Deep link to our roster matches for those positions. |
| **User action** | None. Call before the match. |
| **Why game-changer** | Timing: right before a match, clubs feel the gap. Automated "they're short this weekend" = perfect pitch moment. |
| **Data** | Injury API, fixtures (e.g. API-Football, or league calendar), club list; roster match from discovery. |

---

## 17. Silent auction detector (200% automated — BOOM)

| Aspect | Detail |
|--------|--------|
| **Platform** | Backend (scheduled; rumours API) + **Android** (push) + **Web** (Feed) |
| **What** | Rumour ingest: when the same player is linked to 3+ clubs (by player ID or name match), flag "heating up." If that player is in our shortlist (or roster) → push "Shortlist player [X] heating up — 3 clubs linked. Move or lose." Optional: suggest "Present to [best-fit club from our requests]." |
| **User action** | None. Decide whether to move. |
| **Why game-changer** | Losing a player to a silent auction is painful. Early warning = agent can accelerate or pivot. No manual rumour tracking. |
| **Data** | Sportmonks transfer rumours (by player); shortlist/roster from Firestore. |

---

## Platform impact matrix

| Feature | Web | Android | Backend |
|---------|-----|---------|---------|
| Ghost Scout | Feed + badge | Push + Feed | Scheduled + FeedEvents |
| Live Market Radar | Feed page + digest | Push (high relevance) | Ingest + AI digest |
| Predictive Club Needs | One page + cache | Push (urgency change) | Weekly job + cache |
| Living Dossier | Player tab | Player section | Daily job + Firestore |
| Request Match push | Toast/Feed | Push + deep link | Trigger on Request |
| AI Fair Value | Player card/shortlist | Player detail | Compute/cache |
| Morning Briefing | Optional banner | Single push + view | 08:00 aggregate |
| Squad Gap Analyzer | One page | Optional screen | Reuse squad/needs |
| Agent Analytics | Analytics page | Optional summary | Compute/cache |
| **Injury-driven opportunity** | Feed / list | Push + deep link | Injury API + match |
| **Rumor-to-roster bridge** | Feed | Push | Rumours API + roster |
| **Media sentiment swing** | Dossier/Feed | Push | News/sentiment API |
| **Who to call first** | Briefing/Dashboard | Push + list | Rank from all signals |
| **Contract clause countdown** | Badge/Feed | Push | Contract data + schedule |
| **Club-signed instant gap** | Feed | Push | Transfer feed + Needs |
| **Opponent weakness before match** | Feed | Push | Injury + fixtures |
| **Silent auction detector** | Feed | Push | Rumours by player |

---

## Deliverables to create

1. **Plan document (English)** — This file (`docs/GAMECHANGER_AUTOMATION_PLAN.md`) is the single source of truth in the repo.

2. **Mockups for display**
   - Morning Briefing — Android notification + in-app Briefing view (list of bullets with deep links).
   - Request Match push — Push notification + War Room or Request detail with "X players match" and one-tap "Add to shortlist".
   - Living Dossier — Player detail with "Dossier" tab (timeline + 7-day summary).
   - AI Fair Value — Player card (web or mobile) with Fair Value line and short explanation.
   - Injury-driven opportunity — Push: "Beitar's CB out 3 months. You have 2 CBs that fit. Present now." + in-app opportunity list.
   - Rumor-to-roster — Push: "Your player [X] linked with [Club]" + Feed card.
   - Who to call first — Single push + Briefing row: "Today's top 3: 1. Beitar (CB injury) 2. Hapoel TA (coach change) 3. Maccabi Haifa (request match)."
   - Silent auction detector — Push: "Shortlist player [X] heating up — 3 clubs linked. Move or lose."
   - Squad Gap Analyzer (automation) — Optional refresh of [squad-gap-analyzer-mock.html](squad-gap-analyzer-mock.html) to show "Last updated by automated run" and roster-match chips.
   - Live Market Radar (automation) — Optional refresh of [live-market-radar-mock.html](live-market-radar-mock.html) to emphasize "AI Daily Digest" and "Relevance to your roster" as auto-generated.

All mocks should reuse the existing MGSR visual system ([deal-pipeline-command-center-mock.html](deal-pipeline-command-center-mock.html), [ai-scout-mock-5-glass.html](ai-scout-mock-5-glass.html)) for consistency.

---

## Implementation order (suggested)

- **Phase 1 (foundation):** Ghost Scout, Morning Briefing, Request Match push, Contract clause countdown.
- **Phase 2 (intelligence):** Live Market Radar (ingest + digest), Predictive Club Needs, AI Fair Value on player, Living Dossier, Squad Gap Analyzer, Agent Analytics.
- **Phase 3 (boom — data APIs):** Injury-driven opportunity engine (injury API), Rumor-to-roster bridge (rumours API), Media sentiment swing (news/sentiment API).
- **Phase 4 (boom — synthesis):** Who to call first (ranking), Club-signed instant gap, Opponent weakness before match, Silent auction detector.

This order delivers "something valuable every morning" first, then fills in intelligence surfaces, then adds external data (injury, rumours, sentiment), and finally the synthesis features that combine all signals for maximum wow.
