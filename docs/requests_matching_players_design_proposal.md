# Matching Players from Roster — Design Proposal

## Overview

Add the ability to see **roster players that match a request** directly on the Requests screen. This helps agents quickly identify candidates when a club asks for a specific position (and optionally age, salary, transfer fee).

---

## Matching Logic (Summary)

| Request Field | Player Field | Match Rule |
|---------------|--------------|------------|
| **position** | `positions` (list) | Player must have request position in their positions |
| **minAge / maxAge** | `age` (string) | If request has age range, player age must fall within |
| **ageDoesntMatter** | — | Skip age check |
| **salaryRange** | `marketValue` | Map market value (e.g. €500K) to salary bands (">5", "6-10", etc.) |
| **transferFee** | `contractExpired` + `marketValue` | Free/Free loan → contract expired; amounts → market value in range |

---

## Option A: Expandable Card (Recommended)

**Tap the request card** to expand it and reveal matching players inline.

```
┌─────────────────────────────────────────────────────────────┐
│  CM — Center Midfielder                              (3)     │
├─────────────────────────────────────────────────────────────┤
│  Israel                                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ▎ [logo] Maccabi Tel Aviv                              │  │
│  │     Israel                                             │  │
│  │     Via Yoav Ben David • Jan 12                        │  │
│  │     Age: 22-28 • Salary: 6-10 • Fee: Free/Free loan    │  │
│  │     [WhatsApp]                              [Delete]   │  │
│  │                                                        │  │
│  │     ┌─────────────────────────────────────────────┐    │  │
│  │     │ 👥 3 matching players              [▼]       │    │  │  ← Tap to expand
│  │     └─────────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ▎ [logo] Maccabi Tel Aviv                              │  │
│  │     Israel                                             │  │
│  │     ...                                                │  │
│  │     ┌─────────────────────────────────────────────┐    │  │
│  │     │ 👥 3 matching players              [▲]       │    │  │  ← Expanded
│  │     ├─────────────────────────────────────────────┤    │  │
│  │     │ [img] David Cohen    24 • CM • €800K    [→] │    │  │
│  │     │ [img] Yossi Levi     26 • CM • €600K    [→] │    │  │
│  │     │ [img] Amit Shalom    27 • CM • €750K    [→] │    │  │
│  │     └─────────────────────────────────────────────┘    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Pros:** Context stays on screen, no navigation. Quick scan.  
**Cons:** List can get long if many matches; may need max visible (e.g. 5) + "See all" link.

---

## Option B: Match Count Chip + Bottom Sheet

**Show a chip** on the card (e.g. "3 matches"). Tap chip or a "Match" button to open a bottom sheet with the full list.

```
┌─────────────────────────────────────────────────────────────┐
│  ▎ [logo] Maccabi Tel Aviv                                   │
│      Israel                                                  │
│      Via Yoav Ben David • Jan 12                             │
│      Age: 22-28 • Salary: 6-10 • Fee: Free/Free loan         │
│                                                              │
│      [3 matches]  [WhatsApp]                      [Delete]   │  ← "3 matches" chip
└─────────────────────────────────────────────────────────────┘

Tap "3 matches" →

┌─────────────────────────────────────────────────────────────┐
│  Matching players for Maccabi Tel Aviv (CM)                  │
│  Age 22-28 • Salary 6-10 • Fee Free/Free loan                │
├─────────────────────────────────────────────────────────────┤
│  [img] David Cohen    24 • CM • €800K                   [→]  │
│  [img] Yossi Levi     26 • CM • €600K                   [→]  │
│  [img] Amit Shalom    27 • CM • €750K                   [→]  │
│                                                              │
│  [Cancel]                                    [Add to shortlist]│
└─────────────────────────────────────────────────────────────┘
```

**Pros:** Keeps cards compact; bottom sheet gives more room for player list and actions.  
**Cons:** Extra tap; leaves request context when sheet opens.

---

## Option C: Inline Compact Row

**Always show** a single horizontal row of matching player avatars + count. Tap to expand or navigate.

```
┌─────────────────────────────────────────────────────────────┐
│  ▎ [logo] Maccabi Tel Aviv                                   │
│      Israel                                                  │
│      Via Yoav Ben David • Jan 12                             │
│      Age: 22-28 • Salary: 6-10                               │
│                                                              │
│      [○][○][○] 3 matches                            [→]      │  ← Avatar stack + tap
│      [WhatsApp]                                    [Delete]  │
└─────────────────────────────────────────────────────────────┘
```

**Pros:** Always visible, minimal height.  
**Cons:** Avatars may be too small to be useful; still need tap for details.

---

## Recommended: Option A (Expandable) with "See all" fallback

1. **Collapsed:** Show a row: `👥 N matching players` with chevron. Tap to expand.
2. **Expanded:** Show up to 5 matching players as compact rows (avatar, name, age, position, market value). Each row taps through to Player Info.
3. **If N > 5:** Show "See all N matches" that opens Option B's bottom sheet (or navigates to Players screen with filters pre-applied).

---

## Player Match Row (Compact)

Reusable in expandable section or bottom sheet:

```
┌─────────────────────────────────────────────────────────────┐
│  [36dp]  David Cohen    24 • CM • €800K                 [→]  │
│   img    name           age • pos • value              nav   │
└─────────────────────────────────────────────────────────────┘
```

- **Avatar:** 36dp, rounded
- **Name:** bold, 14sp
- **Meta:** age • position • market value — 11sp, secondary
- **Tap:** Navigate to Player Info screen

---

## Data Flow

1. **ViewModel** gets `requests` and `players` (roster).
2. For each request, compute `matchingPlayers: List<Player>` using position + optional age/salary/transferFee.
3. Expose `Map<RequestId, List<Player>>` or attach `matchingPlayers` to each request in UI state.
4. **RequestCard** receives `matchingPlayers` (or count) and renders expandable section.

---

## Implementation Checklist

- [ ] Add matching logic (position, age, salary, transfer fee) in ViewModel or dedicated `RequestMatcher`
- [ ] Fetch roster (players) in RequestsViewModel or inject IPlayersRepository
- [ ] Add `matchingPlayers` / `matchCount` to UI state per request
- [ ] Add expandable section to RequestCard (Option A)
- [ ] Add compact `MatchingPlayerRow` composable
- [ ] Wire tap → Player Info navigation
- [ ] Optional: "See all" bottom sheet when match count > 5
