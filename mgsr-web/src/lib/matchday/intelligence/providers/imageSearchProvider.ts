/**
 * ImageSearchProvider — the FALLBACK photo source.
 *
 * Wraps the existing broad web image search (Serper → SerpAPI → Google CSE) as a
 * PhotoProvider. Used when Instagram does not supply enough usable photographs.
 * Candidates are tagged `sourceType: 'SEARCH'`; the ranker trusts them below the
 * player's own Instagram.
 */

import { searchImages, imageSearchConfigured, type ImageHit } from '@/lib/matchday/imageSearch';
import type {
  PhotoCandidate,
  PhotoProvider,
  PlayerPhotoSearchInput,
  ProviderResult,
} from '../types';

const PER_QUERY = 12;

/**
 * Build ~12–15 targeted queries. Breadth matters: a player with little web
 * presence may only appear under one phrasing, and more raw candidates means
 * more chances at a clean, verifiable photo.
 */
export function buildSearchQueries(input: PlayerPhotoSearchInput): string[] {
  const name = input.playerName.trim();
  const club = input.club?.trim();
  const country = input.country?.trim();
  if (!name) return [];

  const q = `"${name}"`;
  const year = new Date().getFullYear();
  const queries = [
    `${q} football`,
    club ? `${q} ${club}` : '',
    club ? `${q} ${club} player` : '',
    country ? `${q} ${country} footballer` : '',
    `${q} football match`,
    `${q} training`,
    club ? `${q} ${club} instagram` : '',
    club ? `${q} ${club} interview` : '',
    club ? `${q} ${club} presentation` : '',
    `${q} goal`,
    `${q} footballer`,
    `${q} ${year}`,
    `${q} ${year + 1}`,
  ]
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return Array.from(new Set(queries));
}

function foldUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return `${u.host}${u.pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export class ImageSearchProvider implements PhotoProvider {
  readonly id = 'image_search';

  isAvailable(_input: PlayerPhotoSearchInput): boolean {
    return imageSearchConfigured();
  }

  async findPlayerPhotos(input: PlayerPhotoSearchInput): Promise<ProviderResult> {
    const queries = buildSearchQueries(input);
    if (queries.length === 0 || !imageSearchConfigured()) {
      return { providerId: this.id, candidates: [], rawHitCount: 0, queries, backendsUsed: [] };
    }

    const now = Date.now();
    const perQuery = await Promise.all(
      queries.map(async (query) => {
        try {
          return (await searchImages(query, PER_QUERY)).map((hit: ImageHit) => ({ query, hit }));
        } catch {
          return [] as Array<{ query: string; hit: ImageHit }>;
        }
      })
    );

    const seen = new Set<string>();
    const backends = new Set<string>();
    const candidates: PhotoCandidate[] = [];
    let rawHitCount = 0;
    for (const batch of perQuery) {
      for (const { query, hit } of batch) {
        rawHitCount++;
        if (hit.source) backends.add(hit.source);
        const key = foldUrl(hit.url);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          playerId: input.playerId,
          imageUrl: hit.url,
          source: hit.source,
          provider: this.id,
          sourceType: classifySourceType(hit),
          sourceUrl: hit.pageUrl ?? null,
          searchQuery: query,
          discoveredAt: now,
        });
      }
    }

    return { providerId: this.id, candidates, rawHitCount, queries, backendsUsed: Array.from(backends) };
  }
}

/** Give search hits a coarse category so the UI/trust can distinguish them. */
function classifySourceType(hit: ImageHit): PhotoCandidate['sourceType'] {
  const host = `${hit.pageUrl ?? ''} ${hit.url}`.toLowerCase();
  if (host.includes('instagram.com') || host.includes('cdninstagram')) return 'INSTAGRAM';
  if (/facebook\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com/.test(host)) return 'MEDIA';
  return 'SEARCH';
}
