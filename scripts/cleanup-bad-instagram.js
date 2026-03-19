const admin = require("firebase-admin");

admin.initializeApp({ projectId: "mgsr-64e4b" });
const db = admin.firestore();

const TM_OWNED = new Set(["transfermarkt_official", "transfermarkt", "transfermarkt.de"]);

async function cleanup() {
  const collections = ["Shortlists", "WomenShortlists", "YouthShortlists"];
  let totalFixed = 0;

  for (const col of collections) {
    const snap = await db.collection(col).get();
    let fixed = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      const handle = data.instagramHandle;
      if (handle && TM_OWNED.has(handle.toLowerCase())) {
        await doc.ref.update({
          instagramHandle: admin.firestore.FieldValue.delete(),
          instagramUrl: admin.firestore.FieldValue.delete(),
          instagramSentAt: admin.firestore.FieldValue.delete(),
        });
        const name = data.playerName || "unknown";
        console.log("[CLEANED] " + col + "/" + doc.id + " had @" + handle + " (" + name + ")");
        fixed++;
      }
    }
    console.log(col + ": scanned " + snap.size + " docs, cleaned " + fixed);
    totalFixed += fixed;
  }
  console.log("\nDone. Total cleaned: " + totalFixed);
}

cleanup().catch((e) => {
  console.error(e);
  process.exit(1);
});
