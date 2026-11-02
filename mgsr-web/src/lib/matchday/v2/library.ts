/**
 * MATCHDAY player LIBRARY (server-only, Firebase Admin).
 *
 * Every image uploaded for a player is KEPT (uploads used to overwrite each
 * other) in one of two categories:
 *   • 'player' — photos of the player; the operator picks the poster's main
 *                photo (Players.matchdayPhotoUrl) and optional second photo
 *                (Players.matchdayPhoto2Url) from them.
 *   • 'kit'    — official kit references; the operator picks the one used for
 *                the kit swap (Players.matchdayKitUrl), or none.
 *
 *   Firestore : Players/{playerId}/matchdayLibrary/{imageId}
 *   Storage   : matchday-assets/library/{playerId}/{imageId}.{jpg|png}
 *
 * Only REAL photos are used. An experimental AI-pose generator once wrote items
 * with `source: 'ai'`; it was dropped (the generated faces were not the real
 * player), so such leftovers are hidden and are un-selected if still in use.
 *
 * Cutouts are cached by the photo's content hash (cache.ts), so each library
 * photo is cut out at most once, however many posters use it.
 */
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { getFirebaseAdmin, adminDb, adminBucket } from '@/lib/firebaseAdmin';

export type LibraryCategory = 'player' | 'kit';

export interface LibraryItem {
  id: string;
  url: string;
  category: LibraryCategory;
  width: number;
  height: number;
  /** Transparent PNG cutout (no cutout call needed when used). */
  isCutout: boolean;
  createdAt: number;
  createdBy: string | null;
  /** The player's selected photo / kit from before the library existed (not deletable here). */
  legacy?: boolean;
}

export type LibrarySlot = 1 | 2 | 'kit';

/** Generous caps — the library is meant to grow over a season. */
const MAX_PLAYER_PHOTOS = 100;
const MAX_KITS = 50;

function col(playerId: string) {
  return adminDb().collection('Players').doc(playerId).collection('matchdayLibrary');
}
function playerDoc(playerId: string) {
  return adminDb().collection('Players').doc(playerId);
}

export function libraryConfigured(): boolean {
  return Boolean(getFirebaseAdmin());
}

/** True when an image has a real see-through background (already a cutout). */
async function hasTransparency(buf: Buffer): Promise<boolean> {
  const meta = await sharp(buf).metadata();
  if (!meta.hasAlpha) return false;
  const { data, info } = await sharp(buf).ensureAlpha().extractChannel(3).resize(64, 64, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let k = 0; k < data.length; k++) if (data[k] < 16) clear++;
  return clear / (info.width * info.height) > 0.12;
}

/** Store bytes as a new library image. Returns the created item. */
export async function addLibraryImage(o: {
  playerId: string;
  bytes: Buffer;
  category: LibraryCategory;
  createdBy?: string | null;
}): Promise<LibraryItem> {
  const id = randomUUID();
  const cut = await hasTransparency(o.bytes);
  const stored = cut
    ? { bytes: await sharp(o.bytes).png({ compressionLevel: 9 }).toBuffer(), ext: 'png', type: 'image/png' }
    : { bytes: await sharp(o.bytes).rotate().jpeg({ quality: 90, mozjpeg: true }).toBuffer(), ext: 'jpg', type: 'image/jpeg' };
  const meta = await sharp(stored.bytes).metadata();
  const path = `matchday-assets/library/${o.playerId}/${id}.${stored.ext}`;
  const bucket = await adminBucket();
  const file = bucket.file(path);
  await file.save(stored.bytes, { contentType: stored.type, resumable: false });
  await file.makePublic().catch(() => {
    /* bucket may already be public, or uniform access may forbid per-object ACLs */
  });
  const item: LibraryItem = {
    id,
    url: `https://storage.googleapis.com/${bucket.name}/${path}`,
    category: o.category,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    isCutout: cut,
    createdAt: Date.now(),
    createdBy: o.createdBy ?? null,
  };
  await col(o.playerId).doc(id).set({ ...item, source: 'upload', storagePath: path });
  return item;
}

export interface LibraryListing {
  items: LibraryItem[];
  kits: LibraryItem[];
  mainUrl: string | null;
  secondUrl: string | null;
  kitUrl: string | null;
  /** Selections the server just cleared (they pointed at a hidden AI image). */
  cleared: { main: boolean; second: boolean };
}

