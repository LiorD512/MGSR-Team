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

// ── Candidate discovery ──────────────────────────────────────────────────────

/** A raw image candidate, before download/validation. */
export interface PhotoCandidate {
  playerId: string | null;
  imageUrl: string;
  /** Provider that returned it (serper / serpapi / google_cse). */
  source: string;
  /** Origin page the image was found on, when the provider reports one. */
  sourceUrl: string | null;
  /** The exact query that surfaced this candidate (for auditing). */
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
}

/** Why a downloaded candidate was discarded before ranking. */
export interface RejectedCandidate {
  imageUrl: string;
  source: string;
  reason: string;
}

// ── Source trust ─────────────────────────────────────────────────────────────

export type SourceTrustTier =
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

/** Gemini's opinion on a single candidate. Advisory only — one signal. */
export interface IdentityVerdict {
  /** 0–100 plausibility that this is the real requested player. */
  identityConfidence: number;
  /** How many distinct people Gemini sees in the frame. */
  peopleCount: number | null;
  /** Whether exactly one subject is clearly usable for a MATCHDAY crop. */
  singleClearSubject: boolean;
  /** Gemini's read on whether this is a photograph (vs logo/graphic/art). */
  isPhotograph: boolean;
  reasons: string[];
  /** True when the verdict came from Gemini; false when it was skipped. */
  usedGemini: boolean;
}

export type RankDecision = 'accept' | 'review' | 'reject';

/** A fully scored candidate. */
export interface RankedCandidate {
  imageUrl: string;
  source: string;
  sourceUrl: string | null;
  searchQuery: string;
  width: number;
  height: number;
  fileSize: number;

  // Component scores (each 0–100).
  searchRelevanceScore: number;
  sourceTrustScore: number;
  imageQualityScore: number;
  compositionScore: number;
  identityConfidence: number;

  finalScore: number;
  decision: RankDecision;
  reasons: string[];

  /** Face / people signals surfaced for the debug UI. */
  peopleCount: number | null;
  singleClearSubject: boolean;
  usedGemini: boolean;
}

// ── Pipeline result ──────────────────────────────────────────────────────────

export interface PlayerPhotoSearchInput {
  playerId: string | null;
  playerName: string;
  club?: string | null;
  country?: string | null;
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
  /** Whether a Gemini key is present (not the key). */
  geminiConfigured: boolean;
  queryCount: number;
  candidatesDiscovered: number;
  candidatesDownloaded: number;
  candidatesRejected: number;
  /** Number of Gemini vision calls actually made this run. */
  geminiCalls: number;
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
  sourceUrl: string | null;
  identityScore: number;
  qualityScore: number;
  finalScore: number;
  approvalStatus: ApprovalStatus;
  width: number;
  height: number;
  discoveredAt: number;
}
