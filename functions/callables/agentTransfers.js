/**
 * Shared callable: Agent Transfer requests.
 * Single source — called by both Android & Web.
 * Approval uses a Firestore transaction (read-before-write).
 */
const { getFirestore } = require("firebase-admin/firestore");
const { PLAYERS_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { validateTransferRequest, requireId, str } = require("../lib/validation");

const COLLECTION = "AgentTransferRequests";
const STATUS_PENDING = "pending";
const STATUS_APPROVED = "approved";
const STATUS_REJECTED = "rejected";

function getDb() {
  return getFirestore();
}

async function agentTransferRequest(data) {
  validatePlatform(data.platform);
  const payload = validateTransferRequest(data);
  const db = getDb();

  // Check for existing pending request on this player
  const existing = await db
    .collection(COLLECTION)
    .where("playerId", "==", payload.playerId)
    .where("status", "==", STATUS_PENDING)
    .limit(1)
    .get();

  if (!existing.empty) {
    return { alreadyPending: true };
  }

  const ref = await db.collection(COLLECTION).add(payload);
  return { id: ref.id };
}

async function agentTransferApprove(data) {
  validatePlatform(data.platform);
  const requestId = requireId(data.requestId, "requestId");
  const db = getDb();
  const playersCol = PLAYERS_COLLECTIONS[data.platform];

  await db.runTransaction(async (tx) => {
    // All reads first
    const requestRef = db.collection(COLLECTION).doc(requestId);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) throw new Error("Transfer request not found.");

    const reqData = requestSnap.data();

    let playerSnap = null;
    let playerRef = null;
    if (reqData.playerId) {
      playerRef = db.collection(playersCol).doc(reqData.playerId);
      playerSnap = await tx.get(playerRef);
    }

    // All writes after reads
    tx.update(requestRef, {
      status: STATUS_APPROVED,
      resolvedAt: Date.now(),
    });

    if (playerRef && playerSnap && playerSnap.exists) {
      const playerData = playerSnap.data() || {};
      const updates = {
        agentInChargeId: reqData.toAgentId,
        agentInChargeName: reqData.toAgentName,
        agentTransferredAt: Date.now(),
      };
      if (!playerData.originalAgentId) {
        updates.originalAgentId = playerData.agentInChargeId || null;
        updates.originalAgentName = playerData.agentInChargeName || null;
      }
      tx.update(playerRef, updates);
    }
  });

  return { success: true };
}

async function agentTransferReject(data) {
  const requestId = requireId(data.requestId, "requestId");
  const updates = {
    status: STATUS_REJECTED,
    resolvedAt: Date.now(),
  };
  if (data.rejectionReason) {
    updates.rejectionReason = str(data.rejectionReason);
  }
  await getDb().collection(COLLECTION).doc(requestId).update(updates);
  return { success: true };
}

async function agentTransferCancel(data) {
  const requestId = requireId(data.requestId, "requestId");
  await getDb().collection(COLLECTION).doc(requestId).delete();
  return { success: true };
}

module.exports = { agentTransferRequest, agentTransferApprove, agentTransferReject, agentTransferCancel };
