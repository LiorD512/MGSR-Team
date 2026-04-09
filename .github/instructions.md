# MGSR Team — Agent Instructions

> **MANDATORY: Every agent MUST read this file AND `ARCHITECTURE.md` before writing a single line of code.**
> **After every fix or feature, update `ARCHITECTURE.md` with changes.**

---

## ABSOLUTE RULES — NON-NEGOTIABLE

### 1. NEVER Revert, Delete, or Remove ANYTHING Without Explicit Approval
- **NEVER remove any feature, workflow, file, function, import, or logic without the user's explicit written approval.**
- **NEVER revert a change, undo a commit, or reset code without asking first.**
- **NEVER assume something is "stale", "unused", "dead code", or "safe to delete".** Verify across ALL references: runtime code, Cloud Functions, API routes, GitHub Actions, workers, scripts, Android, Web, build configs, deployment configs, env files, and documentation.
- If asked "is this safe to delete?", search EVERYTHING before answering. If there is any doubt, say "I'm not sure — let me check further" or "I found references in X, Y, Z — not safe."
- When cleaning up after a change, only remove code YOU introduced in the current session that is confirmed unused. Do NOT touch pre-existing code.

### 2. No Assumptions — Only Verified, Tested Answers
- **NEVER guess, assume, or provide theoretical answers.** Every answer and recommendation must be based on verified facts from the actual codebase.
- Before answering any question about how something works, **read the actual source code**. Do not rely on pattern-matching or assumptions about "typical" implementations.
- Before suggesting a fix, **understand the full call chain**: caller → function → dependencies → side effects. Read all relevant files.
- Before saying "this doesn't exist" or "this isn't used", **search comprehensively**: grep the entire workspace, check all platforms (Android, Web, Cloud Functions, workers, scripts, GitHub Actions).
- If you don't know something, say "I need to check" and then check. Never fabricate an answer.

### 3. Read Architecture Before Working
- Read `ARCHITECTURE.md` for the complete system map: every screen, every callable, every API route, every data flow, where every service runs.
- Read this instructions file for coding rules and patterns.
- If a feature touches multiple platforms, understand all affected files before making any change.

### 4. Update Architecture After Every Change
- After completing any feature or fix, update `ARCHITECTURE.md` to reflect the new state.
- If you added a new screen, callable, API route, component, or external integration — add it to the architecture file.
- If you changed data flow, collection names, or deployment config — update the architecture file.

---

## Project Overview

MGSR Team is a **multi-platform football agent management system** with:
- **Android app** — Kotlin + Jetpack Compose (module: `app/`)
- **Web app** — Next.js 14 + TypeScript + Tailwind (module: `mgsr-web/`), deployed on **Vercel**
- **Cloud Functions** — Node.js Firebase Functions (module: `functions/`), deployed on **Firebase**
- **Football Scout Server** — Python FastAPI (separate repo), deployed on **Render**
- **Cloud Run Workers** — GCP Cloud Run Jobs (`workers-job/`, `workers-job-scout-build/`)
- **Transfermarkt scraper** — Kotlin Android library (module: `transfermarkt/`)
- **GitHub Actions** — Scheduled cache population and data refresh

The app supports **three platforms** (Men, Women, Youth) switchable at runtime via `PlatformManager`. Each platform has its own Firestore collections, UI accent colors, and data sources.

**Full architecture details → `ARCHITECTURE.md`**

---

## Golden Rule: Shared Platform Implementation

**Every feature or fix that can work across platforms MUST be implemented in a shared, cross-platform way.**

When building a new feature:
1. **Android + Web together** — implement on both platforms in the same session
2. **Shared data model** — use the same Firestore document structure for both
3. **Shared Cloud Functions** — all Firestore writes go through `SharedCallables` (Android) / `callables.ts` (Web) → Cloud Functions in `functions/callables/`
4. **Shared scraping logic** — Transfermarkt parsing in `transfermarkt/` module (Android) mirrors `mgsr-web/src/lib/transfermarkt.ts` (Web)
5. **Shared remote config** — `AppConfigManager` (Android) and `appConfig` (Web) both read from Firestore `Config` collection

Never implement a feature on only one platform unless explicitly asked.

---

## Architecture Rules

### Firestore Writes — Server-Side Only
All Firestore writes go through Cloud Functions callable:
- **Android**: `SharedCallables.kt` → `functions.getHttpsCallable(name).call(data)`
- **Web**: `callables.ts` → `httpsCallable(functions, name)(data)`
- **Server**: `functions/callables/*.js` — validates input, writes to Firestore, creates FeedEvents
- **Client reads** remain direct (snapshot listeners for real-time updates)

### Remote Config
Configurable values live in Firestore `Config` collection (6 docs: positions, euCountries, countryNames, salaryRanges, transferFees, taskTemplates). Consumers delegate to:
- **Android**: `AppConfigManager` singleton (initialized in `MGSRTeamApplication.onCreate()`)
- **Web**: `appConfig` module (initialized via `<AppConfigInit />` in root layout)

Add new remote config values to the Config collection, not as hardcoded constants.

