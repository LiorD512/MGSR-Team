#!/usr/bin/env node
/**
 * Phase 3 Smoke Test — Verify player callables produce correct Firestore docs.
 *
 * Usage:
 *   cd functions && npm install   (if not done)
 *   cd ..
 *   node scripts/test-phase3-callables.js
 *
 * Tests:
 *   1. playersUpdate — update fields, delete fields
 *   2. playersToggleMandate — toggle on/off + FeedEvent
 *   3. playersAddNote — append note + FeedEvent + salary extraction (men)
 *   4. playersDeleteNote — remove note by index + FeedEvent
 *   5. playersDelete — delete player + FeedEvent
 *   6. playerDocumentsCreate — create doc entry + FeedEvent for mandates
 *   7. playerDocumentsDelete — delete doc entry + optional passport clear
 *   8. playerDocumentsMarkExpired — mark expired flag
 *
 * Runs on all 3 platforms (men, women, youth).
 * All test docs use "__PHASE3_TEST__" prefix.
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const {
  playersUpdate,
  playersToggleMandate,
  playersAddNote,
  playersDeleteNote,
  playersDelete,
  playerDocumentsCreate,
  playerDocumentsDelete,
  playerDocumentsMarkExpired,
} = require("../functions/callables/players");

const COLLECTIONS = {
  men: { players: "Players", feed: "FeedEvents" },
  women: { players: "PlayersWomen", feed: "FeedEventsWomen" },
  youth: { players: "PlayersYouth", feed: "FeedEventsYouth" },
};

const TEST_PREFIX = "__PHASE3_TEST__";
let passed = 0;
let failed = 0;
const cleanupIds = { players: [], documents: [], feedEvents: [] };

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${label}: ${JSON.stringify(actual)}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function createTestPlayer(platform) {
  const col = COLLECTIONS[platform].players;
  const data = {
    fullName: `${TEST_PREFIX}Player`,
    noteList: [],
    haveMandate: false,
    interestedInIsrael: false,
    createdAt: Date.now(),
  };
  if (platform === "men") data.tmProfile = `${TEST_PREFIX}tmprofile`;
  const ref = await db.collection(col).add(data);
  cleanupIds.players.push({ col, id: ref.id });
  return ref.id;
}

async function cleanup() {
  console.log("\n🧹 Cleanup...");
  for (const { col, id } of cleanupIds.players) {
    try { await db.collection(col).doc(id).delete(); } catch {}
  }
  for (const id of cleanupIds.documents) {
    try { await db.collection("PlayerDocuments").doc(id).delete(); } catch {}
  }
  for (const { col, id } of cleanupIds.feedEvents) {
    try { await db.collection(col).doc(id).delete(); } catch {}
  }
  // Also clean up any feed events with TEST_PREFIX in playerName
  for (const platform of ["men", "women", "youth"]) {
    const feedCol = COLLECTIONS[platform].feed;
    const snap = await db.collection(feedCol).where("playerName", "==", `${TEST_PREFIX}Player`).get();
    for (const d of snap.docs) {
      try { await d.ref.delete(); } catch {}
    }
  }
  console.log("  Done.\n");
}

async function testPlayersUpdate(platform) {
  console.log(`\n── playersUpdate (${platform}) ──`);
  const playerId = await createTestPlayer(platform);

  // Update fields
  await playersUpdate({
    platform,
    playerId,
    interestedInIsrael: true,
    salaryRange: "50k-100k",
    playerPhoneNumber: "+1234567890",
  });

  const snap = await db.collection(COLLECTIONS[platform].players).doc(playerId).get();
  const data = snap.data();
  assertEqual(data.interestedInIsrael, true, "interestedInIsrael set");
  assertEqual(data.salaryRange, "50k-100k", "salaryRange set");
  assertEqual(data.playerPhoneNumber, "+1234567890", "playerPhoneNumber set");

  // Delete fields via _deleteFields
  await playersUpdate({
    platform,
    playerId,
    _deleteFields: ["salaryRange", "playerPhoneNumber"],
  });

  const snap2 = await db.collection(COLLECTIONS[platform].players).doc(playerId).get();
  const data2 = snap2.data();
  assert(data2.salaryRange === undefined, "salaryRange deleted");
  assert(data2.playerPhoneNumber === undefined, "playerPhoneNumber deleted");
  assertEqual(data2.interestedInIsrael, true, "interestedInIsrael preserved"); 
}

async function testPlayersToggleMandate(platform) {
  console.log(`\n── playersToggleMandate (${platform}) ──`);
  const playerId = await createTestPlayer(platform);
  const refId = platform === "men" ? `${TEST_PREFIX}tmprofile` : playerId;

  // Toggle ON
  await playersToggleMandate({
    platform,
    playerId,
    hasMandate: true,
    playerRefId: refId,
    playerName: `${TEST_PREFIX}Player`,
    playerImage: "test.jpg",
    agentName: "TestAgent",
  });

  const snap = await db.collection(COLLECTIONS[platform].players).doc(playerId).get();
  assertEqual(snap.data().haveMandate, true, "haveMandate true");

  // Check FeedEvent
  const feedCol = COLLECTIONS[platform].feed;
  const feedSnap = await db.collection(feedCol)
    .where("type", "==", "MANDATE_SWITCHED_ON")
    .where("playerName", "==", `${TEST_PREFIX}Player`)
    .get();
  assert(!feedSnap.empty, "MANDATE_SWITCHED_ON FeedEvent created");
  if (!feedSnap.empty) {
    const fe = feedSnap.docs[0].data();
    assertEqual(fe.agentName, "TestAgent", "FeedEvent agentName");
    cleanupIds.feedEvents.push({ col: feedCol, id: feedSnap.docs[0].id });
  }

  // Toggle OFF
  await playersToggleMandate({
    platform,
    playerId,
    hasMandate: false,
    playerRefId: refId,
    playerName: `${TEST_PREFIX}Player`,
    playerImage: "test.jpg",
    agentName: "TestAgent",
  });

  const snap2 = await db.collection(COLLECTIONS[platform].players).doc(playerId).get();
  assertEqual(snap2.data().haveMandate, false, "haveMandate false");
}

async function testPlayersAddNote(platform) {
  console.log(`\n── playersAddNote (${platform}) ──`);
  const playerId = await createTestPlayer(platform);
  const refId = platform === "men" ? `${TEST_PREFIX}tmprofile` : playerId;

  await playersAddNote({
    platform,
    playerId,
    playerRefId: refId,
    noteText: "Test note: salary 80k/year",
    createdBy: "Tester",
    createdByHe: "בודק",
    playerName: `${TEST_PREFIX}Player`,
    playerImage: "test.jpg",
    agentName: "TestAgent",
  });

  const snap = await db.collection(COLLECTIONS[platform].players).doc(playerId).get();
  const data = snap.data();
  assert(Array.isArray(data.noteList) && data.noteList.length === 1, "noteList has 1 note");
  assertEqual(data.noteList[0].notes, "Test note: salary 80k/year", "note text");
  assertEqual(data.noteList[0].createBy, "Tester", "note createBy");
  assertEqual(data.noteList[0].createByHe, "בודק", "note createByHe");

  // Men-only: check salary extraction
  if (platform === "men") {
    assert(data.salaryRange != null, "salary extracted from note (men only)");
  }

  // Check FeedEvent
  const feedCol = COLLECTIONS[platform].feed;
  const feedSnap = await db.collection(feedCol)
    .where("type", "==", "NOTE_ADDED")
    .where("playerName", "==", `${TEST_PREFIX}Player`)
    .get();
  assert(!feedSnap.empty, "NOTE_ADDED FeedEvent created");
}

async function testPlayersDeleteNote(platform) {
  console.log(`\n── playersDeleteNote (${platform}) ──`);
  const playerId = await createTestPlayer(platform);
  const refId = platform === "men" ? `${TEST_PREFIX}tmprofile` : playerId;

  // Add a note first
  await playersAddNote({
    platform,
    playerId,
    playerRefId: refId,
    noteText: "Note to delete",
    createdBy: "Tester",
    playerName: `${TEST_PREFIX}Player`,
    agentName: "TestAgent",
  });

  // Delete by index 0
  await playersDeleteNote({
    platform,
    playerId,
    playerRefId: refId,
    noteIndex: 0,
    playerName: `${TEST_PREFIX}Player`,
    agentName: "TestAgent",
  });

  const snap = await db.collection(COLLECTIONS[platform].players).doc(playerId).get();
  const data = snap.data();
  assertEqual(data.noteList.length, 0, "noteList empty after delete");

  // Check FeedEvent
  const feedCol = COLLECTIONS[platform].feed;
  const feedSnap = await db.collection(feedCol)
    .where("type", "==", "NOTE_DELETED")
    .where("playerName", "==", `${TEST_PREFIX}Player`)
    .get();
  assert(!feedSnap.empty, "NOTE_DELETED FeedEvent created");
}

async function testPlayersDelete(platform) {
  console.log(`\n── playersDelete (${platform}) ──`);
  const playerId = await createTestPlayer(platform);
  const refId = platform === "men" ? `${TEST_PREFIX}tmprofile` : playerId;
  // Remove from cleanup since the callable deletes it
  cleanupIds.players = cleanupIds.players.filter((p) => p.id !== playerId);

  await playersDelete({
    platform,
    playerId,
    playerRefId: refId,
    playerName: `${TEST_PREFIX}Player`,
    playerImage: "test.jpg",
    agentName: "TestAgent",
  });

  const snap = await db.collection(COLLECTIONS[platform].players).doc(playerId).get();
  assert(!snap.exists, "player document deleted");

  // Check FeedEvent
  const feedCol = COLLECTIONS[platform].feed;
  const feedSnap = await db.collection(feedCol)
    .where("type", "==", "PLAYER_DELETED")
    .where("playerName", "==", `${TEST_PREFIX}Player`)
    .get();
  assert(!feedSnap.empty, "PLAYER_DELETED FeedEvent created");
}

async function testPlayerDocumentsCreate(platform) {
  console.log(`\n── playerDocumentsCreate (${platform}) ──`);
  const playerId = await createTestPlayer(platform);
  const refId = platform === "men" ? `${TEST_PREFIX}tmprofile` : playerId;

  // Create a mandate doc
  const result = await playerDocumentsCreate({
    platform,
    playerRefId: refId,
    type: "MANDATE",
    name: "test-mandate.pdf",
    storageUrl: "https://example.com/test.pdf",
    expiresAt: Date.now() + 86400000,
    uploadedBy: "TestAgent",
    playerName: `${TEST_PREFIX}Player`,
    playerImage: "test.jpg",
    agentName: "TestAgent",
  });

  assert(result.id != null, "returned document ID");
  if (result.id) {
    cleanupIds.documents.push(result.id);
    const snap = await db.collection("PlayerDocuments").doc(result.id).get();
    const data = snap.data();
    assertEqual(data.type, "MANDATE", "type is MANDATE");
    assertEqual(data.name, "test-mandate.pdf", "name");
    assertEqual(data.storageUrl, "https://example.com/test.pdf", "storageUrl");
    assert(data.expiresAt > 0, "expiresAt set");
    assertEqual(data.uploadedBy, "TestAgent", "uploadedBy");

    // Check platform-specific link key
    if (platform === "men") assertEqual(data.playerTmProfile, refId, "playerTmProfile link key");
    if (platform === "women") assertEqual(data.playerWomenId, refId, "playerWomenId link key");
    if (platform === "youth") assertEqual(data.playerYouthId, refId, "playerYouthId link key");
  }

  // Check mandate FeedEvent
  const feedCol = COLLECTIONS[platform].feed;
  const feedSnap = await db.collection(feedCol)
    .where("type", "==", "MANDATE_UPLOADED")
    .where("playerName", "==", `${TEST_PREFIX}Player`)
    .get();
  assert(!feedSnap.empty, "MANDATE_UPLOADED FeedEvent created");
}

async function testPlayerDocumentsDelete(platform) {
  console.log(`\n── playerDocumentsDelete (${platform}) ──`);
  const playerId = await createTestPlayer(platform);
  const refId = platform === "men" ? `${TEST_PREFIX}tmprofile` : playerId;

  // Create a passport doc
  const result = await playerDocumentsCreate({
    platform,
    playerRefId: refId,
    type: "PASSPORT",
    name: "test-passport.pdf",
    storageUrl: "https://example.com/passport.pdf",
  });

  assert(result.id != null, "document created");

  // Set passportDetails on the player
  await db.collection(COLLECTIONS[platform].players).doc(playerId).update({
    passportDetails: { firstName: "Test", lastName: "Player" },
  });

  // Delete with clearPassport
  await playerDocumentsDelete({
    platform,
    documentId: result.id,
    clearPassport: true,
    playerId,
  });

  const docSnap = await db.collection("PlayerDocuments").doc(result.id).get();
  assert(!docSnap.exists, "document deleted");

  const playerSnap = await db.collection(COLLECTIONS[platform].players).doc(playerId).get();
  assert(playerSnap.data().passportDetails === undefined, "passportDetails cleared");
}

async function testPlayerDocumentsMarkExpired() {
  console.log("\n── playerDocumentsMarkExpired ──");
  // Create a test doc directly
  const ref = await db.collection("PlayerDocuments").add({
    type: "MANDATE",
    name: "test-expire.pdf",
    storageUrl: "https://example.com/test.pdf",
    playerTmProfile: `${TEST_PREFIX}profile`,
    expiresAt: Date.now() - 1000,
    expired: false,
    uploadedAt: Date.now(),
  });
  cleanupIds.documents.push(ref.id);

  await playerDocumentsMarkExpired({ documentId: ref.id });

  const snap = await db.collection("PlayerDocuments").doc(ref.id).get();
  assertEqual(snap.data().expired, true, "expired flag set");
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" Phase 3 Smoke Tests — Player Callables");
  console.log("═══════════════════════════════════════════════════");

  try {
    for (const platform of ["men", "women", "youth"]) {
      await testPlayersUpdate(platform);
      await testPlayersToggleMandate(platform);
      await testPlayersAddNote(platform);
      await testPlayersDeleteNote(platform);
      await testPlayersDelete(platform);
      await testPlayerDocumentsCreate(platform);
      await testPlayerDocumentsDelete(platform);
    }
    await testPlayerDocumentsMarkExpired();
  } catch (e) {
    console.error("\n💥 Test crashed:", e);
    failed++;
  }

  await cleanup();

  console.log("═══════════════════════════════════════════════════");
  console.log(` Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log("═══════════════════════════════════════════════════");
  process.exit(failed > 0 ? 1 : 0);
}

main();
