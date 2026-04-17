/**
 * Phase 6 callables — miscellaneous entity writes.
 * sharePlayerCreate, shadowTeamsSave, scoutProfileFeedbackSet,
 * birthdayWishSend, offersUpdateHistorySummary, mandateSigningCreate.
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { SHADOW_TEAMS_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { str } = require("../lib/validation");

function getDb() {
  return getFirestore();
}

// ═══════════════════════════════════════════════════════════════════════════
// sharePlayerCreate — create a SharedPlayers doc
// ═══════════════════════════════════════════════════════════════════════════

const SHARE_ALLOWED_FIELDS = new Set([
  "playerId", "player", "mandateInfo", "mandateUrl",
  "sharerPhone", "sharerName", "scoutReport", "highlights",
  "lang", "platform", "createdAt", "createdBy",
  "familyStatus", "gpsData", "includePlayerContact", "includeAgencyContact",
]);

async function sharePlayerCreate(data) {
  const db = getDb();

  const entry = {};
  for (const key of SHARE_ALLOWED_FIELDS) {
    if (key in data && data[key] !== undefined) {
      entry[key] = data[key];
    }
  }
  if (!entry.createdAt) entry.createdAt = Date.now();
  if (!entry.playerId) throw new Error("playerId is required.");

  const ref = await db.collection("SharedPlayers").add(entry);
  return { token: ref.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// sharedRequestLinkCreate — create a unique, revocable share link for requests
// ═══════════════════════════════════════════════════════════════════════════

async function sharedRequestLinkCreate(data, uid) {
  const db = getDb();
  const platform = ["men", "women", "youth"].includes(data.platform) ? data.platform : "men";
  const showClubs = data.showClubs === true;
  const recipientLabel = typeof data.recipientLabel === "string"
    ? data.recipientLabel.trim().slice(0, 100) || null
    : null;

  const entry = {
    platform,
    showClubs,
    recipientLabel,
    createdBy: uid,
    createdAt: Date.now(),
    revoked: false,
    revokedAt: null,
    viewCount: 0,
    lastViewedAt: null,
  };

  const ref = await db.collection("SharedRequestLinks").add(entry);
  return { token: ref.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// sharedRequestLinkRevoke — revoke a shared request link (only by creator)
// ═══════════════════════════════════════════════════════════════════════════

async function sharedRequestLinkRevoke(data, uid) {
  const token = str(data.token);
  if (!token) throw new Error("token is required.");

  const db = getDb();
  const docRef = db.collection("SharedRequestLinks").doc(token);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("Link not found.");
  if (snap.data().createdBy !== uid) throw new Error("Not authorized to revoke this link.");

  await docRef.update({ revoked: true, revokedAt: Date.now() });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// shadowTeamsSave — set (overwrite) a ShadowTeams doc
// ═══════════════════════════════════════════════════════════════════════════

const SHADOW_ALLOWED_FIELDS = new Set([
  "formationId", "slots", "updatedAt",
]);

async function shadowTeamsSave(data) {
  validatePlatform(data.platform);
  const accountId = str(data.accountId);
  if (!accountId) throw new Error("accountId is required.");

  const db = getDb();
  const col = SHADOW_TEAMS_COLLECTIONS[data.platform];

  const entry = {};
  for (const key of SHADOW_ALLOWED_FIELDS) {
    if (key in data && data[key] !== undefined) {
      entry[key] = data[key];
    }
  }
  if (!entry.updatedAt) entry.updatedAt = Date.now();

  await db.collection(col).doc(accountId).set(entry);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// scoutProfileFeedbackSet — merge feedback for a scout profile
// ═══════════════════════════════════════════════════════════════════════════

async function scoutProfileFeedbackSet(data) {
  const uid = str(data.uid);
  if (!uid) throw new Error("uid is required.");
  const profileId = str(data.profileId);
  if (!profileId) throw new Error("profileId is required.");
  const feedback = str(data.feedback);
  const agentId = str(data.agentId);

  const db = getDb();
  const docRef = db.collection("ScoutProfileFeedback").doc(uid);
  const snap = await docRef.get();
  const current = (snap.exists && snap.data()?.feedback) || {};
  const next = { ...current, [profileId]: { feedback, agentId } };

  await docRef.set({ feedback: next, updatedAt: Date.now() }, { merge: true });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// birthdayWishSend — mark a birthday wish as sent
// ═══════════════════════════════════════════════════════════════════════════

async function birthdayWishSend(data) {
  const year = str(data.year);
  if (!year) throw new Error("year is required.");
  const playerId = str(data.playerId);
  if (!playerId) throw new Error("playerId is required.");
  const sentBy = str(data.sentBy) || "";

  const db = getDb();
  await db.collection("BirthdayWishesSent").doc(year).set(
    { [playerId]: { sentBy, sentAt: Date.now() } },
    { merge: true }
  );
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// offersUpdateHistorySummary — update historySummary on a PlayerOffers doc
// ═══════════════════════════════════════════════════════════════════════════

async function offersUpdateHistorySummary(data) {
  const offerId = str(data.offerId);
  if (!offerId) throw new Error("offerId is required.");
  const summary = data.historySummary != null ? String(data.historySummary) : "";

  const db = getDb();
  await db.collection("PlayerOffers").doc(offerId).update({ historySummary: summary });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// mandateSigningCreate — create a MandateSigningRequests doc
// ═══════════════════════════════════════════════════════════════════════════

const MANDATE_ALLOWED_FIELDS = new Set([
  "token", "passportDetails", "effectiveDate", "expiryDate",
  "validLeagues", "agentName", "fifaLicenseId",
  "originAgentName", "originAgentIdLabel", "originAgentId",
  "agentAccountId", "playerId", "playerName",
  "createdAt", "status",
  "playerSignature", "playerSignedAt",
  "agentSignature", "agentSignedAt",
]);

async function mandateSigningCreate(data) {
  const token = str(data.token);
  if (!token) throw new Error("token is required.");

  const db = getDb();

  const entry = {};
  for (const key of MANDATE_ALLOWED_FIELDS) {
    if (key in data) {
      entry[key] = data[key];
    }
  }
  if (!entry.createdAt) entry.createdAt = Date.now();
  if (!entry.status) entry.status = "pending";

  await db.collection("MandateSigningRequests").doc(token).set(entry);
  return { success: true };
}

module.exports = {
  sharePlayerCreate,
  sharedRequestLinkCreate,
  sharedRequestLinkRevoke,
  shadowTeamsSave,
  scoutProfileFeedbackSet,
  birthdayWishSend,
  offersUpdateHistorySummary,
  mandateSigningCreate,
};
