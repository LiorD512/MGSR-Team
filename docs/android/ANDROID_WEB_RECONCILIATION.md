# MGSR Android — Reconciliation Notes

## FEAT-002 — Women-removal completeness checklist

Goal B: completely and surgically remove the WOMEN platform from the Android
app (`app/` only). The web app keeps Women; only Android drops it. The result
leaves the app in a compiling (static-sense), navigable, Youth-functional state
with a 2-way (Men + Youth) platform switch.

### Platform core

- `features/platform/Platform.kt` — removed the `WOMEN` enum entry and all its
  collection/accent fields. The `gradient` and `surfaceGradient` getters are now
  exhaustive `when (this)` over `MEN` + `YOUTH` (no `WOMEN`, no catch-all `else`).
  Removed the now-unused `androidx.compose.ui.geometry.Offset` import.
- `features/platform/PlatformManager.kt` — removed `isWomen`. `loadFromDisk()`
  now maps a stored `"WOMEN"` (or any value that no longer parses to a Platform)
  to `Platform.MEN` **and persists the correction** so existing installs that
  were on Women open on Men without crashing. *(Intentional surviving reference #1.)*
- `features/platform/PlatformSwitcher.kt` — layout is driven by `Platform.entries`
  and `segmentWidth * index`, so it renders exactly 2 segments (Men + Youth) and
  the sliding-indicator geometry adapts automatically. Updated doc comments; no
  WOMEN-specific palette existed.
- `features/platform/PlatformIcons.kt` — removed `WomenInsignia` and the
  `Platform.WOMEN` branch from the `PlatformInsignia` dispatcher (now MEN + YOUTH).

### Firebase / backend contract

- `firebase/SharedCallables.kt` — removed the `Platform.WOMEN -> "women"` branch
  from `callableName()`; the `when` is exhaustive over MEN + YOUTH.
- `firebase/FirebaseHandler.kt` — doc comment updated (Men / Youth).

### Config, home & dashboard

- `config/AppConfigManager.kt` — removed the unused `titleEnWomen` / `titleHeWomen`
  task-template fields and their Firestore mapping.
- `features/home/HomeScreenViewModel.kt` — updated Women/Youth comments to Youth.
- `features/home/dashboard/BirthdaysSection.kt` — removed the `isWomen` parameter
  from `BirthdayPlayerRow`; the "turns" label is now always the male string.
- `features/home/dashboard/DashboardScreen.kt` — removed every `Platform.WOMEN`
  branch (greeting, stats/quick-actions, My Agent Hub, feed header, feed empty
  state, feed error toasts, quick-actions set, `FeedEventCard` `isWomenPlatform`
  param + all `women_*` string branches, My Hub "view my players"). Removed the
  `WomenColors` import.
- `features/home/dashboard/YouthDashboardComponents.kt` — comment wording only.

### Players, player-info, requests, shortlist

- `features/players/PlayersScreen.kt` — removed `WomenGradientFab`,
  `WomenRosterEmptyState`, the Women avatar branch, Women `isWomen` params on
  `StatsStrip`/`PlayersSearchBar`, Women roster title/badge/hints, the SD market
  value normalization and SD indicator. Removed `PlatformWomenAccent`,
  `PlatformWomenSecondary`, and `SoccerDonnaSearch` imports.
- `features/players/models/Player.kt` — removed the Women-specific fields
  (`soccerDonnaUrl`, `wosostatId`, `fmInsideId`, `fmInsideUrl`).
- `features/players/playerinfo/PlayerInfoScreen.kt` — removed the Women photo
  ring/border, SD market-value normalization, SD/FM contact chips, the entire
  `PlayerInfoWomenSection`, Women title/subtitle, and the `palette.isWomen`
  checks (now `!palette.isYouth`). Removed `WomenGlowPhotoRing`,
  `WomenSectionHeader`, `PlatformWomenAccent` imports.
- `features/players/playerinfo/PlayerInfoViewModel.kt` — removed the
  `Platform.WOMEN -> "women"` branches in the share/report platform mappers;
  updated Women/Youth comments to Youth.
- `features/players/playerinfo/documents/DocumentsSection.kt` and
  `features/players/playerinfo/notes/NotesComponents.kt` — `isMenPalette`
  helpers simplified to `!palette.isYouth`.
- `features/players/repository/PlayersRepository.kt` — comment wording only.
- `features/requests/RequestsScreen.kt` — removed the `isWomen` locals/params and
  all `women_*` string branches; the TM online-search block (previously hidden
  for Women) is now always shown for Men + Youth.
- `features/shortlist/ShortlistScreen.kt` — removed the `isWomen` locals/params,
  `women_shortlist_subtitle`, and the `!isWomen` gating (now `!isYouth`).
- `features/shortlist/ShortlistRepository.kt` — comment wording only.

### Add player

- `features/add/AddPlayerViewModel.kt` — removed the entire SoccerDonna/Women
  search + form path: `WomanPlayerFormState`, `womenSearchResults`,
  `womanFormState`, `isWomenPlatform`, `performWomenSearch`,
  `onWomanPlayerSelected`, `loadWomanPlayerByUrl`, `mapSoccerDonnaPosition`,
  the Women form-state helpers, `saveWomanPlayer`, `saveWomanToShortlist`, the
  SoccerDonna routing in `loadPlayerByTmProfileUrl`, and the `SoccerDonnaSearch`
  constructor dependency + imports. Search `when` is now Men + Youth.
- `features/add/AddPlayerScreen.kt` — removed the Women single-page form UI
  block, the `WomenSearchListItem` composable, the women search state/collect,
  `soccerDonnaUrlInput`, every `Platform.WOMEN` condition, and the Women
  title/subtitle/hint. Removed the `SoccerDonnaSearchResult` import.
- `features/add/di/AddPlayerDi.kt` — dropped the `SoccerDonnaSearch` singleton
  and the corresponding constructor argument (AddPlayerViewModel now takes 4 deps).

### Theme / components

- `ui/theme/Color.kt` — removed `PlatformWomenAccent`, `PlatformWomenSecondary`,
  and the entire `WomenColors` (ATHENA) object.
- `ui/theme/PlatformTheme.kt` — removed the `isWomen` palette flag, the
  `WomenPalette`, and the `Platform.WOMEN` branch in `paletteFor` (now exhaustive
  MEN + YOUTH).
- `ui/theme/BritTokens.kt` — `accentFor(platform)` is now an exhaustive
  `when` over `YOUTH` (teal) and `MEN` (gold) with no catch-all `else`.
- `ui/components/SkeletonComponents.kt` and `ui/theme/YouthDesignSystem.kt` —
  comment wording only.

### Deleted files (confirmed unreferenced before deletion)

- `ui/theme/WomenDesignSystem.kt`
- `ui/components/WomenUiComponents.kt`
- `features/home/dashboard/WomenDashboardComponents.kt`

### String resources

- Removed `platform_women` and all `women_*` / `feed_women_*` keys from:
  - `app/src/main/res/values/strings.xml` (91 entries)
  - `app/src/main/res/values-he/strings.xml` (4 entries)
  - `app/src/main/res/values-iw/strings.xml` (91 entries)
  - `app/src/main/res/values-iw-rIL/strings.xml` (1 entry)
- All four files remain well-formed XML. YOUTH strings and `platform_men` /
  `platform_youth` are intact. No `R.string.women_*` / `R.string.platform_women`
  references remain in code or XML.
- No women-only drawables were found/referenced, so none were removed.

### Two intentional surviving references (must NOT be removed)

1. **Stored-pref migration** — `features/platform/PlatformManager.loadFromDisk()`
   maps a persisted `"WOMEN"` (or any unparseable) value to `Platform.MEN` and
   rewrites it. This is required so existing Women installs do not crash on an
   unknown enum value; it is the only place the literal `"WOMEN"` survives, in a
   comment and via the `catch`/persist fallback.
2. **FM-intelligence fallback endpoint** — `features/scouting/ScoutApiClient.getFmIntelligence()`
   calls the Vercel endpoint literally named `/api/fminside/women-player`. This
   is a web-mirrored men/youth FM fallback that returns data for both genders;
   it is NOT a Women-platform feature and has no platform gating. The endpoint
   URL is preserved exactly; comments/log tags were clarified.

### Verification performed (sandbox, static)

- `grep` audit over `app/src/main/java` for `women|soccerdonna|athena`: only the
  two documented intentional references (plus the Platform.kt explanatory
  comment) remain.
- `grep` audit over `app/src/main/res` for `platform_women|women_|feed_women_`:
  zero matches.
- No dangling imports/references to `WomenDesignSystem`, `WomenUiComponents`,
  `WomenDashboardComponents`, `WomenColors`, `PlatformWomen*`, or `SoccerDonna*`.
- All edited `when (platform)` / `when (this)` over `Platform` are exhaustive for
  MEN + YOUTH with no WOMEN branch and no newly-added catch-all `else` that hides
  logic (Platform.kt, SharedCallables.kt, PlatformIcons.kt, PlatformTheme.kt,
  BritTokens.kt).
- Brace balance verified on all heavily edited files.
- XML well-formedness verified for all four `strings.xml` variants.

## MUST VERIFY IN LOCAL ANDROID BUILD (no Android SDK in sandbox)

- `./gradlew :app:assembleDebug` compiles with WOMEN removed (no SDK here, so a
  real Gradle build could not be run in the sandbox — this must be confirmed
  locally before merge).
- Emulator smoke test: the platform switch shows ONLY Men + Youth with correct
  2-segment indicator geometry.
- Switching to Youth loads the `*Youth` Firestore collections and the Youth
  screens render.
- An install that previously stored `WOMEN` in SharedPreferences now opens on Men
  without crashing (migration path).
- Add Player: Men (Transfermarkt) and Youth (IFA) search paths both work; no
  SoccerDonna/Women path remains.

---

## FEAT-003 — Backend contract reconciliation (Android ↔ Web)

Goal C: audit + reconcile the Android backend layer against the web's
authoritative contract so Android and web consume the EXACT same Firestore
collections, Cloud Functions callables, and API endpoints/paths/params. This is
a **verification + documentation** feature. Investigation confirmed Android was
already aligned; **no code fixes were required** — every real divergence resolved
to either an exact match or an architecture-sanctioned difference (documented
below). No endpoints were invented or repointed.

Sources diffed:
- Collections — `mgsr-web/src/lib/platformCollections.ts` vs
  `app/.../features/platform/Platform.kt`.
- Callables — `mgsr-web/src/lib/callables.ts` + `functions/callables/*.js` +
  `functions/index.js` + ARCHITECTURE.md §18 vs `app/.../firebase/SharedCallables.kt`.
- API endpoints — `mgsr-web/src/lib/{scoutApi.ts,scoutServerUrl.ts}`, the Next.js
  routes in ARCHITECTURE.md §17, and `mgsr-web/.../generate-mandate/page.tsx` vs
  `ScoutApiClient.kt`, `MgsrWebApiClient.kt`, `PlayerStatsApiClient.kt`,
  `HighlightsApiClient.kt`, `GenerateMandateScreen.kt`, `WarRoomModels.kt`,
  `AddPlayerViewModel.kt`.

### Table 1 — Firestore Collections (men / youth)

Android `Platform.kt` only exposes MEN + YOUTH after FEAT-002. The web keeps a
third `women` column (out of scope for Android). Only the men/youth values are
reconciled below.

| Web collection (men / youth) | Android `Platform.kt` field (men / youth) | Status |
|---|---|---|
| `Players` / `PlayersYouth` | `playersCollection` = `Players` / `PlayersYouth` | match |
| `ClubRequests` / `ClubRequestsYouth` | `clubRequestsCollection` = `ClubRequests` / `ClubRequestsYouth` | match |
| `Shortlists` / `ShortlistsYouth` | `shortlistsCollection` = `Shortlists` / `ShortlistsYouth` | match |
| `Contacts` / `ContactsYouth` | `contactsCollection` = `Contacts` / `ContactsYouth` | match |
| `FeedEvents` / `FeedEventsYouth` | `feedEventsCollection` = `FeedEvents` / `FeedEventsYouth` | match |
| `AgentTasks` / `AgentTasksYouth` | `agentTasksCollection` = `AgentTasks` / `AgentTasksYouth` | match |
| `PlayerDocuments` / `PlayerDocumentsYouth` | `playerDocumentsCollection` = `PlayerDocuments` / `PlayerDocumentsYouth` | match |
| *(not in `platformCollections.ts`)* | `shadowTeamsCollection` = `ShadowTeams` / `ShadowTeamsYouth` | n-a in the web **lib** — the web keeps no ShadowTeams entry in `platformCollections.ts`; shadow-team writes go through the `shadowTeamsSave` callable, which resolves the `ShadowTeams`/`...Youth` collection server-side from the `platform` arg. Android reads the same `ShadowTeams`/`ShadowTeamsYouth` names, consistent with the `*Youth` suffix convention used everywhere else. No conflict. |
| `RequestMatchResults` / `RequestMatchResultsYouth` | `requestMatchResultsCollection` = `RequestMatchResults` / `RequestMatchResultsYouth` | match |
| `PlayerMatchResults` / `PlayerMatchResultsYouth` | `playerMatchResultsCollection` = `PlayerMatchResults` / `PlayerMatchResultsYouth` | match |
| `Portfolio` / `PortfolioYouth` | *(not exposed in Android `Platform.kt`)* | n-a — Android has **no** Portfolio read/write (grep for `portfolio`/`Portfolio` in `app/` = 0 hits). Portfolio is a web-only feature (`portfolioApi.ts`, `/portfolio` route). No accessor needed. |

Result: all 9 collections defined in `platformCollections.ts` (Players,
ClubRequests, Shortlists, Contacts, FeedEvents, AgentTasks, PlayerDocuments,
RequestMatchResults, PlayerMatchResults) match the Android `Platform.kt`
constants exactly for men + youth. ShadowTeams is consistent via the
`shadowTeamsSave` callable (not in the web lib). Portfolio is web-only
(documented n-a). **No changes made.**

### Table 2 — Cloud Functions Callables

`platform` arg: Android `Platform.callableName()` emits `"men"` / `"youth"`
(verified exhaustive, no WOMEN). Payload keys below are the Android keys checked
against the web `callables.ts` payload interfaces / the Cloud Function bodies.

| Callable | Web payload keys (callables.ts) | Android payload keys (SharedCallables.kt) | Status |
|---|---|---|---|
| `contactsCreate` | platform, contactId?, name?, phoneNumber?, role?, contactType?, clubName?, clubCountry?, clubLogo?, clubCountryFlag?, clubTmProfile?, agencyName?, agencyCountry?, agencyUrl? | platform + caller-supplied `fields` map | match (Android passes fields verbatim) |
| `contactsUpdate` | platform, contactId, …same optional fields | platform, contactId + `fields` | match |
| `contactsDelete` | platform, contactId | platform, contactId | match |
| `tasksCreate` | platform, agentId, agentName, title, notes?, dueDate?, priority?, createdByAgentId, createdByAgentName, playerId?, playerName?, … | platform + `fields` | match |
| `tasksUpdate` | platform, taskId, title?, notes?, dueDate?, priority?, agentId?, agentName? | platform, taskId + `fields` | match |
| `tasksToggleComplete` | platform, taskId, isCompleted | platform, taskId, isCompleted | match |
| `tasksDelete` | platform, taskId | platform, taskId | match |
| `agentTransferRequest` | platform, playerId, playerName?, playerImage?, fromAgentId, fromAgentName?, toAgentId, toAgentName? | platform, playerId, playerName, playerImage, fromAgentId, fromAgentName, toAgentId, toAgentName | match |
| `agentTransferApprove` | platform, requestId | platform, requestId | match |
| `agentTransferReject` | requestId, rejectionReason? | requestId, rejectionReason? | match (no platform — same as web) |
| `agentTransferCancel` | requestId | requestId | match |
| `offersCreate` | platform, playerTmProfile, playerName, playerImage, requestId, clubName, clubLogo, position, clubFeedback?, markedByAgentName | platform + `fields` | match |
| `offersUpdateFeedback` | offerId, clubFeedback | offerId, clubFeedback | match |
| `offersDelete` | offerId | offerId | match |
| `offersUpdateHistorySummary` | offerId, historySummary | offerId, historySummary | match |
| `requestsCreate` | platform, clubTmProfile?, clubName?, …position?, quantity?, notes?, minAge?, maxAge?, ageDoesntMatter?, salaryRange?, transferFee?, dominateFoot?, euOnly?, createdByAgent?… | platform + `fields` | match |
| `requestsUpdate` | platform, requestId, …same + status? | platform, requestId + `fields` | match |
| `requestsDelete` | platform, requestId, requestSnapshot?, agentName? | platform, requestId, requestSnapshot, agentName | match |
| `matchRequestToPlayers` | platform, requestId, euCountries? | *(wrapper not in SharedCallables.kt; called elsewhere — see note)* | n-a on this wrapper layer (not invoked via SharedCallables) |
| `matchingRequestsForPlayer` | platform, playerId, euCountries? | *(same — not in SharedCallables.kt)* | n-a (not invoked via SharedCallables) |
| `playersUpdate` | platform, playerId, _deleteFields?, [k]:v | platform, playerId, _deleteFields?, `fields` | match |
| `playersToggleMandate` | platform, playerId, hasMandate, playerRefId?, playerName?, playerImage?, agentName? | platform, playerId, hasMandate, playerRefId, playerName, playerImage, agentName | match |
| `playersAddNote` | platform, playerId, playerRefId?, noteText, createdBy?, createdByHe?, playerName?, playerImage?, agentName?, taggedAgentIds? | platform, playerId, playerRefId, noteText, createdBy, createdByHe, playerName, playerImage, agentName, taggedAgentIds | match |
| `playersDeleteNote` | platform, playerId, playerRefId?, noteIndex?, noteText?, noteCreatedAt?, playerName?, playerImage?, agentName? | platform, playerId, playerRefId, noteIndex, noteText, noteCreatedAt, playerName, playerImage, agentName | match |
| `playersDelete` | platform, playerId, playerRefId?, playerName?, playerImage?, agentName? | platform, playerId, playerRefId, playerName, playerImage, agentName | match |
| `playerDocumentsCreate` | platform, playerRefId, type, name, storageUrl, expiresAt?, validLeagues?, uploadedBy?, playerName?, playerImage?, agentName? | platform, playerRefId, type, name, storageUrl, expiresAt?, validLeagues?, uploadedBy?, playerName?, playerImage?, agentName? | match |
| `playerDocumentsDelete` | platform, documentId, clearPassport?, playerId? | platform, documentId, clearPassport, playerId | match |
| `playerDocumentsMarkExpired` | documentId | documentId | match |
| `shortlistAdd` | platform, tmProfileUrl, checkRoster?, agentName?, [k]:v | platform, tmProfileUrl, checkRoster + `fields` | match |
| `shortlistRemove` | platform, tmProfileUrl, playerName?, playerImage?, agentName? | platform, tmProfileUrl, agentName? | match (Android omits optional playerName/playerImage; server tolerant) |
| `shortlistUpdate` | platform, tmProfileUrl, [k]:v | platform, tmProfileUrl + `fields` | match |
| `shortlistAddNote` | platform, tmProfileUrl, noteText, createdBy?, createdByHebrewName?, createdById?, taggedAgentIds?, agentName?, playerName?, playerImage? | platform, tmProfileUrl, noteText, createdBy, createdByHebrewName, createdById, taggedAgentIds, agentName, playerName, playerImage | match |
| `shortlistUpdateNote` | platform, tmProfileUrl, **noteIndex**, **newText** | platform, tmProfileUrl, **noteIndex**, **newText** | match (arg names noteIndex/newText confirmed identical) |
| `shortlistDeleteNote` | platform, tmProfileUrl, **noteIndex** | platform, tmProfileUrl, **noteIndex** | match |
| `playersCreate` | platform, fullName, removeFromShortlistUrl?, [k]:v | platform + `fields` | match |
| `sharePlayerCreate` | playerId, [k]:v | caller-supplied `fields` | match |
| `shadowTeamsSave` | platform, accountId, formationId, slots, updatedAt? | platform, accountId + `fields` | match |
| `scoutProfileFeedbackSet` | uid, profileId, feedback, agentId? | uid, profileId, feedback, agentId | match (Fn reads all four) |
| `birthdayWishSend` | year, playerId, sentBy? | year, playerId, sentBy | match |
| `mandateSigningCreate` | token, [k]:v | caller-supplied `fields` | match |
| `accountUpdate` | accountId, email?, fcmToken?, language?, addFcmWebToken?, removeFcmWebToken? | accountId?, email? + `fields` | match |
| `chatRoomSend` | text, senderAccountId, senderName, senderNameHe, mentions, notifyAccountId?, replyTo?, attachments? | senderAccountId, senderName, senderNameHe, text, notifyAccountId, mentions, replyTo?, attachments? | match |
| `chatRoomEdit` | messageId, senderAccountId, newText | messageId, senderAccountId, newText | match |
| `chatRoomDelete` | messageId, senderAccountId | messageId, senderAccountId | match |
| `notificationMarkRead` | accountId, notificationId | accountId, notificationId | match |
| `notificationMarkAllRead` | accountId | accountId | match |
| `triggerReleasesRefreshJob` | *(empty)* | *(empty)* | match (result struct mirrored field-for-field) |
| `getReleasesRefreshJobStatus` | operationName?, executionName? | operationName?, executionName? | match |
| `portfolioUpsert` / `portfolioDelete` | platform, [k]:v / platform, documentId | *(no Android wrapper)* | n-a — Portfolio is web-only (see Table 1); Android does not call these. (ARCHITECTURE.md §18 marks them ✅/✅ aspirationally, but `SharedCallables.kt` has no wrapper and nothing in `app/` calls them.) |
| `sharedRequestLinkCreate` | *(not wrapped in callables.ts)* | platform, showClubs, recipientLabel | **confirmed real & kept** — see below |
| `sharedRequestLinkRevoke` | *(not wrapped in callables.ts)* | token | **confirmed real & kept** — see below |

**`sharedRequestLink*` cross-check (acceptance criterion):** Both are **real
deployed Cloud Functions**, exported in `functions/index.js`
(`exports.sharedRequestLinkCreate` / `exports.sharedRequestLinkRevoke`) and
implemented in `functions/callables/phase6Misc.js`. They are simply not wrapped
in the web's `callables.ts` typed layer (the web calls them inline). The server
`sharedRequestLinkCreate(data, uid)` reads exactly `{ platform, showClubs,
recipientLabel }` and returns `{ token }`; `sharedRequestLinkRevoke(data, uid)`
reads `{ token }` and returns `{ success }`. **Android's payload keys and return
parsing match the deployed function exactly — kept as-is, no realignment needed.**

Result: every callable Android invokes maps 1:1 to a deployed Cloud Function
with matching name, `platform` string (`men`/`youth`), and payload keys.
**No changes made.**

### Table 3 — HTTP API Endpoints

| Feature | Web base + path + params | Android base + path + params | Status + note |
|---|---|---|---|
| Recruitment search (Requests) | `/api/scout/recruitment` (Vercel proxy → Render `/recruitment`); params `position, age_min, age_max, foot, notes, transfer_fee, salary_range, exclude_urls, request_id, club_url, club_name, club_country, lang, sort_by=score, limit, _t` | Render direct `https://football-scout-server-l38w.onrender.com/recruitment`; params `position, age_min, age_max, foot, value_max, notes, transfer_fee, salary_range, request_id, exclude_urls, club_url, club_name, club_country, lang, sort_by=score, limit` | match (same endpoint). Note: Android calls Render directly (web proxies through Vercel to dodge browser CORS — not a concern on-device). Android additionally sends `value_max` (server accepts it; web conveys budget via `transfer_fee`/`salary_range`). Android omits the `_t` cache-buster (harmless; it uses `cache: no-store` semantics via OkHttp). No path/param-name mismatch. |
| Similar players (Player dossier) | Render direct `…onrender.com/similar_players`; params `player_url, lang, limit?, exclude?, player_name, player_club, target_position, player_age, player_foot, player_height, player_nationality, player_market_value, _t` | Render direct `…onrender.com/similar_players`; params `player_url, lang, exclude?` | match (same base+path). Android sends a subset of the optional context params (name/club/position/etc.); server treats them as optional enrichment. No mismatch. |
| AI Scout free-text search | `POST /api/scout/search` (Vercel); body `query, lang, initial, demo, excludeUrls?, diversityMode, seed?, seenKeys?, userId?, valueMin?, valueMax?` | `POST https://management.mgsrfa.com/api/scout/search`; body `query, lang, initial, excludeUrls?` | match (same base+path+method). Android sends the required core body (`query/lang/initial/excludeUrls`); the extra web params (`demo/diversityMode/seed/seenKeys/userId/valueMin/valueMax`) are optional server-side knobs — their omission is non-breaking. No path/param-name mismatch. |
| Find Next | Render direct `…onrender.com/find_next`; params `player_name, age_min, age_max, lang, limit, value_min?, value_max?, exclude_urls?` | Render direct `…onrender.com/find_next`; params `player_name, age_min, age_max, lang, limit=500, value_min?, value_max?, exclude_urls?` | match |
| FM intelligence (Player dossier) | 1) `/api/scout/fm-intelligence` (Vercel→Render `/fm_intelligence`) params `player_name, club?, age?`; 2) fallback `GET /api/fminside/women-player` params `name, club?, age?` | 1) `https://management.mgsrfa.com/api/fminside/women-player` params `name, club?, age?`; 2) `…/api/fminside/player` params `player_name, club?, age?`; 3) Render `/fm_intelligence` params `player_name, club?, age?` | match (same endpoints, same param names). Android tries the proven `women-player` fallback first then the men endpoint then Render; web tries scout-proxy first then `women-player`. Same universe of endpoints — ordering differs but all mirror the web. The `women-player` endpoint name is a **sanctioned men/youth FM fallback** (returns both genders), NOT a Women-platform feature. |
| Player per-90 stats (Player dossier) | `/api/scout/player-stats` (Vercel → Render `/player_stats`) | Render direct `…onrender.com/player_stats?url=` | match (same underlying endpoint; Android skips the Vercel proxy). Response fields parsed as `api_*` snake_case — matches server. |
| War Room — discovery | `GET /api/war-room/discovery` | `GET https://management.mgsrfa.com/api/war-room/discovery` | match |
| War Room — scout profiles | `GET /api/war-room/scout-profiles?agentId=` | `GET …/api/war-room/scout-profiles?agentId=` | match |
| War Room — report | `POST /api/war-room/report` body `player_url, player_name?, lang` | `POST …/api/war-room/report` body `player_url, player_name?, lang` | match |
| War Room — alpha-board | `/api/war-room/alpha-board` (web/mock) | *(not called on Android)* | n-a — Android's War Room surfaces discovery + scout-profiles + report; the mock's "alpha board" is not wired to a dedicated Android endpoint. No invented endpoint. |
| Highlights | `GET /api/highlights/search` params `playerName, teamName?, position?, parentClub?, nationality?, fullNameHe?, clubCountry?, refresh?` | `GET …/api/highlights/search` params `playerName, teamName?, position?, parentClub?, nationality?, fullNameHe?, clubCountry?, refresh=1?` | match |
| Mandate generate | `POST /api/mandate/generate` (JSON body → PDF bytes) | `POST https://management.mgsrfa.com/api/mandate/generate` (JSON body → PDF bytes) | match |
| TM search / profiles / releases / returnees / contract-finishers | `/api/transfermarkt/*` (Vercel Cheerio + Firestore caches) | **Direct JSoup scrape** via the sibling `transfermarkt/` Gradle module (`PlayerSearch`, `TransfermarktPlayerDetails`, releases/returnee/finisher scrapers) | **sanctioned divergence** — ARCHITECTURE.md §19 lists Android JSoup + Web Cheerio as parallel scraping paths against the same Transfermarkt source. Platform split is intentional; not "fixed". |
| IFA (Youth add-player) | `ifaFetchProfile` callable / web routes | Youth IFA load path in `AddPlayerViewModel` (`loadYouthPlayerByIfaUrl` / `createManualPlayer`) | match in intent (Youth-only path; Men uses TM module). No cross-platform mismatch. |

