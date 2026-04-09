# MGSR Team — Complete Architecture Reference

> **Every agent MUST read this file before writing a single line of code.**
> Last updated: 2026-04-09

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
│      └─ "Find Next" feature (signature-based discovery)            │
│                                                                     │
│  GOOGLE CLOUD PLATFORM (Workers)                                   │
│  ├─ Cloud Run Job: player-refresh-job (daily 2am)                  │
│  │   └─ Refreshes all player data from Transfermarkt               │
│  └─ Cloud Run Job: scout-db-build (Monday 4am)                    │
│      └─ Rebuilds Render server database (12-14 hour job)           │
│                                                                     │
│  GITHUB ACTIONS (Scheduled Automation)                             │
│  ├─ transfer-windows.yml ──── Daily 8am UTC                        │
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
│   └── AiHelperService.kt              # Scout reports, similar player discovery
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
| `/dashboard` | Dashboard | Stats, feed, tasks, birthdays, agents |
| `/players` | Players | Full roster with filters (position, foot, contract, agent) |
| `/players/add` | Add Player | Search TM/SoccerDonna/IFA + create player |
| `/players/[id]` | Player Detail (Men) | Full profile: notes, docs, offers, stats, GPS, FM, highlights |
| `/players/[id]/generate-mandate` | Mandate Gen (Men) | Generate PDF mandate |
| `/players/women/[id]` | Player Detail (Women) | Women player profile |
| `/players/women/[id]/generate-mandate` | Mandate Gen (Women) | Women mandate PDF |
| `/players/youth/[id]` | Player Detail (Youth) | Youth player profile |
| `/shortlist` | Shortlist | Draft tracking from TM URLs |
| `/contacts` | Contacts | Club/agency contact database |
| `/requests` | Requests | Club player requests + matching workbench |
| `/releases` | Releases | Recently released free agents |
| `/contract-finisher` | Contract Finisher | Expiring contracts next window |
| `/returnees` | Returnees | Players returning from loans |
| `/war-room` | War Room | AI discovery candidates + scout agents |
| `/ai-scout` | AI Scout | Natural language player search |
| `/find-next` | Find Next | "Find me the next Salah" signature-based discovery |
| `/chat-room` | Chat Room | Team messaging with @mentions + replies |
| `/shadow-teams` | Shadow Teams | Fantasy formation builder |
| `/tasks` | Tasks | Agent task management |
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
| `NotificationBell.tsx` | Push notification indicator |
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
| `aiScoutGeminiFirst.ts` | Gemini-first AI scout search |
| `aiQueryParser.ts` | Natural language query parser |
| `parseFreeQuery.ts` | Free-text search query parser |
| `translateQuery.ts` | Hebrew ↔ English query translation |
| `requestMatcher.ts` | Client-side request ↔ player matching |
| `noteParser.ts` | Parse structured data from agent notes |
| `shortlistIntelligence.ts` | Shortlist analytics |
| `playerIntel.ts` | Player intelligence aggregation |
| `clubIntel.ts` | Club intelligence (league tiers, squad analysis) |
| `portfolioApi.ts` | Portfolio data access |
| `shareApi.ts` | Share page token generation |
| `generateEnrichment.ts` | AI-generated enrichment data |
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

### Firestore Triggers

| Trigger | Collection | Event | Purpose |
|---------|-----------|-------|---------|
| `onNewFeedEvent` | FeedEvents* | onCreate | FCM push for player updates |
| `onNewAgentTask` | AgentTasks* | onCreate | Notify assignee |
| `onMandateSigningUpdated` | MandateSigningRequests | onUpdate | Notify on mandate signature |
| Match Recalc (6×) | Players*/ClubRequests*/PlayerDocuments* | onWrite | Debounced match recalculation (10s cooldown) |
| `onGpsMatchDataWritten` | GpsMatchData | onWrite | Recompute GPS performance insights (3s debounce) |

