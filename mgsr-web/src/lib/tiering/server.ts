/**
 * Server-side Roster Intelligence: auth, data loading, the weekly snapshot+signal pipeline.
 * All Firestore access uses the Admin SDK (bypasses rules) — the client only reads via /api/tiering.
 */
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { type Firestore } from 'firebase-admin/firestore';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { META_DOC, REANALYSE_AFTER_MS, TIERS_COLLECTION as TC } from './config';
import { contractMonthsLeft, detectSignals, parseValueEuro, summariseForm } from './engine';
import { getRecentGames } from './inputs';
import type { IntelMeta, PlayerIntel, PlayerIntelDoc, RecentGame } from './types';

export const TIERS_COLLECTION = TC;
const DAY = 24 * 3600 * 1000;

/* ───────────────────────── auth ───────────────────────── */

export interface Actor {
  uid: string;
  email: string;
  name: string;
  system?: boolean;
}

export async function authenticate(req: NextRequest): Promise<Actor | NextResponse> {
  if (!getFirebaseAdmin()) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 503 });
  const h = req.headers.get('Authorization');
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? '', name: decoded.name || decoded.email || decoded.uid };
  } catch {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }
}

export async function authenticateOrSecret(req: NextRequest): Promise<Actor | NextResponse> {
  const secret = process.env.TIERING_RUN_SECRET;
  const given = req.headers.get('x-tiering-secret');
  if (secret && given) {
    const a = Buffer.from(secret);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return { uid: 'system', email: '', name: 'Weekly agent', system: true };
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return authenticate(req);
}

/* ───────────────────────── data loading ───────────────────────── */

interface RosterPlayer {
  id: string;
  fullName?: string;
  positions?: string[];
  currentClub?: { clubName?: string; clubCountry?: string };
  marketValue?: string;
  age?: string;
  contractExpired?: string;
  tmProfile?: string;
  marketValueHistory?: { value?: string; date?: number }[];
  recentGames?: RecentGame[];
  recentGamesAt?: number;
  noteList?: { createdAt?: number }[];
}

interface RequestRow {
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  status?: string;
}

export interface IntelContext {
  now: number;
  players: RosterPlayer[];
  docs: Map<string, PlayerIntelDoc>;
  mandates: Map<string, number>;
  requests: RequestRow[];
  taskTouch: Map<string, number>;
}

export async function loadContext(db: Firestore): Promise<IntelContext> {
  const now = Date.now();
  const cutoff = now - 90 * DAY;
  const [playersSnap, docsSnap, mandSnap, reqSnap, taskSnap] = await Promise.all([
    db.collection('Players').get(),
    db.collection(TIERS_COLLECTION).get(),
    db.collection('PlayerDocuments').where('type', '==', 'MANDATE').get(),
    db.collection('ClubRequests').get(),
    db.collection('AgentTasks').where('createdAt', '>=', cutoff).get().catch(() => null),
  ]);

  const players = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RosterPlayer, 'id'>) }));
  const docs = new Map<string, PlayerIntelDoc>();
  docsSnap.docs.forEach((d) => docs.set(d.id, { playerId: d.id, ...(d.data() as Omit<PlayerIntelDoc, 'playerId'>) }));

  const mandates = new Map<string, number>();
  mandSnap.docs.forEach((d) => {
    const x = d.data();
    const profile = x.playerTmProfile as string | undefined;
    const exp = x.expiresAt as number | undefined;
    if (profile && exp && !x.expired && exp >= now) mandates.set(profile, exp);
  });

  const requests: RequestRow[] = reqSnap.docs
    .map((d) => d.data() as RequestRow)
    .filter((r) => ['', 'open', 'new'].includes(String(r.status ?? 'open').toLowerCase()));

  const taskTouch = new Map<string, number>();
  taskSnap?.docs.forEach((d) => {
    const x = d.data();
    const ts = Math.max(Number(x.completedAt) || 0, Number(x.createdAt) || 0);
    for (const key of [x.playerTmProfile, x.playerId]) {
      if (!key) continue;
      taskTouch.set(String(key), Math.max(taskTouch.get(String(key)) ?? 0, ts));
    }
  });

  return { now, players, docs, mandates, requests, taskTouch };
}

