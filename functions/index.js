// Polyfill for undici (used by Firebase deps) when File is not in global scope (Node 18)
if (typeof globalThis.File === "undefined") {
  globalThis.File = class File {};
}

const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onMessagePublished } = require("firebase-functions/v2/pubsub");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

/**
 * Auth guard for onCall handlers. Throws UNAUTHENTICATED if no auth token.
 * Usage: requireAuth(req) at the top of every onCall handler.
 */
function requireAuth(req) {
  if (!req.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
}
const { runMandateExpiry } = require("./workers/mandateExpiry");
const { runBackfillMandateLeagues } = require("./workers/backfillMandateLeagues");
const { runReleasesRefresh } = require("./workers/releasesRefresh");
const { runScoutAgent } = require("./workers/scoutAgent");
const { runScoutSkillLearning } = require("./workers/scoutSkillLearner");
const { runDailyDigest } = require("./workers/dailyDigest");
const { fetchDocument } = require("./lib/transfermarkt");

// Phase-1 callables — shared business logic for Android & Web
const { contactsCreate, contactsUpdate, contactsDelete } = require("./callables/contacts");
const { tasksCreate, tasksUpdate, tasksToggleComplete, tasksDelete } = require("./callables/tasks");
const { agentTransferRequest, agentTransferApprove, agentTransferReject, agentTransferCancel } = require("./callables/agentTransfers");
const { offersCreate, offersUpdateFeedback, offersDelete } = require("./callables/playerOffers");
const { requestsCreate, requestsUpdate, requestsDelete } = require("./callables/requests");
const { matchRequestToPlayers, matchingRequestsForPlayer, matchRequestToPlayersLocal, recalculateAllMatches } = require("./callables/requestMatcher");
const { playersUpdate, playersToggleMandate, playersAddNote, playersDeleteNote, playersDelete, playerDocumentsCreate, playerDocumentsDelete, playerDocumentsMarkExpired } = require("./callables/players");
const { shortlistAdd, shortlistRemove, shortlistUpdate, shortlistAddNote, shortlistUpdateNote, shortlistDeleteNote } = require("./callables/shortlists");
const { playersCreate } = require("./callables/playersCreate");
const { portfolioUpsert, portfolioDelete } = require("./callables/portfolio");
const { sharePlayerCreate, shadowTeamsSave, scoutProfileFeedbackSet, birthdayWishSend, offersUpdateHistorySummary, mandateSigningCreate } = require("./callables/phase6Misc");
const { accountUpdate } = require("./callables/phase7Account");
const { chatRoomSend, chatRoomEdit, chatRoomDelete } = require("./callables/chatRoom");

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
  "REQUEST_ADDED",
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
      // Remove from fcmTokens array (only if there are invalid web tokens to remove)
      if (Array.isArray(accountData.fcmTokens) && accountData.fcmTokens.length > 0) {
        const cleaned = accountData.fcmTokens.filter((entry) => {
          const t = typeof entry === "string" ? entry : entry?.token;
          return !invalidTokens.includes(t);
        });
        if (cleaned.length !== accountData.fcmTokens.length) {
          updates.fcmTokens = cleaned;
        }
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
  const agentName = data.agentName || "";

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
    case "REQUEST_ADDED":
      title = "New Club Request";
      body = agentName
        ? `${agentName} added a new request from ${playerName}`
        : `New request added from ${playerName}`;
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
      agentName: agentName || "",
      playerTmProfile: data.playerTmProfile || "",
    },
    android: {
      priority: "high",
      notification: {
        channelId: "mgsr_team_notifications",
        tag: `feed-${event.params.eventId}`,
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
          tag: `task-${event.params.taskId}`,
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
 * Triggered when a MandateSigningRequest is updated.
 * When the player signs (status changes to player_signed or fully_signed),
 * sends a push notification to the agent who created the signing request.
 */
exports.onMandateSigningUpdated = onDocumentUpdated(
  "MandateSigningRequests/{token}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Only notify when player signature was just added
    if (before.playerSignature || !after.playerSignature) return;

    const agentAccountId = after.agentAccountId;
    if (!agentAccountId) {
      console.log("No agentAccountId on signing request, skipping notification");
      return;
    }

    let accountData;
    try {
      const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(agentAccountId).get();
      if (!accountSnap.exists) {
        console.log(`Account not found for ${agentAccountId}, skipping mandate signing notification`);
        return;
      }
      accountData = accountSnap.data();
    } catch (e) {
      console.error("Failed to fetch agent account for signing notification:", e);
      return;
    }

    const playerName = after.playerName || [after.passportDetails?.firstName, after.passportDetails?.lastName].filter(Boolean).join(" ") || "A player";
    const fullySignedNow = after.playerSignature && after.agentSignature;

    const notifTitle = fullySignedNow ? "Mandate Fully Signed" : "Player Signed Mandate";
    const notifBody = fullySignedNow
      ? `${playerName}'s mandate is now fully signed by both parties.`
      : `${playerName} has signed the mandate. Your signature is still needed.`;

    const payload = {
      notification: { title: notifTitle, body: notifBody },
      data: {
        type: "MANDATE_PLAYER_SIGNED",
        playerName,
        token: event.params.token,
        screen: "mandate_signing",
        fullySigned: fullySignedNow ? "true" : "false",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "mgsr_team_notifications",
          tag: `mandate-sign-${event.params.token}`,
        },
      },
      webpush: {
        notification: {
          title: notifTitle,
          body: notifBody,
          icon: "/logo.svg",
          tag: `mandate-sign-${event.params.token}`,
        },
        fcmOptions: {
          link: `/sign-mandate/${event.params.token}`,
        },
      },
    };

    try {
      await sendToAllTokens(agentAccountId, accountData, payload);
      console.log(`Mandate signing notification sent to ${agentAccountId}: ${playerName}`);
    } catch (err) {
      console.error("FCM mandate signing notification error:", err);
    }
  }
);

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
    memory: "512MiB",
    retry: true,
  },
  async () => {
    console.log("[releasesRefreshWorker] Started");
    await runReleasesRefresh();
    console.log("[releasesRefreshWorker] Completed");
  }
);