### Scheduled Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `mandateExpiryScheduled` | 04:00 daily | Scan and expire mandates, write FeedEvents |
| `releasesRefreshScheduled` | 03:00 daily | Scrape TM for new releases → Pub/Sub worker |
| `scoutAgentScheduled` | 00:00 daily | AI Scout Agent (44 leagues, stats enrichment) → Pub/Sub worker |
| `onTaskRemindersScheduled` | 09:00 daily | Task reminders at 7d, 3d, 1d, today milestones |

### Helper Libraries (`functions/lib/`)

| Module | Purpose |
|--------|---------|
| `platformCollections.js` | Platform → collection name mapping |
| `validation.js` | Input validation helpers |
| `feedEvents.js` | FeedEvent creation with deduplication |
| `notifications.js` | FCM push notification sending |

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
| `/similar_players?player_name=...` | GET | Find similar players (style, stats, attributes) |
| `/recruitment?position=CB&notes=fast&transfer_fee=300-600` | GET | Smart recruitment search (request matching) |
| `/scout_report?player_url=...&lang=en` | GET | AI-generated scout report |
| `/find_next?player_name=Mohamed Salah&age_max=22` | GET | "Find me the next X" signature-based discovery |
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

Key proxy routes in `mgsr-web/src/app/api/scout/`:
- `/api/scout/recruitment` → Render `/recruitment`
- `/api/scout/similar-players` → Render `/similar_players`
- `/api/scout/find-next` → Render `/find_next`
- `/api/scout/player-stats` → Render `/player_stats`
- `/api/scout/search` → Render `/recruitment` (with AI query parsing)
- `/api/scout/fm-intelligence` → Render `/fm_intelligence`
- `/api/scout/warm` → Render `/` (keep-alive ping)

### How Android App Calls Render

Android app calls via `MgsrWebApiClient` which hits the **Vercel API routes** (same proxy as web), not Render directly.

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
- **Flow:**
  1. Clone football-scout-server repo
  2. Run `python3 build.py` (scrapes all 44 leagues from Transfermarkt)
  3. Commit DB files to GitHub
  4. Push → Render auto-deploys with new database

---

## 8. GitHub Actions (CI/CD)

**Location:** `.github/workflows/`

| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `transfer-windows.yml` | Daily 8am UTC | Scrape transfer window dates → commit to `mgsr-web/public/transfer-windows.json` |
| `weekly-contract-finishers.yml` | Monday 23:00 UTC (2am Israel) | Populate contract finisher cache in Firestore via `_populate_cache.ts finishers` |
| `weekly-returnees.yml` | Thursday 23:00 UTC (2am Israel) | Populate returnees cache in Firestore via `_populate_cache.ts returnees` |
| `weekly-scout-images.yml` | Tuesday 00:00 UTC (3am Israel) | Enrich scout profile images via `_enrich_images.ts` |
| `test-tm-scraping.yml` | Manual only | Test Transfermarkt fetch logic |

**Pattern:** All workflows use GitHub API for file updates (not git push). Secrets include `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

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
| `ScoutAgentRuns` | Scout agent execution history |
| `WorkerRuns` | Worker job execution history |
| `WorkerState` | Worker state tracking (last run, progress) |

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
| Gemini AI | Web API routes, Android service | Document detection, scout reports, AI search |

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
| Data | Players + Tasks + FeedEvents + Accounts (real-time) | Same Firestore collections |
| Features | Stats header, feed timeline, task list, birthdays, agent overview | Same features, responsive mobile layout |
| Actions | Complete tasks, navigate to features, birthday wishes | Same |

### Players (Roster)
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `PlayersScreen` | `/players/page.tsx` |
| ViewModel/State | `PlayersViewModel` | Client-side with Firestore listeners |
| Data | Firestore Players (real-time listener) | Same |
| Filters | Position, foot, contract status, agent, search text | Same filters |
| Actions | Navigate to player detail, filter, sort | Same |

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
| Screen | `ReleasesScreen` | `/releases/page.tsx` |
| Data | Transfermarkt scraping (latest 24-48h releases) | API route `/api/transfermarkt/releases` |
| Filters | Position, market value | Same |

### Contract Finishers
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ContractFinisherScreen` | `/contract-finisher/page.tsx` |
| Data | Transfermarkt scraping | API route `/api/transfermarkt/contract-finishers` (cached by GitHub Actions weekly) |
| Filters | Position, age, market value | Same |

