/**
 * Club-level fit — "would THIS club realistically sign a player like him?" (men platform).
 *
 * Built from what the requesting club actually does on the market, not from guesses:
 *   - the club's real signings of the last 3 seasons (market value at signing + strength of the club he came from),
 *   - "club strength" = median market value of a club's current squad (Transfermarkt).
 *
 * Validated on live Transfermarkt data before it was coded (Pafos FC, KF Teuta, Panetolikos — Nov 2026):
 *   - Gate (leave-one-out): 100% / 95% / 100% of each club's own real signings pass their club's gate.
 *   - Score: ranks a club's own signings above a weaker club's signings with AUC 0.97 (Pafos vs Teuta),
 *     0.91 (Panetolikos vs Teuta), 0.76 (Pafos vs Panetolikos).
 *   The audit script (`_matching_audit.ts`) re-runs the same backtest on every requesting club.
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
}

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

export interface LevelParams {
  /** A player passes when his value (and his club's strength) is at least `gateFactor` × the club's 10th percentile. */
  gateFactor: number;
  /** Minimum signings with known values before the gate is applied. */
  minSignings: number;
}

export const DEFAULT_LEVEL_PARAMS: LevelParams = { gateFactor: 0.5, minSignings: 10 };

export function quantile(values: number[], p: number): number | null {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.min(v.length - 1, Math.floor(p * v.length))]!;
}

function percentile(value: number, values: number[]): number | null {
  const v = values.filter((x) => x > 0);
  if (!value || value <= 0 || !v.length) return null;
  return v.filter((x) => x <= value).length / v.length;
}

export interface LevelAssessment {
  /** false = clearly below what this club signs (hard gate). null = not enough data to decide. */
  pass: boolean | null;
  /** 0-100: where he would sit among this club's real signings (null = unknown). */
  score: number | null;
  /** Average percentile (0..1) of his value and his club's strength among the club's signings. */
  pct: number | null;
  /** Club's signing range (10th-90th percentile of market value at signing). */
  mvP10: number | null;
  mvP90: number | null;
  /** 10th percentile of the strength of the clubs it signed from. */
  srcP10: number | null;
  /** The player's own numbers used. */
  playerMv: number;
  playerClubStrength: number | null;
  signingsUsed: number;
  /** Which check failed, when pass === false. */
  failed?: 'value' | 'club';
}

/**
 * Level fit of a player for a requesting club.
 * @param playerMv  player's market value (€), 0 = unknown
 * @param playerClubStrength median squad value of his current club (last club for free agents), null = unknown
 */
export function assessLevel(club: ClubLevel | null | undefined, playerMv: number, playerClubStrength: number | null, params: LevelParams = DEFAULT_LEVEL_PARAMS): LevelAssessment | null {
  if (!club) return null;
  const mvs = club.signings.map((s) => s.mv).filter((x) => x > 0);
  const srcs = club.signings.map((s) => s.src ?? 0).filter((x) => x > 0);
  if (mvs.length < params.minSignings) return null;
  const mvP10 = quantile(mvs, 0.1);
  const mvP90 = quantile(mvs, 0.9);
  const srcP10 = srcs.length >= params.minSignings ? quantile(srcs, 0.1) : null;

  const mvOk = playerMv > 0 && mvP10 != null ? playerMv >= params.gateFactor * mvP10 : null;
  const clubOk = playerClubStrength && playerClubStrength > 0 && srcP10 != null ? playerClubStrength >= params.gateFactor * srcP10 : null;
  const pass = mvOk === false || clubOk === false ? false : mvOk === null && clubOk === null ? null : true;

  const parts = [percentile(playerMv, mvs), srcs.length >= params.minSignings ? percentile(playerClubStrength ?? 0, srcs) : null]
    .filter((x): x is number => x != null);
  const pct = parts.length ? parts.reduce((s, x) => s + x, 0) / parts.length : null;
  // At or above the club's typical signing (40th percentile) = full level fit; below scales down linearly.
  const score = pct == null ? null : Math.round(Math.min(1, pct / 0.4) * 100);

  return {
    pass, score, pct, mvP10, mvP90, srcP10, playerMv, playerClubStrength, signingsUsed: mvs.length,
    failed: mvOk === false ? 'value' : clubOk === false ? 'club' : undefined,
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
