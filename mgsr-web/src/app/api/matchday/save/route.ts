import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface SaveBody {
  generationId: string;
  playerId: string | null;
  imageDataUrl: string;
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

    const { getStorage } = await import('firebase-admin/storage');
    const bucket = getStorage(admin).bucket();
    const file = bucket.file(path);
    await file.save(buffer, { contentType: mimeType, resumable: false });

    await adminDb()
      .collection('matchdayGenerations')
      .doc(body.generationId)
      .set({ savedImagePath: path }, { merge: true });

    return NextResponse.json({ saved: true, path });
  } catch (err) {
    console.error('[matchday] save error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    );
  }
}
