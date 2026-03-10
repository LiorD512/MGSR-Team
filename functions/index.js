// Polyfill for undici (used by Firebase deps) when File is not in global scope (Node 18)
if (typeof globalThis.File === "undefined") {
  globalThis.File = class File {};
}

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { runMandateExpiry } = require("./workers/mandateExpiry");
const { runReleasesRefresh } = require("./workers/releasesRefresh");
const { runScoutAgent } = require("./workers/scoutAgent");
const { runScoutSkillLearning } = require("./workers/scoutSkillLearner");
const { runDailyDigest } = require("./workers/dailyDigest");

initializeApp();
const db = getFirestore();

/**
 * FCM topic that every Android device subscribes to (see MGSRTeamApplication / FcmTokenManager).
 * Must stay in sync with the Android constant FcmTokenManager.FCM_TOPIC.
 */
const FCM_TOPIC = "mgsr_all";

const ACCOUNTS_COLLECTION = "Accounts";
const AGENT_TASKS_COLLECTION = "AgentTasks";

/**
 * Only these FeedEvent types trigger a push notification.
 */
const NOTIFIABLE_TYPES = [
  "BECAME_FREE_AGENT",
  "CLUB_CHANGE",
  "MARKET_VALUE_CHANGE",
  "NEW_RELEASE_FROM_CLUB",
  "MANDATE_EXPIRED",
];

/**
 * Collects all FCM tokens for an account (legacy fcmToken + fcmTokens array).
 * Returns a deduped array of token strings.
 */
function getAllTokens(accountData) {
  const tokens = new Set();
  if (accountData.fcmToken) tokens.add(accountData.fcmToken);
  if (Array.isArray(accountData.fcmTokens)) {
    for (const entry of accountData.fcmTokens) {
      const t = typeof entry === "string" ? entry : entry?.token;
      if (t) tokens.add(t);
    }
  }
  return [...tokens];
}

/**
 * Send a notification to all tokens of an account. Cleans up invalid tokens.
 * @param {string} accountId Firestore Account doc ID
 * @param {object} accountData Account document data
 * @param {object} payload { notification, data, android, webpush }
 */
async function sendToAllTokens(accountId, accountData, payload) {
  const tokens = getAllTokens(accountData);
  if (tokens.length === 0) return;

  const messages = tokens.map((token) => ({
    token,
    notification: payload.notification,
    data: payload.data,
    android: payload.android,
    webpush: payload.webpush,
  }));

  const results = await getMessaging().sendEach(messages);
  // Clean up invalid tokens
  const invalidTokens = [];
  results.responses.forEach((resp, idx) => {
    if (resp.error && (
      resp.error.code === "messaging/registration-token-not-registered" ||
      resp.error.code === "messaging/invalid-registration-token"
    )) {
      invalidTokens.push(tokens[idx]);
    }
  });
  if (invalidTokens.length > 0) {
    try {
      const accountRef = db.collection(ACCOUNTS_COLLECTION).doc(accountId);
      const updates = {};
      // Clear legacy token if invalid
      if (invalidTokens.includes(accountData.fcmToken)) {
        updates.fcmToken = "";
      }
      // Remove from fcmTokens array
      if (Array.isArray(accountData.fcmTokens)) {
        const cleaned = accountData.fcmTokens.filter((entry) => {
          const t = typeof entry === "string" ? entry : entry?.token;
          return !invalidTokens.includes(t);
        });
        updates.fcmTokens = cleaned;
      }
      if (Object.keys(updates).length > 0) {
        await accountRef.update(updates);
        console.log(`Cleaned ${invalidTokens.length} invalid token(s) for account ${accountId}`);
      }
    } catch (e) {
      console.error(`Token cleanup failed for ${accountId}:`, e);
    }
  }
}

