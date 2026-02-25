const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const { getFirestore } = require("firebase-admin/firestore");

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

    let token;
    try {
      const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(agentId).get();
      token = accountSnap.data()?.fcmToken;
    } catch (e) {
      console.error("Failed to fetch assignee FCM token:", e);
      return;
    }
    if (!token) {
      console.log(`No FCM token for assignee ${agentId}, skipping task notification`);
      return;
    }

    const notifTitle = "New Task Assigned";
    const notifBody = createdByAgentName
      ? `${createdByAgentName} assigned you: ${title}`
      : `You have a new task: ${title}`;

    const message = {
      token,
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
    };

    try {
      await getMessaging().send(message);
      console.log(`Task notification sent to ${agentId}: ${title}`);
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

      let token;
      try {
        const accountSnap = await db.collection(ACCOUNTS_COLLECTION).doc(agentId).get();
        if (!accountSnap.exists) {
          console.warn(`Account not found for agentId ${agentId} — skipping task reminder for "${taskTitle}"`);
          continue;
        }
        token = accountSnap.data()?.fcmToken;
      } catch (e) {
        console.error(`Failed to fetch token for agent ${agentId}:`, e);
        continue;
      }
      if (!token) {
        console.warn(`No FCM token for agent ${agentId} — skipping task reminder for "${taskTitle}"`);
        continue;
      }

      const dayText =
        daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
      const notifTitle = "Task Reminder";
      const notifBody = `"${taskTitle}" is due ${dayText}`;

      const message = {
        token,
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
      };

      try {
        await getMessaging().send(message);
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