Result: every Android HTTP endpoint maps to a web endpoint (same base host +
path + param names) or to the architecture-sanctioned direct Transfermarkt
scraping module. **No endpoints invented; no endpoints repointed; no code
changes required.**

### Intentional, architecture-sanctioned divergences (do NOT "fix")

1. **Transfermarkt direct scraping.** Android scrapes Transfermarkt directly via
   its JSoup `transfermarkt/` sibling module for search / profiles / releases /
   returnees / contract-finishers; the web uses `/api/transfermarkt/*` (Cheerio)
   + Firestore caches. ARCHITECTURE.md §19 explicitly sanctions this parallel
   scraping. Same source, different transport per platform.
2. **FM-intelligence `women-player` endpoint name.** `ScoutApiClient.getFmIntelligence`
   (and the web `getFmIntelligence` fallback) call `/api/fminside/women-player`.
   Despite the name this returns FM data for **both genders** and is used as the
   men/youth FM fallback — it is the proven-reliable Vercel endpoint, with **no
   platform gating**. It is NOT a Women-platform feature and is kept verbatim.
3. **Render-direct vs Vercel-proxy.** For `recruitment`, `similar_players`,
   `player_stats`, and `find_next`, Android calls the Render server directly
   while the web routes some of these through `/api/scout/*` Vercel proxies. The
   proxy exists only to avoid browser CORS; on-device Android has no CORS
   constraint, so hitting Render directly reaches the identical endpoint. Not a
   divergence in the contract, only in transport.
