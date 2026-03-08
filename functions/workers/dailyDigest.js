/**
 * Daily Digest Email Worker
 *
 * Sends a nightly summary email at ~20:00 Israel time with:
 *  1. Agent performance breakdown (per-agent grades, approval rates, freshness)
 *  2. System improvements / suggestions
 *  3. Top 5 profile picks of the day with TM links & explanations
 *
 * Uses Nodemailer + Gmail App Password (set via Firebase env config).
 *   firebase functions:secrets:set GMAIL_APP_PASSWORD
 *   firebase functions:secrets:set GMAIL_USER
 */

const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");
const { recordSuccess, recordFailure } = require("../lib/workerRuns");

const RECIPIENT = "dahanliordahan@gmail.com";
const WORKER_NAME = "DailyDigestEmail";

// ─── Firestore queries ──────────────────────────────────────────────

async function getTodaysRuns(db) {
  const cutoff = Date.now() - 26 * 60 * 60 * 1000; // ~26h to catch any timezone drift
  const snap = await db
    .collection("ScoutAgentRuns")
    .where("runAt", ">=", cutoff)
    .orderBy("runAt", "desc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getTodaysProfiles(db) {
  const cutoff = Date.now() - 26 * 60 * 60 * 1000;
  const snap = await db
    .collection("ScoutProfiles")
    .where("lastRefreshedAt", ">=", cutoff)
    .orderBy("lastRefreshedAt", "desc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getWorkerHealth(db) {
  const snap = await db.collection("WorkerRuns").get();
  const workers = {};
  for (const doc of snap.docs) {
    workers[doc.id] = doc.data();
  }
  return workers;
}

// ─── Aggregation logic ──────────────────────────────────────────────

function aggregateRuns(runs) {
  if (!runs.length) return null;

  let totalProfiles = 0;
  let totalRejected = 0;
  let totalDuration = 0;
  let successCount = 0;
  let failCount = 0;
  const allAgentReports = {};

  for (const run of runs) {
    if (run.status === "success") successCount++;
    else failCount++;
    totalProfiles += run.profilesFound || 0;
    totalRejected += run.profilesRejected || 0;
    totalDuration += run.durationMs || 0;

    // Merge agent reports from Sport Director
    const reports = run.sportDirector?.agentReports || run.agentReports || {};
    for (const [agentId, report] of Object.entries(reports)) {
      if (!allAgentReports[agentId]) {
        allAgentReports[agentId] = {
          totalProfiles: 0,
          approved: 0,
          rejected: 0,
          grades: [],
          freshnessGrades: [],
          rejectionReasons: [],
        };
      }
      const a = allAgentReports[agentId];
      a.totalProfiles += report.total || 0;
      a.approved += report.approved || 0;
      a.rejected += report.rejected || 0;
      if (report.overallGrade) a.grades.push(report.overallGrade);
      if (report.freshnessGrade) a.freshnessGrades.push(report.freshnessGrade);
      if (report.topRejectionReasons) {
        a.rejectionReasons.push(...report.topRejectionReasons);
      }
    }
  }

  return {
    runsToday: runs.length,
    successCount,
    failCount,
    totalProfiles,
    totalRejected,
    totalApproved: totalProfiles - totalRejected,
    avgDuration: Math.round(totalDuration / runs.length / 1000),
    agentReports: allAgentReports,
  };
}

function pickTop5(profiles) {
  // Sort by matchScore desc, then by director fit score
  const sorted = [...profiles]
    .filter((p) => p.directorVerdict === "approved" || !p.directorVerdict)
    .sort((a, b) => {
      const scoreA = a.matchScore || 0;
      const scoreB = b.matchScore || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.directorFitScore || 0) - (a.directorFitScore || 0);
    });
  return sorted.slice(0, 5);
}

function generateSuggestions(summary, profiles) {
  const suggestions = [];

  if (!summary) {
    suggestions.push("⚠️ No scout runs completed today — check if the scheduler is firing correctly.");
    return suggestions;
  }

  if (summary.failCount > 0) {
    suggestions.push(
      `🔴 ${summary.failCount} run(s) failed today. Check Cloud Functions logs for errors.`
    );
  }

  const approvalRate =
    summary.totalProfiles > 0
      ? Math.round((summary.totalApproved / summary.totalProfiles) * 100)
      : 0;

  if (approvalRate < 30) {
    suggestions.push(
      `📉 Overall approval rate is only ${approvalRate}%. Consider loosening agent parameters or reviewing rejection criteria.`
    );
  } else if (approvalRate > 85) {
    suggestions.push(
      `📈 Approval rate is ${approvalRate}% — agents might be too conservative. Consider pushing them to explore more diverse profiles.`
    );
  }

  // Per-agent suggestions
  for (const [agentId, report] of Object.entries(summary.agentReports)) {
    const rate =
      report.totalProfiles > 0
        ? Math.round((report.approved / report.totalProfiles) * 100)
        : 0;
    if (report.totalProfiles === 0) {
      suggestions.push(`⚠️ Agent "${agentId}" produced 0 profiles today.`);
    } else if (rate < 20) {
      const topReasons = [...new Set(report.rejectionReasons)].slice(0, 3).join(", ");
      suggestions.push(
        `🔻 Agent "${agentId}": ${rate}% approval (${report.approved}/${report.totalProfiles}). ` +
          `Top issues: ${topReasons || "unknown"}. Consider tuning parameters.`
      );
    }
  }

  if (profiles.length === 0) {
    suggestions.push(
      "📭 No new profiles discovered today. Consider adding new leagues or profile types."
    );
  }

  if (suggestions.length === 0) {
    suggestions.push("✅ Everything looks healthy. Keep refining agent skills and monitoring freshness.");
  }

  return suggestions;
}

// ─── Email formatting ───────────────────────────────────────────────

function formatDate() {
  return new Date().toLocaleDateString("en-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Jerusalem",
  });
}

