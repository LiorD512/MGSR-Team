/**
 * Phase 7 callable — accountUpdate.
 * Updates fields on the caller's Account document (FCM token, language, web push tokens).
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { str } = require("../lib/validation");

function getDb() {
  return getFirestore();
}

// ═══════════════════════════════════════════════════════════════════════════
// accountUpdate — update fields on an Account doc by accountId
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_FIELDS = new Set([
  "fcmToken", "language",
]);

async function accountUpdate(data) {
  const db = getDb();
  let accountId = str(data.accountId);
  const email = str(data.email);

  // Look up by email if accountId is not provided
  if (!accountId && email) {
    const snap = await db.collection("Accounts")
      .where("email", "==", email)
      .limit(1)
      .get();
    if (snap.empty) throw new Error("No account found for email.");
    accountId = snap.docs[0].id;
  }
  if (!accountId) throw new Error("accountId or email is required.");

  const updates = {};

  // Simple string fields
  for (const key of ALLOWED_FIELDS) {
    if (key in data && data[key] !== undefined) {
      updates[key] = data[key];
    }
  }

  // Web FCM token array operations
  if (data.addFcmWebToken) {
    const token = str(data.addFcmWebToken);
    if (token) {
      updates.fcmTokens = FieldValue.arrayUnion({
        token,
        platform: "web",
        updatedAt: Date.now(),
      });
    }
  }
  if (data.removeFcmWebToken) {
    // removeFcmWebToken should be the full entry object for exact match
    const entry = data.removeFcmWebToken;
    if (entry && typeof entry === "object" && entry.token) {
      updates.fcmTokens = FieldValue.arrayRemove(entry);
    }
  }

  if (Object.keys(updates).length === 0) {
    return { success: true }; // Nothing to update
  }

  await db.collection("Accounts").doc(accountId).update(updates);
  return { success: true };
}

module.exports = { accountUpdate };