/**
 * Triggered every time a new document is created in the FeedEvents collection
 * (written by PlayerRefreshWorker on the admin device).
 *
 * Sends BOTH a `notification` payload (English fallback for reliable background
 * delivery on Xiaomi/Huawei/OPPO that block data-only messages) AND a `data`
 * payload (so the Android side can build localised text when in the foreground).
 */
exports.onNewFeedEvent = onDocumentCreated("FeedEvents/{eventId}", async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const type = data.type || "";
  if (!NOTIFIABLE_TYPES.includes(type)) return;

  const playerName = data.playerName || "Unknown";
  const oldValue = data.oldValue || "";
  const newValue = data.newValue || "";
  const extraInfo = data.extraInfo || "";

  let title;
  let body;

  switch (type) {
    case "MARKET_VALUE_CHANGE":
      title = "Market Value Change";
      body = `${playerName}: ${oldValue} → ${newValue}`;
      break;
    case "CLUB_CHANGE":
      title = "Club Transfer";
      body = `${playerName} moved from ${oldValue} to ${newValue}`;
      break;
    case "BECAME_FREE_AGENT":
      title = "Free Agent Alert";
      body = `${playerName} is now without a club (was at ${oldValue})`;
      break;
    case "NEW_RELEASE_FROM_CLUB":
      title = "New Free Agent";
      body =
        extraInfo === "NOT_IN_DATABASE"
          ? `${playerName} released from his club — maybe you want to approach him. Not in our database.`
          : `${playerName} released from his club — maybe you want to approach him.`;
      break;
    case "MANDATE_EXPIRED":
      title = "Mandate Expired";
      body = `${playerName}'s mandate has expired.`;
      break;
    default:
      title = "MGSR Team Update";
      body = `New update for ${playerName}`;
  }

  const message = {
    topic: FCM_TOPIC,
    notification: { title, body },
    data: {
      type,
      playerName,
      oldValue,
      newValue,
      extraInfo: extraInfo || "",
      playerTmProfile: data.playerTmProfile || "",
    },
    android: {
      priority: "high",
      notification: {
        channelId: "mgsr_team_notifications",
      },
    },
    webpush: {
      notification: {
        title,
        body,
        icon: "/logo.svg",
        tag: `feed-${event.params.eventId}`,
      },
      fcmOptions: {
        link: "/dashboard",
      },
    },
  };

  try {
    await getMessaging().send(message);
    console.log(`Push sent for ${type}: ${playerName}`);
  } catch (err) {
    console.error("FCM send error:", err);
  }
});

/**
 * Triggered when a new task is created in AgentTasks.
 * Sends a push notification to the assignee (agentId) only when the task was created
 * by another agent (createdByAgentId !== agentId).
 */
exports.onNewAgentTask = onDocumentCreated(
  `${AGENT_TASKS_COLLECTION}/{taskId}`,
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const agentId = data.agentId || "";
    const createdByAgentId = data.createdByAgentId || "";
    const createdByAgentName = data.createdByAgentName || "";
    const title = data.title || "New task";

    // Only notify when task is assigned to someone other than the creator (skip if creator unknown)
    if (!agentId || !createdByAgentId || agentId === createdByAgentId) return;

    let accountData;
    try {
      const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(agentId).get();
      if (!accountSnap.exists) {
        console.log(`Account not found for ${agentId}, skipping task notification`);
        return;
      }
      accountData = accountSnap.data();
    } catch (e) {
      console.error("Failed to fetch assignee account:", e);
      return;
    }

    const tokens = getAllTokens(accountData);
    if (tokens.length === 0) {
      console.log(`No FCM tokens for assignee ${agentId}, skipping task notification`);
      return;
    }

    const notifTitle = "New Task Assigned";
    const notifBody = createdByAgentName
      ? `${createdByAgentName} assigned you: ${title}`
      : `You have a new task: ${title}`;

    const payload = {
      notification: { title: notifTitle, body: notifBody },
      data: {
        type: "TASK_ASSIGNED",
        createdByAgentName: createdByAgentName || "",
        taskTitle: title,
        taskId: event.params.taskId,
        screen: "tasks",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "mgsr_team_notifications",
        },
      },
      webpush: {
        notification: {
          title: notifTitle,
          body: notifBody,
          icon: "/logo.svg",
          tag: `task-${event.params.taskId}`,
        },
        fcmOptions: {
          link: "/tasks",
        },
      },
    };

    try {
      await sendToAllTokens(agentId, accountData, payload);
      console.log(`Task notification sent to ${agentId} (${tokens.length} token(s)): ${title}`);
    } catch (err) {
      console.error("FCM task notification error:", err);
    }
  }
);

