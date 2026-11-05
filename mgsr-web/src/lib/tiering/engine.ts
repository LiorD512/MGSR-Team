/**
 * Pure signal detection for Roster Intelligence. No I/O — unit-testable.
 *
 * Compares this week's snapshot against the most recent snapshot inside the look-back window and
 * emits Signals with real numbers. Week 1 (no prior snapshot) falls back to absolute standouts.
 */
import { SIGNALS } from './config';
import type { Signal, StatsSnapshot } from './types';

const DAY = 24 * 3600 * 1000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** "€1.5m" / "€500k" → euros. */
export function parseValueEuro(value: string | undefined | null): number {
  if (!value || value.includes('-')) return 0;
  const c = value.replace(/[€\s,]/g, '').toLowerCase();
  if (c.includes('k')) return (parseFloat(c) || 0) * 1_000;
  if (c.includes('m')) return (parseFloat(c) || 0) * 1_000_000;
  if (c.includes('bn')) return (parseFloat(c) || 0) * 1_000_000_000;
  return parseFloat(c) || 0;
}

/** Months until contract end. Accepts "30.06.2026", "2026-06-30", "Jun 30, 2026". */
export function contractMonthsLeft(raw: string | undefined | null, now = Date.now()): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s === '-' || s === '—') return null;
  let t: number | null = null;
  const dmy = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) t = Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]);
  else {
    const p = Date.parse(s);
    if (!Number.isNaN(p)) t = p;
  }
  return t == null ? null : (t - now) / (30.44 * DAY);
}

export interface SignalContext {
  now: number;
  current: StatsSnapshot;
  history: StatsSnapshot[]; // prior snapshots, oldest→newest (NOT including current)
  contractMonths: number | null;
  mandateDays: number | null;
  matchingRequests: number;
  clubCountry?: string;
}

/** The most recent prior snapshot within the look-back window, else the latest prior one. */
function previous(history: StatsSnapshot[], now: number): StatsSnapshot | null {
  if (!history.length) return null;
  const cutoff = now - SIGNALS.lookbackDays * DAY;
  const within = history.filter((h) => h.at >= cutoff);
  return (within.length ? within[0] : history[history.length - 1]) ?? null;
}

const num = (v: number | undefined) => (typeof v === 'number' && !Number.isNaN(v) ? v : undefined);

