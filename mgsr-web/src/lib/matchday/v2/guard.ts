/**
 * Auth + rate limit for the MATCHDAY API routes (server-only).
 *
 * Same pattern as /api/share/create: the client sends its Firebase ID token as
 * `Authorization: Bearer <token>` and we verify it with Firebase Admin.
 *
 * Local development without Firebase Admin credentials keeps working (logged
 * as a warning) so the feature can be tried on localhost; in production a
 * missing Admin config fails closed (503), exactly like the share routes.
 *
 * The rate limit is a per-instance sliding window per user — enough to stop a
 * runaway client or a stuck retry loop from burning Gemini credits or sending
 * a flood of emails. (Serverless instances don't share memory, so this is a
 * guard rail, not a quota.)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, adminAuth } from '@/lib/firebaseAdmin';

export type MatchdayAction = 'generate' | 'preview' | 'send' | 'upload' | 'save' | 'history' | 'library';

/** Max calls per user per window. */
const LIMITS: Record<MatchdayAction, number> = {
  generate: 24,
  preview: 30,
  send: 20,
  upload: 40,
  save: 40,
  history: 120,
  library: 120,
};
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(key: string, limit: number): number | null {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return Math.ceil((WINDOW_MS - (now - arr[0])) / 1000);
  }
  arr.push(now);
  hits.set(key, arr);
  return null;
}

export interface MatchdayCaller {
  uid: string;
  email: string | null;
}

/**
 * Returns the verified caller, or a NextResponse to return immediately
 * (401 / 429 / 503).
 */
export async function guardMatchday(request: NextRequest, action: MatchdayAction): Promise<MatchdayCaller | NextResponse> {
  let caller: MatchdayCaller;
  if (!getFirebaseAdmin()) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Server not configured (Firebase Admin credentials missing).' }, { status: 503 });
    }
    console.warn(`[matchday] ${action}: Firebase Admin not configured — skipping auth (development only).`);
    caller = { uid: 'dev-local', email: null };
  } else {
    const header = request.headers.get('Authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return NextResponse.json({ error: 'Please sign in again to use MATCHDAY.' }, { status: 401 });
    try {
      const decoded = await adminAuth().verifyIdToken(token);
      caller = { uid: decoded.uid, email: decoded.email ?? null };
    } catch {
      return NextResponse.json({ error: 'Your session has expired — please sign in again.' }, { status: 401 });
    }
  }

  const retry = rateLimited(`${action}:${caller.uid}`, LIMITS[action]);
  if (retry !== null) {
    return NextResponse.json(
      { error: `Too many MATCHDAY ${action} requests — try again in ${Math.ceil(retry / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(retry) } }
    );
  }
  return caller;
}
