/**
 * Request ↔ roster matching engine (v2, men platform).
 *
 * Two stages:
 *   A. Hard gates — a player who clearly cannot fit is excluded (wrong position, outside the age band, non-EU for an
 *      EU-only request, far over budget, opposite foot, already at the club). Unknown data NEVER gates.
 *   B. Fit score 0-100 — weighted components (position, budget, availability, level, form, age, salary, foot) plus
 *      modifiers (mandate, interested in Israel). Unknown data scores neutral and lowers `confidence` instead of
 *      silently passing.
 *
 * Every result carries reasons / warnings so the UI can explain the ranking. Pure module: no Firebase / React, so the
 * same code runs in the browser and in the Node audit script (`_matching_audit.ts`).
 */
import { normalizePosition, positionFit, type PositionCode } from './positions';
import { parseEuros, parseFeeBand, parseSalaryBand } from './tiers';

// ─── Inputs ────────────────────────────────────────────────────────────────

export interface RecentGameLite {
  date: string; // YYYY-MM-DD
  state?: string;
  minutes?: number;
  started?: boolean;
  competitionType?: number; // 1-5 league tier, 8 cup, >=10 international
}

export interface MatchPlayer {
  id: string;
  fullName?: string;
  positions?: (string | null)[];
  age?: string | number;
  foot?: string;
  salaryRange?: string;
  transferFee?: string;
  marketValue?: string;
  nationality?: string;
  nationalities?: string[];
  contractExpired?: string;
  currentClub?: { clubName?: string; clubTmProfile?: string; clubCountry?: string };
  isOnLoan?: boolean;
  onLoan?: boolean;
  interestedInIsrael?: boolean;
  tmProfile?: string;
  recentGames?: RecentGameLite[];
}

export interface MatchRequest {
  id: string;
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  dominateFoot?: string;
  salaryRange?: string;
  transferFee?: string;
  euOnly?: boolean;
  clubTmProfile?: string;
  clubName?: string;
  clubCountry?: string;
  status?: string;
}

/** Requesting club's level, derived from its current Transfermarkt squad (see /api/matching/club-profiles). */
export interface ClubProfile {
  squadSize: number;
  squadMedianValue: number | null;
  /** Median market value of the club's current players per position code. */
  positionMedianValue: Partial<Record<PositionCode, number>>;
}

export interface OfferLite {
  playerTmProfile?: string;
  requestId?: string;
  clubTmProfile?: string;
  clubName?: string;
}

export type FeedbackVerdict = 'fit' | 'not_fit';

export interface MatchWeights {
  position: number;
  budget: number;
  availability: number;
  level: number;
  form: number;
  age: number;
  salary: number;
  foot: number;
  mandateBonus: number;
  israelBonus: number;
  /** Hard-gate tolerances. */
  ageBandYears: number;
  budgetGateMultiplier: number;
  /** Bucket thresholds. */
  strongMin: number;
  goodMin: number;
  /** Adjacent-position matches can never score above this. */
  adjacentCap: number;
}

export const DEFAULT_WEIGHTS: MatchWeights = {
  position: 25,
  budget: 20,
  availability: 10,
  level: 10,
  form: 10,
  age: 10,
  salary: 10,
  foot: 5,
  mandateBonus: 10,
  israelBonus: 5,
  ageBandYears: 1,
  budgetGateMultiplier: 2.5,
  strongMin: 75,
  goodMin: 55,
  adjacentCap: 70,
};