const TZ_ISRAEL = "Asia/Jerusalem";

/**
 * Returns days until due date using Israel timezone for day boundaries.
 * Fixes the bug where tasks created on Android (local midnight) were missed
 * because the previous logic used UTC, causing "due today" to appear as -1.
 */
function getDaysUntilDueIsrael(dueDateMs, nowMs) {
  const oneDayMs = 24 * 60 * 60 * 1000;
  const dueStr = new Date(dueDateMs).toLocaleDateString("en-CA", { timeZone: TZ_ISRAEL });
  const nowStr = new Date(nowMs).toLocaleDateString("en-CA", { timeZone: TZ_ISRAEL });
  const [dueY, dueM, dueD] = dueStr.split("-").map(Number);
  const [nowY, nowM, nowD] = nowStr.split("-").map(Number);
  const dueDateOnly = Date.UTC(dueY, dueM - 1, dueD);
  const nowDateOnly = Date.UTC(nowY, nowM - 1, nowD);
  return Math.round((dueDateOnly - nowDateOnly) / oneDayMs);
}

/**
 * Runs daily at 9:00 AM Israel time. Sends reminder push notifications for
 * incomplete tasks approaching their due date (7 days, 3 days, 1 day, day-of).
 */
/**
 * Runs daily at 04:00 Israel time. Scans mandate documents, marks expired ones,
 * updates player haveMandate, writes FeedEvents. Cloud replacement for MandateExpiryWorker.
 */
exports.mandateExpiryScheduled = onSchedule(
  { schedule: "0 4 * * *", timeZone: "Asia/Jerusalem" },
  async () => {
    console.log("[mandateExpiryScheduled] Triggered at 04:00 Israel time");
    await runMandateExpiry();
    console.log("[mandateExpiryScheduled] Completed");
  }
);

/**
 * Runs daily at 03:00 Israel time. Publishes to Pub/Sub and returns immediately
 * so Cloud Scheduler never times out. The actual work runs in releasesRefreshWorker.
 */
const RELEASES_REFRESH_TOPIC = "releases-refresh-trigger";
const SCOUT_AGENT_TOPIC = "scout-agent-trigger";

exports.releasesRefreshScheduled = onSchedule(
  { schedule: "0 3 * * *", timeZone: "Asia/Jerusalem" },
  async () => {
    console.log("[releasesRefreshScheduled] Triggered at 03:00 Israel time — publishing to Pub/Sub");
    const { PubSub } = require("@google-cloud/pubsub");
    const pubsub = new PubSub();
    await pubsub.topic(RELEASES_REFRESH_TOPIC).publishMessage({ data: Buffer.from("{}") });
    console.log("[releasesRefreshScheduled] Published — worker will run asynchronously");
  }
);

/**
 * Handles releases refresh work. Triggered by Pub/Sub (from releasesRefreshScheduled).
 * 9 min timeout, built-in retries on failure.
 */
exports.releasesRefreshWorker = onMessagePublished(
  {
    topic: RELEASES_REFRESH_TOPIC,
    timeoutSeconds: 540,
    retry: true,
  },
  async () => {
    console.log("[releasesRefreshWorker] Started");
    await runReleasesRefresh();
    console.log("[releasesRefreshWorker] Completed");
  }
);

