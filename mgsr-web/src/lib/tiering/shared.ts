/**
 * Push-board logic shared by the worker, the API and the dashboard.
 *   Push now       = players with enough time-critical triggers (and not marked "done" for the same triggers)
 *   Window targets = players an agent marked for the next window
 */
import type { PlayerTierDoc, TierTrigger } from './types';

const DAY = 24 * 3600 * 1000;
export const URGENT_SCORE = 3;
export const HANDLED_FOR_MS = 7 * DAY;
export const NEGLECT_DAYS = 14;

export function daysSinceTouch(d: PlayerTierDoc, now = Date.now()): number | null {
  const t = d.effort?.lastTouchAt;
  return t ? Math.floor((now - t) / DAY) : null;
}

/** Worker triggers + the live "window target is being neglected" trigger. */
export function liveTriggers(d: PlayerTierDoc, now = Date.now()): TierTrigger[] {
  const list = [...(d.ai?.triggers ?? [])];
  if (d.windowTarget) {
    const days = daysSinceTouch(d, now);
    // Count from the later of last contact and the day he was marked — marking someone isn't "neglect".
    const sinceMarked = Math.floor((now - d.windowTarget.at) / DAY);
    const since = days == null ? sinceMarked : Math.min(days, sinceMarked);
    if (since >= NEGLECT_DAYS) {
      list.push({
        kind: 'neglect',
        severity: 3, // a window target two weeks without contact always lands on Push now
        en: days == null ? `Window target · no contact logged yet` : `Window target · no contact for ${days} days`,
        he: days == null ? `יעד לחלון · עוד לא נרשם קשר` : `יעד לחלון · ${days} ימים ללא קשר`,
      });
    }
  }
  return list.sort((a, b) => b.severity - a.severity || (a.deadline ?? '9').localeCompare(b.deadline ?? '9'));
}

export function urgentScore(d: PlayerTierDoc, now = Date.now()): number {
  return liveTriggers(d, now).reduce((s, t) => s + t.severity, 0);
}

/** Stable key of the current reasons — "done" stays done until this changes. */
export function triggerKey(d: PlayerTierDoc, now = Date.now()): string {
  return liveTriggers(d, now)
    .filter((t) => t.severity >= 2)
    // AI-written reasons (news, plan) are keyed by presence only, so re-worded text doesn't re-open or re-alert.
    .map((t) => (t.kind === 'news' || t.kind === 'plan' ? t.kind : `${t.kind}:${t.deadline ?? ''}:${t.ref ?? ''}`))
    .sort()
    .join('|');
}

export function isHandled(d: PlayerTierDoc, now = Date.now()): boolean {
  const h = d.handled;
  return !!h && h.key === triggerKey(d, now) && now - h.at < HANDLED_FOR_MS;
}

export function isUrgent(d: PlayerTierDoc, now = Date.now()): boolean {
  return !!d.ai && urgentScore(d, now) >= URGENT_SCORE && !isHandled(d, now);
}

/** Earliest hard deadline among the triggers, in days (for sorting and the chip). */
export function daysToDeadline(d: PlayerTierDoc, now = Date.now()): number | null {
  const ds = liveTriggers(d, now)
    .map((t) => (t.deadline ? Date.parse(t.deadline) : NaN))
    .filter((x) => !Number.isNaN(x));
  if (!ds.length) return null;
  return Math.max(0, Math.ceil((Math.min(...ds) - now) / DAY));
}

export function sortUrgent(a: PlayerTierDoc, b: PlayerTierDoc, now = Date.now()): number {
  const s = urgentScore(b, now) - urgentScore(a, now);
  if (s) return s;
  return (daysToDeadline(a, now) ?? 999) - (daysToDeadline(b, now) ?? 999);
}

/** AI-suggested players to mark for the window (not yet marked). */
export function windowSuggestions(docs: PlayerTierDoc[], max = 3): PlayerTierDoc[] {
  return docs
    .filter((d) => !d.windowTarget && (d.ai?.windowFit?.score ?? 0) >= 65)
    .sort((a, b) => (b.ai?.windowFit?.score ?? 0) - (a.ai?.windowFit?.score ?? 0))
    .slice(0, max);
}
