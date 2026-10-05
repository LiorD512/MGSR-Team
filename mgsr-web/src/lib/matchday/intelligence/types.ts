/**
 * MATCHDAY Player Image Intelligence — shared types.
 *
 * This layer is ADDITIVE. It does not touch the renderer, the facts/crests
 * modules, or the existing manual `matchdayPhotoUrl` mechanism. Its single job
 * is to answer one question safely:
 *
 *     "Can we automatically find a high-quality, REAL photograph of the
 *      correct player — and prove it is actually them?"
 *
 * Nothing here generates or modifies a player. We only discover, download,
 * validate, rank and cache photographs that already exist in the wild.
 */

// ── Provider architecture ────────────────────────────────────────────────────

/**
 * Coarse category of where a candidate came from — surfaced in the UI and used
 * by the ranker so identity-strong origins (the player's own Instagram) are
 * trusted above generic search, independent of pixel quality.
 */
export type SourceType = 'INSTAGRAM' | 'CLUB' | 'MEDIA' | 'SEARCH';

/**
 * A photo-discovery provider. Each provider turns a player into raw candidates
 * in a normalised shape the shared pipeline understands. New authorized sources
 * (an official Instagram media API, a club media API, …) can be added by
 * implementing this interface — nothing downstream changes.
 */
export interface PhotoProvider {
  /** Stable id, e.g. 'instagram' | 'image_search'. */
  readonly id: string;
  /** True when this provider is usable for the given player + environment. */
  isAvailable(input: PlayerPhotoSearchInput): boolean;
  /** Produce raw candidates (no download/validation here). */
  findPlayerPhotos(input: PlayerPhotoSearchInput): Promise<ProviderResult>;
}

/** What a provider returns: its candidates plus auditing metadata. */
export interface ProviderResult {
  providerId: string;
  candidates: PhotoCandidate[];
  /** Raw hit count before URL de-dup (diagnostics). */
  rawHitCount: number;
  /** Queries/handles this provider issued (diagnostics). */
  queries: string[];
  /** Underlying search backends that returned ≥1 hit (diagnostics). */
  backendsUsed: string[];
  /** Human note, e.g. why a provider produced nothing. */
  note?: string;
}

// ── Candidate discovery ──────────────────────────────────────────────────────

/** A raw image candidate, before download/validation. */
export interface PhotoCandidate {
  playerId: string | null;
  imageUrl: string;
  /** Underlying backend that returned it (serper / serpapi / google_cse / provider). */
  source: string;
  /** Which provider surfaced it (instagram / image_search). */
  provider: string;
  /** Coarse category used for trust + UI badges. */
  sourceType: SourceType;
  /** Origin page the image was found on, when known. */
  sourceUrl: string | null;
  /** The exact query/handle that surfaced this candidate (for auditing). */
  searchQuery: string;
  discoveredAt: number;
}

/** A candidate that has been downloaded and measured. */
export interface DownloadedCandidate extends PhotoCandidate {
  width: number;
  height: number;
  /** Byte length of the downloaded image. */
  fileSize: number;
  /** mime type reported/validated for the bytes. */
  mimeType: string;
  /** Normalised PNG bytes, kept in-memory only during a request. */
  bytes: Buffer;
  /** Perceptual dHash (hex) for near-duplicate collapsing. */
  perceptualHash: string | null;
}

/** The stage at which a candidate was discarded (for the diagnostics funnel). */
export type RejectStage =
  | 'technical'
  | 'perceptual_duplicate'
  | 'graphic'
  | 'identity'
  | 'suitability';

/** Why a candidate was discarded. */
export interface RejectedCandidate {
  imageUrl: string;
  source: string;
  stage: RejectStage;
  reason: string;
}

// ── Source trust ─────────────────────────────────────────────────────────────

export type SourceTrustTier =
  | 'player_instagram'
  | 'official_club'
  | 'verified_social'
  | 'major_media'
  | 'transfermarkt'
  | 'football_site'
  | 'image_site'
  | 'unknown';

export interface SourceTrustResult {
  tier: SourceTrustTier;
  /** 0–100. */
  score: number;
  /** Short human explanation, surfaced in the debug UI. */
  reason: string;
}

// ── Ranking ──────────────────────────────────────────────────────────────────

