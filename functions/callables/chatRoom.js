/**
 * Chat Room — callable for sending messages + push notification to a targeted user.
 *
 * Firestore collection: "ChatRoom"
 * Document structure:
 *   - text: string (message body, may contain @[PlayerName](playerId) mentions)
 *   - senderAccountId: string
 *   - senderName: string (English)
 *   - senderNameHe: string (Hebrew)
 *   - createdAt: number (epoch ms)
 *   - notifyAccountId: string | "" (target user for push)
 *   - mentions: Array<{ playerId: string, playerName: string }> (embedded player refs)
 *   - replyTo: { messageId: string, text: string, senderName: string } | null
 *   - attachments: Array<{ url: string, name: string, type: string, size: number }> | []
 */

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

function getDb() { return getFirestore(); }
const ACCOUNTS_COLLECTION = "Accounts";
const CHAT_ROOM_COLLECTION = "ChatRoom";

/**
 * Collects all FCM tokens for an account (legacy fcmToken + fcmTokens array).
 */
function getAllTokens(accountData) {
  const tokens = new Set();
  if (accountData.fcmToken) tokens.add(accountData.fcmToken);
  if (Array.isArray(accountData.fcmTokens)) {
    for (const entry of accountData.fcmTokens) {
      const t = typeof entry === "string" ? entry : entry?.token;
      if (t) tokens.add(t);
    }
  }
  return [...tokens];
}

/**
 * Send a chat message and optionally push-notify a specific user or ALL users.
 * notifyAccountId can be:
 *   - "" or missing → no push
 *   - "ALL"        → push to every account except sender
 *   - "<accountId>"→ push to that specific account
 */
