/**
 * POST /api/shared-requests/create
 * Creates a unique, revocable share token for the requests page.
 * Stores metadata in Firestore SharedRequestLinks collection.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!bearerToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const app = getFirebaseAdmin();
    if (!app) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
    }

    const decoded = await adminAuth().verifyIdToken(bearerToken);
    const uid = decoded.uid;

    const body = await request.json();
    const { platform, showClubs, recipientLabel } = body as {
      platform?: string;
      showClubs?: boolean;
      recipientLabel?: string;
    };

    const validPlatform = ['men', 'women', 'youth'].includes(platform || '') ? platform : 'men';

    const doc = {
      platform: validPlatform,
      showClubs: showClubs === true,
      recipientLabel: recipientLabel?.trim()?.slice(0, 100) || null,
      createdBy: uid,
      createdAt: Date.now(),
      revoked: false,
      revokedAt: null,
      viewCount: 0,
      lastViewedAt: null,
    };

    const ref = await adminDb().collection('SharedRequestLinks').add(doc);

    return NextResponse.json({ token: ref.id });
  } catch (e) {
    console.error('[shared-requests] Create failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to create share link' },
      { status: 500 },
    );
  }
}
