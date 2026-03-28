/**
 * Shared callables: Portfolio operations.
 * Single source for upsert (add/overwrite) and delete.
 * Portfolio is web-only but the callable can be used by any client.
 */
const { getFirestore } = require("firebase-admin/firestore");
const { PORTFOLIO_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { str } = require("../lib/validation");

function getDb() {
  return getFirestore();
}

// Player ID key differs by platform
function playerIdKey(platform) {
  if (platform === "women") return "playerWomenId";
  if (platform === "youth") return "playerYouthId";
  return "playerId";
}

// ── Allowed top-level fields ─────────────────────────────────────────────

const ALLOWED_FIELDS = new Set([
  "agentId", "playerId", "playerWomenId", "playerYouthId",
  "player", "mandateInfo", "mandateUrl",
  "scoutReport", "highlights", "lang", "createdAt",
  "targetClubName", "targetClubPosition",
]);

// ═══════════════════════════════════════════════════════════════════════════
// portfolioUpsert — add or overwrite a portfolio entry
// ═══════════════════════════════════════════════════════════════════════════

async function portfolioUpsert(data) {
  validatePlatform(data.platform);
  const platform = data.platform;
  const agentId = str(data.agentId);
  if (!agentId) throw new Error("agentId is required.");
  const idKey = playerIdKey(platform);
  const pidValue = str(data[idKey]);
  if (!pidValue) throw new Error(`${idKey} is required.`);
  const lang = str(data.lang) || "en";

  const db = getDb();
  const col = PORTFOLIO_COLLECTIONS[platform];

  // Build entry from allowed fields
  const entry = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in data && data[key] !== undefined) {
      entry[key] = data[key];
    }
  }
  // Ensure createdAt
  if (!entry.createdAt) {
    entry.createdAt = Date.now();
  }

  // Check for existing entry by (agentId, playerIdKey, lang)
  const snap = await db.collection(col)
    .where("agentId", "==", agentId)
    .where(idKey, "==", pidValue)
    .where("lang", "==", lang)
    .limit(1)
    .get();

  if (!snap.empty) {
    // Overwrite existing
    await snap.docs[0].ref.set(entry);
    return { status: "updated", id: snap.docs[0].id };
  } else {
    // Create new
    const ref = await db.collection(col).add(entry);
    return { status: "created", id: ref.id };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// portfolioDelete — delete a portfolio entry by doc ID
// ═══════════════════════════════════════════════════════════════════════════

async function portfolioDelete(data) {
  validatePlatform(data.platform);
  const docId = str(data.documentId);
  if (!docId) throw new Error("documentId is required.");

  const db = getDb();
  const col = PORTFOLIO_COLLECTIONS[data.platform];
  await db.collection(col).doc(docId).delete();

  return { success: true };
}

module.exports = { portfolioUpsert, portfolioDelete };
