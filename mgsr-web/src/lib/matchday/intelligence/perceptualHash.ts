/**
 * Perceptual image hashing for near-duplicate detection.
 *
 * URL de-duplication is not enough: the same photograph is routinely served at
 * different URLs, resized, re-cropped, or embedded inside a graphic. A
 * perceptual hash (here a 64-bit difference hash — "dHash") gives each image a
 * fingerprint that survives resizing and mild re-encoding, so near-identical
 * photographs can be collapsed to a single candidate.
 *
 * dHash is deterministic, cheap, and needs no extra dependency — `sharp` (already
 * used across MATCHDAY) reduces the image to a 9×8 greyscale grid and we compare
 * each pixel to its right neighbour. Hamming distance between two hashes gives a
 * similarity measure: 0 = identical fingerprint, larger = more different.
 */

import sharp from 'sharp';

/** Hamming distance at/below this = "the same photograph" for our purposes. */
export const DUPLICATE_MAX_DISTANCE = 10;

/**
 * Compute a 64-bit dHash and return it as a 16-char hex string. Returns null if
 * the image cannot be processed (caller then treats it as having no hash, i.e.
 * never a duplicate).
 */
export async function perceptualHash(bytes: Buffer): Promise<string | null> {
  try {
    // 9×8 greyscale: 8 horizontal comparisons per row × 8 rows = 64 bits.
    const raw = await sharp(bytes)
      .greyscale()
      .resize(9, 8, { fit: 'fill' })
      .raw()
      .toBuffer();

    let bits = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = raw[row * 9 + col];
        const right = raw[row * 9 + col + 1];
        bits += left < right ? '1' : '0';
      }
    }

    // Pack 64 bits into 16 hex chars.
    let hex = '';
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch {
    return null;
  }
}

/** Hamming distance between two equal-length hex hashes (bit differences). */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

/** True when two hashes are close enough to be the same photograph. */
export function isNearDuplicate(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return hammingDistance(a, b) <= DUPLICATE_MAX_DISTANCE;
}
