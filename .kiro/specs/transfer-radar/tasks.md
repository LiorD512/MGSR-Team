# B.S.G. Transfer Radar — Implementation Plan (BUDGET EDITION, v3: free-first, ≤ $6/month)

> Status: **DRAFT v3 — nothing below has been started.** Begins only after you approve `requirements.md` + `design.md` (v3) and the decisions in design §17.
> **Hard rule R0:** free services first; the only paid usage is the existing Gemini key under a **$5/month software cap (ceiling $6)**. Anything needing a new subscription, new card, or another billable Google Cloud service is out of scope. **Article text is English only.**
> Scope: men platform, web only. Effort ranges are rough estimates (one developer + AI assistance).
> Repo rules for every task group: read `ARCHITECTURE.md` first · update it afterwards · EN+HE strings · responsive 375/768 · `cd mgsr-web && npx tsc --noEmit` passes · **no push/deploy without your approval**.
> Automated tests only if you ask *(optional – needs your OK)*. The labeled evaluation set (0.4) is a quality-measurement tool, not unit tests.

Legend: `[ ]` todo · requirement refs `(R#)`.

---

## Phase 0 — Approvals, free-tier verification & spikes (≈ 1–2 weeks)

**Phase 0-PoC (do this FIRST — 1–2 days, no Turso, no database, no UI, no new paid services):**
- [x] 0.P0 Feed-availability + signal-existence check from the sandbox (done 2026-11-01; results in design §14c).
- [x] 0.P1 **LLM extraction PoC — ROUND 1 DONE (run 41282510613, 2026-11-01): 27/28 feeds, 1,239 items in 30 d, 523 football-gated, 204 analyzed for $0.018 (≈ $0.088 / 1,000 articles, 26 requests). 18 flagged actionable; manual read: only ~2–4 truly actionable (precision ≈ 10–20 %, FAILS the 70 % bar). Causes: red cards/benching treated as signals, stars not filtered (`starPlayer` unreliable), volleyball misread as football, completed transfers flagged. Round 2 = stricter prompt + rule-based star/target-profile filter + labeled test set.** Original task:  one-off GitHub Actions workflow (`workflow_dispatch`) + script that fetches ~10–15 feeds, applies the 30-day window and gate, sends ~150–300 headlines/snippets in batches of 8 to a **free AI Studio key (no billing)**, and writes a results table to the run summary (player, club, signal, claimType, relevance, evidence). Needs only one secret: `RADAR_GEMINI_FREE_KEY`.
- [ ] 0.P2 **Score the PoC:** hand-label the same items (owner + assistant); report precision of "actionable" flags, recall on labeled items, false-positive types, and tokens → projected dollars per 1,000 articles.
- [ ] 0.P3 **Go/no-go gate:** proceed to Phase 1 only if actionable-flag precision ≥ 70 %, ≥ 60 % of labeled actionable items are found, projected LLM cost ≤ $5/month at pilot volume, and ≥ 20 distinct actionable players surface per week across the pilot countries. Otherwise stop or re-scope (no further setup spent).