function buildEmailHtml(summary, top5, suggestions, workerHealth, allProfiles) {
  const date = formatDate();

  // Agent performance table
  let agentRows = "";
  if (summary?.agentReports) {
    for (const [agentId, r] of Object.entries(summary.agentReports)) {
      const rate =
        r.totalProfiles > 0 ? Math.round((r.approved / r.totalProfiles) * 100) : 0;
      const grade = r.grades.length > 0 ? r.grades[r.grades.length - 1] : "—";
      const freshness =
        r.freshnessGrades.length > 0 ? r.freshnessGrades[r.freshnessGrades.length - 1] : "—";
      const topReasons = [...new Set(r.rejectionReasons)].slice(0, 3).join(", ") || "—";
      agentRows += `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #333;color:#e0e0e0;">${agentId}</td>
          <td style="padding:8px;border-bottom:1px solid #333;text-align:center;">
            <span style="font-size:18px;font-weight:bold;color:${gradeColor(grade)}">${grade}</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #333;text-align:center;color:#e0e0e0;">${r.approved}/${r.totalProfiles} (${rate}%)</td>
          <td style="padding:8px;border-bottom:1px solid #333;text-align:center;">
            <span style="color:${gradeColor(freshness)}">${freshness}</span>
          </td>
          <td style="padding:8px;border-bottom:1px solid #333;color:#999;font-size:12px;">${topReasons}</td>
        </tr>`;
    }
  }

  // Top 5 profiles
  let profileCards = "";
  for (let i = 0; i < top5.length; i++) {
    const p = top5[i];
    const tmUrl = p.tmProfileUrl || "#";
    const marketValue = p.marketValueEuro
      ? `€${(p.marketValueEuro / 1_000_000).toFixed(1)}M`
      : "Unknown";
    const narrative =
      p.scoutNarrative ||
      p.matchReason ||
      `${p.profileType} profile — Score: ${p.matchScore || "N/A"}`;
    const intelBits = [];
    if (p.intelWage) intelBits.push(`Wage: ${p.intelWage}`);
    if (p.intelHonours) intelBits.push(`${p.intelHonours} honours`);
    if (p.intelFoot) intelBits.push(`${p.intelFoot} foot`);
    if (p.intelCareer) intelBits.push(`Career: ${p.intelCareer}`);
    const intelLine = intelBits.length > 0 ? intelBits.join(" · ") : "";

    profileCards += `
      <div style="background:#1a1a2e;border:1px solid #333;border-radius:8px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="color:#ffd700;font-size:20px;font-weight:bold;">#${i + 1}</span>
            <span style="color:#ffffff;font-size:18px;font-weight:bold;margin-left:8px;">${escapeHtml(p.playerName || "Unknown")}</span>
          </div>
          <span style="background:#ffd700;color:#000;padding:4px 10px;border-radius:12px;font-weight:bold;font-size:14px;">
            Score: ${p.matchScore || "—"}
          </span>
        </div>
        <div style="margin-top:8px;color:#aaa;font-size:14px;">
          ${escapeHtml(p.position || "")} · ${escapeHtml(p.club || "")} · Age ${p.age || "?"} · ${marketValue}
          ${p.league ? ` · ${escapeHtml(p.league)}` : ""}
        </div>
        ${p.profileType ? `<div style="margin-top:4px;"><span style="background:#2d2d4a;color:#90caf9;padding:2px 8px;border-radius:4px;font-size:12px;">${escapeHtml(p.profileType)}</span></div>` : ""}
        <div style="margin-top:10px;color:#ddd;font-size:14px;line-height:1.5;">
          ${escapeHtml(typeof narrative === "string" ? narrative : JSON.stringify(narrative))}
        </div>
        ${intelLine ? `<div style="margin-top:6px;color:#888;font-size:12px;">${escapeHtml(intelLine)}</div>` : ""}
        <div style="margin-top:10px;">
          <a href="${escapeHtml(tmUrl)}" style="background:#1db954;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:bold;">
            View on Transfermarkt →
          </a>
        </div>
      </div>`;
  }

  // Suggestions
  let suggestionsHtml = suggestions
    .map((s) => `<li style="margin-bottom:6px;color:#ddd;">${escapeHtml(s)}</li>`)
    .join("\n");

  // Profile type breakdown
  const typeCount = {};
  for (const p of allProfiles) {
    const t = p.profileType || "unknown";
    typeCount[t] = (typeCount[t] || 0) + 1;
  }
  let typeRows = "";
  for (const [type, count] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) {
    typeRows += `<span style="background:#2d2d4a;color:#90caf9;padding:3px 10px;border-radius:4px;font-size:12px;margin:2px 4px;display:inline-block;">${escapeHtml(type)}: ${count}</span>`;
  }

  // Worker health
  let workerRows = "";
  for (const [name, data] of Object.entries(workerHealth)) {
    const statusIcon = data.status === "success" ? "🟢" : "🔴";
    const ago = data.lastRunAt
      ? `${Math.round((Date.now() - data.lastRunAt) / 3600000)}h ago`
      : "never";
    workerRows += `
      <tr>
        <td style="padding:4px 8px;color:#e0e0e0;font-size:13px;">${statusIcon} ${escapeHtml(name)}</td>
        <td style="padding:4px 8px;color:#999;font-size:13px;">${ago}</td>
        <td style="padding:4px 8px;color:#999;font-size:12px;">${escapeHtml((data.summary || "").slice(0, 60))}</td>
      </tr>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="text-align:center;padding:20px 0;border-bottom:2px solid #ffd700;">
      <div style="font-size:28px;font-weight:bold;color:#ffd700;">⚽ MGSR Daily Digest</div>
      <div style="color:#999;font-size:14px;margin-top:4px;">${date}</div>
    </div>

    <!-- Overview -->
    <div style="margin-top:20px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;">
      <div style="font-size:16px;font-weight:bold;color:#ffd700;margin-bottom:10px;">📊 Today's Overview</div>
      ${summary ? `
        <div style="display:flex;flex-wrap:wrap;gap:12px;">
          <div style="flex:1;min-width:100px;text-align:center;padding:8px;background:#111;border-radius:6px;">
            <div style="font-size:24px;font-weight:bold;color:#4caf50;">${summary.totalApproved}</div>
            <div style="color:#888;font-size:12px;">Approved</div>
          </div>
          <div style="flex:1;min-width:100px;text-align:center;padding:8px;background:#111;border-radius:6px;">
            <div style="font-size:24px;font-weight:bold;color:#f44336;">${summary.totalRejected}</div>
            <div style="color:#888;font-size:12px;">Rejected</div>
          </div>
          <div style="flex:1;min-width:100px;text-align:center;padding:8px;background:#111;border-radius:6px;">
            <div style="font-size:24px;font-weight:bold;color:#2196f3;">${summary.runsToday}</div>
            <div style="color:#888;font-size:12px;">Runs</div>
          </div>
          <div style="flex:1;min-width:100px;text-align:center;padding:8px;background:#111;border-radius:6px;">
            <div style="font-size:24px;font-weight:bold;color:#ff9800;">${summary.avgDuration}s</div>
            <div style="color:#888;font-size:12px;">Avg Duration</div>
          </div>
        </div>
        ${typeRows ? `<div style="margin-top:10px;">${typeRows}</div>` : ""}
      ` : `<div style="color:#f44336;">No scout runs detected in the last 24 hours.</div>`}
    </div>

    <!-- Agent Performance -->
    ${agentRows ? `
    <div style="margin-top:20px;">
      <div style="font-size:16px;font-weight:bold;color:#ffd700;margin-bottom:10px;">🤖 Agent Performance</div>
      <table style="width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:8px;overflow:hidden;border:1px solid #333;">
        <thead>
          <tr style="background:#111;">
            <th style="padding:8px;text-align:left;color:#999;font-size:12px;">Agent</th>
            <th style="padding:8px;text-align:center;color:#999;font-size:12px;">Grade</th>
            <th style="padding:8px;text-align:center;color:#999;font-size:12px;">Approved</th>
            <th style="padding:8px;text-align:center;color:#999;font-size:12px;">Fresh</th>
            <th style="padding:8px;text-align:left;color:#999;font-size:12px;">Issues</th>
          </tr>
        </thead>
        <tbody>${agentRows}</tbody>
      </table>
    </div>
    ` : ""}

    <!-- Top 5 Picks -->
    <div style="margin-top:20px;">
      <div style="font-size:16px;font-weight:bold;color:#ffd700;margin-bottom:10px;">🏆 Top 5 Picks of the Day</div>
      ${top5.length > 0 ? profileCards : '<div style="color:#888;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;">No profiles approved today — agents may need tuning.</div>'}
    </div>

    <!-- Suggestions -->
    <div style="margin-top:20px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;">
      <div style="font-size:16px;font-weight:bold;color:#ffd700;margin-bottom:10px;">💡 Suggestions & Insights</div>
      <ul style="margin:0;padding-left:20px;">
        ${suggestionsHtml}
      </ul>
    </div>

    <!-- Worker Health -->
    ${workerRows ? `
    <div style="margin-top:20px;padding:16px;background:#1a1a2e;border-radius:8px;border:1px solid #333;">
      <div style="font-size:16px;font-weight:bold;color:#ffd700;margin-bottom:10px;">🔧 System Health</div>
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${workerRows}</tbody>
      </table>
    </div>
    ` : ""}

    <!-- Footer -->
    <div style="margin-top:24px;text-align:center;color:#555;font-size:12px;border-top:1px solid #333;padding-top:12px;">
      MGSR Scout Platform · Automated Daily Digest<br/>
      Sent at ${new Date().toLocaleTimeString("en-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })} Israel Time
    </div>

  </div>
</body>
</html>`;
}

function gradeColor(grade) {
  const colors = { A: "#4caf50", B: "#8bc34a", C: "#ffeb3b", D: "#ff9800", F: "#f44336" };
  return colors[grade] || "#999";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Email sending ──────────────────────────────────────────────────

async function sendEmail(subject, html, gmailUser, gmailAppPassword) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });

  await transporter.sendMail({
    from: `"MGSR Scout Platform" <${gmailUser}>`,
    to: RECIPIENT,
    subject,
    html,
  });
}

