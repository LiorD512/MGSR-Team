# B.S.G. Transfer Radar — Requirements

> Status: **DRAFT v3 (FREE-FIRST, ≤ $6/month) — awaiting approval. No implementation code has been written.**
> **Owner budget rule: free services first; the only permitted spend is the already-paid Gemini key / existing project payments, capped at ≈ $5–6/month of extra usage (see R0). Article text is English only.**
> Scope: **Men platform, web only** (`mgsr-web`). Android and Women/Youth platforms are explicitly out of scope
> (this is a deliberate, user-requested exception to the repo's "Android + Web together" golden rule).
> Companion docs: `design.md` (architecture, feasibility, schema, costs), `tasks.md` (phased plan).

## 0. Glossary

| Term | Meaning |
|---|---|
| **Source** | A website, feed, club/league site, or (Phase 3) social account that publishes football information |
| **Article** | One collected item from a Source (news page, feed entry, post) |
| **Report** | A structured, AI-extracted claim about one player from one Article |
| **Signal** | A normalized, categorized meaning of a Report (e.g. `EXCLUDED_FROM_SQUAD`, `CLUB_WANTS_TO_SELL`) |
| **Origin** | The original publisher of a claim. Many Articles can share one Origin (syndication / "according to…") |
| **Opportunity Score** | Deterministic 0–100 value per player, computed from Signals by rules (not by the LLM) |
| **Verification status** | `CONFIRMED` / `REPORTED` / `RUMOR` / `AI_INFERENCE` — see R16 |
| **Market Radar** | The *existing* `/market-radar` feature (Google-News-RSS based). Transfer Radar coexists with it (see R20.6) |

Priority tags: **[P1]** MVP, **[P2]** Phase 2, **[P3]** Phase 3.

---

## R0. Budget Constraint [P1 — overrides every other requirement]

Acceptance criteria
1. **Free first:** each capability SHALL use a free service when one exists. No new paid subscriptions, plans or card-requiring signups SHALL be introduced.
2. The only paid usage permitted is **LLM calls on the project's existing Gemini key** (separate Radar API key in the same project), limited by a **hard monthly cap of $5 (absolute ceiling $6)**, configurable only by explicit owner approval.
3. The cap SHALL be enforced in software: spend is computed from the token counts returned by each API response and a price table in config; paid calls SHALL stop at 100 % of the cap, a warning SHALL show at 80 %, and daily sub-caps SHALL prevent a runaway day (default: cap ÷ 20 per day). A kill-switch flag SHALL disable all paid calls.
4. Paid LLM calls SHALL occur only after free capacity for the day is exhausted (free-first routing).
5. The feature SHALL NOT add usage to other billable Google Cloud/Firebase services (Cloud Run, Pub/Sub, Cloud Tasks, Cloud Scheduler, Secret Manager, new Cloud Functions, Cloud Storage); Firestore use SHALL stay below ~300 reads/day and ~0 writes/day.
6. When budget or free quota is exhausted the system SHALL degrade (queue, prioritize, pause lower tiers) and SHALL display the degradation — never fail silently and never overspend.
7. If a capability cannot be delivered within budget it SHALL be delivered in reduced form or deferred and the limitation documented (no automated Instagram/X/Facebook, limited squad-lineup coverage, source count bounded by quota + cap).
8. A quota ledger (R17) SHALL show usage vs. limits for every metered service and LLM spend in dollars vs. the cap.

---

## R1. Source Registry [P1]

**User story:** As a recruiter, I want one central registry of every source with its country, language, leagues,
reliability and access method, so I can trust and manage what the system reads.

Acceptance criteria
1. The registry SHALL store per source: id, name, canonical URL, host, country, language(s), source type
   (`NATIONAL_MEDIA | REGIONAL_MEDIA | LOCAL_PORTAL | CLUB_SITE | LEAGUE_SITE | BLOG | JOURNALIST | AGGREGATOR | SOCIAL_ACCOUNT | DATABASE`),
   leagues covered, access methods available (`RSS | ATOM | SITEMAP | API | HTML | SEARCH_ONLY | MANUAL`),
   chosen access method, reliability score (0–100) and its tier (`A|B|C|D`), status, scan frequency,
   last successful scan, last article date, relevant-report count, discovery provenance (query / parent source / manual).
2. Source status SHALL follow the lifecycle:
   `DISCOVERED → VALIDATING → PROBATION → APPROVED`, plus `DISABLED`, `BROKEN`, `INACTIVE`, `REJECTED`, `REMOVED`.
3. Only `APPROVED` sources SHALL be allowed to be the *sole* basis for a high-priority alert.
   `PROBATION` sources SHALL be collected and analyzed but their credibility SHALL be capped (configurable, default tier D equivalent).
4. The registry SHALL be expandable at runtime (countries, languages, leagues, sources) via configuration and the admin UI, with **no code change**.
5. Every status change SHALL be recorded with actor (system/user), timestamp and reason.

## R2. Source Discovery Engine [P1 seed + manual; P2 continuous automatic]

**User story:** As a recruiter, I want the system to find small, local, non-English football outlets that I do not already know,
so I see information before it reaches major international platforms.

Acceptance criteria
1. The engine SHALL run on a schedule, per `(country, language)` target, and SHALL be configurable per target
   (enabled, priority, daily query budget).
2. It SHALL discover candidates using **free, keyless or no-card** methods only: (a) the GDELT DOC API queried per country/language with multilingual football terms (R3),
   (b) Wikidata/Wikipedia lists of clubs, leagues, federations and national/regional media with official websites, (c) outbound links / "partners" / blogrolls / "related" of approved sources,
   (d) club and league websites' news pages, (e) feed autodiscovery (`<link rel="alternate" type="application/rss+xml">`), sitemaps and `/feed` conventions,
   (f) manual submission by a user (URL paste / CSV import), (g) optionally Google News RSS per country/language as hints only. Paid search APIs SHALL NOT be a dependency.
3. For each candidate the engine SHALL automatically evaluate and record: language, country, football-content share, publication frequency/recency,
   available feeds/sitemaps/APIs, robots.txt/terms constraints, leagues/clubs mentioned, duplicate-of-known-source check (by registrable domain + feed URL),
   and an initial reliability tier with a written rationale.
4. Candidates SHALL NOT be treated as trusted until validated (R1.2). Auto-promotion `PROBATION → APPROVED` SHALL be configurable and **default to off** (manual approval).
5. The engine SHALL detect sources that stop publishing (no new article for a configurable period, default 30 days in-season) or break (HTTP/parse failures),
   flag them `INACTIVE`/`BROKEN`, and retry with back-off before flagging.
6. The engine SHALL respect configurable daily request budgets per free provider (GDELT, Wikidata, LLM) and SHALL degrade gracefully (pause discovery first) when exhausted (R0.5, R17).
   LLM use in discovery SHALL be limited to finalist candidates; otherwise rule-based evaluation applies.
7. Initial priority targets SHALL include (expandable): Serbia, Cyprus, Croatia, Slovenia, Bosnia and Herzegovina, Montenegro, North Macedonia, Albania, Kosovo,
   Romania, Bulgaria, Lithuania, Latvia, Estonia, Poland, Slovakia, Czech Republic, Hungary, Greece, Turkey, France (Ligue 2/National/lower),
   England (Championship/L1/L2), Spain (Segunda and lower), Portugal (Liga Portugal 2 and lower), Belgium, Netherlands, Scandinavia, selected African markets.

## R3. Multilingual Search Query Generator [P1]

**User story:** As a recruiter, I want searches in each country's native language, because English queries miss local scoops.

Acceptance criteria
1. A **language pack** per language SHALL hold: football/transfer vocabulary, "squad exclusion / out of plans / transfer-listed / loan / dispute / unhappy /
   contract breakdown / asked to find a club" phrase bank, position names, month names, and common source-type words ("football news", "sports portal", "transfers").
2. Query templates SHALL combine language pack × country × league names in the native script × club names (from the football database) × signal phrases.
3. Language packs SHALL be bootstrapped by the LLM, stored as data, and SHALL be human-reviewable/editable; a pack SHALL carry a `reviewedBy/reviewedAt` marker. Unreviewed packs SHALL still be usable but flagged.
4. Native scripts SHALL be supported (Cyrillic for Serbian/Bulgarian/Macedonian, Greek, Hebrew, Arabic, Latin diacritics, etc.).
5. Query performance SHALL be tracked (new-source yield per query) and low-yield templates SHALL be deprioritized automatically.
6. Phrase packs SHALL also feed the cheap pre-filter in R6.2 (they are a *recall aid*, never a final decision).

## R4. Information Collection Engine [P1 RSS/sitemap/HTML/search; P2 APIs/clubs/leagues]

Acceptance criteria
1. Collection SHALL be built from pluggable **Collectors** behind one interface, selected per source by access method:
   `RssCollector`, `SitemapCollector`, `HtmlListingCollector`, `ApiCollector`, `SearchCollector`, `ManualCollector`, and (P3) social collectors.
   No single provider SHALL be a hard dependency of the pipeline.
2. Collectors SHALL: send an identifying User-Agent with contact info, honor `robots.txt` (including crawl-delay), use conditional requests (ETag / Last-Modified),
   enforce **per-host** rate limits and concurrency (default ≤ 1 request / 5 s / host), back off on 429/5xx, and stop on explicit blocks.
3. Collectors SHALL NOT bypass logins, paywalls, CAPTCHAs, bot protection or access controls. When a source cannot be accessed automatically,
   the system SHALL record the limitation on the source (`accessLimitation`) and propose an alternative (RSS if any, search-snippet-only, official API, manual link submission, licensed provider).
4. Collection SHALL be incremental (only items newer than the last cursor / unseen URL hash).
5. Collection and processing SHALL run as asynchronous staged batch jobs on **GitHub Actions** (public repo, unmetered) using a **database-backed job/queue** (state columns, leases, retries with exponential back-off + jitter, a `DEAD` state visible in admin) and idempotent handlers.
6. Where only a headline/snippet is available (bot-protected site, GDELT item), the item SHALL be flagged `headlineOnly` and its claims capped at `REPORTED`/`RUMOR`.
6. The system SHALL canonicalize URLs (strip tracking params, resolve AMP/redirects) and dedupe before any paid processing (R17.3).

## R5. Social & Public Platform Sources [P3]

Acceptance criteria
1. Social monitoring SHALL use **only authorized access**: official APIs, oEmbed, RSS/Atom where provided, licensed data providers, or user-submitted links.
2. YouTube (Data API v3 free quota — channels/playlists of clubs, leagues, journalists; captions only where permitted) is the first target, provided it needs no billing. Any platform requiring payment or a card SHALL NOT be integrated.
3. X, Facebook Pages and Instagram SHALL be integrated **only** through their official/authorized programs or licensed providers once access terms and cost are confirmed.
   Where unavailable, the UI SHALL show the limitation and offer: manual "submit link/screenshot", forwarding to an intake inbox, or tracking via the outlet's own article.
4. The system SHALL NOT scrape private accounts, use credentials it does not own, or circumvent rate limits/CAPTCHAs.
5. Social items SHALL be stored as references (URL, handle, timestamp, short excerpt) and treated as tier D unless the account is verified as the club/league/named journalist.

## R6. AI Football Intelligence Pipeline [P1]

Acceptance criteria — for every *eligible* Article:
1. Detect the original language (deterministic detector first; LLM only if ambiguous).
2. A **pre-filter** SHALL decide eligibility cheaply: football-relevance + generous multilingual recall gate (R3.6) + LLM triage for ambiguous items.
   The gate SHALL be tuned for recall; a configurable sample (default 3 %) of gate-rejected items SHALL be sent to the full analysis to measure missed-signal rate.
3. One structured LLM extraction call per eligible Article SHALL return, as validated JSON: players mentioned (as written + transliteration),
   current clubs, coaches, competitions, countries; for each player the claims with `signalCodes[]`, `claimType` (`FACT | SPECULATION | OPINION | RUMOR`),
   attribution (`attributedTo`, whether first-hand/own reporting or relayed), `evidenceQuote` (short verbatim, original language), event date if stated,
   an English headline and a 1–2 sentence English summary, and a model confidence. **Article/report text SHALL be English only — no Hebrew translation of articles** (owner decision). The original-language headline SHALL be stored and shown alongside the English text. UI labels, buttons and filters remain EN + HE (R20.4).
4. Interpretation SHALL be contextual (the model reads the sentence), not keyword-only, and SHALL handle local idioms for: not in coach's plans, pushed out of squad,
   transfer-listed, available on loan, disagreement with manager, unhappy at club, contract talks broken down, excluded from matchday squads, asked to find another club.
5. Output SHALL be schema-validated; invalid output SHALL be retried once with a repair prompt, then marked `FAILED_EXTRACTION` (never silently stored).
6. The pipeline SHALL be **idempotent and content-addressed**: an Article is analyzed once per `(contentHash, promptVersion, modelVersion)`; unchanged content SHALL NOT be re-analyzed (R17.4).
7. Every prompt/model version SHALL be recorded on each Report so results are reproducible and re-runnable after improvements.
8. The pipeline SHALL never invent players, clubs, quotes, dates, contracts or statistics. A claim without supporting evidence text SHALL be rejected by a post-validator
   (the `evidenceQuote` must appear in the source text after normalization).

## R7. Player Identification & Entity Resolution [P1]

Acceptance criteria
1. Extracted player mentions SHALL be resolved to a canonical `RadarPlayer` using: normalized/transliterated name keys (Cyrillic, Greek, diacritics),
   club, age/DOB, nationality, position, and the football database (existing Transfermarkt data / scout DB, API-Football).
2. Resolution SHALL produce a confidence. At or above the auto-link threshold (default 0.90) the link is automatic; between review and auto thresholds
   (default 0.65–0.90) the Report is held in a **review queue** (shown to admins); below review the player is created as `UNRESOLVED` with the raw name.
3. The system SHALL never merge two players below the auto-link threshold, and every merge SHALL be reversible (merge log).
4. Players not present in the external database (lower-division, unknown) SHALL still receive profiles built only from verifiable Report data, with fields shown as "unknown" rather than guessed.
5. Player ids SHALL cross-reference the existing roster/shortlist (`Players`, `Shortlists`) so already-managed players are flagged and can be excluded or highlighted.

## R8. Player Opportunity Signal Taxonomy [P1]

The classification engine SHALL support the following categories and signal codes (stored as data, extensible):

| Cat | Name | Signal codes |
|---|---|---|
| A | SPORTING_STATUS | `NOT_PLAYING`, `EXCLUDED_FROM_SQUAD` (repeated), `LOSING_STARTING_PLACE`, `OUT_OF_FAVOR`, `REDUCED_MINUTES`, `NOT_REGISTERED`, `POSITION_REPLACED_BY_SIGNING` |
| B | TRANSFER_AVAILABILITY | `CLUB_WANTS_TO_SELL`, `CLUB_WANTS_TO_RELEASE`, `AVAILABLE_ON_LOAN`, `CLUB_OPEN_TO_TERMINATE`, `PLAYER_SEEKING_CLUB`, `CONTRACT_TALKS_FAILED`, `CONTRACT_EXPIRING` |
| C | RELATIONSHIP_ISSUES | `CONFLICT_WITH_COACH`, `DISAGREEMENT_WITH_MANAGEMENT`, `DISCIPLINARY_ISSUE`, `UNHAPPY_PLAYING_TIME`, `PUBLIC_DISSATISFACTION`, `REQUESTED_TO_LEAVE` |
| D | FINANCIAL | `CLUB_FINANCIAL_PROBLEMS`, `SALARY_REDUCTION`, `CLUB_NEEDS_TO_SELL`, `REDUCED_FEE_POSSIBLE`, `UNPAID_SALARY` |
| E | OPPORTUNITY_INDICATORS | `REPLACEMENT_BEING_RECRUITED`, `SAME_POSITION_SIGNING`, `SQUAD_STATUS_CHANGE`, `AGENT_OR_JOURNALIST_DEPARTURE_REPORT`, `OTHER_INDIRECT` |

Acceptance criteria
1. A Report MAY carry multiple signals across categories.
2. The model SHALL also emit **counter-signals** (`DENIED_BY_CLUB`, `INJURED`, `SUSPENDED`, `RENEWED_CONTRACT`, `RETURNED_TO_SQUAD`, `TRANSFER_COMPLETED`) used by correlation/scoring.
3. The system SHALL NOT infer "wants to leave" from "not playing" alone, and SHALL NOT present a reported conflict as confirmed without reliable evidence (R16).
4. `UNPAID_SALARY` SHALL only count toward the score when the Report is tier A/B or corroborated by ≥ 2 independent Origins.

## R9. Signal Correlation & Timeline [P1 basic timeline; P2 full correlation]

Acceptance criteria
1. Reports SHALL be correlated per player (and per club) across sources and time; no Article is scored in isolation.
2. **Origin clustering:** Reports expressing the same claim and sharing an Origin (syndication, "according to…", near-duplicate text, same journalist) SHALL be clustered
   and counted as **one** independent confirmation.
3. A per-player **timeline** of events SHALL be maintained (event date, report date, signal, source, verification status, translated summary, link, score delta).
4. The engine SHALL detect status changes (e.g. `RETURNED_TO_SQUAD`, `DENIED_BY_CLUB`, contract renewed, transfer completed) and update/close/contradict earlier signals.
5. Contradicting reports SHALL be kept and displayed side-by-side with sources ("Sources disagree"), and SHALL reduce confidence/score per R10.
6. The engine SHALL maintain a *novelty* flag: `NEW`, `UPDATE`, `KNOWN` (already represented in the cluster) and a `firstSeenAt` per claim.
7. **[P2]** Squad-exclusion tracking: using matchday squad data, count consecutive omissions from matchday squads and emit objective `EXCLUDED_FROM_SQUAD` signals
   (verification `CONFIRMED` when from official/structured match data), only where data coverage exists for that league; unknown coverage ⇒ no inference.

## R10. Opportunity Scoring [P1]

Acceptance criteria
1. Each player SHALL have a dynamic Opportunity Score 0–100 computed by a **deterministic rules engine** (no LLM in the arithmetic) from active Signals.
2. Base weights (configurable, versioned): explicit transfer availability 25; repeated squad exclusion 15; significant playing-time reduction 10; coach/management relationship problems 15;
   contract situation 10; multiple independent sources 10; club financial pressure 5; recent replacement signing 5; other relevant signals 5 (total 100).
3. Each component's contribution SHALL be `weight × strength × credibility × recency × (1 − contradiction)`, with each factor ∈ [0,1] and documented (see design §8).
4. Modifiers: source credibility; information recency (signal-type-specific half-life); same-Origin reports not counted as independent; contradiction discount;
   injury/suspension (sporting-status components SHALL be neutralized when an injury/suspension explains the absence).
5. **Anti-rumor guard (configurable):** a score ≥ 70 SHALL require at least one of: ≥ 2 independent Origins, or one tier-A source, or objective squad-data evidence. Otherwise the score is capped at 69 and the reason is shown.
6. Levels: 85–100 Exceptional; 70–84 High priority; 50–69 Potential; 30–49 Monitor; 0–29 Low priority.
7. For every score the system SHALL store and display **reasons**: each component, its points, the supporting Reports, and the applied modifiers/caps; plus a score history for charting.
8. Scores SHALL be recomputed when: a new Report arrives, a status change is detected, a contradiction arrives, or time decay crosses a threshold (scheduled sweep).
9. Weights, half-lives, thresholds and caps SHALL live in versioned config; each stored score SHALL record the config version.

## R11. Player Intelligence Profile [P1 core; P3 advanced]

The profile page SHALL display:
- Name, photo (only where legally available — see R19.5; otherwise placeholder), age/DOB, nationality, current club, league, country, position, preferred foot, height, contract expiry **with verification status**,
  current sporting status, recent appearances/minutes (P2, only if data exists), Opportunity Score + level + reasons, AI explanation, full timeline, all source links with original publication dates,
  English summaries next to original-language titles, per-report reliability and confidence, and a **Recommended next action**.
Acceptance criteria
1. The page SHALL visually separate **Confirmed facts**, **Reported**, **Unverified rumors** and **AI assessments** (distinct labels and styles).
2. Any field not verifiable SHALL read "Unknown", never an estimate presented as fact.
3. "Recommended next action" SHALL be generated by deterministic rules from score level + signals (e.g. *Contact agent now*, *Verify with local contact*, *Monitor – re-check after next matchday*),
   with an optional LLM-written rationale clearly labeled as AI-generated.
4. Actions SHALL integrate with existing flows: add to Shortlist, open Transfermarkt, share via WhatsApp (reuse existing `shortlistAdd`, `whatsapp.ts`), and mark as "Contacted / Dismissed / Watching".
5. **[P3]** CRM/outreach workflow hooks (pipeline stages, contact log).

## R12. Search & Filtering [P1]

Filters: country, league, club, position, age range, nationality, contract expiration window, Opportunity Score range, opportunity category, source credibility tier,
information recency, loan availability, transfer availability, "no recent playing time" (P2 data-dependent), already-in-roster/shortlist toggle, verification status.
Acceptance criteria
1. Free-text search for player and club SHALL support transliteration/diacritic-insensitive and native-script matching.
2. Filter state SHALL be URL-addressable (shareable) and saveable as a named view.
3. Filtering SHALL stay responsive for ≥ 20,000 tracked players (see design §9 for query strategy and limits).

## R13. Main Dashboard [P1]

Sections: newly discovered opportunities; highest-scoring players; recently excluded from squads (P2); potentially available for loan; potentially available for transfer;
contract-expiry opportunities; emerging stories; new sources discovered; countries with most relevant opportunities; recently updated profiles.
Sorting: highest score, newest information, most reliable information, most urgent.
Acceptance criteria
1. Dense, table-first layout in the BRIT black/gold language (reusing `BritRail`, existing `brit-*` styles); no oversized cards, no decorative gradients.
2. Each row SHALL answer, at a glance: who, where, why (top reasons), how reliable, when it changed, urgency, and action.
3. **Urgency** SHALL be defined deterministically (design §8.6): e.g. contract ≤ 6 months, transfer window proximity, recency of last change, score velocity.
4. Fully responsive (375 px / 768 px), EN + HE with RTL, per repo UI rules.
5. Initial load ≤ 2 s (P95); near-real-time updates by polling (default 60 s) rather than database listeners.

## R14. Alert System [P1 dashboard; P2 advanced; P3 email/WhatsApp]

Acceptance criteria
1. Per-user alert rules with thresholds: high-priority player discovered (score ≥ N); player becomes available for transfer; outside coach's plans; new independent source confirms an existing opportunity;
   score increases by ≥ Δ within T; new opportunity in selected countries/leagues.
2. Delivery through an `AlertChannel` abstraction: `dashboard` (in-app feed + bell) in P1; `push` via FCM sent directly by the workflow (free) for high-priority only, limited to a few Firestore token reads per batch; `email` and `whatsapp` adapters designed but **not enabled** until P3.
3. Alerts SHALL be de-duplicated with cooldowns (default: same player + same trigger once per 24 h; escalations only when score crosses a higher level or +Δ).
4. Each alert SHALL link to the player profile and the evidence.
5. Alert evaluation SHALL be triggered by score changes (not polled by clients).

## R15. Source Management Center (admin) [P1]

Acceptance criteria
1. Table of sources with: name, URL, country, language, type, leagues, reliability score/tier, last successful scan, scan frequency, status, number of relevant reports collected, last error.
2. Actions: approve, reject, disable, re-enable, remove, edit metadata/frequency/tier override, run test-scan now, add source manually, bulk actions.
3. Validation queue for newly discovered sources with the automatic evaluation (R2.3) and sample articles visible before approval.
4. Auto-flagging of broken/inactive sources with last error and suggested remediation.
5. Restricted to admin accounts; every action audited.

## R16. Data Quality, Epistemics & Auditability [P1]

Acceptance criteria
1. Every Report SHALL store: source id and name, direct URL, publication date, collection timestamp, original language, English summary, extracted player (raw + resolved),
   detected signals, evidence quote, confidence, verification status, claimType, attribution, model/prompt version.
2. **Verification status** assignment (deterministic, config-driven):
   - `CONFIRMED`: official club/league/federation/player statement or objective structured data (squad lists, registered contract data), or ≥ 2 independent tier-A/B Origins stating it as fact.
   - `REPORTED`: credible outlet reporting with named/attributed sources or on-the-record statement.
   - `RUMOR`: unattributed, speculative, or tier-D-only claims.
   - `AI_INFERENCE`: conclusions produced by correlation/scoring (never from a single Article); always labeled as AI.
3. UI SHALL always show the status badge, and AI-generated text SHALL carry an "AI" label and SHALL never be styled as source fact.
4. When sources disagree the system SHALL show both claims, their sources and dates.
5. The system SHALL NOT fabricate information; unknown stays unknown.
6. Retention: store excerpts (≤ 300 chars) + evidence quote (≤ 25 words) + AI summaries + link; **not** full article text beyond the short processing window (design §15).
7. A human **feedback loop**: users can mark a Report/Signal as `Correct / Incorrect / Outdated`; feedback feeds source reliability learning (P2) and the evaluation set.

## R17. Free-Quota Management & Performance [P1]

Acceptance criteria
1. Prefer RSS/sitemaps; use keyless free APIs politely; incremental crawling only.
2. Scan frequency SHALL be adaptive per source (priority league + historical yield ⇒ more often; quiet sources ⇒ less often), within configurable min/max.
3. Dedupe (URL, content hash, near-duplicate) and the cheap gates (language, football relevance, multilingual signal lexicon, local classifier) SHALL run **before** any LLM call.
4. LLM work SHALL be avoided when unchanged (R6.6), **batched (6–8 articles per request)**, use the cheapest adequate model (Flash-Lite class; a stronger model only for rare ambiguous items), be prioritized by source tier / league priority / gate score, and be spread over the day.
5. A **quota ledger** SHALL record, per day and per service, units used vs. limit (and **LLM spend in dollars**): LLM requests and tokens per provider, GDELT/Wikidata/football-data requests, database storage and row reads/writes, Actions run minutes, Firestore reads.
6. **Quota guards**: stop at 70 % of any free daily/monthly limit (configurable); the LLM dollar cap follows R0.3; on 80 % warn admins; on exhaustion degrade in order: discovery → low-tier sources → gate-audit sampling → lower-priority analysis (queue ages out after 3 days); high-priority leagues are the last to be reduced.
7. Admin view with usage trends and "quota per useful signal" (quota spent per report that contributed to a ≥ 50 score) and a visible count of items skipped for quota reasons.
8. The pilot capacity target is **500–1,000 sources and ~4,000–6,000 analyzed articles/day** (free tier + ≤ $5 overflow); more sources MAY be collected and gated, with analysis bounded by free quota and the cap. The design SHALL allow raising capacity later by adding providers without redesign.

## R18. Reliability, Observability & Operations [P1]

Acceptance criteria
1. Structured error logging with source/job correlation ids; failed jobs retryable from the admin UI; dead-letter visibility.
2. Health metrics: queue depth, per-stage latency, items/day per stage, AI failure rate, extraction validation failure rate, broken-source count, budget status.
3. Each workflow run SHALL publish a run summary (GitHub Actions summary) and update a `jobs`/`quota_ledger` row; a single daily `WorkerRuns/RadarWorker` Firestore write MAY be added so Radar appears in the existing health email (≤ 1 write/day).
4. Job leases in the database plus Actions `concurrency` groups (pattern as in the existing player-refresh worker) SHALL prevent overlapping runs.
5. API-usage tracking per provider with rate-limit awareness.

## R19. Legal, Privacy & Compliance [P1 — gating]

Acceptance criteria
1. Honor robots.txt and per-source terms; maintain a per-source `crawlPolicy` and `termsNote`; disable sources that prohibit automated access.
2. Do not republish full copyrighted articles or photographs; show headline (original), short excerpt (≤ 300 chars), AI summary, and link out.
3. Store only data necessary for recruitment intelligence; free-storage retention defaults: raw fetch buffers ≤ 72 h, excerpts 30 days, reports of players below score 30 and not CONFIRMED 14 days, qualifying reports/timeline/score history 12 months (compact); automatic pruning when storage exceeds 70 % of the free limit; deletion on request.
4. A privacy review (GDPR / UK GDPR / Israeli Privacy Protection Law) and legitimate-interest assessment SHALL be completed before enabling in production; defamation-risk wording rules
   (no unverified allegation about a named person shown as fact — see R16).
5. Player photos: use only licensed/official sources or the same image handling already used in the app (existing Transfermarkt-sourced images are an inherited, unreviewed risk — flagged for legal sign-off);
   otherwise a neutral placeholder.
6. No unauthorized social access (R5.4).
7. Use of third-party APIs (search, LLM, football data) SHALL respect their ToS (e.g. caching/display restrictions).

## R20. Integration, Security, Platform & i18n [P1]

Acceptance criteria
1. Integrate into the existing stack (Next.js 14 on Vercel / Firebase Auth / FCM) and add only free components: GitHub Actions workers, a free Turso (libSQL) database. No rebuild of the site.
2. **Men platform only**: pages guarded like `WarRoomGuard` (unauthenticated → `/login`; women/youth → `/dashboard`). Radar tables are not platform-suffixed (men-only by design).
3. Client reads/writes go through authenticated Next.js API routes (Firebase ID token verified server-side) to the database; **no client has database credentials**. Admin actions require a server-side admin role check. This deviates from the repo rule "writes via Cloud Functions callables" to avoid billable Functions/Firestore usage (needs approval, design D6).
4. All UI strings in EN + HE through `LanguageContext` with RTL support; country and position names via existing `countryTranslations` / `appConfig`.
5. Mobile-responsive per repo standard; navigation entry in `BritRail` (Signals group) and mobile More sheet.
6. **Coexistence:** the existing Market Radar (`/market-radar`, `marketRadar.ts`) is left untouched (repo rule: no removal without approval). Transfer Radar is a new route `/transfer-radar`.
7. Secrets only in GitHub Actions secrets / Vercel env; no keys in code or in the public repo. After each phase `ARCHITECTURE.md` SHALL be updated (repo rule).
8. No push/deploy without explicit approval (repo rule). No service is introduced unless it satisfies R0.

## R21. Football Data Integration [P2]

Acceptance criteria
1. A `FootballDataProvider` interface SHALL abstract: player/club lookup, contract expiry, matchday squads/lineups, minutes/appearances, injuries/suspensions, fixtures.
2. First adapters (free only): existing Transfermarkt data (via current scraping/Render DB, no new bulk scraping), API-Football **free** key within its daily cap, football-data.org free tier, Wikidata, Flashscore fixtures (existing resolver). Leagues without free structured squad data SHALL be marked "no data".
3. Each datum SHALL carry provider, fetched-at and coverage flag; league-level coverage SHALL be recorded so the UI can say "no squad data for this league".
4. Contract expiry SHALL be shown as `verified` only when from a structured provider or CONFIRMED report.

---

## R22. Recency Window & Date Integrity [P1] — defaults: intake window CONFIRMED at 30 days by owner; other values proposed

Acceptance criteria
1. **Intake window:** an article SHALL be collected and analyzed only if its publication date is within `intakeDays` (default **30**, owner-confirmed). Older items SHALL be discarded at the gate, before any LLM call. Config range 3–60.
2. **No archive crawling:** the first scan of a newly approved source SHALL cover only the intake window (30 days); backfills (sitemaps, archives, GDELT) SHALL be limited to the same window. GDELT queries SHALL use a recent `timespan` (24–72 h per run).
3. **Signal life:** a signal SHALL count toward the score only while younger than its maximum age (defaults: availability 30 d, relationship 30 d, playing-time 30 d, replacement 30 d, squad exclusion 21 d, other 21 d, financial 45 d); within that life the recency decay of R10 still applies. Contract situation SHALL be computed from the contract expiry date, not from article age.
4. **Event date vs publication date:** the extraction SHALL record the date of the reported event (`eventDate`) and a `historicalReference` flag. Reports whose event date is older than the signal life, or flagged as historical, SHALL NOT be scored.
5. **Date integrity:** the publication date SHALL come from structured data (feed date, `article:published_time`, JSON-LD, sitemap `lastmod` only as fallback). If no reliable date exists, the system SHALL use the first-seen timestamp only for sources polled at least every 6 hours; otherwise the item SHALL be skipped and counted as `NO_DATE`. Dates SHALL NOT be guessed, and updated-date values SHALL NOT replace publication dates.
6. **Staleness of players:** a player with no new qualifying signal for `archiveAfterDays` (default **45**) SHALL be archived and excluded from default lists.
7. **UI:** every list and profile SHALL show the report's publication date and age; the default dashboard filter SHALL be "changed in the last 30 days" with 7 / 14 / 30 / 60 day options; reports older than 30 days SHALL be visibly marked as old when shown on a profile timeline.
8. Skipped-for-age counts SHALL appear in the admin health panel.

---

## R23. Target-Profile Relevance Filter [P1] — added after the feasibility PoC

The PoC showed that native-language searches return many items that are not recruitable opportunities: global stars, **national-team** call-ups ("poza kadrą" for a national squad), basketball/other sports, coaches, and non-player news.
Acceptance criteria
1. The extraction SHALL output `sport` (football only), `squadType` (`CLUB | NATIONAL_TEAM | YOUTH | WOMEN`), and `subjectRole` (`PLAYER | COACH | OTHER`). Only men's club-football players are eligible (men platform); national-team availability signals SHALL be ignored.
2. A configurable **target profile** SHALL define what is worth surfacing (defaults aligned with the existing Releases screen: market value roughly €150K–€4M, age ≤ 33, competition tiers). Players known to be outside it (e.g., global stars at top-5 clubs) SHALL be stored but excluded from default lists and alerts; unknown value/tier SHALL NOT be excluded automatically.
3. The filter SHALL be applied after entity resolution using existing player data where available, and SHALL be user-adjustable in the dashboard filters.

---

## Non-functional summary

| Area | Target |
|---|---|
| Latency: article → visible opportunity | P95 ≤ 90 min for tier-1 sources (Actions cron cadence), ≤ 6 h otherwise |
| Dashboard load | P95 ≤ 2 s (cached) |
| Extraction quality (to be measured on a labeled set before launch) | Signal-type precision ≥ 0.85, entity auto-link precision ≥ 0.95, evidence-quote validity 100 % |
| Availability of pipeline | Best-effort; no user-facing outage if pipeline is down (dashboard shows last data + staleness banner) |
| Cost | **≤ $6/month extra** (target $0–5, LLM overflow only), enforced by software caps (R0, R17.6) |