/**
 * The player's library, newest first, split into photos and kits. The
 * pre-library main / second / kit fields are included as `legacy` items when
 * they are not already in the library, so nothing uploaded earlier disappears.
 */
export async function listLibrary(playerId: string): Promise<LibraryListing> {
  const [snap, player] = await Promise.all([
    col(playerId).orderBy('createdAt', 'desc').limit(MAX_PLAYER_PHOTOS + MAX_KITS + 20).get(),
    playerDoc(playerId).get(),
  ]);
  const all = snap.docs.map((d) => {
    const x = d.data() as Partial<LibraryItem> & { source?: string };
    return {
      id: d.id,
      url: x.url ?? '',
      category: (x.category ?? 'player') as LibraryCategory, // items from before categories were photos
      width: x.width ?? 0,
      height: x.height ?? 0,
      isCutout: Boolean(x.isCutout),
      createdAt: x.createdAt ?? 0,
      createdBy: x.createdBy ?? null,
      source: x.source ?? 'upload',
    };
  });
  const aiUrls = new Set(all.filter((it) => it.source === 'ai').map((it) => it.url));
  const real = all.filter((it) => it.source !== 'ai' && it.url).map(({ source: _s, ...it }) => it as LibraryItem);
  const items = real.filter((it) => it.category === 'player').slice(0, MAX_PLAYER_PHOTOS);
  const kits = real.filter((it) => it.category === 'kit').slice(0, MAX_KITS);

  const data = player.data() ?? {};
  let mainUrl = (data.matchdayPhotoUrl as string | undefined) ?? null;
  let secondUrl = (data.matchdayPhoto2Url as string | undefined) ?? null;
  const kitUrl = (data.matchdayKitUrl as string | undefined) ?? null;

  // If an AI image is still selected for this player, un-select it so no poster can use it.
  const cleared = { main: Boolean(mainUrl && aiUrls.has(mainUrl)), second: Boolean(secondUrl && aiUrls.has(secondUrl)) };
  if (cleared.main || cleared.second) {
    if (cleared.main) mainUrl = null;
    if (cleared.second) secondUrl = null;
    await playerDoc(playerId).set({ matchdayPhotoUrl: mainUrl, matchdayPhoto2Url: secondUrl }, { merge: true });
  }

  const legacy = (id: string, url: string, category: LibraryCategory): LibraryItem => ({
    id,
    url,
    category,
    width: 0,
    height: 0,
    isCutout: /\.png(\?|$)/i.test(url),
    createdAt: 0,
    createdBy: null,
    legacy: true,
  });
  for (const [n, url] of [[1, mainUrl], [2, secondUrl]] as const) {
    if (url && !items.some((it) => it.url === url)) items.push(legacy(`legacy-${n}`, url, 'player'));
  }
  if (kitUrl && !kits.some((it) => it.url === kitUrl)) kits.push(legacy('legacy-kit', kitUrl, 'kit'));

  return { items, kits, mainUrl, secondUrl, kitUrl, cleared };
}

/** Select the player's main (1) / second (2) photo or kit ('kit'). `null` clears the slot. */
export async function selectLibraryPhoto(playerId: string, slot: LibrarySlot, url: string | null): Promise<void> {
  const field = slot === 1 ? 'matchdayPhotoUrl' : slot === 2 ? 'matchdayPhoto2Url' : 'matchdayKitUrl';
  await playerDoc(playerId).set({ [field]: url }, { merge: true });
}

/** Remove a library image (Firestore doc + Storage object). Clears any slot it was selected in. */
export async function deleteLibraryImage(playerId: string, id: string): Promise<void> {
  const ref = col(playerId).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;
  const x = doc.data() as LibraryItem & { storagePath?: string };
  if (x.storagePath) await (await adminBucket()).file(x.storagePath).delete().catch(() => undefined);
  await ref.delete();
  const player = (await playerDoc(playerId).get()).data() ?? {};
  if (player.matchdayPhotoUrl === x.url) await selectLibraryPhoto(playerId, 1, null);
  if (player.matchdayPhoto2Url === x.url) await selectLibraryPhoto(playerId, 2, null);
  if (player.matchdayKitUrl === x.url) await selectLibraryPhoto(playerId, 'kit', null);
}