/**
 * Runs once daily at 00:00 Israel time. Publishes to Pub/Sub and returns
 * immediately so Cloud Scheduler never times out. The actual work runs in scoutAgentWorker.
 */
exports.scoutAgentScheduled = onSchedule(
  { schedule: "0 0 * * *", timeZone: "Asia/Jerusalem" },
  async () => {
    console.log("[scoutAgentScheduled] Triggered (daily 00:00) — publishing to Pub/Sub");
    const { PubSub } = require("@google-cloud/pubsub");
    const pubsub = new PubSub();
    await pubsub.topic(SCOUT_AGENT_TOPIC).publishMessage({ data: Buffer.from("{}") });
    console.log("[scoutAgentScheduled] Published — worker will run asynchronously");
  }
);

/**
 * Handles scout agent work. Triggered by Pub/Sub (from scoutAgentScheduled).
 * 30 min timeout — TM fallback scrapes all 44 leagues with stats enrichment.
 */
exports.scoutAgentWorker = onMessagePublished(
  {
    topic: SCOUT_AGENT_TOPIC,
    timeoutSeconds: 1800,
    memory: "1GiB",
    retry: false,
    secrets: ["SCOUT_ENRICH_SECRET"],
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
            tag: `reminder-${taskId}`,
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
  requireAuth(request);
  const { token, topic } = request.data || {};
  if (!token || !topic) {
    throw new Error("Missing token or topic");
  }
  if (topic !== "mgsr_all") {
    throw new Error("Invalid topic");
  }
  await getMessaging().subscribeToTopic([token], topic);
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

/**
 * One-time callable function to backfill validLeagues on existing mandate documents.
 * Downloads each mandate PDF from Storage, uses Gemini to extract the leagues section,
 * and writes validLeagues back to Firestore. Safe to re-run (skips already-filled docs).
 *
 * Call via: firebase functions:call backfillMandateLeagues --project=mgsr-64e4b
 */
exports.backfillMandateLeagues = onCall(
  {
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (req) => {
    requireAuth(req);
    console.log("[backfillMandateLeagues] Started");
    const result = await runBackfillMandateLeagues();
    console.log("[backfillMandateLeagues] Completed", JSON.stringify(result));
    return result;
  }
);

// ─── Instagram enrichment on new shortlist entry ──────────────────────────────
exports.onShortlistAdd = onDocumentCreated("Shortlists/{entryId}", async (event) => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data();
  const tmProfileUrl = data.tmProfileUrl;
  if (!tmProfileUrl || !tmProfileUrl.includes("transfermarkt")) {
    console.log("[onShortlistAdd] No TM URL, skipping:", snap.id);
    return;
  }
  if (data.instagramHandle) {
    console.log("[onShortlistAdd] Already has Instagram, skipping:", snap.id);
    return;
  }
  try {
    const $ = await fetchDocument(tmProfileUrl);
    let instagramHandle = null;
    let instagramUrl = null;
    const tmOwnedHandles = new Set(["transfermarkt_official", "transfermarkt", "transfermarkt.de"]);
    $("a[href*='instagram.com']").each((_, el) => {
      const href = $(el).attr("href");
      if (href && !instagramUrl) {
        const match = href.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
        if (match && !tmOwnedHandles.has(match[1].toLowerCase())) {
          instagramUrl = href.startsWith("http") ? href : "https://" + href.replace(/^\/\//, "");
          instagramHandle = match[1];
          return false;
        }
      }
    });
    if (instagramHandle) {
      await snap.ref.update({ instagramHandle, instagramUrl });
      console.log(`[onShortlistAdd] Enriched ${snap.id} with Instagram: @${instagramHandle}`);
    } else {
      console.log(`[onShortlistAdd] No Instagram found for ${snap.id}`);
    }
  } catch (err) {
    console.error(`[onShortlistAdd] Error enriching ${snap.id}:`, err.message || err);
  }
});

// ─── Agent Transfer ────────────────────────────────────────────────────────

const TRANSFER_COLLECTION = "AgentTransferRequests";

/**
 * Resolves an agent identifier to { accountId, accountData }.
 * Tries: (1) direct doc ID, (2) query by uid field, (3) query by name match.
 * agentInChargeId may be a Firebase Auth UID rather than an Account doc ID.
 */
async function resolveAccount(agentId, agentName) {
  if (agentId) {
    // 1. Try by doc ID
    const byDoc = await db.collection(ACCOUNTS_COLLECTION).doc(agentId).get();
    if (byDoc.exists) return { accountId: byDoc.id, accountData: byDoc.data() };

    // 2. Try by uid field (some Account docs may store the auth UID)
    const byUid = await db.collection(ACCOUNTS_COLLECTION).where("uid", "==", agentId).limit(1).get();
    if (!byUid.empty) {
      const d = byUid.docs[0];
      return { accountId: d.id, accountData: d.data() };
    }
  }

  // 3. Fallback: match by name (works even when agentId is empty/null)
  if (agentName) {
    const all = await db.collection(ACCOUNTS_COLLECTION).get();
    for (const d of all.docs) {
      const data = d.data();
      if (
        (data.name || "").toLowerCase() === agentName.toLowerCase() ||
        (data.hebrewName || "").toLowerCase() === agentName.toLowerCase()
      ) {
        return { accountId: d.id, accountData: data };
      }
    }
  }

  return null;
}

/**
 * When a new transfer request is created, notify the current agent (fromAgent)
 * that someone wants to take over their player.
 */
exports.onAgentTransferRequest = onDocumentCreated(
  `${TRANSFER_COLLECTION}/{requestId}`,
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const fromAgentId = data.fromAgentId || "";
    const fromAgentName = data.fromAgentName || "";
    const toAgentName = data.toAgentName || "Someone";
    const playerName = data.playerName || "a player";

    if (!fromAgentId && !fromAgentName) return;

    const resolved = await resolveAccount(fromAgentId, fromAgentName);
    if (!resolved) {
      console.log(`[onAgentTransferRequest] Account not resolved for id=${fromAgentId} name=${fromAgentName}`);
      return;
    }

    const { accountId, accountData } = resolved;
    const tokens = getAllTokens(accountData);
    if (tokens.length === 0) {
      console.log(`[onAgentTransferRequest] No FCM tokens for ${accountId}`);
      return;
    }

    const lang = accountData.language || "he";
    const notifTitle = lang === "he"
      ? "בקשת שיוך שחקן חדשה"
      : "New Agent Transfer Request";
    const notifBody = lang === "he"
      ? `${toAgentName} מבקש לקבל את השיוך ל${playerName}`
      : `${toAgentName} wants to take over as agent for ${playerName}`;

    const payload = {
      notification: { title: notifTitle, body: notifBody },
      data: {
        type: "AGENT_TRANSFER_REQUEST",
        requesterName: toAgentName,
        playerName: playerName,
        playerId: data.playerId || "",
        screen: "player",
      },
      android: {
        priority: "high",
        notification: { channelId: "mgsr_team_notifications", tag: `transfer-req-${event.params.requestId}` },
      },
      webpush: {
        notification: {
          title: notifTitle,
          body: notifBody,
          icon: "/logo.svg",
          tag: `transfer-req-${event.params.requestId}`,
        },
        fcmOptions: { link: data.playerId ? `/players/${data.playerId}` : "/" },
      },
    };

    try {
      await sendToAllTokens(accountId, accountData, payload);
      console.log(`[onAgentTransferRequest] Notification sent to ${accountId} (lang=${lang}): ${toAgentName} → ${playerName}`);
    } catch (err) {
      console.error("[onAgentTransferRequest] FCM error:", err);
    }
  }
);

/**
 * When a transfer request status changes (approved/rejected), notify the requester (toAgent).
 */
exports.onAgentTransferResolved = onDocumentUpdated(
  `${TRANSFER_COLLECTION}/{requestId}`,
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;

    // Only fire when status changes from "pending" to "approved" or "rejected"
    if (before.status !== "pending") return;
    if (after.status !== "approved" && after.status !== "rejected") return;

    const toAgentId = after.toAgentId || "";
    const toAgentName = after.toAgentName || "";
    const fromAgentName = after.fromAgentName || "";
    const playerName = after.playerName || "a player";
    const isApproved = after.status === "approved";

    if (!toAgentId && !toAgentName) return;

    const resolved = await resolveAccount(toAgentId, toAgentName);
    if (!resolved) {
      console.log(`[onAgentTransferResolved] Account not resolved for id=${toAgentId} name=${toAgentName}`);
      return;
    }

    const { accountId, accountData } = resolved;
    const tokens = getAllTokens(accountData);
    if (tokens.length === 0) {
      console.log(`[onAgentTransferResolved] No FCM tokens for ${accountId}`);
      return;
    }

    const lang = accountData.language || "he";
    const notificationType = isApproved ? "AGENT_TRANSFER_APPROVED" : "AGENT_TRANSFER_REJECTED";

    let notifTitle, notifBody;
    if (lang === "he") {
      notifTitle = isApproved ? "בקשת שיוך אושרה ✓" : "בקשת שיוך נדחתה ✕";
      notifBody = isApproved
        ? `${fromAgentName} אישר את בקשת השיוך ל${playerName}`
        : `${fromAgentName} דחה את בקשת השיוך ל${playerName}`;
    } else {
      notifTitle = isApproved ? "Transfer Request Approved ✓" : "Transfer Request Rejected ✕";
      notifBody = isApproved
        ? `${fromAgentName} approved the transfer request for ${playerName}`
        : `${fromAgentName} rejected the transfer request for ${playerName}`;
    }

    const payload = {
      notification: { title: notifTitle, body: notifBody },
      data: {
        type: notificationType,
        playerName: playerName,
        playerId: after.playerId || "",
        screen: "player",
      },
      android: {
        priority: "high",
        notification: { channelId: "mgsr_team_notifications", tag: `transfer-res-${event.params.requestId}` },
      },
      webpush: {
        notification: {
          title: notifTitle,
          body: notifBody,
          icon: "/logo.svg",
          tag: `transfer-res-${event.params.requestId}`,
        },
        fcmOptions: { link: after.playerId ? `/players/${after.playerId}` : "/" },
      },
    };

    try {
      await sendToAllTokens(accountId, accountData, payload);
      console.log(`[onAgentTransferResolved] ${notificationType} notification sent to ${accountId} (lang=${lang}): ${playerName}`);
    } catch (err) {
      console.error("[onAgentTransferResolved] FCM error:", err);
    }
  }
);

// ─── Backfill DOB from TransferMarkt ────────────────────────────────────────

/**
 * Extract ISO DOB (YYYY-MM-DD) from a TM profile page's cheerio document.
 * Priority order:
 *  1. Link href inside birthDate span: datum/YYYY-MM-DD (unambiguous)
 *  2. Named-month text: "Jul 4, 1997" (parsed by JS Date)
 *  3. Returns null if nothing reliable found
 *
 * NEVER assumes DD/MM vs MM/DD — only uses unambiguous sources.
 */
function extractDobFromTmPage($) {
  const birthSpan = $("span[itemprop=birthDate]").first();
  if (!birthSpan.length) return null;

  // 1. Try the link href — contains unambiguous ISO date: datum/YYYY-MM-DD
  const birthLink = birthSpan.find("a").first().attr("href") || "";
  const isoFromLink = birthLink.match(/datum\/(\d{4})-(\d{2})-(\d{2})/);
  if (isoFromLink) {
    return `${isoFromLink[1]}-${isoFromLink[2]}-${isoFromLink[3]}`;
  }

  // 2. Try content attribute (some TM versions include it)
  const contentAttr = birthSpan.attr("content") || "";
  const isoFromContent = contentAttr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoFromContent) {
    return `${isoFromContent[1]}-${isoFromContent[2]}-${isoFromContent[3]}`;
  }

  // 3. Fallback: parse named-month text like "Jul 4, 1997 (28)"
  const birthText = birthSpan.text().trim();
  if (!birthText) return null;
  const dateStr = birthText.replace(/\s*\(\d+\)\s*$/, "").trim();
  // Only trust named-month formats (e.g. "Jun 15, 2000") — NOT numeric DD/MM or MM/DD
  if (/[a-zA-Z]/.test(dateStr)) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      const yyyy = parsed.getFullYear();
      const mm = String(parsed.getMonth() + 1).padStart(2, "0");
      const dd = String(parsed.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

/**
 * Callable function that scrapes dateOfBirth from TM profiles for all players
 * that have a tmProfile URL but no dateOfBirth on their player document.
 * Updates the Player document directly (not passportDetails).
 *
 * Processes all 3 collections: Players, PlayersWomen, PlayersYouth.
 * Uses batching (5 concurrent, 2s delay) to avoid TM rate limits.
 */
exports.backfillPlayerDob = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    requireAuth(request);
    const collections = ["Players", "PlayersWomen", "PlayersYouth"];
    const BATCH_SIZE = 5;
    const BATCH_DELAY = 2000;
    const results = { updated: 0, skipped: 0, failed: 0, errors: [] };

    for (const collName of collections) {
      console.log(`[backfillPlayerDob] Processing ${collName}...`);
      const snap = await db.collection(collName).get();
      const candidates = [];

      snap.forEach((doc) => {
        const d = doc.data();
        if (d.tmProfile && !d.dateOfBirth) {
          candidates.push({ ref: doc.ref, tmProfile: d.tmProfile, name: d.fullName || doc.id });
        }
      });

      console.log(`[backfillPlayerDob] ${collName}: ${candidates.length} players need DOB (${snap.size} total)`);

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY));
        const batch = candidates.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (player) => {
            try {
              const $ = await fetchDocument(player.tmProfile);
              const dob = extractDobFromTmPage($);
              if (!dob) {
                results.skipped++;
                return;
              }

              await player.ref.update({ dateOfBirth: dob });
              console.log(`[backfillPlayerDob] ${player.name} -> ${dob}`);
              results.updated++;
            } catch (err) {
              console.error(`[backfillPlayerDob] Error for ${player.name}:`, err.message);
              results.failed++;
              results.errors.push(`${player.name}: ${err.message}`);
            }
          })
        );
      }
    }

    console.log(`[backfillPlayerDob] Done. Updated: ${results.updated}, Skipped: ${results.skipped}, Failed: ${results.failed}`);
    return results;
  }
);

