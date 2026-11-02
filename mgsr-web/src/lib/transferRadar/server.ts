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

let flagsReady: Promise<void> | null = null;
/** Agency-wide marks (watchlist / contacted / hidden-as-not-relevant). Created lazily so the web app works even before the pipeline's migration 3 ran. */
export function ensureFlags(): Promise<void> {
  if (!flagsReady) {
    flagsReady = exec('CREATE TABLE IF NOT EXISTS player_flags (player_id TEXT NOT NULL, flag TEXT NOT NULL, reason TEXT, by_email TEXT, at INTEGER NOT NULL, PRIMARY KEY (player_id, flag))')
      .then(() => undefined)
      .catch((e) => { flagsReady = null; throw e; });
  }
  return flagsReady;
}

export interface FlagInfo { by: string | null; at: number; reason?: string | null }
export type FlagMap = { watch?: FlagInfo; contacted?: FlagInfo; hidden?: FlagInfo };
const FLAG_KEY: Record<string, keyof FlagMap> = { WATCH: 'watch', CONTACTED: 'contacted', HIDDEN: 'hidden' };
export function foldFlags(rows: { player_id: string; flag: string; reason: string | null; by_email: string | null; at: number }[]): Map<string, FlagMap> {
  const out = new Map<string, FlagMap>();
  for (const r of rows) {
    const k = FLAG_KEY[r.flag]; if (!k) continue;
    const m = out.get(r.player_id) ?? {}; m[k] = { by: r.by_email, at: Number(r.at), reason: r.reason }; out.set(r.player_id, m);
  }
  return out;
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
    const emails = (v?: string) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    // Private testing: while RADAR_ALLOWED_EMAILS is set, only these signed-in agents can use Transfer Radar at all.
    const allowed = emails(process.env.RADAR_ALLOWED_EMAILS);
    if (allowed.length && !allowed.includes(email)) {
      return NextResponse.json({ error: 'RADAR_FORBIDDEN', message: 'Transfer Radar is in private testing.' }, { status: 403 });
    }
    const admins = emails(process.env.RADAR_ADMIN_EMAILS);
    return { uid: decoded.uid, email, isAdmin: admins.length === 0 || admins.includes(email) };
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
  // Show the reason (sanitised: tokens/URLs stripped) so a misconfigured database is diagnosable from the screen itself.
  const detail = msg.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***').replace(/(libsql|https?|wss?):\/\/[^\s"']+/g, '<url>').slice(0, 240);
  return NextResponse.json({ error: 'Internal error', message: `Internal error: ${detail}` }, { status: 500 });
}

export const parseJson = <T,>(s: unknown, fallback: T): T => {
  if (typeof s !== 'string' || !s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

let identityCols = false;
/** True once the pipeline's migration 4 (Transfermarkt identity) ran. Before that the feed is empty and the UI says "identifying players". */
export async function identityReady(): Promise<boolean> {
  if (identityCols) return true;
  const cols = await q<{ name: string }>('PRAGMA table_info(players)');
  identityCols = cols.some((c) => c.name === 'identity_status');
  return identityCols;
}

/** Reports that belong in the story: final signals + status changes (moved, returned, renewed...). */
export const STORY_REPORTS = `(r.final = 1 OR r.signals LIKE '%TRANSFER_COMPLETED%' OR r.signals LIKE '%RETURNED_TO_SQUAD%' OR r.signals LIKE '%RENEWED_CONTRACT%' OR r.signals LIKE '%DENIED_BY_CLUB%')`;
