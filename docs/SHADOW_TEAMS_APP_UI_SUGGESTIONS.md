# Shadow Teams — App UI Suggestions (View-Only)

View-only implementation: browse all agents' shadow teams, tap a player → PlayerInfoScreen.

---

## Option A: Dedicated Screen + Quick Action Chip (Recommended)

**Where:** New `ShadowTeamsScreen` + chip in `QuickActionsRow` (like Shortlist, Contract Finisher).

**Pros:**
- Full-screen pitch = best UX for viewing formations
- Consistent with Releases, Contract Finisher, Returnees
- Easy to find, one tap from dashboard

**Layout:**
```
┌─────────────────────────────────┐
│  קבוצת צללים                    │
│  צפה בצוותים של כל הסוכנים       │
├─────────────────────────────────┤
│  [ליאור] [משה] [דנה]  ← tabs    │
├─────────────────────────────────┤
│                                 │
│     ┌─────────────────────┐     │
│     │                     │     │
│     │   Pitch + circles   │     │
│     │   (tap → player)    │     │
│     │                     │     │
│     └─────────────────────┘     │
│                                 │
│  4-3-3 (read-only label)        │
└─────────────────────────────────┘
```

**Implementation:**
- Add `Screens.ShadowTeamsScreen` route
- Add `QuickActionChip` with icon (e.g. `Icons.Default.SportsSoccer` or `Icons.Default.Groups`)
- Screen: agent tabs (horizontal scroll) → pitch with overlay circles → tap circle → `navController.navigate("${Screens.PlayerInfoScreen.route}/${playerId}")`
- No formation selector, no edit/remove — read-only

---

## Option B: Dashboard Section (Collapsible Card)

**Where:** New collapsible section in `DashboardScreen` LazyColumn, below Team Overview or Agent Tasks.

**Pros:**
- No extra navigation — see at a glance
- Fits “team overview” mental model

**Cons:**
- Pitch will be small on mobile
- Less space for 11 players + names

**Layout:**
```
┌─────────────────────────────────┐
│  קבוצת צללים              [▼]   │
│  ┌───────────────────────────┐  │
│  │ [ליאור] [משה] [דנה]       │  │
│  │ ┌─────────────────────┐   │  │
│  │ │  Mini pitch + dots   │   │  │
│  │ └─────────────────────┘   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

**Implementation:**
- `ShadowTeamsDashboardCard` composable
- Collapsed: header + agent tabs
- Expanded: pitch (smaller aspect ratio) + circles
- Tap circle → navigate to PlayerInfo

---

## Option C: Bottom Sheet (Slide-Up)

**Where:** FAB or menu item opens a bottom sheet with Shadow Teams.

**Pros:**
- Doesn’t add to main nav
- Quick peek without leaving dashboard

**Cons:**
- Sheet height limits pitch size
- Less discoverable

---

## Option D: Drawer / Side Menu Item

**Where:** Add “Shadow Teams” to the app drawer (if one exists) or to a “More” menu.

**Pros:**
- Keeps main dashboard clean

**Cons:**
- Extra tap to open
- Need to verify current nav structure (no drawer found in codebase)

---

## Recommended: Option A

**Reasons:**
1. Matches existing patterns (Releases, Contract Finisher, Returnees)
2. Full-screen pitch for clear view of formations
3. Single tap from dashboard
4. Room for agent tabs and formation label

---

## Technical Notes

### Data
- **Firebase:** `ShadowTeams` collection, doc per `accountId`
- **Fields:** `formationId`, `slots: [{ starter: { id, fullName, profileImage } | null }]`
- **Accounts:** from `Accounts` collection (same as web)

### Navigation to PlayerInfo
- **Android:** `PlayerInfoScreen` expects `tmProfile` (Transfermarkt URL) via `whereEqualTo("tmProfile", playerId)`
- **Shadow Teams:** store Firebase player doc `id`
- **Fix:** Either store `tmProfile` in shadow slots, or resolve doc ID → tmProfile before navigation (fetch player by doc ID, then navigate with `tmProfile`)

### Pitch UI
- **Option 1:** Custom Canvas/Compose drawing (pitch lines + circles)
- **Option 2:** WebView with existing web pitch (heavy)
- **Option 3:** Simple overlay: green `Box` + white lines (Canvas) + `Box` circles at `(x%, y%)` from formation definitions

### Formation Definitions
- Reuse positions from web: `mgsr-web/src/lib/shadowTeamFormations.ts` (port to Kotlin or share via JSON)

---

## Quick Action Chip Placement

Add after Requests (or between Contacts and Requests):

```kotlin
item {
    QuickActionChip(
        icon = Icons.Default.SportsSoccer,  // or Icons.Default.Groups
        label = stringResource(R.string.quick_action_shadow_teams),
        color = HomeTealAccent,
        onClick = {
            navController.navigate(Screens.ShadowTeamsScreen.route) {
                launchSingleTop = true
            }
        }
    )
}
```

---

## String Resources

```xml
<string name="quick_action_shadow_teams">קבוצת צללים</string>
<string name="shadow_teams_title">קבוצת צללים</string>
<string name="shadow_teams_subtitle">צפה בצוותים של כל הסוכנים</string>
```