/**
 * Runs every 6 hours (00:00, 06:00, 12:00, 18:00 Israel time). Publishes to Pub/Sub and returns
 * immediately so Cloud Scheduler never times out. The actual work runs in scoutAgentWorker.
 */
exports.scoutAgentScheduled = onSchedule(
  { schedule: "0 */6 * * *", timeZone: "Asia/Jerusalem" },
  async () => {
    console.log("[scoutAgentScheduled] Triggered (every 6h) — publishing to Pub/Sub");
    const { PubSub } = require("@google-cloud/pubsub");
    const pubsub = new PubSub();
    await pubsub.topic(SCOUT_AGENT_TOPIC).publishMessage({ data: Buffer.from("{}") });
    console.log("[scoutAgentScheduled] Published — worker will run asynchronously");
  }
);

/**
 * Handles scout agent work. Triggered by Pub/Sub (from scoutAgentScheduled).
 * 9 min timeout — scout server calls can be slow (cold start).
 */
exports.scoutAgentWorker = onMessagePublished(
  {
    topic: SCOUT_AGENT_TOPIC,
    timeoutSeconds: 540,
    retry: true,
  },
  async () => {
    console.log("[scoutAgentWorker] Started");
    try {
      const runResult = await runScoutAgent();
      if (runResult?.runId && runResult?.profilesByAgent) {
        try {
          await runScoutSkillLearning(runResult, runResult.runId);
        } catch (learnErr) {
          console.error("[scoutAgentWorker] Skill learning failed:", learnErr);
        }
      }
      console.log("[scoutAgentWorker] Completed");
    } catch (err) {
      console.error("[scoutAgentWorker] Failed:", err);
      const db = getFirestore();
      await db.collection("ScoutAgentRuns").add({
        runAt: Date.now(),
        status: "failed",
        profilesFound: 0,
        leaguesScanned: 0,
        durationMs: 0,
        error: err?.message || String(err),
      });
      throw err;
    }
  }
);

/**
 * Runs daily at 9:00 AM Israel time. Sends reminder push notifications for
 * incomplete tasks approaching their due date (7 days, 3 days, 1 day, day-of).
 */
exports.onTaskRemindersScheduled = onSchedule(
  { schedule: "0 9 * * *", timeZone: "Asia/Jerusalem" },
  async () => {
    const now = Date.now();

    const tasksSnap = await db
      .collection(AGENT_TASKS_COLLECTION)
      .where("isCompleted", "==", false)
      .get();

    const remindersToSend = []; // { taskId, agentId, daysLeft, taskTitle, remindersSent }

    for (const doc of tasksSnap.docs) {
      const data = doc.data();
      const dueDate = data.dueDate || 0;
      if (dueDate <= 0) continue;

      const remindersSent = data.remindersSent || [];
      const daysUntilDue = getDaysUntilDueIsrael(dueDate, now);

      let reminderDay = null;
      if (daysUntilDue === 7 && !remindersSent.includes(7)) reminderDay = 7;
      else if (daysUntilDue === 3 && !remindersSent.includes(3)) reminderDay = 3;
      else if (daysUntilDue === 1 && !remindersSent.includes(1)) reminderDay = 1;
      else if (daysUntilDue === 0 && !remindersSent.includes(0)) reminderDay = 0;

      if (reminderDay !== null) {
        remindersToSend.push({
          taskId: doc.id,
          agentId: data.agentId || "",
          taskTitle: data.title || "Task",
          daysLeft: daysUntilDue,
          reminderDay,
          remindersSent,
        });
      }
    }

    for (const { taskId, agentId, taskTitle, daysLeft, reminderDay, remindersSent } of remindersToSend) {
      if (!agentId) continue;

      let accountData;
      try {
        const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(agentId).get();
        if (!accountSnap.exists) {
          console.warn(`Account not found for agentId ${agentId} — skipping task reminder for "${taskTitle}"`);
          continue;
        }
        accountData = accountSnap.data();
      } catch (e) {
        console.error(`Failed to fetch account for agent ${agentId}:`, e);
        continue;
      }

      const tokens = getAllTokens(accountData);
      if (tokens.length === 0) {
        console.warn(`No FCM tokens for agent ${agentId} — skipping task reminder for "${taskTitle}"`);
        continue;
      }

      const dayText =
        daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
      const notifTitle = "Task Reminder";
      const notifBody = `"${taskTitle}" is due ${dayText}`;

      const payload = {
        notification: { title: notifTitle, body: notifBody },
        data: {
          type: "TASK_REMINDER",
          taskTitle,
          taskId,
          daysLeft: String(daysLeft),
          screen: "tasks",
        },
        android: {
          priority: "high",
          notification: {
            channelId: "mgsr_team_notifications",
          },
        },
        webpush: {
          notification: { title: notifTitle, body: notifBody, icon: "/logo.svg", tag: `reminder-${taskId}` },
          fcmOptions: { link: "/tasks" },
        },
      };

      try {
        await sendToAllTokens(agentId, accountData, payload);
        await db.collection(AGENT_TASKS_COLLECTION).doc(taskId).update({
          remindersSent: [...remindersSent, reminderDay],
        });
        console.log(`Reminder sent for task ${taskId} (${daysLeft} days)`);
      } catch (err) {
        console.error(`Reminder send failed for task ${taskId}:`, err);
      }
    }
  }
);

