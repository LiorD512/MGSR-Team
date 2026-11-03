/**
 * Level & Focus — roster tiering (men platform, v1: roster only).
 *
 * Level  = what can the player play at (1 Elite … 5 Developing)
 * Focus  = how hard we push now        (1 Push now … 4 Park)
 *
 * A background worker (see _tiering_worker.ts) keeps the `ai` block fresh for every roster player.
 * Humans own the confirmed tags (`level`, `focus`). The engine/AI never overwrites them — it only
 * proposes. See docs/PLAYER_LEVEL_FOCUS_PLAN.md.
 */

export type Level = 1 | 2 | 3 | 4 | 5;
export type Focus = 1 | 2 | 3 | 4;
export type Trend = 'up' | 'flat' | 'down';

export type PositionGroup = 'GK' | 'CB' | 'FB' | 'MF' | 'AM' | 'ST';

export type NextKind = 'mandate' | 'contract' | 'requests' | 'untouched' | 'none';

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
  /** 0-100, or null when we have no data for this criterion. */
  score: number | null;
  /** Short human-readable evidence, e.g. "Avg rating 7.1 over 1,850 min". */
  note?: string;
}

export interface TierUrgencyParts {
  time: number;
  demand: number;
  gap: number;
  momentum: number;
}

export type NewsSentiment = 'positive' | 'neutral' | 'negative' | 'risk';

export interface TierNewsItem {
  headline: string;
  sentiment: NewsSentiment;
  /** Why it matters for us. */
  impactEn: string;
  impactHe: string;
  source?: string;
  date?: string;
  url?: string;
}

export type PushTiming = 'now' | 'this_week' | 'this_window' | 'later' | 'hold';

/** HOW and WHEN to push the player. */
export interface TierPlan {
  howEn: string;
  howHe: string;
  whenEn: string;
  whenHe: string;
  timing: PushTiming;
  /** Clubs worth approaching (from open requests / the analyst). */
  targets: string[];
  /** ISO date by which the action should happen, if there is a hard one. */
  deadline?: string;
}

export interface TierRisk {
  en: string;
  he: string;
}

export interface TierSource {
  title: string;
  url: string;
}

export interface TierAi {
  /** Weighted 0-100 score (before AI adjustment). */
  score: number;
  /** Share of the criteria weight that had data (0-1). */
  coverage: number;
  baseLevel: Level;
  /** AI qualitative adjustment, +1 = one level better. Always -1, 0 or +1. */
  adj: -1 | 0 | 1;
  /** Suggested level = clamp(baseLevel - adj). */
  level: Level;
  /** Suggested focus = deterministic focus, nudged at most one step by breaking news. */
  focus: Focus;
  /** +1 = news says push harder, -1 = ease off. */
  focusAdj: -1 | 0 | 1;
  urgency: number;
  urgencyParts: TierUrgencyParts;
  trend: Trend;
  /** -2 (very negative) … +2 (very positive) news momentum. */
  newsSignal: number;
  /** 0-100. */
  confidence: number;
  reasonEn: string;
  reasonHe: string;
  evidence: string[];
  criteria: TierCriterion[];
  signals: TierSignals;
  news: TierNewsItem[];
  risks: TierRisk[];
  plan?: TierPlan;
  sources: TierSource[];
  next: { kind: NextKind; value?: number };
  model: string;
  /** Last deterministic recompute. */
  computedAt: number;
  /** Last time the AI analyst (Gemini + Google Search) ran. */
  analystAt?: number;
  /** Hash of the facts the analyst saw; a change triggers a fresh analyst run. */
  dataHash?: string;
  /** True once we have pushed "AI recommends Push now" for this streak. */
  alertedFocus1?: boolean;
}

export interface TierEffort {
  notes30: number;
  tasks30: number;
  /** Epoch ms of the latest note/task touch, or 0 if none. */
  lastTouchAt: number;
}

export interface TierHistoryEntry {
  at: number;
  by: string;
  kind: 'manual' | 'ai-accepted' | 'system';
  fromLevel?: Level | null;
  toLevel?: Level | null;
  fromFocus?: Focus | null;
  toFocus?: Focus | null;
  note?: string;
}

export interface NewsRow {
  title: string;
  source?: string;
  date?: string;
  url?: string;
}

/** Cached external inputs so repeat runs are cheap. */
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
  news?: NewsRow[];
  newsAt?: number;
}

export interface PlayerTierDoc {
  playerId: string;
  tmProfile?: string;
  playerName?: string;
  /** Confirmed by a human. Undefined = AI-assigned until someone confirms. */
  level?: Level;
  focus?: Focus;
  locked?: boolean;
  confirmedBy?: string;
  confirmedAt?: number;
  /** Suggestion the user dismissed; same suggestion is not shown again. */
  dismissed?: { level?: Level; focus?: Focus; at: number };
  ai?: TierAi;
  effort?: TierEffort;
  inputs?: TierInputs;
  history?: TierHistoryEntry[];
}

export interface TierMeta {
  lastRunAt?: number;
  durationMs?: number;
  analysed?: number;
  aiCalls?: number;
  total?: number;
  errors?: { playerId: string; error: string }[];
}

export interface TierListResponse {
  items: PlayerTierDoc[];
  meta: TierMeta | null;
  generatedAt: number;
}
