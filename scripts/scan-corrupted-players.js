#!/usr/bin/env node
const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

async function scan() {
  for (const col of ["Players", "PlayersWomen", "PlayersYouth"]) {
    const snap = await db.collection(col).get();
    let bad = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.currentClub && typeof d.currentClub === "string") {
        bad++;
        console.log(col + "/" + doc.id + ": currentClub is STRING: " + JSON.stringify(d.currentClub).substring(0, 120));
      }
      if (d.marketValueHistory && Array.isArray(d.marketValueHistory) && d.marketValueHistory.some(e => typeof e === "string")) {
        console.log(col + "/" + doc.id + ": marketValueHistory has STRING entries");
      }
      if (d.noteList && Array.isArray(d.noteList) && d.noteList.some(e => typeof e === "string")) {
        console.log(col + "/" + doc.id + ": noteList has STRING entries");
      }
    }
    console.log(col + ": " + snap.size + " docs, " + bad + " with string currentClub");
  }
}
scan().then(() => process.exit(0));
