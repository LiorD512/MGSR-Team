/**
 * Pure scoring engine for Level & Focus. No I/O — easy to unit test.
 */
import {
  DEFAULT_LEAGUE_STRENGTH,
  FOCUS_THRESHOLDS,
  LEAGUE_STRENGTH,
  LEVEL_THRESHOLDS,
  LEVEL_WEIGHT,
  POSITION_OFFSETS,
  POSITION_TO_GROUP,
  WEIGHTS,
} from './config';
import type {
  CriterionKey,
  Focus,
  Level,
  NextKind,
  PositionGroup,
  TierCriterion,
  TierSignals,
  TierUrgencyParts,
  Trend,
} from './types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** "€1.5m" / "€500k" -> euros. Mirrors lib/releases.parseMarketValue (kept local to stay dependency-free). */
export function parseValueEuro(value: string | undefined | null): number {
  if (!value || value.includes('-')) return 0;
  const cleaned = value.replace(/[€\s,]/g, '').toLowerCase();
  if (cleaned.includes('k')) return (parseFloat(cleaned.replace('k', '')) || 0) * 1000;
  if (cleaned.includes('m')) return (parseFloat(cleaned.replace('m', '')) || 0) * 1_000_000;
  if (cleaned.includes('bn')) return (parseFloat(cleaned.replace('bn', '')) || 0) * 1_000_000_000;
  return parseFloat(cleaned) || 0;
}

/** Months until the contract ends. Accepts "30.06.2026", "30/06/2026", "2026-06-30", "Jun 30, 2026". */
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
  if (t == null) return null;
  return (t - now) / (30.44 * 24 * 3600 * 1000);
}

export function positionGroupOf(positions: string[] | undefined | null): PositionGroup {
  const first = (positions ?? []).map((p) => String(p).toUpperCase().trim()).find((p) => POSITION_TO_GROUP[p]);
  return first ? POSITION_TO_GROUP[first] : 'MF';
}

export function valueSignal(euro: number): number {
  if (euro <= 0) return 0;
  // €50k -> 0, €15m -> 100 (log scale)
  const lo = Math.log10(50_000);
  const hi = Math.log10(15_000_000);
  return Math.round(clamp(((Math.log10(euro) - lo) / (hi - lo)) * 100, 0, 100));
}

export function leagueSignal(country: string | undefined | null): number {
  const key = String(country ?? '').trim().toLowerCase();
  return LEAGUE_STRENGTH[key] ?? DEFAULT_LEAGUE_STRENGTH;
}

/** FM ability -> 0-100. For players up to 23, potential counts for 30%. */
export function abilitySignal(ca: number | undefined | null, pa: number | undefined | null, age: number | null): number | undefined {
  if (!ca || ca <= 0) return undefined;
  const map = (x: number) => clamp(((x - 60) / 100) * 100, 0, 100);
  const young = age != null && age <= 23 && pa && pa > ca;
  return Math.round(young ? map(ca) * 0.7 + map(pa!) * 0.3 : map(ca));
}

/** Kept for backwards compatibility with earlier callers. */
export function fmSignal(ca: number | undefined | null): number | undefined {
  return abilitySignal(ca, null, null);
}

/** Average match rating (6.2-7.6 useful range) -> 0-100. Needs a minimum of minutes. */
export function outputSignal(rating: number | undefined | null, minutes: number | undefined | null): number | undefined {
  if (!rating || rating <= 0) return undefined;
  if (minutes != null && minutes > 0 && minutes < 450) return undefined;
  const base = clamp(((rating - 6.2) / 1.4) * 100, 0, 100);
  // Very low minutes (but >= 450) slightly discounted: a rating over 600 minutes is less certain than over 2,500.
  const m = minutes ?? 900;
  const reliability = m >= 1500 ? 1 : 0.85 + ((m - 450) / 1050) * 0.15;
  return Math.round(base * reliability);
}

/** League strength blended with club Elo level (1 elite … 4 low) when known. */
export function leagueClubSignal(country: string | undefined | null, eloLevel?: number | null): number {
  const lg = leagueSignal(country);
  if (!eloLevel || eloLevel < 1 || eloLevel > 4) return lg;
  const clubBoost = { 1: 15, 2: 6, 3: 0, 4: -8 }[eloLevel as 1 | 2 | 3 | 4];
  return Math.round(clamp(lg + clubBoost, 0, 100));
}

/** Injury history -> 0-100 availability (100 = always available). */
export function availabilitySignal(i?: { injuryProne?: boolean; daysMissed?: number } | null): number | undefined {
  if (!i || (i.daysMissed == null && i.injuryProne == null)) return undefined;
  const days = i.daysMissed ?? 0;
  let s = 100 - Math.min(70, days / 3);
  if (i.injuryProne) s -= 15;
  return Math.round(clamp(s, 0, 100));
}

/** Market value history -> trend. Compares latest vs. the oldest entry within the last ~14 months. */
export function trendFromHistory(
  history: { value?: string; date?: number }[] | undefined | null,
  now = Date.now()
): { trend: Trend; ratio: number | null } {
  const pts = (history ?? [])
    .map((h) => ({ v: parseValueEuro(h.value), d: Number(h.date) || 0 }))
    .filter((p) => p.v > 0 && p.d > 0)
    .sort((a, b) => a.d - b.d);
  if (pts.length < 2) return { trend: 'flat', ratio: null };
  const latest = pts[pts.length - 1];
  const windowStart = now - 14 * 30.44 * 24 * 3600 * 1000;
  const base = pts.find((p) => p.d >= windowStart) ?? pts[0];
  if (base === latest) return { trend: 'flat', ratio: null };
  const ratio = latest.v / base.v;
  return { trend: ratio >= 1.15 ? 'up' : ratio <= 0.85 ? 'down' : 'flat', ratio };
}

