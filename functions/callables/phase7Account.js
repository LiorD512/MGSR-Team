/**
 * Phase 7 callable — accountUpdate.
 * Updates fields on the caller's Account document (FCM token, language, web push tokens).
 */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
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

  console.log("[accountUpdate] CALLED — accountId:", accountId || "(none)", "email:", email || "(none)",
    "addFcmWebToken:", data.addFcmWebToken ? "YES" : "no",
    "keys:", Object.keys(data).join(","));

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
        console.error("[accountUpdate] NO ACCOUNT found for email:", emailLower);
        throw new Error("No account found for email.");
      }
    } else {
      accountId = snap.docs[0].id;
    }
  }
  if (!accountId) {
    console.error("[accountUpdate] MISSING accountId AND email — cannot proceed");
    throw new Error("accountId or email is required.");
  }

  console.log("[accountUpdate] Resolved accountId:", accountId);

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
    console.log("[accountUpdate] addFcmWebToken present, token length:", token.length, "first20:", token.substring(0, 20));
    if (token) {
      // Validate the token with a dry-run send — reject dead tokens
      let tokenAlive = true;
      try {
        await getMessaging().send({ token, data: { test: "1" } }, /* dryRun */ true);
        console.log("[accountUpdate] TOKEN VALIDATION: ALIVE ✓ token:", token.substring(0, 30));
      } catch (valErr) {
        const code = valErr.code || "";
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          console.error("[accountUpdate] TOKEN VALIDATION: DEAD ✗ REJECTING token:", token.substring(0, 30), "error:", code);
          tokenAlive = false;
        } else {
          // Other errors (network, quota) — save anyway, don't block
          console.warn("[accountUpdate] TOKEN VALIDATION: inconclusive, saving anyway. error:", code, valErr.message);
        }
      }
      if (tokenAlive) {
        // Read current tokens, replace any with same token string to avoid duplicates
        const accountSnap = await db.collection("Accounts").doc(accountId).get();
        const existing = accountSnap.exists ? (accountSnap.data().fcmTokens || []) : [];
        console.log("[accountUpdate] Existing fcmTokens count:", existing.length);
        const filtered = existing.filter((e) => {
          const t = typeof e === "string" ? e : e?.token;
          return t !== token;
        });
        filtered.push({ token, platform: "web", updatedAt: Date.now() });
        updates.fcmTokens = filtered;
        console.log("[accountUpdate] Will write fcmTokens count:", filtered.length);
      }
    } else {
      console.warn("[accountUpdate] addFcmWebToken was truthy but str() returned empty");
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
    console.log("[accountUpdate] No updates to apply — returning early");
    return { success: true };
  }

  console.log("[accountUpdate] WRITING to Accounts/" + accountId, "fields:", Object.keys(updates).join(","));
  await db.collection("Accounts").doc(accountId).update(updates);
  console.log("[accountUpdate] WRITE SUCCESS for", accountId);
  return { success: true };
}

module.exports = { accountUpdate };
