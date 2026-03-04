# MGSR — Game-Changer Automation Plan (Clear & Complete)

**One rule:** Every feature is **fully automated**. The system does the work in the background and **sends a push** or **shows the result** on screen. The user does not have to search, click, or remember anything. If they need to do something every time, they will stop using it.

**Language:** This document is in English. Mockups and UI copy can be Hebrew/English as in the rest of the product.

---

## Part 1 — What we are NOT doing

We are **not** including:

- Anything that already exists: AI Scout search, Find The Next, War Room discovery, scout reports, similar players, hidden gems, voice requests, FM Intelligence, mandate generation.
- Deal Pipeline as a “game-changer” — it needs the user to create and move deals, so it is not 200% automated.
- Features that need the user to open a screen and click “Run” or “Refresh” every time. Everything here **runs by itself** and **pushes** or **surfaces** the result.

---

## Part 2 — Recommended ranking (best first)

This is the recommended order to implement: **#1 = do first**, **#17 = do last**. Rationale: impact vs. effort, dependencies, and how much each feature drives daily use.

| Rank | Feature | Why this order |
|------|---------|----------------|
| **1** | Ghost Scout | Foundation. 24/7 monitoring is the base; without it you don’t know what changed. Uses existing TM + backend. Agents feel “someone’s watching my players.” |
| **2** | Morning Briefing | Single daily touchpoint. Surfaces everything else in one push. Can start with minimal data (e.g. Ghost Scout + Request Match counts). Highest “start your day” value. |
| **3** | Request Match (instant) | Immediate wow when a request lands. No new API; discovery already exists. “Request in → shortlist in seconds.” |
| **4** | Contract countdown | Simple, uses TM/contract data you already have or can add. Prevents lost mandates. Low effort, high payoff. |
| **5** | Who to call first | Synthesis feature. “The app tells me who to call today.” Depends on having other signals (Needs, injury, Radar), so after those exist. |
| **6** | Injury opportunity | Big differentiator. “Their player is out → you have 2 that fit.” Needs injury API. Do after foundation (club list + roster match ready). |
| **7** | Predictive Club Needs | Strong story: “These clubs will need a striker in 6 months.” Plan and TM flow exist. Weekly run is manageable. |
| **8** | Live Market Radar | High value; more moving parts (ingest + relevance + digest). Build after you have a stable feed/ingest pattern. |
| **9** | Rumor–roster bridge | Strong differentiator. Needs rumours API; fits naturally once Radar/ingest pipeline exists. |
| **10** | AI Fair Value | Always visible on player card. Concept exists in MASTERPIECE. Good once roster/refresh is stable. |
| **11** | Living Dossier | Daily per-player synthesis. Higher compute/cost. Do after Fair Value and when you want “one place per player.” |
| **12** | Club-signed gap | Depends on transfer feed + Predictive Needs. Do after both. |
| **13** | Silent auction detector | Depends on rumours ingest. Clear “move or lose” moment. After Rumor–roster. |
| **14** | Sentiment alerts | Needs news/sentiment API. Valuable but more “nice to have.” After news pipeline exists. |
| **15** | Opponent weakness before match | Same injury API as Injury opportunity; add fixtures. Do after Injury opportunity. |
| **16** | Squad Gap Analyzer | Reuses Predictive Needs; one screen. More “view” than “push.” After Predictive Needs. |
| **17** | Agent Analytics | Read-only dashboard. Important for teams but less “daily wow” than push features. Do last. |

**Summary:** Do **1–4** first (Ghost Scout, Briefing, Request Match, Contract countdown) for maximum impact with minimal new APIs. Then **5–9** (Who to call first, Injury, Predictive Needs, Radar, Rumor–roster). Then **10–14** (Fair Value, Dossier, Club-signed, Silent auction, Sentiment). Finally **15–17** (Opponent weakness, Squad Gap, Agent Analytics).

---

## Part 3 — All features in one table