export function detectSignals(ctx: SignalContext): Signal[] {
  const c = ctx.current;
  const prev = previous(ctx.history, ctx.now);
  const out: Signal[] = [];
  const S = SIGNALS;

  /* ---- time-based (always available, from the player doc) ---- */
  if (ctx.mandateDays != null && ctx.mandateDays <= S.mandateDays) {
    const d = Math.max(0, Math.round(ctx.mandateDays));
    out.push({ kind: 'mandate_clock', tone: 'negative', strength: d <= 7 ? 95 : 80,
      en: d === 0 ? 'Mandate expires today' : `Mandate expires in ${d} days`, he: d === 0 ? 'המנדט פג היום' : `המנדט פג בעוד ${d} ימים` });
  }
  if (ctx.contractMonths != null && ctx.contractMonths <= S.contractMonths) {
    const m = Math.max(0, Math.round(ctx.contractMonths));
    out.push({ kind: 'contract_clock', tone: 'watch', strength: m <= 3 ? 78 : 62,
      en: m <= 0 ? 'Contract ending — free agent soon' : `Contract ends in ${m} months`, he: m <= 0 ? 'החוזה נגמר — שחקן חופשי בקרוב' : `החוזה מסתיים בעוד ${m} חודשים` });
  }

  /* ---- market value move (from snapshot values) ---- */
  const curVal = num(c.valueEuro);
  const prevVal = num(prev?.valueEuro);
  if (curVal && prevVal && prevVal > 0) {
    const pct = (curVal - prevVal) / prevVal;
    if (pct >= S.valueMovePct)
      out.push({ kind: 'value_jump', tone: 'positive', strength: clamp(55 + pct * 100, 55, 90),
        en: `Market value up ${Math.round(pct * 100)}%`, he: `שווי השוק עלה ${Math.round(pct * 100)}%`,
        detailEn: `${fmtVal(prevVal)} → ${fmtVal(curVal)}`, detailHe: `${fmtVal(prevVal)} → ${fmtVal(curVal)}` });
    else if (pct <= -S.valueMovePct)
      out.push({ kind: 'value_drop', tone: 'watch', strength: clamp(50 + Math.abs(pct) * 100, 50, 85),
        en: `Market value down ${Math.round(Math.abs(pct) * 100)}%`, he: `שווי השוק ירד ${Math.round(Math.abs(pct) * 100)}%`,
        detailEn: `${fmtVal(prevVal)} → ${fmtVal(curVal)}`, detailHe: `${fmtVal(prevVal)} → ${fmtVal(curVal)}` });
  }

  if (prev) {
    /* ---- week-over-week deltas (the core intelligence) ---- */
    const curRating = num(c.rating);
    const prevRating = num(prev.rating);
    const curMin = num(c.minutes) ?? 0;
    const prevMin = num(prev.minutes) ?? 0;
    const curStarts = num(c.lineups) ?? 0;
    const prevStarts = num(prev.lineups) ?? 0;
    const curGA = (num(c.goals) ?? 0) + (num(c.assists) ?? 0);
    const prevGA = (num(prev.goals) ?? 0) + (num(prev.assists) ?? 0);
    const extraMin = curMin - prevMin;
    const extraStarts = curStarts - prevStarts;

    // Form (rating only meaningful with enough minutes)
    if (curRating && prevRating && curMin >= S.minMinutesForForm) {
      const diff = curRating - prevRating;
      if (diff >= S.hotForm.minRatingRise)
        out.push({ kind: 'hot_form', tone: 'positive', strength: clamp(50 + diff * 120, 50, 95),
          en: `In form — rating up to ${r1(curRating)}`, he: `בכושר — הדירוג עלה ל-${r1(curRating)}`,
          detailEn: `was ${r1(prevRating)} a few weeks ago`, detailHe: `היה ${r1(prevRating)} לפני מספר שבועות` });
      else if (diff <= -S.coldForm.minRatingFall)
        out.push({ kind: 'cold_form', tone: 'negative', strength: clamp(45 + Math.abs(diff) * 120, 45, 90),
          en: `Form dipping — rating down to ${r1(curRating)}`, he: `ירידה בכושר — הדירוג ירד ל-${r1(curRating)}`,
          detailEn: `was ${r1(prevRating)}`, detailHe: `היה ${r1(prevRating)}` });
    }

    // Breaking in — SUDDENLY playing (was fringe and now featuring, or gained a start from a low base).
    const wasFringe = prevMin < 900;
    if ((extraStarts >= S.breakingIn.minExtraStarts && wasFringe) || (wasFringe && extraMin >= S.breakingIn.minExtraMinutes)) {
      out.push({ kind: 'breaking_in', tone: 'positive', strength: clamp(58 + extraStarts * 10 + extraMin / 30, 58, 92),
        en: extraStarts >= 1 ? `Breaking in — +${extraStarts} start${extraStarts > 1 ? 's' : ''}` : 'Getting minutes after barely featuring',
        he: extraStarts >= 1 ? `נכנס להרכב — +${extraStarts} פתיחות` : 'מקבל דקות אחרי תקופה בחוץ',
        detailEn: `+${Math.round(extraMin)} min since last check`, detailHe: `+${Math.round(extraMin)} דקות מאז הבדיקה האחרונה` });
    }

    // Losing place — was active, now stalled across the look-back (team kept playing, he didn't add minutes)
    const weeksSpan = (c.at - prev.at) / (7 * DAY);
    if (prevMin > 300 && extraMin <= S.losingPlace.maxExtraMinutes && weeksSpan >= S.losingPlace.stalledWeeks) {
      out.push({ kind: 'losing_place', tone: 'negative', strength: clamp(60 + weeksSpan * 4, 60, 94),
        en: 'Fallen out of the side — no new minutes',
        he: 'יצא מההרכב — אין דקות חדשות',
        detailEn: `~${Math.round(weeksSpan)} weeks without added minutes`, detailHe: `~${Math.round(weeksSpan)} שבועות ללא תוספת דקות` });
    }

    // Output surge
    if (curGA - prevGA >= S.outputSurge.minExtraGA)
      out.push({ kind: 'output_surge', tone: 'positive', strength: clamp(55 + (curGA - prevGA) * 12, 55, 90),
        en: `Scoring/assisting — +${curGA - prevGA} G+A`, he: `כובש/מבשל — +${curGA - prevGA} ש+ב`,
        detailEn: `${prevGA} → ${curGA} this season`, detailHe: `${prevGA} → ${curGA} העונה` });
  } else {
    /* ---- week 1: no history → absolute standouts worth not missing ---- */
    const rating = num(c.rating);
    const minutes = num(c.minutes) ?? 0;
    const ga90 = num(c.gaPer90);
    if (rating && minutes >= S.minMinutesForForm && rating >= S.standoutRating)
      out.push({ kind: 'standout_form', tone: 'positive', strength: clamp(50 + (rating - S.standoutRating) * 80, 50, 88),
        en: `Strong season — ${r1(rating)} rating`, he: `עונה חזקה — דירוג ${r1(rating)}`,
        detailEn: c.league ? `${c.league}` : undefined, detailHe: c.league ? `${c.league}` : undefined });
    if (ga90 && ga90 >= S.standoutGaPer90)
      out.push({ kind: 'standout_output', tone: 'positive', strength: clamp(50 + (ga90 - S.standoutGaPer90) * 60, 50, 86),
        en: `High output — ${r1(ga90)} G+A per 90`, he: `תפוקה גבוהה — ${r1(ga90)} ש+ב ל-90` });
    if (minutes >= S.heavyLoadMinutes)
      out.push({ kind: 'heavy_load', tone: 'watch', strength: clamp(45 + (minutes - S.heavyLoadMinutes) / 40, 45, 80),
        en: `Key player — ${minutes.toLocaleString('en-US')} minutes this season`, he: `שחקן מפתח — ${minutes.toLocaleString('en-US')} דקות העונה` });
  }

  return out.sort((a, b) => b.strength - a.strength);
}

