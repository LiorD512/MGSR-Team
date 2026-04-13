/**
 * System Health Check — Daily email report.
 *
 * Runs daily at 08:00 Israel time. Reads WorkerRuns collection and
 * summarises the status of every automated function in a single email.
 *
 * Covers:
 *  - Cloud Functions: mandateExpiry, releasesRefresh, scoutAgent, taskReminders, dailyDigest
 *  - Cloud Run Jobs: player-refresh-job
 *  - GitHub Actions: transfer-windows, contract-finishers, returnees, scout-images, releases-refresh
 *
 * Uses Nodemailer + Gmail App Password (same secrets as dailyDigest).
 */

const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");
const { recordSuccess, recordFailure } = require("../lib/workerRuns");

const RECIPIENT = "dahanliordahan@gmail.com";
const WORKER_NAME = "SystemHealthCheck";

// All workers we monitor (workerName in WorkerRuns collection)
const MONITORED_WORKERS = [
  { name: "MandateExpiryWorker", label: "Mandate Expiry", schedule: "Daily 04:00", maxAge: 26 },
  { name: "ReleasesRefreshWorker", label: "Releases Refresh", schedule: "Daily 03:00 (GH Actions)", maxAge: 26 },
  { name: "ScoutAgentWorker", label: "AI Scout Agent", schedule: "Every 3 days", maxAge: 80 },
  { name: "PlayerRefreshWorker", label: "Player Refresh", schedule: "Hourly", maxAge: 3 },
  { name: "DailyDigestEmail", label: "Daily Digest Email", schedule: "Daily 20:00", maxAge: 26 },
  { name: "TaskReminders", label: "Task Reminders", schedule: "Daily 09:00", maxAge: 26 },
];

function hoursAgo(ts) {
  if (!ts) return Infinity;
  return (Date.now() - ts) / (60 * 60 * 1000);
}