| # | Feature name | One sentence | Where it appears |
|---|--------------|--------------|------------------|
| 1 | Ghost Scout | “Your players are monitored 24/7; you get a push when value drops, contract expires, or club changes.” | Push + Feed (Web & Android) |
| 2 | Morning Briefing | “One push at 08:00 with the day’s summary: drops, expiries, request matches, club needs.” | Push + Briefing screen (Web & Android) |
| 3 | Request Match (instant) | “When a club adds a request, we instantly find matching players and push: ‘X players match’.” | Push + War Room / Request (Web & Android) |
| 4 | Contract countdown | “We remind you 90 / 60 / 30 days before a player’s contract or mandate expires.” | Push + player/Feed (Web & Android) |
| 5 | Live Market Radar | “We ingest transfers, news, coaching changes; we score relevance to your roster and push only what matters.” | Feed page + daily digest + push (Web & Android) |
| 6 | Predictive Club Needs | “We analyse your contacts’ squads and push: ‘These clubs will need a striker in 6 months’.” | One page + push (Web & Android) |
| 7 | Living Dossier | “Every night we refresh each roster/shortlist player and write a short ‘last 7 days’ summary. You open the player and see it.” | Player tab/section (Web & Android) |
| 8 | AI Fair Value | “We show on every player card: ‘AI Fair Value €X (TM €Y) — Z% over/under’. No extra click.” | Player card / shortlist row (Web & Android) |
| 9 | Squad Gap Analyzer | “We show one screen per club: where they are short (position, contract, age). You pick a club and see gaps + your matching players.” | One page (Web, optional Android) |
| 10 | Agent Analytics | “We compute conversion, revenue by agent/position/market from your data. One read-only dashboard. Optional weekly push.” | Analytics page + optional push (Web, optional Android) |
| 11 | Injury opportunity | “When a key player at a club you follow is injured, we match your roster and push: ‘Club X’s CB out 3 months. You have 2 CBs that fit. Present now.’” | Push + Feed / opportunity list (Web & Android) |
| 12 | Rumor–roster bridge | “When a rumour involves your player or a club you have a request for, we push: ‘Your player X linked with Club Y’ or ‘Rumor validates your request’.” | Push + Feed (Web & Android) |
| 13 | Sentiment alerts | “We track news sentiment for your roster. Sharp drop → push ‘Negative buzz on [Player] — accelerate deal’. Spike → ‘Positive buzz — leverage now’.” | Push + Dossier/Feed (Web & Android) |
| 14 | Who to call first | “Every morning we rank clubs and push: ‘Top 3 to call today: 1. Beitar (CB injury) 2. Hapoel TA (coach change) 3. Maccabi Haifa (request match)’.” | Push + Briefing (Web & Android) |
| 15 | Club-signed gap | “When Club X signs a player, we push: ‘Club X filled position Z — they may still need [other position]’ or ‘Your player (same position) has competition’.” | Push + Feed (Web & Android) |
| 16 | Opponent weakness before match | “Before a tracked club’s match we push: ‘Hapoel TA play Saturday; 2 key players out. Pitch replacements now.’” | Push + Feed (Web & Android) |
| 17 | Silent auction detector | “When the same player is linked to 3+ clubs and he’s in your shortlist, we push: ‘Shortlist player X heating up — 3 clubs linked. Move or lose.’” | Push + Feed (Web & Android) |

---

## Part 4 — Each feature in detail

### 1. Ghost Scout (24/7 server-side)

- **What:** A scheduled job (e.g. every 6 hours) takes roster + shortlist from Firestore, fetches fresh Transfermarkt data per player via mgsr-backend, and detects: value drop &gt;10%, contract expiring in &lt;6 months, club change, became free agent. For each event it writes a FeedEvent; your existing logic sends an FCM push.
- **Platform:** Backend (Cloud Functions), Android (push + Feed), Web (Feed).
- **User action:** None. User gets e.g. “Marko Petković value dropped 12%” and taps to open player or feed.
- **Why game-changer:** Today refresh depends on the device (WorkManager). This runs in the cloud 24/7 so agents never miss a drop or contract window.
- **Mockup:** [MOCKUP-01] — Push notification: “Marko Petković — value dropped 12% (€750K → €650K)”. Tap opens player detail or feed. Feed card: same text + player photo + “View player” / “Add to shortlist” if not in roster.

---

### 2. Morning Briefing