/**
 * Revalidate ALL existing DOBs by re-scraping from TM.
 * For every player with a tmProfile AND existing dateOfBirth,
 * re-scrapes the DOB and compares. Fixes any that differ.
 * Returns: { checked, fixed, skipped, failed, fixes: [{name, old, new}] }
 */
exports.revalidatePlayerDob = onCall(
  { timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    requireAuth(request);
    const collections = ["Players", "PlayersWomen", "PlayersYouth"];
    const BATCH_SIZE = 5;
    const BATCH_DELAY = 2000;
    const results = { checked: 0, fixed: 0, skipped: 0, failed: 0, fixes: [], errors: [] };

    for (const collName of collections) {
      console.log(`[revalidatePlayerDob] Processing ${collName}...`);
      const snap = await db.collection(collName).get();
      const candidates = [];

      snap.forEach((doc) => {
        const d = doc.data();
        if (d.tmProfile && d.dateOfBirth) {
          candidates.push({
            ref: doc.ref,
            tmProfile: d.tmProfile,
            name: d.fullName || doc.id,
            currentDob: d.dateOfBirth,
          });
        }
      });

      console.log(`[revalidatePlayerDob] ${collName}: ${candidates.length} players to check`);

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY));
        const batch = candidates.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map(async (player) => {
            try {
              const $ = await fetchDocument(player.tmProfile);
              const correctDob = extractDobFromTmPage($);
              results.checked++;

              if (!correctDob) {
                results.skipped++;
                return;
              }

              if (correctDob !== player.currentDob) {
                await player.ref.update({ dateOfBirth: correctDob });
                console.log(`[revalidatePlayerDob] FIXED ${player.name}: ${player.currentDob} -> ${correctDob}`);
                results.fixed++;
                results.fixes.push({ name: player.name, old: player.currentDob, new: correctDob });
              }
            } catch (err) {
              console.error(`[revalidatePlayerDob] Error for ${player.name}:`, err.message);
              results.failed++;
              results.errors.push(`${player.name}: ${err.message}`);
            }
          })
        );
      }
    }

    console.log(`[revalidatePlayerDob] Done. Checked: ${results.checked}, Fixed: ${results.fixed}, Skipped: ${results.skipped}, Failed: ${results.failed}`);
    return results;
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Phase-1 Shared Callables — single source of truth for Android & Web
// ─────────────────────────────────────────────────────────────────────────────

