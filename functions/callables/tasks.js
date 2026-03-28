/**
 * Shared callable: Tasks CRUD.
 * Single source for create, update, toggle-complete, delete — called by both Android & Web.
 */
const { getFirestore } = require("firebase-admin/firestore");
const { AGENT_TASKS_COLLECTIONS, validatePlatform } = require("../lib/platformCollections");
const { validateTaskCreate, validateTaskUpdate, requireId, bool } = require("../lib/validation");

function getDb() {
  return getFirestore();
}

async function tasksCreate(data) {
  validatePlatform(data.platform);
  const payload = validateTaskCreate(data);
  const col = AGENT_TASKS_COLLECTIONS[data.platform];
  const ref = await getDb().collection(col).add(payload);
  return { id: ref.id };
}

async function tasksUpdate(data) {
  validatePlatform(data.platform);
  const updates = validateTaskUpdate(data);
  const col = AGENT_TASKS_COLLECTIONS[data.platform];
  await getDb().collection(col).doc(data.taskId).update(updates);
  return { success: true };
}

async function tasksToggleComplete(data) {
  validatePlatform(data.platform);
  const taskId = requireId(data.taskId, "taskId");
  const col = AGENT_TASKS_COLLECTIONS[data.platform];
  const nowCompleted = bool(data.isCompleted);
  await getDb().collection(col).doc(taskId).update({
    isCompleted: nowCompleted,
    completedAt: nowCompleted ? Date.now() : 0,
  });
  return { success: true };
}

async function tasksDelete(data) {
  validatePlatform(data.platform);
  const taskId = requireId(data.taskId, "taskId");
  const col = AGENT_TASKS_COLLECTIONS[data.platform];
  await getDb().collection(col).doc(taskId).delete();
  return { success: true };
}

module.exports = { tasksCreate, tasksUpdate, tasksToggleComplete, tasksDelete };
