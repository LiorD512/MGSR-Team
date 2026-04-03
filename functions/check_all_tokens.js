const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();
db.collection("Accounts").get().then(snap => {
  snap.docs.forEach(doc => {
    const d = doc.data();
    const hasLegacy = !!d.fcmToken;
    const webTokenCount = Array.isArray(d.fcmTokens) ? d.fcmTokens.length : 0;
    console.log(`${doc.id} | ${(d.name || '').padEnd(20)} | email=${(d.email || '').padEnd(30)} | fcmToken=${hasLegacy ? 'YES' : 'NO'} | fcmTokens=${webTokenCount}`);
  });
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
