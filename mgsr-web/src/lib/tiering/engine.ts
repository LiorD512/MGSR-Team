/**
 * Pure signal detection from a player's recent game-by-game log. No I/O — unit-testable.
 * Games arrive newest-first.
 */
import { SIGNALS } from './config';
import type { FormSummary, RecentGame, Signal, SignalTone } from './types';

const DAY = 24 * 3600 * 1000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** "2 goals, 1 assist" style — goals and assists spelled out separately, never "G+A". */
function goalsAssistsEn(goals: number, assists: number): string {
  const parts: string[] = [];
  if (goals > 0) parts.push(`${goals} ${goals === 1 ? 'goal' : 'goals'}`);
  if (assists > 0) parts.push(`${assists} ${assists === 1 ? 'assist' : 'assists'}`);
  return parts.join(', ') || '0 goals';
}
function goalsAssistsHe(goals: number, assists: number): string {
  const parts: string[] = [];
  if (goals > 0) parts.push(`${goals} ${goals === 1 ? 'שער' : 'שערים'}`);
  if (assists > 0) parts.push(`${assists} ${assists === 1 ? 'בישול' : 'בישולים'}`);
  return parts.join(', ') || '0 שערים';
}

export function parseValueEuro(value: string | undefined | null): number {
  if (!value || value.includes('-')) return 0;
  const c = value.replace(/[€\s,]/g, '').toLowerCase();
  if (c.includes('k')) return (parseFloat(c) || 0) * 1_000;
  if (c.includes('m')) return (parseFloat(c) || 0) * 1_000_000;
  if (c.includes('bn')) return (parseFloat(c) || 0) * 1_000_000_000;
  return parseFloat(c) || 0;
}

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

const isPlayed = (g: RecentGame) => g.minutes >= SIGNALS.minMinutesPlayed || g.state === 'played';

export function summariseForm(games: RecentGame[]): FormSummary {
  const w = games.slice(0, SIGNALS.window);
  const played = w.filter(isPlayed);
  const grades = w.map((g) => g.grade).filter((x): x is number => typeof x === 'number');
  const avgGrade = grades.length ? r1(grades.reduce((a, b) => a + b, 0) / grades.length) : null;
  // sparkline: use grades only if most games have one (consistent scale), else minutes-share for all.
  const last6 = w.slice(0, 6).reverse();
  const gradeCoverage = last6.filter((g) => g.grade != null).length;
  const spark =
    gradeCoverage >= Math.ceil(last6.length * 0.6)
      ? last6.map((g) => (g.grade != null ? g.grade : avgGrade ?? 6.5))
      : last6.map((g) => Math.min(1, g.minutes / 90));
  return {
    games: w.length,
    played: played.length,
    starts: w.filter((g) => g.started).length,
    minutes: w.reduce((a, g) => a + g.minutes, 0),
    goals: w.reduce((a, g) => a + g.goals, 0),
    assists: w.reduce((a, g) => a + g.assists, 0),
    avgGrade,
    lastDate: w[0]?.date,
    spark,
  };
}

export interface SignalContext {
  now: number;
  games: RecentGame[]; // newest first
  value: { curEuro: number; prevEuro: number | null };
  contractMonths: number | null;
  mandateDays: number | null;
}

