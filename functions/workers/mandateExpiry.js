/**
 * MandateExpiryWorker — Cloud version.
 * Runs nightly at 04:00 Israel time.
 * Scans mandate documents, marks expired ones, updates player haveMandate, writes FeedEvents.
 * No Transfermarkt scraping — Firestore only.
 */

const { getFirestore } = require("firebase-admin/firestore");
const { recordSuccess, recordFailure } = require("../lib/workerRuns");
const { markRefreshSuccess } = require("../lib/workerState");

const PLAYERS_TABLE = "Players";
const PLAYER_DOCUMENTS_TABLE = "PlayerDocuments";
const FEED_EVENTS_TABLE = "FeedEvents";

const FEED_EVENT_TYPE_MANDATE_EXPIRED = "MANDATE_EXPIRED";

async function runMandateExpiry() {
  const db = getFirestore();
  const startTime = Date.now();
  const logs = [];

  const log = (msg) => {
    logs.push(msg);
    console.log(`[MandateExpiry] ${msg}`);
  };

  try {
    log("Starting mandate expiry check");
    const now = Date.now();

    const docsRef = db.collection(PLAYER_DOCUMENTS_TABLE);
    const playersRef = db.collection(PLAYERS_TABLE);
    const feedRef = db.collection(FEED_EVENTS_TABLE);

    const mandateSnapshot = await docsRef
      .where("type", "==", "MANDATE")
      .get();

    log(`Fetched ${mandateSnapshot.size} mandate documents`);

    const expiredMandates = [];
    mandateSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const playerTmProfile = data.playerTmProfile;
      const expiresAt = data.expiresAt;
      const expired = data.expired === true;

      if (!playerTmProfile || expiresAt == null) return;
      const expiresAtMs =
        typeof expiresAt === "number"
          ? expiresAt
          : typeof expiresAt?.toMillis === "function"
            ? expiresAt.toMillis()
            : 0;
      if (expiresAtMs < now && !expired) {
        expiredMandates.push({
          docRef: doc.ref,
          playerTmProfile,
          uploadedBy: data.uploadedBy,
          expiresAt: expiresAtMs,
        });
      }
    });

    log(`Found ${expiredMandates.length} mandate(s) past expiry date`);

    let processed = 0;
    for (const { docRef, playerTmProfile, uploadedBy, expiresAt } of expiredMandates) {
      try {
        await docRef.update({ expired: true });
        log(`Marked mandate document as expired for ${playerTmProfile}`);

        const allMandatesForPlayer = await docsRef
          .where("playerTmProfile", "==", playerTmProfile)
          .where("type", "==", "MANDATE")
          .get();

        let hasOtherValidMandate = false;
        allMandatesForPlayer.docs.forEach((d) => {
          const dData = d.data();
          const exp = dData.expiresAt;
          const expFlag = dData.expired === true;
          const expMs = typeof exp === "number" ? exp : exp?.toMillis?.() || 0;
          if (!expFlag && (expMs === 0 || expMs >= now)) {
            hasOtherValidMandate = true;
          }
        });

        const playerSnap = await playersRef.where("tmProfile", "==", playerTmProfile).get();
        const playerDoc = playerSnap.docs[0];
        const player = playerDoc?.data();
        const playerName = player?.fullName || "Unknown";
        const playerImage = player?.profileImage;

        if (!hasOtherValidMandate && player?.haveMandate && playerDoc) {
          await playerDoc.ref.set(
            { ...player, haveMandate: false },
            { merge: true }
          );
          log(`Turned off mandate switch for ${playerName}`);
        }

        await feedRef.add({
          type: FEED_EVENT_TYPE_MANDATE_EXPIRED,
          playerName,
          playerImage: playerImage || null,
          playerTmProfile,
          agentName: uploadedBy || null,
          changedBy: "system",
          mandateExpiryAt: expiresAt,
          oldValue: null,
          newValue: "Mandate expired",
          timestamp: now,
        });
        log(`Feed event written for mandate expiry: ${playerName}`);
        processed++;
      } catch (err) {
        log(`Error processing mandate for ${playerTmProfile}: ${err.message}`);
        console.error(`[MandateExpiry] Error:`, err);
      }
    }

    await markRefreshSuccess(db, "MandateExpiryWorker");
    const durationMs = Date.now() - startTime;
    await recordSuccess(
      db,
      "MandateExpiryWorker",
      `${processed} mandate(s) processed`,
      durationMs
    );

    log(`Complete — ${processed} mandate(s) processed in ${durationMs}ms`);
    return { success: true, processed, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const db = getFirestore();
    await recordFailure(db, "MandateExpiryWorker", err, durationMs);
    log(`FAILED: ${err.message}`);
    console.error(`[MandateExpiry] Fatal error:`, err);
    throw err;
  }
}

module.exports = { runMandateExpiry };
