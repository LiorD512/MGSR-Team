/**
 * Club-level fit — "would THIS club realistically sign a player like him?" (men platform).
 *
 * Built from what the requesting club actually does on the market, not from guesses:
 *   - the club's real signings of the last 3 seasons (market value at signing + strength of the club he came from),
 *   - "club strength" = median market value of a club's current squad (Transfermarkt).
 *
 * Score (v3) = 0.6 × closeness to the club's typical signing (log-normal fit of the values it paid for and of the strength
 * of the clubs it bought from) + 0.2 × share of its signings from the player's league + 0.2 × from his country.
 * Backtest on the 9 real requesting clubs (363 signings, Nov 2026): telling a club's own signings apart from the other
 * 8 clubs' signings — AUC 0.76 (v2 one-sided formula: 0.56), own signings in the top 10: 4.9 / 10 (random ≈ 1.1).
 * Gate (unchanged, + under-21s exempt): wrongly excludes 5 / 363 of the clubs' own signings.
 * The audit script (`_matching_audit.ts`) re-runs the same backtest on every requesting club.
 *
 * Pure module (no Firebase / React).
 */

/** One real signing of the requesting club. */
export interface Signing {
  /** Market value at the time of the transfer (€). 0 = unknown. */
  mv: number;
  /** Median squad market value of the club he came from (€). null = unknown / free agent / no squad data. */
  src: number | null;
  pos?: string;
  age?: number | null;
  /** Transfer season id (TM saison_id). */
  season?: number;
  /** TM competition code of the league he came from, e.g. ISR2. */
  league?: string | null;
  /** Country of the league he came from (TM English name), e.g. "Israel". */
  country?: string | null;
}

export interface ClubLevel {
  id: string;
  name: string;
  /** TM competition code of the club's league, e.g. ZYP1. */
  league: string | null;
  leagueAvg: number | null;
  squadMedian: number | null;
  squadSize: number;
  /** Median squad market value per position code (GK, CB, ...). */
  positionMedian: Record<string, number>;
  signings: Signing[];
  updatedAt: number;
  /** Data version — 2 = signings carry origin league + country. */
  v?: number;
}

export const CLUB_LEVEL_VERSION = 2;

/** Strength of any club (requesting clubs, players' clubs, clubs signings came from). */
export interface ClubStrength {
  /** Median squad market value (€). null = squad page had no values. */
  m: number | null;
  n?: string;
  l?: string | null;
  at: number;
}

/** Per roster player: which club his level is judged by, and when he last played. */
export interface PlayerLevelInfo {
  /** Current club (or last club, for free agents) — TM verein id. */
  clubId?: string | null;
  clubName?: string | null;
  /** YYYY-MM-DD of the last game he actually played (any competition). null = none found. */
  lastPlayed?: string | null;
  at: number;
}

/** Where a roster player plays (or last played), for the "club recruits from here" part. */
export interface PlayerOrigin {
  /** Median squad value of his current / last club. null = unknown. */
  clubStrength: number | null;
  league: string | null;
  country: string | null;
  age: number | null;
}

export interface LevelParams {
  /** A player passes when his value (and his club's strength) is at least `gateFactor` × the club's 10th percentile. */
  gateFactor: number;
  /** Minimum signings with known values before the gate is applied. */
  minSignings: number;
  /** Players this age or younger are never gated (clubs sign cheap youngsters from lower leagues). */
  gateExemptMaxAge: number;
}

export const DEFAULT_LEVEL_PARAMS: LevelParams = { gateFactor: 0.5, minSignings: 10, gateExemptMaxAge: 21 };

export function quantile(values: number[], p: number): number | null {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.floor(p * v.length))]!;
}