async function chatRoomSend(data) {
  const {
    text,
    senderAccountId,
    senderName,
    senderNameHe,
    notifyAccountId,
    mentions,
    replyTo,
    attachments,
  } = data;

  if ((!text && (!attachments || attachments.length === 0)) || !senderAccountId) {
    throw new Error("text or attachments, and senderAccountId are required");
  }

  const now = Date.now();
  const docData = {
    text: text || "",
    senderAccountId: senderAccountId,
    senderName: senderName || "",
    senderNameHe: senderNameHe || "",
    createdAt: now,
    notifyAccountId: notifyAccountId || "",
    mentions: mentions || [],
  };

  // Reply-to reference
  if (replyTo && replyTo.messageId) {
    docData.replyTo = {
      messageId: replyTo.messageId,
      text: (replyTo.text || "").substring(0, 200),
      senderName: replyTo.senderName || "",
      senderNameHe: replyTo.senderNameHe || "",
    };
  }

  // File/photo attachments (URLs already uploaded by client to Storage)
  if (Array.isArray(attachments) && attachments.length > 0) {
    docData.attachments = attachments.map((a) => ({
      url: a.url || "",
      name: a.name || "",
      type: a.type || "",
      size: a.size || 0,
    }));
  }

  const db = getDb();
  const docRef = await db.collection(CHAT_ROOM_COLLECTION).add(docData);
  const messageId = docRef.id;

  const displayName = senderName || senderNameHe || "Someone";
  const hasAttachments = Array.isArray(docData.attachments) && docData.attachments.length > 0;
  const rawPreview = text || (hasAttachments ? "📎 Attachment" : "");
  const previewText = rawPreview.length > 120 ? rawPreview.substring(0, 120) + "…" : rawPreview;

  /**
   * Build FCM payload shared by single-target and notify-all paths.
   */
  function buildPayload() {
    const notifTitle = `${displayName} in The Tunnel`;
    const notifBody = previewText;
    return {
      notification: { title: notifTitle, body: notifBody },
      data: {
        type: "CHAT_ROOM_TAG",
        senderName: senderName || "",
        senderNameHe: senderNameHe || "",
        messageId: messageId,
        screen: "chat_room",
        messagePreview: previewText,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "mgsr_team_notifications",
          tag: `chat-${messageId}`,
        },
      },
      webpush: {
        notification: {
          title: notifTitle,
          body: notifBody,
          icon: "/logo.svg",
          tag: `chat-${messageId}`,
        },
        fcmOptions: {
          link: `https://management.mgsrfa.com/chat-room?highlight=${messageId}`,
        },
      },
    };
  }

  /**
   * Send push to a single account's tokens and clean up stale ones.
   */
  async function sendPushToAccount(accountId, accountData) {
    const tokens = getAllTokens(accountData);
    if (tokens.length === 0) return;

    const payload = buildPayload();
    const messages = tokens.map((token) => ({
      token,
      notification: payload.notification,
      data: payload.data,
      android: payload.android,
      webpush: payload.webpush,
    }));

    const results = await getMessaging().sendEach(messages);

    // Clean up invalid tokens
    const invalidTokens = [];
    results.responses.forEach((resp, idx) => {
      if (resp.error && (
        resp.error.code === "messaging/registration-token-not-registered" ||
        resp.error.code === "messaging/invalid-registration-token"
      )) {
        invalidTokens.push(tokens[idx]);
      }
    });
    if (invalidTokens.length > 0) {
      try {
        const accountRef = db.collection(ACCOUNTS_COLLECTION).doc(accountId);
        const updates = {};
        if (invalidTokens.includes(accountData.fcmToken)) {
          updates.fcmToken = "";
        }
        if (Array.isArray(accountData.fcmTokens) && accountData.fcmTokens.length > 0) {
          const cleaned = accountData.fcmTokens.filter((entry) => {
            const t = typeof entry === "string" ? entry : entry?.token;
            return !invalidTokens.includes(t);
          });
          if (cleaned.length !== accountData.fcmTokens.length) {
            updates.fcmTokens = cleaned;
          }
        }
        if (Object.keys(updates).length > 0) {
          await accountRef.update(updates);
        }
      } catch (e) {
        console.error(`Chat room token cleanup failed for ${accountId}:`, e);
      }
    }
  }

  // ── Push notification logic ──
  if (notifyAccountId === "ALL") {
    // Notify everyone except the sender
    try {
      const allSnap = await db.collection(ACCOUNTS_COLLECTION).get();
      const targets = allSnap.docs.filter((d) => d.id !== senderAccountId);
      console.log(`Chat room notify ALL — sending to ${targets.length} account(s)`);
      await Promise.all(
        targets.map((d) => sendPushToAccount(d.id, d.data()).catch((e) => {
          console.error(`Chat room push to ${d.id} failed:`, e);
        }))
      );
    } catch (err) {
      console.error("Chat room notify-all error:", err);
    }
  } else if (notifyAccountId && notifyAccountId !== senderAccountId) {
    // Notify a single user
    try {
      const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(notifyAccountId).get();
      if (accountSnap.exists) {
        await sendPushToAccount(notifyAccountId, accountSnap.data());
        console.log(`Chat room push sent to ${notifyAccountId}`);
      }
    } catch (err) {
      console.error("Chat room push notification error:", err);
    }
  }

  return { id: messageId, createdAt: now };
}

/**
 * Edit an existing chat message. Only the original sender may edit.
 */
async function chatRoomEdit(data) {
  const { messageId, senderAccountId, newText } = data;
  if (!messageId || !senderAccountId || !newText) {
    throw new Error("messageId, senderAccountId and newText are required");
  }

  const db = getDb();
  const docRef = db.collection(CHAT_ROOM_COLLECTION).doc(messageId);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("Message not found");

  const msg = snap.data();
  if (msg.senderAccountId !== senderAccountId) {
    throw new Error("Only the sender can edit this message");
  }

  await docRef.update({ text: newText, editedAt: Date.now() });
  return { success: true };
}

/**
 * Delete a chat message. Only the original sender may delete.
 */
async function chatRoomDelete(data) {
  const { messageId, senderAccountId } = data;
  if (!messageId || !senderAccountId) {
    throw new Error("messageId and senderAccountId are required");
  }

  const db = getDb();
  const docRef = db.collection(CHAT_ROOM_COLLECTION).doc(messageId);
  const snap = await docRef.get();
  if (!snap.exists) throw new Error("Message not found");

  const msg = snap.data();
  if (msg.senderAccountId !== senderAccountId) {
    throw new Error("Only the sender can delete this message");
  }

  await docRef.delete();
  return { success: true };
}

module.exports = { chatRoomSend, chatRoomEdit, chatRoomDelete };