4. **Portfolio is web-only.** `portfolioUpsert` / `portfolioDelete` and the
   `Portfolio*` collections exist on the web but are not consumed by Android
   (0 references in `app/`). No Android accessor/wrapper is required.
5. **`sharedRequestLink*` not in `callables.ts`.** Real deployed Cloud Functions
   (confirmed in `functions/index.js` + `phase6Misc.js`); the web invokes them
   inline rather than via the typed `callables.ts` layer. Android's wrappers
   match the deployed function signatures exactly and are kept.

### FEAT-003 verification performed (sandbox, static)

- Re-grepped Android collection constants in `Platform.kt` and confirmed 1:1
  with `platformCollections.ts` for all 10 shared collections (men + youth).
- Re-grepped `SharedCallables.kt` callable name string literals and confirmed
  each exists as a deployed Cloud Function (`functions/index.js`) and matches
  the `callables.ts` payload interface where one exists.
- Confirmed `Platform.callableName()` emits only `"men"` / `"youth"` (exhaustive,
  no WOMEN) — the platform arg every callable receives.
- Statically compared base URL + path + param-name string literals for all six
  Android HTTP clients (`ScoutApiClient`, `MgsrWebApiClient`,
  `PlayerStatsApiClient`, `HighlightsApiClient`, `GenerateMandateScreen`,
  plus the TM module via `AddPlayerViewModel`) against the web lib / routes.
