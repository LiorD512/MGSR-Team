/**
 * Shared callables: Player operations.
 * Single source for update, delete, notes, mandate toggle, documents.
 * Writes FeedEvents server-side where applicable.
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { PLAYERS_COLLECTIONS, FEED_EVENTS_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { str, int, bool, timestamp, requireId } = require("../lib/validation");
const { feedEventDocId } = require("../lib/utils");

const PLAYER_DOCUMENTS_COLLECTION = "PlayerDocuments";

function getDb() {
  return getFirestore();
}

/**
 * Returns the platform-aware FeedEvent player ref field key.
 * Men: playerTmProfile, Women: playerWomenId, Youth: playerYouthId
 */
function feedPlayerRefKey(platform) {
  if (platform === "women") return "playerWomenId";
  if (platform === "youth") return "playerYouthId";
  return "playerTmProfile";
}

/**
 * Returns the platform-aware PlayerDocuments link field key.
 * Men: playerTmProfile, Women: playerWomenId, Youth: playerYouthId
 */
function docsLinkKey(platform) {
  if (platform === "women") return "playerWomenId";
  if (platform === "youth") return "playerYouthId";
  return "playerTmProfile";
}

// ═══════════════════════════════════════════════════════════════════════════
// playersUpdate — generic player field update (no FeedEvent)
// ═══════════════════════════════════════════════════════════════════════════

// Fields that playersUpdate is allowed to write
const ALLOWED_UPDATE_FIELDS = new Set([
  // Phone / contact
  "playerPhoneNumber", "agentPhoneNumber",
  // Flags
  "haveMandate", "interestedInIsrael",
  // Salary / fee
  "salaryRange", "transferFee",
  // Passport
  "passportDetails",
  // Agency
  "agency", "agencyUrl",
  // Highlights
  "pinnedHighlights",
  // TM refresh fields
  "marketValue", "profileImage", "nationalityFlag", "nationality",
  "nationalities", "nationalityFlags", "age", "contractExpired",
  "positions", "currentClub", "marketValueHistory", "lastRefreshedAt",
  "isOnLoan", "foot", "onLoanFromClub", "height", "noteList", "notes",
  // Women-specific
  "soccerDonnaUrl", "fmInsideUrl", "fullName",
  // Youth-specific
  "fullNameHe", "academy", "dateOfBirth", "ageGroup", "ifaUrl",
  "playerEmail", "parentContact",
]);

