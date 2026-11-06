/**
 * Tunables for Roster Intelligence signal detection. One place to adjust after seeing real output.
 */
export const TIERS_COLLECTION = 'PlayerTiers';
export const META_DOC = 'TieringMeta/status';

/** How many flagged players the dashboard shows. */
export const BOARD_SIZE = 20;

/** Weekly cadence. */
export const REANALYSE_AFTER_MS = 6 * 24 * 60 * 60 * 1000;
/** Re-fetch recent games (if the worker self-enriches) at most this often. */
export const GAMES_TTL_MS = 6 * 24 * 60 * 60 * 1000;

/** Signal windows & thresholds (counted over the player's most recent games). */
export const SIGNALS = {
  window: 6,              // how many recent games define "recent"
  recentForStreak: 4,     // games that make a "streak"

  hotMinGrade: 7.1,       // avg grade over recent games (when grades exist)
  hotMinGAStreak: 3,      // goals+assists across the streak window
  coldMaxGrade: 6.3,      // poor avg grade while still playing

  droppedRecent: 2,       // "not in squad" in at least N of the last window
  benchedRecent: 3,       // "in squad" with 0 min in at least N of the last window
  startsForBreakingIn: 2, // became a starter: N starts in recent games after not starting before

  outputSurgeGA: 2,       // goals+assists in the recent streak

  valueMovePct: 0.15,
  contractMonths: 6,
  mandateDays: 30,

  minMinutesPlayed: 1,    // a game "counts as played" at >= this many minutes
} as const;