// Contacts CRUD
exports.contactsCreate = onCall(async (req) => { requireAuth(req); return contactsCreate(req.data); });
exports.contactsUpdate = onCall(async (req) => { requireAuth(req); return contactsUpdate(req.data); });
exports.contactsDelete = onCall(async (req) => { requireAuth(req); return contactsDelete(req.data); });

// Tasks CRUD
exports.tasksCreate = onCall(async (req) => { requireAuth(req); return tasksCreate(req.data); });
exports.tasksUpdate = onCall(async (req) => { requireAuth(req); return tasksUpdate(req.data); });
exports.tasksToggleComplete = onCall(async (req) => { requireAuth(req); return tasksToggleComplete(req.data); });
exports.tasksDelete = onCall(async (req) => { requireAuth(req); return tasksDelete(req.data); });

// Agent Transfers
exports.agentTransferRequest = onCall(async (req) => { requireAuth(req); return agentTransferRequest(req.data); });
exports.agentTransferApprove = onCall(async (req) => { requireAuth(req); return agentTransferApprove(req.data); });
exports.agentTransferReject = onCall(async (req) => { requireAuth(req); return agentTransferReject(req.data); });
exports.agentTransferCancel = onCall(async (req) => { requireAuth(req); return agentTransferCancel(req.data); });

