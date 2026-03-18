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
  orderBy,
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
  // Check for existing pending request on this specific player only
  const existingSnap = await getDocs(
    query(
      collection(db, COLLECTION),
      where('playerId', '==', params.playerId),
      where('status', '==', STATUS_PENDING),
      limit(1)
    )
  ).catch(() => null);
  if (existingSnap && !existingSnap.empty) return null;

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
    // All reads MUST come before any writes in Firestore transactions
    const snap = await transaction.get(requestRef);
    if (!snap.exists()) return;
    const data = snap.data() as AgentTransferRequest;

    let playerSnap = null;
    let playerRef = null;
    if (data.playerId) {
      playerRef = doc(db, playersCollection, data.playerId);
      playerSnap = await transaction.get(playerRef);
    }

    // Now do all writes
    transaction.update(requestRef, {
      status: STATUS_APPROVED,
      resolvedAt: Date.now(),
    });

    if (playerRef && playerSnap) {
      const playerData = playerSnap.data() || {};

      const updates: Record<string, unknown> = {
        agentInChargeId: data.toAgentId,
        agentInChargeName: data.toAgentName,
        agentTransferredAt: Date.now(),
      };

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

/** Listen for the most recent resolved (approved/rejected) transfer for a player. */
export function listenForResolvedTransfer(
  playerId: string,
  callback: (request: AgentTransferRequest | null) => void
): Unsubscribe {
  const qApproved = query(
    collection(db, COLLECTION),
    where('playerId', '==', playerId),
    where('status', '==', STATUS_APPROVED),
    orderBy('resolvedAt', 'desc'),
    limit(1)
  );
  const qRejected = query(
    collection(db, COLLECTION),
    where('playerId', '==', playerId),
    where('status', '==', STATUS_REJECTED),
    orderBy('resolvedAt', 'desc'),
    limit(1)
  );

  let latest: AgentTransferRequest | null = null;
  let approvedResult: AgentTransferRequest | null = null;
  let rejectedResult: AgentTransferRequest | null = null;
  let gotApproved = false;
  let gotRejected = false;

  function emit() {
    if (!gotApproved || !gotRejected) return;
    const a = approvedResult;
    const r = rejectedResult;
    if (a && r) {
      latest = (a.resolvedAt ?? 0) >= (r.resolvedAt ?? 0) ? a : r;
    } else {
      latest = a || r;
    }
    callback(latest);
  }

  const unsub1 = onSnapshot(qApproved, (snap) => {
    approvedResult = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as AgentTransferRequest;
    gotApproved = true;
    emit();
  });

  const unsub2 = onSnapshot(qRejected, (snap) => {
    rejectedResult = snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() } as AgentTransferRequest;
    gotRejected = true;
    emit();
  });

  return () => { unsub1(); unsub2(); };
}
