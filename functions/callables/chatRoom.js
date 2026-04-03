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
 * Send a chat message and optionally push-notify a specific user.
 */
async function chatRoomSend(data) {
  const {
    text,
    senderAccountId,
    senderName,
    senderNameHe,
    notifyAccountId,
    mentions,
  } = data;

  if (!text || !senderAccountId) {
    throw new Error("text and senderAccountId are required");
  }

  const now = Date.now();
  const docData = {
    text: text,
    senderAccountId: senderAccountId,
    senderName: senderName || "",
    senderNameHe: senderNameHe || "",
    createdAt: now,
    notifyAccountId: notifyAccountId || "",
    mentions: mentions || [],
  };

  const db = getDb();
  const docRef = await db.collection(CHAT_ROOM_COLLECTION).add(docData);
  const messageId = docRef.id;

  // If there's a target user for push notification, send it
  if (notifyAccountId && notifyAccountId !== senderAccountId) {
    try {
      const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(notifyAccountId).get();
      if (accountSnap.exists) {
        const accountData = accountSnap.data();
        const tokens = getAllTokens(accountData);

        if (tokens.length > 0) {
          const displayName = senderName || senderNameHe || "Someone";
          const previewText = text.length > 120 ? text.substring(0, 120) + "…" : text;

          const notifTitle = `${displayName} tagged you in Chat Room`;
          const notifBody = previewText;

          const payload = {
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
                link: `/chat-room?highlight=${messageId}`,
              },
            },
          };

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
              const accountRef = db.collection(ACCOUNTS_COLLECTION).doc(notifyAccountId);
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
              console.error(`Chat room token cleanup failed for ${notifyAccountId}:`, e);
            }
          }

          console.log(`Chat room push sent to ${notifyAccountId} (${tokens.length} token(s))`);
        }
      }
    } catch (err) {
      console.error("Chat room push notification error:", err);
    }
  }

  return { id: messageId, createdAt: now };
}

module.exports = { chatRoomSend };
