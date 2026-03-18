# Agent Transfer — Switch Agent in Charge

## Overview

Allow any MGSR user to **claim responsibility** for a player currently managed by another agent. The requesting agent can only assign **themselves** — not a third party. The current agent in charge must **approve** the transfer before it takes effect.

---

## Approval Mechanism — Options

### Option A: Push Notification + In-App Approval Panel ⭐ RECOMMENDED

**How it works:**
1. Agent B opens Player X's info page (currently managed by Agent A)
2. Agent B taps "Request Agent Transfer" → assigns themselves
3. A new `AgentTransferRequest` document is created in Firestore
4. Cloud Function triggers → sends **push notification** to Agent A (via FCM tokens)
5. Agent A taps the notification → opens the player info page with a **pending transfer banner**
6. Agent A can also see all pending requests in a **dedicated "Transfer Requests" section** inside the Notifications/Activity area
7. Agent A approves → Cloud Function updates the player's `agentInChargeId` / `agentInChargeName` and notifies Agent B
8. Agent A rejects → Agent B is notified of the rejection

**Pros:**
- Immediate alerting via push (even when app is closed)
- Persistent visibility via in-app banner on the player page
- Centralized view of all pending requests
- Consistent with existing notification patterns (task assignment, mandate expiry)

**Cons:**
- Requires a new Cloud Function for the approval workflow

---

### Option B: In-App Only (No Push)

**How it works:**
- Same as Option A, but no push notification
- Agent A sees a badge/counter on their notification bell (web) or activity tab (Android)
- They must open the app to discover pending requests

**Pros:**
- Simpler implementation (no new Cloud Function)

**Cons:**
- Easy to miss — Agent A might not open the app for days
- Bad UX for time-sensitive transfers

---

### Option C: Auto-Approve After Timeout

**How it works:**
- Same as Option A, but if the current agent doesn't respond within X days (e.g. 7 days), the transfer is auto-approved

**Pros:**
- Prevents stale requests blocking progress
- Good for inactive accounts

**Cons:**
- Could surprise the original agent
- Adds complexity to the Cloud Function (scheduled job)

---

## Recommendation

**Option A** is the cleanest fit for MGSR's existing architecture:
- You already have FCM push notifications for tasks, mandates, and market changes
- You already have `sendToAllTokens()` in Cloud Functions
- The notification bell on web + Android notification drawer provide discoverability
- Adding a banner on the player info page makes it impossible to miss when viewing the player

Option C (auto-approve after timeout) can be added later as an enhancement.

---

## Data Model

### New Firestore Collection: `AgentTransferRequests`

```
AgentTransferRequests/{requestId}
├── playerId: string              // Player document ID (or tmProfile for Men)
├── playerName: string            // Cached for display
├── playerImage: string?          // Cached for display
├── platform: string              // "MEN" | "WOMEN" | "YOUTH"
├── fromAgentId: string           // Current agent (needs to approve)
├── fromAgentName: string         // Cached
├── toAgentId: string             // Requesting agent (always current user)
├── toAgentName: string           // Cached
├── status: string                // "pending" | "approved" | "rejected"
├── requestedAt: long             // Timestamp
├── resolvedAt: long?             // Timestamp when approved/rejected
├── rejectionReason: string?      // Optional reason if rejected
```

### Player Document Updates (on approval)

```
Players/{id}
├── agentInChargeId:   toAgentId      // Swapped
├── agentInChargeName: toAgentName    // Swapped
```

### Account Document (existing — no changes needed)

Already stores `fcmToken` and `fcmTokens[]` — used to target push notifications.

---

## Architecture & Flow