- **What:** One daily job (e.g. 08:00) after Ghost Scout and Market Radar: it aggregates counts (value drops, contract expiries, request matches, high-urgency club needs). It sends a single push and writes a “Briefing” document for the day. The app shows a Briefing screen with bullets and deep links.
- **Platform:** Backend (Cloud Function 08:00), Android (one FCM + Briefing screen), Web (Briefing banner or page).
- **User action:** One tap to open the app and read the list. No configuration.
- **Why game-changer:** One notification instead of many; the agent starts the day with the full picture.
- **Mockup:** [MOCKUP-02] — (1) Push: “Your MGSR Briefing: 2 value drops, 1 contract expiring, 3 request matches, 5 clubs need CF. Open app.” (2) Briefing screen: title “March 2, 2026 — Your briefing”, list of 4–6 rows: “2 value drops” → tap to Feed filtered by value change; “1 contract expiring” → tap to player list filtered; “3 request matches” → tap to War Room; “5 clubs need CF” → tap to Predictive Needs. Same style as existing MGSR (dark theme, teal/purple accents).

---

### 3. Request Match (instant)

- **What:** When a Club Request is created or updated (Firestore trigger or Cloud Function), we run War Room discovery (or recruitment) for that request and get top 5–10 matches. We write RequestMatches for that request and send a push.
- **Platform:** Backend (trigger on ClubRequests), Android (push + deep link), Web (toast or Feed).
- **User action:** Tap push → see matches. Optional one-tap “Add all to shortlist”.
- **Why game-changer:** Request in → shortlist out in seconds; no need to open AI Scout and type.
- **Mockup:** [MOCKUP-03] — (1) Push: “Hapoel TA new request — 4 players from your shortlist match.” (2) Screen: “Request: Hapoel TA — CM, 22–26, €300–600K” with 4 player cards (photo, name, position, value, “Add to shortlist”). Button “Add all to shortlist”. Reuse War Room card style from existing mock.

---

### 4. Contract countdown

- **What:** We store contract expiry and option/mandate dates (from Transfermarkt or Capology). At 90, 60, 30 days we send a push. We can show a small badge on the player card (“Expires in 30d”).
- **Platform:** Backend (scheduled + contract data), Android (push + badge), Web (Feed + player badge).
- **User action:** None for the push; optional tap to open player.
- **Why game-changer:** No missed mandates or option windows.
- **Mockup:** [MOCKUP-04] — (1) Push: “3 roster players have contracts expiring in 60 days. Review mandates.” (2) Player card with small badge: “Mandate expires in 30d” (amber). (3) Feed card: “Omar Marshiano — mandate expires in 30 days” with link to player.

---

### 5. Live Market Radar

- **What:** Scheduled job ingests signals (transfers, value changes, coaching changes, optional news) for configured leagues. We score each signal for relevance to my roster, my requests, my contacts. We store signals and write a daily AI digest (3–5 bullets). We push only when a signal strongly affects roster or requests.
- **Platform:** Backend (ingest + Gemini digest), Web (Radar page: digest on top + filterable feed), Android (push for high relevance).
- **User action:** Open Radar to read; optional filter. No “Run” button.
- **Why game-changer:** One place for market moves; only relevant items pushed.
- **Mockup:** [MOCKUP-05] — Use existing live-market-radar-mock.html as base. Add at top: “AI Daily Digest — March 2, 2026” with 3 bullets (e.g. “Hapoel TA fired coach — 2 of your deals affected”, “3 roster value drops this week”, “Summer window in 89 days”). Below: “Relevance to your roster” badge on cards. Add “Last updated: 08:00” (automated).

---

### 6. Predictive Club Needs

- **What:** Weekly job: we take clubs from Contacts + ClubRequests, call mgsr-backend club-squad per club, compute “need” per position (contract expiry, depth, age, loan). We cache results. We push when there are new high-urgency needs. Web shows one page: list of clubs and positions with urgency and reasons.
- **Platform:** Backend (weekly job + cache), Web (one page), Android (push when count changes).
- **User action:** Open page to see list. Optional “watch list” of extra clubs.
- **Why game-changer:** Know who will need a position before they post a request.
- **Mockup:** [MOCKUP-06] — One page: “Clubs that will need players (next 6 months)”. Table or cards: Club name | Position | Urgency (High/Medium/Low) | Reason (e.g. “2 strikers expire”, “Only 1 CB”). Filter by position/urgency. “Last updated: Sunday 02:00” (automated).

---

### 7. Living Dossier

