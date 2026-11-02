import { NextRequest, NextResponse } from 'next/server';
import { guardMatchday } from '@/lib/matchday/v2/guard';
import sharp from 'sharp';
import { getFirebaseAdmin, adminDb, adminBucket } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SaveBody {
  generationId: string;
  playerId: string | null;
  imageDataUrl: string;
  /** Optional metadata so the poster can be listed in the player's history. */
  playerName?: string | null;
  design?: string | null;
  variantName?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  date?: string | null;
}

/**
 * Persists a finished MATCHDAY.
 *
 * When Firebase Admin (Storage + Firestore) is configured, the image is
 * uploaded to Storage and the design-memory record is updated with its path.
 * When admin credentials are absent, we fail soft (the client can still
 * Download the image) and tell the caller storage isn't configured.
 */
export async function POST(request: NextRequest) {
  const caller = await guardMatchday(request, 'save');
  if (caller instanceof NextResponse) return caller;

  let body: SaveBody;
  try {
    body = (await request.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body?.generationId || !body?.imageDataUrl) {
    return NextResponse.json({ error: 'generationId and imageDataUrl are required' }, { status: 400 });
  }

  const admin = getFirebaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { saved: false, reason: 'storage_not_configured' },
      { status: 200 }
    );
  }

  try {
    const match = body.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: 'imageDataUrl must be a base64 data URL' }, { status: 400 });
    }
    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const ext = mimeType.split('/')[1] || 'png';
    const path = `matchday/${body.playerId || 'unassigned'}/${body.generationId}.${ext}`;

    const bucket = await adminBucket();
    const file = bucket.file(path);
    await file.save(buffer, { contentType: mimeType, resumable: false });

    // Small thumbnail for the history strip (so listing never downloads full posters).
    const thumbPath = `matchday/${body.playerId || 'unassigned'}/${body.generationId}_thumb.jpg`;
    const thumb = await sharp(buffer).resize(270).jpeg({ quality: 78 }).toBuffer();
    await bucket.file(thumbPath).save(thumb, { contentType: 'image/jpeg', resumable: false });

    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
    await adminDb()
      .collection('matchdayGenerations')
      .doc(body.generationId)
      .set(
        {
          savedImagePath: path,
          thumbPath,
          savedAt: Date.now(),
          savedBy: caller.uid,
          playerId: body.playerId ?? null,
          playerName: str(body.playerName),
          design: str(body.design),
          variantName: str(body.variantName),
          homeTeam: str(body.homeTeam),
          awayTeam: str(body.awayTeam),
          fixtureDate: str(body.date),
        },
        { merge: true }
      );

    return NextResponse.json({ saved: true, path });
  } catch (err) {
    console.error('[matchday] save error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    );
  }
}
