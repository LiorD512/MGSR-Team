import type { Level, Opportunity, Tier, Verification } from './client';
import type { RadarT } from './i18n';
import type { Situation } from './situations';

export const H = 3_600_000;
export const DAY = 86_400_000;

export const SITUATION_COLOR: Record<Situation, string> = {
  wants_leave: 'rx-c-gold', club_sell: 'rx-c-gold', released: 'rx-c-gold', terminate: 'rx-c-gold', loan: 'rx-c-blue',
  out_squad: 'rx-c-amber', conflict: 'rx-c-amber', unpaid: 'rx-c-amber', moved: 'rx-c-red', other: 'rx-c-grey',
};
/** Situation chips shown in the filter bar, in this order (only those present in the data appear). */
export const FILTER_SITUATIONS: Situation[] = ['wants_leave', 'club_sell', 'released', 'terminate', 'loan', 'conflict', 'out_squad', 'unpaid'];

export const TIER_DOTS: Record<Tier, number> = { A: 4, B: 3, C: 2, D: 1 };
export const TIER_ORDER: Record<Tier, number> = { A: 0, B: 1, C: 2, D: 3 };

/** The engine's English action sentences -> translation keys (anything unknown is shown as written). */
export const ACTION_KEYS: Record<string, string> = {
  'Verify with a local contact today, then approach the agent.': 'act_verify',
  'Single report: verify with a local contact before outreach.': 'act_single',
  'Ask the club or agent about loan terms; verify before outreach.': 'act_loan',
  'Rumor only: verify before any outreach.': 'act_rumor',
  'Do not contact: later reports say the move is agreed or announced. Keep archived; re-open only if it collapses.': 'act_closed',
  'Watch: wait for a second independent source.': 'act_watch',
  "Contact the player's agent now.": 'act_contact',
  'Approach now: contract ends within 6 months (free-agent route).': 'act_free',
};

export const levelOf = (score: number, closed: boolean): Level =>
  closed ? 'Closed' : score >= 85 ? 'Exceptional' : score >= 70 ? 'High priority' : score >= 50 ? 'Potential' : score >= 30 ? 'Monitor' : 'Low priority';

export function ago(t: RadarT, ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '-';
  const m = Math.max(0, (now - ts) / 60_000);
  if (m < 60) return m < 1 ? t('lt1') : t('ago_m', { n: Math.round(m) });
  const h = m / 60;
  if (h < 48) return t('ago_h', { n: Math.round(h) });
  return t('ago_d', { n: Math.round(h / 24) });
}

export function fmtDateTime(ts: number, lang: 'en' | 'he'): string {
  return new Date(ts).toLocaleString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
}

export const isEarly = (o: Pick<Opportunity, 'closed' | 'independentOrigins' | 'lastReportAt'>, now = Date.now()) =>
  !o.closed && o.independentOrigins < 2 && now - o.lastReportAt <= 72 * H;
export const isStale = (o: Pick<Opportunity, 'lastReportAt'>, now = Date.now()) => now - o.lastReportAt > 14 * DAY;
export const isHidden = (o: Pick<Opportunity, 'flags'>) => !!o.flags.hidden;
export const evKey = (v: Verification) => (v === 'CONFIRMED' ? 'conf' : v === 'REPORTED' ? 'rep' : 'rum');

/** Club line: "Club · Country" when the country is the club's; otherwise be honest that it is only where the story was published. */
export function placeText(t: RadarT, o: Pick<Opportunity, 'clubName' | 'country' | 'countryIsClub'>, countryLabel: (c: string | null) => string): string {
  const c = o.country ? countryLabel(o.country) : '';
  if (!o.clubName) return o.country ? `${t('club_unknown')} · ${t('reported_in', { c })}` : t('club_unknown');
  if (!o.country) return o.clubName;
  return o.countryIsClub ? `${o.clubName} · ${c}` : `${o.clubName} · ${t('reported_in', { c })}`;
}

export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rule-engine reasons -> plain words for the "rejected automatically" list. */
export function rejectText(t: RadarT, why: string | null | undefined): string {
  const w = why ?? '';
  if (/elite|star/.test(w)) return t('rj_elite');
  if (/no strict|not a transfer/.test(w)) return t('rj_signal');
  if (/implied/.test(w)) return t('rj_implied');
  if (/no named/.test(w)) return t('rj_noname');
  if (/quote/.test(w)) return t('rj_quote');
  if (/national|not a club/.test(w)) return t('rj_nat');
  if (/histor|old/.test(w)) return t('rj_hist');
  if (/completed/.test(w)) return t('rj_done');
  return t('rj_other');
}
