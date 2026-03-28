#!/usr/bin/env node
/**
 * Phase 6 Smoke Test — Verify misc callables.
 *
 * Usage:
 *   node scripts/test-phase6-callables.js
 *
 * Tests:
 *   1. sharePlayerCreate — writes SharedPlayers doc, returns token
 *   2. shadowTeamsSave — overwrites ShadowTeams doc (all 3 platforms)
 *   3. scoutProfileFeedbackSet — writes/merges ScoutProfileFeedback
 *   4. birthdayWishSend — writes BirthdayWishesSent with merge
 *   5. offersUpdateHistorySummary — updates historySummary on PlayerOffers
 *   6. mandateSigningCreate — writes MandateSigningRequests doc
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const {
  sharePlayerCreate,
  shadowTeamsSave,
  scoutProfileFeedbackSet,
  birthdayWishSend,
  offersUpdateHistorySummary,
  mandateSigningCreate,
} = require("../functions/callables/phase6Misc");

const TEST_PREFIX = "__PHASE6_TEST__";
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
  console.log("  Done.\n");
}

// ──────────────────────────────────────────────────────────────────────────
// Callable helpers — functions take (data) directly, no wrapping needed
// ──────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════
// 1. sharePlayerCreate
// ══════════════════════════════════════════════════════════════════════════

async function testSharePlayerCreate() {
  console.log("\n[1] sharePlayerCreate");

  const call = sharePlayerCreate;
  const res = await call({
    playerId: `${TEST_PREFIX}player1`,
    player: { fullName: `${TEST_PREFIX}SharedPlayer`, positions: ["CF"] },
    scoutReport: "A great test player",
    lang: "en",
    createdAt: Date.now(),
  });

  const token = res.token;
  assert(typeof token === "string" && token.length > 0, "returned a non-empty token");

  // Verify doc exists
  const snap = await db.collection("SharedPlayers").doc(token).get();
  assert(snap.exists, "SharedPlayers doc exists");
  assertEqual(snap.data().playerId, `${TEST_PREFIX}player1`, "playerId field");
  assertEqual(snap.data().lang, "en", "lang field");
  assert(snap.data().scoutReport === "A great test player", "scoutReport field");

  cleanupRefs.push({ col: "SharedPlayers", id: token });
}

// ══════════════════════════════════════════════════════════════════════════
// 2. shadowTeamsSave (all 3 platforms)
// ══════════════════════════════════════════════════════════════════════════

async function testShadowTeamsSave() {
  const SHADOW = { men: "ShadowTeams", women: "ShadowTeamsWomen", youth: "ShadowTeamsYouth" };

  for (const platform of ["men", "women", "youth"]) {
    console.log(`\n[2-${platform}] shadowTeamsSave`);
    const call = shadowTeamsSave;
    const accountId = `${TEST_PREFIX}account_${platform}`;

    await call({
      platform,
      accountId,
      formationId: "4-3-3",
      slots: [
        { starter: { id: "p1", fullName: "Test Player 1", profileImage: null } },
        { starter: null },
      ],
      updatedAt: Date.now(),
    });

    const snap = await db.collection(SHADOW[platform]).doc(accountId).get();
    assert(snap.exists, `${platform}: ShadowTeams doc exists`);
    assertEqual(snap.data().formationId, "4-3-3", `${platform}: formationId`);
    assertEqual(snap.data().slots.length, 2, `${platform}: slots length`);
    assertEqual(snap.data().slots[0].starter.fullName, "Test Player 1", `${platform}: slot[0] starter`);

    cleanupRefs.push({ col: SHADOW[platform], id: accountId });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// 3. scoutProfileFeedbackSet
// ══════════════════════════════════════════════════════════════════════════

async function testScoutProfileFeedbackSet() {
  console.log("\n[3] scoutProfileFeedbackSet");
  const call = scoutProfileFeedbackSet;
  const uid = `${TEST_PREFIX}uid_fb`;
  const profileId = "profile_123";

  // First call — creates doc
  await call({ uid, profileId, feedback: "Great player", agentId: "agent_1" });

  let snap = await db.collection("ScoutProfileFeedback").doc(uid).get();
  assert(snap.exists, "ScoutProfileFeedback doc exists after first call");
  const fb1 = snap.data().feedback || {};
  assertEqual(fb1[profileId]?.feedback, "Great player", "feedback value after first call");
  assertEqual(fb1[profileId]?.agentId, "agent_1", "agentId after first call");

  // Second call — merges, new profileId
  await call({ uid, profileId: "profile_456", feedback: "Average", agentId: "agent_2" });

  snap = await db.collection("ScoutProfileFeedback").doc(uid).get();
  const fb2 = snap.data().feedback || {};
  assert(fb2["profile_123"] !== undefined, "original profile feedback preserved");
  assertEqual(fb2["profile_456"]?.feedback, "Average", "new profile feedback merged");

  cleanupRefs.push({ col: "ScoutProfileFeedback", id: uid });
}

// ══════════════════════════════════════════════════════════════════════════
// 4. birthdayWishSend
// ══════════════════════════════════════════════════════════════════════════

async function testBirthdayWishSend() {
  console.log("\n[4] birthdayWishSend");
  const call = birthdayWishSend;
  const year = `${TEST_PREFIX}2025`;
  const playerId = "bday_player_1";

  await call({ year, playerId, sentBy: "TestAgent" });

  let snap = await db.collection("BirthdayWishesSent").doc(year).get();
  assert(snap.exists, "BirthdayWishesSent doc exists");
  const data = snap.data();
  assert(data[playerId] !== undefined, "playerId key exists in doc");
  assertEqual(data[playerId].sentBy, "TestAgent", "sentBy field");
  assert(typeof data[playerId].sentAt === "number", "sentAt is a number");

  // Second call — merge doesn't overwrite first
  await call({ year, playerId: "bday_player_2", sentBy: "AnotherAgent" });
  snap = await db.collection("BirthdayWishesSent").doc(year).get();
  const data2 = snap.data();
  assert(data2["bday_player_1"] !== undefined, "first player preserved after merge");
  assertEqual(data2["bday_player_2"].sentBy, "AnotherAgent", "second player merged");

  cleanupRefs.push({ col: "BirthdayWishesSent", id: year });
}

// ══════════════════════════════════════════════════════════════════════════
// 5. offersUpdateHistorySummary
// ══════════════════════════════════════════════════════════════════════════

async function testOffersUpdateHistorySummary() {
  console.log("\n[5] offersUpdateHistorySummary");

  // Create a seed offer doc
  const offerId = `${TEST_PREFIX}offer1`;
  await db.collection("PlayerOffers").doc(offerId).set({
    playerName: "Test Offer Player",
    status: "active",
  });
  cleanupRefs.push({ col: "PlayerOffers", id: offerId });

  const call = offersUpdateHistorySummary;
  await call({ offerId, historySummary: "Negotiation started in Jan 2025." });

  const snap = await db.collection("PlayerOffers").doc(offerId).get();
  assert(snap.exists, "PlayerOffers doc still exists");
  assertEqual(snap.data().historySummary, "Negotiation started in Jan 2025.", "historySummary updated");
  assertEqual(snap.data().playerName, "Test Offer Player", "other fields preserved");
}

// ══════════════════════════════════════════════════════════════════════════
// 6. mandateSigningCreate
// ══════════════════════════════════════════════════════════════════════════

async function testMandateSigningCreate() {
  console.log("\n[6] mandateSigningCreate");

  const call = mandateSigningCreate;
  const token = `${TEST_PREFIX}mandate_token`;

  await call({
    token,
    passportDetails: { firstName: "Test", lastName: "Player", dateOfBirth: "2000-01-01" },
    expiryDate: Date.now() + 86400000,
    validLeagues: ["ISR1"],
    agentName: "Lior Dahan",
    fifaLicenseId: "22412-9595",
    effectiveDate: Date.now(),
    createdAt: Date.now(),
    status: "pending",
    playerId: "player_x",
    playerName: "Test Player",
    agentAccountId: "acc_1",
  });

  const snap = await db.collection("MandateSigningRequests").doc(token).get();
  assert(snap.exists, "MandateSigningRequests doc exists");
  assertEqual(snap.data().status, "pending", "status field");
  assertEqual(snap.data().agentName, "Lior Dahan", "agentName field");
  assertEqual(snap.data().passportDetails.firstName, "Test", "passportDetails.firstName");
  assert(Array.isArray(snap.data().validLeagues), "validLeagues is array");
  assertEqual(snap.data().playerId, "player_x", "playerId field");

  cleanupRefs.push({ col: "MandateSigningRequests", id: token });
}

// ══════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Phase 6 Smoke Tests — Misc Callables");
  console.log("═══════════════════════════════════════");

  try {
    await testSharePlayerCreate();
    await testShadowTeamsSave();
    await testScoutProfileFeedbackSet();
    await testBirthdayWishSend();
    await testOffersUpdateHistorySummary();
    await testMandateSigningCreate();
  } catch (err) {
    console.error("\n💥 Unhandled error:", err);
    failed++;
  }

  await cleanup();

  console.log("───────────────────────────────────────");
  console.log(`  Total: ${passed + failed}  |  ✅ ${passed}  |  ❌ ${failed}`);
  console.log("───────────────────────────────────────");
  process.exit(failed > 0 ? 1 : 0);
}

main();