- **What:** Daily job: for each roster + shortlist player we fetch TM (and FBref/news if available) and call Gemini to write a short “Last 7 days” summary (value change, goals/assists, news). We store it per player. On player detail we show a “Dossier” tab with timeline and current summary. No Refresh button.
- **Platform:** Backend (daily job + Firestore), Web (player Dossier tab), Android (player Dossier section).
- **User action:** Open player → open Dossier. Nothing to click to refresh.
- **Why game-changer:** One up-to-date summary per player without chasing TM/news manually.
- **Mockup:** [MOCKUP-07] — Player detail, tab “Dossier”. Block at top: “Last 7 days — Summary” (2–3 sentences). Below: timeline “3 days ago: value -10%”, “5 days ago: 2 goals in 3 games”, “1 week ago: linked with Club X”. “Updated: last night 04:00” (automated).

---

### 8. AI Fair Value

- **What:** Backend computes (or caches) for each roster/shortlist player: predicted value, band, and vs. Transfermarkt (e.g. “Undervalued 19%”). We show one line on every player card and shortlist row: “AI Fair Value €2.5M (TM €2.1M) — 19% undervalued”.
- **Platform:** Backend (compute/cache), Web (player card, shortlist), Android (player detail).
- **User action:** None; just read when viewing a player.
- **Why game-changer:** Negotiation anchor without extra clicks.
- **Mockup:** [MOCKUP-08] — Player card (compact): photo, name, position, age, club. New line: “AI Fair Value €2.5M (TM €2.1M) — 19% undervalued” in teal. Tooltip or short line: “Based on age, position, stats, contract.”

---

### 9. Squad Gap Analyzer

- **What:** We reuse club list and squad/need logic from Predictive Needs. We store “gaps” per club (position, severity, reason). One page: user picks a club from the list → sees pitch view + list of gaps + “Your roster matches” (from discovery/request-match).
- **Platform:** Backend (same as Predictive Needs), Web (one page), Android (optional).
- **User action:** Open page, pick club, read. Optional “Present player” from match.
- **Why game-changer:** Before a call, see exactly where the club is short and who from your roster fits.
- **Mockup:** [MOCKUP-09] — Use existing squad-gap-analyzer-mock.html. Add “Last updated: Sunday 02:00” (automated). On each gap card add chips “2 roster matches” with link to filtered shortlist/War Room.

---

### 10. Agent Performance Analytics

- **What:** We compute from existing data (deals, stages, commissions, shortlist adds, request matches): conversion funnel, revenue by agent/position/market. One read-only dashboard. Optional weekly push: “This week: 2 signed, €45K pipeline.”
- **Platform:** Backend (compute on write or scheduled), Web (Analytics page), Android (optional summary).
- **User action:** Open Analytics to view. No configuration.
- **Why game-changer:** Data-driven decisions without spreadsheets.
- **Mockup:** [MOCKUP-10] — Use existing agent-performance-analytics-mock.html. Ensure all numbers are “auto-computed — no input”. Optional “Weekly summary” push copy in a small note.

---

### 11. Injury opportunity

- **What:** For clubs in Contacts/ClubRequests we poll an injury API (e.g. API-Football, Football Feeds, SportDevs). When a key player at a tracked club is out (e.g. “starting CB, 3 months”), we match our roster for that position and send a push with a deep link to the shortlist or War Room.
- **Platform:** Backend (injury API + roster match), Android (push), Web (Feed or “Opportunities” list).
- **User action:** None; tap push → present.
- **Why game-changer:** “Their player is out” → “your players that fit” in one automated step; be first to pitch.
- **Mockup:** [MOCKUP-11] — (1) Push: “Beitar’s starting CB out 3 months. You have 2 CBs that fit. Present now.” (2) Feed/Opportunity card: “Beitar Jerusalem — CB out (ACL, 3 months)”. “Your matches: Player A (CB, €400K), Player B (CB, €350K)”. Buttons “Present to Beitar”, “View in War Room”. Style consistent with existing Feed cards.

---

### 12. Rumor–roster bridge

- **What:** We ingest transfer rumours (e.g. Sportmonks: by player/team/date, probability). If a rumour involves (a) a player in our roster/shortlist we push “Your player X linked with Club Y”. If (b) a club we have an open request for is in a rumour for that position we push “Rumor: Club want position — validates your request.”
- **Platform:** Backend (rumours API + Firestore roster/requests), Android (push), Web (Feed).
- **User action:** None; read push and act.
- **Why game-changer:** Connect rumours to *my* players and *my* requests only.
- **Mockup:** [MOCKUP-12] — (1) Push: “Your player Marko Petković linked with Maccabi Haifa. Follow up?” (2) Feed card: “Rumor: Marko Petković → Maccabi Haifa (Medium probability)”. “Your roster” badge. “Follow up” / “View player”. Second variant: “Rumor: Hapoel TA want CM — validates your open request. Consider accelerating.”