export function isStale(doc: PlayerIntelDoc | undefined, now: number): boolean {
  return !doc?.intel || now - (doc.intel.computedAt || 0) > REANALYSE_AFTER_MS;
}

const near: Record<string, string[]> = { ST: ['ST', 'CF', 'SS'], CF: ['CF', 'ST', 'SS'], SS: ['SS', 'CF', 'ST'] };
function requestMatches(r: RequestRow, positions: string[] | undefined, age: number | null): boolean {
  const rp = String(r.position ?? '').toUpperCase().trim();
  if (!rp) return false;
  const pos = (positions ?? []).map((p) => String(p).toUpperCase().trim());
  const accepted = near[rp] ?? [rp];
  if (!pos.some((p) => accepted.includes(p))) return false;
  if (!r.ageDoesntMatter && age != null) {
    if (typeof r.minAge === 'number' && r.minAge > 0 && age < r.minAge) return false;
    if (typeof r.maxAge === 'number' && r.maxAge > 0 && age > r.maxAge) return false;
  }
  return true;
}

/* ───────────────────────── pipeline ───────────────────────── */

export interface ProcessOptions {
  force?: boolean;
  /** Let the worker self-enrich via TM ceapi when the doc has no fresh recentGames (default true). */
  allowFetch?: boolean;
}
export interface ProcessResult {
  doc: PlayerIntelDoc;
  hasGames: boolean;
  flagged: boolean;
  reason: string;
  staleTmId: boolean;
  /** Fine-grained resolver diagnostic + error (circuit breaker / block / no-candidates) for the log. */
  note?: string;
  error?: string;
}

/** Oldest value within ~14 months from marketValueHistory, for the value-move signal. */
function prevValueEuro(history: { value?: string; date?: number }[] | undefined, now: number): number | null {
  const pts = (history ?? [])
    .map((h) => ({ v: parseValueEuro(h.value), d: Number(h.date) || 0 }))
    .filter((p) => p.v > 0 && p.d > 0)
    .sort((a, b) => a.d - b.d);
  if (pts.length < 2) return null;
  const windowStart = now - 14 * 30.44 * DAY;
  const base = pts.find((p) => p.d >= windowStart) ?? pts[0];
  return base.v;
}

function clean<T>(o: T): T {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map((v) => clean(v)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (v === undefined) continue;
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    out[k] = clean(v);
  }
  return out as T;
}

export async function processPlayer(db: Firestore, ctx: IntelContext, p: RosterPlayer, opts: ProcessOptions): Promise<ProcessResult> {
  const now = ctx.now;
  const { games, source, reason, resolvedTmId, staleTmId, note, error } = await getRecentGames(
    { tmProfile: p.tmProfile, fullName: p.fullName, recentGames: p.recentGames, recentGamesAt: p.recentGamesAt },
    now,
    { force: opts.force, allowFetch: opts.allowFetch !== false }
  );
  const hasGames = games.length > 0;

  const age = p.age ? parseInt(p.age, 10) || null : null;
  const mandateExp = p.tmProfile ? ctx.mandates.get(p.tmProfile) : undefined;

  const signals = detectSignals({
    now,
    games,
    value: { curEuro: parseValueEuro(p.marketValue), prevEuro: prevValueEuro(p.marketValueHistory, now) },
    contractMonths: contractMonthsLeft(p.contractExpired, now),
    mandateDays: mandateExp ? (mandateExp - now) / DAY : null,
  });
  // requests still influence nothing here (kept for future); silence unused
  void requestMatches;

  const form = summariseForm(games);
  const intel: PlayerIntel | undefined = signals.length
    ? { top: signals[0], signals, score: signals[0].strength, form, noGameData: !hasGames, computedAt: now }
    : undefined;

  const lastTouchAt = Math.max(
    0,
    ...(p.noteList ?? []).map((n) => n.createdAt ?? 0),
    (p.tmProfile && ctx.taskTouch.get(p.tmProfile)) || ctx.taskTouch.get(p.id) || 0
  );

  const doc: PlayerIntelDoc = {
    playerId: p.id,
    tmProfile: p.tmProfile,
    playerName: p.fullName,
    // keep the games we analysed (so the drawer can show them), only when we have fresh ones
    ...(source === 'fetched' || (source === 'doc' && hasGames) ? { recentGames: games.slice(0, 10) } : {}),
    ...(intel ? { intel } : {}),
    ...(lastTouchAt ? { lastTouchAt } : {}),
    // stored id was stale — surface the live id so the user can re-link the Players doc (we never mutate it here)
    ...(staleTmId ? { staleTmId: true, resolvedTmId: resolvedTmId ?? null } : {}),
  };
  await db.collection(TIERS_COLLECTION).doc(p.id).set(clean(doc));
  ctx.docs.set(p.id, doc);
  return { doc, hasGames, flagged: !!intel, reason, staleTmId: !!staleTmId, note, error };
}

