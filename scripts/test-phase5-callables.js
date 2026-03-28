#!/usr/bin/env node
/**
 * Phase 5 Smoke Test — Verify playersCreate + portfolio callables.
 *
 * Usage:
 *   cd functions && npm install   (if not done)
 *   cd ..
 *   node scripts/test-phase5-callables.js
 *
 * Tests:
 *   1. playersCreate — add player + FeedEvent + dedup check, all 3 platforms
 *   2. playersCreate — auto shortlist removal (men, women, youth)
 *   3. portfolioUpsert — create + overwrite, all 3 platforms
 *   4. portfolioDelete — delete entry, all 3 platforms
 *
 * All test docs use "__PHASE5_TEST__" prefix for easy cleanup.
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const { playersCreate } = require("../functions/callables/playersCreate");
const { portfolioUpsert, portfolioDelete } = require("../functions/callables/portfolio");

const PLAYERS = { men: "Players", women: "PlayersWomen", youth: "PlayersYouth" };
const FEED = { men: "FeedEvents", women: "FeedEventsWomen", youth: "FeedEventsYouth" };
const SHORTLISTS = { men: "Shortlists", women: "ShortlistsWomen", youth: "ShortlistsYouth" };
const PORTFOLIO = { men: "Portfolio", women: "PortfolioWomen", youth: "PortfolioYouth" };

const TEST_PREFIX = "__PHASE5_TEST__";
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

// ──────────────────────────────────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────────────────────────────────

async function cleanup() {
  console.log("\n🧹 Cleanup...");
  for (const { col, id } of cleanupRefs) {
    try { await db.collection(col).doc(id).delete(); } catch {}
  }
  // Also cleanup test docs by fullName/playerName prefix
  for (const platform of ["men", "women", "youth"]) {
    // Players
    const pSnap = await db.collection(PLAYERS[platform])
      .where("fullName", ">=", TEST_PREFIX).where("fullName", "<=", TEST_PREFIX + "\uf8ff").get();
    for (const d of pSnap.docs) { try { await d.ref.delete(); } catch {} }

    // FeedEvents
    const fSnap = await db.collection(FEED[platform])
      .where("playerName", ">=", TEST_PREFIX).where("playerName", "<=", TEST_PREFIX + "\uf8ff").get();
    for (const d of fSnap.docs) { try { await d.ref.delete(); } catch {} }

    // Shortlists
    const sSnap = await db.collection(SHORTLISTS[platform])
      .where("playerName", "==", `${TEST_PREFIX}ShortlistPlayer`).get();
    for (const d of sSnap.docs) { try { await d.ref.delete(); } catch {} }

    // Portfolio
    const portSnap = await db.collection(PORTFOLIO[platform])
      .where("agentId", "==", `${TEST_PREFIX}Agent`).get();
    for (const d of portSnap.docs) { try { await d.ref.delete(); } catch {} }
  }
  console.log("  Done.\n");
}

// ──────────────────────────────────────────────────────────────────────────
// Test URLs per platform
// ──────────────────────────────────────────────────────────────────────────

function testUrl(platform, suffix = "") {
  const domains = { men: "transfermarkt.com", women: "soccerdonna.de", youth: "football.org.il" };
  return `https://${domains[platform]}/${TEST_PREFIX}${suffix}`;
}

// ══════════════════════════════════════════════════════════════════════════
// 1. playersCreate — basic add + FeedEvent (all 3 platforms)
// ══════════════════════════════════════════════════════════════════════════

async function testPlayersCreateBasic(platform) {
  console.log(`\n[${platform}] playersCreate — basic add`);

  const baseData = {
    platform,
    fullName: `${TEST_PREFIX}Player_${platform}`,
    positions: ["CM", "CDM"],
    profileImage: "https://img.test/photo.jpg",
    nationality: "TestLand",
    agentInChargeName: "TestAgent",
    marketValue: "€1M",
    createdAt: Date.now(),
  };

  // Platform-specific fields
  if (platform === "men") {
    baseData.tmProfile = testUrl("men", `create_${platform}`);
    baseData.currentClub = "Test FC";
    baseData.age = "25";
    baseData.height = "182";
  } else if (platform === "women") {
    baseData.soccerDonnaUrl = testUrl("women", `create_${platform}`);
    baseData.currentClub = "Test WFC";
    baseData.age = "23";
  } else {
    baseData.ifaUrl = testUrl("youth", `create_${platform}`);
    baseData.currentClub = "Test Academy";
    baseData.ageGroup = "U-17";
    baseData.fullNameHe = `${TEST_PREFIX}שחקן`;
    baseData.dateOfBirth = "2008-01-15";
  }

  const result = await playersCreate(baseData);
  assertEqual(result.status, "added", `status is "added"`);
  assert(typeof result.id === "string" && result.id.length > 0, "returned doc ID");

  // Verify player doc exists
  const playerDoc = await db.collection(PLAYERS[platform]).doc(result.id).get();
  assert(playerDoc.exists, "player doc exists in Firestore");
  assertEqual(playerDoc.data().fullName, baseData.fullName, "fullName matches");
  cleanupRefs.push({ col: PLAYERS[platform], id: result.id });

  // Verify FeedEvent
  const feedSnap = await db.collection(FEED[platform])
    .where("playerName", "==", baseData.fullName)
    .where("type", "==", "PLAYER_ADDED").limit(1).get();
  assert(!feedSnap.empty, "FeedEvent PLAYER_ADDED exists");
  if (!feedSnap.empty) {
    cleanupRefs.push({ col: FEED[platform], id: feedSnap.docs[0].id });
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// 2. playersCreate — dedup check (men + women only; youth has no server dedup)
// ══════════════════════════════════════════════════════════════════════════

async function testPlayersCreateDedup(platform) {
  if (platform === "youth") {
    console.log(`\n[${platform}] playersCreate — dedup (skipped: youth has no server-side dedup)`);
    passed++;
    return;
  }

  console.log(`\n[${platform}] playersCreate — dedup check`);

  const dedupField = platform === "women" ? "soccerDonnaUrl" : "tmProfile";
  const dedupUrl = testUrl(platform, `dedup_${platform}`);

  // First add
  const first = await playersCreate({
    platform,
    fullName: `${TEST_PREFIX}DedupPlayer_${platform}`,
    [dedupField]: dedupUrl,
    positions: ["ST"],
    createdAt: Date.now(),
  });
  assertEqual(first.status, "added", "first add succeeds");
  cleanupRefs.push({ col: PLAYERS[platform], id: first.id });

  // Second add — should return already_exists
  const second = await playersCreate({
    platform,
    fullName: `${TEST_PREFIX}DedupPlayer2_${platform}`,
    [dedupField]: dedupUrl,
    positions: ["ST"],
    createdAt: Date.now(),
  });
  assertEqual(second.status, "already_exists", "duplicate returns already_exists");
}

// ══════════════════════════════════════════════════════════════════════════
// 3. playersCreate — auto shortlist removal
// ══════════════════════════════════════════════════════════════════════════

async function testPlayersCreateShortlistRemoval(platform) {
  console.log(`\n[${platform}] playersCreate — auto shortlist removal`);

  const url = testUrl(platform, `shortlist_rm_${platform}`);

  // Seed a shortlist entry with the URL
  const shortlistRef = await db.collection(SHORTLISTS[platform]).add({
    tmProfileUrl: url,
    playerName: `${TEST_PREFIX}ShortlistPlayer`,
    playerImage: "https://img.test/sl.jpg",
    createdAt: Date.now(),
  });
  cleanupRefs.push({ col: SHORTLISTS[platform], id: shortlistRef.id });

  // Add player with same URL → should auto-remove shortlist entry
  const urlField = platform === "men" ? "tmProfile" : platform === "women" ? "soccerDonnaUrl" : "ifaUrl";
  const result = await playersCreate({
    platform,
    fullName: `${TEST_PREFIX}ShortlistRmPlayer_${platform}`,
    [urlField]: url,
    positions: ["GK"],
    createdAt: Date.now(),
  });
  assertEqual(result.status, "added", "player added");
  cleanupRefs.push({ col: PLAYERS[platform], id: result.id });

  // Verify shortlist entry was removed
  const slDoc = await db.collection(SHORTLISTS[platform]).doc(shortlistRef.id).get();
  assert(!slDoc.exists, "shortlist entry auto-removed");

  // Verify SHORTLIST_REMOVED FeedEvent
  const feedSnap = await db.collection(FEED[platform])
    .where("type", "==", "SHORTLIST_REMOVED")
    .where("playerTmProfile", "==", url).limit(1).get();
  assert(!feedSnap.empty, "FeedEvent SHORTLIST_REMOVED exists");
  if (!feedSnap.empty) {
    cleanupRefs.push({ col: FEED[platform], id: feedSnap.docs[0].id });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 4. portfolioUpsert — create + overwrite
// ══════════════════════════════════════════════════════════════════════════

async function testPortfolioUpsert(platform) {
  console.log(`\n[${platform}] portfolioUpsert — create + overwrite`);

  const idKey = platform === "women" ? "playerWomenId" : platform === "youth" ? "playerYouthId" : "playerId";
  const playerId = `${TEST_PREFIX}pid_${platform}`;

  // Create
  const createResult = await portfolioUpsert({
    platform,
    agentId: `${TEST_PREFIX}Agent`,
    [idKey]: playerId,
    lang: "en",
    player: { fullName: `${TEST_PREFIX}PortfolioPlayer_${platform}`, positions: ["CB"] },
    mandateInfo: { hasMandate: true, expiresAt: Date.now() + 86400000 },
    scoutReport: "Test scout report for Phase 5",
    createdAt: Date.now(),
  });
  assertEqual(createResult.status, "created", "first upsert creates");
  assert(typeof createResult.id === "string" && createResult.id.length > 0, "returned doc ID");
  cleanupRefs.push({ col: PORTFOLIO[platform], id: createResult.id });

  // Verify doc
  const doc = await db.collection(PORTFOLIO[platform]).doc(createResult.id).get();
  assert(doc.exists, "portfolio doc exists");
  assertEqual(doc.data().agentId, `${TEST_PREFIX}Agent`, "agentId matches");
  assertEqual(doc.data()[idKey], playerId, `${idKey} matches`);
  assertEqual(doc.data().lang, "en", "lang matches");

  // Overwrite same (agentId, playerId, lang) combo
  const updateResult = await portfolioUpsert({
    platform,
    agentId: `${TEST_PREFIX}Agent`,
    [idKey]: playerId,
    lang: "en",
    player: { fullName: `${TEST_PREFIX}PortfolioPlayer_${platform}_V2`, positions: ["CB", "LB"] },
    mandateInfo: { hasMandate: false },
    scoutReport: "Updated scout report",
    createdAt: Date.now(),
  });
  assertEqual(updateResult.status, "updated", "second upsert overwrites");
  assertEqual(updateResult.id, createResult.id, "same doc ID on overwrite");

  // Verify overwrite
  const updated = await db.collection(PORTFOLIO[platform]).doc(createResult.id).get();
  assertEqual(updated.data().scoutReport, "Updated scout report", "scoutReport updated");

  // Different lang → separate doc
  const heLangResult = await portfolioUpsert({
    platform,
    agentId: `${TEST_PREFIX}Agent`,
    [idKey]: playerId,
    lang: "he",
    player: { fullName: `${TEST_PREFIX}PortfolioPlayer_${platform}_HE` },
    scoutReport: "דוח סקאוטינג",
    createdAt: Date.now(),
  });
  assertEqual(heLangResult.status, "created", "different lang creates separate doc");
  assert(heLangResult.id !== createResult.id, "different ID for different lang");
  cleanupRefs.push({ col: PORTFOLIO[platform], id: heLangResult.id });
}

// ══════════════════════════════════════════════════════════════════════════
// 5. portfolioDelete — delete entry
// ══════════════════════════════════════════════════════════════════════════

async function testPortfolioDelete(platform) {
  console.log(`\n[${platform}] portfolioDelete — delete entry`);

  const idKey = platform === "women" ? "playerWomenId" : platform === "youth" ? "playerYouthId" : "playerId";

  // Seed a portfolio entry
  const ref = await db.collection(PORTFOLIO[platform]).add({
    agentId: `${TEST_PREFIX}Agent`,
    [idKey]: `${TEST_PREFIX}del_${platform}`,
    lang: "en",
    scoutReport: "to be deleted",
    createdAt: Date.now(),
  });

  // Delete it
  const result = await portfolioDelete({ platform, documentId: ref.id });
  assertEqual(result.success, true, "delete returns success: true");

  // Verify it's gone
  const check = await db.collection(PORTFOLIO[platform]).doc(ref.id).get();
  assert(!check.exists, "portfolio doc deleted");
}

// ══════════════════════════════════════════════════════════════════════════
// 6. playersCreate — disallowed fields are stripped
// ══════════════════════════════════════════════════════════════════════════

async function testPlayersCreateFieldStrip() {
  console.log("\n[men] playersCreate — disallowed fields stripped");

  const result = await playersCreate({
    platform: "men",
    fullName: `${TEST_PREFIX}FieldStripPlayer`,
    tmProfile: testUrl("men", "fieldstrip"),
    positions: ["RW"],
    createdAt: Date.now(),
    // These should NOT appear in the doc
    hackerField: "malicious",
    adminSecret: "s3cr3t",
    role: "admin",
  });
  assertEqual(result.status, "added", "player added");
  cleanupRefs.push({ col: PLAYERS.men, id: result.id });

  const doc = await db.collection(PLAYERS.men).doc(result.id).get();
  assert(doc.data().hackerField === undefined, "hackerField stripped");
  assert(doc.data().adminSecret === undefined, "adminSecret stripped");
  assert(doc.data().role === undefined, "role stripped");
  assertEqual(doc.data().fullName, `${TEST_PREFIX}FieldStripPlayer`, "allowed fields preserved");
}

// ══════════════════════════════════════════════════════════════════════════
// 7. portfolioUpsert — disallowed fields are stripped
// ══════════════════════════════════════════════════════════════════════════

async function testPortfolioFieldStrip() {
  console.log("\n[men] portfolioUpsert — disallowed fields stripped");

  const result = await portfolioUpsert({
    platform: "men",
    agentId: `${TEST_PREFIX}Agent`,
    playerId: `${TEST_PREFIX}FieldStripPortfolio`,
    lang: "en",
    scoutReport: "field strip test",
    createdAt: Date.now(),
    hackerField: "malicious",
    isAdmin: true,
  });
  assertEqual(result.status, "created", "created");
  cleanupRefs.push({ col: PORTFOLIO.men, id: result.id });

  const doc = await db.collection(PORTFOLIO.men).doc(result.id).get();
  assert(doc.data().hackerField === undefined, "hackerField stripped");
  assert(doc.data().isAdmin === undefined, "isAdmin stripped");
  assertEqual(doc.data().scoutReport, "field strip test", "allowed fields preserved");
}

// ══════════════════════════════════════════════════════════════════════════
// 8. playersCreate — fullName required
// ══════════════════════════════════════════════════════════════════════════

async function testPlayersCreateValidation() {
  console.log("\n[men] playersCreate — validation");

  try {
    await playersCreate({
      platform: "men",
      positions: ["ST"],
    });
    assert(false, "should throw for missing fullName");
  } catch (err) {
    assert(err.message.includes("fullName"), `throws for missing fullName: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════\n");
  console.log("  Phase 5 Smoke Tests — playersCreate + Portfolio\n");
  console.log("═══════════════════════════════════════════════════════");

  try {
    await cleanup(); // pre-clean

    // 1. Basic add (all platforms)
    for (const p of ["men", "women", "youth"]) {
      await testPlayersCreateBasic(p);
    }

    // 2. Dedup check (men + women)
    for (const p of ["men", "women", "youth"]) {
      await testPlayersCreateDedup(p);
    }

    // 3. Auto shortlist removal
    for (const p of ["men", "women", "youth"]) {
      await testPlayersCreateShortlistRemoval(p);
    }

    // 4. Portfolio upsert (all platforms)
    for (const p of ["men", "women", "youth"]) {
      await testPortfolioUpsert(p);
    }

    // 5. Portfolio delete (all platforms)
    for (const p of ["men", "women", "youth"]) {
      await testPortfolioDelete(p);
    }

    // 6. Field stripping
    await testPlayersCreateFieldStrip();

    // 7. Portfolio field stripping
    await testPortfolioFieldStrip();

    // 8. Validation
    await testPlayersCreateValidation();

  } finally {
    await cleanup();
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Result: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  console.log("═══════════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
