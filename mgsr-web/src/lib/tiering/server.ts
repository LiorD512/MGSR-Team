/**
 * Server-side Roster Intelligence: auth, data loading, the weekly snapshot+signal pipeline.
 * All Firestore access uses the Admin SDK (bypasses rules) — the client only reads via /api/tiering.
 */
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { type Firestore } from 'firebase-admin/firestore';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { MAX_HISTORY, META_DOC, REANALYSE_AFTER_MS, STATS_TTL_MS, TIERS_COLLECTION as TC } from './config';
import { contractMonthsLeft, detectSignals, parseValueEuro, snapshotFromStats } from './engine';
import { fetchPlayerStats } from './inputs';
import { isPlayerOurAsset } from '@/lib/transfermarkt-utils';
import type { IntelMeta, PlayerIntel, PlayerIntelDoc, StatsSnapshot } from './types';

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
  isOurAsset?: boolean;
  agencyUrl?: string;
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

  const allPlayers = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RosterPlayer, 'id'>) }));
  // Only the players WE manage (our assets) — not the wider scouting database.
  const players = allPlayers.filter((p) => isPlayerOurAsset(p));
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
}
export interface ProcessResult {
  doc: PlayerIntelDoc;
  statsMatched: boolean;
  flagged: boolean;
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
  const prev = ctx.docs.get(p.id);
  const history = (prev?.history ?? []).slice().sort((a, b) => a.at - b.at);
  const valueEuro = parseValueEuro(p.marketValue);

  // Fetch stats at most weekly; otherwise reuse the latest snapshot's stats with a fresh value.
  const lastSnap = history[history.length - 1];
  const statsFresh = lastSnap && now - lastSnap.at < STATS_TTL_MS && !opts.force;
  let statsMatched = false;
  let snapshot: StatsSnapshot;
  if (statsFresh) {
    snapshot = { ...lastSnap, at: now, valueEuro: valueEuro || lastSnap.valueEuro };
    statsMatched = lastSnap.rating != null || lastSnap.minutes != null;
  } else {
    const stats = p.tmProfile ? await fetchPlayerStats(p.tmProfile) : null;
    statsMatched = !!stats;
    snapshot = snapshotFromStats(now, stats, valueEuro);
  }

  // Append to history (replace a same-week capture so repeated runs don't pile up), keep the window.
  const base = history.filter((h) => now - h.at > DAY); // prior weeks only
  const newHistory = [...base, snapshot].slice(-MAX_HISTORY);

  // Signals compare `current` to everything BEFORE it.
  const age = p.age ? parseInt(p.age, 10) || null : null;
  const mandateExp = p.tmProfile ? ctx.mandates.get(p.tmProfile) : undefined;
  const signals = detectSignals({
    now,
    current: snapshot,
    history: base,
    contractMonths: contractMonthsLeft(p.contractExpired, now),
    mandateDays: mandateExp ? (mandateExp - now) / DAY : null,
    matchingRequests: ctx.requests.filter((r) => requestMatches(r, p.positions, age)).length,
    clubCountry: p.currentClub?.clubCountry,
  });

  const ratingSpark = newHistory.map((h) => h.rating).filter((v): v is number => typeof v === 'number');
  const intel: PlayerIntel | undefined = signals.length
    ? {
        top: signals[0],
        signals,
        score: signals[0].strength,
        current: snapshot,
        ratingSpark: ratingSpark.slice(-6),
        firstRun: base.length === 0,
        computedAt: now,
      }
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
    history: newHistory,
    ...(intel ? { intel } : {}),
    ...(lastTouchAt ? { lastTouchAt } : {}),
  };
  await db.collection(TIERS_COLLECTION).doc(p.id).set(clean(doc));
  ctx.docs.set(p.id, doc);
  return { doc, statsMatched, flagged: !!intel };
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
  const conc = Math.max(1, Math.min(8, opts.concurrency ?? 4));
  let analysed = 0;
  let flagged = 0;
  let statsMatched = 0;
  const errors: { playerId: string; error: string }[] = [];
  let i = 0;
  const workers = Array.from({ length: conc }, async () => {
    while (i < queue.length) {
      const p = queue[i++];
      try {
        const r = await processPlayer(db, ctx, p, opts);
        analysed++;
        if (r.statsMatched) statsMatched++;
        if (r.flagged) flagged++;
        log(`✓ ${p.fullName}${r.flagged ? ` → ${r.doc.intel!.top.en}` : ' (no signal)'}${r.statsMatched ? '' : ' [no stats]'}`);
      } catch (e) {
        errors.push({ playerId: p.id, error: String((e as Error)?.message ?? e).slice(0, 200) });
        log(`✗ ${p.fullName}: ${(e as Error)?.message ?? e}`);
      }
    }
  });
  await Promise.all(workers);

  // Drop intel docs for players no longer on the roster.
  if (!opts.onlyIds) {
    const rosterIds = new Set(ctx.players.map((p) => p.id));
    const all = await db.collection(TIERS_COLLECTION).get();
    for (const d of all.docs) if (!rosterIds.has(d.id)) await d.ref.delete();
  }

  const meta: IntelMeta = { lastRunAt: Date.now(), durationMs: Date.now() - t0, analysed, flagged, total: queue.length, statsMatched, errors: errors.slice(0, 20) };
  const [col, id] = META_DOC.split('/');
  await db.collection(col).doc(id).set(clean(meta));
  return meta;
}

export async function readMeta(db: Firestore): Promise<IntelMeta | null> {
  const [col, id] = META_DOC.split('/');
  const s = await db.collection(col).doc(id).get();
  return s.exists ? (s.data() as IntelMeta) : null;
}