/**
 * Gemini's classification of a single EXISTING photo. Gemini NEVER generates or
 * alters anything — it only answers questions about what is already in frame.
 * Identity is the decisive signal; the rest inform MATCHDAY suitability.
 */
export interface IdentityVerdict {
  /** 0–100 plausibility that this is the real requested player. */
  identityConfidence: number;
  /** How many distinct people Gemini sees in the frame. */
  peopleCount: number | null;
  /** Whether exactly one subject is clearly usable for a MATCHDAY crop. */
  singleClearSubject: boolean;
  /** Gemini's read on whether this is a real photograph (vs logo/graphic/art). */
  isPhotograph: boolean;
  /** Whether the subject is a football player (kit / pitch / football context). */
  isFootballPlayer: boolean;
  /** Explicit graphic/poster/collage/screenshot flags (per spec §3). */
  isGraphic: boolean;
  isPoster: boolean;
  isCollage: boolean;
  isScreenshot: boolean;
  hasLargeText: boolean;
  /** Convenience: any of graphic/poster/collage/screenshot/large-text. */
  isGraphicOrPoster: boolean;
  /** True when a human face is clearly visible (not away/obstructed/tiny). */
  faceClearlyVisible: boolean;
  /** True when enough of the body/upper body is visible for a 9:16 crop. */
  bodyVisible: boolean;
  /** 0–100 Gemini's own read on MATCHDAY suitability (framing/pose/clarity). */
  matchdaySuitability: number;
  /**
   * True only when identity was judged against the supplied reference image
   * (profileImage), which makes the confidence meaningfully stronger.
   */
  comparedToReference: boolean;
  reasons: string[];
  /** True when the verdict came from Gemini; false when it was skipped. */
  usedGemini: boolean;
}

/**
 * `unverified` is distinct from `reject`: the candidate is not disqualified, but
 * identity could not be model-verified (e.g. Gemini unavailable), so it can
 * never auto-ACCEPT. It is surfaced for human REVIEW only.
 */
export type RankDecision = 'accept' | 'review' | 'reject' | 'unverified';

/** A fully scored candidate. */
export interface RankedCandidate {
  imageUrl: string;
  source: string;
  /** Which provider surfaced it (instagram / image_search). */
  provider: string;
  /** Coarse category: INSTAGRAM | CLUB | MEDIA | SEARCH. */
  sourceType: SourceType;
  sourceUrl: string | null;
  searchQuery: string;
  width: number;
  height: number;
  fileSize: number;

  // Component scores (each 0–100), kept SEPARATE on purpose. Identity is a hard
  // gate — the others never rescue a weak identity score.
  identityScore: number;
  photoQualityScore: number;
  compositionScore: number;
  sourceTrustScore: number;
  matchdaySuitabilityScore: number;
  searchRelevanceScore: number;
  /** Blend of the NON-identity signals, only meaningful once identity passes. */
  finalScore: number;

  decision: RankDecision;
  reasons: string[];
  /** Explicit rejection reasons (subset of reasons, spec §11). */
  rejectionReasons: string[];

  /** Signals surfaced for the debug UI. */
  peopleCount: number | null;
  singleClearSubject: boolean;
  faceVisible: boolean;
  bodyVisible: boolean;
  isRealPhotograph: boolean;
  isSinglePerson: boolean;
  isGraphic: boolean;
  isPoster: boolean;
  isCollage: boolean;
  isScreenshot: boolean;
  comparedToReference: boolean;
  usedGemini: boolean;

  /** Perceptual hash (dHash hex) used for near-duplicate collapsing. */
  perceptualHash: string | null;
}

// ── Pipeline result ──────────────────────────────────────────────────────────

export interface PlayerPhotoSearchInput {
  playerId: string | null;
  playerName: string;
  club?: string | null;
  country?: string | null;
  /** The player's Instagram handle (any format); normalised internally. */
  instagramHandle?: string | null;
  /**
   * A known reference photo of the player (e.g. Transfermarkt headshot). Used
   * ONLY to help identity verification — it never becomes the MATCHDAY image.
   */
  profileImage?: string | null;
}

/** Sentinel returned when nothing clears the identity/quality bar. */
export const NO_VERIFIED_PLAYER_IMAGE = 'NO_VERIFIED_PLAYER_IMAGE' as const;

