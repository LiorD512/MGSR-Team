/**
 * MATCHDAY Player Image Intelligence — orchestration entrypoint.
 *
 * find → download/validate → rank → (optional) Gemini verify → choose top 3.
 * This is the only function callers need to run the discovery layer. It does
 * NOT write anything or touch the renderer; approval/caching is a separate,
 * explicit step (`cachePlayerPhoto.approvePlayerImage`).
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
export {
  approvePlayerImage,
  getApprovedPlayerImage,
  getManualOverrideUrl,
  resolveExistingPlayerImage,
} from './cachePlayerPhoto';

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
    geminiConfigured: geminiVerificationConfigured(),
    queryCount: 0,
    candidatesDiscovered: 0,
    candidatesDownloaded: 0,
    candidatesRejected: 0,
    geminiCalls: 0,
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
    base.rejected = [{ imageUrl: '', source: 'config', reason: 'No image-search provider configured' }];
    diagnostics.timings.totalMs = Date.now() - startedAt;
    return base;
  }

  const searchStart = Date.now();
  const { queries, candidates } = await findPlayerPhotos(input);
  diagnostics.timings.searchMs = Date.now() - searchStart;

  base.queries = queries;
  base.foundCount = candidates.length;
  diagnostics.queryCount = queries.length;
  diagnostics.candidatesDiscovered = candidates.length;

  if (candidates.length === 0) {
    diagnostics.timings.totalMs = Date.now() - startedAt;
    return base;
  }

  const rankStart = Date.now();
  const { ranked, rejected, downloadedCount, geminiUsed, geminiCalls } = await rankPhotos(
    candidates,
    input,
    queries,
    options
  );
  diagnostics.timings.rankMs = Date.now() - rankStart;

  base.downloadedCount = downloadedCount;
  base.rejected = rejected;
  base.rejectedCount = rejected.length + ranked.filter((r) => r.decision === 'reject').length;
  base.geminiUsed = geminiUsed;
  base.topCandidates = ranked.slice(0, 3);

  diagnostics.candidatesDownloaded = downloadedCount;
  diagnostics.candidatesRejected = base.rejectedCount;
  diagnostics.geminiCalls = geminiCalls;

  // Recommend only when the best candidate was actually accepted. Anything less
  // returns the sentinel so the caller falls back to manual upload rather than
  // risking the wrong face. This is the identity-safety contract — never
  // "close enough".
  const best = ranked[0];
  base.recommended =
    best && best.decision === 'accept' ? best.imageUrl : NO_VERIFIED_PLAYER_IMAGE;

  diagnostics.timings.totalMs = Date.now() - startedAt;
  return base;
}
