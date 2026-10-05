/**
 * Player-specific photo discovery.
 *
 * Builds a set of targeted queries for one player and collects image
 * candidates across every image-search provider the app already has configured
 * (`imageSearch.ts`: Serper → SerpAPI → Google CSE). Social media is just one
 * possible source among many — never the foundation — so queries are phrased
 * around the player's football identity (name + club + country), and the
 * provider results are merged and de-duplicated here.
 *
 * This module does NOT download or judge anything. It only produces the raw
 * candidate list; `rankPhotos.ts` decides what is usable.
 */

import { searchImages, imageSearchConfigured, type ImageHit } from '@/lib/matchday/imageSearch';
import type { PhotoCandidate, PlayerPhotoSearchInput } from './types';

export { imageSearchConfigured };

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

/** How many hits to request per query from the providers. */
const PER_QUERY = 10;

/**
 * Build targeted queries, strongest-identity first. The club + country
 * variants disambiguate players who share a name; the plainer variants widen
 * coverage when a player has little web presence.
 */
export function buildQueries(input: PlayerPhotoSearchInput): string[] {
  const name = input.playerName.trim();
  const club = input.club?.trim();
  const country = input.country?.trim();
  if (!name) return [];

  const q = `"${name}"`;
  const queries = [
    `${q} ${club ?? ''} footballer`.replace(/\s+/g, ' ').trim(),
    club ? `${q} ${club} player` : '',
    country ? `${q} ${country} football` : '',
    `${q} football`,
    `${q} footballer`,
    club ? `${q} ${club}` : '',
  ].filter(Boolean);

  // De-duplicate while preserving order.
  return Array.from(new Set(queries));
}

function normaliseUrl(url: string): string {
  // Fold trivial variants (trailing query noise, scheme) so the same asset at
  // slightly different URLs collapses into one candidate.
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
}

/**
 * Discover candidate photos for a player. Runs the queries in parallel, tags
 * each hit with the query that surfaced it, and de-duplicates by normalised
 * URL (keeping the first/strongest query's attribution).
 */
export async function findPlayerPhotos(input: PlayerPhotoSearchInput): Promise<FindResult> {
  const queries = buildQueries(input);
  if (queries.length === 0 || !imageSearchConfigured()) {
    return { queries, candidates: [] };
  }

  const now = Date.now();
  const perQuery = await Promise.all(
    queries.map(async (query) => {
      try {
        const hits = await searchImages(query, PER_QUERY);
        return hits.map((h: ImageHit) => ({ query, hit: h }));
      } catch {
        return [] as Array<{ query: string; hit: ImageHit }>;
      }
    })
  );

  const seen = new Set<string>();
  const candidates: PhotoCandidate[] = [];
  for (const batch of perQuery) {
    for (const { query, hit } of batch) {
      const key = normaliseUrl(hit.url);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        playerId: input.playerId,
        imageUrl: hit.url,
        source: hit.source,
        sourceUrl: hit.pageUrl ?? null,
        searchQuery: query,
        discoveredAt: now,
      });
    }
  }

  return { queries, candidates };
}
