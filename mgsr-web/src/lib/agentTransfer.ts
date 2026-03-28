import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  callAgentTransferRequest,
  callAgentTransferApprove,
  callAgentTransferReject,
  callAgentTransferCancel,
} from './callables';

export interface AgentTransferRequest {
  id?: string;
  playerId?: string;
  playerName?: string;
  playerImage?: string;
  platform?: string;
  fromAgentId?: string;
  fromAgentName?: string;
  toAgentId?: string;
  toAgentName?: string;
  status?: string;
  requestedAt?: number;
  resolvedAt?: number;
  rejectionReason?: string;
}

const COLLECTION = 'AgentTransferRequests';
const STATUS_PENDING = 'pending';
const STATUS_APPROVED = 'approved';
const STATUS_REJECTED = 'rejected';

export async function requestAgentTransfer(params: {
  playerId: string;
  playerName?: string;
  playerImage?: string;
  platform: string;
  fromAgentId: string;
  fromAgentName?: string;
  toAgentId: string;
  toAgentName?: string;
}): Promise<string | null> {
  const result = await callAgentTransferRequest(params);
  if ('alreadyPending' in result) return null;
  return result.id;
}

export async function approveTransfer(
  requestId: string,
  playersCollection: string
): Promise<void> {
  // Derive platform from playersCollection name for backward compatibility
  const platform = playersCollection === 'PlayersWomen' ? 'women'
    : playersCollection === 'PlayersYouth' ? 'youth' : 'men';
  await callAgentTransferApprove({ platform, requestId });
}

export async function rejectTransfer(requestId: string): Promise<void> {
  await callAgentTransferReject({ requestId });
}

export async function cancelTransferRequest(requestId: string): Promise<void> {
  await callAgentTransferCancel({ requestId });
}

export function listenForPendingRequest(
  playerId: string,
  callback: (request: AgentTransferRequest | null) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION),
    where('playerId', '==', playerId),
    where('status', '==', STATUS_PENDING),
    limit(1)
  );

  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
    } else {
      const docSnap = snap.docs[0];
      callback({ id: docSnap.id, ...docSnap.data() } as AgentTransferRequest);
    }
  });
}

/** Listen for the most recent resolved (approved/rejected) transfer for a player. */
export function listenForResolvedTransfer(
  playerId: string,
  callback: (request: AgentTransferRequest | null) => void
): Unsubscribe {
  // Simple query: get all non-pending requests for this player.
  // Filter client-side to avoid needing a composite index on resolvedAt.
  const q = query(
    collection(db, COLLECTION),
    where('playerId', '==', playerId),
  );

  return onSnapshot(q, (snap) => {
    let latest: AgentTransferRequest | null = null;
    for (const d of snap.docs) {
      const data = d.data() as AgentTransferRequest;
      if (data.status !== STATUS_APPROVED && data.status !== STATUS_REJECTED) continue;
      if (!latest || (data.resolvedAt ?? 0) > (latest.resolvedAt ?? 0)) {
        latest = { id: d.id, ...data };
      }
    }
    callback(latest);
  }, (err) => {
    console.error('[listenForResolvedTransfer] error:', err);
    callback(null);
  });
}
