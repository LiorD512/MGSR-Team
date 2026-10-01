/**
 * MATCHDAY image generator — shared types.
 *
 * Nothing in this feature is generated. Every pixel is either a photograph a
 * human curated, a real club crest, or vector type we laid out ourselves. The
 * poster is rendered deterministically, so the same fixture always produces the
 * same image.
 */

// ── Factual match data (NEVER invented by AI — sourced from the DB/scrapers) ──

export interface MatchdayMatchFacts {
  playerName: string;
  /** Home team display name. */
  homeTeam: string;
  /** Away team display name. */
  awayTeam: string;
  /** Which side the tracked player's club is on. */
  playerSide: 'home' | 'away';
  /** Country of the competition (e.g. "Uzbekistan") — single, never duplicated. */
  country: string | null;
  /** Competition name WITHOUT the country prefix (e.g. "Super League"). */
  competition: string | null;
  round: string | null;
  /** ISO-ish date string as sourced (e.g. "17.09.2026" or raw label). */
  date: string;
  /** Kickoff time (e.g. "19:00") or null when TBC. */
  time: string | null;
  venue: string | null;
  /** Home club logo URL (real, from DB) — never AI generated. */
  homeLogo: string | null;
  /** Away club logo URL (real, from DB) — never AI generated. */
  awayLogo: string | null;
}

// ── Visual assets gathered for the composition ──

export interface MatchdayPlayerImage {
  url: string;
  /** Role the selector assigned this image in the composition. */
  role: 'hero' | 'action' | 'action2';
  /** Where it came from, for auditing/quality control. */
  source: string;
  width?: number;
  height?: number;
}

export interface MatchdayStadiumImage {
  url: string;
  /** Real venue name this image is believed to depict. */
  venue: string;
  source: string;
}

export interface MatchdayAssets {
  playerImages: MatchdayPlayerImage[];
  stadium: MatchdayStadiumImage | null;
}

// ── Design-memory record (Firestore: `matchdayGenerations`) ──

export interface MatchdayGenerationRecord {
  generationId: string;
  playerId: string | null;
  playerName: string;
  matchKey: string;
  playerImagesUsed: string[];
  stadiumImageUsed: string | null;
  /** Storage path of the finished MATCHDAY, when saved. */
  savedImagePath: string | null;
  createdAt: number;
}

// ── Full generation request/response shared between API + UI ──

export interface MatchdayGenerateInput {
  playerId: string | null;
  playerName: string;
  tmProfile?: string | null;
  club: string;
  clubCountry?: string | null;
  clubLogo?: string | null;
  /**
   * The curated player photograph. Required — generation is refused without
   * one, because the only way to guarantee the face is right is to use a
   * picture a human chose.
   */
  playerPhotoUrl?: string | null;
  /** Curated stadium photograph for the band behind the player. */
  stadiumPhotoUrl?: string | null;
}

export interface MatchdayGenerateResult {
  generationId: string;
  /** Data URL (base64) of the finished 9:16 MATCHDAY image. */
  imageDataUrl: string;
  facts: MatchdayMatchFacts;
  assets: MatchdayAssets;
  /** Quality-control findings surfaced to the UI. */
  qualityChecks: MatchdayQualityCheck[];
}

export interface MatchdayQualityCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
}