### Platform-Aware Code
- Use `PlatformManager.current` to check active platform
- Collections are platform-specific: `Players` (Men), `PlayersWomen` (Women), `PlayersYouth` (Youth)
- Feed events: `FeedEvents`, `FeedEventsWomen`, `FeedEventsYouth`
- All platform-specific collections follow the same pattern: `{CollectionName}Women`, `{CollectionName}Youth`
- Cloud Functions accept `platform: "men" | "women" | "youth"` and resolve collections server-side via `platformCollections.js`
- See `ARCHITECTURE.md` § "Platform System" and § "Firestore Data Model" for the complete collection mapping

---

## Localization — English + Hebrew

**Every user-facing string must support both English and Hebrew.**

### Android
- English: `app/src/main/res/values/strings.xml`
- Hebrew: `app/src/main/res/values-iw/strings.xml`
- Always add strings to BOTH files
- Use `stringResource(R.string.key)` in Compose
- RTL layout is handled automatically by the system

### Web
- Translation files in `mgsr-web/src/` (check existing translation hooks)
- Use the `t()` translation function or `isHebrew` flag for conditional text
- Hebrew text direction: use `dir="rtl"` or CSS `direction: rtl` where needed
- Agent names, country names, and position names should resolve through remote config translation maps

### Country/Position Names
- Country names: `CountryNameTranslator` (Android) / `countryTranslations.ts` (Web) — both delegate to remote config
- Position display names: `PositionDisplayNames` (Android) / `appConfig.getPositionDisplayName()` (Web)

---

## UI Standards

**Always implement the best, most creative, and visually impressive UI possible.**

### Android (Jetpack Compose)
- Dark theme with platform-specific accent colors (`PlatformColors.palette`)
- Use `boldTextStyle()` / `regularTextStyle()` helpers for consistent typography
- Animated transitions, shimmer loading states (`SkeletonPlayerCardList`)
- Cards with subtle gradients, rounded corners, and elevation
- Filter chips with animated selection states
- Bottom sheets for forms and filters (`ModalBottomSheet`)

### Web (Next.js + Tailwind)
- Dark theme matching Android (`bg-mgsr-dark`, `text-mgsr-teal` accent)
- Glass-morphism cards, hover effects, smooth transitions
- Loading skeletons, progressive data display
- `group-hover` effects, `backdrop-blur`, gradient overlays

### Web Mobile Responsiveness — Mandatory
**Every web feature and fix MUST include a fully responsive mobile version. Do not skip this.**
- Mobile-first approach: design for small screens first, then scale up
- Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) for all layouts
- Cards, tables, and grids must stack or adapt on mobile (no horizontal overflow)
- Filter bars and action buttons must be accessible on touch devices
- Modals and sheets should be full-screen or bottom-sheet on mobile
- Text and spacing must be readable on small screens (min touch target 44px)
- Test every page at 375px width (iPhone SE) and 768px (tablet)

### Shared Patterns
- Progressive loading with streaming data (SSE on web, Flow on Android)
- Stats headers showing total/visible/shortlisted counts
- Position filter chips
- Empty states with meaningful messages
- Pull-to-refresh / retry mechanisms

---

## Testing & Verification

**After every new feature or major fix, verify on both platforms.**

### Mandatory Pre-Work Checklist
Before writing any code:
1. Read `ARCHITECTURE.md` — understand the full system
2. Read this instructions file
3. Identify ALL files that will be affected (Android, Web, Cloud Functions, workers, scripts)
4. Read every file you plan to modify BEFORE modifying it
5. Understand the full call chain: UI → ViewModel/State → callable → Cloud Function → Firestore → triggers

### Git — Never Push Without Approval
**Never push to git, deploy functions, or perform any destructive/shared-system action without explicit user approval.** Always show what will be committed/pushed and wait for confirmation.

### Cost Awareness
**Before implementing anything that incurs recurring or usage-based costs (Gemini API, OpenAI, Firebase Extensions, paid SDKs, Cloud Run scaling, etc.), inform the user with an estimate of the billing impact.** Do not silently add services that increase the monthly bill.

### Compilation Verification
```bash
# Android — MUST pass after every change
./gradlew :app:compileDebugKotlin
./gradlew :transfermarkt:compileDebugKotlin

# Web — MUST pass after every change
cd mgsr-web && npx tsc --noEmit

# Cloud Functions — deploy after adding/changing callables
firebase deploy --only functions
```

### What to Check
- Both platforms compile with zero errors (warnings are acceptable)
- New callables are exported in `functions/index.js`
- String resources exist in both `values/strings.xml` and `values-iw/strings.xml`
- Filters, sorting, and empty states work correctly
- Data flows: scraping → parsing → filtering → display → action (add to shortlist, etc.)

### Cleanup After Every Change
**After completing a feature or fix, clean up only what YOU introduced:**
- Remove unused imports, functions, and variables that YOU added in this session
- Remove temporary debug logs that YOU added (keep meaningful ones)
- **NEVER delete pre-existing code, files, or imports unless the user explicitly approves**
- **NEVER assume pre-existing code is "unused" or "dead"** — it may be referenced by other platforms, workers, scripts, or scheduled jobs you haven't checked
- When unsure, **ask the user before removing anything**

