/**
 * Shared callable: Add player to roster.
 * Single source for all 3 platforms (men, women, youth).
 * Handles duplicate check, FeedEvent, optional shortlist auto-removal.
 */
const { getFirestore } = require("firebase-admin/firestore");
const {
  PLAYERS_COLLECTIONS,
  FEED_EVENTS_COLLECTIONS,
  SHORTLISTS_COLLECTIONS,
  validatePlatform,
} = require("../lib/platformCollections");
const { str } = require("../lib/validation");
const { feedEventDocId } = require("../lib/utils");

function getDb() {
  return getFirestore();
}

// ── Allowed fields per platform ──────────────────────────────────────────

const SHARED_FIELDS = new Set([
  "fullName", "positions", "profileImage", "nationality", "nationalityFlag",
  "marketValue", "createdAt", "agentInChargeId", "agentInChargeName",
  "playerPhoneNumber", "agentPhoneNumber", "notes",
]);

const MEN_FIELDS = new Set([
  ...SHARED_FIELDS,
  "tmProfile", "height", "age", "contractExpired", "currentClub",
  "isOnLoan", "onLoanFromClub", "foot", "agency", "agencyUrl",
]);

const WOMEN_FIELDS = new Set([
  ...SHARED_FIELDS,
  "age", "currentClub", "soccerDonnaUrl", "wosostatId",
]);

const YOUTH_FIELDS = new Set([
  ...SHARED_FIELDS,
  "fullNameHe", "currentClub", "academy", "dateOfBirth", "ageGroup",
  "ifaUrl", "ifaPlayerId", "playerEmail", "parentContact",
]);

function getAllowedFields(platform) {
  if (platform === "women") return WOMEN_FIELDS;
  if (platform === "youth") return YOUTH_FIELDS;
  return MEN_FIELDS;
}

// ── Duplicate check field per platform ───────────────────────────────────

function getDedupField(platform) {
  if (platform === "women") return "soccerDonnaUrl";
  if (platform === "youth") return null; // youth dedup is name-based, checked client-side
  return "tmProfile";
}

// ── FeedEvent player ref key per platform ────────────────────────────────

function feedPlayerRefKey(platform) {
  if (platform === "women") return "playerWomenId";
  if (platform === "youth") return "playerYouthId";
  return "playerTmProfile";
}

// ═══════════════════════════════════════════════════════════════════════════
// playersCreate — add player to roster + FeedEvent + optional shortlist removal
// ═══════════════════════════════════════════════════════════════════════════

async function playersCreate(data) {
  validatePlatform(data.platform);
  const platform = data.platform;
  const db = getDb();
  const col = PLAYERS_COLLECTIONS[platform];
  const allowedFields = getAllowedFields(platform);

  // Server-side duplicate check (men=tmProfile, women=soccerDonnaUrl)
  const dedupField = getDedupField(platform);
  if (dedupField) {
    const dedupValue = str(data[dedupField]);
    if (dedupValue) {
      const existing = await db.collection(col)
        .where(dedupField, "==", dedupValue).limit(1).get();
      if (!existing.empty) {
        return { status: "already_exists" };
      }
    }
  }

  // Build player entry from allowed fields
  const entry = {};
  for (const key of allowedFields) {
    if (key in data && data[key] !== undefined) {
      entry[key] = data[key];
    }
  }

  // Ensure createdAt
  if (!entry.createdAt) {
    entry.createdAt = Date.now();
  }

  // Ensure fullName
  if (!str(entry.fullName)) {
    throw new Error("fullName is required.");
  }

  const ref = await db.collection(col).add(entry);

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[platform];
    const now = Date.now();
    const refKey = feedPlayerRefKey(platform);

    // For men: use tmProfile. Women: doc ID. Youth: null.
    let refValue = null;
    if (platform === "men") refValue = str(data.tmProfile);
    else if (platform === "women") refValue = ref.id;

    const docId = feedEventDocId("PLAYER_ADDED", refValue || ref.id, now);
    await db.collection(feedCol).doc(docId).set({
      type: "PLAYER_ADDED",
      playerName: str(entry.fullName),
      playerImage: str(entry.profileImage),
      [refKey]: refValue,
      timestamp: now,
      agentName: str(data.agentInChargeName) || str(data.agentName),
    });
  } catch (err) {
    console.warn("[playersCreate] FeedEvent write failed:", err.message);
  }

  // Auto-remove from shortlist (if applicable)
  const shortlistUrl = getShortlistUrl(platform, data);
  if (shortlistUrl) {
    try {
      const shortCol = SHORTLISTS_COLLECTIONS[platform];
      const snap = await db.collection(shortCol)
        .where("tmProfileUrl", "==", shortlistUrl).limit(1).get();
      if (!snap.empty) {
        const docData = snap.docs[0].data();
        await snap.docs[0].ref.delete();

        // Write SHORTLIST_REMOVED FeedEvent
        try {
          const feedCol = FEED_EVENTS_COLLECTIONS[platform];
          const now = Date.now();
          const rmDocId = feedEventDocId("SHORTLIST_REMOVED", shortlistUrl, now);
          await db.collection(feedCol).doc(rmDocId).set({
            type: "SHORTLIST_REMOVED",
            playerName: docData.playerName || str(entry.fullName),
            playerImage: docData.playerImage || str(entry.profileImage),
            playerTmProfile: shortlistUrl,
            timestamp: now,
            agentName: str(data.agentInChargeName) || str(data.agentName),
          });
        } catch (err) {
          console.warn("[playersCreate] Shortlist removal FeedEvent failed:", err.message);
        }
      }
    } catch (err) {
      console.warn("[playersCreate] Shortlist auto-removal failed:", err.message);
    }
  }

  return { status: "added", id: ref.id };
}

/**
 * Determine the shortlist URL to auto-remove (if any).
 * Men: tmProfile, Women: soccerDonnaUrl, Youth: ifaUrl
 */
function getShortlistUrl(platform, data) {
  if (platform === "men") return str(data.tmProfile) || str(data.removeFromShortlistUrl);
  if (platform === "women") return str(data.soccerDonnaUrl) || str(data.removeFromShortlistUrl);
  if (platform === "youth") return str(data.ifaUrl) || str(data.removeFromShortlistUrl);
  return null;
}

module.exports = { playersCreate };
