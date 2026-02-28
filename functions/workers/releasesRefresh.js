/**
 * ReleasesRefreshWorker — Cloud version.
 * Runs nightly at 03:00 Israel time.
 * Fetches releases from Transfermarkt, detects new free agents, writes FeedEvents.
 */

const { getFirestore } = require("firebase-admin/firestore");
const { getLatestReleasesForRange } = require("../lib/transfermarkt");
const { recordSuccess, recordFailure } = require("../lib/workerRuns");
const {
  getKnownReleaseUrls,
  saveKnownReleaseUrls,
  markRefreshSuccess,
} = require("../lib/workerState");
const { feedEventDocId } = require("../lib/utils");

const PLAYERS_TABLE = "Players";
const FEED_EVENTS_TABLE = "FeedEvents";

const FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB = "NEW_RELEASE_FROM_CLUB";

const RELEASE_RANGES = [
  [125000, 250000],
  [250001, 400000],
  [400001, 600000],
  [600001, 800000],
  [800001, 1000000],
  [1000001, 1200000],
  [1200001, 1400000],
  [1400001, 1600000],
  [1600001, 1800000],
  [1800000, 2000000],
  [2000000, 2200000],
];

const DELAY_BETWEEN_RANGES_MS = 8000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runReleasesRefresh() {
  const db = getFirestore();
  const startTime = Date.now();
  const logs = [];

  const log = (msg) => {
    logs.push(msg);
    console.log(`[ReleasesRefresh] ${msg}`);
  };

  try {
    log("Starting releases refresh");
    const playersRef = db.collection(PLAYERS_TABLE);
    const feedRef = db.collection(FEED_EVENTS_TABLE);

    const knownUrls = await getKnownReleaseUrls(db);
    log(`Previously known releases: ${knownUrls.size}`);

    const allReleases = [];
    for (let i = 0; i < RELEASE_RANGES.length; i++) {
      const [minVal, maxVal] = RELEASE_RANGES[i];
      log(`Fetching range ${i + 1}/${RELEASE_RANGES.length}: ${minVal}-${maxVal}`);
      try {
        const releases = await getLatestReleasesForRange(minVal, maxVal, true);
        allReleases.push(...releases);
        log(`Fetched range ${i + 1}/${RELEASE_RANGES.length}: ${releases.length} releases`);
      } catch (err) {
        log(`Failed range ${minVal}-${maxVal}: ${err.message}`);
      }
      if (i < RELEASE_RANGES.length - 1) {
        await sleep(DELAY_BETWEEN_RANGES_MS);
      }
    }

    const distinctByUrl = new Map();
    allReleases.forEach((r) => {
      const url = r.playerUrl;
      if (url) distinctByUrl.set(url, r);
    });
    const distinctReleases = Array.from(distinctByUrl.values());
    const currentUrls = new Set(distinctReleases.map((r) => r.playerUrl).filter(Boolean));
    const newReleases = distinctReleases.filter((r) => !knownUrls.has(r.playerUrl || ""));

    log(`Total releases: ${distinctReleases.length}, new: ${newReleases.length}`);

    // Bootstrap: first cloud run has empty knownUrls — avoid creating 100+ duplicate events
    const isBootstrap = knownUrls.size === 0 && distinctReleases.length > 50;
    if (isBootstrap) {
      log("Bootstrap mode: saving known URLs without creating events (first run)");
      await saveKnownReleaseUrls(db, currentUrls);
      await markRefreshSuccess(db, "ReleasesRefreshWorker");
      const durationMs = Date.now() - startTime;
      await recordSuccess(
        db,
        "ReleasesRefreshWorker",
        `Bootstrap: ${currentUrls.size} URLs saved, no events created`,
        durationMs
      );
      return { success: true, bootstrap: true, totalKnown: currentUrls.size, durationMs };
    }

    const newReleaseUrls = newReleases.map((r) => r.playerUrl).filter(Boolean);
    const alreadyHaveEvents = new Set();

    for (let i = 0; i < newReleaseUrls.length; i += 30) {
      const chunk = newReleaseUrls.slice(i, i + 30);
      const snapshot = await feedRef
        .where("type", "==", FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB)
        .where("playerTmProfile", "in", chunk)
        .get();
      snapshot.docs.forEach((d) => {
        const tm = d.get("playerTmProfile");
        if (tm) alreadyHaveEvents.add(tm);
      });
    }

    const releasesToCreate = newReleases.filter(
      (r) => !alreadyHaveEvents.has(r.playerUrl || "")
    );
    log(
      `Releases already in feed: ${alreadyHaveEvents.size}, creating events for: ${releasesToCreate.length}`
    );

    for (const release of releasesToCreate) {
      const playerUrl = release.playerUrl;
      if (!playerUrl) continue;

      const playerSnap = await playersRef.where("tmProfile", "==", playerUrl).get();
      const isInDatabase = !playerSnap.empty;

      const now = Date.now();
      const docId = feedEventDocId(
        FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB,
        playerUrl,
        now
      );

      try {
        await feedRef.doc(docId).set({
          type: FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB,
          playerName: release.playerName || "Unknown",
          playerImage: release.playerImage || null,
          playerTmProfile: playerUrl,
          oldValue: null,
          newValue: "Without club",
          extraInfo: isInDatabase ? "IN_DATABASE" : "NOT_IN_DATABASE",
          timestamp: now,
        });
        log(`New release: ${release.playerName} (in DB: ${isInDatabase})`);
      } catch (err) {
        log(`Failed to write feed event for ${release.playerName}: ${err.message}`);
      }
    }

    await saveKnownReleaseUrls(db, currentUrls);
    await markRefreshSuccess(db, "ReleasesRefreshWorker");

    const durationMs = Date.now() - startTime;
    await recordSuccess(
      db,
      "ReleasesRefreshWorker",
      `${releasesToCreate.length} new events created, ${currentUrls.size} total known`,
      durationMs
    );

    log(
      `Complete — ${releasesToCreate.length} new events created, ${currentUrls.size} total known in ${durationMs}ms`
    );
    return {
      success: true,
      newEvents: releasesToCreate.length,
      totalKnown: currentUrls.size,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const db = getFirestore();
    await recordFailure(db, "ReleasesRefreshWorker", err, durationMs);
    log(`FAILED: ${err.message}`);
    console.error(`[ReleasesRefresh] Fatal error:`, err);
    throw err;
  }
}

module.exports = { runReleasesRefresh };
