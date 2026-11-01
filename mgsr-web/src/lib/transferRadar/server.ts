/**
 * Transfer Radar - server-side helpers (API routes only).
 * Data lives in Turso (libSQL), written by the GitHub Actions pipeline in /radar. Browsers never see the DB credentials:
 * every request carries a Firebase ID token that is verified here (same pattern as /api/shared-requests/*).
 */
import 'server-only';
import { createClient, type Client, type InValue } from '@libsql/client/web';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, getFirebaseAdmin } from '@/lib/firebaseAdmin';

let client: Client | null = null;

export function radarDb(): Client | null {
  const url = process.env.TURSO_URL || process.env.TURSO_DATABASE_URL;
  if (!url) return null;
  if (!client) client = createClient({ url, authToken: process.env.TURSO_TOKEN || process.env.TURSO_AUTH_TOKEN });
  return client;
}

export async function q<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const db = radarDb();
  if (!db) throw new Error('RADAR_NOT_CONFIGURED');
  const r = await db.execute({ sql, args });
  return r.rows.map((row) => ({ ...(row as unknown as Record<string, unknown>) })) as T[];
}
export async function q1<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T | null> {
  return (await q<T>(sql, args))[0] ?? null;
}
export async function exec(sql: string, args: InValue[] = []) {
  const db = radarDb();
  if (!db) throw new Error('RADAR_NOT_CONFIGURED');
  return db.execute({ sql, args });
}

export interface RadarUser { uid: string; email: string; isAdmin: boolean }

/** Verifies the Firebase ID token. Admin = listed in RADAR_ADMIN_EMAILS; if that variable is empty every signed-in agent is an admin (matches the rest of the app, which has no roles). */
export async function authenticate(req: NextRequest): Promise<RadarUser | NextResponse> {
  const header = req.headers.get('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!getFirebaseAdmin()) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const email = (decoded.email ?? '').toLowerCase();
    const list = (process.env.RADAR_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    return { uid: decoded.uid, email, isAdmin: list.length === 0 || list.includes(email) };
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export function isResponse(x: unknown): x is NextResponse { return x instanceof NextResponse; }

export function notConfigured(): NextResponse {
  return NextResponse.json({ error: 'RADAR_NOT_CONFIGURED', message: 'Transfer Radar database is not configured (TURSO_URL / TURSO_TOKEN missing on the server).' }, { status: 503 });
}

export function failure(e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === 'RADAR_NOT_CONFIGURED') return notConfigured();
  console.error('[transfer-radar]', msg);
  return NextResponse.json({ error: 'Internal error' }, { status: 500 });
}

export const parseJson = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
