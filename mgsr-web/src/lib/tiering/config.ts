/**
 * Tunables for Roster Intelligence signal detection. One place to adjust after seeing real output.
 */

export const TIERS_COLLECTION = 'PlayerTiers'; // reuse the existing collection (now stores intel docs)
export const META_DOC = 'TieringMeta/status';

/** How many flagged players the dashboard shows. */
export const BOARD_SIZE = 20;

/** Weekly cadence: re-run a player if its intel is older than this. */
export const REANALYSE_AFTER_MS = 6 * 24 * 60 * 60 * 1000;
/** Keep at most this many weekly snapshots per player. */
export const MAX_HISTORY = 12;
/** Re-fetch stats from the scout server at most this often (≈ weekly). */
export const STATS_TTL_MS = 6 * 24 * 60 * 60 * 1000;

/**
 * Signal thresholds. "delta" = change vs. the oldest snapshot within the look-back window.
 * Comparisons use the player's OWN recent numbers, so it's about change, not absolute quality.
 */
export const SIGNALS = {
  /** Look back at most this many days for a "previous" snapshot to compare against. */
  lookbackDays: 45,

  hotForm: { minRatingRise: 0.2, minStrength: 50 },     // season rating up ≥ 0.2
  coldForm: { minRatingFall: 0.2 },                     // season rating down ≥ 0.2
  breakingIn: { minExtraMinutes: 120, minExtraStarts: 1 }, // +120 min or +1 start since last snapshot
  losingPlace: { stalledWeeks: 2, maxExtraMinutes: 20 },   // ~no new minutes across 2+ snapshots
  outputSurge: { minExtraGA: 1 },                       // +1 goal or assist since last snapshot

  valueMovePct: 0.15,                                   // ±15% market value move

  contractMonths: 6,                                    // contract ending within N months
  mandateDays: 30,                                      // mandate expiring within N days

  // Week-1 fallbacks (no history yet) — absolute standouts worth not missing.
  standoutRating: 7.2,                                  // strong current season rating
  standoutGaPer90: 0.6,                                 // high attacking output
  heavyLoadMinutes: 2400,                               // very high minutes = key/in-demand player
  minMinutesForForm: 450,                               // ignore rating noise below this
} as const;

/** League strength 0-100 by club country — only used to size "standout" relative to league. Editable. */
export const LEAGUE_STRENGTH: Record<string, number> = {
  england: 100, spain: 98, germany: 97, italy: 96, france: 92,
  portugal: 80, netherlands: 78, brazil: 72, belgium: 72, turkey: 70, argentina: 68,
  'saudi arabia': 68, scotland: 62, austria: 62, switzerland: 60, greece: 58,
  denmark: 58, 'czech republic': 56, poland: 55, croatia: 54, serbia: 52,
  russia: 56, ukraine: 54, norway: 52, sweden: 52, israel: 50, 'united arab emirates': 50,
  hungary: 48, romania: 48, qatar: 48, cyprus: 45, slovakia: 42, bulgaria: 42,
  slovenia: 42, 'united states': 55, mexico: 55, japan: 52, 'south korea': 50,
};
export const DEFAULT_LEAGUE_STRENGTH = 40;