/**
 * Non-sensitive run diagnostics for the debug/validation UI. Deliberately
 * carries NO secrets — only which providers are *configured* (booleans) and
 * aggregate counts/timings.
 */
export interface IntelligenceDiagnostics {
  /** Which image-search providers are configured (never the keys themselves). */
  providersConfigured: {
    serper: boolean;
    serpapi: boolean;
    googleCse: boolean;
  };
  /** Which providers actually returned ≥1 hit this run. */
  providersUsed: string[];
  /** Whether a Gemini key is present (not the key). */
  geminiConfigured: boolean;
  /** Whether automatic identity verification was possible this run. */
  identityVerificationAvailable: boolean;

  /** Whether the player had an Instagram handle to search. */
  instagramHandleKnown: boolean;
  /** Normalised handle used (never a credential). */
  instagramUsername: string | null;
  /** Whether a reference image was available for identity comparison. */
  referenceImageAvailable: boolean;

  queryCount: number;
  /** Every query string that was issued. */
  queries: string[];

  // ── Funnel ──
  rawCandidatesDiscovered: number;
  /** Raw candidates that came from the Instagram provider. */
  instagramCandidates: number;
  /** Raw candidates from the fallback image-search provider. */
  otherCandidates: number;
  uniqueAfterUrlDedupe: number;
  uniqueAfterPerceptualDedupe: number;
  technicalRejects: number;
  graphicRejects: number;
  identityRejects: number;
  suitabilityRejects: number;
  geminiCalls: number;
  geminiVerifiedCandidates: number;
  finalCandidates: number;

  /** Whether the result was served from an existing cached/approved image. */
  cacheHit: boolean;
  /** manual_override | approved_auto | none */
  cacheSource: string;
  /** Wall-clock timings in milliseconds. */
  timings: {
    totalMs: number;
    searchMs: number;
    rankMs: number;
  };
}

export interface PlayerPhotoIntelligenceResult {
  playerId: string | null;
  playerName: string;
  club: string | null;
  country: string | null;
  queries: string[];
  foundCount: number;
  downloadedCount: number;
  rejectedCount: number;
  rejected: RejectedCandidate[];
  /** Up to 3, best first. Empty when nothing qualifies. */
  topCandidates: RankedCandidate[];
  /** The recommended MATCHDAY source URL, or the sentinel. */
  recommended: string | typeof NO_VERIFIED_PLAYER_IMAGE;
  /** Whether the Gemini verification layer actually ran. */
  geminiUsed: boolean;
  /** Run diagnostics for the validation UI (no secrets). */
  diagnostics: IntelligenceDiagnostics;
}

// ── Firestore cache record ───────────────────────────────────────────────────

export type ApprovalStatus = 'approved' | 'review' | 'rejected';

/** One stored entry in a player's MATCHDAY image library. */
export interface MatchdayPlayerImageRecord {
  playerId: string;
  /** Public Storage URL of the cached copy we keep. */
  storageUrl: string;
  /** Storage object path. */
  storagePath: string;
  /** The original web URL we discovered it at. */
  originalUrl: string;
  source: string;
  /** Provider + coarse category this came from. */
  provider: string;
  sourceType: SourceType;
  sourceUrl: string | null;
  identityScore: number;
  qualityScore: number;
  matchdaySuitabilityScore: number;
  finalScore: number;
  approvalStatus: ApprovalStatus;
  width: number;
  height: number;
  discoveredAt: number;
}

/**
 * Cached identity-verification verdict for a specific image, keyed by its
 * perceptual hash, so the same photo is never re-sent to Gemini. Scoped per
 * player (same photo, different target player, is a different question).
 */
export interface CachedIdentityVerdict {
  perceptualHash: string;
  playerId: string;
  identityConfidence: number;
  isPhotograph: boolean;
  isFootballPlayer: boolean;
  isGraphic: boolean;
  isPoster: boolean;
  isCollage: boolean;
  isScreenshot: boolean;
  hasLargeText: boolean;
  faceClearlyVisible: boolean;
  bodyVisible: boolean;
  singleClearSubject: boolean;
  peopleCount: number | null;
  matchdaySuitability: number;
  comparedToReference: boolean;
  cachedAt: number;
}