// Player Offers
exports.offersCreate = onCall(async (req) => { requireAuth(req); return offersCreate(req.data); });
exports.offersUpdateFeedback = onCall(async (req) => { requireAuth(req); return offersUpdateFeedback(req.data); });
exports.offersDelete = onCall(async (req) => { requireAuth(req); return offersDelete(req.data); });

// Club Requests CRUD
exports.requestsCreate = onCall(async (req) => { requireAuth(req); return requestsCreate(req.data); });
exports.requestsUpdate = onCall(async (req) => { requireAuth(req); return requestsUpdate(req.data); });
exports.requestsDelete = onCall(async (req) => { requireAuth(req); return requestsDelete(req.data); });

// Request ↔ Player Matching
exports.matchRequestToPlayers = onCall(async (req) => { requireAuth(req); return matchRequestToPlayers(req.data); });
exports.matchingRequestsForPlayer = onCall(async (req) => { requireAuth(req); return matchingRequestsForPlayer(req.data); });
exports.matchRequestToPlayersLocal = onCall(async (req) => { requireAuth(req); return matchRequestToPlayersLocal(req.data); });
exports.recalculateAllMatchesCallable = onCall(async (req) => { requireAuth(req); return recalculateAllMatches(req.data.platform); });

// ═══════════════════════════════════════════════════════════════════════════
// Pre-computed Match Results — Firestore triggers
// Single source of truth: when players or requests change, recalculate
// matches in the cloud. Both Android and Web read the results.
//
// Cost optimizations:
//  1. Only recalculate when matching-relevant fields change
//  2. Debounce: skip if last recalc was <10s ago (batch updates)
//  3. recalculateAllMatches() skips writing unchanged results
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fields on Player that affect matching. If only non-matching fields changed
 * (e.g. notes, phone, profileImage), we skip the expensive recalculation.
 */
