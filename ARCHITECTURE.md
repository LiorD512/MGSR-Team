# MGSR Team — Complete Architecture Reference

> **Every agent MUST read this file before writing a single line of code.**
> Last updated: 2026-07-17

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Infrastructure Map — Where Everything Runs](#2-infrastructure-map)
3. [Android App (Kotlin + Jetpack Compose)](#3-android-app)
4. [Web App (Next.js + TypeScript + Tailwind)](#4-web-app)
5. [Cloud Functions (Firebase)](#5-cloud-functions)
6. [Football Scout Server (Render)](#6-football-scout-server-render)
7. [Cloud Run Workers (GCP)](#7-cloud-run-workers-gcp)
8. [GitHub Actions (CI/CD)](#8-github-actions-cicd)
9. [Firestore Data Model](#9-firestore-data-model)
10. [Platform System (Men / Women / Youth)](#10-platform-system)
11. [Remote Config](#11-remote-config)
12. [Authentication & Authorization](#12-authentication--authorization)
13. [Localization (EN + HE)](#13-localization)
14. [External Data Sources](#14-external-data-sources)
15. [Notification System (FCM)](#15-notification-system-fcm)
16. [Feature Inventory — Every Screen & Page](#16-feature-inventory)
17. [API Route Inventory — Web](#17-api-route-inventory-web)
18. [Callable Inventory — Cloud Functions](#18-callable-inventory)
19. [Transfermarkt Scraping](#19-transfermarkt-scraping)
20. [Landing Site](#20-landing-site)

---

## 1. System Overview

MGSR Team is a **multi-platform football agent management system** for managing player rosters, scouting, club requests, contract tracking, mandates, and AI-powered player discovery.

**Three client platforms sharing one backend:**
- **Android app** — Kotlin + Jetpack Compose (`app/`)
- **Web app** — Next.js 14 + TypeScript + Tailwind (`mgsr-web/`)
- **Landing site** — Static marketing page (`mgsr-landing/`)

**Three player platforms (switchable at runtime):**
- **Men** — Professional men's football
- **Women** — Women's football (SoccerDonna data source)
- **Youth** — Youth/academy football (IFA data source)

---

## 2. Infrastructure Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                    WHERE EVERYTHING RUNS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  VERCEL (Web Hosting + Serverless)                                 │
│  ├─ mgsr-web (Next.js 14) ──── management.mgsrfa.com              │
│  │   ├─ SSR pages (players, dashboard, requests, etc.)             │
│  │   ├─ API routes (/api/scout/*, /api/transfermarkt/*, etc.)      │
│  │   │   └─ These proxy to Render server or execute server-side    │
│  │   └─ Static assets + OG image generation                       │
│  └─ mgsr-landing (static HTML) ──── mgsrfa.com                    │
│                                                                     │
│  FIREBASE (Backend-as-a-Service)                                   │
│  ├─ Firestore ──── All data storage (players, contacts, tasks...)  │
│  ├─ Cloud Functions ──── 77+ functions (callables, triggers, cron) │
│  ├─ Authentication ──── Email/password login                       │
│  ├─ Cloud Storage ──── Documents (passports, medicals, mandates)   │
│  ├─ Cloud Messaging (FCM) ──── Push notifications                  │
│  └─ Pub/Sub ──── Async worker dispatch                             │
│                                                                     │
│  RENDER (Python Server)                                            │
│  └─ football-scout-server ──── football-scout-server-l38w.onrender │
│      ├─ Player database (19K+ scraped from Transfermarkt)          │
│      ├─ API-Football enrichment (per-90 stats)                     │
│      ├─ FMInside enrichment (FM attributes, CA/PA)                 │
│      ├─ Similarity engine + recruitment search                     │
│      ├─ Scout report generation                                    │
│      ├─ "Find Next" feature (signature-based discovery)            │
│      └─ Deterministic enrichment (comparisonQuality + uniqueTrait) │
│                                                                     │
│  GOOGLE CLOUD PLATFORM (Workers)                                   │
│  ├─ Cloud Run Job: player-refresh-job (hourly micro-batch)         │
│  │   └─ Refreshes 200 stalest players/hour via TM proxy with       │
│  │      Vercel HTML fallback when TM returns non-parseable HTML    │
│  │       (4,800 players/day capacity; skips recently refreshed)    │
│  ├─ Cloud Run Job: releases-refresh-job (daily + manual trigger)   │
│  │   └─ Scrapes releases/free agents and falls back to the web     │
│  │      HTML proxy when direct Cloud Run fetches return empty HTML │
│  └─ Cloud Run Job: scout-db-build (Monday 4am)                    │
│      └─ Rebuilds Render server database (12-14 hour job)           │
│                                                                     │
│  GITHUB ACTIONS (Scheduled Automation)                             │
│  ├─ transfer-windows.yml ──── Manual only (schedule disabled)       │
│  ├─ weekly-contract-finishers.yml ──── Monday 2am Israel           │
│  ├─ weekly-returnees.yml ──── Thursday 2am Israel                  │
│  └─ weekly-scout-images.yml ──── Tuesday 3am Israel                │
│                                                                     │
│  ANDROID DEVICE (Native App)                                       │
│  └─ app/ ──── Direct Firestore reads + callable writes             │
│      └─ transfermarkt/ ──── JSoup HTML scraping module             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

```
Client (Android/Web) ──read──→ Firestore (real-time listeners)
Client (Android/Web) ──write──→ Cloud Functions callable ──→ Firestore
Web API routes ──proxy──→ Render server (scout data)
Web API routes ──scrape──→ Transfermarkt (cheerio)
Android ──scrape──→ Transfermarkt (JSoup)
GCP Cloud Run ──refresh──→ Transfermarkt → Firestore
GCP Cloud Run ──build──→ Render server DB → GitHub → auto-deploy
GitHub Actions ──cache──→ Firestore (contract finishers, returnees)
Firebase Triggers ──notify──→ FCM → Android/Web push
Firebase Scheduled ──cron──→ Mandate expiry, task reminders, scout agent
```

---

## 3. Android App

**Module:** `app/`
**Language:** Kotlin
**UI Framework:** Jetpack Compose
**Min SDK:** (configured in app/build.gradle.kts)
**Architecture:** MVVM (ViewModel + StateFlow + Compose)
**DI:** Manual dependency injection via `MainDi.kt`

### Branding Note (External-Facing)

- Public-facing Android branding now uses **BRIT Sport Group** labels in string resources (`app_name`, logo content description, notification channel display name).
- The shared Android logo drawable `for_app_logo.xml` now points to the BRIT circular black/gold mark (`brit_circle_black_gold` asset), so login/splash/notification visual surfaces inherit the new logo without changing internal identifiers.
- Android mandate PDF generation now renders the BRIT circular logo asset and uses **BRIT Sport Group** as the agency name in mandate text.

### Package Structure

```
app/src/main/java/com/liordahan/mgsrteam/
├── application/
│   ├── MGSRTeamApplication.kt          # App entry, initializes config + DI
│   └── di/MainDi.kt                    # Manual DI container
├── config/
│   └── AppConfigManager.kt             # Remote config singleton (Firestore Config collection)
├── firebase/
│   ├── FirebaseHandler.kt              # Dynamic collection names per platform
│   └── SharedCallables.kt              # 40+ callable wrappers → Cloud Functions
├── features/
│   ├── login/                           # LoginScreen + LoginScreenViewModel
│   ├── home/                            # DashboardScreen + HomeScreenViewModel
│   ├── players/                         # PlayersScreen + PlayerInfoScreen + ViewModels
│   ├── shortlist/                       # ShortlistScreen + ShortlistViewModel
│   ├── contacts/                        # ContactsScreen + ContactsViewModel
│   ├── addplayer/                       # AddPlayerScreen + AddPlayerFromLinkScreen
│   ├── requests/                        # RequestsScreen + RequestsViewModel
│   ├── releases/                        # ReleasesScreen + ReleasesViewModel
│   ├── contractfinisher/                # ContractFinisherScreen + ViewModel
│   ├── returnee/                        # ReturneeScreen + ReturneeViewModel
│   ├── warroom/                         # WarRoomScreen + WarRoomReportScreen + ViewModel
│   ├── aiscout/                         # AiScoutScreen + AiScoutViewModel
│   ├── chatroom/                        # ChatRoomScreen + ChatRoomViewModel
│   ├── shadowteams/                     # ShadowTeamsScreen + ShadowTeamsViewModel
│   ├── notificationcenter/              # NotificationCenterManager + NotificationCenterSheet
│   ├── platform/                        # PlatformManager (Men/Women/Youth switcher)
│   └── scouting/                        # Scout profile data
├── navigation/
│   └── NavGraph.kt                      # All routes + NavHost
├── services/
│   ├── MgsrFirebaseMessagingService.kt  # FCM handler (push notifications)
│   ├── CloudVisionOcrProvider.kt        # Google Cloud Vision OCR
│   ├── GeminiPassportOcrProvider.kt     # Gemini AI OCR for passports
│   ├── PdfFlattener.kt                  # PDF form flattening
│   ├── GpsPdfParser.kt                  # GPS performance PDF parsing
│   └── AiHelperService.kt              # Scout reports, similar player discovery (hidden gem removed)
├── ui/                                  # Shared UI components, theme, styles
└── util/                                # Utilities, extensions
```

### Navigation Routes

```
/login
/dashboard
/players                          # Full roster (filterable)
/player_info/{tmProfileUrl}       # Single player detail
/releases                         # Free agents (24-48h)
/contract_finisher                # Expiring contracts
/returnee                         # Loan returnees
/add_player/{tmProfileUrl}        # Add player from TM search
/add_to_shortlist/{tmProfileUrl}  # Add to shortlist from TM URL
/shortlist                        # Draft/shortlist management
/contacts                         # Club/agency contacts
/requests                         # Club requests + matching
/tasks                            # Agent tasks
/task_detail/{taskId}             # Single task detail
/shadow_teams                     # Fantasy formation builder
/ai_scout                         # AI-powered player search
/war_room                         # Discovery candidates + scout agents
/war_room_report/{tmUrl}/{name}   # Individual scout report
/chat_room                        # Team messaging
/mandate_preview                  # Mandate preview
/generate_mandate                 # Mandate PDF generation
```

### ViewModels (16)

| ViewModel | Screen | Data Source | Key Actions |
|-----------|--------|-------------|-------------|
| `MainViewModel` | Root | Auth state, pending TM URLs | Deep linking |
| `LoginScreenViewModel` | Login | Firebase Auth | Login, FCM registration |
| `HomeScreenViewModel` | Dashboard | Players, Tasks, FeedEvents, Accounts | Stats, task completion, birthdays |
| `PlayersViewModel` | Players | Firestore Players (real-time) | Filter, sort, search |
| `PlayerInfoViewModel` | Player Detail | Firestore + External APIs | Notes, docs, offers, mandates, stats |
| `ShortlistViewModel` | Shortlist | Firestore Shortlists | Add/remove, notes, outreach tracking |
| `ContactsViewModel` | Contacts | Firestore Contacts | CRUD, link to players |
| `AddPlayerViewModel` | Add Player | TM/SoccerDonna/IFA search | Search + create player |
| `RequestsViewModel` | Requests | Firestore Requests + Players | CRUD, matching algorithm |
| `ReleasesViewModel` | Releases | Transfermarkt scraping | Position/value filters |
| `ContractFinisherViewModel` | Contract Finisher | Transfermarkt scraping | Age/value filters |
| `ReturneeViewModel` | Returnees | Transfermarkt scraping | Position/value filters |
| `WarRoomViewModel` | War Room | Web API (MgsrWebApiClient) | Browse AI candidates |
| `AiScoutViewModel` | AI Scout | Web API (MgsrWebApiClient) | AI search, "find next" |
| `ChatRoomViewModel` | Chat Room | Firestore ChatMessages | Send/edit/delete, mentions |
| `ShadowTeamsViewModel` | Shadow Teams | Firestore ShadowTeams | Formation builder, player slots |
| `GenerateMandateViewModel` | Mandate | Firestore + PDF generation | Generate mandate PDF |

### Transfermarkt Module (`transfermarkt/`)

Separate Gradle module for HTML scraping via JSoup:

| Class | Purpose |
|-------|---------|
| `PlayerSearch` | Search players by query → name, age, club, position, value, TM URL |
| `SoccerDonnaSearch` | Women player search (SoccerDonna website) |
| `ClubSearch` | Search clubs by name |
| `AgencySearch` | Search agencies |
| `ContractFinisher` | Expiring contracts (150K–3M value, ≤31 age) |
| `LatestReleases` | Players released in last 24-48h |
| `Returnees` | Players returning from loans |
| `PlayersUpdate` | Market value/club changes for roster players |
| `TeammatesFetcher` | Teammates of a given player |
| `ClubSquadValueFetcher` | Total squad market value |
| `TransferWindows` | Current transfer window identification |
| `NationToConfederation` | Country → FIFA confederation mapping |
| `TransfermarktHttp` | Base HTTP client with throttling + user-agent rotation |
| `TransfermarktParsing` | Shared HTML parsing helpers |

---

## 4. Web App

**Module:** `mgsr-web/`
**Framework:** Next.js 14.2.0 (App Router)
**Language:** TypeScript
**Styling:** Tailwind CSS
**Deployment:** Vercel
**Domain:** management.mgsrfa.com
**Rendering:** Mostly client-side with `force-dynamic` layout

### Branding Note (External-Facing)

- Public-facing web labels and metadata now present **BRIT Sport Group** while preserving internal code/package/API naming.
- Web login screen now presents BRIT Sport Group branding directly in the auth card and uses the shared black/gold visual palette instead of the older teal-accent treatment.
- Web logo asset for user-visible surfaces is `mgsr-web/public/brit_circle_black_gold.svg` (used in app chrome, mobile header, shared pages, and share OG visuals).
- Web mandate flows now use BRIT branding end-to-end: mandate PDF generator logo/source text and signing page metadata/footer labels.
- The authenticated web app now uses a BRIT premium shell across desktop and mobile (`AppLayout`, `MobileHeader`, `MobileBottomTabBar`) with black/gold-glass surfaces; route hero/filter sections for dashboard, players, requests, tasks, shortlist, contacts, contract-finisher, returnees, release-notifications, club-change-notifications, shadow-teams, and portfolio are aligned to that shared visual language.
- Tunnel (`/chat-room`) remains implemented, but is currently hidden from desktop and mobile navigation menus (commented nav entries) per management-web configuration request.
- Desktop app-shell brand block now removes the eyebrow microcopy near the sidebar logo and renders a single gold BRIT Sport Group wordmark vertically centered with the logo, while preserving the original wordmark size.
- Desktop app-shell sidebar brand link no longer renders the rounded white framed container behind the BRIT logo/wordmark; only the logo + text remain visible.
- Web browser/tab branding now forces BRIT icon assets via `mgsr-web/src/app/layout.tsx` metadata icons and `mgsr-web/public/manifest.json` icon source, both pointed to `brit_circle_black_gold.svg` with a version query to bypass stale favicon cache.
- Dashboard hero no longer renders the "Agency Pulse / דופק הסוכנות" eyebrow badge; only greeting, user name, and date remain in the hero header.
- Players hero no longer renders the "Squad Intelligence / מודיעין סגל" eyebrow badge and now starts directly with the page headline and stats subtitle.
- Requests hero no longer renders the "Matching Engine / מנוע התאמות" eyebrow badge and now starts directly with the page headline and subtitle.
- Players "With Mandate" accordion and internal list on web now use the BRIT gold palette (container, counter, labels, list rows, and expiry chips) instead of the previous blue accent treatment.
- Contacts page (men platform) now uses BRIT gold accents across add CTA, filter chips, search focus, loading/empty states, contact avatar fallback, contact-type badges, and edit/phone actions; women and youth accent variants remain platform-specific.
- Releases page now matches the new BRIT palette on web, including hero actions, value chips, search/filter/sort controls, loading and empty states, release cards, shortlist/bookmark states, and roster-teammates panels.
- Android shared Transfermarkt URL parsing now normalizes profile links with query/hash/legacy formats before extracting player IDs, so played-with (roster teammates) matching remains stable when URLs come from shared links.
- Release Notifications date sorting is now deterministic across Android + Web: sort by parsed `transferDate` (desc), then FeedEvents `timestamp` (desc), then market value (desc), so newest Transfermarkt releases stay at the top when users sort by date.
- Returnees streaming endpoint (`mgsr-web/src/app/api/transfermarkt/returnees/stream/route.ts`) now emits periodic SSE heartbeats during long scrape batches to prevent proxy/browser idle disconnects that previously caused premature "Stream connection failed" in the Returnees UI.
- Desktop app-shell desktop page chrome no longer renders the shared framed header card, status pills, or shared page-title headline; pages now begin directly with their own content.
- Web Tasks page (men platform) now uses the BRIT gold/black treatment instead of the older teal/blue palette across the hero, toolbar actions, task cards, empty states, and create/edit task flows.
- Web Shortlist page (men platform) now uses BRIT gold accent tokens end-to-end (hero CTAs, filter tray, chips, cards, loading states, badges, action pills, and empty states), replacing the legacy teal/purple split.
- BRIT redesign copy in shell/hero surfaces is now routed through `LanguageProvider` translation keys (EN/HE) instead of hardcoded English text, including route meta labels, navigation section headers, workspace badges, and redesigned hero/filter labels across the upgraded feature pages.
- Web theme tokens were upgraded in `mgsr-web/src/app/globals.css` + `mgsr-web/tailwind.config.ts` to a richer cinematic palette (deep navy, luminous teal, premium gold) with shared aurora and sheen effects so all screens inherit the updated wow-style surfaces consistently.
- Temporary feature visibility toggle (commented, not deleted): `Shadow Teams`, `Portfolio`, dashboard `Open Transfer Windows`, and dashboard `Ligat Ha'al analytics` are hidden from primary navigation/dashboard UI via commented entries/sections in app shell and dashboard files.
- Temporary feature disable (commented/guarded, not deleted): Tasks UI/entry points are disabled in both Android and Web through feature flags (`app/.../config/FeatureFlags.kt` and `mgsr-web/src/lib/featureFlags.ts`), including navigation entries, dashboard task sections, player-task sections, and tasks deep-link routing.
- Temporary men-web roster-analysis disable (commented/guarded, not deleted): men roster matching-analysis UI blocks (matching requests, proposal history, and roster teammates/"played with" panels) are hidden behind `MEN_ROSTER_ANALYSIS_ENABLED` in `mgsr-web/src/lib/featureFlags.ts`.

### Key Dependencies

- `firebase` 10.7.0 — Auth, Firestore, Storage, Messaging
- `firebase-admin` — Server-side Firestore access (API routes)
- `@google/generative-ai` — Gemini AI (scout reports, document detection)
- `pdf-lib` + `pdfjs-dist` — PDF generation/parsing
- `recharts` — Data visualization charts
- `react-soccer-lineup` — Football formation display
- `sharp` — Image processing (OG images)
- `cheerio` — HTML parsing (Transfermarkt scraping)
- `impit` — HTTP client for scraping

### Root Layout Structure

```tsx
// src/app/layout.tsx
<AuthProvider>
  <LanguageProvider>
    <PlatformProvider>
      <DirSync />           // RTL/LTR based on language
      <PlatformSync />      // Syncs platform state
      <AppConfigInit />     // Loads remote config from Firestore
      {children}
    </PlatformProvider>
  </LanguageProvider>
</AuthProvider>
```

### Page Routes (28 pages)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Root | Redirect to dashboard |
| `/login` | Login | Email/password authentication |
| `/dashboard` | Dashboard | Stats, feed, birthdays, agents (tasks widgets/actions hidden while feature flag is off) |
| `/players` | Players | Full roster with filters (position, specific+secondary position, foot, contract, agent) |
| `/players/add` | Add Player | Search TM/SoccerDonna/IFA + create player |
| `/players/[id]` | Player Detail (Men) | Full profile: notes, docs, offers, stats, GPS, FM, highlights |
| `/players/[id]/generate-mandate` | Mandate Gen (Men) | Generate PDF mandate |
| `/players/women/[id]` | Player Detail (Women) | Women player profile |
| `/players/women/[id]/generate-mandate` | Mandate Gen (Women) | Women mandate PDF |
| `/players/youth/[id]` | Player Detail (Youth) | Youth player profile |
| `/shortlist` | Shortlist | Draft tracking from TM URLs |
| `/contacts` | Contacts | Club/agency contact database |
| `/requests` | Requests | Club player requests + matching workbench |
| `/releases` | Releases Redirect | Legacy route; redirects to `/release-notifications` |
| `/contract-finisher` | Contract Finisher | Expiring contracts next window |
| `/returnees` | Returnees | Players returning from loans |
| `/war-room` | War Room | AI discovery candidates + scout agents |
| `/ai-scout` | AI Scout | Natural language player search |
| `/find-next` | Find Next | "Find me the next Salah" signature-based discovery |
| `/chat-room` | Chat Room | Team messaging with @mentions + replies |
| `/shadow-teams` | Shadow Teams | Fantasy formation builder |
| `/tasks` | Tasks | Agent task management (route currently shows disabled state while tasks feature flag is off) |
| `/portfolio` | Portfolio | Player portfolio management |
| `/news` | News | Google News + transfer rumours |
| `/jewish-finder` | Jewish Finder | Discover Jewish/Israeli heritage players |
| `/p/[token]` | Shared Player | Public share page (no auth required) |
| `/shared/requests` | Shared Requests | Public requests page (no auth required) |
| `/sign-mandate/[token]` | Mandate Signing | Digital mandate signature page |

### Shared Components (27)

| Component | Purpose |
|-----------|---------|
| `AppLayout.tsx` | Main layout with sidebar navigation |
| `AppConfigInit.tsx` | Initializes remote config on mount |
| `PlatformSwitcher.tsx` | Men/Women/Youth platform toggle |
| `PlatformSync.tsx` | Syncs platform state across components |
| `DirSync.tsx` | Syncs RTL/LTR direction |
| `NotificationBell.tsx` | Notification center: bell icon with unread badge, dropdown panel showing last 20 notifications, mark read/all read |
| `NotificationPrompt.tsx` | FCM permission request |
| `BirthdaysSection.tsx` | Birthday cards on dashboard |
| `ClubIntelPanel.tsx` | Club intelligence panel (on player detail) |
| `FmIntelligencePanel.tsx` | FM Inside data panel (men) |
| `FmInsideWomenPanel.tsx` | FM data for women players |
| `PlayerStatsPanel.tsx` | API-Football per-90 stats |
| `PlayerHighlightsPanel.tsx` | Video highlights (YouTube/Vimeo) |
| `YouthHighlightsPanel.tsx` | Manual URL input for highlights |
| `SimilarPlayersPanel.tsx` | Similar players (via Render server) |
| `SimilarPlayersWomenPanel.tsx` | Similar women players |
| `FindNextTab.tsx` | "Find Next" UI tab |
| `ForeignArrivalsPanel.tsx` | Foreign player arrivals panel |
| `MatchingRequestsSection.tsx` | Requests matching a player |
| `ProposalHistorySection.tsx` | Offer/proposal history |
| `AgentTransferSection.tsx` | Agent transfer management |
| `AddPlayerTaskModal.tsx` | Quick task creation from player |
| `NoteTextarea.tsx` | Rich note input with agent mentions |
| `MobileBottomTabBar.tsx` | Mobile navigation bar |
| `MobileHeader.tsx` | Mobile page header |
| `FilterBottomSheet.tsx` | Mobile filter sheet |
| `MoreSheet.tsx` | Mobile overflow menu |

### Lib Modules (47 files)

| Module | Purpose |
|--------|---------|
| `firebase.ts` | Firebase SDK init (app, auth, db, storage, messaging) |
| `firebaseAdmin.ts` | Firebase Admin SDK (server-side API routes) |
| `callables.ts` | All callable function wrappers (35+ functions) |
| `platformCollections.ts` | Platform-aware collection name resolvers |
| `appConfig.ts` | Remote config (positions, countries, salaries, templates) |
| `transfermarkt.ts` | Cheerio-based TM scraping (player profiles, search) |
| `transfermarkt-utils.ts` | TM parsing utilities |
| `scrapingCache.ts` | Firestore-backed scraping result cache |
| `screenCache.ts` | Client-side screen data cache |
| `scoutApi.ts` | Client-side Render server API client |
| `scoutServerUrl.ts` | Render server URL resolver |
| `scoutAgentConfig.ts` | Scout agent configuration |
| `scoutPersona.ts` | AI scout persona definition |
| `fetchPlayerStats.ts` | Render server player stats fetcher |
| `aiScoutGeminiFirst.ts` | Gemini-first AI scout search (DEAD CODE — never imported) |
| `aiQueryParser.ts` | Gemini AI query parser (DEAD CODE — removed from search route, never called) |
| `parseFreeQuery.ts` | Free-text search query parser (868 lines, regex+keyword, Hebrew+English — primary parser for all scout searches) |
| `translateQuery.ts` | Hebrew ↔ English query translation (MyMemory API, free) |
| `requestMatcher.ts` | Client-side request ↔ player matching (used directly in shortlist flows and as web requests-page fallback merge with precomputed match docs) |
| `noteParser.ts` | Parse structured data from agent notes |
| `shortlistIntelligence.ts` | Shortlist analytics |
| `playerIntel.ts` | Player intelligence aggregation |
| `clubIntel.ts` | Club intelligence (league tiers, squad analysis) |
| `portfolioApi.ts` | Portfolio data access |
| `shareApi.ts` | Share page token generation |
| `generateEnrichment.ts` | AI-generated enrichment data (Gemini dossier + FM radar). Used at share-creation (web) and lazy on page load (Android fallback) |
| `mandatePdfGenerator.ts` | Mandate PDF creation |
| `pdfFlatten.ts` | PDF form flattening |
| `documentDetection.ts` | Gemini-based document type detection |
| `highlightsApi.ts` | Video highlights search |
| `ifa.ts` | IFA (Israel Football Association) player data |
| `jewishPlayerFinder.ts` | Jewish/Israeli heritage discovery |
| `nationToConfederation.ts` | Country → FIFA confederation |
| `countryTranslations.ts` | Country name EN ↔ HE |
| `countries.ts` | Country data |
| `accounts.ts` | Account/agent helpers |
| `agentTransfer.ts` | Agent transfer logic |
| `notifications.ts` | Web push notification setup |
| `whatsapp.ts` | WhatsApp deep links for contacts |
| `googleCalendar.ts` | Google Calendar integration |
| `shadowTeamFormations.ts` | Formation definitions (4-3-3, 4-4-2, etc.) |
| `playerTaskTemplates.ts` | Task template definitions |
| `playersWomen.ts` | Women player data utilities |
| `playersYouth.ts` | Youth player data utilities |
| `api.ts` | Generic API helpers |
| `releases.ts` | Release data processing |
| `contractFinisherStore.ts` | Contract finisher data store |
| `returneesStore.ts` | Returnees data store |
| `outreach.ts` | Outreach tracking |

---

## 5. Cloud Functions

**Module:** `functions/`
**Runtime:** Node.js
**Deployment:** Firebase (`firebase deploy --only functions`)
**Total Functions:** 77+

### Categories

| Category | Count | Description |
|----------|-------|-------------|
| Callables | 56 | Client-triggered, auth-required functions |
| Firestore Triggers | 8 | Automatic on data changes |
| Scheduled (Cron) | 7 | Cloud Scheduler daily jobs |
| Pub/Sub Workers | 2 | Long-running async tasks |
| Admin/Maintenance | 6+ | Backfill and validation scripts |

### Callable Files (14 files in `functions/callables/`)

| File | Functions |
|------|-----------|
| `players.js` | `playersUpdate`, `playersToggleMandate`, `playersAddNote`, `playersDeleteNote`, `playersDelete`, `playerDocumentsCreate`, `playerDocumentsDelete`, `playerDocumentsMarkExpired` |
| `playersCreate.js` | `playersCreate` (duplicate check, FeedEvent, shortlist removal) |
| `tasks.js` | `tasksCreate`, `tasksUpdate`, `tasksToggleComplete`, `tasksDelete` |
| `contacts.js` | `contactsCreate`, `contactsUpdate`, `contactsDelete` |
| `requests.js` | `requestsCreate`, `requestsUpdate`, `requestsDelete` (FeedEvent, offer stamping) |
| `requestMatcher.js` | `matchRequestToPlayers`, `matchingRequestsForPlayer`, `matchRequestToPlayersLocal`, `recalculateAllMatchesCallable` |
| `shortlists.js` | `shortlistAdd`, `shortlistRemove`, `shortlistUpdate`, `shortlistAddNote`, `shortlistUpdateNote`, `shortlistDeleteNote` |
| `playerOffers.js` | `offersCreate`, `offersUpdateFeedback`, `offersDelete` |
| `agentTransfers.js` | `agentTransferRequest`, `agentTransferApprove`, `agentTransferReject`, `agentTransferCancel` |
| `chatRoom.js` | `chatRoomSend`, `chatRoomEdit`, `chatRoomDelete` |
| `portfolio.js` | `portfolioUpsert`, `portfolioDelete` |
| `phase6Misc.js` | `sharePlayerCreate`, `shadowTeamsSave`, `scoutProfileFeedbackSet`, `birthdayWishSend`, `offersUpdateHistorySummary`, `mandateSigningCreate` |
| `phase7Account.js` | `accountUpdate` (FCM token validation, language, email lookup) |
| `ifaFetch.js` | `fetchIfaHtml` (NO auth required, proxy fallbacks for Cloudflare) |
| `notificationCenter.js` | `notificationMarkRead`, `notificationMarkAllRead` |

### Firestore Triggers

| Trigger | Collection | Event | Purpose |
|---------|-----------|-------|---------|
| `onNewFeedEvent` | FeedEvents* | onCreate | FCM push for player updates |
| `onNewAgentTask` | AgentTasks* | onCreate | Notify assignee |
| `onMandateSigningUpdated` | MandateSigningRequests | onUpdate | Notify on mandate signature |
| Match Recalc (6×) | Players*/ClubRequests*/PlayerDocuments* | onWrite | Matching-field-aware recalculation on every relevant write (no cooldown skip) |
| `onGpsMatchDataWritten` | GpsMatchData | onWrite | Recompute GPS performance insights (3s debounce) |

### Scheduled Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `mandateExpiryScheduled` | 04:00 daily | Scan and expire mandates, write FeedEvents |
| ~~`releasesRefreshScheduled`~~ | ~~03:00 daily~~ | ~~Scrape TM for new releases~~ — **DISABLED**: moved to GitHub Actions (`daily-releases-refresh.yml`) due to TM HTTP 405 blocking Cloud Functions IPs |
| `scoutAgentScheduled` | 00:00 every 3 days | AI Scout Agent (44 leagues, stats enrichment) → Pub/Sub worker. **Idempotency lock** prevents Pub/Sub redelivery cascades |
| `scoutAgentWatchdogScheduled` | 06:00 daily | Scout-agent cadence watchdog. If latest `ScoutAgentRuns.runAt` is stale (>80h), republishes Pub/Sub trigger for recovery |
| `onTaskRemindersScheduled` | 09:00 daily | Task reminders at 7d, 3d, 1d, today milestones |
| `systemHealthCheckScheduled` | 08:00 daily | System health check email — status of all automated workers |

### Helper Libraries (`functions/lib/`)

| Module | Purpose |
|--------|---------|
| `platformCollections.js` | Platform → collection name mapping |
| `validation.js` | Input validation helpers |
| `feedEvents.js` | FeedEvent creation with deduplication |
| `notifications.js` | FCM push notification sending |
| `notificationCenter.js` | Persist notifications to Accounts subcollection (last 20 per user) |

---

## 6. Football Scout Server (Render)

**Repository:** `football-scout-server/` (separate Git repo)
**Runtime:** Python 3.11 + FastAPI + Uvicorn
**Deployment:** Render.com (auto-deploy on git push)
**URL:** `https://football-scout-server-l38w.onrender.com`
**Workers:** 1 (memory-constrained free tier)

### How It Works

1. **Database Build** — Scrapes Transfermarkt for all players in 44+ market leagues (19K+ players)
2. **API-Football Enrichment** — Enriches with per-90 stats (goals, assists, tackles, dribbles, etc.)
3. **FMInside Enrichment** — Enriches with Football Manager attributes (CA, PA, 36 attributes)
4. **Database Persistence** — JSON file committed to GitHub repo → Render auto-deploys with new data
5. **Auto-enrich on Startup** — If API-Football coverage <80%, enriches in background

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Health check (lightweight, no DB load) |
| `/health` | GET | Detailed health with DB statistics |
| `/players` | GET | Return all players in database |
| `/player_stats?url=...` | GET | API-Football stats for single player (by TM URL or name+club) |
| `/similar_players?player_name=...` | GET | Find similar players (style, stats, attributes) + deterministic enrichment (comparisonQuality, uniqueTrait) |
| `/recruitment?position=CB&notes=fast&transfer_fee=300-600` | GET | Smart recruitment search (request matching) |
| `/scout_report?player_url=...&lang=en` | GET | AI-generated scout report |
| `/find_next?player_name=Mohamed Salah&age_min=18&age_max=22&value_max=3000000` | GET | "Find me the next X" — signature-based discovery (deterministic explanation, no Gemini). Web Find Next UI exposes min/max age, min/max value controls; `value_min` is enforced client-side in the web app because the Render response does not currently honor that bound reliably |
| `/fm_profile?player_name=...&club=...` | GET | FM Inside profile (CA, PA, attributes) |
| `/fm_intelligence?player_name=...` | GET | Full FM intelligence report with position fit heatmap |
| `/fm_stats` | GET | FM enrichment coverage statistics |
| `/build_database` | GET | Start full DB build (20-40 min, background) |
| `/build_league?league=...` | GET | Build single league |
| `/build_leagues?leagues=...` | GET | Build multiple leagues |
| `/build_club?club_url=...` | GET | Build single club roster |
| `/build_status` | GET | Current build progress |
| `/enrich_stats` | GET | Enrich API-Football stats for all leagues |
| `/enrich_league?league=...` | GET | Enrich single league stats |
| `/enrich_fm` | POST | Enrich FM data for all players (hours-long) |
| `/push_db` | GET | Push DB to GitHub (→ Render redeploy) |
| `/api_football_status` | GET | API-Football enrichment coverage |
| `/api_football_leagues` | GET | Supported API-Football leagues |

### How Web App Calls Render

Web app **never calls Render directly from the browser** (CORS). Instead:
1. Browser → `/api/scout/recruitment` (Vercel API route)
2. Vercel API route → `https://football-scout-server-l38w.onrender.com/recruitment` (server-to-server)
3. Response flows back through the proxy

**Exception:** `find_next` and `similar_players` are called directly from server components (no Vercel proxy route).

Key proxy routes in `mgsr-web/src/app/api/scout/`:
- `/api/scout/recruitment` → Render `/recruitment`
- `/api/scout/player-stats` → Render `/player_stats`
- `/api/scout/search` → Render `/recruitment` (rule-based query parsing via `parseFreeQuery.ts`)
- `/api/scout/fm-intelligence` → Render `/fm_intelligence`
- `/api/scout/warm` → Render `/` (keep-alive ping)

**Deleted proxy routes** (Android/Web now call Render directly):
- ~`/api/scout/find-next`~ → Android/Web call Render `/find_next` directly
- ~`/api/scout/similar-players`~ → Android/Web call Render `/similar_players` directly

### How Android App Calls Render

Android app calls Render **directly** for performance-critical endpoints:
- `MgsrWebApiClient.findNext()` → Render `/find_next` directly
- Web `FindNextTab` → Render `/find_next` directly with abortable browser fetch; immediate Stop button cancels the active request on the client
- `ScoutApiClient.fetchSimilarPlayers()` → Render `/similar_players` directly
- Other scout features still go through Vercel API routes (search, recruitment, etc.)

### Data Sources Used by Render Server

| Source | Data |
|--------|------|
| Transfermarkt | Player profiles, market values, contracts, clubs, transfers |
| API-Football | Per-90 stats (goals, assists, tackles, progressive carries, etc.) |
| FMInside.com | Football Manager attributes (CA, PA, 36 attributes, position fit) |

---

## 7. Cloud Run Workers (GCP)

### Player Refresh Worker (`workers-job/`)

- **Schedule:** Daily at 02:00 Israel time
- **Runtime:** Node.js + Firebase Admin + Cheerio + impit
- **Timeout:** 4 hours
- **Purpose:** Update all player data from Transfermarkt (market values, club changes, contract dates)
- **Flow:** Query all Players from Firestore → Scrape TM profiles → Update Firestore
- **Intelligence:** Exponential backoff (12s-300s delays), block detection, progress tracking

### Scout DB Build Worker (`workers-job-scout-build/`)

- **Schedule:** Every Monday at 04:00 Israel time
- **Runtime:** Bash + Python
- **Duration:** 12-14 hours
- **Purpose:** Rebuild the football-scout-server database from scratch
- **Secrets:** `GITHUB_TOKEN` + `SCOUT_ENRICH_SECRET` (mounted as `APIFOOTBALL_KEY`)
- **Guardrail:** Build refuses to push when API enrichment percentage is below `MIN_API_ENRICHED_PCT` (default 40%)
- **Flow:**
  1. Clone football-scout-server repo
  2. Run `python3 build.py` (scrapes all 44 leagues from Transfermarkt)
  3. Validate enrichment threshold before git push
  4. Commit DB files to GitHub
  5. Push → Render auto-deploys with new database

---

## 8. GitHub Actions (CI/CD)

**Location:** `.github/workflows/`

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `transfer-windows.yml` | Manual only (schedule disabled) | Scrape transfer window dates on demand → update `mgsr-web/public/transfer-windows.json` |
| `weekly-contract-finishers.yml` | Monday 23:00 UTC (2am Israel) | Populate contract finisher cache in Firestore via `_populate_cache.ts finishers` |
| `weekly-returnees.yml` | Thursday 23:00 UTC (2am Israel) | Populate returnees cache in Firestore via `_populate_cache.ts returnees` |
| `weekly-scout-images.yml` | Tuesday 00:00 UTC (3am Israel) | Enrich scout profile images via `_enrich_images.ts` |
| `daily-releases-refresh.yml` | Manual only (disabled) | Legacy workflow kept for reference; production releases refresh now runs via Cloud Run Job + Cloud Scheduler (`releases-refresh-job`, `releases-refresh-daily`) |
| `test-tm-scraping.yml` | Manual only | Test Transfermarkt fetch logic |

**Pattern:** All workflows use GitHub API for file updates (not git push). Secrets include `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

**Deployment guardrails (Vercel):** `mgsr-web/vercel.json` defines `ignoreCommand` (`scripts/vercel-ignored-build.sh`) to skip web production builds when commits are not web-relevant or when only `mgsr-web/public/transfer-windows.json` changed. Override token in commit message: `[force vercel build]`.

**Local macOS schedule:** `workers-local/com.mgsr.releases-refresh.plist` runs the merged releases worker every day at 10:00 local system time via LaunchAgent. Set the Mac timezone to Israel if you want that to mean 10:00 Israel time exactly.

---

## 9. Firestore Data Model

### Platform-Specific Collections (3× for men/women/youth)

| Collection | Men | Women | Youth | Document Fields |
|------------|-----|-------|-------|-----------------|
| Players | `Players` | `PlayersWomen` | `PlayersYouth` | name, positions[], club, contract{}, marketValue, nationality, tmProfileUrl, agent, notes[], mandate{}, citizenship, dob, height, foot, ... |
| Contacts | `Contacts` | `ContactsWomen` | `ContactsYouth` | name, phone, email, role, type (CLUB/AGENCY), clubName, agencyName, tmProfileUrl, linkedPlayers[] |
| Tasks | `AgentTasks` | `AgentTasksWomen` | `AgentTasksYouth` | title, description, dueDate, priority, completed, playerRef, createdBy, assignedTo, linkedContact |
| Requests | `ClubRequests` | `ClubRequestsWomen` | `ClubRequestsYouth` | position, ageRange{}, salaryRange, transferFee, euOnly, preferences, clubName, clubCountry |
| Feed Events | `FeedEvents` | `FeedEventsWomen` | `FeedEventsYouth` | type, playerName, playerTmUrl, oldValue, newValue, timestamp, agentName, dayBucket |
| Shortlists | `Shortlists` | `ShortlistsWomen` | `ShortlistsYouth` | tmProfileUrl, playerName, club, position, marketValue, notes[], outreachStatus, addedBy, addedAt |
| Portfolio | `Portfolio` | `PortfolioWomen` | `PortfolioYouth` | playerId, enrichments, scoutReport, stats |
| Player Documents | `PlayerDocuments` | `PlayerDocumentsWomen` | `PlayerDocumentsYouth` | type (PASSPORT/MEDICAL/REPRESENTATION/WORK_PERMIT), name, url, expiry, uploadedBy, validLeagues[] |
| Shadow Teams | `ShadowTeams` | `ShadowTeamsWomen` | `ShadowTeamsYouth` | formation, positions{}, accountId |
| Match Results | `MatchResults` | `MatchResultsWomen` | `MatchResultsYouth` | Precomputed request ↔ player match scores |

### Global Collections (shared across all platforms)

| Collection | Purpose |
|------------|---------|
| `Accounts` | Agent accounts (name, email, fcmTokens[], language, role) |
| `Accounts/{id}/Notifications` | Notification center: last 20 push notifications per user (type, title, body, data, timestamp, read) |
| `Config` | Remote config (6 docs: positions, euCountries, countryNames, salaryRanges, transferFees, taskTemplates) |
| `AgentTransferRequests` | Player transfer requests between agents |
| `PlayerOffers` | Offer history (player → club, feedback, request ref) |
| `SharedPlayers` | Public share tokens → player data snapshots |
| `ChatRoom` | Team chat messages (text, sender, mentions, replyTo, attachments) |
| `MandateSigningRequests` | Digital mandate signing workflows |
| `BirthdayWishesSent` | Track sent birthday wishes (prevent duplicates) |
| `ScoutProfileFeedback` | Agent feedback on scout AI profiles |
| `GpsMatchData` | GPS performance raw data |
| `GpsPlayerInsights` | Computed GPS performance insights |
| `ScoutAgentRuns` | Scout agent execution history with lifecycle statuses (`running`, `success`, `failed`) written at start and finalized at completion |
| `WorkerRuns` | Worker job execution history |
| `WorkerState` | Worker state tracking (last run, progress) |

### Notification Center

Every FCM push notification is also persisted to `Accounts/{accountId}/Notifications` subcollection (max 20 per user, auto-pruned). Both Android and Web show a bell icon with unread count badge that opens a notification center panel.

**Written by:** Cloud Functions (`lib/notificationCenter.js`) — called from every notification-sending path in `index.js`, `chatRoom.js`, and `players.js`.

**Read by:** Real-time Firestore listeners on both platforms.

**Callables:** `notificationMarkRead`, `notificationMarkAllRead` (in `callables/notificationCenter.js`).

### FeedEvent Types

```
MARKET_VALUE_CHANGE, CLUB_CHANGE, CONTRACT_EXPIRING, NOTE_ADDED,
MANDATE_EXPIRED, MANDATE_TOGGLED, PLAYER_ADDED, PLAYER_RELEASED,
REQUEST_ADDED, REQUEST_UPDATED, OFFER_CREATED, OFFER_FEEDBACK,
SHORTLIST_ADDED, DOCUMENT_UPLOADED, DOCUMENT_EXPIRED
```

---

## 10. Platform System

### How It Works

Both Android and Web support switching between Men, Women, and Youth platforms at runtime.

**Android:**
- `PlatformManager` singleton holds `current: StateFlow<Platform>`
- `switchTo(platform)` persists choice to SharedPreferences
- `FirebaseHandler` dynamically resolves collection names based on current platform

**Web:**
- `PlatformProvider` React context wraps the app
- `PlatformSwitcher` component in sidebar
- `platformCollections.ts` resolves collection names
- All `callables.ts` functions accept `platform` parameter

**Cloud Functions:**
- Every callable accepts `platform: "men" | "women" | "youth"`
- `platformCollections.js` resolves to actual Firestore collection names
- `VALID_PLATFORMS = Set(["men", "women", "youth"])` enforced server-side

### Platform-Specific Behavior

| Aspect | Men | Women | Youth |
|--------|-----|-------|-------|
| Player search | Transfermarkt | SoccerDonna | IFA (Israel Football Association) |
| FM data | Yes (FMInside) | Limited | No |
| Scout server | Full (19K players) | Not available | Not available |
| Accent color | Teal/Cyan | Different palette | Different palette |
| Highlights | YouTube auto-search → manual | Manual URL | Manual URL |

---

## 11. Remote Config

**Firestore Collection:** `Config`

| Document | Content | Consumers |
|----------|---------|-----------|
| `positions` | Position codes, display names (EN/HE), filter order | `AppConfigManager` (Android), `appConfig.ts` (Web) |
| `euCountries` | EU/EEA member country codes | Mandate detection, EU-only request filtering |
| `countryNames` | Country name translations (EN → HE) | `CountryNameTranslator` (Android), `countryTranslations.ts` (Web) |
| `salaryRanges` | Salary tier options (monthly: 0-5K, 6-10K, etc.) | Request creation forms |
| `transferFees` | Transfer fee range options | Request creation forms |
| `taskTemplates` | Task template definitions + month names (EN/HE) | Task creation quick-fill |

**Initialization:**
- Android: `AppConfigManager.initialize()` in `MGSRTeamApplication.onCreate()`
- Web: `<AppConfigInit />` component in root layout, calls `appConfig.initialize()`

**Fallbacks:** Both platforms have hardcoded fallback values if Firestore is unreachable.

---

## 12. Authentication & Authorization

- **Provider:** Firebase Authentication (email/password)
- **Android:** `FirebaseAuth.getInstance()` → `LoginScreenViewModel`
- **Web:** `AuthProvider` context → `onAuthStateChanged` listener
- **Cloud Functions:** All callables (except `ifaFetchProfile`) require authenticated user via `context.auth.uid`
- **Public pages:** `/p/[token]` (shared player), `/shared/requests`, `/sign-mandate/[token]` — no auth required, data fetched server-side via Firebase Admin SDK

---

## 13. Localization

### Android
- English: `app/src/main/res/values/strings.xml`
- Hebrew: `app/src/main/res/values-iw/strings.xml`
- All user-facing strings MUST exist in both files
- Compose: `stringResource(R.string.key)`
- RTL handled automatically by Android system

### Web
- `LanguageProvider` context with `isHebrew` flag
- Translation function `t()` or conditional `isHebrew ? "עברית" : "English"`
- `DirSync` component sets `dir="rtl"` on document element
- Country names: `countryTranslations.ts` (delegates to remote config)
- Position names: `appConfig.getPositionDisplayName(code, isHebrew)`
- BRIT redesign UI copy (app shell + mobile header + redesigned dashboard/players/requests/tasks/shortlist/contacts/releases/contract-finisher/returnees/release-notifications/club-change-notifications hero and filter sections) is defined in `mgsr-web/src/contexts/LanguageContext.tsx` and consumed via `t()` to keep Hebrew parity.

---

## 14. External Data Sources

| Source | Used By | Data |
|--------|---------|------|
| Transfermarkt.com | Android (JSoup), Web (Cheerio), Render (BeautifulSoup), Cloud Functions (Cheerio), GCP Workers (Cheerio) | Player profiles, market values, contracts, transfers, free agents, loan returnees |
| API-Football | Render server | Per-90 stats (goals, assists, tackles, progressive carries, key passes, etc.) |
| FMInside.com | Render server | Football Manager attributes (36 attrs), CA/PA ratings |
| SoccerDonna.de | Android (JSoup), Web (Cheerio) | Women player profiles and search |
| IFA (football.org.il) | Cloud Function `ifaFetchProfile` | Israel Football Association youth player data |
| Google News | Web API route | Football news articles |
| YouTube / Vimeo | Web API route, Android | Player highlight videos |
| Google Cloud Vision | Android service | Passport OCR |
| Gemini AI | Web API routes, Android service | Document detection, scout reports (find_next narrative removed, AI query parser removed, translation switched to MyMemory on both web and Android, hidden gem score removed, similar_players Gemini enrichment replaced with deterministic logic) |

---

## 15. Notification System (FCM)

### Push Notification Flow
1. **Client registers** FCM token → stored in `Accounts` doc (via `accountUpdate` callable)
2. **Trigger fires** (new FeedEvent, new task, chat message, mandate signature)
3. **Cloud Function** builds notification payload (title, body, data)
4. **FCM sends** to topic `mgsr_all` + individual device tokens
5. **Client receives** via `MgsrFirebaseMessagingService` (Android) / Service Worker (Web)

### Notification Types
```
TASK_ASSIGNED, TASK_REMINDER, NOTE_ADDED, CHAT_MESSAGE,
OFFER_FEEDBACK, MARKET_VALUE_CHANGE, CLUB_CHANGE,
CONTRACT_EXPIRING, PLAYER_RELEASED, REQUEST_ADDED,
MANDATE_SIGNED, BIRTHDAY_WISH
```

### Web Push
- Service Worker: `firebase-messaging-sw.js`
- Custom headers in `next.config.js` for SW access
- FCM token validation: dry-run send before storing (in `accountUpdate`)

---

## 16. Feature Inventory

### Dashboard
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `DashboardScreen` | `/dashboard/page.tsx` |
| ViewModel/State | `HomeScreenViewModel` | Client-side React state |
| Data | Players + FeedEvents + Accounts (real-time) + Tasks (currently listener-gated off by feature flag) | Same Firestore collections (tasks listener currently gated off by feature flag) |
| Features | Stats header, feed timeline, birthdays, agent overview (task UI hidden while flag is off) | Same features, responsive mobile layout (task UI hidden while flag is off); men dashboard roster-analytics cards are currently hidden by `MEN_ROSTER_ANALYSIS_ENABLED`, and the staff/top-agents/leading-agencies panel is currently hidden on men web per UI-disable request |
| Actions | Navigate to features, birthday wishes (task actions hidden while flag is off) | Same |

### Players (Roster)
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `PlayersScreen` | `/players/page.tsx` |
| ViewModel/State | `PlayersViewModel` | Client-side with Firestore listeners |
| Data | Firestore Players (real-time listener) | Same |
| Filters | Position, foot, contract status, agent, search text | Same filters + men-specific specific-position and secondary-position selectors (specific/main position matches only `positions[0]`; secondary selector matches if the code exists anywhere in `positions[]`) + region/confederation chips (UEFA/CONMEBOL/CONCACAF/AFC/CAF/OFC) on desktop and mobile filter sheet, reusing the same localized labels as release notifications |
| Actions | Navigate to player detail, filter, sort | Same + men roster-analysis panels exist in code but are currently hidden by `MEN_ROSTER_ANALYSIS_ENABLED` (matching requests/proposal context + "played with him" teammates panel). The core men players Firestore listener remains always active, so hiding analytics does not affect roster loading. |

### Player Detail
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `PlayerInfoScreen` | `/players/[id]/page.tsx` |
| ViewModel/State | `PlayerInfoViewModel` | Client-side state |
| Data | Firestore (player, notes, docs, offers) + External APIs | Same |
| Sections | Profile, notes, documents, offers, stats, highlights, GPS, FM data, mandates | Same sections |
| Callables | `playersAddNote`, `playerDocumentsCreate`, `playersToggleMandate`, `offersCreate` | Same callables via `callables.ts` |

### Shortlist
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ShortlistScreen` | `/shortlist/page.tsx` |
| Data | Firestore Shortlists | Same |
| Filters | Position, agent, with notes, outreach status | Same |
| Actions | Add/remove by TM URL, add notes, track outreach | Same |

### Contacts
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ContactsScreen` | `/contacts/page.tsx` |
| Data | Firestore Contacts | Same |
| Actions | Create, update, delete contacts (club/agency) | Same + WhatsApp deep links |

### Requests
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `RequestsScreen` | `/requests/page.tsx` |
| Data | Firestore ClubRequests + Players | Same |
| Matching | `RequestMatcher` algorithm (position, age, salary, fee, EU, foot) | Same algorithm |
| Actions | Create/edit/delete requests, view matching players, propose players | Same |

### Releases
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ReleasesScreen` | `/release-notifications/page.tsx` (primary). `/releases/page.tsx` redirects to it. |
| Data | FeedEvents-driven notification releases (`NEW_RELEASE_FROM_CLUB` + `NOT_IN_DATABASE`) enriched from `releases-all` cache metadata; constrained to market value €150K-€4M and max age 33; manual Refresh button now triggers the same Cloud Run worker flow as web via callable (`triggerReleasesRefreshJob`) and polls callable status (`getReleasesRefreshJobStatus`) until operation+execution complete and `WorkerRuns/ReleasesRefreshWorker` has a fresh success run. Runtime hardening (2026-07-17): Cloud Run worker now fails fast on zero-harvest runs (instead of writing success), uses free-agents fallback when newest-transfers is empty, and avoids first-run bootstrap if historical refresh state exists. | Real-time notifications now combine non-roster release events (`NEW_RELEASE_FROM_CLUB`, including both `IN_DATABASE` and `NOT_IN_DATABASE`) and roster free-agent events (`BECAME_FREE_AGENT`) by matching TM profile IDs against platform-specific `Players*`; listeners are platform-aware (`PLAYERS_COLLECTIONS[platform]`, `SHORTLISTS_COLLECTIONS[platform]`, `FEED_EVENTS_COLLECTIONS[platform]`) and shortlist-add calls send the active platform. List stays constrained to market value €150K-€4M and max age 33. `/release-notifications` manual "Fetch + Enrich now" triggers the real Cloud Run releases worker via callable (`triggerReleasesRefreshJob`) and tracks both operation and execution IDs; completion requires Cloud Run execution success plus fresh `WorkerRuns/ReleasesRefreshWorker` success before enrichment starts. Legacy Cloud Function worker was also hardened to avoid destructive `knownReleaseUrls` shrinking and to fail on all-range scrape failures. |
| UI/COPY | N/A | `/release-notifications/page.tsx` uses BRIT black/gold styling and now marks roster free-agent rows with a dedicated roster badge (`release_notifications_roster_badge`) in EN/HE. Roster rows expose an explicit action chip (`release_notifications_open_player`) that opens `/players/:id?from=/release-notifications`; row click also deep-links to player info for roster rows, while non-roster rows continue opening Transfermarkt. Filter tray now includes a localized source chip row (`release_notifications_source`, `release_notifications_filter_roster`) to show only players from roster when needed. |
| Filters | Position + market value sort + date-added sort (date uses `FeedEvents.NEW_RELEASE_FROM_CLUB.timestamp` descending) | Same; Web "date added" sort now prioritizes feed event `timestamp` (newest first) with transfer date as tie-breaker so notification recency matches list order. Timestamps are normalized (number / Firestore Timestamp object) before sorting and refresh filtering to prevent mixed-format docs from misordering rows. |

### Contract Finishers
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ContractFinisherScreen` | `/contract-finisher/page.tsx` |
| Data | Transfermarkt scraping | API route `/api/transfermarkt/contract-finishers` (cached by GitHub Actions weekly) |
| Filters | Position, age, market value | Web now mirrors release-notifications chip UX: inline search + value + position + age + region chips, plus localized source chips (`release_notifications_source`, `release_notifications_filter_roster`) to toggle roster-only results. Non-roster mode still excludes players already in roster/shortlist; roster-only mode shows roster-matched entries. Hebrew/English copy includes `contract_finisher_search`. |

### Club Change Notifications (Men)
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | Feed card inside `DashboardScreen` activity list | `/club-change-notifications/page.tsx` |
| Data | `FeedEvents` (`CLUB_CHANGE`) | Real-time Firestore listeners on `FeedEvents` + `Players` (Men collections via `platformCollections`) |
| Logic | Club move events rendered in recent activity | Dedicated list filtered to `CLUB_CHANGE` with no profile deduplication (every event is shown), default-sorted by newest `timestamp` so newly added notifications surface first, with roster fallback metadata (including market value) and links to player profile + TM profile |
| UI/COPY | N/A | `/club-change-notifications/page.tsx` cards use enhanced BRIT styling (badge/timestamp header, stronger hover depth, accent glow), use shared position display mapping (`getPositionDisplayName`) so filter chips/position text are translated in Hebrew, and render opposite-direction move arrows per latest UI request while preserving RTL/LTR club label order. Market value label/value remains localized in EN/HE via `LanguageContext`. A sort-chip row supports Date Added (newest/oldest) and Market Value (high→low / low→high). |
| Navigation | Dashboard activity + notification center | Added to Men desktop market menu and mobile More sheet directly below release notifications |

### Returnees
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ReturneeScreen` | `/returnees/page.tsx` |
| Data | Transfermarkt scraping | API route `/api/transfermarkt/returnees` (cached by GitHub Actions weekly) |
| Filters | Position, market value | Same |

#### Returnees Reliability Notes
- `mgsr-web/src/app/api/transfermarkt/returnees/stream/route.ts` now falls back to stale Firestore chunk cache (`X-Cache: STALE`) when fresh cache is unavailable/expired, preventing empty-screen failures when the weekly returnees cache workflow misses a run.
- On live stream scrape errors, the route now returns partial collected players (when available) as a final `isLoading: false` SSE frame instead of always returning an error-only empty payload.
- `mgsr-web/src/lib/api.ts` returnees `EventSource` handler now treats transient post-progress stream closes as graceful completion (uses last received event) instead of raising `Stream connection failed` after data/progress already arrived.
- `mgsr-web/_populate_cache.ts` now keeps workflow success when a run scrapes zero fresh players but an existing chunked cache already exists, so scheduled TM volatility does not remove usable cached returnees/finishers data.

### War Room (AI Discovery)
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `WarRoomScreen` + `WarRoomReportScreen` | `/war-room/page.tsx` |
| Data | Vercel API → Render server (recruitment + scout reports) | Direct API route calls |
| Features | AI-discovered candidates, scout agent profiles, **separate** `AI Scout` and `Find Next` tabs inside War Room command UI (UI-only split; same underlying `AiScoutViewModel` logic), command-shell presentation layer (active stage strip + framed stage workspace), and a new operations layer (tab-aware quick-action chips for refresh/filter/open-full-scout/switch-mode) for faster inner-screen workflow | Same |

#### War Room Scout Agents List Behavior
- Web Scout Agents tab now renders all profiles in one continuous list per country/agent (no pagination and no page indicator like `5/15`).
- Country headers now show total players per country (e.g., `24 players`) while preserving existing roster/shortlist exclusion filtering.
- The Scout Agents header refresh button was removed from this screen to keep the view as a single continuous list.
- Android and Web Scout Agents tabs now include a simplified short-position filter layer (`All positions` + dynamic short codes like `GK/CB/CM`) derived from current results, composed with existing agent filter and roster/shortlist exclusion logic (Hebrew UI remains supported).

#### War Room Design Mock (Docs)
- `docs/war-room-aggressive-redesign-mock.html` is an HTML redesign mock that now mirrors the existing War Room IA and flows (Discovery, Scout Agents, AI Search with expandable report, Find Next).
- `docs/war-room-redesign-v3/index.html` is the latest standalone redesign artifact with a different IA direction: a left "Signal Rail" (tabs, alerting, decision ladder) and a right operational workspace that preserves the same War Room feature coverage.
- `docs/war-room-redesign-v3/index.html` keeps bilingual runtime switching (EN/HE), RTL/LTR direction handling, and a continuous Scout Agents country stream with visible per-country player counts.
- Scope of this mock is visual redesign only; no new War Room feature modules or data flows were introduced.
- Visual language of the mock is aligned to current web theme tokens (BRIT black/gold + mgsr teal surfaces) instead of introducing an unrelated palette.

#### War Room Production Visual Language (Web)
- `mgsr-web/src/app/war-room/page.tsx` now applies the same command-center palette direction in production UI: deep navy surfaces with cyan/amber accents replacing the previous purple-heavy accenting.
- `mgsr-web/src/app/war-room/page.tsx` now uses a wider desktop content container for the War Room layout (`max-w-[78rem]`) to improve scanability of Discovery, Scout Agents, and AI Search cards.
- `mgsr-web/src/app/war-room/page.tsx` AI Search command header copy was corrected to describe search behavior (query + tactical/stat/market analysis) instead of showing unrelated "no profiles yet" text.
- `mgsr-web/src/app/globals.css` War Room shared utilities (`war-shimmer`, `war-card-glow`, `war-gradient-text`, `war-orbital`) were updated to match the new cyan/amber command palette.
- `mgsr-web/src/app/war-room/page.tsx` now ports the V3 IA structure into production: top command masthead with operational KPIs, left `Signal Rail` decision navigation (Discovery / Scout Agents / AI Search / Find Next), and right `Stage` workspace with active-section header while preserving the existing tab data logic and call chains.
- `mgsr-web/src/app/war-room/page.tsx` removed non-essential informational boxes from the V3 shell per UX refinement: masthead narrative banner, masthead amber command strip, and all alert/decision-ladder cards beneath the Signal Rail tab stack.

### AI Scout
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `AiScoutScreen` | `/ai-scout/page.tsx` |
| Data | Vercel API → Render server | API route `/api/scout/search` |
| Features | Natural language search, rule-based query parsing (`parseFreeQuery.ts`), and War Room embedded `warRoomMode` command strip (3-step workflow guidance: query → analyze → shortlist) when rendered inside `WarRoomScreen` | Same + diversity modes (`strict`/`balanced`/`discovery`), seeded diversity re-ranking, user-wide freshness memory layered on top of per-query seen-player penalties, daily seed rotation, and "search other" exclusion continuity |

### Find Next
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `Find Next` tab inside `WarRoomScreen` (and still available inside standalone `AiScoutScreen` tab switcher) | `/find-next/page.tsx` |
| Data | Render server `/find_next` directly | Render server `/find_next` directly |
| Features | "Find me the next Salah" — signature-based talent discovery with web-aligned settings: min/max age, min/max market-value, expanded star examples, extended value presets (€100K→€20M + no limit), request normalization, client-side age/value post-filtering to guard against backend bound drift, and War Room embedded 3-step command strip (reference → range → hunt) for faster usage | Same + expanded star examples, finer max market-value presets (€250K→€20M + no limit), age slider range 17-30, client-side diversity selection (league/club/nationality/value/age buckets), exact-query novelty memory, and a user-wide freshness ledger to keep results rotating across repeated searches and day-to-day sessions |

### Chat Room
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ChatRoomScreen` | `/chat-room/page.tsx` |
| Data | Firestore ChatRoom (real-time) | Same |
| Features | Messages, @mentions, replies, attachments, online status | Same |
| Callables | `chatRoomSend`, `chatRoomEdit`, `chatRoomDelete` | Same |

### Shadow Teams
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ShadowTeamsScreen` | `/shadow-teams/page.tsx` |
| Data | Firestore ShadowTeams + Players | Same |
| Features | Formation picker, position slots, player assignment | Same |

### Tasks
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `TasksScreen` + `TaskDetailScreen` (implemented, currently not reachable from UI while flag is off) | `/tasks/page.tsx` (implemented, currently renders disabled-state shell while flag is off) |
| Data | Firestore AgentTasks (listeners/mutations gated by `FeatureFlags.TASKS_ENABLED` in primary screens) | Same collections (primary UI/listeners gated by `WEB_TASKS_ENABLED`) |
| Features | Create, assign, complete, reminders, linked players/contacts (temporarily hidden from navigation/dashboard/player surfaces) | Same |

### Portfolio
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | (inside Player Detail) | `/portfolio/page.tsx` |
| Data | Firestore Portfolio | Same |
| Features | Enrichments, scout reports, stats snapshots | Same |

### News
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | N/A | `/news/page.tsx` |
| Data | N/A | Google News API + transfer rumours |

### Jewish Finder
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | N/A | `/jewish-finder/page.tsx` |
| Data | N/A | AI-powered discovery of Jewish/Israeli heritage players |

### Shared Player Page (Public)
| Aspect | Detail |
|--------|--------|
| Route | `/p/[token]` |
| Auth | None required |
| Data | SharedPlayers collection (token lookup via Firebase Admin) |
| Features | Player profile snapshot, GPS showcase, stats, AI enrichments (radar chart, key traits, tactical fit, selling points, hook line, club summary), OG image generation |
| Enrichment parity | Both Android and Web produce identical share pages. Web pre-generates enrichment at share-creation time via `/api/share/create`. Android creates shares via `sharePlayerCreate` Cloud Function (basic data only). When `/p/[token]` loads and `enrichment` / `playerStats` are missing, `getShareData.ts` lazy-generates them using the same Gemini + scout server pipeline, then backfills to Firestore so subsequent loads are instant. |

#### Share Creation Paths

```
─── WEB PATH ───────────────────────────────────────
Web Client → POST /api/share/create (Next.js API route)
  ├─ generateEnrichment() → Gemini AI dossier + FM radar
  ├─ fetchPlayerStatsForShare() → Scout server API-Football stats
  └─ Writes to SharedPlayers: player + enrichment + playerStats + gpsData

─── ANDROID PATH ───────────────────────────────────
Android Client → sharePlayerCreate (Cloud Function callable)
  └─ Writes to SharedPlayers: player + gpsData (NO enrichment, NO stats)

─── LAZY ENRICHMENT (both paths) ──────────────────
/p/[token] page load → getShareData.ts:
  1. Read SharedPlayers doc
  2. If gpsData missing → fetch live from GpsMatchData
  3. If playerStats missing → fetch from scout server
  4. If enrichment missing → generateEnrichment() (Gemini + FM radar)
  5. Backfill any newly-generated data to Firestore (fire-and-forget)
```

### Shared Requests Page (Public)
| Aspect | Web Only |
|--------|----------|
| Route | `/shared/requests` |
| Auth | None required |
| Data | ClubRequests collection (via Firebase Admin) |
| Features | BRIT Sport Group-branded public view of active requests, shared request OG image generation, black/gold logo shell, country-scoped share tokens (`allowedCountries`) created from share dialog, in-page position/country filters for easier navigation |

### Mandate Signing (Public)
| Aspect | Web Only |
|--------|----------|
| Route | `/sign-mandate/[token]` |
| Auth | None required |
| Data | MandateSigningRequests collection |
| Features | Digital mandate signature form |

---

## 17. API Route Inventory (Web)

### Scout Proxy Routes (`/api/scout/`)
All proxy to Render server (`football-scout-server-l38w.onrender.com`):

| Route | Proxies To | Purpose |
|-------|-----------|---------|
| `/api/scout/recruitment` | `/recruitment` | Smart recruitment search |
| `/api/scout/similar-players` | `/similar_players` | Find similar players |
| `/api/scout/player-stats` | `/player_stats` | API-Football per-90 stats |
| `/api/scout/search` | `/recruitment` (rule-based `parseFreeQuery.ts`) | Natural language search + diversity reranking + novelty penalties (`seenKeys`) + mode controls (`strict`/`balanced`/`discovery`) + server-side per-query recent-memory window (6h TTL) to reduce repeated names even when client does not send memory. Includes Firestore-backed per-user query memory (`ScoutSearchDiversityMemory`) plus a user-wide freshness ledger, both feeding hard novelty filtering; adaptive novelty-pressure overfetch/backfill as seen memory grows; daily seed rotation when the client does not supply one; optional exposure-governed slot allocation backed by `ScoutExposureLedger` (`relevance`, `underexposed`, `wildcard`, `fallback` slot mix) when `useExposureGovernance=true`; and a final relaxed top-up pass to avoid underfilled lists (e.g., 3-4 results when 10 requested) |
| `/api/scout/fm-intelligence` | `/fm_intelligence` | FM attributes + position fit |
| `/api/scout/warm` | `/` | Keep-alive ping for Render |

### Transfermarkt Routes (`/api/transfermarkt/`)
Server-side Cheerio scraping:

| Route | Purpose |
|-------|---------|
| `/api/transfermarkt/search` | Player search |
| `/api/transfermarkt/player` | Single player profile |
| `/api/transfermarkt/club-search` | Club search |
| `/api/transfermarkt/releases` | Latest free agents (cached mode) + live refresh mode (`live=true`) that scrapes fresh data and syncs release `FeedEvents` |
| `/api/transfermarkt/contract-finishers` | Expiring contracts (with Firestore cache) |
| `/api/transfermarkt/contract-finishers/stream` | SSE streaming for progressive loading |
| `/api/transfermarkt/returnees` | Loan returnees (with Firestore cache) |
| `/api/transfermarkt/returnees/stream` | SSE streaming |
| `/api/transfermarkt/performance` | Player performance history |
| `/api/transfermarkt/teammates` | Player's teammates |
| `/api/transfermarkt/transfer-windows` | Transfer window dates |

### Document Routes (`/api/documents/`)

| Route | Purpose |
|-------|---------|
| `/api/documents/detect` | Gemini AI document type detection |
| `/api/documents/gps-parse` | GPS performance PDF parsing |
| `/api/documents/gps-recompute` | Recompute GPS insights |

### FM Inside Routes (`/api/fminside/`)

| Route | Purpose |
|-------|---------|
| `/api/fminside/player` | FM profile lookup (men) |
| `/api/fminside/women-player` | FM profile lookup (women) |

### Highlights Routes (`/api/highlights/`)

| Route | Purpose |
|-------|---------|
| `/api/highlights/oembed` | Video embed data |
| `/api/highlights/search` | YouTube highlights search |

### News Routes (`/api/news/`)

| Route | Purpose |
|-------|---------|
| `/api/news/google-news` | Google News football articles |
| `/api/news/league-news` | League-specific news |
| `/api/news/rumours` | Transfer rumour aggregation |

### Mandate Routes (`/api/mandate/`)

| Route | Purpose |
|-------|---------|
| `/api/mandate/generate` | Generate mandate PDF |
| `/api/mandate/create-signing` | Create signing request |
| `/api/mandate/sign` | Process digital signature |
| `/api/mandate/[token]` | Retrieve mandate by token |

### Share Routes (`/api/share/`)

| Route | Purpose |
|-------|---------|
| `/api/share/create` | Create share token + snapshot + pre-generate enrichment & stats (web path) |
| `/api/share/enrich-portfolio` | AI-enrich portfolio for sharing |
| `/api/share/generate-scout-report` | Generate scout report for share page |
| `/api/share/image/[token]` | Dynamic OG image generation |
| `/api/share/vcard` | Generate vCard for contact sharing |

### Other Routes

| Route | Purpose |
|-------|---------|
| `/api/club-intel` | Club intelligence analysis |
| `/api/jewish-finder/discover` | Jewish player heritage discovery |
| `/api/transfers/ligat-haal-analysis` | Israeli Premier League transfer analysis |

---

## 18. Callable Inventory

### Android (`SharedCallables.kt`) → Web (`callables.ts`) → Cloud Functions

Every write operation goes through this chain:

| Callable | Android | Web | Cloud Function | Purpose |
|----------|---------|-----|----------------|---------|
| `playersCreate` | ✅ | ✅ | `playersCreate.js` | Add player to roster |
| `playersUpdate` | ✅ | ✅ | `players.js` | Update player fields |
| `playersDelete` | ✅ | ✅ | `players.js` | Delete player |
| `playersToggleMandate` | ✅ | ✅ | `players.js` | Toggle mandate status |
| `playersAddNote` | ✅ | ✅ | `players.js` | Add agent note to player |
| `playersDeleteNote` | ✅ | ✅ | `players.js` | Delete agent note |
| `playerDocumentsCreate` | ✅ | ✅ | `players.js` | Upload document metadata |
| `playerDocumentsDelete` | ✅ | ✅ | `players.js` | Delete document |
| `playerDocumentsMarkExpired` | ✅ | ✅ | `players.js` | Mark document as expired |
| `contactsCreate` | ✅ | ✅ | `contacts.js` | Create contact |
| `contactsUpdate` | ✅ | ✅ | `contacts.js` | Update contact |
| `contactsDelete` | ✅ | ✅ | `contacts.js` | Delete contact |
| `tasksCreate` | ✅ | ✅ | `tasks.js` | Create task |
| `tasksUpdate` | ✅ | ✅ | `tasks.js` | Update task |
| `tasksToggleComplete` | ✅ | ✅ | `tasks.js` | Toggle task completion |
| `tasksDelete` | ✅ | ✅ | `tasks.js` | Delete task |
| `requestsCreate` | ✅ | ✅ | `requests.js` | Create club request |
| `requestsUpdate` | ✅ | ✅ | `requests.js` | Update request |
| `requestsDelete` | ✅ | ✅ | `requests.js` | Delete request |
| `matchRequestToPlayers` | ✅ | ✅ | `requestMatcher.js` | Match request to roster |
| `matchingRequestsForPlayer` | ✅ | ✅ | `requestMatcher.js` | Find requests matching player |
| `shortlistAdd` | ✅ | ✅ | `shortlists.js` | Add player to shortlist |
| `shortlistRemove` | ✅ | ✅ | `shortlists.js` | Remove from shortlist |
| `shortlistUpdate` | ✅ | ✅ | `shortlists.js` | Update shortlist entry |
| `shortlistAddNote` | ✅ | ✅ | `shortlists.js` | Add note to shortlist player |
| `shortlistUpdateNote` | ✅ | ✅ | `shortlists.js` | Update shortlist note |
| `shortlistDeleteNote` | ✅ | ✅ | `shortlists.js` | Delete shortlist note |
| `offersCreate` | ✅ | ✅ | `playerOffers.js` | Create offer/proposal |
| `offersUpdateFeedback` | ✅ | ✅ | `playerOffers.js` | Update offer feedback |
| `offersDelete` | ✅ | ✅ | `playerOffers.js` | Delete offer |
| `offersUpdateHistorySummary` | ✅ | ✅ | `phase6Misc.js` | Update offer history |
| `agentTransferRequest` | ✅ | ✅ | `agentTransfers.js` | Request player transfer |
| `agentTransferApprove` | ✅ | ✅ | `agentTransfers.js` | Approve transfer |
| `agentTransferReject` | ✅ | ✅ | `agentTransfers.js` | Reject transfer |
| `agentTransferCancel` | ✅ | ✅ | `agentTransfers.js` | Cancel transfer |
| `chatRoomSend` | ✅ | ✅ | `chatRoom.js` | Send chat message |
| `chatRoomEdit` | ✅ | ✅ | `chatRoom.js` | Edit message |
| `chatRoomDelete` | ✅ | ✅ | `chatRoom.js` | Delete message |
| `portfolioUpsert` | ✅ | ✅ | `portfolio.js` | Upsert portfolio entry |
| `portfolioDelete` | ✅ | ✅ | `portfolio.js` | Delete portfolio entry |
| `sharePlayerCreate` | ✅ | ✅ | `phase6Misc.js` | Create share token (Android uses this; web uses `/api/share/create` with enrichment) |
| `shadowTeamsSave` | ✅ | ✅ | `phase6Misc.js` | Save shadow team |
| `scoutProfileFeedbackSet` | ✅ | ✅ | `phase6Misc.js` | Submit scout feedback |
| `birthdayWishSend` | ✅ | ✅ | `phase6Misc.js` | Send birthday wish |
| `mandateSigningCreate` | ✅ | ✅ | `phase6Misc.js` | Create mandate signing request |
| `accountUpdate` | ✅ | ✅ | `phase7Account.js` | Update account (FCM tokens, language) |
| `ifaFetchProfile` | ✅ | ✅ | `ifaFetch.js` | Fetch IFA player profile (NO AUTH) |
| `triggerReleasesRefreshJob` | ✅ | ✅ | `index.js` | Manually execute Cloud Run `releases-refresh-job` |
| `getReleasesRefreshJobStatus` | ✅ | ✅ | `index.js` | Poll latest releases worker status from `WorkerRuns` |

---

## 19. Transfermarkt Scraping

### Scraping Happens In 5 Places

| Location | Technology | Purpose |
|----------|-----------|---------|
| Android `transfermarkt/` module | JSoup | Real-time player search, profiles, releases, contract finishers, returnees |
| Web API routes | Cheerio + impit | Same as Android but server-side on Vercel |
| GitHub Actions | Cheerio | Releases refresh (daily, via `_releases_refresh.ts`) — moved from Cloud Functions due to TM IP blocking |
| GCP Cloud Run `workers-job/` | Cheerio + impit | Daily player refresh (all roster players) |
| Render server `football-scout-server` | BeautifulSoup + requests | Full database build (all 44 leagues, 19K+ players) |

### Anti-Blocking Strategy
- Random delays between requests (1.5-4s)
- User-agent rotation
- Circuit breaker (5-min cooldown after 3 blocks)
- Exponential backoff (12s-300s)
- Progress tracking and resumption
- Proxy fallbacks (for IFA scraping)

### Market Value Parsing
All parsers handle: `€300k`, `€1.50m`, `€300K`, `€1.50M` (case-insensitive)

---

## 20. Landing Site

**Module:** `mgsr-landing/`
**Deployment:** Vercel (static)
**Domain:** mgsrfa.com
**Content:** Static marketing page with team photos, analytics integration
**Config:** `vercel.json` with redirects (`/team` → `/`, Hebrew URL → `/`)

### Branding Note (External-Facing)

- Landing site public copy and metadata are rebranded to **BRIT Sport Group**.
- Landing logo assets now use `mgsr-landing/brit_circle_black_gold.svg` in header/hero branding and `site.webmanifest` name/short_name were updated accordingly.
- The landing page visual language now uses the BRIT premium cinematic palette and editorial typography, with aurora background effects, premium hero trust cards, and darker glass surfaces to match the new agency brand direction.
- Hero copy was simplified so the top hero label shows **BRIT Sport Group** (larger type) and the previous two-line hero headline was removed while keeping the supporting subtitle paragraph.
- Landing page UI was further refined for stronger visual impact: larger hero brand title, increased top spacing under fixed navigation, improved section-by-section color gradients (About/Services/Platforms/Team/Contact), and explicit z-index/isolation updates to reduce overlap risks between floating and fixed elements.
- Hero layout spacing was adjusted to avoid visual collision between trust cards and the scroll indicator (dedicated bottom space in hero content + lower indicator anchor), improving readability in the first viewport.
- Landing color system was further intensified to align with BRIT logo language (deeper black base + stronger gold/mint accents across hero and section gradients), and the hero scroll indicator was updated to true auto-centering to keep it visually centered after responsive spacing changes.
- About-section stat counters (Countries and Years) now use BRIT gold glow styling to better match the updated black/gold visual language.
- Services icon accents were refined to better match the BRIT palette for key cards: Player Representation and Contract Management now use richer gold tones, while Youth Development uses a brighter mint accent.
- Title styling on the landing page was unified: hero/section/card/form headings now use a consistent BRIT gold treatment (including hover behavior updates to avoid inconsistent teal title shifts).
- Section kicker labels (the smaller pre-title text before major headings) were updated to a complementary mint accent to keep hierarchy clear while staying within the BRIT palette.
- The “Three Divisions, One Vision” platform cards were recolored with new premium per-division palettes (mint-teal for Men, warm bronze-gold for Women, and deep steel-blue/mint for Youth) including updated badge tones for clearer visual separation.
- Landing palette was fully normalized to the new BRIT direction by replacing remaining legacy accent values with the current black/gold/mint system across hero effects, CTA glows, section dividers, services effects, platform backdrop, team/tooltips, contact cards, and social hover states.
- Platform visual tuning continued: Men and Youth boxes were recolored with new premium gradients/borders for stronger fit with the updated design language, and icon colors were refined in Services/Contact (including Youth Development and contact channel icons) to better match each card's palette.
- The public landing-page team roster was updated to remove Roy Elgrabli from the visible team section and its related landing-page structured data/translations.
- Final landing-page icon normalization aligned remaining outliers with the shared gold accent system, specifically Youth Development in Services and the Phone/Location icons in Contact.
- Hebrew RTL hero info boxes were updated to right-align their label/value text instead of inheriting the default left-aligned card layout.
- Hebrew RTL hero info boxes now also enforce RTL text flow for the inner label/value content so the text itself aligns naturally inside each card.
- Hebrew landing-page team copy was corrected so the team description refers to knowing the game from the inside, not the computer.

### Design Artifact

- `docs/britsportgroup-web-redesign-mock.html` is the current BRIT Sport Group management-web redesign concept. The mock is a single interactive HTML document covering the main authenticated pages, public share flows, and mandate signing flow with a unified black/gold premium UI direction.

---

## Appendix: Scripts & Utilities

### `scripts/` directory

| Script | Purpose |
|--------|---------|
| `seed-remote-config.js` | Bootstrap Firestore Config collection |
| `seed-eu-countries.ts` | Seed EU country list |
| `seed-match-results.js` | Populate precomputed match cache |
| `update-country-names.js` | Update country translations |
| `send-test-push.js` | Test FCM notification |
| `fix-string-fields.js` | Fix corrupted Firestore documents |
| `scan-corrupted-players.js` | Scan for data corruption |
| `backfill-interested-in-israel.js` | One-time backfill |
| `redetect-authorization-mandates.js` | Re-run mandate detection |
| `crawl-fminside-cache.js` | Cache FM Intelligence data locally |
| `run-fm-crawl.sh` | Bash wrapper for FM crawl |
| `query-player-requests.js` | Debug query tool |
| `debug-zulte.js` | Debug matching algorithm |
| `test-phase*.js` (7 files) | Callable test suites |

### `mgsr-web/` utility scripts

| Script | Purpose |
|--------|---------|
| `_populate_cache.ts` | Populate contract finisher / returnee caches (used by GitHub Actions) |
| `_enrich_images.ts` | Enrich scout profile images (used by GitHub Actions) |
| `_releases_refresh.ts` | Daily releases refresh — scrape TM for new free agents, write FeedEvents (used by GitHub Actions) |
| `scripts/convert-logo.js` | Logo conversion (prebuild) |
| `scripts/test-scout-direct.js` | Test scout server directly |
| `scripts/freesearch-proxy.py` | Free search proxy |