- [ ] 0.1 Approve requirements/design v2 and decisions D1–D11. (all)
- [ ] 0.2 **Accounts/keys (you, ~30 min):** free Turso database + token (no card); a **new API key in the existing Google Cloud project** used by the current Gemini setup (name it for Radar so its usage is separately visible); optionally a free AI Studio key for free-tier capacity; GitHub Actions secrets (`TURSO_URL`, `TURSO_TOKEN`, `RADAR_GEMINI_KEY`, `RADAR_GEMINI_FREE_KEY` optional, existing `FIREBASE_*` for FCM). Recommended: set a **$6 Google Cloud budget alert** on that project. Confirm no new payment method is needed. (R0.1–R0.2)
- [ ] 0.3 **Read the real limits and prices** (AI Studio free limits, current Flash-Lite price, Turso dashboard, GDELT docs); record in `config` + `quota_ledger`; set guards at 70 % and the dollar cap at $5. (R0.2–R0.3, R17.5)
- [ ] 0.3a **Confirm recency defaults with the owner** (intake 30 d is confirmed; verify signal life 21–45 d, archive 45 d); measure how many items per source fall outside 7/14/30 days. (R22)
- [ ] 0.4 **Evaluation set:** hand-label ~200 real articles/headlines across ≥ 8 languages (relevance, player, signal codes, claimType); small script reports precision/recall per language. (R6)
- [ ] 0.5 **Extraction spike:** run draft prompt on the eval set with the free Gemini models and 1–2 other free providers; measure accuracy, **batch size 4/6/8 vs accuracy**, tokens and **dollars per 1,000 articles** on the Flash-Lite-class model → real articles/day capacity under the $5 cap. Decide the provider order. (R6, R17)
- [ ] 0.6 **Discovery spike:** run GDELT per country/language for 5 countries + Wikidata club-site pull; measure new-domain yield, % with RSS/sitemap, % blocking datacenter IPs. (R2, R4)
- [ ] 0.7 **Gate spike:** lexicon gate recall/precision on the eval set; optional local embedding classifier feasibility on an Actions runner. (R6.2)
- [ ] 0.8 **Football-data spike:** free API-Football / football-data.org coverage for target leagues; decide P2 scope. (R21)
- [ ] 0.9 **Legal/privacy gate scheduled** (legitimate-interest assessment, photo policy, wording rules); production enablement blocked until done. (R19)
- [ ] 0.10 Produce the **measured capacity report**: articles/day analyzable within the cap (free + ≤ $5), projected monthly dollars, expected source count, storage growth/day, go/no-go for Phase 1.

**Exit:** no new payment method needed; projected spend ≤ $5/month at pilot volume; measured capacity matches the pilot target (or the target is lowered in writing); eval metrics known.

---

## Phase 1 — MVP (≈ 6–8 weeks)

Goal: source registry, multilingual discovery, article collection, player identification, AI classification, scoring, basic dashboard, evidence links — all on free services.

### 1A. Foundations
- [ ] 1.1 Create `radar/` (TypeScript, Node 22, `tsx`), config/env contract, README; no Docker, no hosting. (R18)
- [ ] 1.2 Turso schema (design §6): migrations script, indexes, FTS5 table; `Repository` interface (so the DB can be swapped to D1/Supabase). (R0, R12)
- [ ] 1.3 Shared libs: `Logger`, `Retry`, per-host `RateLimiter`, `RobotsClient`, `QuotaGuard` + `quota_ledger` (units **and dollars**, daily sub-cap, kill-switch), `LlmProvider` router (free-first, paid overflow, per-provider counters, 429 handling, `usageMetadata` → dollars), job lease helper, run-summary writer. (R4.2, R17, R18)
- [ ] 1.4 Config rows (`config` table): scoring weights/half-lives/credibility/caps, quota limits, language list, pilot targets; seed script. (R10.9)
- [ ] 1.5 GitHub Actions workflows: `radar-pipeline.yml`, `radar-discovery.yml`, `radar-sweep.yml`, `radar-manual.yml` (concurrency groups, timeouts, secrets). *Added to the repo only; enabled on your approval.* (R4.5)
- [ ] 1.6 Feature flag `TRANSFER_RADAR_ENABLED`; Next API auth helper (`verifyIdToken`, admin check, cached). (R20)

### 1B. Registry & language packs
- [ ] 1.7 `SourceRegistry` service: CRUD, status machine, audit events, reliability tier/score (type prior only in P1). (R1)
- [ ] 1.8 Language packs for ~10 pilot countries: LLM-bootstrapped once, seeded from phrase lists in `marketRadar.ts`, exported to reviewable files; native league/club names from Wikidata/scout DB. (R3)
- [ ] 1.9 Seed registry: curated outlets per pilot country + club/league sites from Wikidata; CSV import for your own known local sources. (R2.7)
- [ ] 1.10 Source API routes: add/approve/reject/disable/enable/remove/update/test-scan (admin-only, audited). (R15)

### 1C. Free discovery
- [ ] 1.11 Query generator (templates × language pack × native names) with yield tracking. (R3)
- [ ] 1.12 `GdeltDiscovery` (per country/language), `WikidataDiscovery`, link-graph expansion, feed/sitemap autodiscovery, duplicate detection by registrable domain. (R2.2)
- [ ] 1.13 Candidate evaluator: robots, recency/frequency, language, football-share (local); LLM only for finalists within quota → `VALIDATING` queue. (R2.3, R0.5)