export async function sweepRoster(
  db: Firestore,
  opts: ProcessOptions & { concurrency?: number; onlyIds?: string[]; log?: (m: string) => void }
): Promise<IntelMeta> {
  const t0 = Date.now();
  const ctx = await loadContext(db);
  const log = opts.log ?? (() => {});
  const queue = ctx.players.filter((p) => (opts.onlyIds ? opts.onlyIds.includes(p.id) : true));
  queue.sort((a, b) => (ctx.docs.get(a.id)?.intel?.computedAt ?? 0) - (ctx.docs.get(b.id)?.intel?.computedAt ?? 0));
  // Modest concurrency — the self-enrich path hits TM via the proxy.
  const conc = Math.max(1, Math.min(6, opts.concurrency ?? 3));
  let analysed = 0;
  let flagged = 0;
  let withGames = 0;
  let staleIds = 0;
  const noteCounts = new Map<string, number>();
  const errors: { playerId: string; error: string }[] = [];
  let i = 0;
  const workers = Array.from({ length: conc }, async () => {
    while (i < queue.length) {
      const p = queue[i++];
      try {
        const r = await processPlayer(db, ctx, p, opts);
        analysed++;
        if (r.hasGames) withGames++;
        if (r.flagged) flagged++;
        if (r.staleTmId) staleIds++;
        if (!r.hasGames && r.note) noteCounts.set(r.note, (noteCounts.get(r.note) ?? 0) + 1);
        const relink = r.staleTmId ? ` [stale TM id → re-link to ${r.doc.resolvedTmId}]` : '';
        const diag = r.hasGames ? '' : ` [no games: ${r.reason}${r.note ? `/${r.note}` : ''}${r.error ? ` — ${r.error}` : ''}]`;
        log(`✓ ${p.fullName}${r.flagged ? ` → ${r.doc.intel!.top.en}` : ' (no signal)'}${diag}${relink}`);
      } catch (e) {
        errors.push({ playerId: p.id, error: String((e as Error)?.message ?? e).slice(0, 200) });
        log(`✗ ${p.fullName}: ${(e as Error)?.message ?? e}`);
      }
    }
  });
  await Promise.all(workers);

  // Aggregate why players had no games — the single most useful diagnostic line.
  if (noteCounts.size) {
    const breakdown = Array.from(noteCounts.entries()).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ');
    log(`no-games breakdown: ${breakdown}`);
  }

  // Drop intel docs for players no longer on the roster.
  if (!opts.onlyIds) {
    const rosterIds = new Set(ctx.players.map((p) => p.id));
    const all = await db.collection(TIERS_COLLECTION).get();
    for (const d of all.docs) if (!rosterIds.has(d.id)) await d.ref.delete();
  }

  const noGamesBreakdown = Object.fromEntries(noteCounts);
  const meta: IntelMeta = { lastRunAt: Date.now(), durationMs: Date.now() - t0, analysed, flagged, total: queue.length, withGames, staleIds, noGamesBreakdown, errors: errors.slice(0, 20) };
  const [col, id] = META_DOC.split('/');
  await db.collection(col).doc(id).set(clean(meta));
  return meta;
}

export async function readMeta(db: Firestore): Promise<IntelMeta | null> {
  const [col, id] = META_DOC.split('/');
  const s = await db.collection(col).doc(id).get();
  return s.exists ? (s.data() as IntelMeta) : null;
}
