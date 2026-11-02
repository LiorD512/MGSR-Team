/**
 * MATCHDAY v3 caches (server-only). Everything here is best-effort: a cache
 * miss or a storage error never fails a generation, it just costs time/money.
 *
 *  - Cutouts   : the Gemini cutout of a (photo, kit, number) is identical for
 *                every design, so it is computed ONCE. Stored in Firebase
 *                Storage (`matchday-cache/cutouts/<key>.png`) when Admin is
 *                configured, and always in a small in-process LRU.
 *  - Crests    : resolveCrest() hits several sites; keep the result for an hour.
 *
 * Bump CACHE_VERSION whenever cutout preparation changes (keying, despill …).
 */
import { createHash } from 'crypto';
import { getFirebaseAdmin, adminBucket } from '@/lib/firebaseAdmin';

const CACHE_VERSION = 'v1';
const MEM_MAX = 24;
const mem = new Map<string, Buffer>();

function memGet(key: string): Buffer | null {
  const hit = mem.get(key);
  if (!hit) return null;
  mem.delete(key); // refresh LRU order
  mem.set(key, hit);
  return hit;
}
function memSet(key: string, buf: Buffer) {
  mem.delete(key);
  mem.set(key, buf);
  while (mem.size > MEM_MAX) {
    const oldest = mem.keys().next().value;
    if (oldest === undefined) break;
    mem.delete(oldest);
  }
}

/** Stable key for "this photo, with this kit reference and number". */
export function cutoutKey(photo: Buffer, kit: Buffer | null, squadNumber: string | null, slot = 'main'): string {
  const h = createHash('sha1');
  h.update(photo);
  h.update(kit ?? 'nokit');
  h.update(`|${squadNumber ?? ''}|${slot}|${CACHE_VERSION}`);
  return h.digest('hex');
}

function path(key: string) {
  return `matchday-cache/cutouts/${key}.png`;
}

export async function getCachedCutout(key: string): Promise<Buffer | null> {
  const m = memGet(key);
  if (m) return m;
  if (!getFirebaseAdmin()) return null;
  try {
    const file = (await adminBucket()).file(path(key));
    const [exists] = await file.exists();
    if (!exists) return null;
    const [bytes] = await file.download();
    memSet(key, bytes);
    return bytes;
  } catch {
    return null;
  }
}

export async function putCachedCutout(key: string, png: Buffer): Promise<void> {
  memSet(key, png);
  if (!getFirebaseAdmin()) return;
  try {
    await (await adminBucket()).file(path(key)).save(png, { contentType: 'image/png', resumable: false });
  } catch (e) {
    console.warn('[matchday cache] could not store cutout:', (e as Error).message);
  }
}

// ── crests ────────────────────────────────────────────────────────────────
const crestMem = new Map<string, { at: number; bytes: Buffer | null }>();
const CREST_TTL = 60 * 60 * 1000;

export async function cachedCrest(
  team: string,
  logo: string | null,
  resolve: () => Promise<Buffer | null>
): Promise<Buffer | null> {
  const key = `${team.trim().toLowerCase()}|${logo ?? ''}`;
  const hit = crestMem.get(key);
  if (hit && Date.now() - hit.at < CREST_TTL) return hit.bytes;
  const bytes = await resolve();
  if (bytes) crestMem.set(key, { at: Date.now(), bytes }); // never cache misses
  return bytes;
}
