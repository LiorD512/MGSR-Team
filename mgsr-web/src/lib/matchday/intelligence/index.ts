/**
 * MATCHDAY Player Image Intelligence — orchestration entrypoint.
 *
 *   discover (broad) → URL-dedupe → download/validate → graphic-reject →
 *   perceptual-dedupe → Gemini identity+suitability classify → score →
 *   hard identity gate → Top 3–5.
 *
 * This is the only function callers need to run the discovery layer. It does
 * NOT write anything or touch the renderer; approval/caching is a separate,
 * explicit step (`cachePlayerPhoto.approvePlayerImage`). It never lowers the
 * identity bar to produce a result — `NO_VERIFIED_PLAYER_IMAGE` is a valid,
 * correct outcome.
 */

import { findPlayerPhotos, imageSearchConfigured, providersConfigured } from './findPlayerPhotos';
import { rankPhotos, geminiVerificationConfigured, type RankOptions } from './rankPhotos';
import {
  NO_VERIFIED_PLAYER_IMAGE,
  type IntelligenceDiagnostics,
  type PlayerPhotoIntelligenceResult,
  type PlayerPhotoSearchInput,
} from './types';

export * from './types';
export { buildQueries, findPlayerPhotos, imageSearchConfigured, providersConfigured } from './findPlayerPhotos';
export { rankPhotos, geminiVerificationConfigured } from './rankPhotos';
export { scoreSource, TRUST_TIER_SCORE } from './sourceTrust';
export { perceptualHash, hammingDistance, isNearDuplicate } from './perceptualHash';
export {
  approvePlayerImage,
  getApprovedPlayerImage,
  getManualOverrideUrl,
  resolveExistingPlayerImage,
} from './cachePlayerPhoto';

/** How many final candidates to surface (3–5). */
const TOP_N = 5;

export interface DiscoverOptions extends RankOptions {
  /** Cache state the caller already resolved (for diagnostics only). */
  cacheHit?: boolean;
  cacheSource?: string;
}

export async function discoverPlayerPhotos(
  input: PlayerPhotoSearchInput,
  options?: DiscoverOptions
): Promise<PlayerPhotoIntelligenceResult> {
  const startedAt = Date.now();

  const diagnostics: IntelligenceDiagnostics = {
    providersConfigured: providersConfigured(),
    providersUsed: [],
    geminiConfigured: geminiVerificationConfigured(),
    identityVerificationAvailable: geminiVerificationConfigured() && options?.useGemini !== false,
    queryCount: 0,
    queries: [],
    rawCandidatesDiscovered: 0,
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

  const searchStart = Date.now();
  const { queries, candidates, rawHitCount, providersUsed } = await findPlayerPhotos(input);
  diagnostics.timings.searchMs = Date.now() - searchStart;

  base.queries = queries;
  base.foundCount = candidates.length;
  diagnostics.queryCount = queries.length;
  diagnostics.queries = queries;
  diagnostics.providersUsed = providersUsed;
  diagnostics.rawCandidatesDiscovered = rawHitCount;
  diagnostics.uniqueAfterUrlDedupe = candidates.length;

  if (candidates.length === 0) {
    diagnostics.timings.totalMs = Date.now() - startedAt;
    return base;
  }

  const rankStart = Date.now();
  const outcome = await rankPhotos(candidates, input, queries, options);
  diagnostics.timings.rankMs = Date.now() - rankStart;

  base.downloadedCount = outcome.downloadedCount;
  base.rejected = outcome.rejected;
  base.rejectedCount =
    outcome.rejected.length + outcome.ranked.filter((r) => r.decision === 'reject').length;
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

  // Recommend ONLY when the best candidate is a full ACCEPT. ACCEPT already
  // requires Gemini-verified identity ≥ 80 on a clean, suitable photograph, so
  // this is the identity-safety contract: anything less → sentinel → manual
  // upload fallback. Never "close enough".
  const best = outcome.ranked[0];
  base.recommended = best && best.decision === 'accept' ? best.imageUrl : NO_VERIFIED_PLAYER_IMAGE;

  diagnostics.timings.totalMs = Date.now() - startedAt;
  return base;
}
