/**
 * Shared callable: Player Offers CRUD.
 * Single source — called by both Android & Web.
 * Writes FeedEvent on create (Android had this, web was missing it).
 */
const { getFirestore } = require("firebase-admin/firestore");
const { FEED_EVENTS_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { validateOfferCreate, requireId, str } = require("../lib/validation");
const { feedEventDocId } = require("../lib/utils");

const COLLECTION = "PlayerOffers";

function getDb() {
  return getFirestore();
}

async function offersCreate(data) {
  validatePlatform(data.platform);
  const payload = validateOfferCreate(data);
  const db = getDb();
  const ref = await db.collection(COLLECTION).add(payload);

  // Write a FeedEvent — this was only on Android before, now unified
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const now = Date.now();
    const docId = feedEventDocId("PLAYER_OFFERED_TO_CLUB", payload.playerTmProfile, now);
    await db.collection(feedCol).doc(docId).set({
      type: "PLAYER_OFFERED_TO_CLUB",
      playerTmProfile: payload.playerTmProfile,
      playerName: payload.playerName,
      playerImage: payload.playerImage,
      newValue: payload.clubName,
      extraInfo: payload.clubFeedback || null,
      timestamp: now,
      agentName: payload.markedByAgentName,
    });
  } catch (err) {
    // Don't fail the offer creation if feed event write fails
    console.warn("[offersCreate] FeedEvent write failed:", err.message);
  }

  return { id: ref.id };
}

async function offersUpdateFeedback(data) {
  const offerId = requireId(data.offerId, "offerId");
  await getDb().collection(COLLECTION).doc(offerId).update({
    clubFeedback: str(data.clubFeedback),
  });
  return { success: true };
}

async function offersDelete(data) {
  const offerId = requireId(data.offerId, "offerId");
  await getDb().collection(COLLECTION).doc(offerId).delete();
  return { success: true };
}

module.exports = { offersCreate, offersUpdateFeedback, offersDelete };
