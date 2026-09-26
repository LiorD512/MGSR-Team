/**
 * MATCHDAY image generator — shared types and the ImageGenerationProvider
 * abstraction.
 *
 * The whole feature is built against these types so the concrete AI image
 * provider (currently Google Gemini) can be swapped without touching the
 * pipeline, the API routes, or the UI. See `providers/` for implementations.
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

// ── Creative direction ──

export type MatchdayMood = 'cinematic' | 'dark' | 'golden_hour' | 'night' | 'dramatic';

export type MatchdayLayout =
  | 'hero_right_action_left'
  | 'hero_left_action_foreground'
  | 'central_hero_two_actions'
  | 'fullbody_foreground_closeup_behind'
  | 'diagonal_runner_portrait_back'
  | 'two_actions_one_portrait'
  | 'stadium_dominant_player_overlay';

export interface MatchdayComposition {
  layout: MatchdayLayout;
  mood: MatchdayMood;
  /** Free-form color-mood descriptor used in the background prompt. */
  colorMood: string;
  lightingStyle: string;
  /** Human-readable summary stored in design memory for de-duplication. */
  summary: string;
}

// ── Provider abstraction ──

export interface GeneratedImage {
  /** Raw image bytes. */
  bytes: Buffer;
  mimeType: string;
}

export interface BackgroundGenerationRequest {
  /** Prompt describing ONLY the cinematic background/atmosphere/stadium grade.
   *  Must never ask the model to draw the player, logos, or factual text. */
  prompt: string;
  /** Optional reference images (e.g. stadium photo) for image-to-image. */
  referenceImages?: GeneratedImage[];
  /** Target aspect ratio; MATCHDAY is always 9:16. */
  aspectRatio: '9:16';
  /** Optional seed for reproducibility / deliberate variation. */
  seed?: number;
}

export interface CutoutRequest {
  /** The REAL player photograph. Identity must be preserved exactly. */
  image: GeneratedImage;
  /** Instruction describing the isolation/grade — never the player's identity. */
  prompt: string;
}

export interface SceneCompositionRequest {
  /** Prompt describing the cinematic scene, layout, mood, lighting. Must forbid
   *  altering the player's identity and forbid drawing logos/text. */
  prompt: string;
  /** The REAL player photos (hero first). Identity preserved exactly. */
  playerImages: GeneratedImage[];
  /** Optional real stadium photo used as the environment reference. */
  stadium?: GeneratedImage;
  aspectRatio: '9:16';
}

/**
 * Contract every AI image backend must satisfy. Keeping this minimal means a
 * new provider only has to know how to turn a prompt (+ optional reference
 * images) into image bytes.
 */
export interface ImageGenerationProvider {
  readonly id: string;
  /** True when the provider has the credentials/config it needs to run. */
  isConfigured(): boolean;
  /** Generate a cinematic background (no people/logos/text). */
  generateBackground(req: BackgroundGenerationRequest): Promise<GeneratedImage>;
  /**
   * Optional: isolate the real player onto a transparent background WITHOUT
   * altering face, hair, kit or body — an edit of the supplied photo, never a
   * regeneration. Providers that cannot do this should omit it; the compositor
   * then falls back to an algorithmic cutout.
   */
  cutoutPlayer?(req: CutoutRequest): Promise<GeneratedImage>;
  /**
   * Optional (preferred): produce a single finished cinematic artwork that
   * integrates the REAL player photo(s) into the scene — relighting, blending,
   * depth and atmosphere — so the result looks designed, not pasted. Identity
   * is preserved exactly; logos/text are never drawn (added deterministically).
   */
  composeScene?(req: SceneCompositionRequest): Promise<GeneratedImage>;
}

// ── Design-memory record (Firestore: `matchdayGenerations`) ──

export interface MatchdayGenerationRecord {
  generationId: string;
  playerId: string | null;
  playerName: string;
  matchKey: string;
  compositionStyle: MatchdayLayout;
  mood: MatchdayMood;
  colorMood: string;
  lightingStyle: string;
  playerImagesUsed: string[];
  stadiumImageUsed: string | null;
  /** Storage path of the finished MATCHDAY, when saved. */
  savedImagePath: string | null;
  createdAt: number;
  providerId: string;
}

// ── Full generation request/response shared between API + UI ──

export interface MatchdayGenerateInput {
  playerId: string | null;
  playerName: string;
  playerImage?: string | null;
  tmProfile?: string | null;
  club: string;
  clubCountry?: string | null;
  clubLogo?: string | null;
  /** Instagram handle (without @) — used to target better real player photos. */
  instagramHandle?: string | null;
  /** Manual overrides (section 15). All optional; empty = fully automatic. */
  overrides?: {
    mood?: MatchdayMood;
    playerImageUrls?: string[];
    stadiumImageUrl?: string;
    layout?: MatchdayLayout;
  };
}

export interface MatchdayGenerateResult {
  generationId: string;
  /** Data URL (base64) of the finished 9:16 MATCHDAY image. */
  imageDataUrl: string;
  facts: MatchdayMatchFacts;
  composition: MatchdayComposition;
  assets: MatchdayAssets;
  /** Quality-control findings surfaced to the UI. */
  qualityChecks: MatchdayQualityCheck[];
  providerId: string;
}

export interface MatchdayQualityCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
}
