/**
 * GET /api/shared-requests/list
 * Returns all shared request link tokens created by the authenticated user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export interface SharedRequestLinkItem {
  token: string;
  platform: string;
  showClubs: boolean;
  recipientLabel: string | null;
  createdAt: number;
  revoked: boolean;
  revokedAt: number | null;
  viewCount: number;
  lastViewedAt: number | null;
}

export async function GET(request: NextRequest) {
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

    const db = adminDb();
    const snap = await db
      .collection('SharedRequestLinks')
      .where('createdBy', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const links: SharedRequestLinkItem[] = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        token: doc.id,
        platform: d.platform || 'men',
        showClubs: d.showClubs === true,
        recipientLabel: d.recipientLabel || null,
        createdAt: d.createdAt || 0,
        revoked: d.revoked === true,
        revokedAt: d.revokedAt || null,
        viewCount: d.viewCount || 0,
        lastViewedAt: d.lastViewedAt || null,
      };
    });

    return NextResponse.json({ links });
  } catch (e) {
    console.error('[shared-requests] List failed:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list share links' },
      { status: 500 },
    );
  }
}
