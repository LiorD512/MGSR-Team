# B.S.G. Transfer Radar — Design (BUDGET EDITION, v3: free-first, ≤ $6/month)

> Status: **DRAFT v3 — awaiting approval. No implementation code written.**
> v2 replaces v1 (which used Cloud Run, Pub/Sub, paid Serper and paid LLM tiers). **Owner budget rule (v3): free services first; the only permitted spend is the already-paid Gemini key and existing project payments, capped at ≈ $5–6/month of *extra* usage. No new subscriptions, no new paid services, no card-requiring signups.** (v2 was strict $0; v3 relaxes that to allow the existing Gemini key as capped overflow.)
> ✔ = verified in the repo. 🔎 = taken from public web pages (links inline; limits change often, so every number is re-checked in Phase 0). ⚠ = assumption to verify.

---

## 0. Budget Charter (binding rules for every component)

1. **Free first.** Every capability uses a free service when one exists (GitHub Actions on the public repo, Turso free, GDELT, Wikidata, free LLM tiers).
2. **Allowed paid usage = existing payments only:** the Gemini key already used in the project (and the existing Vercel/Firebase subscriptions as they are). **Hard cap: $5/month of Radar LLM spend** (configurable, absolute ceiling $6), enforced in software: the `QuotaGuard` converts the token counts returned by every API response (`usageMetadata`) into dollars using a price table in `config`, and stops paid calls at 80 % of the cap (warning) and 100 % (stop; queue waits/ages out). A paid call is only made when free capacity is exhausted ("free-first routing").
3. **No new paid services or plans.** Not used: Cloud Run, Pub/Sub, Cloud Tasks, Cloud Scheduler, Secret Manager, Cloud Functions additions, paid search APIs (Serper/SerpAPI/Brave), paid databases, paid translation.
4. **Isolate and monitor the spend.** Radar uses its **own API key** (created in the same Google Cloud project as the current Gemini key, so it uses the existing payment method but its usage is separately visible and revocable). Recommended (your action, one-time): set a **Google Cloud budget alert** at $6 on that project — alerts are not hard caps, which is why the software cap above is the real control.
5. **Keep Firestore use negligible** (< ~300 reads/day, ~0 writes) because the Firebase project is on a pay-as-you-go plan with no hard cap ✔ (it runs Cloud Functions).
6. **Quota ledger = quota + dollars:** every metered service shows usage vs. free limit, and LLM spend in dollars vs. the cap.

### What changed vs v1

| Area | v1 (paid/billable) | v3 (free-first, ≤ $6/mo) |
|---|---|---|
| Compute | Cloud Run services/jobs | **GitHub Actions** scheduled workflows (repo is **public** ⇒ unlimited minutes 🔎) |
| Queue | Pub/Sub + DLQ | **DB-backed job tables** with leases + staged batch runs |
| Database | Firestore (20K writes/day free, Blaze can bill) | **Turso (libSQL/SQLite)** free plan, no card, hard `BLOCKED` at limit 🔎 |
| Search for discovery | Serper (paid) | **GDELT DOC API** (free, no key) + **Wikidata** + link-graph + RSS autodiscovery + Google News RSS (hints only) + manual add |
| LLM | Gemini paid, no cap | **Free-first routing**: free-tier keys/providers first, then the **existing paid Gemini key as overflow under a hard $5/month software cap**; Flash-Lite-class model, batching 6–8 articles/request, strict gating, **English only** |
| Football data | API-Football paid plan | Existing Transfermarkt data, free tiers (API-Football free key, football-data.org), Wikidata |
| Alerts | FCM via functions | In-app polling + **FCM sent directly from the Actions job** (FCM is free) |
| Retention | 24 months | **90 days** raw reports, compact rollups after (free 500 MB storage) |
| Scale claim | "thousands of sources" | **Pilot 500–1,000 sources / ~4–6 K analyzed articles/day**; growth is bounded by free quota + the $5 cap (§9, §14) — stated honestly |

---

## 1. Feasibility Verdict (free-first, ≤ $6/month)