```
┌─────────────┐        ┌──────────────────┐        ┌─────────────┐
│  Agent B     │        │    Firestore     │        │  Agent A     │
│  (Requester) │        │                  │        │  (Current)   │
└──────┬───────┘        └────────┬─────────┘        └──────┬───────┘
       │                         │                          │
       │  1. "Request Transfer"  │                          │
       │  ─────────────────────► │                          │
       │  Create AgentTransfer   │                          │
       │  Request doc            │                          │
       │                         │                          │
       │                         │  2. Cloud Function       │
       │                         │  onTransferRequest       │
       │                         │  ──────────────────────► │
       │                         │  Push notification       │
       │                         │                          │
       │                         │  3. Agent A opens app    │
       │                         │  ◄────────────────────── │
       │                         │  Sees banner on player   │
       │                         │  info page               │
       │                         │                          │
       │                         │  4. Agent A approves     │
       │                         │  ◄────────────────────── │
       │                         │  Update request status   │
       │                         │                          │
       │                         │  5. Cloud Function       │
       │                         │  onTransferApproved      │
       │  ◄───────────────────── │  Update player doc       │
       │  Push: "Transfer        │  Notify Agent B          │
       │  approved!"             │                          │
```

---

## Implementation Plan

### Phase 1: Data Layer

1. **Firestore collection** — Create `AgentTransferRequests` (no schema migration needed — Firestore is schemaless)

2. **Android model** — New data class:
   ```kotlin
   // features/players/playerinfo/agenttransfer/AgentTransferRequest.kt
   data class AgentTransferRequest(
       @DocumentId val id: String? = null,
       val playerId: String? = null,
       val playerName: String? = null,
       val playerImage: String? = null,
       val platform: String? = null,
       val fromAgentId: String? = null,
       val fromAgentName: String? = null,
       val toAgentId: String? = null,
       val toAgentName: String? = null,
       val status: String? = "pending",
       val requestedAt: Long? = null,
       val resolvedAt: Long? = null,
       val rejectionReason: String? = null
   )
   ```

3. **Web interface** — TypeScript type in `mgsr-web/src/lib/`:
   ```typescript
   interface AgentTransferRequest {
     id: string;
     playerId: string;
     playerName: string;
     playerImage?: string;
     platform: string;
     fromAgentId: string;
     fromAgentName: string;
     toAgentId: string;
     toAgentName: string;
     status: 'pending' | 'approved' | 'rejected';
     requestedAt: number;
     resolvedAt?: number;
     rejectionReason?: string;
   }
   ```

### Phase 2: Repository / Service Layer

4. **Android Repository** — `AgentTransferRepository.kt`:
   - `requestTransfer(player, currentUser)` → Creates Firestore doc
   - `approveTransfer(requestId)` → Updates status + player doc (transaction)
   - `rejectTransfer(requestId, reason?)` → Updates status
   - `getPendingRequestsForAgent(agentId)` → Query pending requests where `fromAgentId == agentId`
   - `getPendingRequestForPlayer(playerId)` → Check if a pending request exists
   - `cancelTransferRequest(requestId)` → Allows requester to cancel

5. **Web service** — `mgsr-web/src/lib/agentTransfer.ts`:
   - Same functions using Firebase Web SDK

### Phase 3: Cloud Functions

6. **`onAgentTransferRequest`** — Triggered on `AgentTransferRequests/{id}` create:
   - Look up `fromAgentId`'s FCM tokens
   - Send push notification: "🔄 {toAgentName} wants to take over {playerName}"
   - Notification type: `TYPE_AGENT_TRANSFER_REQUEST`

7. **`onAgentTransferResolved`** — Triggered on `AgentTransferRequests/{id}` update (status change):
   - If approved: Update player's `agentInChargeId` / `agentInChargeName` → notify requester
   - If rejected: Notify requester with optional reason
   - Notification type: `TYPE_AGENT_TRANSFER_APPROVED` / `TYPE_AGENT_TRANSFER_REJECTED`

### Phase 4: Android UI

8. **PlayerInfoScreen changes:**
   - **"Request Transfer" button** — Visible when `agentInChargeId != currentUserId` and no pending request exists
   - **"Pending Transfer" banner** — Visible when a pending request exists (for both agents)
   - **Approve/Reject actions** — Visible only to the current agent in charge