### Post-Change Architecture Update
**After every fix or feature, update `ARCHITECTURE.md`:**
- New screens → add to Feature Inventory
- New callables → add to Callable Inventory
- New API routes → add to API Route Inventory
- New components → add to component list
- Changed data flow → update relevant sections
- New external integrations → add to External Data Sources

---

## Key File Locations

### Android
| Purpose | Path |
|---|---|
| App entry | `app/src/main/java/.../application/MGSRTeamApplication.kt` |
| DI setup | `app/src/main/java/.../application/di/MainDi.kt` |
| Remote config | `app/src/main/java/.../config/AppConfigManager.kt` |
| Callables | `app/src/main/java/.../firebase/SharedCallables.kt` |
| Firebase | `app/src/main/java/.../firebase/FirebaseHandler.kt` |
| Platform switching | `app/src/main/java/.../features/platform/PlatformManager.kt` |
| Player screens | `app/src/main/java/.../features/players/` |
| Discovery screens | `app/src/main/java/.../features/{releases,returnee,contractfinisher}/` |
| Strings (EN) | `app/src/main/res/values/strings.xml` |
| Strings (HE) | `app/src/main/res/values-iw/strings.xml` |

### Web
| Purpose | Path |
|---|---|
| App layout | `mgsr-web/src/app/layout.tsx` |
| Remote config | `mgsr-web/src/lib/appConfig.ts` |
| Callables | `mgsr-web/src/lib/callables.ts` |
| TM scraping | `mgsr-web/src/lib/transfermarkt.ts` |
| Translations | `mgsr-web/src/lib/countryTranslations.ts` |
| Player pages | `mgsr-web/src/app/players/` |
| Discovery pages | `mgsr-web/src/app/{releases,returnees,contract-finisher}/` |

### Cloud Functions
| Purpose | Path |
|---|---|
| Entry point | `functions/index.js` |
| Player ops | `functions/callables/players.js` |
| Player create | `functions/callables/playersCreate.js` |
| Contact ops | `functions/callables/contacts.js` |
| Request ops | `functions/callables/requests.js` |
| Request matching | `functions/callables/requestMatcher.js` |
| Shortlist ops | `functions/callables/shortlists.js` |
| Task ops | `functions/callables/tasks.js` |
| Offers | `functions/callables/playerOffers.js` |
| Agent transfers | `functions/callables/agentTransfers.js` |
| Chat room | `functions/callables/chatRoom.js` |
| Portfolio | `functions/callables/portfolio.js` |
| Misc (share, shadow, birthday) | `functions/callables/phase6Misc.js` |
| Account | `functions/callables/phase7Account.js` |
| IFA fetch | `functions/callables/ifaFetch.js` |
| Platform resolver | `functions/lib/platformCollections.js` |
| Validation helpers | `functions/lib/validation.js` |

### External Services
| Purpose | Path / URL |
|---|---|
| Render scout server | `https://football-scout-server-l38w.onrender.com` |
| Scout server URL config | `mgsr-web/src/lib/scoutServerUrl.ts` |
| Scout API client (web) | `mgsr-web/src/lib/scoutApi.ts` |
| GCP player refresh worker | `workers-job/run.js` |
| GCP scout DB build worker | `workers-job-scout-build/run.sh` |
| GitHub Actions | `.github/workflows/*.yml` |
| Cache population script | `mgsr-web/_populate_cache.ts` |
| Image enrichment script | `mgsr-web/_enrich_images.ts` |

**For the complete architecture reference → see `ARCHITECTURE.md`**

---

## Common Patterns

### Adding a New Callable
1. Create the function in `functions/callables/<module>.js`
2. Export it from the module
3. Import + export as `onCall` in `functions/index.js`
4. Add typed wrapper in `SharedCallables.kt` (Android)
5. Add typed wrapper in `callables.ts` (Web)
6. Deploy: `firebase deploy --only functions`

### Adding a New Discovery Screen Filter
1. Add filter enum/state in ViewModel (Android) / component state (Web)
2. Apply filter in the `combine` flow (Android) / `useMemo` (Web)
3. Update stats header to reflect filtered count
4. Exclude roster + shortlist players from results (both platforms)

### Adding a New Remote Config Value
1. Add document/field to Firestore `Config` collection
2. Add property to `AppConfigManager.kt` with fallback constant
3. Add accessor to `appConfig.ts` with fallback
4. Update `scripts/seed-remote-config.js` for reproducibility

### Transfermarkt Scraping
- Android: JSoup HTML parsing in `transfermarkt/` module
- Web: Cheerio HTML parsing in `transfermarkt.ts`
- Both use the same URL patterns, CSS selectors, and value parsing
- Market value parsing must handle `€300k`, `€1.50m`, `€300K`, `€1.50M` (case-insensitive)
- Use batched pagination with configurable batch size and delay
- Early exit when values drop below minimum threshold
- Progressive loading: stream results to UI as pages load
