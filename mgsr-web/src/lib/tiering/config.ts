import type { CriterionKey, PositionGroup, Push, Tier } from './types';

/**
 * Quality criteria and weights. A criterion with no data is dropped and the rest renormalised,
 * so thin data lowers confidence instead of producing a wrong level.
 */
export const WEIGHTS: Record<CriterionKey, number> = {
  output: 35, // match rating, minutes, goals/90 from our scout server
  ability: 25, // FM current ability (FmIntelligenceCache), blended with potential for young players
  value: 25, // Transfermarkt market value (log scale), already on the player doc
  league: 15, // league strength of the club's country
};

/** Quality score -> fit tier. score >= T[n] means the player projects to at least tier n. */
export const TIER_THRESHOLDS: Record<1 | 2 | 3 | 4, number> = { 1: 80, 2: 66, 3: 50, 4: 34 };

/** Per position-group offset on every threshold (positive = harder). Neutral in Phase 1. */
export const POSITION_OFFSETS: Record<PositionGroup, number> = { GK: 0, CB: 0, FB: 0, MF: 0, AM: 0, ST: 0 };

export const POSITION_TO_GROUP: Record<string, PositionGroup> = {
  GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB',
  DM: 'MF', CM: 'MF', LM: 'MF', RM: 'MF', AM: 'AM', CAM: 'AM', LW: 'AM', RW: 'AM', SS: 'AM', CF: 'ST', ST: 'ST',
};

/**
 * Worth = how much it pays to work on him next window.
 *   worth = qualityW·quality + saleabilityW·saleability + urgencyW·urgency
 * quality     = the criteria score (how good he is)
 * saleability = how movable he is this window (demand + contract + age curve + momentum)
 * urgency     = time pressure (contract, mandate, demand, momentum, neglect)
 */
export const WORTH_WEIGHTS = { quality: 0.4, saleability: 0.35, urgency: 0.25 } as const;

/** Urgency sub-weights. */
export const URGENCY_WEIGHTS = { contract: 0.3, mandate: 0.26, demand: 0.22, momentum: 0.12, neglect: 0.1 } as const;

/** Push-strength cutoffs on urgency (0-100). */
export const PUSH_THRESHOLDS: { v: number; push: Push }[] = [
  { v: 72, push: 'now' },
  { v: 55, push: 'high' },
  { v: 38, push: 'medium' },
  { v: 0, push: 'low' },
];

/** How many players the dashboard shows (ranked by worth). Tune later. */
export const BOARD_SIZE = 10;
/** Don't show players below this worth even inside the top N. */
export const MIN_WORTH = 30;

/* ───────── weekly background agent ───────── */
/** A player is re-analysed if its analysis is older than this (weekly cadence + a margin). */
export const REANALYSE_AFTER_MS = 6 * 24 * 60 * 60 * 1000;
/** Re-run the AI analyst if its read is older than this, or the facts changed. */
export const ANALYST_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;

export const TTL = {
  news: 6 * 24 * 60 * 60 * 1000,
  stats: 6 * 24 * 60 * 60 * 1000,
  intel: 6 * 24 * 60 * 60 * 1000,
  fm: 20 * 24 * 60 * 60 * 1000,
} as const;

export const GEMINI_MODEL = 'gemini-2.5-flash';
export const NEWS_WINDOW_DAYS = 45;
export const TIERS_COLLECTION = 'PlayerTiers';
export const META_DOC = 'TieringMeta/status';

/** League strength 0-100 by club country (rough, editable). Default 40. */
export const LEAGUE_STRENGTH: Record<string, number> = {
  england: 100, spain: 98, germany: 97, italy: 96, france: 92,
  portugal: 80, netherlands: 78, brazil: 72, belgium: 72, turkey: 70, argentina: 68,
  'saudi arabia': 68, scotland: 62, austria: 62, switzerland: 60, greece: 58,
  denmark: 58, 'czech republic': 56, czechia: 56, poland: 55, croatia: 54, serbia: 52,
  russia: 56, ukraine: 54, norway: 52, sweden: 52, israel: 50, 'united arab emirates': 50,
  hungary: 48, romania: 48, qatar: 48, cyprus: 45, slovakia: 42, bulgaria: 42,
  slovenia: 42, 'united states': 55, mexico: 55, japan: 52, 'south korea': 50,
  kuwait: 40, bahrain: 38, azerbaijan: 40, georgia: 38, kazakhstan: 38,
};
export const DEFAULT_LEAGUE_STRENGTH = 40;

/** Tier meaning per market (given to the analyst and shown in the UI). */
export const TIER_DEFINITIONS: Record<Tier, { en: string; he: string }> = {
  1: { en: 'Elite — top-5 league / Champions League', he: 'עילית — ליגה מהחמש הגדולות / ליגת האלופות' },
  2: { en: 'Premium — strong European leagues, Israeli top-3, Saudi/UAE', he: 'פרימיום — ליגות אירופה חזקות, שלישיית ישראל, סעודיה/איחוד' },
  3: { en: 'Core — mid-tier Europe, mid-table Israel, Gulf mid-table', he: 'ליבה — אירופה בינונית, אמצע טבלה בישראל, אמצע טבלה במפרץ' },
  4: { en: 'Depth — lower leagues / rotation', he: 'עומק — ליגות נמוכות / רוטציה' },
  5: { en: 'Developing — unproven or declining', he: 'בפיתוח — לא מוכח או בירידה' },
};