- **No real mismatch found; therefore no Android source files were modified in
  FEAT-003** (this is a pure audit + documentation feature). The only artifact
  changed is this `RECONCILIATION.md`.

### MUST VERIFY IN LOCAL ANDROID BUILD (FEAT-003 additions)

- From an emulator, exercise one read + one callable write per domain and confirm
  the web reflects the change in the SAME Firestore collection:
  add a Contact (`contactsCreate` → `Contacts`/`ContactsYouth`), toggle a mandate
  (`playersToggleMandate` → `Players`/`PlayersYouth`), add a shortlist note
  (`shortlistAddNote` → `Shortlists`/`ShortlistsYouth`).
- Run one AI Scout search (`POST /api/scout/search`) and one recruitment search
  (`/recruitment`) and confirm results return (Render cold start can take up to
  the configured 2–3 min timeout).
- Generate one Mandate PDF (`POST /api/mandate/generate`) and confirm bytes
  stream back and the preview opens.
- Switch to Youth and confirm all of the above hit the `*Youth` collections.

## FEAT-004 — Hero surfaces rebuilt to the mock (shell + loader + login + dashboard + dossier hero)

Goal A: rebuild the signature screens to match docs/mobile-prototype, reusing
the real ViewModels/data wiring (presentation-only). All work is static (no
Android SDK in the sandbox → no Gradle build run).

### New reusable chrome (ui/components)
- `BritIcons.kt` — the mock's `ICONS` SVG set ported 1:1 to Compose
  `ImageVector`s (dashboard/players/warRoom/tasks/more/shortlist/marketRadar/
  releases/clubChanges/contractFinisher/returnees/contacts/requests/aiScout/
  tunnel/roster/bell/back/arrow/close), 24x24 stroke, round caps.
- `BritShell.kt` — the shared editorial chrome: `BritTopHeader` (BRIT mark +
  workspace kicker/desk label + page title + notification bell with unread dot +
  2-way platform switch), `BritPlatformSwitch` (strict Men/Youth 2-segment,
  gold thumb / teal for Youth — NOT the mock's 3-way M/A/W), `BritTabBar`
  (Dashboard/Players/War Room/Tasks + More), `BritMoreSheetContent` (3-col icon
  grid of the 11 MORE_ITEMS + drag handle + sign-out). `BritTab` / `BritMoreItem`
  enums model the mock's TABS / MORE_ITEMS.
- `BritLoader.kt` — 3-ring concentric spinner (gold/ink/gold) + pulsing core +
  shimmer hairline + "BRIT SPORT GROUP" Oswald title + 3 pulsing dots on cream,
  ported from the mock `.loader`.
- `GrayscalePhoto.kt` — `GrayscalePlayerPhoto` (desaturating ColorFilter + dark
  bottom scrim + name/initials overlay), reusing the app's existing Coil loader,
  used by the dashboard marquee + feed + dossier hero.
- `BritDossier.kt` — `BritDossierHero` (grayscale hero + nationality kicker +
  name masthead), `BritFactsGrid`, `BritDossierTabStrip` (8-tab:
  OVERVIEW/PERFORMANCE/MARKET/DOCUMENTS/NOTES/INTELLIGENCE/HIGHLIGHTS/REQUESTS).
- `BritPlaceholderScreen.kt` — editorial "coming soon" for the More-sheet
  entries whose full screens land in FEAT-006 (Market Radar, Club Changes).

### Navigation
- `navigation/Screens.kt` — added `MarketRadarScreen` ("market_radar") and
  `ClubChangesScreen` ("club_changes") so the More-sheet grid has no dead links.
- `features/home/HomeScreen.kt` — registered the two placeholder routes; the
  dashboard route now renders `BritDashboardScreen` (was `DashboardScreen`).
- Verified every TAB / MORE_ITEM / QUICK action maps to a registered route:
  Dashboard(stay)/Players/WarRoom/Tasks tabs; Shortlist/ShadowTeams/Releases/
  ClubChanges(placeholder)/ContractFinisher/Returnees/Contacts/Requests/AiScout/
  Tunnel(ChatRoom)/MarketRadar(placeholder) More items; quick-grid routes.

### Dashboard (features/home/dashboard/BritDashboardScreen.kt — NEW)
- Mock SCREENS.dashboard section order: (a) masthead greeting
  (GOOD MORNING/AFTERNOON/EVENING from `state.greetingRes` + account name +
  date) (b) brit-signals strip (totalPlayers/withMandate/expiringSoon/freeAgents/
  requestsCount) (c) birthdays — REUSES the existing `BirthdaysSection` + data
  (d) OUR ASSETS grayscale marquee (e) Pending Decisions #11110f black module
  (`state.pendingTransfers`) (f) Mandate Watch (`state.documentReminders`)
  (g) Recent Activity feed (`state.feedEvents`) (h) Quick Actions grid.
- 100% of data comes from the existing `IHomeScreenViewModel`; the platform
  switch calls `platformManager.switchTo` + `viewModel.reloadForPlatformSwitch`
  exactly as before; the bell opens the existing `NotificationCenterSheet`.
- YOUTH retints via `BritTokens.accentFor(platform)` (teal), no separate layout;
  Youth still reads its `*Youth` collections through the same ViewModel.

### Login (features/login/LoginScreen.kt — restyled)
- Repainted to the mock's cinematic editorial login: warm-ink→black vertical
  gradient background, BRIT circle mark, mono kicker "BRIT SPORT GROUP ·
  MANAGEMENT ROOM", Oswald masthead, gold hairline rule, gold enter button,
  grain-free dark cinematic field card. ALL ViewModel logic preserved verbatim:
  `performLogin`, `userLoginFlow`, email validation, shake-on-error, staggered
  entrance, one-time navigation guard, FCM/auth in `LoginScreenViewModel`
  untouched, EN/HE language toggle kept.

### Player dossier (features/players/playerinfo/PlayerInfoScreen.kt — additive hero)
- Inserted the mock's signature cinematic grayscale hero (`BritDossierHero`:
  grayscale photo + dark scrim + nationality/club kicker + name masthead +
  position/value/status subtitle) at the TOP of the existing dossier scroll,
  above the existing `PlayerInfoHeroCard`. Purely presentational and additive —
  every existing section (notes/documents/playerstats/fmintelligence/gps/
  highlights/matchingrequests/agenttransfer/mandate) and every action (notes
  add/delete, mandate toggle, docs, share, delete, generate-mandate nav) is
  UNCHANGED and keeps its data wiring. Reusable `BritFactsGrid` /
  `BritDossierTabStrip` are provided for a fuller tabbed adoption later.