9. **Notification handling:**
   - Add `TYPE_AGENT_TRANSFER_REQUEST`, `TYPE_AGENT_TRANSFER_APPROVED`, `TYPE_AGENT_TRANSFER_REJECTED` to `MgsrFirebaseMessagingService`
   - Deep link to player info page on notification tap

### Phase 5: Web UI

10. **Player detail page changes:**
    - Same logic as Android: button / banner / approve-reject
    - NotificationBell shows transfer requests

### Phase 6: Firestore Rules

11. **Security rules** for `AgentTransferRequests`:
    ```
    match /AgentTransferRequests/{requestId} {
      allow create: if request.auth != null 
        && request.resource.data.toAgentId == request.auth.uid;
      allow update: if request.auth != null 
        && (resource.data.fromAgentId == request.auth.uid 
            || resource.data.toAgentId == request.auth.uid);
      allow read: if request.auth != null;
    }
    ```

---

## UI Locations

### Android (PlayerInfoScreen.kt)

**In the Hero Card**, below the existing "Added by: {agentName}" text:

- **If current user IS the agent in charge** → No button (you already manage this player)
- **If current user is NOT the agent in charge AND no pending request** → Show "🙋 Request Agent Transfer" button
- **If a pending request exists (current user is requester)** → Show "⏳ Transfer Requested — Waiting for {fromAgentName}" banner with Cancel option
- **If a pending request exists (current user is the approver)** → Show "📨 {toAgentName} requests to manage this player" banner with Approve / Reject buttons

### Web (players/[id]/page.tsx)

Same logic, styled as an alert/banner card above the player details or within the header section.

---

## Notification Texts

### Push to Current Agent (transfer requested)
- **EN:** "Agent Transfer Request — {toAgentName} wants to become the agent in charge of {playerName}"
- **HE:** "בקשת העברת סוכן — {toAgentName} מבקש להיות הסוכן האחראי על {playerName}"

### Push to Requester (approved)
- **EN:** "Transfer Approved — You are now the agent in charge of {playerName}"
- **HE:** "העברה אושרה — אתה כעת הסוכן האחראי על {playerName}"

### Push to Requester (rejected)
- **EN:** "Transfer Rejected — {fromAgentName} declined your request for {playerName}"
- **HE:** "העברה נדחתה — {fromAgentName} דחה את בקשתך עבור {playerName}"

---

## Edge Cases

1. **Player has no agent** (`agentInChargeId == null`) → Skip approval, directly assign self
2. **Current agent requests transfer to themselves** → Block (no-op)
3. **Multiple pending requests for same player** → Only one pending request allowed per player at a time
4. **Agent deleted their account** → Auto-approve any pending transfers (or timeout)
5. **Platform context** → Requests are scoped to the platform (MEN only for now)
6. **Agent cancels request** → Requester can cancel before approval
7. **Offline handling** → Firestore offline cache ensures requests sync when back online

---

## Files To Create / Modify

### New Files
| File | Description |
|------|-------------|
| `app/.../agenttransfer/AgentTransferRequest.kt` | Data model |
| `app/.../agenttransfer/AgentTransferRepository.kt` | Firestore operations |
| `mgsr-web/src/lib/agentTransfer.ts` | Web service layer |
| `mgsr-web/src/components/AgentTransferBanner.tsx` | Web UI component |

### Modified Files
| File | Change |
|------|--------|
| `app/.../PlayerInfoScreen.kt` | Add transfer button + banner |
| `app/.../PlayerInfoViewModel.kt` | Add transfer state + actions |
| `app/.../MgsrFirebaseMessagingService.kt` | Handle new notification types |
| `mgsr-web/src/app/players/[id]/page.tsx` | Add transfer UI |
| `functions/index.js` | Add transfer Cloud Functions |
| `firestore.rules` | Add AgentTransferRequests rules |

---

## Mock UIs

See companion HTML files:
- `docs/agent-transfer-mock-android.html` — Android Compose-style mock
- `docs/agent-transfer-mock-web.html` — Web (Next.js) mock
