#!/usr/bin/env node
/**
 * One-time repair for release notification FeedEvents after bad refresh backfill.
 *
 * What it does (type=NEW_RELEASE_FROM_CLUB only):
 * 1) Deletes NOT_IN_DATABASE events with out-of-scope high market value (> €6M).
 * 2) Repairs timestamp when it is clearly inconsistent with transferDate
 *    (e.g. overwritten to "now" during enrichment backfill).
 *
 * Usage:
 *   node repairReleaseNotificationsData.js --dry-run
 *   node repairReleaseNotificationsData.js --apply
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const FEED_EVENTS_TABLE = "FeedEvents";
const TARGET_TYPE = "NEW_RELEASE_FROM_CLUB";
const MAX_ALLOWED_VALUE_EUR = 6_000_000;
const TS_DRIFT_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

function parseMarketValueToEur(value) {
  if (!value) return 0;
  const raw = String(value).trim().toLowerCase();
  if (!raw || raw === "-" || raw === "—") return 0;
  const cleaned = raw.replace(/€/g, "").replace(/\s/g, "").replace(/,/g, "");
  if (cleaned.endsWith("k")) return Math.round((parseFloat(cleaned.slice(0, -1)) || 0) * 1000);
  if (cleaned.endsWith("m")) return Math.round((parseFloat(cleaned.slice(0, -1)) || 0) * 1_000_000);
  return Math.round(parseFloat(cleaned) || 0);
}

function parseTransferDateToEpoch(value) {
  if (!value) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;

  // DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD
  const parts = raw.split(/[/.-]/);
  if (parts.length === 3) {
    const [p1, p2, p3] = parts;
    const n1 = Number.parseInt(p1, 10);
    const n2 = Number.parseInt(p2, 10);
    const n3 = Number.parseInt(p3, 10);
    if (!Number.isNaN(n1) && !Number.isNaN(n2) && !Number.isNaN(n3)) {
      if (p1.length === 4 && n1 > 1900) {
        return new Date(n1, n2 - 1, n3).getTime();
      }
      if (p3.length === 4 && n3 > 1900) {
        return new Date(n3, n2 - 1, n1).getTime();
      }
    }
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function shouldRepairTimestamp(currentTs, transferDateTs) {
  if (!currentTs || !transferDateTs) return false;
  return Math.abs(currentTs - transferDateTs) > TS_DRIFT_THRESHOLD_MS;
}

async function run() {
  console.log(`[repairReleaseNotificationsData] Mode: ${DRY_RUN ? "DRY-RUN" : "APPLY"}`);

  const snapshot = await db
    .collection(FEED_EVENTS_TABLE)
    .where("type", "==", TARGET_TYPE)
    .get();

  console.log(`[repairReleaseNotificationsData] Loaded ${snapshot.size} ${TARGET_TYPE} events`);

  let toDelete = 0;
  let toTimestampFix = 0;
  let inspected = 0;

  let batch = db.batch();
  let batchOps = 0;
  let committedBatches = 0;

  for (const doc of snapshot.docs) {
    inspected++;
    const d = doc.data() || {};
    const extraInfo = d.extraInfo ? String(d.extraInfo) : "";
    const marketValueEur = parseMarketValueToEur(d.marketValue);
    const transferDateTs = parseTransferDateToEpoch(d.transferDate);
    const currentTs = typeof d.timestamp === "number" ? d.timestamp : 0;

    const isOutOfScope =
      extraInfo === "NOT_IN_DATABASE" && marketValueEur > MAX_ALLOWED_VALUE_EUR;

    if (isOutOfScope) {
      toDelete++;
      if (APPLY) {
        batch.delete(doc.ref);
        batchOps++;
      }
      continue;
    }

    if (shouldRepairTimestamp(currentTs, transferDateTs)) {
      toTimestampFix++;
      if (APPLY) {
        batch.update(doc.ref, { timestamp: transferDateTs });
        batchOps++;
      }
    }

    if (APPLY && batchOps >= 450) {
      await batch.commit();
      committedBatches++;
      batch = db.batch();
      batchOps = 0;
      console.log(`[repairReleaseNotificationsData] Committed batch #${committedBatches}`);
    }
  }

  if (APPLY && batchOps > 0) {
    await batch.commit();
    committedBatches++;
  }

  console.log(`[repairReleaseNotificationsData] Inspected: ${inspected}`);
  console.log(`[repairReleaseNotificationsData] Delete out-of-scope events: ${toDelete}`);
  console.log(`[repairReleaseNotificationsData] Repair timestamps: ${toTimestampFix}`);
  if (APPLY) {
    console.log(`[repairReleaseNotificationsData] Applied in ${committedBatches} batch commit(s)`);
  } else {
    console.log(`[repairReleaseNotificationsData] Dry-run complete. Re-run with --apply to execute.`);
  }
}

run().catch((err) => {
  console.error("[repairReleaseNotificationsData] FAILED", err);
  process.exit(1);
});
