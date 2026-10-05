/**
 * MATCHDAY Player Image Intelligence — orchestration entrypoint.
 *
 *   providers (Instagram PRIMARY → image-search FALLBACK) → URL-dedupe →
 *   download/validate → graphic-reject → perceptual-dedupe →
 *   Gemini identity+suitability classify (vs reference image) → score →
 *   hard identity gate → Top 3–5.
 *
 * This is the only function callers need. It does NOT write anything to the
 * image library or touch the renderer; approval/caching of a chosen photo is a
 * separate, explicit step (`cachePlayerPhoto.approvePlayerImage`). It never
 * lowers the identity bar to produce a result — `NO_VERIFIED_PLAYER_IMAGE` is a
 * valid, correct outcome. It never generates or alters a player.
 */

import { findPlayerPhotos, imageSearchConfigured, providersConfigured, normalizeInstagramHandle } from './findPlayerPhotos';
import { rankPhotos, geminiVerificationConfigured, type RankOptions } from './rankPhotos';
import { firestoreVerdictCache, fetchReferenceImage } from './cachePlayerPhoto';
import {
  NO_VERIFIED_PLAYER_IMAGE,
  type IntelligenceDiagnostics,
  type PlayerPhotoIntelligenceResult,
  type PlayerPhotoSearchInput,
} from './types';

export * from './types';
export {
  buildQueries,
  buildSearchQueries,
  findPlayerPhotos,
  imageSearchConfigured,
  providersConfigured,
  normalizeInstagramHandle,
} from './findPlayerPhotos';
export { rankPhotos, geminiVerificationConfigured } from './rankPhotos';
export { scoreSource, scoreCandidateSource, TRUST_TIER_SCORE } from './sourceTrust';
export { perceptualHash, hammingDistance, isNearDuplicate } from './perceptualHash';
export { InstagramPhotoProvider } from './providers/instagramProvider';
export { ImageSearchProvider } from './providers/imageSearchProvider';
export {
  approvePlayerImage,
  getApprovedPlayerImage,
  getManualOverrideUrl,
  resolveExistingPlayerImage,
  firestoreVerdictCache,
  fetchReferenceImage,
} from './cachePlayerPhoto';

/** How many final candidates to surface (3–5). */
const TOP_N = 5;

export interface DiscoverOptions extends RankOptions {
  cacheHit?: boolean;
  cacheSource?: string;
  /** Enable the Firestore verdict cache (requires Admin + a playerId). */
  useVerdictCache?: boolean;
}

export async function discoverPlayerPhotos(
  input: PlayerPhotoSearchInput,
  options?: DiscoverOptions
): Promise<PlayerPhotoIntelligenceResult> {
  const startedAt = Date.now();
  const username = normalizeInstagramHandle(input.instagramHandle);

  const diagnostics: IntelligenceDiagnostics = {
    providersConfigured: providersConfigured(),
    providersUsed: [],
    geminiConfigured: geminiVerificationConfigured(),
    identityVerificationAvailable: geminiVerificationConfigured() && options?.useGemini !== false,
    instagramHandleKnown: Boolean(username),
    instagramUsername: username,
    referenceImageAvailable: false,
    queryCount: 0,
    queries: [],
    rawCandidatesDiscovered: 0,
    instagramCandidates: 0,
    otherCandidates: 0,
    uniqueAfterUrlDedupe: 0,
    uniqueAfterPerceptualDedupe: 0,
    technicalRejects: 0,
    graphicRejects: 0,
    identityRejects: 0,
    suitabilityRejects: 0,
    geminiCalls: 0,
    geminiVerifiedCandidates: 0,
    finalCandidates: 0,
    cacheHit: options?.cacheHit ?? false,
    cacheSource: options?.cacheSource ?? 'none',
    timings: { totalMs: 0, searchMs: 0, rankMs: 0 },
  };

  const base: PlayerPhotoIntelligenceResult = {
    playerId: input.playerId,
    playerName: input.playerName,
    club: input.club ?? null,
    country: input.country ?? null,
    queries: [],
    foundCount: 0,
    downloadedCount: 0,
    rejectedCount: 0,
    rejected: [],
    topCandidates: [],
    recommended: NO_VERIFIED_PLAYER_IMAGE,
    geminiUsed: false,
    diagnostics,
  };

  if (!imageSearchConfigured()) {
    base.rejected = [{ imageUrl: '', source: 'config', stage: 'technical', reason: 'No image-search provider configured' }];
    diagnostics.timings.totalMs = Date.now() - startedAt;
    return base;
  }

  // ── Discovery (providers) ──
  const searchStart = Date.now();
  const found = await findPlayerPhotos(input);
  diagnostics.timings.searchMs = Date.now() - searchStart;

  base.queries = found.queries;
  base.foundCount = found.candidates.length;
  diagnostics.queryCount = found.queries.length;
  diagnostics.queries = found.queries;
  diagnostics.providersUsed = found.providersUsed;
  diagnostics.rawCandidatesDiscovered = found.rawHitCount;
  diagnostics.instagramCandidates = found.instagramCount;
  diagnostics.otherCandidates = found.otherCount;
  diagnostics.uniqueAfterUrlDedupe = found.candidates.length;

  if (found.candidates.length === 0) {
    diagnostics.timings.totalMs = Date.now() - startedAt;
    return base;
  }

  // ── Reference image (identity aid only) + verdict cache ──
  const reference = await fetchReferenceImage(input.profileImage);
  diagnostics.referenceImageAvailable = Boolean(reference);

  const rankStart = Date.now();
  const outcome = await rankPhotos(found.candidates, input, found.queries, {
    useGemini: options?.useGemini,
    maxDownloads: options?.maxDownloads,
    maxGeminiChecks: options?.maxGeminiChecks,
    referenceImage: reference,
    verdictCache: options?.useVerdictCache && input.playerId ? firestoreVerdictCache() : undefined,
  });
  diagnostics.timings.rankMs = Date.now() - rankStart;

  base.downloadedCount = outcome.downloadedCount;
  base.rejected = outcome.rejected;
  base.rejectedCount = outcome.rejected.length + outcome.ranked.filter((r) => r.decision === 'reject').length;
  base.geminiUsed = outcome.geminiUsed;
  base.topCandidates = outcome.ranked.slice(0, TOP_N);

  diagnostics.uniqueAfterPerceptualDedupe = outcome.uniqueAfterPerceptual;
  diagnostics.technicalRejects = outcome.technicalRejects;
  diagnostics.graphicRejects = outcome.graphicRejects;
  diagnostics.identityRejects = outcome.identityRejects;
  diagnostics.suitabilityRejects = outcome.suitabilityRejects;
  diagnostics.geminiCalls = outcome.geminiCalls;
  diagnostics.geminiVerifiedCandidates = outcome.geminiVerifiedCandidates;
  diagnostics.finalCandidates = base.topCandidates.length;

  // Recommend ONLY when the best candidate is a full ACCEPT (Gemini-verified
  // identity ≥ 85 on a clean, suitable photo). Anything less → sentinel →
  // manual upload fallback. Never "close enough".
  const best = outcome.ranked[0];
  base.recommended = best && best.decision === 'accept' ? best.imageUrl : NO_VERIFIED_PLAYER_IMAGE;

  diagnostics.timings.totalMs = Date.now() - startedAt;
  return base;
}
