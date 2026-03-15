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
 * Returns a Map of "summary|date" → eventId.
 */
async function getExistingMGSREvents(
  calendarId: string,
  token: string,
  minDate: string,
  maxDate: string
): Promise<Map<string, string>> {
  const params = new URLSearchParams({
    q: EVENT_PREFIX,
    timeMin: `${minDate}T00:00:00Z`,
    timeMax: `${maxDate}T23:59:59Z`,
    singleEvents: 'true',
    maxResults: '500',
  });

  const result = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    token
  );

  const map = new Map<string, string>();
  for (const ev of (result.items || []) as CalendarEvent[]) {
    if (ev.summary?.startsWith(EVENT_PREFIX) && ev.start?.date) {
      map.set(`${ev.summary}|${ev.start.date}`, ev.id!);
    }
  }
  return map;
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

  // Determine date range for duplicate check
  const dates = syncable.map((t) => t.dueDate!);
  const minDate = formatDateYMD(Math.min(...dates));
  const maxDate = formatDateYMD(Math.max(...dates));

  // Fetch existing events to prevent duplicates
  const existing = await getExistingMGSREvents(calendarId, token, minDate, maxDate);

  let created = 0;
  let skipped = 0;

  for (const task of syncable) {
    const dateStr = formatDateYMD(task.dueDate!);
    const summary = taskToEventSummary(task);
    const key = `${summary}|${dateStr}`;

    if (existing.has(key)) {
      skipped++;
      continue;
    }

    await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, token, {
      method: 'POST',
      body: JSON.stringify({
        summary,
        description: taskToEventDescription(task),
        start: { date: dateStr },
        end: { date: dateStr },
        colorId: priorityToColorId(task.priority),
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: 540 }], // 9 hours = morning of due date
        },
        transparency: 'transparent', // won't block time (show as "free")
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