export function weightedScore(s: TierSignals): { score: number; coverage: number } {
  const keys: CriterionKey[] = ['output', 'ability', 'value', 'league', 'availability'];
  let sum = 0;
  let w = 0;
  for (const k of keys) {
    const v = s[k];
    if (v == null) continue;
    sum += v * WEIGHTS[k];
    w += WEIGHTS[k];
  }
  const total = keys.reduce((a, k) => a + WEIGHTS[k], 0);
  return { score: w ? Math.round((sum / w) * 10) / 10 : 0, coverage: w / total };
}

export function criteriaList(s: TierSignals, notes: Partial<Record<CriterionKey, string>>): TierCriterion[] {
  const keys: CriterionKey[] = ['output', 'ability', 'value', 'league', 'availability'];
  return keys.map((k) => ({ key: k, weight: WEIGHTS[k], score: s[k] ?? null, ...(notes[k] ? { note: notes[k] } : {}) }));
}

export function levelFromScore(score: number, group: PositionGroup): Level {
  const o = POSITION_OFFSETS[group] ?? 0;
  if (score >= LEVEL_THRESHOLDS[1] + o) return 1;
  if (score >= LEVEL_THRESHOLDS[2] + o) return 2;
  if (score >= LEVEL_THRESHOLDS[3] + o) return 3;
  if (score >= LEVEL_THRESHOLDS[4] + o) return 4;
  return 5;
}

export interface UrgencyInput {
  contractMonths: number | null;
  mandateDays: number | null;
  matchingRequests: number;
  daysSinceTouch: number;
  trend: Trend;
}

export function computeUrgency(i: UrgencyInput): { urgency: number; parts: TierUrgencyParts; next: { kind: NextKind; value?: number } } {
  const c = i.contractMonths;
  const contractTime = c == null ? 20 : c <= 4 ? 95 : c <= 7 ? 80 : c <= 12 ? 55 : 20;
  const m = i.mandateDays;
  const mandateTime = m == null ? 0 : m <= 7 ? 100 : m <= 30 ? 75 : m <= 60 ? 40 : 0;
  const time = Math.max(contractTime, mandateTime);
  const demand = Math.min(100, i.matchingRequests * 30);
  const gap = Math.min(100, i.daysSinceTouch * 3);
  const momentum = i.trend === 'up' ? 80 : i.trend === 'down' ? 30 : 50;
  const urgency = Math.round(0.38 * time + 0.27 * demand + 0.17 * gap + 0.18 * momentum);

  // "Next" = the single most relevant reason to act, in priority order.
  let next: { kind: NextKind; value?: number } = { kind: 'none' };
  if (m != null && m <= 30) next = { kind: 'mandate', value: Math.max(0, Math.round(m)) };
  else if (c != null && c <= 12) next = { kind: 'contract', value: Math.max(0, Math.round(c)) };
  else if (i.matchingRequests > 0) next = { kind: 'requests', value: i.matchingRequests };
  else if (i.daysSinceTouch >= 14) next = { kind: 'untouched', value: Math.round(i.daysSinceTouch) };
  return { urgency, parts: { time, demand, gap, momentum }, next };
}

export function focusFrom(urgency: number, level: Level): Focus {
  const v = urgency * 0.7 + LEVEL_WEIGHT[level] * 100 * 0.3;
  if (v >= FOCUS_THRESHOLDS.push) return 1;
  if (v >= FOCUS_THRESHOLDS.active) return 2;
  if (v >= FOCUS_THRESHOLDS.maintain) return 3;
  return 4;
}

/** Breaking news can move Focus by at most one step (+1 = push harder). */
export function applyFocusAdj(base: Focus, adj: -1 | 0 | 1): Focus {
  return Math.max(1, Math.min(4, base - adj)) as Focus;
}

/** Small, stable hash of the facts the analyst sees (djb2). */
export function hashFacts(o: unknown): string {
  const s = JSON.stringify(o);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** 0-100. Lower when data is thin or the score sits right on a threshold. */
export function confidenceFrom(coverage: number, score: number, group: PositionGroup): number {
  const o = POSITION_OFFSETS[group] ?? 0;
  const lines = [1, 2, 3, 4].map((k) => LEVEL_THRESHOLDS[k as 1 | 2 | 3 | 4] + o);
  const dist = Math.min(...lines.map((l) => Math.abs(score - l)));
  const edge = clamp(dist / 6, 0, 1); // 0 = on a line, 1 = ≥6 pts away
  return Math.round(20 + coverage * 50 + edge * 30);
}

/** Does a club request (position code + optional age range) match this player? */
export function requestMatches(
  req: { position?: string; minAge?: number; maxAge?: number; ageDoesntMatter?: boolean },
  player: { positions?: string[]; age?: number | null }
): boolean {
  const rp = String(req.position ?? '').toUpperCase().trim();
  if (!rp) return false;
  const pos = (player.positions ?? []).map((p) => String(p).toUpperCase().trim());
  const near: Record<string, string[]> = { ST: ['ST', 'CF', 'SS'], CF: ['CF', 'ST', 'SS'], SS: ['SS', 'CF', 'ST'] };
  const accepted = near[rp] ?? [rp];
  if (!pos.some((p) => accepted.includes(p))) return false;
  if (!req.ageDoesntMatter && player.age != null) {
    if (typeof req.minAge === 'number' && req.minAge > 0 && player.age < req.minAge) return false;
    if (typeof req.maxAge === 'number' && req.maxAge > 0 && player.age > req.maxAge) return false;
  }
  return true;
}
