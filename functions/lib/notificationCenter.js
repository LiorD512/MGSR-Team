/**
 * Notification Center persistence — stores the last 20 push notifications
 * per user in Accounts/{accountId}/Notifications subcollection.
 *
 * Called by every Cloud Function that sends FCM push notifications.
 */
const { getFirestore } = require("firebase-admin/firestore");

const ACCOUNTS_COLLECTION = "Accounts";
const NOTIFICATIONS_SUBCOLLECTION = "Notifications";
const MAX_NOTIFICATIONS = 20;

/**
 * Persist a notification to a single user's notification center.
 * Keeps only the latest MAX_NOTIFICATIONS entries.
 *
 * @param {string} accountId - Firestore Account doc ID
 * @param {object} notification - { type, title, body, data }
 */
async function persistNotification(accountId, { type, title, body, data }) {
  const db = getFirestore();
  const notifRef = db
    .collection(ACCOUNTS_COLLECTION)
    .doc(accountId)
    .collection(NOTIFICATIONS_SUBCOLLECTION);

  await notifRef.add({
    type: type || "",
    title: title || "",
    body: body || "",
    data: data || {},
    timestamp: Date.now(),
    read: false,
  });

  // Prune: keep only the latest MAX_NOTIFICATIONS
  try {
    const allNotifs = await notifRef
      .orderBy("timestamp", "desc")
      .offset(MAX_NOTIFICATIONS)
      .get();
    if (!allNotifs.empty) {
      const batch = db.batch();
      allNotifs.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn("[notificationCenter] Prune failed:", err.message);
  }
}

/**
 * Persist a notification to ALL accounts' notification centers.
 * Used for broadcast notifications (e.g. FeedEvent topic pushes).
 *
 * @param {object} notification - { type, title, body, data }
 * @param {string} [excludeAccountId] - Optional account ID to exclude (e.g. sender)
 */
async function persistNotificationToAll({ type, title, body, data }, excludeAccountId) {
  const db = getFirestore();
  const accountsSnap = await db.collection(ACCOUNTS_COLLECTION).get();
  const promises = accountsSnap.docs
    .filter((doc) => doc.id !== excludeAccountId)
    .map((doc) =>
      persistNotification(doc.id, { type, title, body, data }).catch((err) => {
        console.warn(`[notificationCenter] Failed for ${doc.id}:`, err.message);
      })
    );
  await Promise.all(promises);
}

module.exports = { persistNotification, persistNotificationToAll };