async function playersUpdate(data) {
  validatePlatform(data.platform);
  const playerId = requireId(data.playerId, "playerId");
  const col = PLAYERS_COLLECTIONS[data.platform];
  const db = getDb();

  const updates = {};
  const deleteFields = [];

  // _deleteFields: array of field names to delete via FieldValue.delete()
  if (Array.isArray(data._deleteFields)) {
    for (const f of data._deleteFields) {
      if (typeof f === "string" && ALLOWED_UPDATE_FIELDS.has(f)) {
        deleteFields.push(f);
      }
    }
  }

  // Collect provided fields
  for (const key of ALLOWED_UPDATE_FIELDS) {
    if (key in data && !deleteFields.includes(key)) {
      updates[key] = data[key];
    }
  }

  // Apply deletes
  for (const f of deleteFields) {
    updates[f] = FieldValue.delete();
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No valid fields to update.");
  }

  await db.collection(col).doc(playerId).update(updates);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// playersToggleMandate — toggle haveMandate + write FeedEvent
// ═══════════════════════════════════════════════════════════════════════════

async function playersToggleMandate(data) {
  validatePlatform(data.platform);
  const playerId = requireId(data.playerId, "playerId");
  const hasMandate = bool(data.hasMandate, false);
  const agentName = str(data.agentName);
  const playerRefId = str(data.playerRefId) || playerId; // tmProfile for men, docId for women/youth

  const db = getDb();
  const col = PLAYERS_COLLECTIONS[data.platform];

  await db.collection(col).doc(playerId).update({ haveMandate: hasMandate });

  // Look up mandate expiry from PlayerDocuments (if turning on)
  let mandateExpiryAt = null;
  if (hasMandate) {
    try {
      const linkKey = docsLinkKey(data.platform);
      const docsSnap = await db.collection(PLAYER_DOCUMENTS_COLLECTION)
        .where(linkKey, "==", playerRefId)
        .where("type", "==", "MANDATE")
        .get();
      if (!docsSnap.empty) {
        const now = Date.now();
        const expiryDates = docsSnap.docs
          .map(d => d.data())
          .filter(d => !d.expired && (d.expiresAt == null || d.expiresAt >= now))
          .map(d => d.expiresAt || 0)
          .filter(t => t > 0);
        if (expiryDates.length > 0) {
          mandateExpiryAt = Math.max(...expiryDates);
        }
      }
    } catch (err) {
      console.warn("[playersToggleMandate] mandate expiry lookup failed:", err.message);
    }
  }

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const refKey = feedPlayerRefKey(data.platform);
    const now = Date.now();
    const eventType = hasMandate ? "MANDATE_SWITCHED_ON" : "MANDATE_SWITCHED_OFF";
    const docId = feedEventDocId(eventType, playerRefId, now);
    const feedEvent = {
      type: eventType,
      playerName: str(data.playerName),
      playerImage: str(data.playerImage),
      [refKey]: playerRefId,
      agentName,
      timestamp: now,
    };
    if (mandateExpiryAt != null) feedEvent.mandateExpiryAt = mandateExpiryAt;
    await db.collection(feedCol).doc(docId).set(feedEvent);
  } catch (err) {
    console.warn("[playersToggleMandate] FeedEvent write failed:", err.message);
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// playersAddNote — append note + salary/fee extraction (men) + FeedEvent
// ═══════════════════════════════════════════════════════════════════════════

async function playersAddNote(data) {
  validatePlatform(data.platform);
  const playerId = requireId(data.playerId, "playerId");
  const playerRefId = str(data.playerRefId) || playerId;
  const agentName = str(data.agentName);

  const note = {
    notes: str(data.noteText),
    createBy: str(data.createdBy),
    createByHe: str(data.createdByHe),
    createdAt: Date.now(),
  };

  const db = getDb();
  const col = PLAYERS_COLLECTIONS[data.platform];
  const ref = db.collection(col).doc(playerId);
  const playerSnap = await ref.get();
  if (!playerSnap.exists) throw new Error("Player not found.");

  const playerData = playerSnap.data();
  const noteList = Array.isArray(playerData.noteList) ? [...playerData.noteList, note] : [note];
  const updateData = { noteList };

  // Men-only: extract salary/fee from notes
  if (data.platform === "men") {
    const extracted = extractSalaryFromNotes(noteList);
    if (extracted.salaryRange) updateData.salaryRange = extracted.salaryRange;
    if (extracted.isFree) updateData.transferFee = "Free/Free loan";
  }

  await ref.update(updateData);

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const refKey = feedPlayerRefKey(data.platform);
    const now = Date.now();
    const notePreview = note.notes.length > 120 ? note.notes.slice(0, 120) + "…" : note.notes;
    const docId = feedEventDocId("NOTE_ADDED", playerRefId, now);
    await db.collection(feedCol).doc(docId).set({
      type: "NOTE_ADDED",
      playerName: str(data.playerName),
      playerImage: str(data.playerImage),
      [refKey]: playerRefId,
      agentName,
      extraInfo: notePreview,
      timestamp: now,
    });
  } catch (err) {
    console.warn("[playersAddNote] FeedEvent write failed:", err.message);
  }

  return { success: true, noteList };
}

// ═══════════════════════════════════════════════════════════════════════════
// playersDeleteNote — remove note + salary/fee re-extraction + FeedEvent
// ═══════════════════════════════════════════════════════════════════════════

async function playersDeleteNote(data) {
  validatePlatform(data.platform);
  const playerId = requireId(data.playerId, "playerId");
  const playerRefId = str(data.playerRefId) || playerId;
  const agentName = str(data.agentName);
  const noteIndex = int(data.noteIndex, -1);

  const db = getDb();
  const col = PLAYERS_COLLECTIONS[data.platform];
  const ref = db.collection(col).doc(playerId);
  const playerSnap = await ref.get();
  if (!playerSnap.exists) throw new Error("Player not found.");

  const playerData = playerSnap.data();
  const noteList = Array.isArray(playerData.noteList) ? [...playerData.noteList] : [];

  // Remove by index or by matching note text+createdAt
  let removedNote = null;
  if (noteIndex >= 0 && noteIndex < noteList.length) {
    removedNote = noteList[noteIndex];
    noteList.splice(noteIndex, 1);
  } else if (data.noteText && data.noteCreatedAt) {
    // Fallback: match by content + timestamp
    const idx = noteList.findIndex(
      n => n.notes === data.noteText && n.createdAt === data.noteCreatedAt
    );
    if (idx >= 0) {
      removedNote = noteList[idx];
      noteList.splice(idx, 1);
    }
  }

  const updateData = { noteList };

  // Men-only: re-extract salary/fee
  if (data.platform === "men") {
    const extracted = extractSalaryFromNotes(noteList);
    if (extracted.salaryRange) updateData.salaryRange = extracted.salaryRange;
    if (extracted.isFree) updateData.transferFee = "Free/Free loan";
  }

  await ref.update(updateData);

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const refKey = feedPlayerRefKey(data.platform);
    const now = Date.now();
    const notePreview = removedNote?.notes
      ? (removedNote.notes.length > 120 ? removedNote.notes.slice(0, 120) + "…" : removedNote.notes)
      : str(data.noteText).slice(0, 120);
    const docId = feedEventDocId("NOTE_DELETED", playerRefId, now);
    await db.collection(feedCol).doc(docId).set({
      type: "NOTE_DELETED",
      playerName: str(data.playerName),
      playerImage: str(data.playerImage),
      [refKey]: playerRefId,
      agentName,
      extraInfo: notePreview || undefined,
      timestamp: now,
    });
  } catch (err) {
    console.warn("[playersDeleteNote] FeedEvent write failed:", err.message);
  }

  return { success: true, noteList };
}

