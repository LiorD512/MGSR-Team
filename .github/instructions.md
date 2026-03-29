# MGSR Team — Agent Instructions

## Project Overview

MGSR Team is a **multi-platform football agent management system** with:
- **Android app** — Kotlin + Jetpack Compose (module: `app/`)
- **Web app** — Next.js + TypeScript + Tailwind (module: `mgsr-web/`)
- **Cloud Functions** — Node.js Firebase Functions (module: `functions/`)
- **Transfermarkt scraper** — Kotlin Android library (module: `transfermarkt/`)

The app supports **three platforms** (Men, Women, Youth) switchable at runtime via `PlatformManager`. Each platform has its own Firestore collections, UI accent colors, and data sources.

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
- Collections are platform-specific: `Players` (Men), `WomenPlayers`, `YouthPlayers`
- Feed events: `FeedEvents`, `WomenFeedEvents`, `YouthFeedEvents`
- Cloud Functions accept `platform: "men" | "women" | "youth"` and resolve collections server-side via `platformCollections.js`

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

**After every new feature or major fix, verify on both platforms:**

### Git — Never Push Without Approval
**Never push to git, deploy functions, or perform any destructive/shared-system action without explicit user approval.** Always show what will be committed/pushed and wait for confirmation.

### Cost Awareness
**Before implementing anything that incurs recurring or usage-based costs (Gemini API, OpenAI, Firebase Extensions, paid SDKs, Cloud Run scaling, etc.), inform the user with an estimate of the billing impact.** Do not silently add services that increase the monthly bill.

### Android
```bash
./gradlew :app:compileDebugKotlin    # Full app compilation
./gradlew :transfermarkt:compileDebugKotlin  # Scraper module
```

### Web
```bash
cd mgsr-web && npx tsc --noEmit      # TypeScript type checking
```

### Cloud Functions
```bash
firebase deploy --only functions      # Deploy after adding/changing callables
firebase functions:list               # Verify functions are deployed
```

### Firestore Security Rules — Must Match Features
**After every fix or new feature, verify that `firestore.rules` includes read/write rules for all Firestore collections used by the app.** Missing rules cause silent failures — the client SDK swallows permission errors and falls back to defaults.

- Every new Firestore collection needs a corresponding `match` rule in `firestore.rules`
- Deploy updated rules immediately: `firebase deploy --only firestore:rules`
- Client-read collections (e.g. `Config`) need at least `allow read: if request.auth != null`
- Write-only-by-backend collections should use `allow write: if false` (writes go through Cloud Functions with admin SDK, which bypasses rules)
- After deploying, verify the rules are live in the Firebase Console

### What to Check
- Both platforms compile with zero errors (warnings are acceptable)
- New callables are exported in `functions/index.js`
- Firestore rules in `firestore.rules` cover all collections used by the app
- String resources exist in both `values/strings.xml` and `values-iw/strings.xml`
- Filters, sorting, and empty states work correctly
- Data flows: scraping → parsing → filtering → display → action (add to shortlist, etc.)

### Cleanup After Every Change
**After completing a feature or fix, clean up:**
- Remove unused imports, functions, classes, and variables
- Delete dead code paths that were replaced
- Remove temporary debug logs (keep meaningful ones)
- Verify no orphaned files were left behind

**Be careful not to delete files or code that are still needed.** When unsure, check for usages before removing.

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
| Contact ops | `functions/callables/contacts.js` |
| Request ops | `functions/callables/requests.js` |
| Shortlist ops | `functions/callables/shortlists.js` |
| Task ops | `functions/callables/tasks.js` |
| Platform resolver | `functions/lib/platformCollections.js` |
| Validation helpers | `functions/lib/validation.js` |

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
