#!/usr/bin/env node
/**
 * Phase 4 Smoke Test — Verify shortlist callables produce correct Firestore docs.
 *
 * Usage:
 *   cd functions && npm install   (if not done)
 *   cd ..
 *   node scripts/test-phase4-callables.js
 *
 * Tests:
 *   1. shortlistAdd — add entry + FeedEvent, duplicate check, roster check
 *   2. shortlistRemove — delete by tmProfileUrl + FeedEvent
 *   3. shortlistUpdate — update allowed fields
 *   4. shortlistAddNote — append note (transaction-based)
 *   5. shortlistUpdateNote — edit note at index
 *   6. shortlistDeleteNote — remove note at index
 *
 * Runs on all 3 platforms (men, women, youth).
 * All test docs use "__PHASE4_TEST__" prefix.
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const {
  shortlistAdd,
  shortlistRemove,
  shortlistUpdate,
  shortlistAddNote,
  shortlistUpdateNote,
  shortlistDeleteNote,
} = require("../functions/callables/shortlists");

const SHORTLISTS = { men: "Shortlists", women: "ShortlistsWomen", youth: "ShortlistsYouth" };
const FEED = { men: "FeedEvents", women: "FeedEventsWomen", youth: "FeedEventsYouth" };
const PLAYERS = { men: "Players", women: "PlayersWomen", youth: "PlayersYouth" };

const TEST_PREFIX = "__PHASE4_TEST__";
let passed = 0;
let failed = 0;
const cleanupRefs = []; // { col, id }

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

// Build a unique profile URL per platform per test
function testUrl(platform, suffix = "") {
  const domains = { men: "transfermarkt.com", women: "soccerdonna.de", youth: "football.org.il" };
  return `https://${domains[platform]}/${TEST_PREFIX}${suffix}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("\n🧹 Cleanup...");
  for (const { col, id } of cleanupRefs) {
    try { await db.collection(col).doc(id).delete(); } catch {}
  }
  // Also clean up feed events and shortlist entries with TEST_PREFIX in URL
  for (const platform of ["men", "women", "youth"]) {
    const shortCol = SHORTLISTS[platform];
    const feedCol = FEED[platform];
    const playerCol = PLAYERS[platform];

    // Shortlist entries
    const sSnap = await db.collection(shortCol).where("playerName", "==", `${TEST_PREFIX}Player`).get();
    for (const d of sSnap.docs) { try { await d.ref.delete(); } catch {} }

    // Feed events
    const fSnap = await db.collection(feedCol).where("playerName", "==", `${TEST_PREFIX}Player`).get();
    for (const d of fSnap.docs) { try { await d.ref.delete(); } catch {} }

    // Roster test players
    const rSnap = await db.collection(playerCol).where("fullName", "==", `${TEST_PREFIX}RosterPlayer`).get();
    for (const d of rSnap.docs) { try { await d.ref.delete(); } catch {} }
  }
  console.log("  Done.\n");
}

// ──────────────────────────────────────────────────────────────────────────
// 1. shortlistAdd — basic add + FeedEvent
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistAdd(platform) {
  console.log(`\n[${platform}] shortlistAdd — basic add`);

  const url = testUrl(platform, "add");
  const result = await shortlistAdd({
    platform,
    tmProfileUrl: url,
    playerName: `${TEST_PREFIX}Player`,
    playerImage: "https://img.test/photo.jpg",
    playerPosition: "CM",
    playerAge: "25",
    playerNationality: "Test",
    clubJoinedName: "Test FC",
    addedByAgentName: "TestAgent",
  });

  assertEqual(result.status, "added", "status is 'added'");
  assert(result.id, "returned doc id");

  // Verify doc exists
  const doc = await db.collection(SHORTLISTS[platform]).doc(result.id).get();
  assert(doc.exists, "doc exists in Firestore");
  assertEqual(doc.data().tmProfileUrl, url, "tmProfileUrl matches");
  assertEqual(doc.data().playerName, `${TEST_PREFIX}Player`, "playerName matches");
  assertEqual(doc.data().playerPosition, "CM", "playerPosition matches");
  assertEqual(doc.data().clubJoinedName, "Test FC", "clubJoinedName matches");
  assert(doc.data().addedAt > 0, "addedAt is set");

  cleanupRefs.push({ col: SHORTLISTS[platform], id: result.id });

  // Verify FeedEvent
  const feedSnap = await db.collection(FEED[platform])
    .where("playerTmProfile", "==", url)
    .where("type", "==", "SHORTLIST_ADDED").get();
  assert(!feedSnap.empty, "FeedEvent SHORTLIST_ADDED exists");
  if (!feedSnap.empty) {
    const fe = feedSnap.docs[0].data();
    assertEqual(fe.playerName, `${TEST_PREFIX}Player`, "FeedEvent playerName");
    assertEqual(fe.agentName, "TestAgent", "FeedEvent agentName");
    cleanupRefs.push({ col: FEED[platform], id: feedSnap.docs[0].id });
  }

  return result.id;
}

// ──────────────────────────────────────────────────────────────────────────
// 2. shortlistAdd — duplicate check
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistAddDuplicate(platform) {
  console.log(`\n[${platform}] shortlistAdd — duplicate check`);

  const url = testUrl(platform, "dup");
  // Add first
  const r1 = await shortlistAdd({
    platform,
    tmProfileUrl: url,
    playerName: `${TEST_PREFIX}Player`,
    checkRoster: false,
  });
  assertEqual(r1.status, "added", "first add succeeds");
  cleanupRefs.push({ col: SHORTLISTS[platform], id: r1.id });

  // Add duplicate
  const r2 = await shortlistAdd({
    platform,
    tmProfileUrl: url,
    playerName: `${TEST_PREFIX}Player`,
    checkRoster: false,
  });
  assertEqual(r2.status, "already_exists", "duplicate returns already_exists");
  assert(!r2.id, "no id returned for duplicate");
}

// ──────────────────────────────────────────────────────────────────────────
// 3. shortlistAdd — roster check
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistAddRosterCheck(platform) {
  console.log(`\n[${platform}] shortlistAdd — roster check`);

  const url = testUrl(platform, "roster");
  const playerCol = PLAYERS[platform];

  // Create a test player in the roster with the matching field
  const rosterData = { fullName: `${TEST_PREFIX}RosterPlayer`, createdAt: Date.now() };
  if (platform === "men") rosterData.tmProfile = url;
  else if (platform === "women") rosterData.soccerDonnaUrl = url;
  else rosterData.ifaUrl = url;

  const rosterRef = await db.collection(playerCol).add(rosterData);
  cleanupRefs.push({ col: playerCol, id: rosterRef.id });

  // Now try to add to shortlist — should be blocked
  const result = await shortlistAdd({
    platform,
    tmProfileUrl: url,
    playerName: `${TEST_PREFIX}Player`,
  });
  assertEqual(result.status, "already_in_roster", "roster check returns already_in_roster");
}

// ──────────────────────────────────────────────────────────────────────────
// 4. shortlistRemove — delete + FeedEvent
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistRemove(platform) {
  console.log(`\n[${platform}] shortlistRemove`);

  const url = testUrl(platform, "remove");

  // Add first
  const addResult = await shortlistAdd({
    platform,
    tmProfileUrl: url,
    playerName: `${TEST_PREFIX}Player`,
    playerImage: "https://img.test/rm.jpg",
    checkRoster: false,
  });
  assertEqual(addResult.status, "added", "setup: entry added");

  // Remove
  const result = await shortlistRemove({
    platform,
    tmProfileUrl: url,
    agentName: "TestAgent",
  });
  assert(result.success, "remove returns success");

  // Verify entry is gone
  const snap = await db.collection(SHORTLISTS[platform])
    .where("tmProfileUrl", "==", url).get();
  assert(snap.empty, "entry deleted from Firestore");

  // Verify FeedEvent
  const feedSnap = await db.collection(FEED[platform])
    .where("playerTmProfile", "==", url)
    .where("type", "==", "SHORTLIST_REMOVED").get();
  assert(!feedSnap.empty, "FeedEvent SHORTLIST_REMOVED exists");
  if (!feedSnap.empty) {
    const fe = feedSnap.docs[0].data();
    assertEqual(fe.playerName, `${TEST_PREFIX}Player`, "FeedEvent uses stored playerName");
    cleanupRefs.push({ col: FEED[platform], id: feedSnap.docs[0].id });
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 5. shortlistRemove — non-existent (idempotent)
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistRemoveNonExistent(platform) {
  console.log(`\n[${platform}] shortlistRemove — non-existent (idempotent)`);

  const result = await shortlistRemove({
    platform,
    tmProfileUrl: testUrl(platform, "nonexist"),
  });
  assert(result.success, "remove non-existent returns success (idempotent)");
}

// ──────────────────────────────────────────────────────────────────────────
// 6. shortlistUpdate — update fields
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistUpdate(platform) {
  console.log(`\n[${platform}] shortlistUpdate`);

  const url = testUrl(platform, "update");
  const addResult = await shortlistAdd({
    platform,
    tmProfileUrl: url,
    playerName: `${TEST_PREFIX}Player`,
    checkRoster: false,
  });
  cleanupRefs.push({ col: SHORTLISTS[platform], id: addResult.id });

  // Update multiple fields
  const now = Date.now();
  await shortlistUpdate({
    platform,
    tmProfileUrl: url,
    instagramHandle: "@test_player",
    instagramSentAt: now,
    marketValue: "€5M",
  });

  const doc = await db.collection(SHORTLISTS[platform]).doc(addResult.id).get();
  assertEqual(doc.data().instagramHandle, "@test_player", "instagramHandle updated");
  assertEqual(doc.data().instagramSentAt, now, "instagramSentAt updated");
  assertEqual(doc.data().marketValue, "€5M", "marketValue updated");
  // Original fields preserved
  assertEqual(doc.data().playerName, `${TEST_PREFIX}Player`, "playerName preserved");
}

// ──────────────────────────────────────────────────────────────────────────
// 7. shortlistUpdate — reject disallowed fields
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistUpdateRejectBadFields(platform) {
  console.log(`\n[${platform}] shortlistUpdate — reject disallowed fields`);

  const url = testUrl(platform, "update"); // reuse from previous test

  let threw = false;
  try {
    await shortlistUpdate({
      platform,
      tmProfileUrl: url,
      hackerField: "evil",
    });
  } catch (e) {
    threw = true;
    assert(e.message.includes("No valid fields"), `threw: ${e.message}`);
  }
  assert(threw, "rejects update with only disallowed fields");
}

// ──────────────────────────────────────────────────────────────────────────
// 8. shortlistAddNote — append note
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistAddNote(platform) {
  console.log(`\n[${platform}] shortlistAddNote`);

  const url = testUrl(platform, "notes");
  const addResult = await shortlistAdd({
    platform,
    tmProfileUrl: url,
    playerName: `${TEST_PREFIX}Player`,
    checkRoster: false,
  });
  cleanupRefs.push({ col: SHORTLISTS[platform], id: addResult.id });

  // Add first note
  await shortlistAddNote({
    platform,
    tmProfileUrl: url,
    noteText: "First note",
    createdBy: "Agent1",
    createdById: "uid1",
  });

  let doc = await db.collection(SHORTLISTS[platform]).doc(addResult.id).get();
  let notes = doc.data().notes;
  assertEqual(notes.length, 1, "1 note after first add");
  assertEqual(notes[0].text, "First note", "first note text");
  assertEqual(notes[0].createdBy, "Agent1", "first note createdBy");
  assert(notes[0].createdAt > 0, "first note has createdAt");

  // Add second note
  await shortlistAddNote({
    platform,
    tmProfileUrl: url,
    noteText: "Second note",
    createdBy: "Agent2",
  });

  doc = await db.collection(SHORTLISTS[platform]).doc(addResult.id).get();
  notes = doc.data().notes;
  assertEqual(notes.length, 2, "2 notes after second add");
  assertEqual(notes[1].text, "Second note", "second note text");

  return addResult.id;
}

// ──────────────────────────────────────────────────────────────────────────
// 9. shortlistUpdateNote — edit note at index
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistUpdateNote(platform) {
  console.log(`\n[${platform}] shortlistUpdateNote`);

  const url = testUrl(platform, "notes"); // reuse entry from addNote test

  await shortlistUpdateNote({
    platform,
    tmProfileUrl: url,
    noteIndex: 0,
    newText: "Updated first note",
  });

  const snap = await db.collection(SHORTLISTS[platform])
    .where("tmProfileUrl", "==", url).limit(1).get();
  const notes = snap.docs[0].data().notes;
  assertEqual(notes[0].text, "Updated first note", "note[0] text updated");
  assert(notes[0].updatedAt > 0, "note[0] has updatedAt");
  assertEqual(notes[1].text, "Second note", "note[1] unchanged");
}

// ──────────────────────────────────────────────────────────────────────────
// 10. shortlistDeleteNote — remove note at index
// ──────────────────────────────────────────────────────────────────────────

async function testShortlistDeleteNote(platform) {
  console.log(`\n[${platform}] shortlistDeleteNote`);

  const url = testUrl(platform, "notes"); // reuse

  // Delete first note (index 0)
  await shortlistDeleteNote({
    platform,
    tmProfileUrl: url,
    noteIndex: 0,
  });

  const snap = await db.collection(SHORTLISTS[platform])
    .where("tmProfileUrl", "==", url).limit(1).get();
  const notes = snap.docs[0].data().notes;
  assertEqual(notes.length, 1, "1 note remaining after delete");
  assertEqual(notes[0].text, "Second note", "remaining note is the second one");
}

// ──────────────────────────────────────────────────────────────────────────
// 11. Validation: missing platform
// ──────────────────────────────────────────────────────────────────────────

async function testValidationMissingPlatform() {
  console.log("\n[validation] missing platform");
  let threw = false;
  try {
    await shortlistAdd({ tmProfileUrl: "https://test.com/x", playerName: "Test" });
  } catch (e) {
    threw = true;
  }
  assert(threw, "shortlistAdd throws without platform");

  threw = false;
  try {
    await shortlistRemove({ tmProfileUrl: "https://test.com/x" });
  } catch (e) {
    threw = true;
  }
  assert(threw, "shortlistRemove throws without platform");
}

// ──────────────────────────────────────────────────────────────────────────
// 12. Validation: missing tmProfileUrl
// ──────────────────────────────────────────────────────────────────────────

async function testValidationMissingUrl() {
  console.log("\n[validation] missing tmProfileUrl");
  let threw = false;
  try {
    await shortlistAdd({ platform: "men", playerName: "Test" });
  } catch (e) {
    threw = true;
  }
  assert(threw, "shortlistAdd throws without tmProfileUrl");
}

// ══════════════════════════════════════════════════════════════════════════
// Run all tests
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Phase 4 Smoke Tests — Shortlist Callables");
  console.log("═══════════════════════════════════════════════════════");

  try {
    await cleanup();

    for (const platform of ["men", "women", "youth"]) {
      console.log(`\n── Platform: ${platform.toUpperCase()} ──`);

      await testShortlistAdd(platform);
      await testShortlistAddDuplicate(platform);
      await testShortlistAddRosterCheck(platform);
      await testShortlistRemove(platform);
      await testShortlistRemoveNonExistent(platform);
      await testShortlistUpdate(platform);
      await testShortlistUpdateRejectBadFields(platform);
      await testShortlistAddNote(platform);
      await testShortlistUpdateNote(platform);
      await testShortlistDeleteNote(platform);
    }

    await testValidationMissingPlatform();
    await testValidationMissingUrl();

    await cleanup();
  } catch (err) {
    console.error("\n💥 Unexpected error:", err);
    await cleanup();
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log("═══════════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
