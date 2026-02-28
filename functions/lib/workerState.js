/**
 * Worker state — replaces SharedPreferences for cloud workers.
 * Stored in Firestore WorkerState collection.
 *
 * Documents:
 * - ReleasesRefreshWorker: { knownReleaseUrls: string[], lastRefreshSuccess: number }
 * - PlayerRefreshWorker: { lastRefreshSuccess: number }
 * - MandateExpiryWorker: { lastRefreshSuccess: number }
 */

const WORKER_STATE_COLLECTION = "WorkerState";

async function getWorkerState(db, workerName) {
  const doc = await db.collection(WORKER_STATE_COLLECTION).doc(workerName).get();
  return doc.exists ? doc.data() : {};
}

async function setWorkerState(db, workerName, data) {
  const docRef = db.collection(WORKER_STATE_COLLECTION).doc(workerName);
  await docRef.set(
    {
      ...data,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

async function getKnownReleaseUrls(db) {
  const state = await getWorkerState(db, "ReleasesRefreshWorker");
  const urls = state.knownReleaseUrls || [];
  return new Set(Array.isArray(urls) ? urls : []);
}

async function saveKnownReleaseUrls(db, urls) {
  await setWorkerState(db, "ReleasesRefreshWorker", {
    knownReleaseUrls: Array.from(urls),
    lastRefreshSuccess: Date.now(),
  });
}

async function markRefreshSuccess(db, workerName) {
  await setWorkerState(db, workerName, {
    lastRefreshSuccess: Date.now(),
  });
}

module.exports = {
  getWorkerState,
  setWorkerState,
  getKnownReleaseUrls,
  saveKnownReleaseUrls,
  markRefreshSuccess,
  WORKER_STATE_COLLECTION,
};
