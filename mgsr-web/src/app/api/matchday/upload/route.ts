import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getFirebaseAdmin, adminDb, adminBucket } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

interface UploadBody {
  kind: 'player' | 'stadium' | 'kit';
  /** Player document id — required for `kind: 'player'` and `'kit'`. */
  playerId?: string | null;
  /** Club name — required for `kind: 'stadium'`; keys the stored asset. */
  club?: string | null;
  /** base64 data URL of the chosen image. */
  imageDataUrl: string;
}

/** A kit reference is small guidance art, not a panel fill — a modest floor. */
const KIT_FLOOR = { width: 300, height: 300 } as const;

/**
 * Player floor for v2. The hero is large on the poster, so the photo still
 * needs decent resolution for a clean cutout — but the old 640×1040 portrait
 * requirement rejected too many real phone photos. This is a more forgiving
 * minimum that still yields a sharp hero.
 */
const PLAYER_FLOOR = { width: 500, height: 640 } as const;

/**
 * The stadium in the cinematic v2 renderer is graded dark, blurred and buried
 * under smoke — it is NOT drawn as a sharp panel — so a modest upscale is
 * invisible. We therefore accept small stadium photos (a 640×480 phone shot is
 * fine) and only reject genuinely tiny thumbnails.
 */
const STADIUM_FLOOR = { width: 500, height: 320 } as const;

/** Keeps a club name stable as a Firestore document id. */
function clubKey(club: string): string {
  return club.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

/**
 * Stores a curated MATCHDAY photograph.
 *
 * Player likenesses and stadium shots are chosen by a human and reused, which
 * is what guarantees a poster never shows the wrong face. The image is
 * validated here so an unusable file is rejected at upload rather than
 * surfacing as a soft, stretched poster later.
 */
export async function POST(request: NextRequest) {
  let body: UploadBody;
  try {
    body = (await request.json()) as UploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body?.kind !== 'player' && body?.kind !== 'stadium' && body?.kind !== 'kit') {
    return NextResponse.json({ error: "kind must be 'player', 'stadium' or 'kit'" }, { status: 400 });
  }
  if (!body.imageDataUrl) {
    return NextResponse.json({ error: 'imageDataUrl is required' }, { status: 400 });
  }
  if ((body.kind === 'player' || body.kind === 'kit') && !body.playerId) {
    return NextResponse.json({ error: 'playerId is required for a player/kit photo' }, { status: 400 });
  }
  if (body.kind === 'stadium' && !body.club?.trim()) {
    return NextResponse.json({ error: 'club is required for a stadium photo' }, { status: 400 });
  }

  const parsed = body.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!parsed) {
    return NextResponse.json({ error: 'imageDataUrl must be a base64 image data URL' }, { status: 400 });
  }
  const buffer = Buffer.from(parsed[2], 'base64');
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is larger than 15 MB' }, { status: 400 });
  }

  // Player cutouts genuinely need resolution for a clean edge, so keep that
  // floor strict. The stadium is only an atmospheric, blurred backdrop in v2,
  // so use a lenient floor and let the renderer upscale it to fill the canvas.
  const floor = body.kind === 'player' ? PLAYER_FLOOR : body.kind === 'kit' ? KIT_FLOOR : STADIUM_FLOOR;
  let width = 0;
  let height = 0;
  try {
    const meta = await sharp(buffer).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    return NextResponse.json({ error: 'That file is not a readable image' }, { status: 400 });
  }
  if (width < floor.width || height < floor.height) {
    const why =
      body.kind === 'player'
        ? `A player photo needs to be at least ${floor.width}×${floor.height} for a clean cutout.`
        : body.kind === 'kit'
          ? `A kit reference needs to be at least ${floor.width}×${floor.height} to read the design.`
          : `A stadium photo needs to be at least ${floor.width}×${floor.height}; it's used as a soft background so it doesn't need to be large.`;
    return NextResponse.json(
      { error: `Image is ${width}×${height}. ${why}` },
      { status: 400 }
    );
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Storage is not configured on this environment' }, { status: 503 });
  }

  try {
    // Photographs are stored as JPEG — re-encoding a 1920px photo to PNG made
    // a 6 MB object that the renderer then re-downloaded on every generation.
    // Anything with transparency (a pre-cut player cutout) stays PNG so its
    // alpha survives.
    const { hasAlpha } = await sharp(buffer).metadata();
    const stored = hasAlpha
      ? { bytes: await sharp(buffer).png({ compressionLevel: 9 }).toBuffer(), ext: 'png', type: 'image/png' }
      : {
          bytes: await sharp(buffer).jpeg({ quality: 90, mozjpeg: true }).toBuffer(),
          ext: 'jpg',
          type: 'image/jpeg',
        };
    const storagePath =
      body.kind === 'player'
        ? `matchday-assets/players/${body.playerId}.${stored.ext}`
        : body.kind === 'kit'
          ? `matchday-assets/kits/${body.playerId}.${stored.ext}`
          : `matchday-assets/clubs/${clubKey(body.club!)}.${stored.ext}`;

    const bucket = await adminBucket();
    const file = bucket.file(storagePath);
    await file.save(stored.bytes, { contentType: stored.type, resumable: false });
    await file.makePublic().catch(() => {
      /* bucket may already be public, or uniform access may forbid per-object ACLs */
    });
    const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    if (body.kind === 'player') {
      await adminDb()
        .collection('Players')
        .doc(body.playerId!)
        .set({ matchdayPhotoUrl: url }, { merge: true });
    } else if (body.kind === 'kit') {
      await adminDb()
        .collection('Players')
        .doc(body.playerId!)
        .set({ matchdayKitUrl: url }, { merge: true });
    } else {
      await adminDb()
        .collection('ClubAssets')
        .doc(clubKey(body.club!))
        .set({ club: body.club, stadiumPhotoUrl: url }, { merge: true });
    }

    return NextResponse.json({ url, width, height, path: storagePath });
  } catch (err) {
    console.error('[matchday] upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
