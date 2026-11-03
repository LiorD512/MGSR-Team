/**
 * Level & Focus — roster tiering (men platform, v1: roster only).
 *
 * Level  = what can the player play at (1 Elite … 5 Developing)
 * Focus  = how hard we push now        (1 Push now … 4 Park)
 *
 * Humans own the confirmed tags (`level`, `focus`). The engine/AI only ever writes
 * the `ai` block (a suggestion). See docs/PLAYER_LEVEL_FOCUS_PLAN.md.
 */

export type Level = 1 | 2 | 3 | 4 | 5;
export type Focus = 1 | 2 | 3 | 4;
export type Trend = 'up' | 'flat' | 'down';

export type PositionGroup = 'GK' | 'CB' | 'FB' | 'MF' | 'AM' | 'ST';

export type NextKind = 'mandate' | 'contract' | 'requests' | 'untouched' | 'none';

export interface TierSignals {
  /** 0-100. Optional: only when real match data is available. */
  output?: number;
  /** 0-100. Optional: FM current ability mapped to 0-100. */
  fm?: number;
  /** 0-100. Always present (market value on a log scale). */
  value: number;
  /** 0-100. Always present (league strength of current club country). */
  league: number;
}

export interface TierUrgencyParts {
  time: number;
  demand: number;
  gap: number;
  momentum: number;
}

export interface TierAi {
  /** Weighted 0-100 score (before AI adjustment). */
  score: number;
  baseLevel: Level;
  /** AI qualitative adjustment, +1 = one level better. Always -1, 0 or +1. */
  adj: -1 | 0 | 1;
  /** Suggested level = clamp(baseLevel - adj). */
  level: Level;
  /** Suggested focus (deterministic). */
  focus: Focus;
  urgency: number;
  urgencyParts: TierUrgencyParts;
  trend: Trend;
  /** 0-100. */
  confidence: number;
  reasonEn: string;
  reasonHe: string;
  evidence: string[];
  signals: TierSignals;
  next: { kind: NextKind; value?: number };
  model: string;
  computedAt: number;
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

/** Cached external inputs so repeat runs are cheap. */
export interface TierInputs {
  fmCa?: number;
  fmPa?: number;
  apiRating?: number;
  apiMinutes?: number;
  fetchedAt?: number;
}

export interface PlayerTierDoc {
  playerId: string;
  tmProfile?: string;
  playerName?: string;
  /** Confirmed by a human. Undefined = not yet confirmed. */
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

export interface TierListResponse {
  items: PlayerTierDoc[];
  /** Roster players without a fresh analysis. */
  pending: number;
  generatedAt: number;
}
