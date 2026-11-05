/**
 * Roster Intelligence — "what changed / what needs attention" (men platform).
 *
 * A weekly background agent stores a stats snapshot for every roster player, compares it to recent
 * weeks, and flags the players whose situation moved: hot form, cold form, suddenly playing, stopped
 * playing, output surge, value jump/fall, contract/mandate clock. The reason is always shown.
 *
 * The stats API is SEASON AGGREGATES only (no per-game log), so "change" is detected by comparing
 * weekly snapshots. Week 1 has no history → it flags absolute standouts + value/contract; from week 2
 * the week-over-week deltas drive everything. Data is in-app only (our scout server + Players doc).
 */

/** One weekly snapshot of a player's season stats (what we store to compare over time). */
export interface StatsSnapshot {
  at: number; // epoch ms of this weekly capture
  season?: number;
  league?: string;
  team?: string;
  position?: string;
  rating?: number;
  minutes?: number;
  nineties?: number; // api_minutes_90s
  appearances?: number;
  lineups?: number; // starts
  goals?: number;
  assists?: number;
  goalsPer90?: number;
  assistsPer90?: number;
  gaPer90?: number; // goal contributions / 90
  /** Market value in euros at capture time (from the Players doc). */
  valueEuro?: number;
}

export type SignalKind =
  | 'hot_form'        // season rating climbing week over week
  | 'cold_form'       // season rating falling
  | 'breaking_in'     // minutes/starts jumping — suddenly playing
  | 'losing_place'    // was playing, minutes/starts have stalled while the season rolls on
  | 'output_surge'    // goals/assists rising
  | 'value_jump'      // market value rose
  | 'value_drop'      // market value fell
  | 'contract_clock'  // contract ending soon
  | 'mandate_clock'   // mandate expiring soon
  | 'standout_form'   // week-1 fallback: unusually strong current rating
  | 'standout_output' // week-1 fallback: unusually high output per 90
  | 'heavy_load';     // week-1 fallback: very high minutes (a key, in-demand player)

export type SignalTone = 'positive' | 'watch' | 'negative';

export interface Signal {
  kind: SignalKind;
  tone: SignalTone;
  /** 0-100 — how strongly this fired; drives card order. */
  strength: number;
  /** The headline reason, with real numbers. */
  en: string;
  he: string;
  /** Optional one-line supporting detail. */
  detailEn?: string;
  detailHe?: string;
}

/** Everything the weekly agent computes for one player. */
export interface PlayerIntel {
  /** Highest-strength signal (used for the card badge + sort). */
  top: Signal;
  /** All signals that fired, strongest first. */
  signals: Signal[];
  /** Max signal strength (sort key). */
  score: number;
  /** Current season stats (for the card facts). */
  current: StatsSnapshot;
  /** Recent ratings for the sparkline (oldest→newest), from stored snapshots. */
  ratingSpark: number[];
  /** True while we only have one snapshot (week 1 — change detection not active yet). */
  firstRun: boolean;
  computedAt: number;
}

export interface PlayerIntelDoc {
  playerId: string;
  tmProfile?: string;
  playerName?: string;
  /** Rolling history of weekly snapshots (we keep the last ~12). */
  history?: StatsSnapshot[];
  intel?: PlayerIntel;
  /** Last touch (notes/tasks) — shown as context, not a signal. */
  lastTouchAt?: number;
}

export interface IntelMeta {
  lastRunAt?: number;
  durationMs?: number;
  analysed?: number;
  flagged?: number;
  total?: number;
  statsMatched?: number;
  errors?: { playerId: string; error: string }[];
}

export interface IntelListResponse {
  items: PlayerIntelDoc[];
  meta: IntelMeta | null;
  generatedAt: number;
}
