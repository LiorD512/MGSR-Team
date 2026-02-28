/**
 * Worker run confirmation — records when each cloud worker finishes successfully.
 * Stored in Firestore WorkerRuns collection for monitoring and debugging.
 *
 * Document structure:
 * - workerName: "MandateExpiryWorker" | "ReleasesRefreshWorker" | "PlayerRefreshWorker"
 * - status: "success" | "failed"
 * - lastRunAt: timestamp (ms)
 * - durationMs: number
 * - summary: string (e.g. "3 mandates processed")
 * - error: string (if failed)
 * - createdAt: timestamp
 */

const WORKER_RUNS_COLLECTION = "WorkerRuns";

/**
 * Records a successful worker run. Overwrites the worker's doc so we always
 * have the latest status for each worker.
 */
async function recordSuccess(db, workerName, summary, durationMs) {
  const docRef = db.collection(WORKER_RUNS_COLLECTION).doc(workerName);
  const now = Date.now();
  const data = {
    workerName,
    status: "success",
    lastRunAt: now,
    durationMs: durationMs || 0,
    summary: summary || "Completed",
    error: null,
    updatedAt: now,
  };
  await docRef.set(data, { merge: true });
  console.log(`[WorkerRuns] ${workerName}: SUCCESS — ${summary} (${durationMs}ms)`);
}

/**
 * Records a failed worker run.
 */
async function recordFailure(db, workerName, error, durationMs) {
  const docRef = db.collection(WORKER_RUNS_COLLECTION).doc(workerName);
  const now = Date.now();
  const data = {
    workerName,
    status: "failed",
    lastRunAt: now,
    durationMs: durationMs || 0,
    summary: null,
    error: error && error.message ? error.message : String(error),
    updatedAt: now,
  };
  await docRef.set(data, { merge: true });
  console.error(`[WorkerRuns] ${workerName}: FAILED —`, error);
}

module.exports = { recordSuccess, recordFailure, WORKER_RUNS_COLLECTION };
