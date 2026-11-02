import { NextRequest, NextResponse } from 'next/server';
import { guardMatchday } from '@/lib/matchday/v2/guard';
import { getFirebaseAdmin, adminDb, adminBucket } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export interface MatchdayHistoryItem {
  generationId: string;
  savedAt: number;
  design: string | null;
  variantName: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  fixtureDate: string | null;
  thumbUrl: string | null;
  imageUrl: string;
}

/**
 * Saved MATCHDAY posters for one player, newest first (max 12).
 * Storage objects stay private: we return short-lived signed URLs (1 h).
 * Queried by playerId only and sorted in memory, so no composite index is needed.
 */
export async function GET(request: NextRequest) {
  const caller = await guardMatchday(request, 'history');
  if (caller instanceof NextResponse) return caller;

  const playerId = request.nextUrl.searchParams.get('playerId')?.trim();
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 });
  if (!getFirebaseAdmin()) return NextResponse.json({ items: [], reason: 'storage_not_configured' });

  try {
    const snap = await adminDb().collection('matchdayGenerations').where('playerId', '==', playerId).limit(60).get();
    const docs = snap.docs
      .map((d): Record<string, unknown> & { id: string } => ({ ...(d.data() as Record<string, unknown>), id: d.id }))
      .filter((d) => typeof d.savedImagePath === 'string')
      .sort((a, b) => Number(b.savedAt ?? b.createdAt ?? 0) - Number(a.savedAt ?? a.createdAt ?? 0))
      .slice(0, 12);

    const bucket = await adminBucket();
    const expires = Date.now() + 60 * 60 * 1000;
    const sign = async (path: unknown) =>
      typeof path === 'string' ? (await bucket.file(path).getSignedUrl({ action: 'read', expires }))[0] : null;

    const items: MatchdayHistoryItem[] = await Promise.all(
      docs.map(async (d) => {
        const imageUrl = (await sign(d.savedImagePath)) as string;
        const thumbUrl = (await sign(d.thumbPath).catch(() => null)) ?? imageUrl;
        const s = (v: unknown) => (typeof v === 'string' ? v : null);
        return {
          generationId: d.id,
          savedAt: Number(d.savedAt ?? d.createdAt ?? 0),
          design: s(d.design),
          variantName: s(d.variantName),
          homeTeam: s(d.homeTeam),
          awayTeam: s(d.awayTeam),
          fixtureDate: s(d.fixtureDate),
          thumbUrl,
          imageUrl,
        };
      })
    );
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[matchday history] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'History failed' }, { status: 500 });
  }
}
