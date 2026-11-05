/**
 * Pure maths for Roster Intelligence. No I/O — unit-testable.
 *
 * Pipeline: signals → quality score → fit (tier + role + ceiling) → urgency → saleability → worth.
 */
import {
  DEFAULT_LEAGUE_STRENGTH,
  LEAGUE_STRENGTH,
  POSITION_OFFSETS,
  POSITION_TO_GROUP,
  PUSH_THRESHOLDS,
  TIER_THRESHOLDS,
  URGENCY_WEIGHTS,
  WEIGHTS,
  WORTH_WEIGHTS,
} from './config';
import type {
  CriterionKey,
  FitPrediction,
  PositionGroup,
  Push,
  Role,
  Tier,
  TierCriterion,
  TierSignals,
  Trend,
  UrgencyParts,
} from './types';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const round = (v: number) => Math.round(v);

/** "€1.5m" / "€500k" -> euros. */
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
  const lo = Math.log10(50_000); // €50k -> 0
  const hi = Math.log10(15_000_000); // €15m -> 100
  return round(clamp(((Math.log10(euro) - lo) / (hi - lo)) * 100, 0, 100));
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
  return round(young ? map(ca) * 0.7 + map(pa!) * 0.3 : map(ca));
}

/** Average match rating (6.2-7.6 useful range) -> 0-100. Needs a minimum of minutes. */
export function outputSignal(rating: number | undefined | null, minutes: number | undefined | null): number | undefined {
  if (!rating || rating <= 0) return undefined;
  if (minutes != null && minutes > 0 && minutes < 450) return undefined;
  const base = clamp(((rating - 6.2) / 1.4) * 100, 0, 100);
  const m = minutes ?? 900;
  const reliability = m >= 1500 ? 1 : 0.85 + ((m - 450) / 1050) * 0.15;
  return round(base * reliability);
}

