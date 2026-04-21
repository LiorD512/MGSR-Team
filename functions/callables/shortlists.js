/**
 * Shared callables: Shortlist operations.
 * Single source for add, remove, update, notes CRUD.
 * Writes FeedEvents server-side where applicable.
 */
const { getFirestore } = require("firebase-admin/firestore");
const { SHORTLISTS_COLLECTIONS, FEED_EVENTS_COLLECTIONS, PLAYERS_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { str, int } = require("../lib/validation");
const { feedEventDocId } = require("../lib/utils");

function getDb() {
  return getFirestore();
}

// Fields allowed on a shortlist entry (prevents arbitrary writes)
const ALLOWED_ENTRY_FIELDS = new Set([
  "tmProfileUrl", "addedAt",
  "playerImage", "playerName", "playerPosition", "playerAge",
  "playerNationality", "playerNationalityFlag", "playerNationalities",
  "clubJoinedLogo", "clubJoinedName", "currentClub",
  "transferDate", "marketValue",
  "addedByAgentId", "addedByAgentName", "addedByAgentHebrewName",
  "instagramHandle", "instagramUrl", "instagramSentAt",
  "sourceAgentId", "sourceProfileId",
  // Refresh fields
  "contractExpires", "positions", "foot", "salaryRange", "transferFee",
  "lastRefreshedAt", "marketValueHistory",
]);

// ═══════════════════════════════════════════════════════════════════════════
// shortlistAdd — add player to shortlist + FeedEvent
// ═══════════════════════════════════════════════════════════════════════════

async function shortlistAdd(data) {
  validatePlatform(data.platform);
  const tmProfileUrl = str(data.tmProfileUrl);
  if (!tmProfileUrl) throw new Error("tmProfileUrl is required.");

  const db = getDb();
  const col = SHORTLISTS_COLLECTIONS[data.platform];

  // Check duplicate
  const existing = await db.collection(col)
    .where("tmProfileUrl", "==", tmProfileUrl).limit(1).get();
  if (!existing.empty) {
    return { status: "already_exists" };
  }

  // Optional roster check (checks Players collection for tmProfile/soccerDonnaUrl/ifaUrl)
  if (data.checkRoster !== false) {
    const playerCol = PLAYERS_COLLECTIONS[data.platform];
    let rosterField = "tmProfile";
    if (tmProfileUrl.includes("soccerdonna")) rosterField = "soccerDonnaUrl";
    else if (tmProfileUrl.includes("football.org.il")) rosterField = "ifaUrl";

    const rosterSnap = await db.collection(playerCol)
      .where(rosterField, "==", tmProfileUrl).limit(1).get();
    if (!rosterSnap.empty) {
      return { status: "already_in_roster" };
    }
  }

  // Build entry from allowed fields
  const entry = { tmProfileUrl, addedAt: Date.now() };
  for (const key of ALLOWED_ENTRY_FIELDS) {
    if (key === "tmProfileUrl" || key === "addedAt") continue;
    if (key in data && data[key] != null) {
      entry[key] = data[key];
    }
  }

  const ref = await db.collection(col).add(entry);

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const now = Date.now();
    const docId = feedEventDocId("SHORTLIST_ADDED", tmProfileUrl, now);
    await db.collection(feedCol).doc(docId).set({
      type: "SHORTLIST_ADDED",
      playerName: str(data.playerName),
      playerImage: str(data.playerImage),
      playerTmProfile: tmProfileUrl,
      timestamp: now,
      agentName: str(data.addedByAgentName) || str(data.agentName),
    });
  } catch (err) {
    console.warn("[shortlistAdd] FeedEvent write failed:", err.message);
  }

  return { status: "added", id: ref.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// shortlistRemove — remove entry by tmProfileUrl + FeedEvent
// ═══════════════════════════════════════════════════════════════════════════

async function shortlistRemove(data) {
  validatePlatform(data.platform);
  const tmProfileUrl = str(data.tmProfileUrl);
  if (!tmProfileUrl) throw new Error("tmProfileUrl is required.");

  const db = getDb();
  const col = SHORTLISTS_COLLECTIONS[data.platform];

  const snap = await db.collection(col)
    .where("tmProfileUrl", "==", tmProfileUrl).limit(1).get();
  if (snap.empty) return { success: true };

  const docData = snap.docs[0].data();
  await snap.docs[0].ref.delete();

  // Write FeedEvent
  try {
    const feedCol = FEED_EVENTS_COLLECTIONS[data.platform];
    const now = Date.now();
    const docId = feedEventDocId("SHORTLIST_REMOVED", tmProfileUrl, now);
    await db.collection(feedCol).doc(docId).set({
      type: "SHORTLIST_REMOVED",
      playerName: docData.playerName || str(data.playerName),
      playerImage: docData.playerImage || str(data.playerImage),
      playerTmProfile: tmProfileUrl,
      timestamp: now,
      agentName: str(data.agentName),
    });
  } catch (err) {
    console.warn("[shortlistRemove] FeedEvent write failed:", err.message);
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// shortlistUpdate — update entry fields (refresh, instagramSentAt, etc.)
// ═══════════════════════════════════════════════════════════════════════════

async function shortlistUpdate(data) {
  validatePlatform(data.platform);
  const tmProfileUrl = str(data.tmProfileUrl);
  if (!tmProfileUrl) throw new Error("tmProfileUrl is required.");

  const db = getDb();
  const col = SHORTLISTS_COLLECTIONS[data.platform];

  const snap = await db.collection(col)
    .where("tmProfileUrl", "==", tmProfileUrl).limit(1).get();
  if (snap.empty) throw new Error("Shortlist entry not found.");

  const updates = {};
  for (const key of ALLOWED_ENTRY_FIELDS) {
    if (key === "tmProfileUrl" || key === "addedAt") continue; // immutable
    if (key in data) {
      updates[key] = data[key] != null ? data[key] : null;
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("No valid fields to update.");
  }

  await snap.docs[0].ref.update(updates);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// shortlistAddNote — append note to entry's notes array
// ═══════════════════════════════════════════════════════════════════════════

async function shortlistAddNote(data) {
  validatePlatform(data.platform);
  const tmProfileUrl = str(data.tmProfileUrl);
  if (!tmProfileUrl) throw new Error("tmProfileUrl is required.");
  const noteText = str(data.noteText);
  if (!noteText) throw new Error("noteText is required.");
  const agentName = str(data.agentName);
  const taggedAgentIds = Array.isArray(data.taggedAgentIds)
    ? data.taggedAgentIds.filter(id => typeof id === "string" && id.length > 0)
    : [];

  const db = getDb();
  const col = SHORTLISTS_COLLECTIONS[data.platform];

  const snap = await db.collection(col)
    .where("tmProfileUrl", "==", tmProfileUrl).limit(1).get();
  if (snap.empty) throw new Error("Shortlist entry not found.");

  const docRef = snap.docs[0].ref;
  const entryData = snap.docs[0].data();

  // Use transaction for atomic note append
  await db.runTransaction(async (tx) => {
    const docSnap = await tx.get(docRef);
    const notes = Array.isArray(docSnap.data().notes) ? [...docSnap.data().notes] : [];
    const note = {
      text: noteText,
      createdAt: Date.now(),
    };
    const createdBy = str(data.createdBy);
    const createdByHebrewName = str(data.createdByHebrewName);
    const createdById = str(data.createdById);
    if (createdBy) note.createdBy = createdBy;
    if (createdByHebrewName) note.createdByHebrewName = createdByHebrewName;
    if (createdById) note.createdById = createdById;
    if (taggedAgentIds.length > 0) {
      note.taggedAgentIds = taggedAgentIds;
    }

    notes.push(note);
    tx.update(docRef, { notes });
  });

  // ═══ SEND PUSH NOTIFICATIONS TO TAGGED AGENTS ═══
  if (taggedAgentIds.length > 0) {
    try {
      const { getMessaging } = require("firebase-admin/messaging");
      const ACCOUNTS_COLLECTION = "Accounts";
      const playerName = str(data.playerName) || entryData.playerName || "Unknown";
      const playerImage = str(data.playerImage) || entryData.playerImage || "";

      const notifTitle = "Tagged in Shortlist Note";
      const notifBody = agentName
        ? `${agentName} tagged you in ${playerName}'s shortlist notes`
        : `You were tagged in ${playerName}'s shortlist notes`;

      for (const taggedId of taggedAgentIds) {
        try {
          const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(taggedId).get();
          if (!accountSnap.exists) continue;
          const accountData = accountSnap.data();

          // Collect all FCM tokens
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
            type: "SHORTLIST_NOTE_TAGGED",
            playerName,
            playerImage,
            playerTmProfile: tmProfileUrl,
            agentName: agentName || "",
            screen: "shortlist",
          };

          const messages = [...tokens].map((token) => ({
            token,
            notification: { title: notifTitle, body: notifBody },
            data: fcmData,
            android: {
              priority: "high",
              notification: { channelId: "mgsr_team_notifications", tag: `shortlist-note-${tmProfileUrl}-${Date.now()}` },
            },
            webpush: {
              notification: {
                title: notifTitle,
                body: notifBody,
                icon: "/logo.svg",
                tag: `shortlist-note-tag-${Date.now()}`,
              },
              fcmOptions: { link: `/shortlist?highlight=${encodeURIComponent(tmProfileUrl)}` },
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
          console.warn(`[shortlistAddNote] Failed to notify tagged agent ${taggedId}:`, tagErr.message);
        }

        // Persist to tagged agent's notification center
        try {
          const { persistNotification } = require("../lib/notificationCenter");
          await persistNotification(taggedId, {
            type: "SHORTLIST_NOTE_TAGGED",
            title: notifTitle,
            body: notifBody,
            data: { playerName, playerTmProfile: tmProfileUrl, agentName: agentName || "", screen: "shortlist" },
          });
        } catch (persistErr) {
          console.warn(`[shortlistAddNote] Notification center persist failed for ${taggedId}:`, persistErr.message);
        }
      }
    } catch (err) {
      console.warn("[shortlistAddNote] Tagged agent notification failed:", err.message);
    }
  }

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// shortlistUpdateNote — update note text at index
// ═══════════════════════════════════════════════════════════════════════════

async function shortlistUpdateNote(data) {
  validatePlatform(data.platform);
  const tmProfileUrl = str(data.tmProfileUrl);
  if (!tmProfileUrl) throw new Error("tmProfileUrl is required.");
  const noteIndex = int(data.noteIndex, -1);
  if (noteIndex < 0) throw new Error("noteIndex is required.");
  const newText = str(data.newText);
  if (!newText) throw new Error("newText is required.");

  const db = getDb();
  const col = SHORTLISTS_COLLECTIONS[data.platform];

  const snap = await db.collection(col)
    .where("tmProfileUrl", "==", tmProfileUrl).limit(1).get();
  if (snap.empty) throw new Error("Shortlist entry not found.");

  const docRef = snap.docs[0].ref;

  await db.runTransaction(async (tx) => {
    const docSnap = await tx.get(docRef);
    const notes = Array.isArray(docSnap.data().notes) ? [...docSnap.data().notes] : [];
    if (noteIndex >= notes.length) return;
    notes[noteIndex] = { ...notes[noteIndex], text: newText, updatedAt: Date.now() };
    tx.update(docRef, { notes });
  });

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// shortlistDeleteNote — remove note at index
// ═══════════════════════════════════════════════════════════════════════════

async function shortlistDeleteNote(data) {
  validatePlatform(data.platform);
  const tmProfileUrl = str(data.tmProfileUrl);
  if (!tmProfileUrl) throw new Error("tmProfileUrl is required.");
  const noteIndex = int(data.noteIndex, -1);
  if (noteIndex < 0) throw new Error("noteIndex is required.");

  const db = getDb();
  const col = SHORTLISTS_COLLECTIONS[data.platform];

  const snap = await db.collection(col)
    .where("tmProfileUrl", "==", tmProfileUrl).limit(1).get();
  if (snap.empty) throw new Error("Shortlist entry not found.");

  const docRef = snap.docs[0].ref;

  await db.runTransaction(async (tx) => {
    const docSnap = await tx.get(docRef);
    const notes = Array.isArray(docSnap.data().notes) ? [...docSnap.data().notes] : [];
    if (noteIndex >= notes.length) return;
    notes.splice(noteIndex, 1);
    tx.update(docRef, { notes });
  });

  return { success: true };
}

module.exports = {
  shortlistAdd,
  shortlistRemove,
  shortlistUpdate,
  shortlistAddNote,
  shortlistUpdateNote,
  shortlistDeleteNote,
};
