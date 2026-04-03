const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();
db.collection("Accounts").doc("kqFhvtrzs25r3fSKbBCI").get().then(snap => {
  const d = snap.data();
  console.log("fcmToken:", JSON.stringify(d.fcmToken));
  console.log("fcmTokens:", JSON.stringify(d.fcmTokens));
  console.log("email:", d.email);
  console.log("name:", d.name);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
