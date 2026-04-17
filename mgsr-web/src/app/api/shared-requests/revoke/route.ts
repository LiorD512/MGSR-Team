/**
 * POST /api/shared-requests/revoke
 * Revokes a shared request link token. Only the creator can revoke.
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
    const { token } = body as { token?: string };

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const db = adminDb();
    const docRef = db.collection('SharedRequestLinks').doc(token);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 });
    }

    const data = snap.data()!;
    if (data.createdBy !== uid) {
      return NextResponse.json({ error: 'Not authorized to revoke this link' }, { status: 403 });
    }

    await docRef.update({
      revoked: true,
      revokedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[shared-requests] Revoke failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to revoke share link' },
      { status: 500 },
    );
  }
}