### Returnees
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `ReturneeScreen` | `/returnees/page.tsx` |
| Data | Transfermarkt scraping | API route `/api/transfermarkt/returnees` (cached by GitHub Actions weekly) |
| Filters | Position, market value | Same |

### War Room (AI Discovery)
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `WarRoomScreen` + `WarRoomReportScreen` | `/war-room/page.tsx` |
| Data | Vercel API → Render server (recruitment + scout reports) | Direct API route calls |
| Features | AI-discovered candidates, scout agent profiles, per-position discovery | Same |

### AI Scout
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | `AiScoutScreen` | `/ai-scout/page.tsx` |
| Data | Vercel API → Render server | API route `/api/scout/search` |
| Features | Natural language search, AI query parsing | Same |

### Find Next
| Aspect | Android | Web |
|--------|---------|-----|
| Screen | (inside AI Scout) | `/find-next/page.tsx` |
| Data | Vercel API → Render server `/find_next` | API route `/api/scout/find-next` |
| Features | "Find me the next Salah" — signature-based talent discovery | Same |

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
| Screen | `TasksScreen` + `TaskDetailScreen` | `/tasks/page.tsx` |
| Data | Firestore AgentTasks | Same |
| Features | Create, assign, complete, reminders, linked players/contacts | Same |

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
| Aspect | Web Only |
|--------|----------|
| Route | `/p/[token]` |
| Auth | None required |
| Data | SharedPlayers collection (token lookup via Firebase Admin) |
| Features | Player profile snapshot, GPS showcase, stats, enrichments, OG image generation |

### Shared Requests Page (Public)
| Aspect | Web Only |
|--------|----------|
| Route | `/shared/requests` |
| Auth | None required |
| Data | ClubRequests collection (via Firebase Admin) |
| Features | Public view of active requests, OG image generation |

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
| `/api/scout/find-next` | `/find_next` | Signature-based talent discovery |
| `/api/scout/player-stats` | `/player_stats` | API-Football per-90 stats |
| `/api/scout/search` | `/recruitment` (with AI query parsing) | Natural language search |
| `/api/scout/fm-intelligence` | `/fm_intelligence` | FM attributes + position fit |
| `/api/scout/warm` | `/` | Keep-alive ping for Render |

### Transfermarkt Routes (`/api/transfermarkt/`)
Server-side Cheerio scraping:

| Route | Purpose |
|-------|---------|
| `/api/transfermarkt/search` | Player search |
| `/api/transfermarkt/player` | Single player profile |
| `/api/transfermarkt/club-search` | Club search |
| `/api/transfermarkt/releases` | Latest free agents |
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
| `/api/share/create` | Create share token + snapshot |
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
| `sharePlayerCreate` | ✅ | ✅ | `phase6Misc.js` | Create share token |
| `shadowTeamsSave` | ✅ | ✅ | `phase6Misc.js` | Save shadow team |
| `scoutProfileFeedbackSet` | ✅ | ✅ | `phase6Misc.js` | Submit scout feedback |
| `birthdayWishSend` | ✅ | ✅ | `phase6Misc.js` | Send birthday wish |
| `mandateSigningCreate` | ✅ | ✅ | `phase6Misc.js` | Create mandate signing request |
| `accountUpdate` | ✅ | ✅ | `phase7Account.js` | Update account (FCM tokens, language) |
| `ifaFetchProfile` | ✅ | ✅ | `ifaFetch.js` | Fetch IFA player profile (NO AUTH) |

---

## 19. Transfermarkt Scraping

### Scraping Happens In 5 Places

| Location | Technology | Purpose |
|----------|-----------|---------|
| Android `transfermarkt/` module | JSoup | Real-time player search, profiles, releases, contract finishers, returnees |
| Web API routes | Cheerio + impit | Same as Android but server-side on Vercel |
| Cloud Functions | Cheerio | Releases refresh (scheduled daily) |
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
| `scripts/convert-logo.js` | Logo conversion (prebuild) |
| `scripts/test-scout-direct.js` | Test scout server directly |
| `scripts/freesearch-proxy.py` | Free search proxy |
