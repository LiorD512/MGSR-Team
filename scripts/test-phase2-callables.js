#!/usr/bin/env node
/**
 * Phase 2 Smoke Test — Verify callables produce identical Firestore docs.
 *
 * Usage:
 *   cd functions && npm install   (if not done)
 *   cd ..
 *   node scripts/test-phase2-callables.js
 *
 * What it does:
 *   1. Creates a test request via requestsCreate → reads back & verifies all fields
 *   2. Updates it via requestsUpdate → reads back & verifies changed fields
 *   3. Deletes it via requestsDelete → verifies doc gone + FeedEvent written
 *   4. Creates a test task via tasksCreate → reads back & verifies linkedAgent fields
 *   5. Toggles it via tasksToggleComplete → verifies isCompleted flipped
 *   6. Deletes the test task via tasksDelete
 *   7. Creates a test contact via contactsCreate → reads back
 *   8. Deletes the test contact via contactsDelete
 *
 * All test docs use a "__PHASE2_TEST__" prefix so they're easy to identify.
 * Everything created is cleaned up at the end.
 */

const admin = require("firebase-admin");

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Import callables directly (bypasses onCall wrapper, calls the same logic)
const { requestsCreate, requestsUpdate, requestsDelete } = require("../functions/callables/requests");
const { contactsCreate, contactsUpdate, contactsDelete } = require("../functions/callables/contacts");
const { tasksCreate, tasksToggleComplete, tasksDelete } = require("../functions/callables/tasks");

const PLATFORM = "men"; // test on men platform
const TEST_PREFIX = "__PHASE2_TEST__";

let passed = 0;
let failed = 0;
const cleanupIds = { requests: [], contacts: [], tasks: [], feedEvents: [] };

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