export function detectSignals(ctx: SignalContext): Signal[] {
  const out: Signal[] = [];
  const S = SIGNALS;
  const games = ctx.games.slice(0, S.window);
  const streak = games.slice(0, S.recentForStreak);

  /* ---- time clocks (always available) ---- */
  if (ctx.mandateDays != null && ctx.mandateDays <= S.mandateDays) {
    const d = Math.max(0, Math.round(ctx.mandateDays));
    out.push({ kind: 'mandate_clock', tone: 'negative', strength: d <= 7 ? 95 : 80,
      en: d === 0 ? 'Mandate expires today' : `Mandate expires in ${d} days`, he: d === 0 ? 'המנדט פג היום' : `המנדט פג בעוד ${d} ימים` });
  }
  if (ctx.contractMonths != null && ctx.contractMonths <= S.contractMonths) {
    const m = Math.max(0, Math.round(ctx.contractMonths));
    out.push({ kind: 'contract_clock', tone: 'watch', strength: m <= 3 ? 78 : 60,
      en: m <= 0 ? 'Contract ending — free agent soon' : `Contract ends in ${m} months`, he: m <= 0 ? 'החוזה נגמר — שחקן חופשי בקרוב' : `החוזה מסתיים בעוד ${m} חודשים` });
  }

  /* ---- value move ---- */
  const { curEuro, prevEuro } = ctx.value;
  if (curEuro && prevEuro && prevEuro > 0) {
    const pct = (curEuro - prevEuro) / prevEuro;
    if (pct >= S.valueMovePct)
      out.push({ kind: 'value_jump', tone: 'positive', strength: clamp(55 + pct * 100, 55, 90), en: `Market value up ${Math.round(pct * 100)}%`, he: `שווי השוק עלה ${Math.round(pct * 100)}%` });
    else if (pct <= -S.valueMovePct)
      out.push({ kind: 'value_drop', tone: 'watch', strength: clamp(50 + Math.abs(pct) * 100, 50, 85), en: `Market value down ${Math.round(Math.abs(pct) * 100)}%`, he: `שווי השוק ירד ${Math.round(Math.abs(pct) * 100)}%` });
  }

  if (games.length) {
    const played = games.filter(isPlayed);
    const recentNotInSquad = streak.filter((g) => /not in squad/i.test(g.state)).length;
    const recentBenched = streak.filter((g) => !isPlayed(g) && /in squad/i.test(g.state) && !/not in squad/i.test(g.state)).length;
    const recentStarts = streak.filter((g) => g.started).length;
    const olderStarts = games.slice(S.recentForStreak).filter((g) => g.started).length;
    const streakGoals = streak.reduce((a, g) => a + g.goals, 0);
    const streakAssists = streak.reduce((a, g) => a + g.assists, 0);
    const streakGA = streakGoals + streakAssists;
    const streakGrades = streak.map((g) => g.grade).filter((x): x is number => typeof x === 'number');
    const streakAvgGrade = streakGrades.length ? streakGrades.reduce((a, b) => a + b, 0) / streakGrades.length : null;

    /* dropped from the squad — was playing, now out */
    if (recentNotInSquad >= S.droppedRecent && olderStarts + played.length > recentNotInSquad) {
      out.push({ kind: 'dropped_squad', tone: 'negative', strength: clamp(70 + recentNotInSquad * 8, 70, 96),
        en: `Out of the squad — last ${recentNotInSquad} ${recentNotInSquad === 1 ? 'game' : 'games'}`, he: `מחוץ לסגל — ${recentNotInSquad} ${recentNotInSquad === 1 ? 'משחק אחרון' : 'משחקים אחרונים'}`,
        detailEn: 'was in the team before', detailHe: 'היה בהרכב קודם' });
    } else if (recentBenched >= S.benchedRecent) {
      /* benched — in the squad but not playing */
      out.push({ kind: 'benched', tone: 'negative', strength: clamp(60 + recentBenched * 6, 60, 88),
        en: `On the bench — 0 minutes in the last ${recentBenched} ${recentBenched === 1 ? 'game' : 'games'}`, he: `על הספסל — 0 דקות ב-${recentBenched} ${recentBenched === 1 ? 'משחק אחרון' : 'משחקים אחרונים'}` });
    }

    /* breaking in — became a starter */
    if (recentStarts >= S.startsForBreakingIn && olderStarts === 0 && games.length > S.recentForStreak) {
      out.push({ kind: 'breaking_in', tone: 'positive', strength: clamp(60 + recentStarts * 9, 60, 92),
        en: `Breaking into the XI — ${recentStarts} recent ${recentStarts === 1 ? 'start' : 'starts'}`, he: `נכנס להרכב — ${recentStarts} ${recentStarts === 1 ? 'פתיחה אחרונה' : 'פתיחות אחרונות'}`,
        detailEn: 'was not starting before', detailHe: 'לא פתח קודם' });
    }

    /* hot form — playing well */
    if (
      played.length >= 2 &&
      ((streakAvgGrade != null && streakAvgGrade >= S.hotMinGrade) || streakGA >= S.hotMinGAStreak)
    ) {
      const enBits = [streakGA > 0 ? goalsAssistsEn(streakGoals, streakAssists) : '', streakAvgGrade != null ? `avg rating ${r1(streakAvgGrade)}` : ''].filter(Boolean).join(' · ');
      const heBits = [streakGA > 0 ? goalsAssistsHe(streakGoals, streakAssists) : '', streakAvgGrade != null ? `ציון ממוצע ${r1(streakAvgGrade)}` : ''].filter(Boolean).join(' · ');
      out.push({ kind: 'hot_form', tone: 'positive', strength: clamp(60 + streakGA * 8 + (streakAvgGrade ? (streakAvgGrade - S.hotMinGrade) * 40 : 0), 60, 97),
        en: `In form — ${enBits} in the last ${streak.length} games`, he: `בכושר — ${heBits} ב-${streak.length} המשחקים האחרונים` });
    } else if (streakAvgGrade != null && streakAvgGrade <= S.coldMaxGrade && played.length >= 2) {
      /* cold form — playing but poor */
      out.push({ kind: 'cold_form', tone: 'negative', strength: clamp(55 + (S.coldMaxGrade - streakAvgGrade) * 40, 55, 88),
        en: `Form dip — avg rating ${r1(streakAvgGrade)} in the last ${streak.length} games`, he: `ירידה בכושר — ציון ממוצע ${r1(streakAvgGrade)} ב-${streak.length} המשחקים האחרונים` });
    }

    /* output surge (separate from hot form so it shows even without grades) */
    if (streakGA >= S.outputSurgeGA && !out.some((s) => s.kind === 'hot_form')) {
      out.push({ kind: 'output_surge', tone: 'positive', strength: clamp(58 + streakGA * 9, 58, 90),
        en: `${goalsAssistsEn(streakGoals, streakAssists)} in the last ${streak.length} games`, he: `${goalsAssistsHe(streakGoals, streakAssists)} ב-${streak.length} המשחקים האחרונים` });
    }

    /* back from injury — an injured gap then a return */
    const firstPlayedIdx = games.findIndex(isPlayed);
    const hadInjuryGap = games.some((g) => g.injured);
    if (firstPlayedIdx === 0 && hadInjuryGap && games.slice(1, 4).some((g) => g.injured || !isPlayed(g))) {
      out.push({ kind: 'back_from_injury', tone: 'positive', strength: 66,
        en: 'Back in action after an absence', he: 'חזר לפעילות אחרי היעדרות',
        detailEn: `${games[0].minutes} min last game`, detailHe: `${games[0].minutes} דקות במשחק האחרון` });
    }
  }

  return out.sort((a, b) => b.strength - a.strength);
}