| Goal | Feasibility within budget | Comment |
|---|---|---|
| Free discovery of local/non-English outlets | **High–Medium** | GDELT indexes 65+ languages with per-country/language filters 🔎 ([GDELT DOC via Apify listing](https://apify.com/dami_studio/gdelt-news-scraper): 250 articles/query, ~3 months index). Tiny blogs GDELT doesn't know are found by link-graph expansion, Wikidata club sites, and manual add. |
| RSS/sitemap/HTML collection | **High** | Free; politeness-bound. Datacenter IPs of Actions are blocked by some sites (already seen with Transfermarkt ✔ `weekly-returnees.yml`) ⇒ those sources flagged `accessLimitation`, never bypassed. |
| LLM analysis | **Medium** | Free quotas are small and change. Plan assumes **~250–1,000 requests/day** (sources disagree 🔎 [Gemini free-tier summary](https://www.aifreeapi.com/en/posts/gemini-api-free-tier-complete-guide)) and compensates with strict pre-filtering + **batching 6–8 articles per request** + a provider pool. Real limits read from AI Studio in Phase 0. |
| Entity resolution | **Medium** | Existing scout DB + Wikidata + fuzzy matching; more `UNRESOLVED` for lower leagues. |
| Scoring / correlation / timeline | **High** | Pure deterministic code (free). |
| Squad-exclusion monitoring | **Low–Medium** | Free structured lineups exist only for some leagues. Falls back to *text-reported* exclusions (labeled REPORTED), never inferred. |
| Social media | **Low** | Free official access is minimal. Phase 3: YouTube Data API free quota (10K units/day 🔎 ⚠) + manual link intake. X/Instagram/Facebook: not automated at $0. |
| "Thousands of sources" | **Not at launch** | Pilot 500–1,000; expansion limited by LLM quota/cap and storage. More sources can be collected and gated; analysis is prioritized. |
| Beating major platforms | **Partly** | Measured with a lead-time KPI; no guarantee. |

---

## 2. Verified Existing Assets (✔ read in repo)

Monorepo `mgsr-web` (Next.js 14.2/TS/Tailwind on Vercel, Firebase Auth + Firestore), `functions` (Firebase Functions v7), `workers-job` (Cloud Run Job), `mgsr-backend`, Android `app`, Render scout server (19K+ TM players, 44 leagues), `.github/workflows` (scheduled scrapers using repo secrets `FIREBASE_*`, `TM_HTML_PROXY_URL`). **Repo visibility: public** ✔ (`gh api`).
Reusable: `BritRail` men shell + `brit-*` CSS, `WarRoomGuard` pattern, `LanguageContext` (EN/HE), `featureFlags.ts`, `countryTranslations`, `whatsapp.ts`, shortlist flows, `firebaseAdmin.ts` (token verification), `transfer-windows.json`, Flashscore resolver, scout server data, the multilingual phrase lists inside `marketRadar.ts` (seed for language packs).
Existing **Market Radar** (`/market-radar`): Google-News-RSS + Gemini on Vercel, request-time compute, no persistence/entities/correlation → **left untouched** (repo rule); Transfer Radar is a separate route `/transfer-radar`.

---

## 3. Architecture

```
┌───────────────────── mgsr-web (Vercel Hobby, existing) ─────────────────────┐
│ /transfer-radar  /players/[id]  /sources (admin)  /alerts                    │
│   │  fetch (Firebase ID token)                                               │
│   ▼                                                                          │
│ /api/transfer-radar/*  (verifyIdToken → role check → SQL read/write)         │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ libSQL over HTTPS
                       ┌────────▼─────────┐        FCM (free) ──▶ existing push
                       │  TURSO (free)    │◀───────────────────────────┐
                       │  radar database  │                            │
                       └────────▲─────────┘                            │
                                │                                      │
┌───────────────────────────────┴───── GitHub Actions (public repo, $0 minutes) ──────────────────────┐
│ radar-pipeline.yml  (cron every ~30–60 min)  collect → extract → gate → analyze → resolve →          │
│                                                correlate → score → alert → snapshot                  │
│ radar-discovery.yml (daily)   GDELT + Wikidata + link-graph + feed autodiscovery → validate queue    │
│ radar-sweep.yml     (nightly) decay, source health, retention, quota rollups                         │
│ radar-football-data.yml (P2)  contracts / lineups / injuries from free providers                     │
│ All use: concurrency group (no overlap) · job leases in DB · per-host rate limiter · quota guard     │
└───────────────────────────────┬──────────────────────────────────────────────────────────────────────┘
                                │
   Free inputs: publisher RSS/Atom/sitemaps · club & league sites · GDELT DOC API · Wikidata SPARQL ·
   Google News RSS (hints only) · free LLM pool (Gemini free key, others ⚠) · API-Football free key · football-data.org free
```

Code location: new top-level `radar/` (TypeScript, Node 22, run with `tsx` in Actions; no Docker/hosting needed) + web files listed in §12. Shared types live in `radar/src/types` and are copied to `mgsr-web/src/lib/transferRadar/types.ts` by a script.

**Public-repo consequence:** workflow files, prompts, language packs and scoring weights are publicly visible. Secrets (Turso token, LLM keys) live only in GitHub Actions secrets / Vercel env. If you don't want prompts/weights public, the alternative is a **separate public repo for the worker with weights/prompts loaded from the DB** at run time (decision D3).

---

## 4. Free Service Map

| Need | Choice | Why cost stays at/near $0 | Limit to respect (🔎 verify) | Fallback |
|---|---|---|---|---|
| Compute | GitHub Actions, public repo | Public repos are unmetered ([GitHub community answer](https://github.com/orgs/community/discussions/210649)) | 6 h/job, 20 concurrent jobs, cron is best-effort (delays), scheduled workflows pause after 60 days of repo inactivity | Cloudflare Workers cron (free) for tiny jobs |
| Database | **Turso** free | No card; queries beyond plan limits fail with `BLOCKED`, not billed ([Turso docs](https://docs.turso.tech/help/usage-and-billing)); sources quote 500 MB–5 GB storage and ≥10 M row-writes/month, so plan for the **lowest**: 500 MB, 10 M writes, 1 B reads | Storage 500 MB (conservative) | Cloudflare D1 free, Supabase free, SQLite file in a data branch |
| Web hosting/API | Vercel (existing) | Already running | Hobby function limits (10–60 s) | — (note: Vercel Hobby terms are non-commercial ⚠ existing exposure, not new) |
| Auth | Firebase Auth (existing) | Existing | `verifyIdToken` needs no Firestore read | — |
| Push | FCM from Actions via `firebase-admin` (existing secrets) | FCM is free | Reads `Accounts` tokens: a few reads per alert batch | In-app only |
| LLM | Router behind `LlmProvider`: free keys/providers first → existing paid Gemini key as capped overflow | Free tiers stop with 429; the paid key is metered in dollars by `QuotaGuard` with a hard $5/month stop | Gemini free: reported 250–1,000 req/day depending on model, shared 250K tokens/min 🔎; newer models can be as low as 20/day ([summary](https://www.scriptbyai.com/gemini-api-free-tier-limits/)) | Other free providers ⚠ (Groq, Cloudflare Workers AI, OpenRouter `:free`, Mistral) — evaluated in Phase 0; local CPU model as last resort |
| Local classifier | Multilingual embedding model via ONNX (`@huggingface/transformers`) + logistic regression trained on the eval set | Runs on the runner | Runner RAM/CPU | Lexicon-only gate |
| Discovery search | GDELT DOC 2.0 (no key), Wikidata SPARQL, link-graph, feed autodiscovery, manual add | Free, keyless | GDELT: 250 results/query, slow-rate politeness; Wikidata: fair-use | Google News RSS per country/lang as hints (ToS-gray, already used by Market Radar; kept optional) |
| Translation | Same LLM call → **English only** (no Hebrew article text) | No extra service | — | `translateQuery.ts`/MyMemory free path already in repo ✔ for short strings |
| Football data | Existing TM/scout DB ✔, API-Football **free** key (100 req/day class 🔎 ⚠), football-data.org free, Wikidata | Free tiers, no card | Daily request caps | Skip → "no data" |
| Monitoring | Actions run summaries + `quota_ledger` table + admin panel | Free | — | — |

Explicitly **excluded** (can bill): Cloud Run, Pub/Sub, Cloud Tasks, Cloud Scheduler, Secret Manager, Vertex AI, paid Serper/SerpAPI/Brave, OpenAI/Anthropic paid, Cloud Translation, Firestore as bulk store.

---

## 5. Pipeline on GitHub Actions

### 5.1 Workflows
| Workflow | Schedule | Content |
|---|---|---|
| `radar-pipeline.yml` | every 30–60 min (`*/30`), `concurrency: radar-pipeline`, `cancel-in-progress: false` | See §5.2 |
| `radar-discovery.yml` | daily | GDELT/Wikidata/link-graph sweep per target; validate candidates |
| `radar-sweep.yml` | nightly | score decay, inactive/broken detection, retention, snapshot rebuild, quota rollup |
| `radar-football-data.yml` (P2) | daily | contracts, lineups, injuries, fixtures |
| `radar-manual.yml` | `workflow_dispatch` | test-scan a source, re-run stage, backfill |

Keep-alive: the nightly sweep makes a trivial commit-less API call; GitHub disables scheduled workflows after 60 days without repo activity ⚠ (the repo is active, but a heartbeat via `workflow_dispatch` reminder is documented).

### 5.2 Pipeline run (single job, sequential stages, time-boxed to ~25 min; collection may fan out via a matrix of up to 6 shards)
```
1 lease        take job lease in `jobs` (expires in 40 min)
2 plan         pick due sources (next_scan_at ≤ now), priority-ordered, capped by per-host politeness + run time budget
3 collect      RSS/sitemap/listing/GDELT items → `articles` (state=COLLECTED), dedupe: canonical-URL hash → content hash → simhash
4 extract      fetch article body only for items that pass cheap title/snippet gate; readability; keep excerpt (≤300) + short-lived body in `article_bodies` (TTL 72 h)
5 gate         language detect → football gate → transfer-signal recall gate (language pack) → local embedding classifier (P1.5) ⇒ ELIGIBLE | SKIPPED; 3 % audit sample of skipped
6 analyze      quota guard → batch (6–8 articles) → LLM extraction JSON → validators (schema, evidence-quote-in-text) → `reports`
7 resolve      entity resolution → players / review queue
8 correlate    origin clustering, contradictions, timeline
9 score        deterministic scoring for touched players → `opportunities`, `score_history`
10 alert       evaluate rules, write `alerts`, send FCM for high priority
11 snapshot    update compact dashboard summary rows
12 release lease; write run summary (articles in/out per stage, quota used, errors)
```
Each stage is a function over DB rows with `state` columns; a crash resumes from the DB state next run (idempotent keys as in v1: `url_hash`, `content_hash+prompt_ver+model`, `report_id = hash(article, player, signal)`).

### 5.3 DB-backed queue
`articles.state`, `articles.next_attempt_at`, `articles.attempts`; failed items retry with exponential back-off up to 5 attempts, then `DEAD` (visible in admin). Because runs are short-interval batches, a message broker adds nothing at this scale.

### 5.4 Politeness & access
Identifying User-Agent with contact URL; robots.txt (cached 24 h) + crawl-delay; ≥ 5 s between requests per host; conditional GET (ETag/Last-Modified); 429/503 ⇒ back-off and slower schedule; Cloudflare/bot challenges ⇒ source marked `accessLimitation: BOT_PROTECTED` with alternatives (RSS only, GDELT headline-only, manual submit). No proxies, no CAPTCHA/paywall circumvention, no login. Note: GitHub's terms restrict using Actions as general-purpose serverless compute ⚠ — this workload is project data collection (same pattern the repo already runs ✔) but is a policy risk to keep volumes modest.

---

## 6. Data Model — Turso (SQLite) — replaces Firestore collections

Core DDL (abridged; full DDL is the first foundation task):
```sql
CREATE TABLE sources (
  id TEXT PRIMARY KEY, name TEXT, url TEXT, host TEXT, reg_domain TEXT UNIQUE,
  country TEXT, languages TEXT /*json*/, type TEXT, leagues TEXT /*json*/,
  access_methods TEXT /*json*/, access_chosen TEXT, feed_url TEXT, sitemap_url TEXT, access_limitation TEXT,
  robots TEXT, crawl_delay_s INT, terms_note TEXT,
  status TEXT, status_reason TEXT, status_changed_at INT, status_changed_by TEXT,
  tier TEXT, reliability INT, reliability_rationale TEXT, tier_override TEXT,
  base_interval_min INT, next_scan_at INT, last_scan_at INT, last_success_at INT, last_error TEXT,
  consecutive_failures INT DEFAULT 0, etag TEXT, last_modified TEXT, cursor TEXT,
  items_collected INT DEFAULT 0, relevant_reports INT DEFAULT 0, last_article_at INT,
  provenance TEXT /*json*/, validation TEXT /*json*/, created_at INT, updated_at INT);
CREATE INDEX ix_sources_due ON sources(status, next_scan_at);

CREATE TABLE articles (
  id TEXT PRIMARY KEY /*url_hash*/, source_id TEXT, canonical_url TEXT, content_hash TEXT, simhash INT,
  lang TEXT, published_at INT, collected_at INT, title_orig TEXT, excerpt TEXT /*≤300*/,
  title_en TEXT, state TEXT, skip_reason TEXT, attempts INT DEFAULT 0, next_attempt_at INT,
  gate_score REAL, priority REAL, origin_cluster_id TEXT, analyzed_at INT, prompt_ver TEXT, model_id TEXT);
CREATE INDEX ix_articles_state ON articles(state, priority DESC, next_attempt_at);
CREATE INDEX ix_articles_src ON articles(source_id, collected_at DESC);
CREATE TABLE article_bodies (article_id TEXT PRIMARY KEY, body TEXT, expires_at INT); -- swept after 72 h

CREATE TABLE reports (
  id TEXT PRIMARY KEY, article_id TEXT, source_id TEXT, url TEXT, published_at INT, collected_at INT, lang TEXT,
  player_raw TEXT /*json*/, player_id TEXT, resolution_status TEXT, resolution_conf REAL, club_id TEXT,
  signals TEXT /*json [{code,category,strength,polarity}]*/, claim_type TEXT, attributed_to TEXT, first_hand INT,
  origin_key TEXT, origin_cluster_id TEXT, verification TEXT, evidence_quote TEXT, event_date INT,
  headline_en TEXT, summary_en TEXT,  -- English only (no Hebrew article text)
  model_conf REAL, novelty TEXT, prompt_ver TEXT, model_id TEXT, fb_correct INT DEFAULT 0, fb_incorrect INT DEFAULT 0, fb_outdated INT DEFAULT 0);
CREATE INDEX ix_reports_player ON reports(player_id, published_at DESC);

CREATE TABLE players (
  id TEXT PRIMARY KEY, display_name TEXT, name_keys TEXT /*space-joined normalized tokens*/, aliases TEXT,
  tm_id TEXT, wikidata_id TEXT, roster_player_id TEXT, on_shortlist INT, dob TEXT, nationalities TEXT, position TEXT, foot TEXT, height_cm INT,
  club_id TEXT, club_name TEXT, league TEXT, country TEXT, contract_expires INT, contract_verified INT, contract_source TEXT,
  photo_url TEXT, photo_license TEXT, resolution_status TEXT, merge_log TEXT, created_at INT, updated_at INT);
CREATE VIRTUAL TABLE players_fts USING fts5(display_name, name_keys, club_name, content='players');
CREATE TABLE opportunities (
  player_id TEXT PRIMARY KEY, score INT, level TEXT, score_delta_7d INT, urgency INT, urgency_reasons TEXT,
  categories TEXT, loan_available INT, transfer_available INT, no_recent_minutes INT, in_roster INT, on_shortlist INT,
  top_reasons TEXT /*json, English; UI labels are bilingual*/, best_tier TEXT, best_verification TEXT, report_count INT, independent_origins INT,
  first_seen_at INT, last_report_at INT, last_change_at INT, config_version INT, explanation TEXT /*json*/, updated_at INT,
  country TEXT, league TEXT, club_name TEXT, position TEXT, age INT, nationality TEXT, contract_expires INT);
CREATE INDEX ix_opp_score ON opportunities(score DESC);
CREATE INDEX ix_opp_country ON opportunities(country, score DESC);
CREATE INDEX ix_opp_change ON opportunities(last_change_at DESC);
```
Other tables: `timeline(player_id, at, kind, report_id, signal, verification, source_name, url, summary_en, score_delta)`, `score_history(player_id, at, score, components_json, config_version)`, `origin_clusters`, `clubs`, `entity_review`, `host_state`, `discovery_targets`, `language_packs`, `source_events`, `alert_rules(user_id, json)`, `alerts(user_id, created_at, type, player_id, title_json, body_json, dedupe_key, read_at)`, `saved_views`, `jobs` (leases), `quota_ledger(day, service, unit, used, limit)`, `config(key, version, json)`, `eval_set`, `squad_appearances` (P2).
**Real SQL** replaces the Firestore filter workarounds in v1: all dashboard filters, sorting and FTS search are indexed queries; no bounded client windows.

**Storage budget (500 MB assumption):** ~8 k report rows/day × ~1.6 KB ≈ 13 MB/day ⇒ **retention: reports 90 days (~1.1 GB!) is too much** ⇒ rule: keep full reports **only** for players with score ≥ 30 or `CONFIRMED`; others aggregated/dropped after 14 days; excerpts after 30 days; hard guard at 350 MB triggers aggressive pruning and pauses low-tier sources. Measured in Phase 0.

---

## 7. Free Source Discovery

1. **GDELT DOC 2.0** (keyless) per `(country, language)`: query = language-pack football/transfer terms, filters `sourcelang`, `sourcecountry` 🔎. Output rows (`url, domain, title, seendate, language, sourcecountry`) ⇒ **candidate domains** + immediately usable article headlines. Respect rate limits (one request every few seconds, ≤ 250 results/query, ~3-month window).
2. **Wikidata SPARQL**: football clubs (`P31=Q476028` family) by country/league with official website (`P856`), plus leagues/federations ⇒ club & league sites (news pages/feeds), native club names for query generation.
3. **Wikipedia/Wikidata media lists**: newspapers/sports portals per country (`P856`, `P407` language).
4. **Link-graph expansion** from approved sources (outbound domains with football content), "partners/related" blocks, blogrolls.
5. **Feed autodiscovery**: `<link rel=alternate>`, `/feed`, `/rss`, `/sitemap-news.xml`.
6. **Google News RSS per country/language** — optional *hints only* (ToS-gray; same approach as Market Radar ✔); can be switched off.
7. **Manual add** (URL paste in Source Center) and CSV import for your own list of known local contacts.
8. Optional bootstrap: one-time free credits of search APIs (e.g. Serper's free credits) **only if** no card is required — never a dependency.

Evaluation of candidates (all free): robots/feeds/recency/frequency (HTTP), language detection (local), football-share via language pack (local), **one small LLM call only for finalists** (quota-guarded; otherwise rule-based tier D). Validation lifecycle unchanged: `DISCOVERED → VALIDATING → PROBATION → APPROVED` (auto-promotion default off).
Multilingual query generator and language packs: as v1 (templates × pack × native league/club names from Wikidata/scout DB); seed from phrase lists already in `marketRadar.ts` ✔; LLM bootstrap of each language pack is a **one-off** quota spend, then stored and human-reviewable.

---

## 8. Collection

Collectors (pluggable): `RssCollector`, `SitemapCollector`, `HtmlListingCollector`, `GdeltCollector` (headline-level items for sources without feeds/where bot-protected), `ManualCollector`, (P3) `YouTubeCollector`. Incremental via cursors; adaptive scan interval `clamp(base/(1+yield), min, max)` with defaults 30 min (priority) – 12 h (quiet). Honors R4 rules. Where only a headline is available (GDELT/Google News/search snippet), analysis uses the headline + snippet and the report is capped at `RUMOR/REPORTED` with an explicit "headline-only" flag.

---

## 9. AI Analysis: Free-First, Hard-Capped Overflow

**Funnel (assumed; measured in Phase 0):** collected ≈ 15–25 K items/day at maturity → dedupe/near-dup −30 % → football-relevance gate → transfer-signal recall gate (multilingual lexicon, *recall-tuned*) → (P2) local embedding classifier → **~4–6 K articles/day reach the LLM**.

**Routing (free-first):**
1. Free-tier keys/providers (Phase 0 decides which; reported Gemini free tiers range from ~20 to ~1,000 requests/day depending on model 🔎 [summary](https://www.aifreeapi.com/en/posts/gemini-api-free-tier-complete-guide), so the router reads real limits and counts calls).
2. When free capacity for the day is used, the **existing paid Gemini key** (Flash-Lite-class model) handles the overflow **only while the monthly dollar cap has room**.
3. Otherwise items wait in the priority queue (tier-A/B sources → priority leagues → highest gate score) and **age out after 3 days**.

**Why the cap goes far (estimate; re-measured in Phase 0):** Flash-Lite list price ≈ $0.10 per 1 M input and $0.40 per 1 M output tokens 🔎 ([pricing summary](https://www.morphllm.com/gemini-api-pricing); verify current price). One batched request of 8 articles ≈ 4.6 K input + 1.2 K output tokens (English-only, compact JSON) ≈ **$0.001 per request ≈ $0.00012 per article**. **$5/month ≈ 40 K articles/month ≈ 1,300 articles/day of paid overflow**, on top of whatever the free tier covers (≈ 3–4 K/day if ~500 free requests/day are available). Using the larger "Flash" model would be ~6× more expensive per article, so it is reserved for rare ambiguous items (tracked against the same cap).

**Prompt design:** structured JSON per article (players, clubs, coaches, competition, signal codes, claimType, attribution, `evidenceQuote`, event date, **English headline + 1–2 sentence English summary**, confidence). **No Hebrew translation of articles** (owner decision): the UI chrome (labels, buttons, filters) stays EN/HE per repo rules; article/report text is English, with the original-language headline shown alongside.

**Safeguards:** schema validation, repair-retry (counts against quota, so max 1), evidence-quote-must-appear-in-text validator, prompt-injection-safe framing (articles are delimited data, no tools), content-addressed idempotency (never re-analyze unchanged content), per-language precision tracking on the eval set, 3 % gate-reject audit sample (counted in quota).
**Privacy note:** free-tier API terms may allow the provider to use submitted content to improve products 🔎 ⚠; the paid key's terms differ. Only public article text/headlines are sent in either case; no user notes or contacts.

**Local fallback:** small open model (CPU, quantized) on the runner for triage only when free quota and the dollar cap are both exhausted — slow, optional (Phase 3).

---

## 10. Scoring, Correlation, Verification (unchanged logic, runs free in code)

**Components (max):** availability 25 · exclusion 15 · playingTime 10 · relationship 15 · contract 10 · independence 10 · financial 5 · replacement 5 · other 5 = 100.
`s_k = max_i strength_i × cred(origin_i) × recency_i × (1−contradiction_i) × verificationFactor_i`; `points_k = weight_k × s_k` (contract and independence use tables).
Credibility factor by tier: A 1.0 · B 0.8 · C 0.55 · D 0.3. Recency `0.5^(age/halfLife)`: availability 21 d, exclusion 14 d, playingTime 21 d, relationship 30 d, financial 45 d, replacement 30 d, other 21 d. Verification factor: CONFIRMED 1.0, REPORTED 0.8, RUMOR 0.4. Contradiction: 0.5 per credible denial, 1.0 if superseded (`RETURNED_TO_SQUAD`, `RENEWED_CONTRACT`, `TRANSFER_COMPLETED`).
Guards: **score ≤ 69** unless ≥ 2 independent origins, or a tier-A source, or objective squad data; **≤ 59** with a single origin of tier ≥ C; injured/suspended ⇒ exclusion & playingTime = 0 with explanation; same-origin duplicates never raise `independence`; completed transfer ⇒ archived. Levels 85+/70+/50+/30+/<30. Explanation (components, drivers, modifiers, caps) stored per score in `score_history` / `opportunities.explanation`; AI narrative (labeled AI) is generated afterwards from the numbers and cannot change them.
**Verification status** (deterministic): CONFIRMED (official/structured data or ≥2 independent tier-A/B stating as fact) · REPORTED (credible, attributed) · RUMOR (unattributed/speculative/tier-D-only/headline-only) · AI_INFERENCE (correlation output, always labeled).
**Urgency** = 0.35·contractPressure + 0.25·recencyOfChange + 0.20·scoreVelocity + 0.10·windowProximity + 0.10·competitionRisk, with reasons listed. **Next action** from rules (contact now / verify first / approach as free agent / shortlist & monitor / watch).
Weights are versioned config rows (`config`), back-tested in Phase 1 against known moves.

---

## 11. Free Football Data (Phase 2)

`FootballDataProvider` interface; adapters: existing TM/scout DB ✔ (contract, club, DOB, via existing proxy — no new bulk TM scraping), API-Football **free** key (100 requests/day class ⚠) used only for priority leagues' lineups/injuries, football-data.org free tier (limited competitions ⚠), Wikidata (DOB/nationality for notable players), Flashscore resolver ✔ for fixtures. League coverage registry ⇒ UI shows "no squad data for this league"; exclusion for uncovered leagues comes only from text reports and is labeled REPORTED.

---

## 12. Web, API, Auth

New: `mgsr-web/src/app/transfer-radar/{page,players/[id]/page,sources/page,alerts/page}.tsx`, `src/app/api/transfer-radar/*/route.ts`, `src/components/transfer-radar/*`, `src/lib/transferRadar/*`. Minimal edits: `BritRail.tsx`, `MoreSheet`/`MobileBottomTabBar`, `LanguageContext.tsx` (EN/HE keys), `featureFlags.ts` (`TRANSFER_RADAR_ENABLED`), `ARCHITECTURE.md`. **No** `firestore.rules`/`indexes` changes and **no** new Cloud Functions.
Auth: client sends Firebase ID token → route runs `verifyIdToken` → admin routes check `Accounts.role` (1 cached Firestore read per 5 min ⚠ role field to confirm) → Turso query with parameterized SQL (read/write token kept server-side only). Rate-limit routes in memory; response caching headers.
Repo-rule deviation (needs approval, D6): writes go through Next API routes to Turso rather than Cloud Functions callables, because callables would add billable Functions usage and Firestore writes.
UI: dark BRIT black/gold, dense tables, verification badges (CONFIRMED / REPORTED / RUMOR / AI), score "why" panel, no oversized cards or gradients; EN/HE + RTL; 375/768 responsive. Dashboard = "Morning Brief" table + compact panels (loan, transfer, contract expiry, new sources, countries, recently updated). Live-ish updates by polling `?since=` every 60 s.

---

## 13. Alerts

Evaluate rules after scoring; store in `alerts`; `DashboardChannel` (bell + feed via polling) in P1; `PushChannel` (FCM from Actions with existing `FIREBASE_*` secrets) for high priority only; `EmailChannel`/`WhatsAppChannel` interfaces exist but are not enabled (no free compliant WhatsApp Business API; email via a free tier such as the existing Gmail SMTP pattern used in `systemHealthCheck` ✔ is possible in P3 within Gmail limits ⚠). Cooldowns/dedupe as in v1.

---

## 14. Budget & Quota Table (all numbers re-measured in Phase 0)

| Resource | Limit (planning value) | Planned use at pilot (500–1,000 sources) | Guard |
|---|---|---|---|
| GitHub Actions | unlimited (public repo) | ~5–8 h/day total, ≤ 6 parallel shards | concurrency groups, run-time budget |
| LLM — free tier | ~250–1,000 requests/day/provider ⚠ | up to ~70 % of the real limit | `quota_ledger` stop |
| **LLM — existing paid Gemini key** | **cap $5/month (ceiling $6)** | **≈ $2–5/month, only as overflow** | **dollar ledger; warn 80 %, stop 100 %** |
| Turso storage | 500 MB (lowest quoted) | ≤ 300 MB | prune at 350 MB |
| Turso row writes | ≥ 10 M/month | ~2–3 M/month | write counter |
| Turso row reads | ≥ 1 B/month | ≪ 50 M/month | indexed queries only |
| GDELT | keyless, rate-polite | ~200–400 queries/day | 1 request / few s |
| API-Football (existing key/plan) | existing plan limits ⚠ | only P2, ≤ 70 % of daily cap | counter |
| Firestore (existing) | pay-as-you-go, no hard cap | **< 300 reads/day** | cached role read + FCM token reads |
| FCM | free | high-priority only | cooldowns |
| **Extra monthly spend** | **≤ $6** | **≈ $0–5** (LLM overflow only) | software cap + optional GCP budget alert |

**Honest capacity statement:** expected **~4–6 K analyzed articles/day** (free tier + ≤ $5 overflow), enough for roughly 500–1,000 well-chosen sources. If free limits turn out lower, capacity falls toward ~1,300/day (paid overflow only) and the priority queue keeps the best sources first; the admin panel shows how many items were skipped for budget reasons. Raising the cap is **your** decision and is never done automatically.

---

## 14b. Recency Window & Date Integrity (intake window confirmed at 30 days by owner; other values proposed)

| Setting (`config`) | Default | Effect |
|---|---|---|
| `intakeDays` | **30** (owner-confirmed) | articles older than this are dropped at the gate (free, before any LLM call) |
| `signalMaxAgeDays` | availability 30 · relationship 30 · playingTime 30 · replacement 30 · exclusion 21 · other 21 · financial 45 | signal stops counting after this; before it, half-life decay applies (§10) |
| `squadExclusionWindow` | last 5 matchdays or 21 days | form-based, current |
| `archiveAfterDays` | 45 | player with no new qualifying signal is archived |
| `dashboardDefaultDays` | 30 (options 7/14/30/60) | default view of what changed |
| `gdeltTimespan` | 24–72 h per run | never queries the 3-month index |

**Date pipeline:** (1) feed `pubDate` / `<updated>` only if no better value; (2) HTML `article:published_time`, JSON-LD `datePublished`; (3) sitemap `lastmod` as fallback only; (4) first-seen time only for sources polled ≤ 6 h; (5) else `NO_DATE` → skipped. `dateModified` is stored separately and never replaces `published_at`. Re-emitted old feed items are caught because the published date, not the feed order, is compared with `now − intakeDays`.
**Event-date check:** the extraction schema includes `eventDate` and `historicalReference`; a post-validator rejects scoring when `eventDate < now − signalMaxAge(signal)` or the model marks the claim as a historical recollection (e.g., "in 2023 he clashed with…"). The evidence quote must still appear in the text (§9).
**First scan / backfill:** a newly approved source is scanned for the intake window only; sitemap crawling stops at the first item older than `intakeDays`. 
**Interaction with retention:** non-qualifying reports are pruned after 14 d (§15), so the intake window and retention align; qualifying reports remain on the timeline (12 months compact) but are marked old after 30 days and no longer score after their signal life.
**Cost effect:** the age filter removes the oldest items at zero cost and keeps LLM spend (and the $5 cap) focused on fresh material.

---

## 14c. Feasibility PoC Evidence (2026-11-01, run from the build sandbox, datacenter IP, no accounts, $0)

1. **Feed availability:** 41 local outlets across 10 countries probed → 28 (68 %) exposed a working RSS/Atom feed on a single automated pass (some others blocked datacenter IPs or lacked feeds); items carried real publication dates, 99 % within 30 days. Feeds hold only the latest ~20–150 items, so continuous polling (not archive crawling) is required.
2. **Signals exist in local media:** native-language searches (Google News RSS, 30 days) returned e.g. Greece 38, Romania 65, Poland 31, Turkey 30 items, with genuinely actionable examples (club-side contract terminations, "poza kadrą" at a club, "wants to leave" at mid-level clubs).
3. **Weak spots found:** Croatia returned 0 and Serbia 3 via search ⇒ **search-based discovery is thin for small markets; direct local feeds are required.** Lithuania returned 2 (and they were basketball). A single snapshot of ~600 general-sport headlines contained ~0 signal headlines ⇒ signals are rare and must be caught continuously, often in article bodies.
4. **Noise is high:** in a quick manual read of ~48 returned headlines, roughly a quarter to a third looked plausibly actionable; the rest were global stars (not recruitable for this agency), national-team call-ups, other sports, or non-player news ⇒ new requirement **R23** and an LLM-based relevance/target-profile filter.
5. **Not yet proven:** extraction accuracy of the cheap model on minor languages, entity resolution on lower-league players, GDELT coverage (sandbox IP was rate-limited), and real cost per 1,000 articles. These are the pass/fail items of the next PoC (tasks 0.P1–0.P3).
*(Caveat: items 2–4 are small-sample observations, not measured precision/recall.)*
6. **PoC round 2 (2026-11-01):** strict prompt + rules ⇒ ≈ 54 % item-level precision on 26 final flags (manual grade; target ≥ 70 %), cost ≈ $0.075 per 1,000 headline-level items. **Scoring finding:** with only headline-level reports and no contract/squad data, a single explicit report from a decent source scores ≈ 15–21/100 and only multi-signal cases reach "Monitor" (Chorý 41). The weights make 50+ unreachable without contract and squad data (up to 20 points) ⇒ recalibrate weights/levels against known cases in Phase 1 (task 1.26) — decision for the owner. **Name resolution finding:** ~1 in 4 strong leads do not name the player in the headline (e.g. "Player worth €750K out of Raków's squad") ⇒ the pipeline needs a body read for flagged-but-unnamed items (cheap: only those items).

---

## 15. Security, Privacy, Retention

Turso token only in server env; all SQL parameterized; admin actions audited (`source_events`); untrusted-content handling for prompts; excerpt-only storage (≤300 chars) + evidence quote ≤25 words + summaries; raw body 72 h; **retention defaults** (free storage): non-qualifying reports 14 d, excerpts 30 d, qualifying reports/timeline 12 months compact, score history 12 months; deletion by player on request. Privacy/legal gate (R19) unchanged and still required before production.

## 16. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Free LLM limits shrink or change | Free-first routing + capped paid overflow, strict gating, batching, priority queue; limits monitored |
| Turso free terms change / storage 500 MB | Repository interface; D1/Supabase fallback; pruning; export script |
| Actions IPs blocked by sites | `accessLimitation`; GDELT/RSS alternatives; manual add; no bypass |
| GitHub policy on Actions use / 60-day scheduler pause | Modest volume, project-related data work, heartbeat |
| Public repo exposes prompts/weights | Option D3: keep them in DB |
| Quality in minor languages with the cheap model | Eval set per language; escalate only ambiguous items to a stronger model within the same $ cap |
| Lower scale than the original vision | Stated up-front; raising the cap is your explicit choice |
| Defamation/privacy from rumors | Epistemic labels, wording rules, legal gate |
| Runaway LLM spend (bug, loop, retry storm) | Dollar ledger computed from API `usageMetadata`; per-run and per-day sub-caps (daily ≤ cap/20); retry limits; kill-switch config flag; optional GCP budget alert |

## 17. Decisions Needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Coexist with Market Radar (untouched) | Yes |
| D2 | Turso as pipeline DB (alt: D1/Supabase) — requires creating a free Turso account | Yes |
| D3 | Keep pipeline code in this public repo vs. separate public worker repo with prompts/weights in DB | Same repo for P1; DB-loaded prompts/weights anyway |
| D4 | Create a **new API key in the existing Google Cloud project** (same payment method) dedicated to Radar; also create a free AI Studio key (no billing) for free-tier capacity if you want | Yes; free key optional |
| D5 | Pilot = ~10 countries (Serbia, Cyprus, Croatia, Romania, Bulgaria, Lithuania, Poland, Greece, Turkey, Portugal-2) | Yes |
| D6 | Writes via Next API routes → Turso (deviation from "writes via callables") | Yes |
| D7 | Articles/reports in **English only** (no Hebrew article text); UI labels stay EN/HE | **Decided by owner** |
| D8 | Auto-promotion of sources off by default | Yes |
| D9 | Player photos: placeholder unless licensed | Yes |
| D10 | Admin identification method (`Accounts.role` ⚠) | Confirm |
| D11 | Feature flag off in production until legal gate | Yes |
| D12 | LLM cap: $5/month (ceiling $6), software-enforced; changes only by your explicit approval | **Approved by owner (≈ $5–6)** |

## 18. Unverified Assumptions (Phase 0)
1. Real free LLM limits per provider/model and minor-language quality (Serbian, Greek, Lithuanian, …); real token use per batched request.
2. Turso free plan current limits (sources disagree: 500 MB vs 5 GB; 10 M vs 50 M writes).
3. GDELT rate limits and recall for small local sites per country.
4. Share of target sites with RSS/sitemap and not blocking datacenter IPs.
5. `Accounts.role` admin semantics; Vercel API route limits.
6. API-Football/football-data.org free coverage for target leagues.
7. Which Gemini model/key the project currently uses and whether its project has a budget alert set.
