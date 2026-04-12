/**
 * Notification Center callables — mark read / mark all read.
 */
const { getFirestore } = require("firebase-admin/firestore");

const ACCOUNTS_COLLECTION = "Accounts";
const NOTIFICATIONS_SUBCOLLECTION = "Notifications";

/**
 * Mark a single notification as read.
 * @param {{ accountId: string, notificationId: string }} data
 */
async function notificationMarkRead(data) {
  const { accountId, notificationId } = data || {};
  if (!accountId || !notificationId) {
    throw new Error("Missing accountId or notificationId");
  }

  const db = getFirestore();
  const docRef = db
    .collection(ACCOUNTS_COLLECTION)
    .doc(accountId)
    .collection(NOTIFICATIONS_SUBCOLLECTION)
    .doc(notificationId);

  const snap = await docRef.get();
  if (!snap.exists) {
    throw new Error("Notification not found");
  }

  await docRef.update({ read: true });
  return { success: true };
}

/**
 * Mark all notifications as read for an account.
 * @param {{ accountId: string }} data
 */
async function notificationMarkAllRead(data) {
  const { accountId } = data || {};
  if (!accountId) {
    throw new Error("Missing accountId");
  }

  const db = getFirestore();
  const notifRef = db
    .collection(ACCOUNTS_COLLECTION)
    .doc(accountId)
    .collection(NOTIFICATIONS_SUBCOLLECTION);

  const unread = await notifRef.where("read", "==", false).get();
  if (unread.empty) return { success: true, updated: 0 };

  const batch = db.batch();
  unread.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
  await batch.commit();

  return { success: true, updated: unread.size };
}

module.exports = { notificationMarkRead, notificationMarkAllRead };
