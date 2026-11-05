/**
 * Roster Intelligence — Phase 1 (men platform). IN-APP DATA ONLY, no external scrapers, no AI/news.
 *
 * A weekly background agent reads only data we already hold:
 *   • Players doc        — market value (+history), contract, club country, age, positions, mandate, notes
 *   • FmIntelligenceCache — FM current/potential ability (Firestore, populated nightly)
 *   • our scout server    — match rating, minutes, goals/90 (/player_stats, keyed by tmProfile)
 *   • ClubRequests / PlayerMatchResults — demand (matching open requests)
 *   • PlayerDocuments (MANDATE) — mandate expiry
 *   • AgentTasks + notes  — last touch / effort
 * and computes, mathematically:
 *   • Level     — the league tier + role the player realistically fits, with a ceiling (prediction).
 *   • Urgency   — how hard / how soon to push him (contract, mandate, demand, momentum, neglect).
 *   • Worth     — a single 0-100 "work on him next window" score that ranks the roster.
 * The dashboard shows only the top of that ranking. No user interaction in Phase 1.
 */

/** League tier the player fits. 1 = elite (top-5 league / CL), 5 = developing / lower leagues. */
export type Tier = 1 | 2 | 3 | 4 | 5;
export type Role = 'starter' | 'rotation' | 'squad';
export type Trend = 'up' | 'flat' | 'down';
export type PositionGroup = 'GK' | 'CB' | 'FB' | 'MF' | 'AM' | 'ST';

/** The four level criteria. Missing data => the criterion is dropped and weights renormalised. */
export type CriterionKey = 'output' | 'ability' | 'value' | 'league';

export interface TierSignals {
  output?: number;
  ability?: number;
  value: number;
  league: number;
}

export interface TierCriterion {
  key: CriterionKey;
  weight: number;
  score: number | null;
  note?: string;
}

/** Predicted fit: which tier, in what role, with how much confidence, and the realistic ceiling. */
export interface FitPrediction {
  tier: Tier;
  role: Role;
  /** Best realistic tier if form/age trend holds (<= tier numerically; 1 is best). */
  ceiling: Tier;
  /** 0-100. */
  confidence: number;
  labelEn: string;
  labelHe: string;
}

export interface UrgencyParts {
  contract: number;
  mandate: number;
  demand: number;
  momentum: number;
  neglect: number;
}

/** Push strength shown next to the level. */
export type Push = 'now' | 'high' | 'medium' | 'low';

export interface TierReason {
  en: string;
  he: string;
  /** For ordering/colour: 3 = time-critical, 2 = important, 1 = context. */
  weight: 1 | 2 | 3;
}

export interface TierEffort {
  notes30: number;
  tasks30: number;
  lastTouchAt: number;
}

/** Cached inputs so a weekly run is cheap; FM is free (Firestore), stats is one call to our server. */
export interface TierInputs {
  fmCa?: number;
  fmPa?: number;
  fmTier?: string;
  fmAt?: number;
  apiRating?: number;
  apiMinutes?: number;
  apiGoalsPer90?: number;
  statsAt?: number;
}

/** Everything the weekly agent computes for one player. */
export interface TierAnalysis {
  /** 0-100 deterministic quality score (criteria). */
  score: number;
  /** Share of criteria weight that had data (0-1). */
  coverage: number;
  signals: TierSignals;
  criteria: TierCriterion[];

  fit: FitPrediction;

  urgency: number;
  urgencyParts: UrgencyParts;
  push: Push;
  trend: Trend;

  /** 0-100 ranking score: worth working on him next window. */
  worth: number;

  /** Ordered reasons (why he's worth it / why now), derived from the data. */
  reasons: TierReason[];
  /** One-line plain-language summary, built from the numbers (no AI). */
  summaryEn: string;
  summaryHe: string;

  computedAt: number;
}

export interface PlayerTierDoc {
  playerId: string;
  tmProfile?: string;
  playerName?: string;
  analysis?: TierAnalysis;
  effort?: TierEffort;
  inputs?: TierInputs;
}

export interface TierMeta {
  lastRunAt?: number;
  durationMs?: number;
  analysed?: number;
  total?: number;
  windows?: { country: string; daysLeft: number }[];
  errors?: { playerId: string; error: string }[];
}

export interface TierListResponse {
  items: PlayerTierDoc[];
  meta: TierMeta | null;
  generatedAt: number;
}
