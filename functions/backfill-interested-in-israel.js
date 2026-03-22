/**
 * One-time script: Set interestedInIsrael = true for players
 * who have "Israel" in their mandate validLeagues.
 *
 * How it works:
 * 1. Queries all MANDATE documents in PlayerDocuments
 * 2. Finds which playerTmProfiles have "Israel" in validLeagues
 * 3. Looks up matching Players by tmProfile
 * 4. Sets interestedInIsrael = true on those players
 *
 * Usage:
 *   cd functions && node ../scripts/backfill-interested-in-israel.js
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to service account key
 *   - OR run: firebase login && export GOOGLE_APPLICATION_CREDENTIALS=...
 *   - Alternatively, run from Cloud Shell where default creds are available
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize — uses default credentials or GOOGLE_APPLICATION_CREDENTIALS
initializeApp();
const db = getFirestore();

const PLAYERS_COLLECTION = "Players";
const PLAYER_DOCUMENTS_COLLECTION = "PlayerDocuments";

async function run() {
  console.log("=== Backfill interestedInIsrael from mandate validLeagues ===\n");

  // Step 1: Get all mandate documents
  console.log("Step 1: Querying all MANDATE documents...");
  const mandateSnap = await db
    .collection(PLAYER_DOCUMENTS_COLLECTION)
    .where("type", "==", "MANDATE")
    .get();

  console.log(`  Found ${mandateSnap.size} mandate documents total.`);

  // Step 2: Find profiles that have "Israel" in validLeagues
  const profilesWithIsrael = new Set();
  for (const doc of mandateSnap.docs) {
    const data = doc.data();
    const leagues = data.validLeagues;
    if (!Array.isArray(leagues)) continue;

    const hasIsrael = leagues.some(
      (league) => typeof league === "string" && league.toLowerCase().includes("israel")
    );

    if (hasIsrael && data.playerTmProfile) {
      profilesWithIsrael.add(data.playerTmProfile);
    }
  }

  console.log(`  Found ${profilesWithIsrael.size} player profiles with Israel in validLeagues.`);
  if (profilesWithIsrael.size > 0) {
    console.log(`  Profiles: ${[...profilesWithIsrael].join(", ")}`);
  }

  if (profilesWithIsrael.size === 0) {
    console.log("\nNo players to update. Done.");
    return;
  }

  // Step 3: Find matching players and update them
  console.log("\nStep 2: Updating matching players...");
  const playersSnap = await db.collection(PLAYERS_COLLECTION).get();
  console.log(`  Total players in collection: ${playersSnap.size}`);

  let updated = 0;
  let alreadySet = 0;
  let notMatched = 0;
  const batch = db.batch();
  const MAX_BATCH = 500;

  for (const doc of playersSnap.docs) {
    const player = doc.data();
    const tmProfile = player.tmProfile;

    if (!tmProfile || !profilesWithIsrael.has(tmProfile)) {
      continue;
    }

    if (player.interestedInIsrael === true) {
      alreadySet++;
      console.log(`  ✓ ${player.fullName || doc.id} — already set, skipping`);
      continue;
    }

    batch.update(doc.ref, { interestedInIsrael: true });
    updated++;
    console.log(`  → ${player.fullName || doc.id} — will set interestedInIsrael = true`);

    if (updated >= MAX_BATCH) {
      console.log(`  Committing batch of ${updated}...`);
      await batch.commit();
    }
  }

  if (updated > 0) {
    await batch.commit();
  }

  console.log(`\n=== Done ===`);
  console.log(`  Updated:     ${updated}`);
  console.log(`  Already set: ${alreadySet}`);
  console.log(`  Total with Israel mandate: ${profilesWithIsrael.size}`);
}

run().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
