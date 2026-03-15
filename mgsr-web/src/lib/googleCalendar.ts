/**
 * Google Calendar sync for MGSR Tasks.
 * Uses Google Identity Services (GIS) for OAuth and the Calendar REST API.
 * Creates all-day events on a dedicated "MGSR Tasks" calendar.
 */

const SCOPES = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const MGSR_CALENDAR_SUMMARY = 'MGSR Tasks';
const EVENT_PREFIX = '[MGSR]';

interface AgentTaskForSync {
  id: string;
  title?: string;
  notes?: string;
  dueDate?: number;
  isCompleted?: boolean;
  priority?: number;
  agentName?: string;
  playerName?: string;
}

interface CalendarEvent {
  id?: string;
  summary?: string;
  start?: { date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let cachedAccessToken: string | null = null;

/**
 * Initialize the Google OAuth token client.
 * Must be called after the GIS script is loaded.
 */
export function initGoogleAuth(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof google === 'undefined' || !google.accounts?.oauth2) {
      reject(new Error('Google Identity Services not loaded'));
      return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          cachedAccessToken = null;
          reject(new Error(response.error_description || response.error));
        } else {
          cachedAccessToken = response.access_token;
          resolve(response.access_token);
        }
      },
    });

    tokenClient.requestAccessToken();
  });
}

/**
 * Request calendar access — re-uses cached token or prompts.
 */
export async function requestCalendarAccess(clientId: string): Promise<string> {
  if (cachedAccessToken) {
    // Verify token is still valid
    const res = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + cachedAccessToken);
    if (res.ok) return cachedAccessToken;
    cachedAccessToken = null;
  }
  return initGoogleAuth(clientId);
}

async function calendarFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${CALENDAR_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API error ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Find or create the dedicated MGSR Tasks calendar.
 */
async function getOrCreateMGSRCalendar(token: string): Promise<string> {
  // List all calendars
  const list = await calendarFetch('/users/me/calendarList', token);
  const existing = list.items?.find(
    (c: { summary?: string }) => c.summary === MGSR_CALENDAR_SUMMARY
  );
  if (existing) return existing.id;

  // Create new calendar
  const created = await calendarFetch('/calendars', token, {
    method: 'POST',
    body: JSON.stringify({
      summary: MGSR_CALENDAR_SUMMARY,
      description: 'Tasks synced from MGSR Team app',
      timeZone: 'Asia/Jerusalem',
    }),
  });
  return created.id;
}

/**
 * Get existing MGSR events from the calendar to avoid duplicates.
 * Uses extendedProperties.private.mgsrTaskId for reliable matching.
 * Returns a Set of task IDs that already have calendar events.
 */
async function getExistingSyncedTaskIds(
  calendarId: string,
  token: string
): Promise<Set<string>> {
  const params = new URLSearchParams({
    privateExtendedProperty: 'mgsrSource=true',
    maxResults: '2500',
    singleEvents: 'true',
  });

  const result = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    token
  );

  const ids = new Set<string>();
  for (const ev of (result.items || []) as CalendarEvent[]) {
    const taskId = ev.extendedProperties?.private?.mgsrTaskId;
    if (taskId) ids.add(taskId);
  }
  return ids;
}

function formatDateYMD(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function taskToEventSummary(task: AgentTaskForSync): string {
  return `${EVENT_PREFIX} ${task.title || 'Task'}`;
}

function taskToEventDescription(task: AgentTaskForSync): string {
  const parts: string[] = [];
  if (task.playerName) parts.push(`Player: ${task.playerName}`);
  if (task.agentName) parts.push(`Agent: ${task.agentName}`);
  if (task.notes) parts.push(`Notes: ${task.notes}`);
  return parts.join('\n') || '';
}

// Google Calendar colorIds: 1=Lavender, 2=Sage, 7=Peacock(cyan), 9=Blueberry, 11=Tomato(red)
function priorityToColorId(priority?: number): string {
  if (priority === 2) return '11'; // red for high priority
  if (priority === 1) return '6';  // tangerine for medium
  return '7'; // cyan/peacock for normal
}

export interface SyncResult {
  created: number;
  skipped: number;
  total: number;
  calendarName: string;
}

/**
 * Sync incomplete tasks with due dates to Google Calendar.
 * Creates all-day events. Skips tasks already synced (duplicate prevention).
 */
export async function syncTasksToCalendar(
  tasks: AgentTaskForSync[],
  token: string
): Promise<SyncResult> {
  // Filter: only incomplete tasks with a dueDate
  const syncable = tasks.filter((t) => !t.isCompleted && t.dueDate && t.dueDate > 0);

  if (syncable.length === 0) {
    return { created: 0, skipped: 0, total: 0, calendarName: MGSR_CALENDAR_SUMMARY };
  }

  // Get or create the dedicated calendar
  const calendarId = await getOrCreateMGSRCalendar(token);

  // Fetch existing synced task IDs to prevent duplicates
  const existingIds = await getExistingSyncedTaskIds(calendarId, token);

  let created = 0;
  let skipped = 0;

  for (const task of syncable) {
    if (existingIds.has(task.id)) {
      skipped++;
      continue;
    }

    const dateStr = formatDateYMD(task.dueDate!);
    const summary = taskToEventSummary(task);
    // All-day events: end date must be the NEXT day (exclusive)
    const endDate = new Date(task.dueDate!);
    endDate.setDate(endDate.getDate() + 1);
    const endDateStr = formatDateYMD(endDate.getTime());

    await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, token, {
      method: 'POST',
      body: JSON.stringify({
        summary,
        description: taskToEventDescription(task),
        start: { date: dateStr },
        end: { date: endDateStr },
        colorId: priorityToColorId(task.priority),
        extendedProperties: {
          private: {
            mgsrTaskId: task.id,
            mgsrSource: 'true',
          },
        },
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 540 }],
        },
        transparency: 'transparent',
      }),
    });
    created++;
  }

  return {
    created,
    skipped,
    total: syncable.length,
    calendarName: MGSR_CALENDAR_SUMMARY,
  };
}