export interface LevelAssessment {
  /** false = clearly below what this club signs (hard gate). null = not enough data to decide. */
  pass: boolean | null;
  /** 0-100 level fit (100 = typical signing of this club, from a league / country it recruits from). null = unknown. */
  score: number | null;
  /** Raw backtested formula value (0..1). Own signings: median 0.61; other clubs' signings: median 0.42. */
  raw: number | null;
  /** Club's signing range (10th-90th percentile of market value at signing). */
  mvP10: number | null;
  mvP90: number | null;
  /** 10th percentile of the strength of the clubs it signed from. */
  srcP10: number | null;
  /** The player's own numbers used. */
  playerMv: number;
  playerClubStrength: number | null;
  playerLeague: string | null;
  playerCountry: string | null;
  /** How many of the club's signings came from his league / his country. */
  fromLeague: number;
  fromCountry: number;
  signingsUsed: number;
  /** Which check failed, when pass === false. */
  failed?: 'value' | 'club';
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
function logNormalCloseness(value: number | null, sample: number[]): number | null {
  const l = sample.filter((x) => x > 0).map(Math.log);
  if (!value || value <= 0 || l.length < 5) return null;
  const m = mean(l);
  const sd = Math.max(0.35, Math.sqrt(l.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, l.length - 1)));
  return Math.exp(-(((Math.log(value) - m) / sd) ** 2) / 2);
}

/** Level fit of a roster player for a requesting club (formula and thresholds from the 9-club backtest, see header). */
export function assessLevel(club: ClubLevel | null | undefined, playerMv: number, origin: PlayerOrigin, params: LevelParams = DEFAULT_LEVEL_PARAMS): LevelAssessment | null {
  if (!club) return null;
  const signings = club.signings.filter((s) => s.mv > 0);
  const mvs = signings.map((s) => s.mv);
  const srcs = signings.map((s) => s.src ?? 0).filter((x) => x > 0);
  if (mvs.length < params.minSignings) return null;
  const mvP10 = quantile(mvs, 0.1);
  const mvP90 = quantile(mvs, 0.9);
  const srcP10 = srcs.length >= params.minSignings ? quantile(srcs, 0.1) : null;

  // ── gate
  const exempt = origin.age != null && origin.age <= params.gateExemptMaxAge;
  const mvOk = playerMv > 0 && mvP10 != null ? playerMv >= params.gateFactor * mvP10 : null;
  const clubOk = origin.clubStrength && origin.clubStrength > 0 && srcP10 != null ? origin.clubStrength >= params.gateFactor * srcP10 : null;
  const pass = exempt ? (mvOk === null && clubOk === null ? null : true) : mvOk === false || clubOk === false ? false : mvOk === null && clubOk === null ? null : true;

  // ── score: closeness (0.6) + recruits from his league (0.2) + from his country (0.2).
  // Unknown league / country counts as "not a source" (0), exactly as backtested — re-weighting it as neutral instead
  // dropped own signings in the top 10 from 4.9 to 2.7.
  const close = [logNormalCloseness(playerMv, mvs), logNormalCloseness(origin.clubStrength, srcs)].filter((x): x is number => x != null);
  const fromLeague = origin.league ? signings.filter((s) => s.league === origin.league).length : 0;
  const fromCountry = origin.country ? signings.filter((s) => s.country === origin.country).length : 0;
  const parts: [number, number][] = [];
  if (close.length) parts.push([0.6, mean(close)]);
  parts.push([0.2, origin.league ? Math.min(1, ((fromLeague + 0.5) / (signings.length + 1)) / 0.15) : 0]);
  parts.push([0.2, origin.country ? Math.min(1, ((fromCountry + 0.5) / (signings.length + 1)) / 0.25) : 0]);
  const wsum = parts.reduce((s, [w]) => s + w, 0);
  const raw = parts.length && close.length ? parts.reduce((s, [w, v]) => s + w * v, 0) / wsum : null;
  // 0.7 ≈ own-signing 64th percentile → full fit (own median 0.61 → 87, other clubs' median 0.42 → 60)
  const score = raw == null ? null : Math.round(Math.min(1, raw / 0.7) * 100);

  return {
    pass, score, raw, mvP10, mvP90, srcP10, playerMv, playerClubStrength: origin.clubStrength,
    playerLeague: origin.league, playerCountry: origin.country, fromLeague, fromCountry, signingsUsed: mvs.length,
    failed: pass === false ? (mvOk === false ? 'value' : 'club') : undefined,
  };
}

/** Whole months since a YYYY-MM-DD date. */
export function monthsSince(date: string | null | undefined, now: number): number | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return null;
  return (now - t) / (30.44 * 86_400_000);
}

export function formatEurShort(n: number | null | undefined): string {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}m`;
  return `€${Math.round(n / 1_000)}k`;
}