### Scope / deviations
- The 4,120-line `DashboardScreen.kt` and 4,566-line `PlayerInfoScreen.kt` are
  NOT runnable to compile in this sandbox. To avoid destabilising the working
  data-wired app, the dashboard was delivered as a NEW `BritDashboardScreen`
  (old `DashboardScreen.kt` left intact + unreferenced; `MenDashboardType` shim
  therefore kept because the old file still uses it), and the dossier received
  an additive BRIT hero rather than a from-scratch rewrite of its 9 inline
  sections. This keeps navigation + every action working while matching the
  mock's structure/feel. FEAT-005 breadth screens can reuse the same shell.
- The 2-way (Men + Youth) platform switch is intentional; the mock's 3-way
  M/A/W is NOT reproduced (Women removed in FEAT-002).

### MUST VERIFY IN LOCAL ANDROID BUILD (FEAT-004 additions)
- `./gradlew :app:assembleDebug` compiles the new ui/components (BritIcons,
  BritShell, BritLoader, GrayscalePhoto, BritDossier, BritPlaceholderScreen),
  BritDashboardScreen, the restyled LoginScreen, and the dossier hero insert.
- Emulator smoke: loader → login (cinematic) → dashboard; confirm Oswald/Manrope/
  DM Mono render and paper-grain is subtle (~0.045 alpha) with no scroll jank.
- Dashboard: scroll every section (masthead/signals/birthdays/OUR ASSETS marquee/
  pending/mandate watch/feed/quick grid); verify grayscale photos + scrim render
  via Coil; tap each bottom tab + every More-sheet item + every quick-grid cell
  and confirm it routes (ClubChanges/MarketRadar hit the placeholder).
- Toggle Men ↔ Youth from the header switch; confirm teal retint + Youth
  collections load (reloadForPlatformSwitch) and the switch shows only M / A.
- Open the player dossier; confirm the grayscale hero + name overlay render and
  all existing actions still work (add/delete note, toggle mandate, upload doc,
  share, delete, generate-mandate nav).
- Verify header insets: `BritTopHeader` applies `statusBarsPadding()` inside the
  HomeScreen Scaffold — confirm there is no double top padding on device.
- Open the notification bell → confirm the existing NotificationCenterSheet and
  its navigation targets still work.

## FEAT-005 — Breadth screens restyled to the mock (BRIT editorial)

Goal A (breadth): restyle the remaining existing screens to the mock's
".brit-room" paper editorial look, reusing the shared BritTokens/BritType from
FEAT-001/FEAT-004 and preserving every ViewModel/data/callable wiring. All work
is static (no Android SDK in the sandbox → no Gradle build run).

### Approach (why "palette re-binding", not from-scratch rewrites)
These screens are very large (PlayersScreen ~2.4k, RequestsScreen ~3.9k,
ContactsScreen ~3.3k, WarRoomScreen ~2.8k, AiScoutScreen ~3.0k, ShortlistScreen
~2.4k, GenerateMandateScreen ~1.9k lines) and are production-wired. Per the
FEAT-004 precedent and the orchestrator brief, a from-scratch rewrite without a
compiler is unsafe. Each screen was built in an **old dark theme** via a small
set of palette constants (either file-local `MenRoster*`/`MenShortlist*`/`Wr*`/
`W*`/`Noir*` or the shared `Home*` names, or the shared `PlatformColors`
palette). The restyle therefore **re-binds those colour names to BritTokens**
(semantic role preserved: background→paper, card→card/paper2, border→hairline,
primary text→ink, secondary→muted, accent→gold [teal for Youth], green/amber/
blue/red kept) so the whole screen flips to the cream editorial look **without
touching a single layout node, ViewModel call, callable, or nav target**. Every
edit verified: braces balanced, no stale `ui.theme.Home*` refs, BritTokens
imported, no remaining dark surface literals, and every `Color.White` text/icon
confirmed to sit on a coloured accent/gradient/photo-scrim (never on the new
paper surface) so contrast stays correct.

### Shim cleanup (menDisplay/menBody/menMono migration — DONE)
- Deleted the dead `features/home/dashboard/DashboardScreen.kt` (4.1k-line old
  dashboard, unreferenced since FEAT-004 swapped in `BritDashboardScreen`) and
  the `features/home/dashboard/MenDashboardType.kt` shim. These were the ONLY
  remaining `menDisplay/menBody/menMono` call sites (verified by grep), so the
  app now has a single editorial type source (`ui/theme/BritType.kt`). Updated
  the BritType header comment (shim removed). `BritDashboardScreen` is the only
  dashboard composable left; `HomeScreen` still renders it unchanged.

### Screens fully restyled to BRIT editorial (data wiring untouched)
1. **Notification Center** (`notificationcenter/NotificationCenterSheet.kt`) —
   dark `Home*` surface → paper card, Oswald "NOTIFICATIONS" masthead + gold
   hairline rule + mono "MARK ALL READ", ink/muted rows, gold unread tint + dot.
   `notificationMarkRead/MarkAllRead` + state/callbacks unchanged.
2. **Contract Finisher** (`contractfinisher/ContractFinisherScreen.kt`) — Home*
   → BritTokens via file-local aliases; TM JSoup data + filters/pills intact.
3. **Returnees** (`returnee/ReturneeScreen.kt` + `ReturneePlayersBottomSheet.kt`)
   — same alias remap; ReturneeViewModel + TM scraping intact.
4. **Releases** (`releases/ReleasesScreen.kt`) — alias remap; WhatsApp brand
   green kept; ReleasesViewModel + TM scraping + shortlist/bookmark intact.
5. **Shadow Teams** (`shadowteams/ShadowTeamsScreen.kt` + the player-select and
   slot-menu bottom sheets) — chrome → paper; the **football pitch keeps its
   green** (GrassDark/GrassLight + white PitchLine) as the intended formation
   surface. `shadowTeamsSave` wiring intact.
6. **The Tunnel / chat** (`chatroom/ChatRoomScreen.kt`) — the mock's
   `SCREENS.tunnel` is paper editorial (not noir); the `Noir*` palette → paper,
   per-sender accent scheme kept (reads on cream), send-CTA keeps a gold gradient
   with legible white glyph. ChatRoomViewModel send/edit/delete/mentions/replies
   intact.