const PLAYER_MATCHING_FIELDS = new Set([
  "positions", "age", "foot", "salaryRange", "transferFee",
  "nationality", "nationalities",
]);

/** Fields on ClubRequest that affect matching. */
const REQUEST_MATCHING_FIELDS = new Set([
  "position", "minAge", "maxAge", "ageDoesntMatter",
  "dominateFoot", "salaryRange", "transferFee", "euOnly", "status",
]);

/** Per-platform cooldown tracker — prevents rapid-fire recalculations. */
const _lastRecalcTime = { men: 0, women: 0, youth: 0 };
const RECALC_COOLDOWN_MS = 10_000; // 10 seconds

/**
 * Check if any matching-relevant field changed between before/after snapshots.
 * Returns true if recalculation is needed.
 */
function matchingFieldsChanged(beforeData, afterData, relevantFields) {
  // Document created or deleted — always recalculate
  if (!beforeData || !afterData) return true;
  for (const field of relevantFields) {
    const a = JSON.stringify(beforeData[field] ?? null);
    const b = JSON.stringify(afterData[field] ?? null);
    if (a !== b) return true;
  }
  return false;
}

async function triggerRecalcIfNeeded(platform, beforeData, afterData, relevantFields) {
  // Skip if no matching-relevant fields changed
  if (!matchingFieldsChanged(beforeData, afterData, relevantFields)) return;

  // Debounce: skip if recalculated very recently
  const now = Date.now();
  if (now - _lastRecalcTime[platform] < RECALC_COOLDOWN_MS) return;
  _lastRecalcTime[platform] = now;

  await recalculateAllMatches(platform);
}