---

### 13. Sentiment alerts

- **What:** For roster (and optionally shortlist) we pull news/sentiment (e.g. Sport News API or Sportmonks + Gemini). When sentiment drops sharply we push “Negative buzz on [Player] — consider accelerating deal”. When it spikes we push “Positive buzz on [Player] — leverage for negotiation.” We only push on meaningful change.
- **Platform:** Backend (news/sentiment API + roster), Android (push), Web (Dossier/Feed).
- **User action:** None; act on signal.
- **Why game-changer:** Don’t be caught off guard by a sudden drop or spike in perception.
- **Mockup:** [MOCKUP-13] — (1) Push: “Negative buzz on Omar Marshiano — consider accelerating deal before value drops.” (2) Feed card: “Sentiment drop — Omar Marshiano”. Short reason (e.g. “3 negative articles this week”). “View player” / “View Dossier”. Same for “Positive buzz” (green accent).

---

### 14. Who to call first

- **What:** One daily job ranks clubs (Contacts + ClubRequests) by: Predictive Needs urgency + injury at club + recent rumour/news + request match. We send one push with top 3–5 clubs and one-line reason each. Tapping opens Briefing with the same list and deep links.
- **Platform:** Backend (ranking job), Android (push + Briefing), Web (Briefing/Dashboard).
- **User action:** None; one tap to open list and call.
- **Why game-changer:** Answer “who do I call today?” from data.
- **Mockup:** [MOCKUP-14] — (1) Push: “Today’s top 3 to call: 1. Beitar (CB injury) 2. Hapoel TA (coach change) 3. Maccabi Haifa (request match).” (2) Briefing section or separate “Priority” block: numbered list 1–3 with club name, reason, “Call” / “View club” / “View request”. Reuse Briefing styling.

---

### 15. Club-signed gap

- **What:** When we see “Club X signed Player Y (position Z)” (from transfer feed): (a) If we track Club X and Predictive Needs say they still need another position we push “Club X filled Z. They may still need [other position].” (b) If we have a roster/shortlist player in same position linked to Club X we push “Club X signed Z. Your player A (same position) has competition.”
- **Platform:** Backend (transfer feed + Predictive Needs + roster), Android (push), Web (Feed).
- **User action:** None; read and act.
- **Why game-changer:** Interpret every signing for *my* clubs and *my* players.
- **Mockup:** [MOCKUP-15] — Feed card: “Club signed — Maccabi Haifa signed RW”. “They may still need LW (see Predictive Needs).” Or “Your player Lucas Moreno (LW) now has competition at Maccabi Haifa.” Buttons “View Predictive Needs” / “View player”.

---

### 16. Opponent weakness before match

- **What:** For tracked clubs we get next fixture and injury/suspension list. If key players are out before match day we push “Hapoel TA play Saturday; 2 key players out. Opportunity to pitch replacements.”
- **Platform:** Backend (injury API + fixtures), Android (push), Web (Feed).
- **User action:** None; call before the match.
- **Why game-changer:** Right before a match clubs feel the gap; perfect timing to pitch.
- **Mockup:** [MOCKUP-16] — Push: “Hapoel TA play Saturday; 2 key players out. Pitch replacements to their sporting director.” Feed card: “Match opportunity — Hapoel TA v Maccabi Netanya, Sat 15:00”. “Out: Player A (CB), Player B (DM).” “Your matches: [2 players]”. “Present now”.

---

### 17. Silent auction detector

- **What:** From rumours we detect when the same player is linked to 3+ clubs. If that player is in our shortlist (or roster) we push “Shortlist player X heating up — 3 clubs linked. Move or lose.” Optional: suggest “Present to [best-fit club]”.
- **Platform:** Backend (rumours API by player + shortlist), Android (push), Web (Feed).
- **User action:** None; decide whether to move.
- **Why game-changer:** Early warning so the agent can accelerate or pivot.
- **Mockup:** [MOCKUP-17] — Push: “Shortlist player Yusuf Özkan heating up — 3 clubs linked. Move or lose.” Feed card: “Silent auction — Yusuf Özkan”. “Linked: Club A, Club B, Club C.” “In your shortlist.” “Present to best match” / “View player”.