7. **War Room** (`warroom/WarRoomScreen.kt`) — the "Mission Control" dark theme
   (`Home*` + `Wr*` indigo surfaces) → paper; indigo accent → editorial blue
   (dark enough to read as text), gem/match/agent + score ramp kept as vivid
   accents on cream. **Off-roster-target non-tappable behaviour and all 4
   sub-modes (Alpha Board / Ask / Scout Agents / Successors) + WarRoomViewModel +
   MgsrWebApiClient (/api/war-room/*) are untouched** (colour-only edit).
8. **War Room report** (`warroom/WarRoomReportScreen.kt`) — `ReportPurple` →
   editorial gold, dark surfaces → paper, ambient glows become faint gold/ink
   washes; /api/war-room/report wiring intact.
9. **AI Scout** (`aiscout/AiScoutScreen.kt`) — the "mgsr-dark" `W*` web-mirror
   palette → paper/ink/gold; query/interpretation/progressive-results CTA keeps a
   gold→blue gradient with legible white label. AiScoutViewModel +
   MgsrWebApiClient `aiScoutSearch`/`find_next` intact.
10. **Generate-Mandate wizard** (`players/playerinfo/mandate/GenerateMandateScreen.kt`)
    — `Home*` → BritTokens; CTAs keep white labels on the gold accent.
    GenerateMandateViewModel + /api/mandate/* + mandateSigningCreate intact.
11. **Mandate Preview** (`.../mandate/MandatePreviewScreen.kt`) — chrome → paper;
    rendered PDF page cards stay on white (document surface); cancel button
    moved to paper2 for readable ink label. PDF render + share intent intact.
12. **Roster / Players** (`players/PlayersScreen.kt`) — the Men-roster dark navy
    constants (`MenRoster*`) → BritTokens (title/accent light-golds mapped to the
    darker readable editorial gold). PlayersViewModel filter/sort/search +
    row-tap→dossier nav intact. Youth path still uses PlatformColors (teal).
13. **Shortlist** (`shortlist/ShortlistScreen.kt`) — `MenShortlist*` → BritTokens
    (subtle/soft golds mapped to readable gold/muted). ShortlistViewModel
    add/remove/notes/outreach + empty-state intact. Youth path unchanged.

### Deliberately NOT changed (documented deviations / deferrals)
- **Tasks + Task Detail** (`home/tasks/*`): `config/FeatureFlags.TASKS_ENABLED`
  is **false** and `HomeScreen` gates the Tasks tab/route on it. Per the brief
  the flag state is respected EXACTLY — NOT re-enabled, NOT removed. Because the
  screen is unreachable in the shipping build, its restyle is deferred (it also
  draws from the shared `PlatformColors` palette; see below). The two Tasks
  bottom sheets (`AddTaskBottomSheet`/`AddPlayerTaskBottomSheet`) use `Home*`
  directly and could be alias-remapped later, but were left to avoid touching a
  flagged-off surface.
- **Requests** (`requests/RequestsScreen.kt`) and **Contacts**
  (`contacts/ContactsScreen.kt`): these read the **shared** `PlatformColors`
  palette directly (no file-local constants). I verified all their `Color.White`
  text/icons sit on `palette.accent`/`palette.red`/solid badges (safe), BUT the
  only way to flip them to paper is to migrate the shared `MenPalette`/
  `YouthPalette` in `ui/theme/PlatformTheme.kt`. I prototyped that migration and
  **reverted it**: the same palette feeds the FEAT-004 player-dossier and its 7
  sub-sections (Highlights/YouthHighlights/FmIntelligence/MatchingRequests/
  PlayerStats/etc.), several of which draw `Color.White` text on `palette.card`/
  gradients that would become invisible on cream. A correct shared-palette flip
  needs a full device-verified contrast pass over the dossier sub-sections,
  which is out of safe static scope here. Requests/Contacts therefore keep the
  current (working) shared palette for now — restyle deferred, not faked.
- **Matchday poster generator**: Android has **no** matchday screen/route and
  no `/api/matchday/*` client (grep of `app/` for `matchday`/`Matchday` = 0
  hits; the only matchday artefacts are web/functions + a GH workflow). Per the
  brief's instruction ("if Android has NO matchday screen/endpoint reachable, do
  NOT invent one … mark that SUB-STEP blocked (retryable true)"), this sub-step
  is recorded as **blocked (retryable)** — see FEAT-005.json blocked note. No UI
  shell was invented against a non-existent client to avoid dead wiring.

### Mixed-palette caveat (Players / Shortlist)
PlayersScreen and ShortlistScreen restyle their primary roster/board surfaces
(via the file-local constants) to paper, but a few sub-components inside them
(e.g. the notes-preview `ModalBottomSheet`) still use the shared
`PlatformColors.palette.card`, which stays dark for Men. Those sheets remain
internally consistent (dark card + its own light text — no contrast bug) but do
not yet match the paper roster. Full consistency depends on the shared-palette
migration above. Documented, not a regression.

### MUST VERIFY IN LOCAL ANDROID BUILD (FEAT-005 additions)
- `./gradlew :app:assembleDebug` compiles after deleting DashboardScreen.kt +
  MenDashboardType.kt and the 16 colour-remap edits (no SDK in sandbox).
- Emulator smoke each restyled screen (open, scroll, primary action) and confirm
  the paper editorial look renders with legible text and the stated accents:
  Notification Center (mark-all-read + row tap), Contract Finisher / Returnees /
  Releases (filter chips, bookmark/shortlist, WhatsApp), Shadow Teams (drag a
  player onto the green pitch, Save → shadowTeamsSave), The Tunnel (send/edit/
  delete a message, a mention + reply), War Room (open all 4 sub-modes; confirm
  an OFF-ROSTER alpha-board target is still NON-tappable; run a report), AI Scout
  (one search + find_next, interpretation + progressive results), Generate-
  Mandate wizard (complete it → PDF), Mandate Preview (PDF pages render + share),
  Players roster (search/sort/filter + row→dossier), Shortlist (add/notes/empty).
- Verify each `Color.White` label/icon that now sits on a gold/teal/blue/red
  accent or photo scrim still reads correctly on cream (spot the Shadow-Teams
  pitch badge, chat send button, AI-Scout find-next CTA, mandate CTAs, roster
  FAB, EU/position badges).
- Switch Men ↔ Youth on each restyled screen: Youth must stay functional and
  read its `*Youth` collections. NB: the file-local-constant screens (Players,
  Shortlist, ContractFinisher, Returnees, Releases, War Room, AI Scout, Mandate,
  chat) render the SAME editorial gold for both platforms (they do not branch on
  platform for the remapped constants); confirm this reads acceptably for Youth,
  or follow up by threading `BritTokens.accentFor(platform)` through them.
- Players/Shortlist mixed-palette check: confirm the still-dark shared-palette
  bottom sheets (notes preview) are acceptable or schedule the shared-palette
  migration + dossier contrast pass.
- Confirm NO change to any ViewModel/callable/endpoint: diff shows colour/import/
  comment lines only in the 16 restyled files (+ 2 file deletions).

## FEAT-005 continuation — shared-palette cream migration + contrast pass

This pass cleared the items the prior pass had left blocked (Requests, Contacts,
the FEAT-004 dossier + sub-sections, Tasks/TaskDetail, AddPlayer) by performing
the sanctioned shared-palette migration and the device-safe-static contrast pass
the prior coder recommended. FEAT-005 is now **completed**, with ONLY the
matchday poster sub-step documented as not-implemented (no Android source to
wire to). Still static-only (no Android SDK in the sandbox).

### 1. Shared palette flipped to BRIT cream (`ui/theme/PlatformTheme.kt`)

- `MenPalette` re-pointed from the old dark `Home*` constants to BritTokens:
  `background=paper`, `card=card`, `cardAlt=paper2`, `cardBorder=line`,
  `textPrimary=ink`, `textSecondary=muted`, `accent=gold`,
  `accentSecondary=goldSoft`, `green=green`, `orange/amber=amber`, `red=red`,
  `blue=blue`, `purple=gold`, `rose=goldSoft`; `accentGradient`/`surfaceGradient`/
  `cardGradient` are now gold-on-paper; `filterSelectedBg=gold`,
  `filterSelectedText=paper`.
- `YouthPalette` uses the SAME cream surfaces (the mock treats Youth as the same
  paper look) but `accent=goldYouth` / `accentSecondary=goldSoftYouth` (pitch
  teal), with `isYouth=true` preserved so every existing `isYouth` /
  `!isYouth` branch keeps working.
- Data-class **shape unchanged** → zero call-site breakage. `paletteFor` stays
  exhaustive over MEN + YOUTH (no WOMEN, no catch-all `else`). The old
  `YouthColors`/`YouthDesignSystem` references in this file were removed (those
  objects are still used by other Youth screens — untouched there).

### 2. Dossier contrast pass (`features/players/playerinfo/*`)

- **PlayerInfoScreen.kt**: the file-local `MenInfo*` dark-navy dossier constants
  were re-bound to BRIT cream tokens — `MenInfoBg=paper`, `MenInfoCard=card`,
  `MenInfoCardAlt=paper2`, `MenInfoBorder=0x55A47D43` (gold hairline),
  `MenInfoGold=gold`, `MenInfoGoldSoft=gold` (the light `0xFFDDC187` would be too
  pale on cream, so text-role gold is the darker editorial gold),
  `MenInfoTextSubtle=muted`, `MenInfoBronze=amber`. Added the `BritTokens`
  import. The Scaffold `containerColor` (paper) and all section cards therefore
  render cream for Men, matching Youth.
- All **18 `Color.White`** sites in PlayerInfoScreen were audited against their
  background. 15 already sat on a filled accent / gradient / `palette.red` button
  / `Color.Black` loading scrim and stayed white. **Fixed:** the agent-transfer
  dialogs drew `MenInfoBg` (now cream) as the label/indicator colour on the
  filled `tealColor`/`emeraldColor` confirm & approve buttons → switched to
  `Color.White` (3 sites); and a `Color.White.copy(alpha=.06f)` dialog border
  (invisible on cream) → `palette.cardBorder` hairline.
- The dossier **sub-sections** (notes, documents, playerstats, fmintelligence,
  gps, gps-expandable, highlights, youthhighlights, matchingrequests,
  proposalhistory, scoutreport) resolve colour through `PlatformColors.palette.*`
  and auto-flip to cream. Their `Color.White` usages are all on teal/accent/red
  fills, brand badges (YouTube red, Instagram gradient), or video photo scrims.
  The `notesActionTextOnFill()` / `docsActionTextOnFill()` helpers were
  simplified to white-on-accent (both platform accents are now dark enough).
- Vivid FM/stat accent literals (`0xFFFFD700` gold "elite", `0xFFFFC107`/`0xFFFFB74D`
  amber status, `0xFF66BB6A` green) are kept as small decorative status captions
  (FM-Inside visual language), NOT body text — flagged for a device spot-check.

### 3. Requests + Contacts (now inherit the cream palette)

- Both read the shared `PlatformColors` palette directly, so the palette flip
  makes them cream automatically. Verified every `Color.White` sits on
  `palette.accent` / `palette.red` / a blue EU badge fill; no near-white text
  literals on cream.
- Brit-room polish applied to `RequestsHeader` and `ContactsHeader`: a DM-Mono
  uppercase **kicker** (`britMono`, accent) + an Oswald uppercase **masthead**
  (`britDisplay`), and a **gold hairline rule** beneath the header (header Row
  wrapped in a Column to host the rule). No change to RequestsViewModel /
  ContactsViewModel, CRUD, matching (ScoutApiClient recruitment /
  matchRequestToPlayers), or WhatsApp/phone actions.

### 4. Tasks + Task Detail (`features/home/tasks/*`)

- `TasksScreen.kt` and `TaskDetailScreen.kt` read the shared palette and
  auto-flip to cream; their TopAppBar titles were upgraded to Oswald uppercase
  (`britDisplay`). Their lone `Color.White` sites are on accent FAB / accent
  "mark complete" fills.
- The two Tasks bottom sheets (`AddTaskBottomSheet.kt`,
  `AddPlayerTaskBottomSheet.kt`) used the dark `Home*` constants directly; their
  `Home*` imports were replaced with file-local vals bound to BRIT cream tokens
  (same semantic remap used elsewhere). Their `Color.White` labels sit on the
  gold "create"/avatar fills.
- **FeatureFlag respected EXACTLY:** `config/FeatureFlags.TASKS_ENABLED` is still
  `false` and `HomeScreen` still gates the Tasks tab/route on it (verified at
  HomeScreen.kt:129 and :222 — untouched). The restyle only changes colours/type
  for when the flag is on; it does NOT re-enable or remove the gating.

### 5. AddPlayer (`features/add/*`)

- `AddPlayerScreen.kt` + `AddFromLinkBottomSheet.kt` use `PlatformColors.palette.*`
  exclusively (0 `Color.White`, 0 near-white literals, 0 `Home*` refs) → render
  correctly on cream with no contrast fix needed. Search/VM/IFA/TM wiring
  untouched.

### 6. Matchday poster generator — NOT implemented (documented, not faked)

- Android has **no** matchday screen, route, or `/api/matchday/*` client
  (`grep` of `app/` for `matchday`/`Matchday` = 0 hits; the only matchday
  artefacts are in `mgsr-web` / `functions` + a GitHub workflow). Per the brief,
  no endpoint or UI shell was invented against a non-existent client. This is the
  single FEAT-005 sub-step left unbuilt; it can only be done once an Android
  matchday client exists.

### MUST VERIFY IN LOCAL ANDROID BUILD (FEAT-005 continuation additions)

- `./gradlew :app:assembleDebug` compiles after the `PlatformTheme.kt` palette
  migration and the contrast-pass edits (no SDK in sandbox).
- **No white-on-cream text anywhere** — spot every restyled surface:
  - Player dossier (Men) + each sub-section (notes, documents, player stats,
    FM intelligence, GPS, highlights/youth highlights, matching requests,
    proposal history, scout report): all body text is ink/muted on cream; the
    only white glyphs are on gold/teal/blue/red fills, FM/stat accent chips,
    brand badges, or video/photo scrims.
  - Agent-transfer confirm & approve dialog buttons: white label legible on the
    teal/emerald/amber fill (the fixed sites).
  - Requests + Contacts: masthead (Oswald) + kicker (DM Mono) + gold hairline
    render; FAB/CRUD buttons legible; EU badge white-on-blue.
  - Tasks + Task Detail + both add-task sheets: cream surfaces, Oswald titles,
    gold create/FAB buttons legible.
- Verify the **Youth** variant of every migrated screen: cream surfaces with the
  pitch-teal accent (not the old dark NOVA theme), `*Youth` collections load,
  dossier sub-sections read teal accents correctly.
- Confirm `FeatureFlags.TASKS_ENABLED` is still `false` on the shipping build and
  the Tasks tab stays hidden (the restyle must not have re-enabled it).
- Confirm NO ViewModel/callable/endpoint/nav change: the diff for this pass is
  colour/type/import/comment lines in `PlatformTheme.kt`, `PlayerInfoScreen.kt`,
  `NotesComponents.kt`, `DocumentsSection.kt`, `RequestsScreen.kt`,
  `ContactsScreen.kt`, `TasksScreen.kt`, `TaskDetailScreen.kt`,
  `AddTaskBottomSheet.kt`, `AddPlayerTaskBottomSheet.kt` only.
- (Deferred polish, not blocking) grayscale `GrayscalePlayerPhoto` treatment for
  player avatars inside Requests/Contacts match results was NOT threaded in this
  pass (avoids touching AsyncImage wiring in the 3.9k/3.3k-line files); apply it
  on-device if the editorial grayscale look is desired there.

## FEAT-006 — New additive screens (Market Radar + Club Changes)

Goal A (additive): add the two screens the mock introduces that Android lacked
(Market Radar + Club Changes), wired to the SAME web sources, replacing the
FEAT-004 More-sheet placeholders. Still static-only (no Android SDK in sandbox).

### What was built

- `features/marketradar/` — `MarketRadarModels.kt` (wire models mirroring
  `marketRadar.ts`), `MarketRadarApiClient.kt` (OkHttp client following the
  `MgsrWebApiClient` pattern), `MarketRadarViewModel.kt` (`IMarketRadarViewModel`
  + loading/refreshing/error state), `MarketRadarScreen.kt` (mock
  `SCREENS.marketRadar`), `di/MarketRadarDi.kt` (`marketRadarModule`).
- `features/clubchanges/` — `ClubChangesViewModel.kt` (`IClubChangesViewModel`,
  reads `FeedEvents` + roster, derives the move list), `ClubChangesScreen.kt`
  (mock `SCREENS.clubChanges`), `di/ClubChangesDi.kt` (`clubChangesModule`).
- `navigation/Screens.kt` already had `MarketRadarScreen` ("market_radar") +
  `ClubChangesScreen` ("club_changes") routes (added as placeholders in
  FEAT-004); `features/home/HomeScreen.kt` now renders the REAL
  `MarketRadarScreen` / `ClubChangesScreen` composables for those routes
  (placeholder `BritPlaceholderScreen` calls removed; the now-unused
  `ui/components/BritPlaceholderScreen.kt` was deleted). The More-sheet entries
  (`BritMoreItem.MARKET_RADAR` / `CLUB_CHANGES`) + the dashboard quick-grid
  Market Radar cell keep pointing at the same routes (no dead links).
- `application/di/ApplicationDi.kt` registers `marketRadarModule` +
  `clubChangesModule` in `applicationModules` (Koin single/viewModel pattern,
  same as `releasesModule`/`aiScoutModule`).
- Repo-noise cleanup: deleted the stray tracked
  `features/warroom/WarRoomScreen.kt.bak`.

### Table 4 — Market Radar + Club Changes source mapping (web vs Android)

| Screen | Web source | Android source | Status |
|---|---|---|---|
| **Market Radar** | `GET /api/market-radar?region=<region>&signal=<signal>&refresh=<true\|false>` → Next.js route `mgsr-web/src/app/api/market-radar/route.ts` → `getMarketRadarFeed()` in `mgsr-web/src/lib/marketRadar.ts`. Returns a JSON **array** of `MarketRadarItem` (or `{error}` on 500). | `MarketRadarApiClient.getMarketRadar(region, signal, refresh)` → `GET https://management.mgsrfa.com/api/market-radar?region=…&signal=…&refresh=…` (same host as `MgsrWebApiClient`), parses the SAME array/fields. | match — same base host + path + param names (`region`/`signal`/`refresh`) + response shape. |
| **Club Changes** | `mgsr-web/src/app/club-change-notifications/page.tsx` subscribes to `FEED_EVENTS_COLLECTIONS.men` (Firestore `FeedEvents`), filters `type === 'CLUB_CHANGE' && playerTmProfile`, joins roster `PLAYERS_COLLECTIONS.men` by TM id (`extractPlayerIdFromUrl`). Fields: `playerName/playerImage/playerTmProfile/playerPosition/playerAge/oldValue(→from)/newValue(→to)/timestamp`. | `ClubChangesViewModel` reads `FirebaseHandler.feedEventsTable` (= `p.feedEventsCollection` = `FeedEvents`/`FeedEventsYouth`), filters `type == FeedEvent.TYPE_CLUB_CHANGE && playerTmProfile != null`, joins `playersTable` roster by TM id (`extractPlayerIdFromUrl`), same `oldValue→from` / `newValue→to` mapping + roster fall-backs + the "only show logo when roster club == newValue" guard. | match — same Firestore collection + same CLUB_CHANGE filter + same field semantics. Android reuses the EXACT FeedEvents source its dashboard already consumes (no new endpoint). |

### Market Radar request/response field map (quoted from `marketRadar.ts`)

- Request params (route.ts): `region` (`all` default) ∈ MarketRegion
  {`all,israel_greece,eastern_eu,turkey_balkans,nordics,mid_tier_west,south_america_gulf,social`},
  `signal` (`all` default) ∈ MarketSignalType
  {`OUT_OF_PLANS,DISPUTE_CLAIM,COLLAPSED_DEAL,FOREIGN_QUOTA,CONTRACT_STANDOFF,TRANSFER_LISTED`},
  `refresh` (`true` to bypass L1/L2 cache). Android sends `region=all&signal=all&refresh=<bool>`
  (the screen shows the full feed; region/signal enums are modelled for future
  filter chips but default to `all`, which is non-breaking server-side).
- Response item fields parsed 1:1: `id, headline, summary, agentTakeaway, url,
  sourceName, isSocial, publishedAt, dateFormatted, timeAgo, leagueCode,
  leagueName, country, countryFlag, region, signalType, signalConfidence,
  signalReason, detectedPlayer{name,club,position,age,marketValue,
  contractExpires,nationality,tmSearchUrl}`. (`age` can be number or string —
  Android parses via `optStringOrNull`.)

### UI mapping to the mock

- Market Radar → `SCREENS.marketRadar`: `pageHead('LIVE MOVES · <platform>',
  'MARKET','RADAR.','THE LEAGUES YOU WATCH · IN REAL TIME')` → BRIT masthead;
  the mock's `.radar-live` pulse pill → animated LIVE pill with the move count;
  each `.radar-row` (toned tick + who + move + when) → `RadarRow` with the
  signal-tone tick (gold/blue/amber/green/red/muted) + detected-player headline
  + situation line + `timeAgo`. Loading = `BritLoader`; empty/error have
  editorial states with a retry CTA.
- Club Changes → `SCREENS.clubChanges`: `pageHead('WHO MOVED WHERE · <platform>',
  'CLUB','CHANGES.','EVERY MOVE OPENS A DOOR')` → BRIT masthead; a 3-signal strip
  (Moves / From Roster / New Today, mirroring the web page's signals) + per-move
  cards with the `GrayscalePlayerPhoto` portrait, name + position/age/value meta,
  the from → to transfer row (`BritIcons.ClubChanges` arrow), and a MOVED · date
  caption. Roster-matched moves are tappable → open the player dossier
  (`PlayerInfoScreen` by Firestore doc id), matching the web's "open player" link.
- Both screens use the shared BRIT shell (`BritTopHeader` with working back +
  2-way platform switch), the cream `PlatformColors`/`BritTokens` palette, and
  retint for YOUTH via `BritTokens.accentFor(platform)` (teal). Club Changes
  re-subscribes to `FeedEventsYouth`/`PlayersYouth` on a Youth switch
  (`flatMapLatest` on `platformManager.current`).

### Static self-review (sandbox)

- Both ViewModels extend `ViewModel` via `IMarketRadarViewModel` /
  `IClubChangesViewModel` and are registered as `viewModel<Interface> { Impl }`
  in their feature modules, which are added to `applicationModules`. Screens
  inject them with `koinViewModel()` + `platformManager` with `koinInject()` —
  identical to `ReleasesScreen`.
- Nav targets resolve: `Screens.MarketRadarScreen.route` / `ClubChangesScreen.route`
  are registered in the `HomeScreen` NavHost; the More-sheet + quick-grid route
  to them. `PlayerInfoScreen.route` nav (Club Changes "open player") matches the
  dashboard's existing `"${PlayerInfoScreen.route}/${Uri.encode(id)}"` pattern.
- Response parsing matches the web `MarketRadarItem` field names exactly
  (verified against `marketRadar.ts`). Club-change field semantics
  (`oldValue→from`, `newValue→to`, roster join by TM id, logo guard) match
  `club-change-notifications/page.tsx`.
- `when (platform)` in both screens' `platformLabel` is exhaustive over
  MEN + YOUTH (no WOMEN, no `else`). Zero `women/soccerdonna/athena` references
  in either feature package.
- Brace/paren balance verified on all new files (the single MarketRadarApiClient
  brace delta is the `"{"` string literal in the JSON-shape guard, not code).
- No existing screen touched beyond the two placeholder `composable` blocks in
  `HomeScreen.kt` (+ its import swap) and the DI aggregation list; navigation for
  every other route is unchanged.

### MUST VERIFY IN LOCAL ANDROID BUILD (FEAT-006 additions)

- `./gradlew :app:assembleDebug` compiles the new `features/marketradar/*` +
  `features/clubchanges/*` + the two DI modules + the HomeScreen wiring (no SDK
  in sandbox, so this must be confirmed locally before merge).
- Emulator: open **Market Radar** from the More sheet (and the dashboard quick
  grid) → confirm the LIVE pill + editorial rows render and that data returns
  from `https://management.mgsrfa.com/api/market-radar` (Render/Vercel cold start
  can be slow — the client uses a 90s read timeout). Verify the empty + error
  states (e.g. airplane mode) show the editorial message + retry CTA.
- Emulator: open **Club Changes** from the More sheet → confirm CLUB_CHANGE moves
  load from the SAME `FeedEvents` collection the dashboard uses, grayscale
  portraits + from → to rows render, the 3-signal counts are correct, and tapping
  a ROSTER-badged move opens the correct player dossier. Confirm the empty state
  when there are no CLUB_CHANGE events.
- Toggle Men ↔ Youth on both screens: confirm the teal retint and that Club
  Changes re-reads `FeedEventsYouth` + `PlayersYouth` (roster join still works).
- Confirm the deleted `BritPlaceholderScreen.kt` + `WarRoomScreen.kt.bak`
  removals do not break any reference (grep already shows zero usages).

## Post-review polish (2026-10-10)

Non-blocking cleanup addressing the three issues in `2026-10-10-164357-review.md`
(verdict was already APPROVED). Color/comment/visibility-logic only — no data,
VM, callable, or navigation wiring changed except the intentional hide of the
dead Tasks tab.

1. **Dead Tasks bottom tab (FEAT-004).** `ui/components/BritShell.kt` →
   `BritTabBar` now filters `BritTab.entries` to drop `TASKS` while
   `FeatureFlags.TASKS_ENABLED` is `false`, so no inert control is rendered. When
   the flag is `true` all four primary tabs show and Tasks routes normally. The
   flag value and the gating in `BritDashboardScreen`'s `when(tab)` branch
   (`BritTab.TASKS -> if (FeatureFlags.TASKS_ENABLED) …`) are UNCHANGED; the
   `when` stays exhaustive over the enum. Added one import
   (`config.FeatureFlags`). Dashboard / Players / War Room / More tabs unchanged.

2. **Orphaned `PlatformSwitcher.kt` (FEAT-004).** `features/platform/PlatformSwitcher.kt`
   was confirmed to have ZERO callers (whole-app grep for `PlatformSwitcher` and
   its private dark-navy constants `MenSwitchBg/Border/Text/IndicatorText` returns
   only its own now-deleted definition; `BritPlatformSwitch` in `BritShell.kt`
   replaced it). File deleted. No dangling references remain.

3. **Stale route doc comments (FEAT-006).** `navigation/Screens.kt` — the comment
   over `MarketRadarScreen`/`ClubChangesScreen` no longer calls them FEAT-006
   "placeholder"/"editorial placeholder" routes; it now notes Market Radar is
   backed by the `/api/market-radar` feed and Club Changes by the CLUB_CHANGE
   `FeedEvents` source. Route objects + `ScreenName` constants unchanged.

### MUST VERIFY IN LOCAL ANDROID BUILD (post-review polish)

- `./gradlew :app:assembleDebug` still compiles after deleting
  `features/platform/PlatformSwitcher.kt` and editing `BritShell.kt` /
  `Screens.kt` (no SDK in sandbox; static review only — imports resolve, braces
  balanced, no dangling `PlatformSwitcher`/`MenSwitch*` refs).
- Emulator with `TASKS_ENABLED = false` (current): confirm the bottom bar shows
  Dashboard / Players / War Room / More only (no Tasks tab) and every remaining
  tab still routes. Flip `TASKS_ENABLED = true` locally and confirm Tasks
  reappears as the 4th tab and navigates to `TasksScreen`.