// ═══════════════════════════════════════════════════════════════════════════
// playersDelete — delete player + FeedEvent
// ═══════════════════════════════════════════════════════════════════════════

async function playersDelete(data) {
  validatePlatform(data.platform);
  const playerId = requireId(data.playerId, "playerId");
  const playerRefId = str(data.playerRefId) || playerId;
  const agentName = str(data.agentName);

  const db = getDb();
  const col = PLAYERS_COLLECTIONS[data.platform];

  // Read player data for FeedEvent before deleting
  const playerSnap = await db.collection(col).doc(playerId).get();
  const playerData = playerSnap.exists ? playerSnap.data() : {};

  await db.collection(col).doc(playerId).delete();

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const refKey = feedPlayerRefKey(data.platform);
    const now = Date.now();
    const docId = feedEventDocId("PLAYER_DELETED", playerRefId, now);
    await db.collection(feedCol).doc(docId).set({
      type: "PLAYER_DELETED",
      playerName: playerData.fullName || str(data.playerName),
      playerImage: playerData.profileImage || str(data.playerImage),
      [refKey]: playerRefId,
      agentName,
      timestamp: now,
    });
  } catch (err) {
    console.warn("[playersDelete] FeedEvent write failed:", err.message);
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// playerDocumentsCreate — create PlayerDocuments entry + optional FeedEvent
// ═══════════════════════════════════════════════════════════════════════════

async function playerDocumentsCreate(data) {
  validatePlatform(data.platform);
  const playerRefId = requireId(data.playerRefId, "playerRefId");
  const docType = str(data.type) || "OTHER";
  const name = str(data.name);
  const storageUrl = requireId(data.storageUrl, "storageUrl");

  const db = getDb();
  const linkKey = docsLinkKey(data.platform);
  const docData = {
    [linkKey]: playerRefId,
    type: docType,
    name,
    storageUrl,
    uploadedAt: Date.now(),
  };
  if (data.expiresAt != null && data.expiresAt > 0) docData.expiresAt = data.expiresAt;
  if (Array.isArray(data.validLeagues) && data.validLeagues.length > 0) {
    docData.validLeagues = data.validLeagues;
  }
  if (docType === "MANDATE" && data.uploadedBy) docData.uploadedBy = str(data.uploadedBy);

  const ref = await db.collection(PLAYER_DOCUMENTS_COLLECTION).add(docData);

  // Write FeedEvent for mandate uploads
  if (docType === "MANDATE") {
    try {
      const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
      const refKey = feedPlayerRefKey(data.platform);
      const now = Date.now();
      const docId = feedEventDocId("MANDATE_UPLOADED", playerRefId, now);
      const feedEvent = {
        type: "MANDATE_UPLOADED",
        playerName: str(data.playerName),
        playerImage: str(data.playerImage),
        [refKey]: playerRefId,
        agentName: str(data.agentName),
        timestamp: now,
      };
      if (data.expiresAt != null && data.expiresAt > 0) feedEvent.mandateExpiryAt = data.expiresAt;
      await db.collection(feedCol).doc(docId).set(feedEvent);
    } catch (err) {
      console.warn("[playerDocumentsCreate] FeedEvent write failed:", err.message);
    }
  }

  return { id: ref.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// playerDocumentsDelete — delete document + optional passport clear
// ═══════════════════════════════════════════════════════════════════════════

async function playerDocumentsDelete(data) {
  validatePlatform(data.platform);
  const documentId = requireId(data.documentId, "documentId");

  const db = getDb();
  await db.collection(PLAYER_DOCUMENTS_COLLECTION).doc(documentId).delete();

  // Optionally clear passportDetails on the player
  if (data.clearPassport && data.playerId) {
    try {
      const col = PLAYERS_COLLECTIONS[data.platform];
      await db.collection(col).doc(data.playerId).update({
        passportDetails: FieldValue.delete(),
      });
    } catch (err) {
      console.warn("[playerDocumentsDelete] passport clear failed:", err.message);
    }
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// playerDocumentsMarkExpired — mark document as expired
// ═══════════════════════════════════════════════════════════════════════════

async function playerDocumentsMarkExpired(data) {
  const documentId = requireId(data.documentId, "documentId");
  await getDb().collection(PLAYER_DOCUMENTS_COLLECTION).doc(documentId).update({ expired: true });
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — salary/fee extraction from notes (matches Android NoteParser)
// ═══════════════════════════════════════════════════════════════════════════

const SALARY_PATTERN = /(?:salary|שכר)[:\s]*([0-9]+(?:\.[0-9]+)?[kK]?\s*[-–]\s*[0-9]+(?:\.[0-9]+)?[kK]?|[0-9]+(?:\.[0-9]+)?[kK]?)/i;
const FREE_PATTERN = /\b(?:free\s*(?:agent|transfer)?|free\/free\s*loan|חופשי|שחקן\s*חופשי)\b/i;

function extractSalaryFromNotes(noteList) {
  let salaryRange = null;
  let isFree = false;
  if (!Array.isArray(noteList)) return { salaryRange, isFree };

  for (const note of noteList) {
    const text = note?.notes || "";
    const salaryMatch = text.match(SALARY_PATTERN);
    if (salaryMatch) salaryRange = salaryMatch[1].trim();
    if (FREE_PATTERN.test(text)) isFree = true;
  }
  return { salaryRange, isFree };
}

module.exports = {
  playersUpdate,
  playersToggleMandate,
  playersAddNote,
  playersDeleteNote,
  playersDelete,
  playerDocumentsCreate,
  playerDocumentsDelete,
  playerDocumentsMarkExpired,
};