---

## Part 5 — Mockups to create (checklist)

Create one HTML mock per item below. Use the same visual system as deal-pipeline-command-center-mock.html and ai-scout-mock-5-glass.html (dark theme, teal/purple, Outfit/Syne, MGSR sidebar where relevant).

| ID | Mockup | Content |
|----|--------|--------|
| MOCKUP-01 | Ghost Scout push + Feed card | Push text + one Feed card with player photo, value change, “View player”. |
| MOCKUP-02 | Morning Briefing | Push text + Briefing screen with 4–6 rows and deep-link buttons. |
| MOCKUP-03 | Request Match | Push + screen “X players match” with 4 player cards and “Add all to shortlist”. |
| MOCKUP-04 | Contract countdown | Push + player card with “Mandate expires in 30d” badge + one Feed card. |
| MOCKUP-05 | Live Market Radar | Refresh of live-market-radar-mock.html: add “AI Daily Digest” block and “Relevance to your roster” + “Last updated 08:00”. |
| MOCKUP-06 | Predictive Club Needs | One page: table/cards of clubs, position, urgency, reason; “Last updated Sunday 02:00”. |
| MOCKUP-07 | Living Dossier | Player detail with “Dossier” tab: summary + timeline; “Updated last night 04:00”. |
| MOCKUP-08 | AI Fair Value | One player card with “AI Fair Value €2.5M (TM €2.1M) — 19% undervalued” line. |
| MOCKUP-09 | Squad Gap Analyzer | Refresh of squad-gap-analyzer-mock.html: “Last updated Sunday 02:00” + “X roster matches” chips on gaps. |
| MOCKUP-10 | Agent Analytics | Refresh of agent-performance-analytics-mock.html: note “All data auto-computed”. |
| MOCKUP-11 | Injury opportunity | Push + one Opportunity/Feed card: club, position out, “Your matches” + “Present now”. |
| MOCKUP-12 | Rumor–roster | Push + Feed card “Your player X linked with Club Y” and “Rumor validates request” variant. |
| MOCKUP-13 | Sentiment alerts | Push + Feed card “Negative buzz” and “Positive buzz” (two small variants). |
| MOCKUP-14 | Who to call first | Push + Briefing “Priority” block with top 3 clubs and reasons. |
| MOCKUP-15 | Club-signed gap | One Feed card: “Club X filled Z” + “still need [other]” or “your player has competition”. |
| MOCKUP-16 | Opponent weakness | Push + Feed card: match, players out, “Your matches”, “Present now”. |
| MOCKUP-17 | Silent auction | Push + Feed card: player, 3 clubs linked, “In your shortlist”, “Present to best match”. |

Suggested file names in `docs/`:  
`gamechanger-mock-01-ghost-scout.html`, `gamechanger-mock-02-morning-briefing.html`, … through `gamechanger-mock-17-silent-auction.html`.

---

## Part 6 — Implementation order

- **Phase 1 (foundation):** Ghost Scout, Morning Briefing, Request Match push, Contract countdown.  
  → Agent gets value every morning and never misses a request match or expiry.

- **Phase 2 (intelligence):** Live Market Radar, Predictive Club Needs, AI Fair Value, Living Dossier, Squad Gap Analyzer, Agent Analytics.  
  → Full intelligence layer with no extra user effort.

- **Phase 3 (external data):** Injury opportunity, Rumor–roster bridge, Sentiment alerts.  
  → Integrate injury API, rumours API, news/sentiment API.

- **Phase 4 (synthesis):** Who to call first, Club-signed gap, Opponent weakness, Silent auction detector.  
  → Combine all signals for “what to do now” and “who to call”.

---

## Part 7 — Platform summary

| Platform | Features |
|----------|----------|
| **Backend** | All 17: scheduled jobs, triggers, APIs (injury, rumours, news), Firestore reads/writes, push payloads. |
| **Web** | Feed, Briefing, Radar page, Predictive Needs page, Player Dossier tab, Player card (Fair Value), Squad Gap page, Analytics page, Opportunity/Feed cards for 11–17. |
| **Android** | Same as Web where applicable; push notifications for all; Briefing screen; optional Squad Gap and Analytics. |

---

*End of document. This file is the single clear, readable, detailed plan with mockup specs. Save it in the repo as the source of truth for the game-changer automation scope.*