### 1D. Collection & extraction
- [ ] 1.14 Collectors: `RssCollector`, `SitemapCollector`, `HtmlListingCollector`, `GdeltCollector` (headline-only mode), `ManualCollector`. (R4.1)
- [ ] 1.15 Planner: due-source selection, adaptive frequency, time-boxed runs, up to 6 matrix shards. (R17.2)
- [ ] 1.16 Article extraction (readability-style), URL canonicalization, date parsing, excerpt-only persistence, `article_bodies` TTL 72 h. (R4.6, R19.2)
- [ ] 1.17 Dedupe: URL hash → content hash → simhash before any LLM. (R17.3)
- [ ] 1.17a **Recency & date integrity:** date extraction pipeline (feed/HTML/JSON-LD/sitemap/first-seen), `NO_DATE` handling, intake-window gate, first-scan limit, GDELT `timespan`, config keys (`intakeDays`, `signalMaxAgeDays`, `archiveAfterDays`). (R22.1–R22.5)

### 1E. Gate, AI, entities
- [ ] 1.18 Language detection + football gate + multilingual transfer-signal recall gate + 3 % rejected-sample audit. (R6.1–6.2)
- [ ] 1.19 Priority scheduler for LLM capacity (free-first, then capped paid overflow; tier → league priority → gate score; 3-day expiry). (R17.4, R0.4)
- [ ] 1.20 Batched **English-only** extraction prompt (6–8 articles; includes `eventDate` + `historicalReference`), versioned; JSON-schema validation; evidence-quote validator; single repair retry; injection-safe framing. (R6.3–6.8)
- [ ] 1.21 Deterministic verification-status assigner and claimType/attribution handling; headline-only caps. (R16, R4.6)
- [ ] 1.22 Entity resolution: normalization/transliteration keys, FTS candidate lookup, scout DB/Wikidata lookup, thresholds, `entity_review`, merge log. (R7)
- [ ] 1.23 Link to roster/shortlist (`roster_player_id`, `on_shortlist`) via the web API read of existing data (cached; minimal Firestore reads). (R7.5, R0.3)

### 1F. Correlation, scoring, alerts
- [ ] 1.24 Origin clustering v1 and per-player timeline writer. (R9.1–9.3)
- [ ] 1.25 Scoring engine (pure module, config-driven), explanation payload, score history, urgency, next-action rules. (R10, R11.3) *(optional – needs your OK: unit tests for scoring)*
- [ ] 1.26 Back-test scoring on recent known moves; tune config; record version. (R10)
- [ ] 1.27 Alert service v1: rules/thresholds/cooldowns, `DashboardChannel`, `PushChannel` via FCM from the workflow (high priority only), interfaces for email/WhatsApp (disabled). (R14)
- [ ] 1.28a Signal expiry in scoring (hard max age per signal type) and player archiving after `archiveAfterDays`; "old" marking on timelines; age filter chips (7/14/30/60) in UI. (R22.3, R22.6–R22.8)
- [ ] 1.28 Nightly sweep: decay, inactive/broken detection, retention/pruning with storage guard, snapshot rows, quota rollup. (R2.5, R17, R19.3)

### 1G. Web UI (men only, EN/HE, responsive)
- [ ] 1.29 Guard + nav entries (`BritRail`, mobile More) + i18n keys. (R20)
- [ ] 1.30 Dashboard "Morning Brief" + compact panels + sorting + staleness banner + polling. (R13)
- [ ] 1.31 Filters + FTS search (URL state, saved views). (R12)
- [ ] 1.32 Player profile: facts / reported / rumor / AI sections, timeline, sources, English summaries beside original-language headlines (no Hebrew article text), score "why", next action, shortlist/WhatsApp/TM actions, feedback buttons. (R11, R16)
- [ ] 1.33 Source Management Center: table, validation queue with samples, approve/disable/remove/test-scan, errors, add manually/CSV, audit. (R15)
- [ ] 1.34 Alerts page + bell integration + rule editor. (R14)
- [ ] 1.35 Admin **quota, spend & health** panel: usage vs limits, **LLM dollars vs the $5 cap**, skipped-for-quota count, queue depth, failure rates. (R17.5–17.7, R18)