// --- Men ---
exports.onPlayerWriteMatchRecalc = onDocumentWritten("Players/{playerId}", async (event) => {
  await triggerRecalcIfNeeded("men", event.data?.before?.data(), event.data?.after?.data(), PLAYER_MATCHING_FIELDS);
});
exports.onRequestWriteMatchRecalc = onDocumentWritten("ClubRequests/{requestId}", async (event) => {
  await triggerRecalcIfNeeded("men", event.data?.before?.data(), event.data?.after?.data(), REQUEST_MATCHING_FIELDS);
});

// --- Women ---
exports.onPlayerWomenWriteMatchRecalc = onDocumentWritten("PlayersWomen/{playerId}", async (event) => {
  await triggerRecalcIfNeeded("women", event.data?.before?.data(), event.data?.after?.data(), PLAYER_MATCHING_FIELDS);
});
exports.onRequestWomenWriteMatchRecalc = onDocumentWritten("ClubRequestsWomen/{requestId}", async (event) => {
  await triggerRecalcIfNeeded("women", event.data?.before?.data(), event.data?.after?.data(), REQUEST_MATCHING_FIELDS);
});

// --- Youth ---
exports.onPlayerYouthWriteMatchRecalc = onDocumentWritten("PlayersYouth/{playerId}", async (event) => {
  await triggerRecalcIfNeeded("youth", event.data?.before?.data(), event.data?.after?.data(), PLAYER_MATCHING_FIELDS);
});
exports.onRequestYouthWriteMatchRecalc = onDocumentWritten("ClubRequestsYouth/{requestId}", async (event) => {
  await triggerRecalcIfNeeded("youth", event.data?.before?.data(), event.data?.after?.data(), REQUEST_MATCHING_FIELDS);
});

// Players
exports.playersUpdate = onCall(async (req) => { requireAuth(req); return playersUpdate(req.data); });

// ── GPS Insights: auto-recompute when GpsMatchData changes ──────────────
const { recomputeGpsInsights } = require("./lib/gpsInsights");