async function testRequests() {
  console.log("\n━━━ REQUEST CRUD ━━━");

  // 1. Create
  console.log("\n1) requestsCreate:");
  const createResult = await requestsCreate({
    platform: PLATFORM,
    clubTmProfile: "https://transfermarkt.com/test-club/123",
    clubName: `${TEST_PREFIX}Test Club FC`,
    clubLogo: "https://example.com/logo.png",
    clubCountry: "Israel",
    clubCountryFlag: "🇮🇱",
    position: "CB",
    notes: "Test request from Phase 2 script",
    minAge: 20,
    maxAge: 28,
    ageDoesntMatter: false,
    salaryRange: "6-10",
    transferFee: "<200",
    dominateFoot: "right",
    euOnly: true,
    createdByAgent: "Test Agent",
    createdByAgentHebrew: "סוכן בדיקה",
  });
  const requestId = createResult.id;
  assert(!!requestId, `Created request with id: ${requestId}`);
  cleanupIds.requests.push(requestId);

  // Read back and verify fields
  const reqDoc = await db.collection("ClubRequests").doc(requestId).get();
  const req = reqDoc.data();
  assertEqual(req.clubName, `${TEST_PREFIX}Test Club FC`, "clubName");
  assertEqual(req.clubCountry, "Israel", "clubCountry");
  assertEqual(req.position, "CB", "position");
  assertEqual(req.minAge, 20, "minAge");
  assertEqual(req.maxAge, 28, "maxAge");
  assertEqual(req.ageDoesntMatter, false, "ageDoesntMatter");
  assertEqual(req.salaryRange, "6-10", "salaryRange");
  assertEqual(req.transferFee, "<200", "transferFee");
  assertEqual(req.dominateFoot, "right", "dominateFoot");
  assertEqual(req.euOnly, true, "euOnly");
  assertEqual(req.status, "pending", "status (default)");
  assertEqual(req.quantity, 1, "quantity (default)");
  assertEqual(req.contactId, "", "contactId (default empty)");
  assertEqual(req.createdByAgent, "Test Agent", "createdByAgent");
  assertEqual(req.createdByAgentHebrew, "סוכן בדיקה", "createdByAgentHebrew");
  assert(typeof req.createdAt === "number" && req.createdAt > 0, "createdAt is timestamp");

  // Verify FeedEvent was created
  const feedSnap = await db.collection("FeedEvents")
    .where("type", "==", "REQUEST_ADDED")
    .where("playerName", "==", `${TEST_PREFIX}Test Club FC`)
    .get();
  assert(!feedSnap.empty, "FeedEvent REQUEST_ADDED written");
  if (!feedSnap.empty) {
    const fe = feedSnap.docs[0].data();
    assertEqual(fe.newValue, "CB", "FeedEvent newValue = position");
    assertEqual(fe.agentName, "Test Agent", "FeedEvent agentName");
    cleanupIds.feedEvents.push(...feedSnap.docs.map(d => d.id));
  }

  // 2. Update
  console.log("\n2) requestsUpdate:");
  await requestsUpdate({
    platform: PLATFORM,
    requestId,
    position: "ST",
    notes: "Updated notes",
    salaryRange: "11-15",
    euOnly: false,
  });
  const updated = (await db.collection("ClubRequests").doc(requestId).get()).data();
  assertEqual(updated.position, "ST", "position updated");
  assertEqual(updated.notes, "Updated notes", "notes updated");
  assertEqual(updated.salaryRange, "11-15", "salaryRange updated");
  assertEqual(updated.euOnly, false, "euOnly updated");
  assertEqual(updated.clubName, `${TEST_PREFIX}Test Club FC`, "clubName unchanged");
  assertEqual(updated.minAge, 20, "minAge unchanged");

  // 3. Delete
  console.log("\n3) requestsDelete:");
  await requestsDelete({
    platform: PLATFORM,
    requestId,
    agentName: "Test Agent",
    requestSnapshot: "Test Club FC | ST | 11-15",
  });
  const deletedDoc = await db.collection("ClubRequests").doc(requestId).get();
  assert(!deletedDoc.exists, "Request doc deleted");

  const delFeed = await db.collection("FeedEvents")
    .where("type", "==", "REQUEST_DELETED")
    .where("playerName", "==", `${TEST_PREFIX}Test Club FC`)
    .get();
  assert(!delFeed.empty, "FeedEvent REQUEST_DELETED written");
  if (!delFeed.empty) cleanupIds.feedEvents.push(...delFeed.docs.map(d => d.id));

  // Remove from cleanup since already deleted
  cleanupIds.requests = cleanupIds.requests.filter(id => id !== requestId);
}

async function testTasks() {
  console.log("\n━━━ TASK CREATE + TOGGLE ━━━");

  // Create task with linkedAgent fields (was the PlayerInfoViewModel bypass)
  console.log("\n4) tasksCreate (with linkedAgent fields):");
  const result = await tasksCreate({
    platform: PLATFORM,
    title: `${TEST_PREFIX}Follow up with agent`,
    notes: "Test task from Phase 2",
    dueDate: Date.now() + 86400000,
    priority: 2,
    playerId: "player_123",
    playerName: "Test Player",
    linkedAgentContactId: "contact_456",
    linkedAgentContactName: "Agent Name",
    linkedAgentContactPhone: "+972501234567",
  });
  const taskId = result.id;
  assert(!!taskId, `Created task with id: ${taskId}`);
  cleanupIds.tasks.push(taskId);

  const taskDoc = await db.collection("AgentTasks").doc(taskId).get();
  const task = taskDoc.data();
  assertEqual(task.title, `${TEST_PREFIX}Follow up with agent`, "title");
  assertEqual(task.priority, 2, "priority");
  assertEqual(task.playerId, "player_123", "playerId");
  assertEqual(task.playerName, "Test Player", "playerName");
  assertEqual(task.linkedAgentContactId, "contact_456", "linkedAgentContactId");
  assertEqual(task.linkedAgentContactName, "Agent Name", "linkedAgentContactName");
  assertEqual(task.linkedAgentContactPhone, "+972501234567", "linkedAgentContactPhone");
  assertEqual(task.isCompleted, false, "isCompleted default false");

  // 5. Toggle complete
  console.log("\n5) tasksToggleComplete:");
  await tasksToggleComplete({
    platform: PLATFORM,
    taskId,
    isCompleted: true,
  });
  const toggled = (await db.collection("AgentTasks").doc(taskId).get()).data();
  assertEqual(toggled.isCompleted, true, "isCompleted toggled to true");
  assert(typeof toggled.completedAt === "number", "completedAt set");

  // Toggle back
  await tasksToggleComplete({
    platform: PLATFORM,
    taskId,
    isCompleted: false,
  });
  const toggledBack = (await db.collection("AgentTasks").doc(taskId).get()).data();
  assertEqual(toggledBack.isCompleted, false, "isCompleted toggled back to false");
  assertEqual(toggledBack.completedAt, 0, "completedAt cleared to 0");

  // 6. Delete
  console.log("\n6) tasksDelete:");
  await tasksDelete({ platform: PLATFORM, taskId });
  const deletedTask = await db.collection("AgentTasks").doc(taskId).get();
  assert(!deletedTask.exists, "Task doc deleted");
  cleanupIds.tasks = cleanupIds.tasks.filter(id => id !== taskId);
}