// ─── Main entry point ───────────────────────────────────────────────

async function runDailyDigest(gmailUser, gmailAppPassword) {
  const start = Date.now();
  const db = getFirestore();

  console.log(`[${WORKER_NAME}] Starting daily digest...`);

  // Gather data
  const [runs, profiles, workerHealth] = await Promise.all([
    getTodaysRuns(db),
    getTodaysProfiles(db),
    getWorkerHealth(db),
  ]);

  console.log(`[${WORKER_NAME}] Data: ${runs.length} runs, ${profiles.length} profiles`);

  // Process
  const summary = aggregateRuns(runs);
  const top5 = pickTop5(profiles);
  const suggestions = generateSuggestions(summary, profiles);

  // Build & send
  const date = formatDate();
  const subject = `⚽ MGSR Daily Digest — ${date} — ${profiles.length} profiles, ${runs.length} runs`;
  const html = buildEmailHtml(summary, top5, suggestions, workerHealth, profiles);

  await sendEmail(subject, html, gmailUser, gmailAppPassword);

  const duration = Date.now() - start;
  console.log(`[${WORKER_NAME}] Email sent to ${RECIPIENT} in ${duration}ms`);

  await recordSuccess(db, WORKER_NAME, `Sent digest: ${profiles.length} profiles, ${runs.length} runs, top5: ${top5.map((p) => p.playerName).join(", ")}`, duration);

  return { profileCount: profiles.length, runCount: runs.length, top5: top5.map((p) => p.playerName) };
}

module.exports = { runDailyDigest };
