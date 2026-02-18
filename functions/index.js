const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();

/**
 * FCM topic that every Android device subscribes to (see MGSRTeamApplication / FcmTokenManager).
 * Must stay in sync with the Android constant FcmTokenManager.FCM_TOPIC.
 */
const FCM_TOPIC = "mgsr_all";

/**
 * Only these FeedEvent types trigger a push notification.
 */
const NOTIFIABLE_TYPES = [
  "BECAME_FREE_AGENT",
  "CLUB_CHANGE",
  "MARKET_VALUE_CHANGE",
  "NEW_RELEASE_FROM_CLUB",
  "MANDATE_EXPIRED",
];

/**
 * Triggered every time a new document is created in the FeedEvents collection
 * (written by PlayerRefreshWorker on the admin device).
 *
 * Sends BOTH a `notification` payload (English fallback for reliable background
 * delivery on Xiaomi/Huawei/OPPO that block data-only messages) AND a `data`
 * payload (so the Android side can build localised text when in the foreground).
 */
exports.onNewFeedEvent = onDocumentCreated("FeedEvents/{eventId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const type = data.type || "";
  if (!NOTIFIABLE_TYPES.includes(type)) return;

  const playerName = data.playerName || "Unknown";
  const oldValue = data.oldValue || "";
  const newValue = data.newValue || "";
  const extraInfo = data.extraInfo || "";

  let title;
  let body;

  switch (type) {
    case "MARKET_VALUE_CHANGE":
      title = "Market Value Change";
      body = `${playerName}: ${oldValue} → ${newValue}`;
      break;
    case "CLUB_CHANGE":
      title = "Club Transfer";
      body = `${playerName} moved from ${oldValue} to ${newValue}`;
      break;
    case "BECAME_FREE_AGENT":
      title = "Free Agent Alert";
      body = `${playerName} is now without a club (was at ${oldValue})`;
      break;
    case "NEW_RELEASE_FROM_CLUB":
      title = "New Free Agent";
      body =
        extraInfo === "NOT_IN_DATABASE"
          ? `${playerName} released from his club — maybe you want to approach him. Not in our database.`
          : `${playerName} released from his club — maybe you want to approach him.`;
      break;
    case "MANDATE_EXPIRED":
      title = "Mandate Expired";
      body = `${playerName}'s mandate has expired.`;
      break;
    default:
      title = "MGSR Team Update";
      body = `New update for ${playerName}`;
  }

  const message = {
    topic: FCM_TOPIC,
    notification: { title, body },
    data: {
      type,
      playerName,
      oldValue,
      newValue,
      extraInfo: extraInfo || "",
      playerTmProfile: data.playerTmProfile || "",
    },
    android: {
      priority: "high",
      notification: {
        channelId: "mgsr_team_notifications",
      },
    },
  };

  try {
    await getMessaging().send(message);
    console.log(`Push sent for ${type}: ${playerName}`);
  } catch (err) {
    console.error("FCM send error:", err);
  }
});