### 1H. Wrap-up
- [ ] 1.36 `npx tsc --noEmit`, lint, manual walkthrough EN/HE at 375/768/desktop. (repo rules)
- [ ] 1.37 Update `ARCHITECTURE.md` (radar workers, Turso, workflows, routes, free-service map, quotas). (repo rule)
- [ ] 1.38 7-day unattended pilot on dev data; verify **spend ≤ $5 and all quotas < 70 %**; legal gate (0.9) before prod. **Go/no-go.**

**Exit:** 7 days unattended; ≥ 300 approved sources in ≥ 10 countries; eval metrics at target; no un-evidenced claims shown; every quota < 70 %; the user can answer the 8 vision questions from a profile.

---

## Phase 2 — Depth (≈ 6–8 weeks) ⟵ Phase 1

- [ ] 2.1 Continuous automatic discovery of small sites (link-graph crawling, club-site news discovery, template yield tuning); optional auto-promotion rules (default off). (R2)
- [ ] 2.2 Local embedding classifier to cut LLM load further (train on eval set + user feedback). (R6.2, R17)
- [ ] 2.3 `FootballDataProvider` + free adapters (TM/scout DB, API-Football free, football-data.org, Wikidata, Flashscore); coverage registry. (R21)
- [ ] 2.4 Squad-exclusion monitoring where free data exists; text-reported exclusions elsewhere (labeled). (R9.7)
- [ ] 2.5 Advanced correlation: contradictions UI, supersession, status changes, club-level inference (finance, incoming signings), novelty flags. (R9.4–9.6)
- [ ] 2.6 Playing-time analysis and contract integration with `verified` semantics; contract-expiry panel. (R10, R21.4)
- [ ] 2.7 Source reliability learning from outcomes (existing `FeedEvents` club changes/releases) and user feedback. (R16.7)
- [ ] 2.8 Advanced alerts (score jump, new independent confirmation, country/league subscriptions, digest). (R14)
- [ ] 2.9 Expand countries/competitions as LLM quota allows; per-country tuning vs eval sets. (R2.7)
- [ ] 2.10 Lead-time KPI and "quota per useful signal" reporting. (R17.7)
- [ ] 2.11 Update `ARCHITECTURE.md`; pilot + go/no-go.

## Phase 3 — Reach & workflow (≈ 8–12 weeks, scope reconfirmed after P2)

- [ ] 3.1 YouTube Data API collector within free quota; manual link/screenshot intake for non-automatable platforms; X/Instagram/Facebook **not automated** at $0. (R5)
- [ ] 3.2 Advanced profile (reuse existing stats panels), comparison with `ClubRequests`. (R11)
- [ ] 3.3 Departure-probability predictions once enough labeled outcomes exist (labeled AI). (R16)
- [ ] 3.4 Personalized recommendations (requests, filters, shortlist behavior). (R11, R14)
- [ ] 3.5 Email alerts within free Gmail SMTP limits (pattern in `systemHealthCheck`); WhatsApp stays manual/`wa.me` share (no free Business API). (R14.2)
- [ ] 3.6 CRM/outreach stages and contact log. (R11.5)
- [ ] 3.7 Optional local small-model fallback for triage; more countries. (R6, R2)
- [ ] 3.8 Re-evaluate database/provider mix if free terms change (swap via `Repository`/`LlmProvider`). 
- [ ] 3.9 `ARCHITECTURE.md` update; final security/legal re-check.

---

## Critical path
```
0.1 → 0.2 (free keys) → 0.3 (real limits) → 0.4 eval set → 0.5 extraction spike → 0.10 capacity report
0.6 discovery spike → 1.8/1.9 seeding
1.1–1.6 → 1.7 registry → 1.14–1.17 collect → 1.18–1.23 gate/AI/entities → 1.24–1.25 correlate/score → 1.27 alerts
UI (1.29–1.35) can start after 1.2 using fixtures; legal gate 0.9 → production enablement
```

## Operating cost: **≈ $0–5/month extra (hard cap $5, ceiling $6)**
Everything except LLM overflow is free. The cap is enforced in software (design §0, §14). Trade-off: pilot capacity ≈ 4–6 K analyzed articles/day, 500–1,000 sources — measured in Phase 0.

## Out of scope
Anything needing a new subscription, card or paid plan · Android/Women/Youth · changing Market Radar · bypassing paywalls/logins/CAPTCHAs/bot protection · private social data · republishing articles/photos · automatic outreach to players/agents.