/** Merge a (possibly partial / untyped) `Config/matchingWeights` doc over the defaults. */
export function resolveWeights(override?: Record<string, unknown> | null): MatchWeights {
  const out = { ...DEFAULT_WEIGHTS };
  if (!override) return out;
  for (const k of Object.keys(out) as (keyof MatchWeights)[]) {
    const v = override[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export interface MatchContext {
  /** Lower-case EU country names. */
  euCountries: Set<string>;
  /** Active mandates' valid leagues, keyed by Transfermarkt player id. One entry per mandate. */
  mandatesByTmId: Map<string, string[][]>;
  offers: OfferLite[];
  /** Keyed by Transfermarkt club (verein) id. Missing = not loaded / unknown. */
  clubProfiles: Record<string, ClubProfile | null>;
  /** Roster Intelligence signal kinds per player id (PlayerTiers), e.g. 'hot_form', 'benched'. */
  signalsByPlayerId?: Record<string, string[]>;
  /** Recent games per player id from PlayerTiers, used when the player doc has none. */
  gamesByPlayerId?: Record<string, RecentGameLite[]>;
  /** Agents' verdicts keyed by `${requestId}_${playerId}`. */
  feedback: Record<string, FeedbackVerdict>;
  weights: MatchWeights;
  now: number;
}

// ─── Outputs ───────────────────────────────────────────────────────────────

export type ComponentKey = 'position' | 'budget' | 'availability' | 'level' | 'form' | 'age' | 'salary' | 'foot';

export type ReasonCode =
  | 'primary_position' | 'secondary_position' | 'adjacent_position'
  | 'budget_in_band' | 'budget_below' | 'budget_stretch' | 'budget_over' | 'budget_unknown'
  | 'free_agent' | 'contract_6m' | 'contract_12m' | 'on_loan' | 'contract_long' | 'contract_unknown'
  | 'level_fit' | 'level_above' | 'level_below' | 'level_low' | 'level_unknown'
  | 'regular_starter' | 'rotation' | 'low_minutes' | 'hot_form' | 'cold_form' | 'benched' | 'form_unknown'
  | 'age_in_range' | 'age_near' | 'age_unknown'
  | 'salary_in_band' | 'salary_stretch' | 'salary_over' | 'salary_unknown'
  | 'foot_match' | 'foot_both' | 'foot_unknown'
  | 'eu_unknown' | 'mandate' | 'interested_israel';

export type GateCode = 'no_position' | 'age' | 'eu' | 'budget' | 'foot' | 'same_club' | 'not_pending' | 'no_request_position';

export type Bucket = 'strong' | 'good' | 'stretch';

export interface MatchResult {
  requestId: string;
  playerId: string;
  score: number;
  bucket: Bucket;
  /** 0..1 — share of the score weight backed by real data. */
  confidence: number;
  positionFit: 'primary' | 'secondary' | 'adjacent';
  reasons: ReasonCode[];
  warnings: ReasonCode[];
  components: Record<ComponentKey, number | null>;
  mandate: boolean;
  /** 'request' = already offered for this request; 'club' = offered to this club for another request. */
  offered: 'request' | 'club' | null;
  feedback: FeedbackVerdict | null;
}

export type Evaluation = { ok: true; result: MatchResult } | { ok: false; gate: GateCode };

// ─── Helpers ───────────────────────────────────────────────────────────────

const NEUTRAL: Record<ComponentKey, number> = {
  position: 0, budget: 50, availability: 50, level: 50, form: 50, age: 60, salary: 50, foot: 60,
};

export function tmPlayerId(url: string | undefined | null): string | null {
  return url?.match(/spieler\/(\d+)/)?.[1] ?? null;
}
export function tmClubId(url: string | undefined | null): string | null {
  return url?.match(/verein\/(\d+)/)?.[1] ?? null;
}
export function normalizeName(s: string | undefined | null): string {
  return (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,'’\-()]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Contract end in ms, from "30.06.2026", "30/06/2026", "Jun 30, 2026", "2026-06-30". null when unknown / none. */
export function parseContractEnd(s: string | undefined | null): number | null {
  const v = (s ?? '').trim();
  if (!v || v === '-' || v === '—') return null;
  let m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (m) return new Date(+m[3]!, +m[2]! - 1, +m[1]!).getTime();
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!).getTime();
  m = v.match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1]!.toLowerCase());
    if (mi >= 0) return new Date(+m[3]!, mi, +m[2]!).getTime();
  }
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function isFreeAgent(p: MatchPlayer): boolean {
  const c = normalizeName(p.currentClub?.clubName);
  return c === 'without club' || c === 'vereinslos' || c === 'free agent' || c === 'unattached';
}

function median(values: number[]): number | null {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** Build a ClubProfile from a squad list (used by the API route and the audit script). */
export function buildClubProfile(squad: { position: string; marketValue: number }[]): ClubProfile {
  const byPos: Partial<Record<PositionCode, number[]>> = {};
  for (const s of squad) {
    const code = normalizePosition(s.position);
    if (code) (byPos[code] ??= []).push(s.marketValue);
  }
  const positionMedianValue: Partial<Record<PositionCode, number>> = {};
  for (const [k, vals] of Object.entries(byPos)) {
    const m = median(vals ?? []);
    if (m) positionMedianValue[k as PositionCode] = m;
  }
  return { squadSize: squad.length, squadMedianValue: median(squad.map((s) => s.marketValue)), positionMedianValue };
}

/** Does a mandate's valid-leagues list cover the requesting club (worldwide / its country / the club itself)? */
export function mandateCoversClub(validLeagues: string[], req: MatchRequest): boolean {
  const club = normalizeName(req.clubName);
  const country = normalizeName(req.clubCountry);
  for (const raw of validLeagues) {
    const l = normalizeName(raw);
    if (!l) continue;
    if (l === 'worldwide' || l === 'world wide') return true;
    if (country && l === country) return true;
    const clubPart = l.split(' - ')[0]!.trim();
    if (club && clubPart && clubPart.length >= 3 && (clubPart === club || club.includes(clubPart) || clubPart.includes(club))) return true;
  }
  return false;
}

function playerEuStatus(p: MatchPlayer, eu: Set<string>): boolean | null {
  const nats = (p.nationalities?.length ? p.nationalities : p.nationality ? [p.nationality] : []).map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (!nats.length || eu.size === 0) return null;
  return nats.some((n) => eu.has(n));
}

function sameClub(p: MatchPlayer, req: MatchRequest): boolean {
  const a = tmClubId(p.currentClub?.clubTmProfile);
  const b = tmClubId(req.clubTmProfile);
  if (a && b) return a === b;
  const an = normalizeName(p.currentClub?.clubName);
  const bn = normalizeName(req.clubName);
  return !!an && an === bn;
}

function recentLeagueGames(games: RecentGameLite[] | undefined, now: number): RecentGameLite[] {
  if (!games?.length) return [];
  const cutoff = now - 150 * 86_400_000;
  const recent = games
    .filter((g) => { const t = Date.parse(g.date); return Number.isFinite(t) && t >= cutoff && t <= now + 86_400_000; })
    .sort((a, b) => b.date.localeCompare(a.date));
  const league = recent.filter((g) => g.competitionType != null && g.competitionType >= 1 && g.competitionType <= 5);
  return (league.length >= 3 ? league : recent).slice(0, 10);
}

// ─── Core ──────────────────────────────────────────────────────────────────

export function evaluateMatch(req: MatchRequest, p: MatchPlayer, ctx: MatchContext): Evaluation {
  const w = ctx.weights;
  if ((req.status || 'pending') !== 'pending') return { ok: false, gate: 'not_pending' };
  if (!normalizePosition(req.position)) return { ok: false, gate: 'no_request_position' };

  const reasons: ReasonCode[] = [];
  const warnings: ReasonCode[] = [];
  const comp: Record<ComponentKey, number | null> = {
    position: null, budget: null, availability: null, level: null, form: null, age: null, salary: null, foot: null,
  };

  // ── Position (gate + component)
  const fit = positionFit(p.positions ?? undefined, req.position);
  if (fit === 'none') return { ok: false, gate: 'no_position' };
  comp.position = fit === 'primary' ? 100 : fit === 'secondary' ? 75 : 40;
  reasons.push(fit === 'primary' ? 'primary_position' : fit === 'secondary' ? 'secondary_position' : 'adjacent_position');

  // ── Same club (gate)
  if (sameClub(p, req)) return { ok: false, gate: 'same_club' };

  // ── EU (gate when known)
  if (req.euOnly) {
    const eu = playerEuStatus(p, ctx.euCountries);
    if (eu === false) return { ok: false, gate: 'eu' };
    if (eu == null) warnings.push('eu_unknown');
  }

  // ── Age (gate outside the band when known)
  const ageN = typeof p.age === 'number' ? p.age : parseInt(String(p.age ?? ''), 10);
  let minAge = req.minAge && req.minAge > 0 ? req.minAge : null;
  let maxAge = req.maxAge && req.maxAge > 0 ? req.maxAge : null;
  if (minAge != null && maxAge != null && minAge > maxAge) [minAge, maxAge] = [maxAge, minAge];
  if (req.ageDoesntMatter === true || (minAge == null && maxAge == null)) {
    comp.age = 100;
  } else if (!Number.isFinite(ageN) || ageN <= 0) {
    warnings.push('age_unknown');
  } else {
    const lo = minAge ?? 0, hi = maxAge ?? 99;
    if (ageN >= lo && ageN <= hi) { comp.age = 100; reasons.push('age_in_range'); }
    else if (ageN >= lo - w.ageBandYears && ageN <= hi + w.ageBandYears) { comp.age = 50; warnings.push('age_near'); }
    else return { ok: false, gate: 'age' };
  }

  // ── Foot (gate on the opposite foot when known)
  const reqFoot = (req.dominateFoot ?? '').trim().toLowerCase();
  const pFoot = (p.foot ?? '').trim().toLowerCase();
  if (!reqFoot || reqFoot === 'any') {
    comp.foot = 100;
  } else if (!pFoot) {
    warnings.push('foot_unknown');
  } else if (reqFoot === 'both') {
    comp.foot = pFoot === 'both' ? 100 : 70;
    if (pFoot === 'both') reasons.push('foot_both');
  } else if (pFoot === reqFoot) {
    comp.foot = 100; reasons.push('foot_match');
  } else if (pFoot === 'both') {
    comp.foot = 90; reasons.push('foot_both');
  } else {
    return { ok: false, gate: 'foot' };
  }

  // ── Availability
  const free = isFreeAgent(p);
  const onLoan = p.isOnLoan === true || p.onLoan === true;
  const contractEnd = parseContractEnd(p.contractExpired);
  const monthsLeft = contractEnd != null ? (contractEnd - ctx.now) / (30.44 * 86_400_000) : null;
  if (free) { comp.availability = 100; reasons.push('free_agent'); }
  else if (monthsLeft != null && monthsLeft <= 6) { comp.availability = 90; reasons.push('contract_6m'); }
  else if (monthsLeft != null && monthsLeft <= 12) { comp.availability = 70; reasons.push('contract_12m'); }
  else if (onLoan) { comp.availability = 60; reasons.push('on_loan'); }
  else if (monthsLeft != null) { comp.availability = 35; warnings.push('contract_long'); }
  else warnings.push('contract_unknown');

  // ── Budget (gate when clearly over)
  const mv = parseEuros(p.marketValue);
  const asking = parseFeeBand(p.transferFee);
  const feeBand = parseFeeBand(req.transferFee);
  const expiring = monthsLeft != null && monthsLeft <= 6;
  if (!feeBand) {
    comp.budget = 100;
  } else if (feeBand.free) {
    if (free || asking?.free) { comp.budget = 100; reasons.push('budget_in_band'); }
    else if (expiring) { comp.budget = 90; reasons.push('budget_in_band'); }
    else if (onLoan) { comp.budget = 60; warnings.push('budget_stretch'); }
    else if (monthsLeft != null && monthsLeft <= 12) { comp.budget = 45; warnings.push('budget_stretch'); }
    else if (mv > 0) {
      const freeCap = 150_000;
      if (mv <= freeCap) { comp.budget = 55; warnings.push('budget_stretch'); }
      else if (mv > freeCap * w.budgetGateMultiplier) return { ok: false, gate: 'budget' };
      else { comp.budget = 25; warnings.push('budget_over'); }
    } else warnings.push('budget_unknown');
  } else if (free) {
    comp.budget = 100; reasons.push('budget_in_band');
  } else {
    // Asking tier (agency's own) wins over market value; an expiring contract roughly halves the realistic fee.
    let price = asking ? asking.lo : mv > 0 ? mv : null;
    if (price != null && expiring) price *= 0.5;
    if (price == null) warnings.push('budget_unknown');
    else if (feeBand.hi === Infinity || price <= feeBand.hi) {
      if (feeBand.lo > 0 && price < feeBand.lo * 0.5) { comp.budget = 85; reasons.push('budget_below'); }
      else { comp.budget = 100; reasons.push('budget_in_band'); }
    } else if (price <= feeBand.hi * 1.5) { comp.budget = 55; warnings.push('budget_stretch'); }
    else if (price <= feeBand.hi * w.budgetGateMultiplier) { comp.budget = 25; warnings.push('budget_over'); }
    else return { ok: false, gate: 'budget' };
  }

  // ── Salary (soft)
  const reqSal = parseSalaryBand(req.salaryRange);
  const pSal = parseSalaryBand(p.salaryRange);
  if (!reqSal) comp.salary = 100;
  else if (!pSal) warnings.push('salary_unknown');
  else if (pSal.lo <= reqSal.hi && pSal.hi >= reqSal.lo) { comp.salary = 100; reasons.push('salary_in_band'); }
  else if (pSal.hi < reqSal.lo) { comp.salary = 90; reasons.push('salary_in_band'); }
  else {
    const ratio = reqSal.hi > 0 ? pSal.lo / reqSal.hi : Infinity;
    if (ratio <= 1.3) { comp.salary = 60; warnings.push('salary_stretch'); }
    else if (ratio <= 2) { comp.salary = 30; warnings.push('salary_over'); }
    else { comp.salary = 10; warnings.push('salary_over'); }
  }

  // ── Level: player value vs the requesting club's players at that position (fallback: whole squad)
  const clubId = tmClubId(req.clubTmProfile);
  const profile = clubId ? ctx.clubProfiles[clubId] : null;
  const reqCode = normalizePosition(req.position)!;
  const ref = profile ? (profile.positionMedianValue[reqCode] ?? profile.squadMedianValue) : null;
  if (ref && ref > 0 && mv > 0) {
    const r = mv / ref;
    if (r >= 0.6 && r <= 3) { comp.level = 100; reasons.push('level_fit'); }
    else if (r > 3 && r <= 6) { comp.level = 70; reasons.push('level_above'); }
    else if (r > 6) { comp.level = 45; reasons.push('level_above'); }
    else if (r >= 0.35) { comp.level = 60; warnings.push('level_below'); }
    else { comp.level = 25; warnings.push('level_low'); }
  } else warnings.push('level_unknown');

  // ── Form: minutes share over recent (league) games + Roster Intelligence signals
  const games = recentLeagueGames(p.recentGames?.length ? p.recentGames : ctx.gamesByPlayerId?.[p.id], ctx.now);
  const signals = new Set(ctx.signalsByPlayerId?.[p.id] ?? []);
  if (games.length >= 3) {
    const minutes = games.reduce((s, g) => s + (g.minutes ?? 0), 0);
    const share = Math.min(1, minutes / (games.length * 90));
    let f = 25 + 75 * Math.min(1, share / 0.8);
    if (share >= 0.7) reasons.push('regular_starter');
    else if (share >= 0.35) reasons.push('rotation');
    else warnings.push('low_minutes');
    if (signals.has('hot_form') || signals.has('output_surge') || signals.has('breaking_in')) { f += 10; reasons.push('hot_form'); }
    if (signals.has('cold_form')) { f -= 10; warnings.push('cold_form'); }
    if (signals.has('benched') || signals.has('dropped_squad')) { f -= 15; warnings.push('benched'); }
    comp.form = Math.max(0, Math.min(100, Math.round(f)));
  } else if (free) {
    comp.form = 50; // free agents legitimately have no recent games; neutral but "known"
  } else warnings.push('form_unknown');

  // ── Weighted score
  const weightOf: Record<ComponentKey, number> = {
    position: w.position, budget: w.budget, availability: w.availability, level: w.level,
    form: w.form, age: w.age, salary: w.salary, foot: w.foot,
  };
  let sum = 0, total = 0, known = 0;
  for (const k of Object.keys(comp) as ComponentKey[]) {
    const wt = weightOf[k];
    total += wt;
    const v = comp[k];
    if (v == null) sum += wt * NEUTRAL[k];
    else { sum += wt * v; known += wt; }
  }
  let score = total > 0 ? sum / total : 0;

  // ── Modifiers
  const tmId = tmPlayerId(p.tmProfile);
  const mandates = tmId ? ctx.mandatesByTmId.get(tmId) ?? [] : [];
  const mandate = mandates.some((leagues) => mandateCoversClub(leagues, req));
  if (mandate) { score += w.mandateBonus; reasons.push('mandate'); }
  if (p.interestedInIsrael && normalizeName(req.clubCountry) === 'israel') { score += w.israelBonus; reasons.push('interested_israel'); }
  if (fit === 'adjacent') score = Math.min(score, w.adjacentCap);
  score = Math.max(0, Math.min(100, Math.round(score)));

  // ── Offers already made
  const reqClubId = tmClubId(req.clubTmProfile);
  const reqClubName = normalizeName(req.clubName);
  let offered: MatchResult['offered'] = null;
  if (tmId) {
    for (const o of ctx.offers) {
      if (tmPlayerId(o.playerTmProfile) !== tmId) continue;
      if (o.requestId && o.requestId === req.id) { offered = 'request'; break; }
      const sameOfferClub = (reqClubId && tmClubId(o.clubTmProfile) === reqClubId) || (!!reqClubName && normalizeName(o.clubName) === reqClubName);
      if (sameOfferClub) offered = 'club';
    }
  }

  return {
    ok: true,
    result: {
      requestId: req.id,
      playerId: p.id,
      score,
      bucket: score >= w.strongMin ? 'strong' : score >= w.goodMin ? 'good' : 'stretch',
      confidence: total > 0 ? Math.round((known / total) * 100) / 100 : 0,
      positionFit: fit,
      reasons,
      warnings,
      components: comp,
      mandate,
      offered,
      feedback: ctx.feedback[`${req.id}_${p.id}`] ?? null,
    },
  };
}

const byScore = (a: MatchResult, b: MatchResult) => b.score - a.score || b.confidence - a.confidence;

/** All non-gated players for a request, best first. */
export function rankPlayersForRequest(req: MatchRequest, players: MatchPlayer[], ctx: MatchContext): MatchResult[] {
  const out: MatchResult[] = [];
  for (const p of players) {
    const e = evaluateMatch(req, p, ctx);
    if (e.ok) out.push(e.result);
  }
  return out.sort(byScore);
}

/** All non-gated pending requests for a player, best first. */
export function rankRequestsForPlayer(p: MatchPlayer, requests: MatchRequest[], ctx: MatchContext): MatchResult[] {
  const out: MatchResult[] = [];
  for (const r of requests) {
    const e = evaluateMatch(r, p, ctx);
    if (e.ok) out.push(e.result);
  }
  return out.sort(byScore);
}

/** What the board counts / shows by default: Strong + Good, not dismissed as "not a fit". */
export function isVisibleMatch(m: MatchResult): boolean {
  return m.feedback !== 'not_fit' && m.bucket !== 'stretch';
}
