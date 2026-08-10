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
const crypto = require("crypto");

const JOB_MODE = process.env.JOB_MODE || "player-refresh";
const RUN_ID = crypto.randomUUID();

initializeApp();
const db = getFirestore();

if (JOB_MODE === "releases-refresh") {
  const { runReleasesRefresh } = require("./releasesRefresh");
  runReleasesRefresh(db);
}
// player-refresh is dispatched at the bottom of the file after all const declarations

// ── Player Refresh ──────────────────────────────────────────────────

const { updatePlayerByTmProfile } = require("./lib/playersUpdate");
const { feedEventDocId, isNoMarketValue } = require("./lib/utils");

const PLAYERS_TABLE = "Players";
const FEED_EVENTS_TABLE = "FeedEvents";
const WORKER_STATE_COLLECTION = "WorkerState";
const WORKER_RUNS_COLLECTION = "WorkerRuns";
const PLAYER_REFRESH_WORKER_DOC = "PlayerRefreshWorker";

const RECENT_REFRESH_THRESHOLD_MS = 20 * 60 * 60 * 1000;
const MAX_HISTORY_ENTRIES = 24;
const ACTIVE_RUN_LEASE_MS = Number(process.env.PLAYER_REFRESH_ACTIVE_LEASE_MS || 2 * 60 * 60 * 1000);

// ── Hourly micro-batch settings ──────────────────────────────────────
// Each hourly run processes at most MAX_PER_RUN players (stalest first).
// At ~10s/player, 200 players ≈ 33 min — well within the 2h job timeout.
// 200 × 24 runs/day = 4,800 players/day capacity.
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 200);

// ── TM anti-detection delays ────────────────────────────────────────
// Vary delays to avoid a detectable pattern. The proxy handles actual
// TM rate limits, so we can use shorter intervals than before (was 12-18s).
const SINGLE_NET_DELAY_MIN_MS = Number(process.env.SINGLE_NET_DELAY_MIN_MS || 8000);
const SINGLE_NET_DELAY_VARIANCE_MS = Number(process.env.SINGLE_NET_DELAY_VARIANCE_MS || 6000);
const BLOCK_BACKOFF_MIN_MS = 90000;
const MAX_BLOCK_BACKOFF_MS = 300000;
const MAX_RETRIES = 3;
// Jitter at start so we don't always hit TM at :00 sharp every hour
const START_JITTER_MAX_MS = Number(process.env.START_JITTER_MAX_MS || 60000);
const DISABLE_ANTI_PATTERN_PAUSE = process.env.DISABLE_ANTI_PATTERN_PAUSE === "1";

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

function toMs(v) {
  return typeof v === "number" ? v : (v?.toMillis?.() || 0);
}

function buildPlayerRefreshSummary(snapshot) {
  const recentThreshold = Date.now() - RECENT_REFRESH_THRESHOLD_MS;

  const playersWithDocs = snapshot.docs
    .map((doc) => {
      const player = doc.data();
      if (!player.tmProfile?.trim()) return null;
      if (shouldSkipUnfetchablePlayer(player)) return null;
      return { player, docRef: doc.ref };
    })
    .filter(Boolean)
    .sort((a, b) => toMs(a.player.lastRefreshedAt) - toMs(b.player.lastRefreshedAt));

  const stale = playersWithDocs.filter(
    ({ player }) => toMs(player.lastRefreshedAt) < recentThreshold
  );

  return {
    playersWithDocs,
    stale,
    totalPlayers: playersWithDocs.length,
    skipped: playersWithDocs.length - stale.length,
  };
}

function formatLeaseAge(ms) {
  return `${Math.max(1, Math.round(ms / 60000))}m`;
}

async function acquirePlayerRefreshLease() {
  const docRef = db.collection(WORKER_STATE_COLLECTION).doc(PLAYER_REFRESH_WORKER_DOC);
  const now = Date.now();
  const leaseExpiresAt = now + ACTIVE_RUN_LEASE_MS;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data() || {};
    const activeRunId = data.activeRunId || null;
    const activeLeaseExpiresAt = Number(data.activeLeaseExpiresAt || 0);

    if (activeRunId && activeLeaseExpiresAt > now) {
      return {
        acquired: false,
        activeRunId,
        activeLeaseExpiresAt,
      };
    }

    tx.set(
      docRef,
      {
        activeRunId: RUN_ID,
        activeRunStartedAt: now,
        activeLeaseExpiresAt: leaseExpiresAt,
        updatedAt: now,
      },
      { merge: true }
    );

    return {
      acquired: true,
      leaseExpiresAt,
    };
  });
}

async function releasePlayerRefreshLease() {
  const docRef = db.collection(WORKER_STATE_COLLECTION).doc(PLAYER_REFRESH_WORKER_DOC);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data() || {};
    if (data.activeRunId !== RUN_ID) return;

    tx.set(
      docRef,
      {
        activeRunId: null,
        activeRunStartedAt: null,
        activeLeaseExpiresAt: null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  });
}