// Debounce map to avoid multiple rapid recomputes for the same player
const _gpsRecomputeTimers = {};

exports.onGpsMatchDataWritten = onDocumentWritten("GpsMatchData/{docId}", async (event) => {
  // Get playerTmProfile from before or after data (handles create/update/delete)
  const playerTmProfile =
    event.data?.after?.data()?.playerTmProfile ||
    event.data?.before?.data()?.playerTmProfile;
  if (!playerTmProfile) return;

  // Simple debounce: skip if we already scheduled a recompute for this player in last 3s
  const now = Date.now();
  if (_gpsRecomputeTimers[playerTmProfile] && now - _gpsRecomputeTimers[playerTmProfile] < 3000) {
    return;
  }
  _gpsRecomputeTimers[playerTmProfile] = now;

  try {
    await recomputeGpsInsights(playerTmProfile);
  } catch (err) {
    console.error("[onGpsMatchDataWritten] Failed to recompute insights:", err);
  }
});
exports.playersToggleMandate = onCall(async (req) => { requireAuth(req); return playersToggleMandate(req.data); });
exports.playersAddNote = onCall(async (req) => { requireAuth(req); return playersAddNote(req.data); });
exports.playersDeleteNote = onCall(async (req) => { requireAuth(req); return playersDeleteNote(req.data); });
exports.playersDelete = onCall(async (req) => { requireAuth(req); return playersDelete(req.data); });

// Player Documents
exports.playerDocumentsCreate = onCall(async (req) => { requireAuth(req); return playerDocumentsCreate(req.data); });
exports.playerDocumentsDelete = onCall(async (req) => { requireAuth(req); return playerDocumentsDelete(req.data); });
exports.playerDocumentsMarkExpired = onCall(async (req) => { requireAuth(req); return playerDocumentsMarkExpired(req.data); });

// Shortlists
exports.shortlistAdd = onCall(async (req) => { requireAuth(req); return shortlistAdd(req.data); });
exports.shortlistRemove = onCall(async (req) => { requireAuth(req); return shortlistRemove(req.data); });
exports.shortlistUpdate = onCall(async (req) => { requireAuth(req); return shortlistUpdate(req.data); });
exports.shortlistAddNote = onCall(async (req) => { requireAuth(req); return shortlistAddNote(req.data); });
exports.shortlistUpdateNote = onCall(async (req) => { requireAuth(req); return shortlistUpdateNote(req.data); });
exports.shortlistDeleteNote = onCall(async (req) => { requireAuth(req); return shortlistDeleteNote(req.data); });

// Players Create (Phase 5)
exports.playersCreate = onCall(async (req) => { requireAuth(req); return playersCreate(req.data); });

// Portfolio
exports.portfolioUpsert = onCall(async (req) => { requireAuth(req); return portfolioUpsert(req.data); });
exports.portfolioDelete = onCall(async (req) => { requireAuth(req); return portfolioDelete(req.data); });

// Phase 6 — misc
exports.sharePlayerCreate = onCall(async (req) => { requireAuth(req); return sharePlayerCreate(req.data); });
exports.shadowTeamsSave = onCall(async (req) => { requireAuth(req); return shadowTeamsSave(req.data); });
exports.scoutProfileFeedbackSet = onCall(async (req) => { requireAuth(req); return scoutProfileFeedbackSet(req.data); });
exports.birthdayWishSend = onCall(async (req) => { requireAuth(req); return birthdayWishSend(req.data); });
exports.offersUpdateHistorySummary = onCall(async (req) => { requireAuth(req); return offersUpdateHistorySummary(req.data); });
exports.mandateSigningCreate = onCall(async (req) => { requireAuth(req); return mandateSigningCreate(req.data); });

// ── Phase 7 — Account ──────────────────────────────────────────────────
exports.accountUpdate = onCall(async (req) => { requireAuth(req); return accountUpdate(req.data); });

// ── Chat Room ──────────────────────────────────────────────────────────
exports.chatRoomSend = onCall(async (req) => { requireAuth(req); return chatRoomSend(req.data); });
exports.chatRoomEdit = onCall(async (req) => { requireAuth(req); return chatRoomEdit(req.data); });
exports.chatRoomDelete = onCall(async (req) => { requireAuth(req); return chatRoomDelete(req.data); });
