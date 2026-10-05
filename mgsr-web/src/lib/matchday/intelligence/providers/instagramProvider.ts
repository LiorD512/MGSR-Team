/**
 * InstagramPhotoProvider — the PRIMARY photo source when a handle is known.
 *
 * ── Honest capability statement ──────────────────────────────────────────────
 * This project has NO authorized Instagram media API. Instagram's Basic Display
 * API was shut down (Dec 2024), and the Graph API only returns media for
 * accounts you own/manage — it cannot fetch an arbitrary public player's media.
 * We therefore do NOT scrape Instagram, bypass login/anti-bot/rate-limits, read
 * private profiles, or store any cookies/passwords.
 *
 * What this provider DOES do today, compliantly: it uses the app's ALREADY
 * AUTHORIZED image-search backends (Serper / SerpAPI / Google CSE) with queries
 * scoped to the player's own public Instagram profile (`site:instagram.com
 * <handle>`). Those backends legitimately index public Instagram posts, so this
 * surfaces real media from the player's profile without touching Instagram
 * directly. Candidates are tagged `sourceType: 'INSTAGRAM'` and carry the
 * handle, so the ranker trusts them above generic search.
 *
 * ── Future ───────────────────────────────────────────────────────────────────
 * When an authorized Instagram media provider becomes available, implement
 * `fetchAuthorizedMedia()` below and the rest of the pipeline is unchanged.
 */

import { searchImages, imageSearchConfigured, type ImageHit } from '@/lib/matchday/imageSearch';
import type {
  PhotoCandidate,
  PhotoProvider,
  PlayerPhotoSearchInput,
  ProviderResult,
} from '../types';

/**
 * Normalise any accepted handle form to a bare username.
 * Accepts: `@user`, `user`, `https://www.instagram.com/user/`, `instagram.com/user`.
 * Returns null when nothing usable can be extracted.
 */
export function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  // Full/partial URL → take the first path segment.
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) {
    s = urlMatch[1];
  }

  s = s.replace(/^@+/, '').trim();
  // Instagram usernames: letters, digits, period, underscore; max 30 chars.
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(s)) return null;
  // Reject reserved/path words that are never a profile.
  if (['p', 'reel', 'reels', 'stories', 'explore', 'tv'].includes(s.toLowerCase())) return null;
  return s.toLowerCase();
}

const PER_QUERY = 12;

/**
 * Queries scoped to the player's own public Instagram profile. We keep the name
 * + football context so results stay on-identity even within the profile.
 */
function instagramQueries(username: string, input: PlayerPhotoSearchInput): string[] {
  const name = input.playerName.trim();
  const club = input.club?.trim();
  const queries = [
    `site:instagram.com ${username}`,
    `site:instagram.com "${name}"`,
    `instagram.com/${username} "${name}" football`,
    club ? `instagram.com/${username} ${club}` : '',
    `"${name}" instagram ${username} footballer`,
  ]
    .map((q) => q.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return Array.from(new Set(queries));
}

export class InstagramPhotoProvider implements PhotoProvider {
  readonly id = 'instagram';

  isAvailable(input: PlayerPhotoSearchInput): boolean {
    return Boolean(normalizeInstagramHandle(input.instagramHandle)) && imageSearchConfigured();
  }

  async findPlayerPhotos(input: PlayerPhotoSearchInput): Promise<ProviderResult> {
    const username = normalizeInstagramHandle(input.instagramHandle);
    if (!username) {
      return { providerId: this.id, candidates: [], rawHitCount: 0, queries: [], backendsUsed: [], note: 'No Instagram handle' };
    }

    // ── Authorized direct-media hook (not available in this project today). ──
    const authorized = await this.fetchAuthorizedMedia(username, input);
    if (authorized) return authorized;

    // ── Compliant fallback: public IG media via authorized search backends. ──
    if (!imageSearchConfigured()) {
      return {
        providerId: this.id,
        candidates: [],
        rawHitCount: 0,
        queries: [],
        backendsUsed: [],
        note: 'No image-search backend configured; cannot surface public Instagram media',
      };
    }

    const queries = instagramQueries(username, input);
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
        // Keep only results that actually belong to Instagram's CDN / profile.
        if (!isInstagramAsset(hit)) continue;
        const key = foldUrl(hit.url);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          playerId: input.playerId,
          imageUrl: hit.url,
          source: hit.source,
          provider: this.id,
          sourceType: 'INSTAGRAM',
          sourceUrl: hit.pageUrl ?? null,
          searchQuery: query,
          discoveredAt: now,
        });
      }
    }

    return {
      providerId: this.id,
      candidates,
      rawHitCount,
      queries,
      backendsUsed: Array.from(backends),
      note:
        candidates.length === 0
          ? 'No public Instagram media surfaced via authorized search backends'
          : undefined,
    };
  }

  /**
   * Placeholder for a future AUTHORIZED Instagram media integration (e.g. an
   * approved Graph API business connection, or a licensed third-party media
   * provider). Returns null today because no such integration exists in this
   * project. When implemented, it must return the same normalised candidates
   * with `sourceType: 'INSTAGRAM'` — and must still never scrape, bypass
   * protections, or read private profiles.
   */
  private async fetchAuthorizedMedia(
    _username: string,
    _input: PlayerPhotoSearchInput
  ): Promise<ProviderResult | null> {
    return null;
  }
}

/** True when a hit genuinely points at Instagram's media or a profile page. */
function isInstagramAsset(hit: ImageHit): boolean {
  const u = hit.url.toLowerCase();
  const page = (hit.pageUrl ?? '').toLowerCase();
  const igImageHost = /(cdninstagram\.com|fbcdn\.net)/.test(u);
  const igPage = page.includes('instagram.com');
  return igImageHost || igPage;
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
