#!/usr/bin/env node
/**
 * Phase 7 Smoke Test — Verify accountUpdate callable.
 *
 * Usage:
 *   node scripts/test-phase7-callables.js
 *
 * Tests:
 *   1. accountUpdate — simple fields (fcmToken, language)
 *   2. accountUpdate — addFcmWebToken (arrayUnion)
 *   3. accountUpdate — removeFcmWebToken (arrayRemove)
 *   4. accountUpdate — email-based lookup
 *   5. accountUpdate — rejects missing accountId + email
 *   6. accountUpdate — ignores disallowed fields
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

const { accountUpdate } = require("../functions/callables/phase7Account");

const TEST_PREFIX = "__PHASE7_TEST__";
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

// ══════════════════════════════════════════════════════════════════════════
// 1. accountUpdate — simple fields (fcmToken, language)
// ══════════════════════════════════════════════════════════════════════════

async function testSimpleFields() {
  console.log("\n[1] accountUpdate — simple fields");

  const accountId = `${TEST_PREFIX}account1`;
  // Seed
  await db.collection("Accounts").doc(accountId).set({
    email: `${TEST_PREFIX}@test.com`,
    name: "Test Account"
  });
  cleanupRefs.push({ col: "Accounts", id: accountId });

  await accountUpdate({
    accountId,
    fcmToken: "test-token-abc",
    language: "he",
  });

  const snap = await db.collection("Accounts").doc(accountId).get();
  assert(snap.exists, "Account doc exists");
  assertEqual(snap.data().fcmToken, "test-token-abc", "fcmToken updated");
  assertEqual(snap.data().language, "he", "language updated");
  assertEqual(snap.data().name, "Test Account", "name preserved (not overwritten)");
}

// ══════════════════════════════════════════════════════════════════════════
// 2. accountUpdate — addFcmWebToken (arrayUnion)
// ══════════════════════════════════════════════════════════════════════════

async function testAddFcmWebToken() {
  console.log("\n[2] accountUpdate — addFcmWebToken");

  const accountId = `${TEST_PREFIX}account2`;
  await db.collection("Accounts").doc(accountId).set({
    email: `${TEST_PREFIX}2@test.com`,
    fcmTokens: [],
  });
  cleanupRefs.push({ col: "Accounts", id: accountId });

  await accountUpdate({
    accountId,
    addFcmWebToken: "web-token-xyz",
  });

  const snap = await db.collection("Accounts").doc(accountId).get();
  const tokens = snap.data().fcmTokens || [];
  assert(Array.isArray(tokens) && tokens.length === 1, "fcmTokens has 1 entry");
  assertEqual(tokens[0]?.token, "web-token-xyz", "token value");
  assertEqual(tokens[0]?.platform, "web", "platform is web");
  assert(typeof tokens[0]?.updatedAt === "number", "updatedAt is a number");
}

// ══════════════════════════════════════════════════════════════════════════
// 3. accountUpdate — removeFcmWebToken (arrayRemove)
// ══════════════════════════════════════════════════════════════════════════

async function testRemoveFcmWebToken() {
  console.log("\n[3] accountUpdate — removeFcmWebToken");

  const accountId = `${TEST_PREFIX}account3`;
  const entry = { token: "web-token-remove", platform: "web", updatedAt: 1234567890 };
  await db.collection("Accounts").doc(accountId).set({
    email: `${TEST_PREFIX}3@test.com`,
    fcmTokens: [entry, { token: "keep-this", platform: "web", updatedAt: 999 }],
  });
  cleanupRefs.push({ col: "Accounts", id: accountId });

  await accountUpdate({
    accountId,
    removeFcmWebToken: entry,
  });

  const snap = await db.collection("Accounts").doc(accountId).get();
  const tokens = snap.data().fcmTokens || [];
  assert(tokens.length === 1, "1 token remains");
  assertEqual(tokens[0]?.token, "keep-this", "correct token remains");
}

// ══════════════════════════════════════════════════════════════════════════
// 4. accountUpdate — email-based lookup
// ══════════════════════════════════════════════════════════════════════════

async function testEmailLookup() {
  console.log("\n[4] accountUpdate — email-based lookup");

  const accountId = `${TEST_PREFIX}account4`;
  const email = `${TEST_PREFIX}lookup@test.com`;
  await db.collection("Accounts").doc(accountId).set({
    email,
    name: "Email Lookup Test",
    fcmToken: "old-token",
  });
  cleanupRefs.push({ col: "Accounts", id: accountId });

  // Call with email instead of accountId
  await accountUpdate({
    email,
    fcmToken: "new-token-via-email",
  });

  const snap = await db.collection("Accounts").doc(accountId).get();
  assertEqual(snap.data().fcmToken, "new-token-via-email", "fcmToken updated via email lookup");
}

// ══════════════════════════════════════════════════════════════════════════
// 5. accountUpdate — rejects missing accountId + email
// ══════════════════════════════════════════════════════════════════════════

async function testRejectsMissingId() {
  console.log("\n[5] accountUpdate — rejects missing accountId + email");

  let threw = false;
  try {
    await accountUpdate({ fcmToken: "should-fail" });
  } catch (e) {
    threw = true;
    assert(e.message.includes("required"), `Error says required: "${e.message}"`);
  }
  assert(threw, "Threw an error when no accountId or email");
}

// ══════════════════════════════════════════════════════════════════════════
// 6. accountUpdate — ignores disallowed fields
// ══════════════════════════════════════════════════════════════════════════

async function testIgnoresDisallowed() {
  console.log("\n[6] accountUpdate — ignores disallowed fields");

  const accountId = `${TEST_PREFIX}account6`;
  await db.collection("Accounts").doc(accountId).set({
    email: `${TEST_PREFIX}6@test.com`,
    name: "Original Name",
  });
  cleanupRefs.push({ col: "Accounts", id: accountId });

  // Try to smuggle in "name" and "email" fields
  await accountUpdate({
    accountId,
    language: "en",
    name: "Hacked Name",
    email: "hacked@test.com",
  });

  const snap = await db.collection("Accounts").doc(accountId).get();
  assertEqual(snap.data().language, "en", "language was set");
  assertEqual(snap.data().name, "Original Name", "name NOT overwritten");
  assertEqual(snap.data().email, `${TEST_PREFIX}6@test.com`, "email NOT overwritten");
}

// ══════════════════════════════════════════════════════════════════════════
// Run all
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Phase 7 Smoke Tests — accountUpdate callable");
  console.log("═══════════════════════════════════════════════════════");

  try {
    await testSimpleFields();
    await testAddFcmWebToken();
    await testRemoveFcmWebToken();
    await testEmailLookup();
    await testRejectsMissingId();
    await testIgnoresDisallowed();
  } catch (e) {
    console.error("\n💥 Unexpected error:", e);
    failed++;
  }

  await cleanup();

  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════");
  process.exit(failed > 0 ? 1 : 0);
}

main();