async function testContacts() {
  console.log("\n━━━ CONTACT CREATE + DELETE ━━━");

  console.log("\n7) contactsCreate:");
  const result = await contactsCreate({
    platform: PLATFORM,
    name: `${TEST_PREFIX}John Doe`,
    phoneNumber: "+972501234567",
    role: "Agent",
    clubName: "Test FC",
    clubCountry: "Israel",
    contactType: "CLUB",
  });
  const contactId = result.id;
  assert(!!contactId, `Created contact with id: ${contactId}`);
  cleanupIds.contacts.push(contactId);

  const { CONTACTS_COLLECTIONS } = require("../functions/lib/platformCollections");
  const contactCol = CONTACTS_COLLECTIONS[PLATFORM];
  const contactDoc = await db.collection(contactCol).doc(contactId).get();
  const contact = contactDoc.data();
  assertEqual(contact.name, `${TEST_PREFIX}John Doe`, "name");
  assertEqual(contact.phoneNumber, "+972501234567", "phoneNumber");
  assertEqual(contact.role, "Agent", "role");

  // 8. Delete
  console.log("\n8) contactsDelete:");
  await contactsDelete({ platform: PLATFORM, contactId });
  const deleted = await db.collection(contactCol).doc(contactId).get();
  assert(!deleted.exists, "Contact doc deleted");
  cleanupIds.contacts = cleanupIds.contacts.filter(id => id !== contactId);
}

async function cleanup() {
  console.log("\n━━━ CLEANUP ━━━");
  for (const id of cleanupIds.requests) {
    await db.collection("ClubRequests").doc(id).delete().catch(() => {});
    console.log(`  🧹 Deleted leftover request ${id}`);
  }
  for (const id of cleanupIds.tasks) {
    await db.collection("AgentTasks").doc(id).delete().catch(() => {});
    console.log(`  🧹 Deleted leftover task ${id}`);
  }
  for (const id of cleanupIds.contacts) {
    await db.collection("Contacts").doc(id).delete().catch(() => {});
    // Also try women/youth collections just in case
    await db.collection("ContactsWomen").doc(id).delete().catch(() => {});
    await db.collection("ContactsYouth").doc(id).delete().catch(() => {});
    console.log(`  🧹 Deleted leftover contact ${id}`);
  }
  for (const id of cleanupIds.feedEvents) {
    await db.collection("FeedEvents").doc(id).delete().catch(() => {});
    console.log(`  🧹 Deleted test FeedEvent ${id}`);
  }
}

async function main() {
  console.log("╔═══════════════════════════════════════════╗");
  console.log("║   Phase 2 Callable Smoke Test             ║");
  console.log("║   Testing: Requests, Tasks, Contacts      ║");
  console.log("╚═══════════════════════════════════════════╝");

  try {
    await testRequests();
    await testTasks();
    await testContacts();
  } catch (err) {
    console.error("\n💥 Unexpected error:", err);
    failed++;
  }

  await cleanup();

  console.log("\n══════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("══════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
