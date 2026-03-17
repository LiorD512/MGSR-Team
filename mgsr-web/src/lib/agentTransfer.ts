import {
  collection,
  query,
  where,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';

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
  // Check for existing pending request on this player
  const existingSnap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('playerId', '==', params.playerId),
      where('status', '==', STATUS_PENDING),
      limit(1)
    )
  );
  if (!existingSnap.empty) return null;

  const request: AgentTransferRequest = {
    ...params,
    status: STATUS_PENDING,
    requestedAt: Date.now(),
  };

  const ref = await addDoc(collection(db, COLLECTION), request);
  return ref.id;
}

export async function approveTransfer(
  requestId: string,
  playersCollection: string
): Promise<void> {
  const requestRef = doc(db, COLLECTION, requestId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(requestRef);
    if (!snap.exists()) return;
    const data = snap.data() as AgentTransferRequest;

    transaction.update(requestRef, {
      status: STATUS_APPROVED,
      resolvedAt: Date.now(),
    });

    if (data.playerId) {
      const playerRef = doc(db, playersCollection, data.playerId);
      const playerSnap = await transaction.get(playerRef);
      const playerData = playerSnap.data() || {};

      const updates: Record<string, unknown> = {
        agentInChargeId: data.toAgentId,
        agentInChargeName: data.toAgentName,
        agentTransferredAt: Date.now(),
      };

      // Preserve original agent info on first transfer
      if (!playerData.originalAgentId) {
        updates.originalAgentId = playerData.agentInChargeId ?? null;
        updates.originalAgentName = playerData.agentInChargeName ?? null;
      }

      transaction.update(playerRef, updates);
    }
  });
}

export async function rejectTransfer(requestId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, requestId), {
    status: STATUS_REJECTED,
    resolvedAt: Date.now(),
  });
}

export async function cancelTransferRequest(requestId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, requestId));
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
