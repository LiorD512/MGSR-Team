/**
 * Player-specific photo discovery — provider orchestration.
 *
 * Runs the registered providers in PRIORITY order and merges their candidates:
 *
 *   1. InstagramPhotoProvider  (PRIMARY — when a handle is known)
 *   2. ImageSearchProvider     (FALLBACK — broad web image search)
 *   (ClubPhotoProvider / MediaProvider can be added later; see providers/.)
 *
 * Instagram candidates are kept first so, after cross-provider URL
 * de-duplication, a photo that appears both on the player's Instagram and in
 * generic search is attributed to Instagram (the stronger identity source).
 * This module does NOT download or judge anything — `rankPhotos.ts` does.
 */

import { imageSearchConfigured } from '@/lib/matchday/imageSearch';
import type { PhotoCandidate, PhotoProvider, PlayerPhotoSearchInput } from './types';
import { InstagramPhotoProvider, normalizeInstagramHandle } from './providers/instagramProvider';
import { ImageSearchProvider, buildSearchQueries } from './providers/imageSearchProvider';

export { imageSearchConfigured };
export { normalizeInstagramHandle } from './providers/instagramProvider';
export { buildSearchQueries } from './providers/imageSearchProvider';

/** Back-compat alias: the fallback provider's queries are the "search queries". */
export function buildQueries(input: PlayerPhotoSearchInput): string[] {
  return buildSearchQueries(input);
}

/**
 * Which providers are configured — booleans only, never the key values. Uses
 * the same env var names `imageSearch.ts` reads, so this stays truthful without
 * importing anything secret.
 */
export function providersConfigured(): { serper: boolean; serpapi: boolean; googleCse: boolean } {
  return {
    serper: Boolean(process.env.SERPER_API_KEY?.trim()),
    serpapi: Boolean(process.env.SERPAPI_KEY?.trim()),
    googleCse: Boolean(process.env.GOOGLE_CSE_API_KEY?.trim() && process.env.GOOGLE_CSE_CX?.trim()),
  };
}

/** Providers in PRIORITY order (Instagram first). */
const PROVIDERS: PhotoProvider[] = [new InstagramPhotoProvider(), new ImageSearchProvider()];

function foldUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return `${u.host}${u.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export interface FindResult {
  queries: string[];
  candidates: PhotoCandidate[];
  rawHitCount: number;
  providersUsed: string[];
  /** Raw candidate counts by provider (diagnostics). */
  instagramCount: number;
  otherCount: number;
  instagramUsername: string | null;
  /** Per-provider notes (e.g. why Instagram produced nothing). */
  providerNotes: string[];
}

/**
 * Discover candidate photos for a player by running all available providers in
 * priority order and merging (Instagram first) with cross-provider URL dedup.
 */
export async function findPlayerPhotos(input: PlayerPhotoSearchInput): Promise<FindResult> {
  const username = normalizeInstagramHandle(input.instagramHandle);

  const active = PROVIDERS.filter((p) => p.isAvailable(input));
  const results = await Promise.all(
    // Preserve priority order even though we fetch in parallel.
    active.map(async (p) => ({ p, r: await p.findPlayerPhotos(input) }))
  );
  results.sort(
    (a, b) => PROVIDERS.indexOf(a.p) - PROVIDERS.indexOf(b.p)
  );

  const seen = new Set<string>();
  const providersBackends = new Set<string>();
  const allQueries: string[] = [];
  const providerNotes: string[] = [];
  const candidates: PhotoCandidate[] = [];
  let rawHitCount = 0;
  let instagramCount = 0;
  let otherCount = 0;

  for (const { r } of results) {
    rawHitCount += r.rawHitCount;
    r.backendsUsed.forEach((b) => providersBackends.add(b));
    allQueries.push(...r.queries);
    if (r.note) providerNotes.push(`${r.providerId}: ${r.note}`);
    for (const c of r.candidates) {
      const key = foldUrl(c.imageUrl);
      if (seen.has(key)) continue; // Instagram wins ties (iterated first)
      seen.add(key);
      candidates.push(c);
      if (c.sourceType === 'INSTAGRAM') instagramCount++;
      else otherCount++;
    }
  }

  return {
    queries: Array.from(new Set(allQueries)),
    candidates,
    rawHitCount,
    providersUsed: Array.from(providersBackends),
    instagramCount,
    otherCount,
    instagramUsername: username,
    providerNotes,
  };
}
