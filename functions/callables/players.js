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
  // Family status
  "isMarried", "kidsCount",
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
    return { success: true, noOp: true };
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
//                  + push notification to tagged agents
// ═══════════════════════════════════════════════════════════════════════════

async function playersAddNote(data) {
  validatePlatform(data.platform);
  const playerId = requireId(data.playerId, "playerId");
  const playerRefId = str(data.playerRefId) || playerId;
  const agentName = str(data.agentName);
  const taggedAgentIds = Array.isArray(data.taggedAgentIds) ? data.taggedAgentIds.filter(id => typeof id === "string" && id.length > 0) : [];

  const note = {
    notes: str(data.noteText),
    createBy: str(data.createdBy),
    createByHe: str(data.createdByHe),
    createdAt: Date.now(),
  };
  if (taggedAgentIds.length > 0) {
    note.taggedAgentIds = taggedAgentIds;
  }

  const db = getDb();
  const col = PLAYERS_COLLECTIONS[data.platform];
  const ref = db.collection(col).doc(playerId);
  const playerSnap = await ref.get();
  if (!playerSnap.exists) throw new Error("Player not found.");

  const playerData = playerSnap.data();
  // Strip undefined fields from existing notes (old clients may have written taggedAgentIds: undefined)
  const existingNotes = Array.isArray(playerData.noteList)
    ? playerData.noteList.map(n => Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined)))
    : [];
  const noteList = [...existingNotes, note];
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

  // Send push notification to tagged agents (same pattern as onNewAgentTask)
  if (taggedAgentIds.length > 0) {
    try {
      const { getMessaging } = require("firebase-admin/messaging");
      const ACCOUNTS_COLLECTION = "Accounts";
      const playerName = str(data.playerName) || "Unknown";

      const notifTitle = "Tagged in Note";
      const notifBody = agentName
        ? `${agentName} tagged you in ${playerName}'s notes`
        : `You were tagged in ${playerName}'s notes`;

      for (const taggedId of taggedAgentIds) {
        try {
          const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(taggedId).get();
          if (!accountSnap.exists) continue;
          const accountData = accountSnap.data();

          // Collect all FCM tokens (same as getAllTokens in index.js)
          const tokens = new Set();
          if (accountData.fcmToken) tokens.add(accountData.fcmToken);
          if (Array.isArray(accountData.fcmTokens)) {
            for (const entry of accountData.fcmTokens) {
              const t = typeof entry === "string" ? entry : entry?.token;
              if (t) tokens.add(t);
            }
          }
          if (tokens.size === 0) {
            console.log(`No FCM tokens for tagged agent ${taggedId}, skipping`);
            continue;
          }

          const fcmData = {
            type: "NOTE_TAGGED",
            playerName,
            playerImage: str(data.playerImage) || "",
            playerId: playerRefId,
            agentName: agentName || "",
            screen: "player",
            player_id: playerRefId,
          };

          const messages = [...tokens].map((token) => ({
            token,
            notification: { title: notifTitle, body: notifBody },
            data: fcmData,
            android: {
              priority: "high",
              notification: { channelId: "mgsr_team_notifications", tag: `note-${playerRefId}-${Date.now()}` },
            },
            webpush: {
              notification: {
                title: notifTitle,
                body: notifBody,
                icon: "/logo.svg",
                tag: `note-tag-${playerId}-${Date.now()}`,
              },
              fcmOptions: { link: `/players/${playerRefId}` },
            },
          }));

          const results = await getMessaging().sendEach(messages);

          // Clean up invalid tokens
          const invalidTokens = [];
          results.responses.forEach((resp, idx) => {
            if (resp.error && (
              resp.error.code === "messaging/registration-token-not-registered" ||
              resp.error.code === "messaging/invalid-registration-token"
            )) {
              invalidTokens.push([...tokens][idx]);
            }
          });
          if (invalidTokens.length > 0) {
            const accountRef = db.collection(ACCOUNTS_COLLECTION).doc(taggedId);
            const updates = {};
            if (invalidTokens.includes(accountData.fcmToken)) updates.fcmToken = "";
            if (Array.isArray(accountData.fcmTokens)) {
              updates.fcmTokens = accountData.fcmTokens.filter((entry) => {
                const t = typeof entry === "string" ? entry : entry?.token;
                return !invalidTokens.includes(t);
              });
            }
            if (Object.keys(updates).length > 0) await accountRef.update(updates);
          }
        } catch (tagErr) {
          console.warn(`[playersAddNote] Failed to notify tagged agent ${taggedId}:`, tagErr.message);
        }

        // Persist to tagged agent's notification center
        try {
          const { persistNotification } = require("../lib/notificationCenter");
          await persistNotification(taggedId, {
            type: "NOTE_TAGGED",
            title: notifTitle,
            body: notifBody,
            data: { playerName, playerId: playerRefId, agentName: agentName || "", screen: "player" },
          });
        } catch (persistErr) {
          console.warn(`[playersAddNote] Notification center persist failed for ${taggedId}:`, persistErr.message);
        }
      }
    } catch (err) {
      console.warn("[playersAddNote] Tagged agent notification failed:", err.message);
    }
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

  // Read the document before deleting to check if it's GPS_DATA
  let wasGps = false;
  let playerTmProfile = null;
  try {
    const docSnap = await db.collection(PLAYER_DOCUMENTS_COLLECTION).doc(documentId).get();
    if (docSnap.exists) {
      const docData = docSnap.data();
      if (docData.type === "GPS_DATA" && docData.storageUrl) {
        wasGps = true;
        playerTmProfile = docData.playerTmProfile || null;
        // Delete matching GpsMatchData entry by storageUrl
        const gpsSnap = await db.collection("GpsMatchData")
          .where("storageUrl", "==", docData.storageUrl)
          .get();
        const batch = db.batch();
        gpsSnap.docs.forEach((d) => batch.delete(d.ref));
        if (!gpsSnap.empty) {
          await batch.commit();
          console.log(`[playerDocumentsDelete] Deleted ${gpsSnap.size} GpsMatchData doc(s) for storageUrl`);
        }
      }
    }
  } catch (err) {
    console.warn("[playerDocumentsDelete] GPS cleanup failed:", err.message);
  }

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

  return { success: true, wasGps, playerTmProfile };
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

const SALARY_KEYWORDS = /(?:salary|שכר|משכורת|מבקש)\s*[:\-=]?\s*/i;
const SALARY_NUMBER = /(\d+(?:[.,]\d+)?)\s*(?:k|K|k€|€k|thousand|אלף|מיליון)?/;
const FREE_PATTERN = /\b(?:free\s*(?:agent|transfer)?|free\/free\s*loan|חופשי|שחקן\s*חופשי)\b/i;
const CF_SALARY_RANGES = [">5", "6-10", "11-15", "16-20", "20-25", "26-30", "30+"];

function findSalaryNumber(text) {
  const lower = text.toLowerCase();
  const keywordMatch = lower.match(SALARY_KEYWORDS);
  if (!keywordMatch) return null;
  const afterIdx = (keywordMatch.index ?? 0) + keywordMatch[0].length;
  const afterKeyword = text.slice(afterIdx).trim();
  const numberMatch = afterKeyword.match(SALARY_NUMBER);
  if (!numberMatch) return null;
  const numStr = numberMatch[1].replace(",", ".");
  const value = parseFloat(numStr);
  if (isNaN(value)) return null;
  const fullMatch = numberMatch[0].toLowerCase();
  if (fullMatch.includes("מיליון") || fullMatch.includes("million")) return value * 1000;
  if (value >= 1000) return value / 1000;
  // Values > 30 are seasonal salaries (in K) — divide by 10 for monthly
  if (value > 30) return value / 10;
  return value;
}

function numberToSalaryRange(value) {
  const v = Math.max(0, Math.min(100, Math.floor(value)));
  if (v <= 5) return ">5";
  if (v >= 6 && v <= 10) return "6-10";
  if (v >= 11 && v <= 15) return "11-15";
  if (v >= 16 && v <= 20) return "16-20";
  if (v >= 20 && v <= 25) return "20-25";
  if (v >= 26 && v <= 30) return "26-30";
  if (v > 30) return "30+";
  return null;
}

function extractSalaryFromNotes(noteList) {
  let salaryRange = null;
  let isFree = false;
  if (!Array.isArray(noteList)) return { salaryRange, isFree };

  const text = noteList.map((n) => n?.notes || "").join(" ").trim();
  if (!text) return { salaryRange, isFree };

  const salaryValue = findSalaryNumber(text);
  if (salaryValue != null) salaryRange = numberToSalaryRange(salaryValue);
  if (FREE_PATTERN.test(text)) isFree = true;

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
