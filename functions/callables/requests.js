/**
 * Shared callable: Club Requests CRUD.
 * Single source for create, update, delete — called by both Android & Web.
 * Writes FeedEvents on create and delete (both platforms had this, now unified).
 * On delete, stamps associated PlayerOffers with deletion status.
 */
const { getFirestore } = require("firebase-admin/firestore");
const { CLUB_REQUESTS_COLLECTIONS, FEED_EVENTS_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { validateRequestCreate, validateRequestUpdate, requireId, str } = require("../lib/validation");
const { feedEventDocId } = require("../lib/utils");

const OFFERS_COLLECTION = "PlayerOffers";

function getDb() {
  return getFirestore();
}

/**
 * Create a new club request.
 * Also writes a FeedEvent.
 */
async function requestsCreate(data) {
  validatePlatform(data.platform);
  const payload = validateRequestCreate(data);
  const db = getDb();
  const col = CLUB_REQUESTS_COLLECTIONS[data.platform];
  const ref = await db.collection(col).add(payload);

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const now = Date.now();
    // Include position so same-club requests with different positions each get their own feed event
    const profileKey = (payload.clubTmProfile || ref.id) + "_" + (payload.position || "");
    const docId = feedEventDocId("REQUEST_ADDED", profileKey, now);
    await db.collection(feedCol).doc(docId).set({
      type: "REQUEST_ADDED",
      playerName: payload.clubName,
      playerImage: payload.clubLogo || null,
      playerTmProfile: payload.clubTmProfile || null,
      newValue: payload.position,
      timestamp: now,
      agentName: payload.createdByAgent,
    });
  } catch (err) {
    console.warn("[requestsCreate] FeedEvent write failed:", err.message);
  }

  return { id: ref.id };
}

/**
 * Update an existing club request.
 */
async function requestsUpdate(data) {
  validatePlatform(data.platform);
  const requestId = requireId(data.requestId, "requestId");
  const updates = validateRequestUpdate(data);
  const col = CLUB_REQUESTS_COLLECTIONS[data.platform];
  await getDb().collection(col).doc(requestId).update(updates);
  return { success: true };
}

/**
 * Delete a club request.
 * Also stamps linked PlayerOffers with deletion status+ snapshot, writes FeedEvent.
 */
async function requestsDelete(data) {
  validatePlatform(data.platform);
  const requestId = requireId(data.requestId, "requestId");
  const db = getDb();
  const col = CLUB_REQUESTS_COLLECTIONS[data.platform];

  // Read the request first to get data for FeedEvent and offer stamping
  const requestDoc = await db.collection(col).doc(requestId).get();
  const reqData = requestDoc.exists ? requestDoc.data() : {};

  // Stamp associated PlayerOffers
  const requestSnapshot = str(data.requestSnapshot);
  try {
    const offersSnap = await db.collection(OFFERS_COLLECTION)
      .where("requestId", "==", requestId)
      .get();
    if (!offersSnap.empty) {
      const batch = db.batch();
      for (const doc of offersSnap.docs) {
        batch.update(doc.ref, {
          requestStatus: "deleted",
          requestSnapshot: requestSnapshot,
        });
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn("[requestsDelete] Offer stamping failed:", err.message);
  }

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const now = Date.now();
    const agentName = str(data.agentName);
    // Include position so same-club deletions with different positions each get their own feed event
    const profileKey = (reqData.clubTmProfile || requestId) + "_" + (reqData.position || "");
    const docId = feedEventDocId("REQUEST_DELETED", profileKey, now);
    await db.collection(feedCol).doc(docId).set({
      type: "REQUEST_DELETED",
      playerName: reqData.clubName || "",
      playerImage: reqData.clubLogo || null,
      playerTmProfile: reqData.clubTmProfile || null,
      newValue: reqData.position || "",
      timestamp: now,
      agentName,
    });
  } catch (err) {
    console.warn("[requestsDelete] FeedEvent write failed:", err.message);
  }

  // Delete the request
  await db.collection(col).doc(requestId).delete();
  return { success: true };
}

module.exports = { requestsCreate, requestsUpdate, requestsDelete };
