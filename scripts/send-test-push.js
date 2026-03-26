#!/usr/bin/env node
/**
 * One-off script: sends a mock REQUEST_ADDED push notification to Lior's device.
 * Run from project root:  node scripts/send-test-push.js
 *
 * Uses the default Firebase service account (GOOGLE_APPLICATION_CREDENTIALS or
 * gcloud default credentials).
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize with project defaults
initializeApp({ projectId: "mgsr-64e4b" });
const db = getFirestore();

async function main() {
  // Find Lior's account by email
  const snap = await db.collection("Accounts")
    .where("email", "==", "dahanliordahan@gmail.com")
    .limit(1)
    .get();

  if (snap.empty) {
    console.error("Account not found!");
    process.exit(1);
  }

  const doc = snap.docs[0];
  const data = doc.data();
  console.log(`Found account: ${doc.id} — ${data.email}`);

  // Collect all tokens
  const tokens = new Set();
  if (data.fcmToken) tokens.add(data.fcmToken);
  if (Array.isArray(data.fcmTokens)) {
    for (const entry of data.fcmTokens) {
      const t = typeof entry === "string" ? entry : entry?.token;
      if (t) tokens.add(t);
    }
  }

  if (tokens.size === 0) {
    console.error("No FCM tokens found for this account!");
    process.exit(1);
  }
  console.log(`Sending to ${tokens.size} token(s)…`);

  const payload = {
    notification: {
      title: "New Club Request",
      body: "Roy Elgrabli added a new request from Test Player FC",
    },
    data: {
      type: "REQUEST_ADDED",
      playerName: "Test Player FC",
      oldValue: "",
      newValue: "",
      extraInfo: "",
      agentName: "Roy Elgrabli",
      playerTmProfile: "https://www.transfermarkt.com/test-player/profil/spieler/12345",
    },
    android: {
      priority: "high",
      notification: { channelId: "mgsr_team_notifications" },
    },
  };

  const messages = [...tokens].map(token => ({ token, ...payload }));
  const result = await getMessaging().sendEach(messages);

  result.responses.forEach((resp, i) => {
    if (resp.success) {
      console.log(`✅ Token ${i + 1}: sent successfully (messageId: ${resp.messageId})`);
    } else {
      console.error(`❌ Token ${i + 1}: ${resp.error?.message}`);
    }
  });
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