function fmtVal(euro: number): string {
  if (euro >= 1_000_000) return `€${r1(euro / 1_000_000)}M`;
  if (euro >= 1_000) return `€${Math.round(euro / 1_000)}k`;
  return `€${euro}`;
}

/** Build the per-player snapshot from a scout-server /player_stats response. */
export function snapshotFromStats(now: number, s: Record<string, unknown> | null, valueEuro: number): StatsSnapshot {
  const n = (k: string) => {
    const v = Number(s?.[k]);
    return Number.isFinite(v) && v !== 0 ? v : undefined;
  };
  return {
    at: now,
    season: n('api_season'),
    league: typeof s?.api_league === 'string' ? (s!.api_league as string) : undefined,
    team: typeof s?.api_team === 'string' ? (s!.api_team as string) : undefined,
    position: typeof s?.api_position === 'string' ? (s!.api_position as string) : undefined,
    rating: n('api_rating'),
    minutes: n('api_minutes'),
    nineties: n('api_minutes_90s'),
    appearances: n('api_appearances'),
    lineups: n('api_lineups'),
    goals: n('api_goals'),
    assists: n('api_assists'),
    goalsPer90: n('api_goals_per90'),
    assistsPer90: n('api_assists_per90'),
    gaPer90: n('api_goal_contributions_per90'),
    valueEuro: valueEuro || undefined,
  };
}
