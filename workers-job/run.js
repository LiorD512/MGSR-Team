#!/usr/bin/env node
/**
 * Workers Job — Cloud Run Job entry point.
 * Runs the job specified by JOB_MODE env var.
 *
 * Modes:
 *  - player-refresh (default): Refreshes all players from Transfermarkt.
 *  - releases-refresh: Fetches new free-agent releases from Transfermarkt.
 *
 * Usage: JOB_MODE=player-refresh node run.js
 *        JOB_MODE=releases-refresh node run.js
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or runs with default GCP credentials.
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const JOB_MODE = process.env.JOB_MODE || "player-refresh";

initializeApp();
const db = getFirestore();

if (JOB_MODE === "releases-refresh") {
  const { runReleasesRefresh } = require("./releasesRefresh");
  runReleasesRefresh(db);
} else {
  // Default: player-refresh (original behavior)
  runPlayerRefresh();
}

// ── Player Refresh ──────────────────────────────────────────────────

const { updatePlayerByTmProfile } = require("./lib/playersUpdate");
const { feedEventDocId, isNoMarketValue } = require("./lib/utils");

const PLAYERS_TABLE = "Players";
const FEED_EVENTS_TABLE = "FeedEvents";
const WORKER_STATE_COLLECTION = "WorkerState";
const WORKER_RUNS_COLLECTION = "WorkerRuns";

const RECENT_REFRESH_THRESHOLD_MS = 20 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 24;

// ── Hourly micro-batch settings ──────────────────────────────────────
// Each hourly run processes at most MAX_PER_RUN players (stalest first).
// At ~10s/player, 200 players ≈ 33 min — well within the 2h job timeout.
// 200 × 24 runs/day = 4,800 players/day capacity.
const MAX_PER_RUN = 200;

// ── TM anti-detection delays ────────────────────────────────────────
// Vary delays to avoid a detectable pattern. The proxy handles actual
// TM rate limits, so we can use shorter intervals than before (was 12-18s).
const SINGLE_NET_DELAY_MIN_MS = 8000;
const SINGLE_NET_DELAY_VARIANCE_MS = 6000;
const BLOCK_BACKOFF_MIN_MS = 90000;
const MAX_BLOCK_BACKOFF_MS = 300000;
const MAX_RETRIES = 3;
// Jitter at start so we don't always hit TM at :00 sharp every hour
const START_JITTER_MAX_MS = 60000;

const TYPE_BECAME_FREE_AGENT = "BECAME_FREE_AGENT";
const TYPE_CLUB_CHANGE = "CLUB_CHANGE";

function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [PlayerRefresh] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay(min, variance) {
  return min + Math.floor(Math.random() * variance);
}

function isRateLimited(errMsg) {
  const lower = String(errMsg || "").toLowerCase();
  return (
    lower.includes("http 403") ||
    lower.includes("http 429") ||
    lower.includes("http 503") ||
    lower.includes("status=403") ||
    lower.includes("status=429") ||
    lower.includes("forbidden") ||
    lower.includes("too many requests")
  );
}

async function recordSuccess(summary, durationMs) {
  const docRef = db.collection(WORKER_RUNS_COLLECTION).doc("PlayerRefreshWorker");
  await docRef.set(
    {
      workerName: "PlayerRefreshWorker",
      status: "success",
      lastRunAt: Date.now(),
      durationMs,
      summary,
      error: null,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  log(`[WorkerRuns] SUCCESS — ${summary} (${durationMs}ms)`);
}

async function recordFailure(error, durationMs) {
  const docRef = db.collection(WORKER_RUNS_COLLECTION).doc("PlayerRefreshWorker");
  await docRef.set(
    {
      workerName: "PlayerRefreshWorker",
      status: "failed",
      lastRunAt: Date.now(),
      durationMs,
      summary: null,
      error: error?.message || String(error),
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  log(`[WorkerRuns] FAILED — ${error?.message || error}`);
}

async function markRefreshSuccess() {
  const docRef = db.collection(WORKER_STATE_COLLECTION).doc("PlayerRefreshWorker");
  await docRef.set(
    { lastRefreshSuccess: Date.now(), updatedAt: Date.now() },
    { merge: true }
  );
}

async function writeFeedEvent(feedRef, event) {
  try {
    const now = event.timestamp || Date.now();
    const docId = feedEventDocId(event.type, event.playerTmProfile, now);
    await feedRef.doc(docId).set(event);
    log(`Feed event written: ${event.type} for ${event.playerName}`);
  } catch (err) {
    log(`Failed to write feed event: ${event.type} for ${event.playerName} — ${err.message}`);
  }
}

async function processSuccessfulUpdate(player, data, docRef, feedRef, tmProfile) {
  const currentValue = player.marketValue;
  const newValueRaw = data.marketValue;
  const newValue = newValueRaw?.trim() ? newValueRaw : "€0";

  const valueChanged = !(
    isNoMarketValue(currentValue) &&
    isNoMarketValue(newValue)
  );
  if (!valueChanged) {
    // Still update history if we want to track
  }

  const history = [];
  if (player.marketValueHistory && Array.isArray(player.marketValueHistory)) {
    history.push(...player.marketValueHistory);
  }
  if (valueChanged) {
    history.push({ value: newValue, date: Date.now() });
  }
  const trimmedHistory = history.slice(-MAX_HISTORY_ENTRIES);

  const club = data.currentClub
    ? {
        clubName: data.currentClub.clubName,
        clubLogo: data.currentClub.clubLogo,
        clubTmProfile: data.currentClub.clubTmProfile,
        clubCountry: data.currentClub.clubCountry,
      }
    : null;

  const newClubName = club?.clubName;
  const oldClubName = player.currentClub?.clubName;
  const now = Date.now();

  if (
    newClubName &&
    newClubName.toLowerCase() !== (oldClubName || "").toLowerCase()
  ) {
    const nowWithoutClub = newClubName.toLowerCase() === "without club";
    const eventType = nowWithoutClub ? TYPE_BECAME_FREE_AGENT : TYPE_CLUB_CHANGE;
    await writeFeedEvent(feedRef, {
      type: eventType,
      playerName: player.fullName,
      playerImage: data.profileImage || player.profileImage,
      playerTmProfile: tmProfile,
      oldValue: oldClubName,
      newValue: newClubName,
      timestamp: now,
    });
  }

  const updated = {
    ...player,
    marketValue: newValue,
    profileImage: data.profileImage || player.profileImage,
    nationalityFlag: data.nationalityFlag || player.nationalityFlag,
    nationality: data.citizenship || player.nationality,
    nationalities: data.citizenships?.length ? data.citizenships : (player.nationalities || []),
    nationalityFlags: data.citizenshipFlags?.length ? data.citizenshipFlags : (player.nationalityFlags || []),
    age: data.age || player.age,
    contractExpired: data.contract || player.contractExpired,
    positions: data.positions || player.positions,
    currentClub: club || player.currentClub,
    marketValueHistory: trimmedHistory,
    lastRefreshedAt: now,
    isOnLoan: data.isOnLoan,
    onLoanFromClub: data.onLoanFromClub,
    foot: data.foot || player.foot,
    agency: data.agency || player.agency || null,
    agencyUrl: data.agencyUrl || player.agencyUrl || null,
  };

  // Strip any remaining undefined values — Firestore Admin SDK rejects them
  for (const key of Object.keys(updated)) {
    if (updated[key] === undefined) {
      delete updated[key];
    }
  }

  await docRef.set(updated);
}

async function runPlayerRefresh() {
  // Jitter: wait 0-60s before starting so TM doesn't see a pattern
  const jitter = Math.floor(Math.random() * START_JITTER_MAX_MS);
  log(`Waiting ${(jitter / 1000).toFixed(0)}s jitter before starting...`);
  await sleep(jitter);

  const startTime = Date.now();
  log("=== PlayerRefreshWorker started ===");

  const playersRef = db.collection(PLAYERS_TABLE);
  const feedRef = db.collection(FEED_EVENTS_TABLE);

  try {
    const snapshot = await playersRef.get();
    log(`Fetched ${snapshot.size} players from Firestore`);

    const toMs = (v) =>
      typeof v === "number" ? v : (v?.toMillis?.() || 0);

    const playersWithDocs = snapshot.docs
      .map((doc) => {
        const player = doc.data();
        if (!player.tmProfile?.trim()) return null;
        return { player, docRef: doc.ref };
      })
      .filter(Boolean)
      .sort((a, b) => toMs(a.player.lastRefreshedAt) - toMs(b.player.lastRefreshedAt));

    if (playersWithDocs.length === 0) {
      log("No players with TM profiles — nothing to refresh");
      await recordSuccess("No players to refresh", Date.now() - startTime);
      return;
    }

    const recentThreshold = Date.now() - RECENT_REFRESH_THRESHOLD_MS;
    const stale = playersWithDocs.filter(
      ({ player }) => toMs(player.lastRefreshedAt) < recentThreshold
    );

    const totalPlayers = playersWithDocs.length;
    const skipped = totalPlayers - stale.length;
    log(
      `Starting refresh: ${totalPlayers} total, ${skipped} recently refreshed (skipped), ${stale.length} to update`
    );

    if (stale.length === 0) {
      log("All players already refreshed within the last 20h — nothing to do");
      await markRefreshSuccess();
      await recordSuccess(
        `All ${totalPlayers} players fresh, nothing to do`,
        Date.now() - startTime
      );
      return;
    }

    // Cap this run to MAX_PER_RUN players. Stalest are first in the array.
    const batch = stale.slice(0, MAX_PER_RUN);
    log(
      `Batch: processing ${batch.length} of ${stale.length} stale players (cap ${MAX_PER_RUN})`
    );

    let successCount = 0;
    let failCount = 0;
    let consecutiveBlocks = 0;
    const total = batch.length;

    for (let index = 0; index < batch.length; index++) {
      const { player, docRef } = batch[index];
      const tmProfile = player.tmProfile;
      if (!tmProfile) continue;

      let retries = 0;
      let succeeded = false;

      while (retries <= MAX_RETRIES && !succeeded) {
        const result = await updatePlayerByTmProfile(tmProfile);

        if (result.success && result.data) {
          try {
            await processSuccessfulUpdate(
              player,
              result.data,
              docRef,
              feedRef,
              tmProfile
            );
            successCount++;
            consecutiveBlocks = 0;
            log(`Updated ${index + 1}/${total}: ${player.fullName}`);
            succeeded = true;
          } catch (saveErr) {
            failCount++;
            log(`Save failed ${index + 1}/${total}: ${player.fullName} — ${saveErr.message}`);
            break;
          }
        } else {
          const cause = result.error || "Unknown error";
          if (isRateLimited(cause)) {
            consecutiveBlocks++;
            retries++;
            if (retries > MAX_RETRIES) break;

            const multiplier = Math.min(1 << (consecutiveBlocks - 1), 4);
            const backoff = Math.min(
              BLOCK_BACKOFF_MIN_MS * multiplier,
              MAX_BLOCK_BACKOFF_MS
            );
            log(
              `BLOCKED ${index + 1}/${total}: ${player.fullName} (retry ${retries}/${MAX_RETRIES}) — backing off ${backoff / 1000}s`
            );
            await sleep(backoff);
          } else {
            failCount++;
            log(`Failed ${index + 1}/${total}: ${player.fullName} — ${cause}`);
            break;
          }
        }
      }

      if (!succeeded && retries > MAX_RETRIES) {
        failCount++;
        log(`Giving up on ${index + 1}/${total}: ${player.fullName}`);
      }

      // Randomized delay: 8-14s base, with occasional longer pauses to look human
      let baseDelay =
        SINGLE_NET_DELAY_MIN_MS +
        Math.floor(Math.random() * SINGLE_NET_DELAY_VARIANCE_MS);
      // Every 20-40 players, take a longer break (30-60s) to avoid pattern detection
      if ((index + 1) % (20 + Math.floor(Math.random() * 20)) === 0) {
        baseDelay += 30000 + Math.floor(Math.random() * 30000);
        log(`Anti-pattern pause: ${(baseDelay / 1000).toFixed(0)}s`);
      }
      await sleep(baseDelay);

      if ((index + 1) % 50 === 0) {
        log(`Progress: ${index + 1}/${total} — ${successCount} ok, ${failCount} failed`);
      }
    }

    await markRefreshSuccess();
    const durationMs = Date.now() - startTime;
    const remaining = stale.length - batch.length;
    const summary = `${successCount} succeeded, ${failCount} failed out of ${batch.length} batch (${skipped} fresh, ${remaining} queued for next run)`;
    await recordSuccess(summary, durationMs);

    log(`Batch complete — ${summary} in ${durationMs}ms`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await recordFailure(err, durationMs);
    log(`FATAL: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
}

// runPlayerRefresh is called conditionally at the top of the file
