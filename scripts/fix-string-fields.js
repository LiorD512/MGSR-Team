#!/usr/bin/env node
/**
 * Find and fix player documents where currentClub is a string instead of a map.
 * Also fixes passportDetails, marketValueHistory, noteList if stored incorrectly.
 */
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function fixCollection(colName) {
  const snap = await db.collection(colName).get();
  let fixed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const updates = {};

    // currentClub: should be a map, not a string
    if (typeof data.currentClub === "string" && data.currentClub.length > 0) {
      // Try to parse if it looks like Kotlin toString() output: Club(clubName=..., ...)
      const str = data.currentClub;
      if (str.startsWith("Club(")) {
        // Extract fields from Kotlin toString
        const clubName = str.match(/clubName=([^,)]*)/)?.[1] || null;
        const clubLogo = str.match(/clubLogo=([^,)]*)/)?.[1] || null;
        const clubTmProfile = str.match(/clubTmProfile=([^,)]*)/)?.[1] || null;
        const clubCountry = str.match(/clubCountry=([^,)]*)/)?.[1] || null;
        updates.currentClub = {
          clubName: clubName === "null" ? null : clubName,
          clubLogo: clubLogo === "null" ? null : clubLogo,
          clubTmProfile: clubTmProfile === "null" ? null : clubTmProfile,
          clubCountry: clubCountry === "null" ? null : clubCountry,
        };
      } else {
        // Plain string — wrap as club name
        updates.currentClub = { clubName: str };
      }
      console.log(`  FIX ${colName}/${doc.id}: currentClub "${str.substring(0,80)}" → ${JSON.stringify(updates.currentClub)}`);
    }

    // passportDetails: should be a map, not a string
    if (typeof data.passportDetails === "string") {
      const str = data.passportDetails;
      if (str.startsWith("PassportDetails(")) {
        const firstName = str.match(/firstName=([^,)]*)/)?.[1] || null;
        const lastName = str.match(/lastName=([^,)]*)/)?.[1] || null;
        const dateOfBirth = str.match(/dateOfBirth=([^,)]*)/)?.[1] || null;
        const passportNumber = str.match(/passportNumber=([^,)]*)/)?.[1] || null;
        const nationality = str.match(/nationality=([^,)]*)/)?.[1] || null;
        updates.passportDetails = {
          firstName: firstName === "null" ? null : firstName,
          lastName: lastName === "null" ? null : lastName,
          dateOfBirth: dateOfBirth === "null" ? null : dateOfBirth,
          passportNumber: passportNumber === "null" ? null : passportNumber,
          nationality: nationality === "null" ? null : nationality,
        };
        console.log(`  FIX ${colName}/${doc.id}: passportDetails string → map`);
      }
    }

    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
      fixed++;
    }
  }
  console.log(`${colName}: ${snap.size} docs checked, ${fixed} fixed`);
}

async function main() {
  await fixCollection("Players");
  await fixCollection("PlayersWomen");
  await fixCollection("PlayersYouth");
  console.log("\nDone.");
}

main().catch(console.error);
