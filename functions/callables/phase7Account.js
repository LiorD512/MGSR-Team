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
    const emailLower = email.toLowerCase();
    // Try exact match first (fast indexed query)
    let snap = await db.collection("Accounts")
      .where("email", "==", email)
      .limit(1)
      .get();
    // Fallback: case-insensitive scan
    if (snap.empty) {
      const allSnap = await db.collection("Accounts").get();
      const match = allSnap.docs.find(d => (d.data().email || "").toLowerCase() === emailLower);
      if (match) {
        accountId = match.id;
      } else {
        throw new Error("No account found for email.");
      }
    } else {
      accountId = snap.docs[0].id;
    }
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
      // Read current tokens, replace any with same token string to avoid duplicates
      const accountSnap = await db.collection("Accounts").doc(accountId).get();
      const existing = accountSnap.exists ? (accountSnap.data().fcmTokens || []) : [];
      const filtered = existing.filter((e) => {
        const t = typeof e === "string" ? e : e?.token;
        return t !== token;
      });
      filtered.push({ token, platform: "web", updatedAt: Date.now() });
      updates.fcmTokens = filtered;
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
    return { success: true };
  }

  await db.collection("Accounts").doc(accountId).update(updates);
  return { success: true };
}

module.exports = { accountUpdate };
