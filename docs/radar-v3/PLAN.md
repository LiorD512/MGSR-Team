# Transfer Radar v3: replan

Mock: `docs/radar-v3/index.html` on the PoC branch. It is built from the site's real `globals.css` and the real side menu, and uses real articles and real Transfermarkt (TM) matches.

## 1. What the user sees (and what is removed)

**Layout.** The page uses the same structure as Roster, Contacts and Club requirements:
- The masthead reads "TRANSFER **RADAR.**".
- KPI strip:
  - On the radar
  - New this week
  - Needs your check
  - Contract ending
- Filter tray:
  - Search
  - Situation, Country and Identity chip rows
  - Sort: Newest, Contract ending, Market value
- Feed and Ledger views.
- Section headers: Last 48 hours, This week, Earlier.
- The cards are the Release-alert player card (`brit-ra-alert`).

**Each card shows:**
- The player's real identity from TM: photo, full name, position, age, nationality, club crest, club and league, market value, and contract (shown in red when it ends within 6 months).
- The situation, in plain words.
- The newest headline, with date, outlet and country.
- How many sources there are.

**The player file (side panel) has three parts:**
1. **Is it really him?** The checks that link the name in the article to the TM profile. "Wrong player?" lets the user pick another candidate.
2. **What happened.** A dated timeline, oldest first. Each event links to its sources.
3. **Original sources.** The headline exactly as published in the original language, an English translation, the quote, the outlet's reliability, and a "Read the original" link.

**Actions:**
- **Add to shortlist:** the real Shortlist, which works now because every confirmed player has a TM URL.
- **Transfermarkt:** opens the player's TM profile.
- **WhatsApp:** shares the story.
- **Not relevant:** hides the player; the radar learns from it.

**Needs your check.** When the name fits more than one player, the card shows 2-3 TM candidates side by side, with an AI hint. One click confirms the right one, and the choice is remembered for future articles.

**Filtered out automatically.** Other sports, coaches and staff, and players above the market are listed behind one link, with the reason for each.

**Removed:** the score and meter, "recommended next step", "why it scores N", reliability dots on cards, and the "early signal" tags. The ranking that remains is by recency, contract end and market value.

## 2. Player identification (the core change)

There is a new pipeline stage, `identify`, between analysis and saving.

1. **AI extraction (upgraded prompt).** For each article the AI returns:
   - the name exactly as written, plus its Latin form;
   - the club as written;
   - role: player, coach or official;
   - hints from the text: position, nationality, age or "the Brazilian";
   - the sport, cross-checked with URL sections such as `/siatkowka/` (volleyball) or `/basket/`.
2. **Club first.** Find the club on TM (cached for 30 days), then read its current squad (cached for 3 days). Match the name inside that squad, using:
   - transliteration (Cyrillic, Greek, diacritics);
   - grammatical endings ("Chorého" → Chorý);
   - edit distance;
   - surname-only matching.
3. **Fallback by name.** If he is not in the squad (players who just left), run a TM name search. Keep only candidates whose current club, loan club or transfer history in the last 18 months includes the club in the article.
4. **Final gate.** Every match must be connected to the club in the article: in its squad, on loan from it, or moved from it within 18 months. Otherwise the match drops to "Needs your check".
5. **Ties.** The AI sees the article text and the 2-3 candidates (position, age, nationality) and picks one with a reason. If it is still unsure, a human picks.
6. **Learning.** Human picks and "wrong player" reports are saved as aliases. Later articles about the same player resolve automatically.
7. **Exclusions:**
   - not on TM, or the URL is another sport's section → other sport;
   - TM lists him as a coach or official → staff;
   - market value above a set ceiling → above your market;
   - already one of our roster players → shown with a "Your player" badge.

**Measured on 14 real radar players**, with the pipeline running through the agency's existing TM proxy:
- **Identified automatically and correctly (7):** Chorý, Perea (from "Переа"), Cordea, Rygaard, Viunnyk (from "Wjunnyk"), Simms, Kusu.
- **Correctly rejected (1):** Semeniuk, a volleyball player.
- **Sent to "Needs your check" (6):** "Хевертон" (Hevertton or Everton Bala), Abdallah, Guzmán, Fonseca, Matos, Mońka.
- **Wrong: 0.** The prototype once linked the wrong Abdallah (Pau FC, Ligue 2). The final gate caught it, and that is why the gate is mandatory.

## 3. Real original sources

- **Resolve redirect links.** Today about 70% of items come through Google News redirect links. They will be resolved to the publisher's article URL and stored. If a link can't be resolved, the UI says "via Google News".
- **Store per source:** original title, English translation, quote, language, outlet country, publication time, and reliability.

## 4. Timeline

- **Events:** reports about the same player are grouped into events by day and situation.
- **Titles:** each event gets a short plain-English title written by the AI, for example "Asks for immediate termination of his contract".
- **Moved players:** a confirmed move marks the player "Already moved", which keeps him for reference and sorts him last.

## 5. Cost and limits

- **TM requests:** about 3 per new player (club, squad, profile), and fewer with caching. They go through the existing html-proxy at a polite 2.5-6 s gap. About 60 new players per run takes around 10 minutes, within the 40-minute run budget.
- **AI:** tie-breaks and event titles use gemini-2.5-flash-lite, under $0.10/month extra. That keeps the total under the $5 cap.
- **No new services.**

## 6. Build order

1. **Pipeline:** the `identify` stage, a TM client that reuses `mgsr-web/src/lib/transfermarkt.ts`, caches, the verification gate, Google News URL resolution, event titles, and DB migration 4 (TM fields, candidates, aliases, events).
2. **API:** `players` (feed), `players/[id]` (file), `identify` POST (pick, wrong player), the shortlist bridge (`callShortlistAdd`), and `filtered`.
3. **UI:** rewrite `/transfer-radar` to match the mock. The v2 workspace UI from PR #84 is removed.
4. **Re-run** identification over the existing 30 days of data, then verify the results manually on a sample.
5. **Update** `ARCHITECTURE.md`.

## 7. Decisions for the owner

1. **Market ceiling:** what market value counts as "above your market"? For example, Ellis Simms is €12M at Coventry.
2. **"Needs your check":** may every agent pick, or only admins?
3. **Moved players:** keep them in the feed, marked "Already moved", or hide them?