// ─── Subscribe to FCM Topic (callable) ──────────────────────────────
// Called from the web app after obtaining a push token.
// Subscribes that token to the "mgsr_all" broadcast topic.
// ─────────────────────────────────────────────────────────────────────
exports.subscribeToTopicCallable = onCall(async (request) => {
  const { token, topic } = request.data || {};
  if (!token || !topic) {
    throw new Error("Missing token or topic");
  }
  // Only allow subscribing to the known broadcast topic
  if (topic !== "mgsr_all") {
    throw new Error("Invalid topic");
  }
  await getMessaging().subscribeToTopic([token], topic);
  console.log(`Subscribed token to topic "${topic}"`);
  return { success: true };
});

// ─── Daily Digest Email ─────────────────────────────────────────────
// Fires at 20:00 Israel time (Asia/Jerusalem). Sends nightly summary
// email with agent performance, top 5 picks, and system suggestions.
// Uses Pub/Sub pattern for reliability.
// ─────────────────────────────────────────────────────────────────────
const DAILY_DIGEST_TOPIC = "daily-digest-trigger";

exports.dailyDigestScheduled = onSchedule(
  { schedule: "0 20 * * *", timeZone: "Asia/Jerusalem" },
  async () => {
    console.log("[dailyDigestScheduled] Triggered at 20:00 Israel time — publishing to Pub/Sub");
    const { PubSub } = require("@google-cloud/pubsub");
    const pubsub = new PubSub();
    await pubsub.topic(DAILY_DIGEST_TOPIC).publishMessage({ data: Buffer.from("{}") });
    console.log("[dailyDigestScheduled] Published — worker will send email asynchronously");
  }
);

exports.dailyDigestWorker = onMessagePublished(
  {
    topic: DAILY_DIGEST_TOPIC,
    timeoutSeconds: 120,
    retry: true,
    secrets: ["GMAIL_USER", "GMAIL_APP_PASSWORD"],
  },
  async () => {
    console.log("[dailyDigestWorker] Started");
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailAppPassword) {
      console.error("[dailyDigestWorker] Missing GMAIL_USER or GMAIL_APP_PASSWORD secrets");
      throw new Error("Email credentials not configured. Run: firebase functions:secrets:set GMAIL_USER && firebase functions:secrets:set GMAIL_APP_PASSWORD");
    }
    await runDailyDigest(gmailUser, gmailAppPassword);
    console.log("[dailyDigestWorker] Completed");
  }
);
