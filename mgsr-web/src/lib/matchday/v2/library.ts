/**
 * MATCHDAY player photo LIBRARY (server-only, Firebase Admin).
 *
 * Every photo uploaded for a player is KEPT (it used to be overwritten on each
 * upload) and can be picked as the main or second photo for any poster. The
 * library can also hold AI-generated poses (see generateLibraryPoses in
 * gemini.ts) — those are always labelled `source: 'ai'`, are created as
 * `status: 'pending'` and can only be used after a person approves them.
 *
 *   Firestore : Players/{playerId}/matchdayLibrary/{imageId}
 *   Storage   : matchday-assets/library/{playerId}/{imageId}.{jpg|png}
 *
 * Cutouts are cached by the photo's content hash (cache.ts), so each library
 * photo is cut out at most once, however many posters use it.
 */
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { getFirebaseAdmin, adminDb, adminBucket } from '@/lib/firebaseAdmin';

export type LibrarySource = 'upload' | 'ai';
export type LibraryStatus = 'approved' | 'pending';

export interface LibraryItem {
  id: string;
  url: string;
  source: LibrarySource;
  status: LibraryStatus;
  /** Pose / composition label for AI images (e.g. "celebrating, arms wide"). */
  pose: string | null;
  width: number;
  height: number;
  /** Transparent PNG cutout (no cutout call needed when used). */
  isCutout: boolean;
  createdAt: number;
  createdBy: string | null;
  /** Library ids of the real photos an AI image was generated from. */
  refs: string[];
  /** True for the player's current main / second photo fields that pre-date the library. */
  legacy?: boolean;
}

const MAX_ITEMS = 60;

function col(playerId: string) {
  return adminDb().collection('Players').doc(playerId).collection('matchdayLibrary');
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
  source: LibrarySource;
  status?: LibraryStatus;
  pose?: string | null;
  createdBy?: string | null;
  refs?: string[];
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
    source: o.source,
    status: o.status ?? 'approved',
    pose: o.pose ?? null,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    isCutout: cut,
    createdAt: Date.now(),
    createdBy: o.createdBy ?? null,
    refs: o.refs ?? [],
  };
  await col(o.playerId).doc(id).set({ ...item, storagePath: path });
  return item;
}

/**
 * The player's library, newest first. The pre-library main / second photo
 * fields are included as `legacy` items when they are not already in it, so
 * nothing uploaded before the library existed disappears.
 */
export async function listLibrary(playerId: string): Promise<{ items: LibraryItem[]; mainUrl: string | null; secondUrl: string | null }> {
  const [snap, player] = await Promise.all([col(playerId).orderBy('createdAt', 'desc').limit(MAX_ITEMS).get(), adminDb().collection('Players').doc(playerId).get()]);
  const items = snap.docs.map((d) => {
    const x = d.data() as LibraryItem & { storagePath?: string };
    return { ...x, id: d.id, refs: x.refs ?? [] } as LibraryItem;
  });
  const data = player.data() ?? {};
  const mainUrl = (data.matchdayPhotoUrl as string | undefined) ?? null;
  const secondUrl = (data.matchdayPhoto2Url as string | undefined) ?? null;
  for (const [n, url] of [[1, mainUrl], [2, secondUrl]] as const) {
    if (url && !items.some((it) => it.url === url)) {
      items.push({ id: `legacy-${n}`, url, source: 'upload', status: 'approved', pose: null, width: 0, height: 0, isCutout: /\.png(\?|$)/i.test(url), createdAt: 0, createdBy: null, refs: [], legacy: true });
    }
  }
  return { items, mainUrl, secondUrl };
}

export async function getLibraryItems(playerId: string, ids: string[]): Promise<LibraryItem[]> {
  const docs = await Promise.all(ids.map((id) => col(playerId).doc(id).get()));
  return docs.filter((d) => d.exists).map((d) => ({ ...(d.data() as LibraryItem), id: d.id }));
}

/** Make a library photo the player's main (1) or second (2) MATCHDAY photo. */
export async function selectLibraryPhoto(playerId: string, slot: 1 | 2, url: string | null): Promise<void> {
  await adminDb()
    .collection('Players')
    .doc(playerId)
    .set(slot === 1 ? { matchdayPhotoUrl: url } : { matchdayPhoto2Url: url }, { merge: true });
}

export async function approveLibraryImage(playerId: string, id: string): Promise<void> {
  await col(playerId).doc(id).set({ status: 'approved' }, { merge: true });
}

/** Remove a library image (Firestore doc + Storage object). Clears the slot if it was selected. */
export async function deleteLibraryImage(playerId: string, id: string): Promise<void> {
  const ref = col(playerId).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;
  const x = doc.data() as LibraryItem & { storagePath?: string };
  if (x.storagePath) await (await adminBucket()).file(x.storagePath).delete().catch(() => undefined);
  await ref.delete();
  const player = (await adminDb().collection('Players').doc(playerId).get()).data() ?? {};
  if (player.matchdayPhotoUrl === x.url) await selectLibraryPhoto(playerId, 1, null);
  if (player.matchdayPhoto2Url === x.url) await selectLibraryPhoto(playerId, 2, null);
}
