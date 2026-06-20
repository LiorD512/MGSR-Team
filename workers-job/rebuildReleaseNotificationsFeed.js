#!/usr/bin/env node
/**
 * One-time rebuild for notification releases feed events.
 *
 * Steps:
 * 1) Delete all NEW_RELEASE_FROM_CLUB docs from FeedEvents.
 * 2) Force knownReleaseUrls to a marker so worker treats all current releases as new.
 * 3) Run releases refresh worker once to repopulate feed events.
 * 4) Remove force marker from knownReleaseUrls.
 *
 * Usage:
 *   node rebuildReleaseNotificationsFeed.js --apply
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { runReleasesRefresh } = require("./releasesRefresh");

const APPLY = process.argv.includes("--apply");
const FEED_EVENTS_TABLE = "FeedEvents";
const FEED_EVENT_TYPE = "NEW_RELEASE_FROM_CLUB";
const WORKER_STATE_COLLECTION = "WorkerState";
const WORKER_STATE_DOC = "ReleasesRefreshWorker";
const FORCE_MARKER = "__FORCE_RELEASE_REBUILD__";

if (!APPLY) {
  console.log("[rebuildReleaseNotificationsFeed] Refusing to run without --apply");
  process.exit(1);
}

initializeApp();
const db = getFirestore();

async function deleteReleaseFeedEvents() {
  let deleted = 0;

  while (true) {
    const snap = await db
      .collection(FEED_EVENTS_TABLE)
      .where("type", "==", FEED_EVENT_TYPE)
      .limit(400)
      .get();

    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.delete(doc.ref);
      deleted += 1;
    });
    await batch.commit();
  }

  return deleted;
}

async function setForceKnownUrls() {
  await db.collection(WORKER_STATE_COLLECTION).doc(WORKER_STATE_DOC).set(
    {
      knownReleaseUrls: [FORCE_MARKER],
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

async function cleanupForceMarker() {
  const ref = db.collection(WORKER_STATE_COLLECTION).doc(WORKER_STATE_DOC);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const urls = Array.isArray(data.knownReleaseUrls) ? data.knownReleaseUrls : [];
  const filtered = urls.filter((u) => u !== FORCE_MARKER);
  await ref.set(
    {
      knownReleaseUrls: filtered,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

async function main() {
  console.log("[rebuildReleaseNotificationsFeed] Starting rebuild");

  const deleted = await deleteReleaseFeedEvents();
  console.log(`[rebuildReleaseNotificationsFeed] Deleted ${deleted} release feed event(s)`);

  await setForceKnownUrls();
  console.log("[rebuildReleaseNotificationsFeed] Forced knownReleaseUrls marker");

  try {
    await runReleasesRefresh(db);
  } finally {
    await cleanupForceMarker();
    console.log("[rebuildReleaseNotificationsFeed] Force marker removed");
  }

  console.log("[rebuildReleaseNotificationsFeed] Rebuild complete");
}

main().catch((err) => {
  console.error("[rebuildReleaseNotificationsFeed] FAILED", err);
  process.exit(1);
});