async function printPlayerRefreshStatus() {
  const snapshot = await db.collection(PLAYERS_TABLE).get();
  const { totalPlayers, stale } = buildPlayerRefreshSummary(snapshot);
  const unfetchable = snapshot.docs.reduce((count, doc) => count + (doc.data()?.tmProfileUnfetchable ? 1 : 0), 0);
  console.log(`[player-refresh-status] total=${totalPlayers} stale=${stale.length} unfetchable=${unfetchable}`);
  if (stale.length <= 0) {
    process.exit(10);
  }
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

function isRetryableTmFailure(errMsg) {
  const lower = String(errMsg || "").toLowerCase();
  return (
    isRateLimited(lower) ||
    lower.includes("http 500") ||
    lower.includes("http 502") ||
    lower.includes("http 504") ||
    lower.includes("http 522") ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("socket hang up") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("no data-header")
  );
}

function isPermanentProfileFailure(errMsg) {
  const lower = String(errMsg || "").toLowerCase();
  return (
    lower.includes("http 404") ||
    lower.includes("http 410") ||
    lower.includes("profile url is null or blank")
  );
}

function shouldSkipUnfetchablePlayer(player) {
  if (!player?.tmProfileUnfetchable) return false;

  const failCount = Number(player.refreshFailCount || 0);
  const lastError = String(player.lastRefreshError || "");

  // Only hard-skip records that reached the permanent-failure threshold.
  // Historical transient errors (for example no-data-header rendering issues)
  // must stay retryable so the worker can self-heal poisoned records.
  return failCount >= 5 && isPermanentProfileFailure(lastError);
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

async function tryRecordSuccess(summary, durationMs) {
  try {
    await recordSuccess(summary, durationMs);
  } catch (err) {
    log(`[WorkerRuns] FAILED TO WRITE SUCCESS DOC — ${err?.message || err}`);
  }
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

async function tryRecordFailure(error, durationMs) {
  try {
    await recordFailure(error, durationMs);
  } catch (err) {
    log(`[WorkerRuns] FAILED TO WRITE FAILURE DOC — ${err?.message || err}`);
    log(`[WorkerRuns] ORIGINAL FAILURE — ${error?.message || error}`);
  }
}

async function markRefreshSuccess() {
  const docRef = db.collection(WORKER_STATE_COLLECTION).doc(PLAYER_REFRESH_WORKER_DOC);
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
  // If the parser returned a blank market value despite the sentinel passing,
  // keep the existing value rather than silently coercing to "€0". A genuine
  // "no value" profile renders the MV box with "-" or "€0" inside.
  const newValue = newValueRaw?.trim() ? newValueRaw.trim() : currentValue;

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

  const club = data.currentClub?.clubName
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
    positions: data.positions?.length ? data.positions : player.positions,
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
  const startTime = Date.now();

  try {
    const lease = await acquirePlayerRefreshLease();
    if (!lease.acquired) {
      const remainingMs = Math.max(0, lease.activeLeaseExpiresAt - Date.now());
      const summary = `Skipped: execution ${lease.activeRunId} still holds lease for ~${formatLeaseAge(remainingMs)}`;
      log(summary);
      await tryRecordSuccess(summary, Date.now() - startTime);
      return;
    }

    // Jitter: wait 0-60s before starting so TM doesn't see a pattern
    const jitter = Math.floor(Math.random() * START_JITTER_MAX_MS);
    log(`Waiting ${(jitter / 1000).toFixed(0)}s jitter before starting...`);
    await sleep(jitter);

    log("=== PlayerRefreshWorker started ===");

    const playersRef = db.collection(PLAYERS_TABLE);
    const feedRef = db.collection(FEED_EVENTS_TABLE);
    const snapshot = await playersRef.get();
    log(`Fetched ${snapshot.size} players from Firestore`);

    const { playersWithDocs, stale, totalPlayers, skipped } = buildPlayerRefreshSummary(snapshot);

    if (playersWithDocs.length === 0) {
      log("No players with TM profiles — nothing to refresh");
      await recordSuccess("No players to refresh", Date.now() - startTime);
      return;
    }

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
            // Clear any previous failure state on success
            if (player.refreshFailCount || player.tmProfileUnfetchable) {
              try { await docRef.update({ refreshFailCount: 0, lastRefreshError: null, tmProfileUnfetchable: false }); } catch (_) {}
            }
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
          if (isRetryableTmFailure(cause)) {
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
            const updateData = { lastRefreshError: cause };
            // Only clearly permanent profile failures should move toward
            // unfetchable. Transient TM/proxy/network failures should stay retryable.
            if (isPermanentProfileFailure(cause)) {
              const consecutiveFailures = (player.refreshFailCount || 0) + 1;
              updateData.refreshFailCount = consecutiveFailures;
              if (consecutiveFailures >= 5) {
                updateData.tmProfileUnfetchable = true;
              }
              log(`Failed ${index + 1}/${total}: ${player.fullName} — ${cause} (fails: ${consecutiveFailures})`);
            } else {
              log(`Failed ${index + 1}/${total}: ${player.fullName} — ${cause} (transient/non-permanent)`);
            }
            try { await docRef.update(updateData); } catch (_) {}
            break;
          }
        }
      }

      if (!succeeded && retries > MAX_RETRIES) {
        failCount++;
        log(`Giving up on ${index + 1}/${total}: ${player.fullName}`);
      }

      // Randomized delay with optional local override.
      let baseDelay =
        SINGLE_NET_DELAY_MIN_MS +
        Math.floor(Math.random() * SINGLE_NET_DELAY_VARIANCE_MS);
      // Every 20-40 players, take a longer break (30-60s) to avoid pattern detection.
      if (!DISABLE_ANTI_PATTERN_PAUSE && (index + 1) % (20 + Math.floor(Math.random() * 20)) === 0) {
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
    await tryRecordSuccess(summary, durationMs);

    log(`Batch complete — ${summary} in ${durationMs}ms`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    await tryRecordFailure(err, durationMs);
    log(`FATAL: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await releasePlayerRefreshLease().catch((err) => {
      log(`Failed to release active run lease — ${err?.message || err}`);
    });
  }
}

if (JOB_MODE === "player-refresh-status") {
  printPlayerRefreshStatus().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// runPlayerRefresh is dispatched here — after all const declarations are initialized
if (JOB_MODE === "player-refresh") {
  runPlayerRefresh();
}
