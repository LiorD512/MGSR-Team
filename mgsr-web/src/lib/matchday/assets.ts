/**
 * Image fetching and validation for MATCHDAY.
 *
 * This used to search the web for player photographs by name. It cannot work:
 * footballers share names, and a search result is matched on a caption, not a
 * face — so the poster could confidently feature a different person. Photographs
 * are now curated by a human and this module only checks that what they
 * supplied is a real, reachable, large-enough image.
 */

import sharp from 'sharp';
import type { ImageHit } from './imageSearch';

/** A validated, in-memory image. */
export interface FetchedImage {
  url: string;
  source: string;
  bytes: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

const FETCH_TIMEOUT = 20_000;

/**
 * Minimum usable size, expressed per-axis rather than as a single number: the
 * panels a photo fills are not square, so a symmetric floor either rejects
 * perfectly good landscape photos or lets through ones too short to cover the
 * player panel without enlargement.
 */
export interface SizeFloor {
  minWidth: number;
  minHeight: number;
}

export async function fetchAndValidate(
  hit: ImageHit,
  floor: SizeFloor = { minWidth: 200, minHeight: 200 }
): Promise<FetchedImage | null> {
  try {
    const res = await fetch(hit.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/148 Safari/537.36',
        accept: 'image/avif,image/webp,image/png,image/jpeg,*/*',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType && !contentType.startsWith('image/')) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength < 1024) return null;

    const meta = await sharp(bytes).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < floor.minWidth || height < floor.minHeight) return null;

    // Normalise to PNG so the renderer has a predictable format.
    const png = await sharp(bytes).png().toBuffer();
    return { url: hit.url, source: hit.source, bytes: png, mimeType: 'image/png', width, height };
  } catch {
    return null;
  }
}
