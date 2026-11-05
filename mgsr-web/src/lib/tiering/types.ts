/**
 * Roster Intelligence — Phase 1 (men platform).
 *
 * A weekly background agent reads everything we hold on every roster player (notes, contract, mandate,
 * market value + history, match stats, availability/injuries, club/league strength, recent news) and
 * computes, mathematically:
 *   • Level     — the league tier the player realistically fits, with a role and a ceiling (prediction).
 *   • Urgency   — how hard / how soon to push him (contract, mandate, demand, momentum, trend).
 *   • Worth     — a single 0-100 "work on him next window" score that ranks the roster.
 * The dashboard shows only the top of that ranking. No user interaction in Phase 1.
 */

/** League tier the player fits. 1 = elite (top-5 league / CL), 5 = developing / lower leagues. */
export type Tier = 1 | 2 | 3 | 4 | 5;
export type Role = 'starter' | 'rotation' | 'squad';
export type Trend = 'up' | 'flat' | 'down';
export type PositionGroup = 'GK' | 'CB' | 'FB' | 'MF' | 'AM' | 'ST';

/** The five level criteria. Missing data => the criterion is dropped and weights renormalised. */
export type CriterionKey = 'output' | 'ability' | 'value' | 'league' | 'availability';

export interface TierSignals {
  output?: number;
  ability?: number;
  value: number;
  league: number;
  availability?: number;
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

export type NewsSentiment = 'positive' | 'neutral' | 'negative' | 'risk';
export interface TierNewsItem {
  headline: string;
  sentiment: NewsSentiment;
  impactEn: string;
  impactHe: string;
  source?: string;
  date?: string;
  url?: string;
}

export interface TierReason {
  en: string;
  he: string;
  /** For ordering/colour: 3 = time-critical, 2 = important, 1 = context. */
  weight: 1 | 2 | 3;
}

export interface TierSource {
  title: string;
  url: string;
}

export interface TierEffort {
  notes30: number;
  tasks30: number;
  lastTouchAt: number;
}

export interface TierInputs {
  fmCa?: number;
  fmPa?: number;
  fmAt?: number;
  apiRating?: number;
  apiMinutes?: number;
  statsAt?: number;
  intel?: {
    sofascoreRating?: number;
    fotmobRating?: number;
    minutes?: number;
    injuryProne?: boolean;
    daysMissed?: number;
    recentInjuries?: string[];
    eloLevel?: number;
    elo?: number;
    weeklyWageEur?: number;
    formTrend?: 'rising' | 'stable' | 'declining';
  };
  intelAt?: number;
  news?: { title: string; source?: string; date?: string; url?: string }[];
  newsAt?: number;
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

  /** Ordered human reasons (why he's worth it / why now). */
  reasons: TierReason[];
  /** One-line AI summary of the player and the opportunity. */
  summaryEn: string;
  summaryHe: string;

  newsSignal: number;
  news: TierNewsItem[];
  sources: TierSource[];

  model: string;
  computedAt: number;
  analystAt?: number;
  dataHash?: string;
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
  aiCalls?: number;
  total?: number;
  windows?: { country: string; daysLeft: number }[];
  errors?: { playerId: string; error: string }[];
}

export interface TierListResponse {
  items: PlayerTierDoc[];
  meta: TierMeta | null;
  generatedAt: number;
}
