/**
 * Roster Intelligence — "what changed / who needs attention" (men platform).
 *
 * A weekly background agent reads each roster player's recent game-by-game log (from Transfermarkt's
 * ceapi, enriched onto the player doc at refresh time) plus the player doc, and flags real movement:
 * hot/cold form, dropped from the squad, benched, breaking into the XI, output surge, back from injury,
 * plus value/contract/mandate clocks. The reason + the numbers are always shown.
 *
 * Per-game data covers all leagues (incl. Israel / lower divisions), so this works for the real roster.
 */
import type { RecentGame } from '@/lib/transfermarkt';

export type { RecentGame };

export type SignalKind =
  | 'hot_form'       // strong recent games (minutes + goals/assists + grade)
  | 'cold_form'      // playing but poor recent output/grades
  | 'dropped_squad'  // recently "not in squad" after playing
  | 'benched'        // in the squad but 0 minutes across recent games
  | 'breaking_in'    // moved from bench to starting
  | 'output_surge'   // goals/assists in the last few games
  | 'back_from_injury' // returned after an injury/absence gap
  | 'value_jump'
  | 'value_drop'
  | 'contract_clock'
  | 'mandate_clock';

export type SignalTone = 'positive' | 'watch' | 'negative';

export interface Signal {
  kind: SignalKind;
  tone: SignalTone;
  strength: number; // 0-100, drives order
  en: string;
  he: string;
  detailEn?: string;
  detailHe?: string;
}

/** Compact recent-form summary for the card + drawer. */
export interface FormSummary {
  games: number;        // games considered
  played: number;       // games he actually played
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  avgGrade: number | null;
  lastDate?: string;
  /** last ~6 games as sparkline-friendly points: minutes share 0..1 (or grade if present). */
  spark: number[];
}

export interface PlayerIntel {
  top: Signal;
  signals: Signal[];
  score: number;
  form: FormSummary;
  /** True when we have no recent-game data for this player (TM match failed). */
  noGameData: boolean;
  computedAt: number;
}

export interface PlayerIntelDoc {
  playerId: string;
  tmProfile?: string;
  playerName?: string;
  /** Snapshot of the recent games used (for the drawer). */
  recentGames?: RecentGame[];
  intel?: PlayerIntel;
  lastTouchAt?: number;
  /** Set when the stored tmProfile id was stale and a name-search found the live one — the stored id needs re-linking. */
  staleTmId?: boolean;
  /** The live TM id discovered by name search (only when staleTmId). Surfaced so the user can fix the Players doc. */
  resolvedTmId?: string | null;
}

export interface IntelMeta {
  lastRunAt?: number;
  durationMs?: number;
  analysed?: number;
  flagged?: number;
  total?: number;
  withGames?: number;
  /** How many players had a stale stored TM id that a name-search re-resolved to a live one. */
  staleIds?: number;
  errors?: { playerId: string; error: string }[];
}

export interface IntelListResponse {
  items: PlayerIntelDoc[];
  meta: IntelMeta | null;
  generatedAt: number;
}
