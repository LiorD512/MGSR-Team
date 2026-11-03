import type { CriterionKey, Focus, Level, PositionGroup } from './types';

/**
 * Level criteria and their weights. A criterion with no data is dropped and the rest renormalised,
 * so thin data lowers confidence instead of producing a wrong level.
 */
export const WEIGHTS: Record<CriterionKey, number> = {
  output: 30, // match ratings & minutes (SofaScore / FotMob / API stats)
  ability: 20, // FM current ability, blended with potential for young players
  value: 25, // Transfermarkt market value (log scale)
  league: 15, // league strength of the club's country + club Elo
  availability: 10, // injury history
};

/** Base thresholds: score >= T[n] means at least level n. */
export const LEVEL_THRESHOLDS: Record<1 | 2 | 3 | 4, number> = { 1: 78, 2: 64, 3: 50, 4: 36 };

/**
 * Per position-group offset added to every threshold (positive = harder to reach a level).
 * v1 ships neutral; tune after seeing real results.
 */
export const POSITION_OFFSETS: Record<PositionGroup, number> = {
  GK: 0,
  CB: 0,
  FB: 0,
  MF: 0,
  AM: 0,
  ST: 0,
};

export const POSITION_TO_GROUP: Record<string, PositionGroup> = {
  GK: 'GK',
  CB: 'CB',
  LB: 'FB',
  RB: 'FB',
  LWB: 'FB',
  RWB: 'FB',
  DM: 'MF',
  CM: 'MF',
  LM: 'MF',
  RM: 'MF',
  AM: 'AM',
  CAM: 'AM',
  LW: 'AM',
  RW: 'AM',
  SS: 'AM',
  CF: 'ST',
  ST: 'ST',
};

/** How much a level counts toward Focus (higher level = more worth the effort). */
export const LEVEL_WEIGHT: Record<Level, number> = { 1: 1, 2: 0.85, 3: 0.6, 4: 0.35, 5: 0.3 };

/** Focus cut-offs on `urgency*0.7 + levelWeight*100*0.3`. */
export const FOCUS_THRESHOLDS = { push: 62, active: 50, maintain: 39 } as const;

/** Target share of effort per Focus group (used by the dashboard effort bar). */
export const EFFORT_TARGET: Record<Focus, number> = { 1: 45, 2: 30, 3: 15, 4: 10 };

/* ───────── background worker cadence ───────── */
/** Skip a player entirely if it was recomputed more recently than this (unless forced). */
export const MIN_RECOMPUTE_MS = 2 * 60 * 60 * 1000;
/** Re-run the AI analyst (Gemini + Google Search) at least this often, or earlier if the facts changed. */
export const ANALYST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Input cache lifetimes. */
export const TTL = {
  news: 5 * 60 * 60 * 1000,
  stats: 3 * 24 * 60 * 60 * 1000,
  intel: 7 * 24 * 60 * 60 * 1000,
  fm: 14 * 24 * 60 * 60 * 1000,
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

/** Draft meaning of each level per market (given to the AI analyst and shown in the UI help). */
export const LEVEL_DEFINITIONS: Record<Level, { en: string; he: string }> = {
  1: { en: 'Elite — top-5 league / Champions League starter, or key player of a title winner in Israel', he: 'עילית — פותח בליגה מהחמש הגדולות / ליגת האלופות, או שחקן מפתח באלופה בישראל' },
  2: { en: 'Premium — strong European leagues or top-3 club in Israel / Saudi & UAE starter', he: 'פרימיום — ליגות אירופה חזקות או קבוצה מהשלישייה בישראל / פותח בסעודיה ובאיחוד' },
  3: { en: 'Core — reliable top-flight starter (mid-table Israel, mid-tier Europe, Gulf mid-table)', he: 'ליבה — פותח עקבי בליגה הבכירה (אמצע טבלה בישראל, אירופה בינונית, אמצע טבלה במפרץ)' },
  4: { en: 'Depth — rotation player / lower leagues', he: 'עומק — שחקן רוטציה / ליגות נמוכות' },
  5: { en: 'Developing — unproven, long-shot or declining', he: 'בפיתוח — לא מוכח, הימור ארוך או בירידה' },
};
