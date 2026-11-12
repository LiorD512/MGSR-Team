/**
 * Agents' verdicts on request ↔ player matches (men platform). This is the "golden set" the matching engine is
 * measured against (`_matching_audit.ts`), and "not a fit" also hides the player from that request in the UI.
 *
 *   GET  /api/matching/feedback                               → { items: MatchFeedbackItem[] }
 *   POST /api/matching/feedback { requestId, playerId, verdict: 'fit' | 'not_fit' | null, reason? }
 *        (verdict null = clear)
 *
 * Stored in `RequestMatchFeedback/{requestId}_{playerId}` via the Admin SDK (clients have no direct access).
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

const COLLECTION = 'RequestMatchFeedback';
const REASONS = new Set(['level', 'budget', 'profile', 'availability', 'other']);

export interface MatchFeedbackItem {
  requestId: string;
  playerId: string;
  verdict: 'fit' | 'not_fit';
  reason?: string | null;
  byEmail?: string | null;
  at: number;
}

async function auth(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token || !getFirebaseAdmin()) return null;
  try {
    return await adminAuth().verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await auth(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const snap = await adminDb().collection(COLLECTION).get();
  const items = snap.docs.map((d) => d.data() as MatchFeedbackItem);
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const user = await auth(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
  const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : '';
  const verdict = body.verdict === 'fit' || body.verdict === 'not_fit' ? body.verdict : null;
  if (!requestId || !playerId || /[/]/.test(requestId + playerId)) {
    return NextResponse.json({ error: 'requestId and playerId are required' }, { status: 400 });
  }
  const ref = adminDb().collection(COLLECTION).doc(`${requestId}_${playerId}`);
  if (!verdict) {
    await ref.delete();
    return NextResponse.json({ ok: true });
  }
  const reason = typeof body.reason === 'string' && REASONS.has(body.reason) ? body.reason : null;
  const item: MatchFeedbackItem = { requestId, playerId, verdict, reason, byEmail: user.email ?? null, at: Date.now() };
  await ref.set(item);
  return NextResponse.json({ ok: true, item });
}