function formatDuration(ms) {
  if (!ms) return "-";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function formatAgo(ts) {
  if (!ts) return "never";
  const h = hoursAgo(ts);
  if (h < 1) return `${Math.round(h * 60)}min ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getWorkerRuns(db) {
  const snap = await db.collection("WorkerRuns").get();
  const result = {};
  for (const doc of snap.docs) {
    result[doc.id] = doc.data();
  }
  return result;
}

async function getScoutAgentLastRun(db) {
  const snap = await db
    .collection("ScoutAgentRuns")
    .orderBy("runAt", "desc")
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].data();
}

async function getWorkerLock(db) {
  const doc = await db.collection("WorkerLocks").doc("ScoutAgentWorker").get();
  return doc.exists ? doc.data() : null;
}

function buildHealthEmail(workers, scoutRun, lockData, date) {
  let allHealthy = true;
  let totalErrors = 0;

  let workerRows = "";
  for (const w of MONITORED_WORKERS) {
    const data = workers[w.name] || {};
    const isStale = hoursAgo(data.lastRunAt) > w.maxAge;
    const isFailed = data.status === "failed";
    const isOk = !isStale && !isFailed && data.lastRunAt;

    if (!isOk) {
      allHealthy = false;
      totalErrors++;
    }

    let statusIcon, statusColor;
    if (!data.lastRunAt) {
      statusIcon = "⚪"; statusColor = "#666";
    } else if (isFailed) {
      statusIcon = "🔴"; statusColor = "#f44336";
    } else if (isStale) {
      statusIcon = "🟡"; statusColor = "#ff9800";
    } else {
      statusIcon = "🟢"; statusColor = "#4caf50";
    }

    const errorInfo = isFailed && data.error
      ? `<div style="color:#f44336;font-size:11px;margin-top:2px;">⚠ ${escapeHtml(data.error.slice(0, 120))}</div>`
      : "";

    workerRows += `
      <tr>
        <td style="padding:6px 10px;color:#e0e0e0;font-size:13px;border-bottom:1px solid #222;">
          ${statusIcon} <strong>${escapeHtml(w.label)}</strong>
          ${errorInfo}
        </td>
        <td style="padding:6px 10px;color:${statusColor};font-size:13px;border-bottom:1px solid #222;">
          ${data.status === "success" ? "OK" : data.status === "failed" ? "FAILED" : "—"}
        </td>
        <td style="padding:6px 10px;color:#999;font-size:12px;border-bottom:1px solid #222;">
          ${formatAgo(data.lastRunAt)}
        </td>
        <td style="padding:6px 10px;color:#999;font-size:12px;border-bottom:1px solid #222;">
          ${formatDuration(data.durationMs)}
        </td>
        <td style="padding:6px 10px;color:#777;font-size:11px;border-bottom:1px solid #222;">
          ${escapeHtml((data.summary || "").slice(0, 80))}
        </td>
      </tr>`;
  }

  // Scout Agent extra details
  let scoutSection = "";
  if (scoutRun) {
    const approved = scoutRun.profilesFound || 0;
    const rejected = scoutRun.profilesRejected || 0;
    const duration = formatDuration(scoutRun.durationMs);
    const status = scoutRun.status || "unknown";
    scoutSection = `
    <div style="margin-top:16px;padding:12px;background:#1a1a2e;border-radius:8px;border:1px solid #333;">
      <div style="font-size:14px;font-weight:bold;color:#90caf9;margin-bottom:8px;">🤖 Last Scout Agent Run</div>
      <div style="color:#ccc;font-size:13px;">
        Status: <strong style="color:${status === "success" ? "#4caf50" : "#f44336"}">${status.toUpperCase()}</strong> |
        Approved: <strong>${approved}</strong> |
        Rejected: <strong>${rejected}</strong> |
        Duration: <strong>${duration}</strong>
        ${scoutRun.error ? `<br><span style="color:#f44336;">Error: ${escapeHtml(scoutRun.error.slice(0, 200))}</span>` : ""}
      </div>
    </div>`;
  }

  // Lock status
  let lockSection = "";
  if (lockData && lockData.lockedAt) {
    const lockAge = hoursAgo(lockData.lockedAt);
    if (lockAge < 1) {
      lockSection = `
      <div style="margin-top:8px;padding:8px 12px;background:#332200;border-radius:6px;border:1px solid #664400;color:#ffcc00;font-size:12px;">
        ⚠ Scout Agent lock is currently held (acquired ${Math.round(lockAge * 60)}min ago) — run in progress or stale lock
      </div>`;
    }
  }

  const headerColor = allHealthy ? "#4caf50" : "#f44336";
  const headerText = allHealthy ? "✅ All Systems Healthy" : `⚠️ ${totalErrors} Issue${totalErrors > 1 ? "s" : ""} Detected`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:700px;margin:0 auto;padding:20px;">

    <div style="text-align:center;padding:16px 0;border-bottom:2px solid ${headerColor};">
      <div style="font-size:24px;font-weight:bold;color:${headerColor};">${headerText}</div>
      <div style="color:#999;font-size:14px;margin-top:4px;">MGSR System Health — ${date}</div>
    </div>

    <div style="margin-top:16px;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #333;">
            <th style="padding:6px 10px;text-align:left;color:#ffd700;font-size:12px;text-transform:uppercase;">Worker</th>
            <th style="padding:6px 10px;text-align:left;color:#ffd700;font-size:12px;text-transform:uppercase;">Status</th>
            <th style="padding:6px 10px;text-align:left;color:#ffd700;font-size:12px;text-transform:uppercase;">Last Run</th>
            <th style="padding:6px 10px;text-align:left;color:#ffd700;font-size:12px;text-transform:uppercase;">Duration</th>
            <th style="padding:6px 10px;text-align:left;color:#ffd700;font-size:12px;text-transform:uppercase;">Summary</th>
          </tr>
        </thead>
        <tbody>
          ${workerRows}
        </tbody>
      </table>
    </div>

    ${scoutSection}
    ${lockSection}

    <div style="margin-top:20px;padding:10px;text-align:center;color:#555;font-size:11px;border-top:1px solid #222;">
      MGSR Football Agent Platform — Automated System Health Check
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(subject, html, gmailUser, gmailAppPassword) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailAppPassword },
  });
  await transporter.sendMail({
    from: `"MGSR System Health" <${gmailUser}>`,
    to: RECIPIENT,
    subject,
    html,
  });
}

async function runSystemHealthCheck(gmailUser, gmailAppPassword) {
  const start = Date.now();
  const db = getFirestore();

  console.log(`[${WORKER_NAME}] Starting system health check...`);

  const [workers, scoutRun, lockData] = await Promise.all([
    getWorkerRuns(db),
    getScoutAgentLastRun(db),
    getWorkerLock(db),
  ]);

  // Count issues
  let issues = 0;
  for (const w of MONITORED_WORKERS) {
    const data = workers[w.name] || {};
    if (!data.lastRunAt || data.status === "failed" || hoursAgo(data.lastRunAt) > w.maxAge) {
      issues++;
    }
  }

  const date = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jerusalem",
  });

  const subject = issues === 0
    ? `✅ MGSR Health — All Systems OK — ${date}`
    : `⚠️ MGSR Health — ${issues} Issue${issues > 1 ? "s" : ""} — ${date}`;

  const html = buildHealthEmail(workers, scoutRun, lockData, date);
  await sendEmail(subject, html, gmailUser, gmailAppPassword);

  const duration = Date.now() - start;
  console.log(`[${WORKER_NAME}] Health check email sent in ${duration}ms — ${issues} issues`);

  await recordSuccess(db, WORKER_NAME, `${issues} issues, ${MONITORED_WORKERS.length} workers checked`, duration);

  return { issues, workersChecked: MONITORED_WORKERS.length };
}

module.exports = { runSystemHealthCheck };