/** League strength blended with club Elo level (1 elite … 4 low) when known. */
export function leagueClubSignal(country: string | undefined | null, eloLevel?: number | null): number {
  const lg = leagueSignal(country);
  if (!eloLevel || eloLevel < 1 || eloLevel > 4) return lg;
  const clubBoost = { 1: 15, 2: 6, 3: 0, 4: -8 }[eloLevel as 1 | 2 | 3 | 4];
  return round(clamp(lg + clubBoost, 0, 100));
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

/* ───────────────────────── quality score ───────────────────────── */

export function weightedScore(s: TierSignals): { score: number; coverage: number } {
  const keys: CriterionKey[] = ['output', 'ability', 'value', 'league'];
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
  const keys: CriterionKey[] = ['output', 'ability', 'value', 'league'];
  return keys.map((k) => ({ key: k, weight: WEIGHTS[k], score: s[k] ?? null, ...(notes[k] ? { note: notes[k] } : {}) }));
}

export function tierFromScore(score: number, group: PositionGroup): Tier {
  const o = POSITION_OFFSETS[group] ?? 0;
  if (score >= TIER_THRESHOLDS[1] + o) return 1;
  if (score >= TIER_THRESHOLDS[2] + o) return 2;
  if (score >= TIER_THRESHOLDS[3] + o) return 3;
  if (score >= TIER_THRESHOLDS[4] + o) return 4;
  return 5;
}

/* ───────────────────────── fit prediction ───────────────────────── */

const betterTier = (t: Tier, steps: number): Tier => clamp(t - steps, 1, 5) as Tier;

export interface FitInput {
  score: number;
  coverage: number;
  group: PositionGroup;
  age: number | null;
  minutes?: number;
  trend: Trend;
  abilityGap?: number; // FM PA - CA, if known
}

/**
 * Predict which tier + role the player fits, and a realistic ceiling.
 *  - Role from how far into the band the score sits (and minutes, when known).
 *  - Ceiling lifts one tier for young, rising players with FM upside.
 *  - Confidence from data coverage, distance from a tier line, and minutes.
 */
export function predictFit(i: FitInput): Omit<FitPrediction, 'labelEn' | 'labelHe'> {
  const tier = tierFromScore(i.score, i.group);
  const o = POSITION_OFFSETS[i.group] ?? 0;
  const lines = [TIER_THRESHOLDS[1] + o, TIER_THRESHOLDS[2] + o, TIER_THRESHOLDS[3] + o, TIER_THRESHOLDS[4] + o];

  // Position within the tier band (0 bottom … 1 top)
  const hi = tier === 1 ? 100 : lines[tier - 2];
  const lo = tier >= 5 ? 0 : lines[tier - 1];
  const within = hi > lo ? clamp((i.score - lo) / (hi - lo), 0, 1) : 0.5;

  let role: Role = within >= 0.6 ? 'starter' : within >= 0.3 ? 'rotation' : 'squad';
  if (i.minutes != null) {
    if (i.minutes >= 1800 && role === 'squad') role = 'rotation';
    if (i.minutes < 600 && role === 'starter') role = 'rotation';
  }

  // Ceiling: young + rising + FM upside can project one tier higher.
  let ceiling: Tier = tier;
  const young = i.age != null && i.age <= 23;
  const upside = (i.abilityGap ?? 0) >= 12 || (young && i.trend === 'up');
  if (young && upside) ceiling = betterTier(tier, 1);
  else if (i.trend === 'up' && within >= 0.8) ceiling = betterTier(tier, 1);
  if (i.age != null && i.age >= 31 && i.trend === 'down') ceiling = tier; // no ceiling lift for declining veterans

  const dist = Math.min(...lines.map((l) => Math.abs(i.score - l)));
  const edge = clamp(dist / 6, 0, 1);
  const minutesConf = i.minutes == null ? 0.6 : clamp(i.minutes / 1800, 0.4, 1);
  const confidence = round(clamp(20 + i.coverage * 45 + edge * 20 + minutesConf * 15, 0, 100));

  return { tier, role, ceiling, confidence };
}

/* ───────────────────────── urgency & push ───────────────────────── */

export interface UrgencyInput {
  now: number;
  tier: Tier;
  contractMonths: number | null;
  mandateDays: number | null;
  matchingRequests: number;
  daysSinceTouch: number | null;
  trend: Trend;
  newsSignal: number; // -2 … +2
}

export function computeUrgency(i: UrgencyInput): { urgency: number; parts: UrgencyParts } {
  const c = i.contractMonths;
  const contract = c == null ? 15 : c <= 3 ? 100 : c <= 6 ? 80 : c <= 12 ? 55 : c <= 18 ? 30 : 10;
  const m = i.mandateDays;
  const mandate = m == null ? 0 : m <= 7 ? 100 : m <= 21 ? 80 : m <= 45 ? 55 : m <= 90 ? 25 : 0;
  const demand = clamp(i.matchingRequests * 28 + (i.newsSignal > 0 ? i.newsSignal * 12 : 0), 0, 100);
  const momentum = i.trend === 'up' ? 80 : i.trend === 'down' ? 35 : 50;
  const neglect = i.daysSinceTouch == null ? 40 : clamp(i.daysSinceTouch * 2.2, 0, 100);

  const w = URGENCY_WEIGHTS;
  const urgency = round(w.contract * contract + w.mandate * mandate + w.demand * demand + w.momentum * momentum + w.neglect * neglect);
  return { urgency, parts: { contract: round(contract), mandate: round(mandate), demand: round(demand), momentum, neglect: round(neglect) } };
}

export function pushFromUrgency(urgency: number): Push {
  for (const { v, push } of PUSH_THRESHOLDS) if (urgency >= v) return push;
  return 'low';
}

/* ───────────────────────── saleability & worth ───────────────────────── */

export interface SaleabilityInput {
  tier: Tier;
  age: number | null;
  contractMonths: number | null;
  matchingRequests: number;
  trend: Trend;
  newsSignal: number;
}

/** How movable he is this window (demand + a sellable age/contract/momentum profile). */
export function saleability(i: SaleabilityInput): number {
  let s = 50;
  s += Math.min(30, i.matchingRequests * 15); // concrete demand is the strongest signal
  if (i.age != null) {
    if (i.age <= 24) s += 12;
    else if (i.age <= 28) s += 6;
    else if (i.age >= 32) s -= 14;
    else if (i.age >= 30) s -= 6;
  }
  const c = i.contractMonths;
  if (c != null) {
    if (c <= 6) s += 14; // cheap to move / free soon
    else if (c <= 18) s += 6;
    else if (c >= 36) s -= 6;
  }
  s += i.trend === 'up' ? 8 : i.trend === 'down' ? -8 : 0;
  s += clamp(i.newsSignal * 5, -10, 10);
  // Tier only mildly affects saleability — a cheap mover can still be worth working.
  s += (3 - i.tier) * 2;
  return round(clamp(s, 0, 100));
}

export function worth(quality: number, sale: number, urgency: number): number {
  const w = WORTH_WEIGHTS;
  return round(clamp(w.quality * quality + w.saleability * sale + w.urgency * urgency, 0, 100));
}

/* ───────────────────────── misc ───────────────────────── */

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

/** Small, stable hash of the facts the analyst sees (djb2). */
export function hashFacts(o: unknown): string {
  const s = JSON.stringify(o);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** English/Hebrew fit label, e.g. "Starter in Premium (ceiling Elite)". */
export function fitLabel(fit: Omit<FitPrediction, 'labelEn' | 'labelHe'>, defs: Record<Tier, { en: string; he: string }>): { en: string; he: string } {
  const roleEn = { starter: 'Starter', rotation: 'Rotation', squad: 'Squad' }[fit.role];
  const roleHe = { starter: 'פותח', rotation: 'רוטציה', squad: 'סגל' }[fit.role];
  const tierEn = defs[fit.tier].en.split(' — ')[0];
  const tierHe = defs[fit.tier].he.split(' — ')[0];
  const ceilEn = fit.ceiling < fit.tier ? ` · ceiling ${defs[fit.ceiling].en.split(' — ')[0]}` : '';
  const ceilHe = fit.ceiling < fit.tier ? ` · תקרה ${defs[fit.ceiling].he.split(' — ')[0]}` : '';
  return { en: `${roleEn} in ${tierEn}${ceilEn}`, he: `${roleHe} ב${tierHe}${ceilHe}` };
}
