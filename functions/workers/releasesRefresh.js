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
const { feedEventDocIdForRelease } = require("../lib/utils");

const PLAYERS_TABLE = "Players";
const FEED_EVENTS_TABLE = "FeedEvents";

const FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB = "NEW_RELEASE_FROM_CLUB";
const NOTIFICATION_MIN_MARKET_VALUE = 150000;
const NOTIFICATION_MAX_MARKET_VALUE = 4000000;
const NOTIFICATION_MAX_AGE = 33;

const RELEASE_RANGES = [
  [150000, 250000],
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
  [2200001, 2500000],
  [2500001, 3000000],
  [3000001, 3500000],
  [3500001, 4000000],
];

const DELAY_BETWEEN_RANGES_MS = 6000;

function buildReleaseEventPayload(release, isInDatabase, nowTs) {
  return {
    type: FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB,
    playerName: release.playerName || "Unknown",
    playerImage: release.playerImage || null,
    playerTmProfile: release.playerUrl || null,
    playerPosition: release.playerPosition || null,
    marketValue: release.marketValue || null,
    playerAge: release.playerAge || null,
    playerNationality: release.playerNationality || null,
    playerNationalityFlag: release.playerNationalityFlag || null,
    transferDate: release.transferDate || null,
    oldValue: null,
    newValue: "Without club",
    extraInfo: isInDatabase ? "IN_DATABASE" : "NOT_IN_DATABASE",
    timestamp: nowTs,
  };
}

function orderedReleaseTimestamp(baseTs, index) {
  return baseTs - index;
}

function buildReleaseEnrichmentPatch(release) {
  const patch = {};
  if (release.playerName) patch.playerName = release.playerName;
  if (release.playerImage) patch.playerImage = release.playerImage;
  if (release.playerPosition) patch.playerPosition = release.playerPosition;
  if (release.marketValue) patch.marketValue = release.marketValue;
  if (release.playerAge) patch.playerAge = release.playerAge;
  if (release.playerNationality) patch.playerNationality = release.playerNationality;
  if (release.playerNationalityFlag) patch.playerNationalityFlag = release.playerNationalityFlag;
  if (release.transferDate) patch.transferDate = release.transferDate;
  return patch;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseMarketValueToEur(value) {
  if (!value) return null;
  const normalized = String(value)
    .replace(/\u20ac/g, "")
    .replace(/,/g, "")
    .trim()
    .toLowerCase();
  const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*([mk])?/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (Number.isNaN(num)) return null;
  const unit = match[2];
  if (unit === "m") return Math.round(num * 1000000);
  if (unit === "k") return Math.round(num * 1000);
  return Math.round(num);
}

function parsePlayerAge(value) {
  if (!value) return null;
  const match = String(value).match(/\d{1,2}/);
  if (!match) return null;
  const age = parseInt(match[0], 10);
  return Number.isNaN(age) ? null : age;
}

function isNotificationReleaseCandidate(release) {
  const marketValueEur = parseMarketValueToEur(release?.marketValue);
  const age = parsePlayerAge(release?.playerAge);
  return (
    marketValueEur !== null &&
    marketValueEur >= NOTIFICATION_MIN_MARKET_VALUE &&
    marketValueEur <= NOTIFICATION_MAX_MARKET_VALUE &&
    age !== null &&
    age <= NOTIFICATION_MAX_AGE
  );
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
    const constrainedReleases = distinctReleases.filter(isNotificationReleaseCandidate);
    const currentUrls = new Set(constrainedReleases.map((r) => r.playerUrl).filter(Boolean));
    const newReleases = constrainedReleases.filter((r) => !knownUrls.has(r.playerUrl || ""));

    log(`Total releases after constraints: ${constrainedReleases.length}, new: ${newReleases.length}`);

    // Bootstrap: first cloud run has empty knownUrls — avoid creating 100+ duplicate events
    const isBootstrap = knownUrls.size === 0 && constrainedReleases.length > 50;
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
    const existingEventIdsByUrl = new Map();

    for (let i = 0; i < newReleaseUrls.length; i += 30) {
      const chunk = newReleaseUrls.slice(i, i + 30);
      const snapshot = await feedRef
        .where("type", "==", FEED_EVENT_TYPE_NEW_RELEASE_FROM_CLUB)
        .where("playerTmProfile", "in", chunk)
        .get();
      snapshot.docs.forEach((d) => {
        const tm = d.get("playerTmProfile");
        if (!tm) return;
        alreadyHaveEvents.add(tm);
        if (!existingEventIdsByUrl.has(tm)) existingEventIdsByUrl.set(tm, []);
        existingEventIdsByUrl.get(tm).push(d.id);
      });
    }

    const releasesToCreate = newReleases.filter(
      (r) => !alreadyHaveEvents.has(r.playerUrl || "")
    );
    log(
      `Releases already in feed: ${alreadyHaveEvents.size}, creating events for: ${releasesToCreate.length}`
    );

    // Batch player lookups (Firestore "in" max 30) — avoids N sequential queries
    const playersInDb = new Set();
    const urlsToCheck = releasesToCreate.map((r) => r.playerUrl).filter(Boolean);
    for (let i = 0; i < urlsToCheck.length; i += 30) {
      const chunk = urlsToCheck.slice(i, i + 30);
      const snapshot = await playersRef.where("tmProfile", "in", chunk).get();
      snapshot.docs.forEach((d) => {
        const tm = d.data()?.tmProfile;
        if (tm) playersInDb.add(tm);
      });
    }

    const now = Date.now();

    // Backfill existing release events with enriched metadata so clients can read complete data directly.
    const releaseByUrl = new Map(
      constrainedReleases
        .filter((r) => r.playerUrl)
        .map((r) => [r.playerUrl, r])
    );
    for (const [playerUrl, eventIds] of existingEventIdsByUrl.entries()) {
      const release = releaseByUrl.get(playerUrl);
      if (!release) continue;
      const payload = buildReleaseEnrichmentPatch(release);
      if (Object.keys(payload).length === 0) continue;
      try {
        await Promise.all(
          eventIds.map((eventId) => feedRef.doc(eventId).set(payload, { merge: true }))
        );
      } catch (err) {
        log(`Failed to backfill release event(s) for ${release.playerName || playerUrl}: ${err.message}`);
      }
    }

    for (const [index, release] of releasesToCreate.entries()) {
      const playerUrl = release.playerUrl;
      if (!playerUrl) continue;

      const isInDatabase = playersInDb.has(playerUrl);
      const docId = feedEventDocIdForRelease(playerUrl);

      try {
        await feedRef.doc(docId).set(
          buildReleaseEventPayload(release, isInDatabase, orderedReleaseTimestamp(now, index)),
          { merge: true }
        );
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
