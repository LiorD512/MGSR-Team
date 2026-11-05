/**
 * Server-side Roster Intelligence: auth, data loading, the weekly analysis pipeline, and push alerts.
 * All Firestore access uses the Admin SDK (bypasses rules) — the client only reads via /api/tiering.
 */
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { META_DOC, REANALYSE_AFTER_MS, TIER_DEFINITIONS, TIERS_COLLECTION as TC } from './config';
import {
  abilitySignal,
  computeUrgency,
  contractMonthsLeft,
  criteriaList,
  fitLabel,
  leagueClubSignal,
  outputSignal,
  parseValueEuro,
  positionGroupOf,
  predictFit,
  pushFromUrgency,
  requestMatches,
  saleability,
  trendFromHistory,
  valueSignal,
  weightedScore,
  worth as worthScore,
} from './engine';
import { gatherInputs } from './inputs';
import type {
  CriterionKey,
  FitPrediction,
  PlayerTierDoc,
  Push,
  Role,
  Tier,
  TierAnalysis,
  TierEffort,
  TierMeta,
  TierReason,
  TierSignals,
  Trend,
} from './types';

export const TIERS_COLLECTION = TC;
const DAY = 24 * 3600 * 1000;
const clampTier = (t: number): Tier => Math.max(1, Math.min(5, t)) as Tier;

/* ───────────────────────── auth ───────────────────────── */

export interface Actor {
  uid: string;
  email: string;
  name: string;
  system?: boolean;
}

export async function resolveAccountName(db: Firestore, email: string, fallback: string): Promise<string> {
  const e = email.toLowerCase();
  if (!e) return fallback;
  try {
    const q = await db.collection('Accounts').where('email', '==', email).limit(1).get();
    let doc = q.docs[0];
    if (!doc) doc = (await db.collection('Accounts').get()).docs.find((d) => String(d.data().email ?? '').toLowerCase() === e)!;
    const d = doc?.data();
    return String(d?.name || d?.hebrewName || fallback);
  } catch {
    return fallback;
  }
}

/** Verifies a Firebase ID token. Any signed-in agent may read the tiering API. */
export async function authenticate(req: NextRequest): Promise<Actor | NextResponse> {
  if (!getFirebaseAdmin()) return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 503 });
  const h = req.headers.get('Authorization');
  const token = h?.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    const email = decoded.email ?? '';
    const name = await resolveAccountName(adminDb(), email, decoded.name || email || decoded.uid);
    return { uid: decoded.uid, email, name };
  } catch {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }
}

/** The weekly job authenticates with a shared secret header instead of a user token. */
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
  marketValueHistory?: { value?: string; date?: number }[];
  age?: string;
  contractExpired?: string;
  tmProfile?: string;
  haveMandate?: boolean;
  nationality?: string;
  noteList?: { notes?: string; createBy?: string; createdAt?: number }[];
}

interface RequestRow {
  clubName?: string;
  createdAt?: number;
  euOnly?: boolean;
  position?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  status?: string;
}

export interface TierContext {
  now: number;
  players: RosterPlayer[];
  tiers: Map<string, PlayerTierDoc>;
  mandates: Map<string, number>;
  requests: RequestRow[];
  taskTouches: Map<string, { count30: number; last: number }>;
  windows: { country: string; daysLeft: number }[];
}

export async function loadContext(db: Firestore): Promise<TierContext> {
  const now = Date.now();
  const cutoff = now - 30 * DAY;
  const [playersSnap, tiersSnap, mandSnap, reqSnap, taskCreated, taskDone] = await Promise.all([
    db.collection('Players').get(),
    db.collection(TIERS_COLLECTION).get(),
    db.collection('PlayerDocuments').where('type', '==', 'MANDATE').get(),
    db.collection('ClubRequests').get(),
    db.collection('AgentTasks').where('createdAt', '>=', cutoff).get().catch(() => null),
    db.collection('AgentTasks').where('completedAt', '>=', cutoff).get().catch(() => null),
  ]);

  const players = playersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RosterPlayer, 'id'>) }));
  const tiers = new Map<string, PlayerTierDoc>();
  tiersSnap.docs.forEach((d) => tiers.set(d.id, { playerId: d.id, ...(d.data() as Omit<PlayerTierDoc, 'playerId'>) }));

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

  const taskTouches = new Map<string, { count30: number; last: number }>();
  const seen = new Set<string>();
  for (const snap of [taskCreated, taskDone]) {
    snap?.docs.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      const x = d.data();
      const ts = Math.max(Number(x.completedAt) || 0, Number(x.createdAt) || 0);
      for (const key of [x.playerTmProfile, x.playerId]) {
        if (!key) continue;
        const cur = taskTouches.get(String(key)) ?? { count30: 0, last: 0 };
        cur.count30 += 1;
        cur.last = Math.max(cur.last, ts);
        taskTouches.set(String(key), cur);
      }
    });
  }
  const windows = await loadWindows();
  return { now, players, tiers, mandates, requests, taskTouches, windows };
}

async function loadWindows(): Promise<{ country: string; daysLeft: number }[]> {
  const url = process.env.TIERING_WINDOWS_URL || 'https://raw.githubusercontent.com/LiorD512/MGSR-Team/main/mgsr-web/public/transfer-windows.json';
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return [];
    const j = (await res.json()) as { windows?: { countryName?: string; daysLeft?: number }[] };
    return (j.windows ?? [])
      .filter((w) => w.countryName && typeof w.daysLeft === 'number')
      .map((w) => ({ country: String(w.countryName), daysLeft: Number(w.daysLeft) }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function isStale(tier: PlayerTierDoc | undefined, now: number): boolean {
  return !tier?.analysis || now - (tier.analysis.computedAt || 0) > REANALYSE_AFTER_MS;
}

export function computeEffort(p: RosterPlayer, ctx: TierContext): TierEffort {
  const cutoff = ctx.now - 30 * DAY;
  const notes = (p.noteList ?? []).filter((n) => (n.createdAt ?? 0) >= cutoff);
  const lastNote = Math.max(0, ...(p.noteList ?? []).map((n) => n.createdAt ?? 0));
  const t = (p.tmProfile && ctx.taskTouches.get(p.tmProfile)) || ctx.taskTouches.get(p.id) || { count30: 0, last: 0 };
  return { notes30: notes.length, tasks30: t.count30, lastTouchAt: Math.max(lastNote, t.last) };
}

/* ───────────────────────── analysis pipeline ───────────────────────── */

/** Reasons are derived purely from the numbers — no AI. Ordered by weight (3 = time-critical). */
function buildReasons(o: {
  contractMonths: number | null;
  mandateDays: number | null;
  requests: { club?: string; position?: string }[];
  trend: Trend;
  coverage: number;
  fit: FitPrediction;
  age: number | null;
}): TierReason[] {
  const r: TierReason[] = [];
  const m = o.mandateDays;
  if (m != null && m <= 45) {
    const d = Math.max(0, Math.round(m));
    r.push({ en: d === 0 ? 'Mandate expires today' : `Mandate expires in ${d} days`, he: d === 0 ? 'המנדט פג היום' : `המנדט פג בעוד ${d} ימים`, weight: d <= 14 ? 3 : 2 });
  }
  const c = o.contractMonths;
  if (c != null && c <= 12) {
    const mo = Math.max(0, Math.round(c));
    r.push({ en: mo <= 0 ? 'Contract ending — free agent' : `Contract ends in ${mo} months`, he: mo <= 0 ? 'החוזה מסתיים — שחקן חופשי' : `החוזה מסתיים בעוד ${mo} חודשים`, weight: mo <= 6 ? 3 : 2 });
  }
  if (o.requests.length) {
    const lead = o.requests[0];
    const more = o.requests.length - 1;
    r.push({ en: `${lead.club ?? 'A club'} wants a ${lead.position ?? 'player'}${more > 0 ? ` (+${more} more request${more > 1 ? 's' : ''})` : ''}`, he: `${lead.club ?? 'מועדון'} מחפש ${lead.position ?? 'שחקן'}${more > 0 ? ` (+${more} בקשות נוספות)` : ''}`, weight: o.requests.length >= 2 ? 3 : 2 });
  }
  if (o.fit.ceiling < o.fit.tier && o.age != null && o.age <= 23)
    r.push({ en: `Young with a higher ceiling (${TIER_DEFINITIONS[o.fit.ceiling].en.split(' — ')[0]})`, he: `צעיר עם תקרה גבוהה יותר (${TIER_DEFINITIONS[o.fit.ceiling].he.split(' — ')[0]})`, weight: 2 });
  if (o.trend === 'up') r.push({ en: 'Market value trending up', he: 'שווי השוק במגמת עלייה', weight: 1 });
  else if (o.trend === 'down') r.push({ en: 'Market value trending down', he: 'שווי השוק במגמת ירידה', weight: 1 });
  if (!r.length) r.push({ en: o.coverage < 0.6 ? 'Limited data — ranked on value and league' : 'Solid profile, no time pressure', he: o.coverage < 0.6 ? 'מעט נתונים — דירוג לפי שווי וליגה' : 'פרופיל יציב, ללא דחיפות בזמן', weight: 1 });
  return r.sort((a, b) => b.weight - a.weight);
}

/** Plain-language summary built from the numbers (no AI). */
function buildSummary(o: { fit: FitPrediction; push: Push; worth: number; coverage: number }): { en: string; he: string } {
  const tierEn = TIER_DEFINITIONS[o.fit.tier].en.split(' — ')[0];
  const tierHe = TIER_DEFINITIONS[o.fit.tier].he.split(' — ')[0];
  const roleEn = { starter: 'starter', rotation: 'rotation player', squad: 'squad player' }[o.fit.role];
  const roleHe = { starter: 'פותח', rotation: 'שחקן רוטציה', squad: 'שחקן סגל' }[o.fit.role];
  const pushEn = { now: 'act now', high: 'high priority', medium: 'worth working', low: 'low priority' }[o.push];
  const pushHe = { now: 'לפעול עכשיו', high: 'עדיפות גבוהה', medium: 'שווה לעבוד', low: 'עדיפות נמוכה' }[o.push];
  const thinEn = o.coverage < 0.6 ? ' (limited data)' : '';
  const thinHe = o.coverage < 0.6 ? ' (מעט נתונים)' : '';
  return {
    en: `${tierEn} ${roleEn}; worth ${o.worth}/100 — ${pushEn}${thinEn}.`,
    he: `${roleHe} ברמת ${tierHe}; שווי עבודה ${o.worth}/100 — ${pushHe}${thinHe}.`,
  };
}

export interface ProcessOptions {
  force?: boolean;
}

export interface ProcessResult {
  doc: PlayerTierDoc;
  refreshed: string[];
}

/** Full pipeline for one roster player. */
export async function processPlayer(db: Firestore, ctx: TierContext, p: RosterPlayer, opts: ProcessOptions): Promise<ProcessResult> {
  const now = ctx.now;
  const prev = ctx.tiers.get(p.id);
  const { inputs, refreshed } = await gatherInputs(db, p, prev?.inputs, { now, force: opts.force });

  const age = p.age ? parseInt(p.age, 10) || null : null;
  const group = positionGroupOf(p.positions);
  const valueEuro = parseValueEuro(p.marketValue);

  // Signals — IN-APP data only: scout-server rating/minutes, FM cache CA/PA, market value, club league.
  const rating = inputs.apiRating;
  const minutes = inputs.apiMinutes;
  const signals: TierSignals = {
    output: outputSignal(rating, minutes),
    ability: abilitySignal(inputs.fmCa, inputs.fmPa, age),
    value: valueSignal(valueEuro),
    league: leagueClubSignal(p.currentClub?.clubCountry),
  };
  const notes: Partial<Record<CriterionKey, string>> = {
    output:
      rating != null
        ? `Rating ${rating.toFixed(2)}${minutes ? ` · ${Math.round(minutes).toLocaleString('en-US')} min` : ''}${inputs.apiGoalsPer90 ? ` · ${inputs.apiGoalsPer90.toFixed(2)} g/90` : ''}`
        : undefined,
    ability: inputs.fmCa ? `FM CA ${inputs.fmCa}${inputs.fmPa ? ` / PA ${inputs.fmPa}` : ''}` : undefined,
    value: p.marketValue ? `${p.marketValue}` : undefined,
    league: p.currentClub?.clubCountry ?? '—',
  };
  const criteria = criteriaList(signals, notes);
  const { score, coverage } = weightedScore(signals);

  const { trend } = trendFromHistory(p.marketValueHistory, now);

  const effort = computeEffort(p, ctx);
  const daysSinceTouch = effort.lastTouchAt ? Math.floor((now - effort.lastTouchAt) / DAY) : null;
  const contractMonths = contractMonthsLeft(p.contractExpired, now);
  const mandateExp = p.tmProfile ? ctx.mandates.get(p.tmProfile) : undefined;
  const mandateDays = mandateExp ? (mandateExp - now) / DAY : null;
  const matchingReqs = ctx.requests.filter((r) => requestMatches(r, { positions: p.positions, age }));

  const fitBase = predictFit({
    score,
    coverage,
    group,
    age,
    minutes: minutes ?? undefined,
    trend,
    abilityGap: inputs.fmPa && inputs.fmCa ? inputs.fmPa - inputs.fmCa : undefined,
  });
  const label = fitLabel(fitBase, TIER_DEFINITIONS);
  const fit: FitPrediction = { ...fitBase, labelEn: label.en, labelHe: label.he };

  const { urgency, parts } = computeUrgency({ now, tier: fit.tier, contractMonths, mandateDays, matchingRequests: matchingReqs.length, daysSinceTouch, trend, newsSignal: 0 });
  const push: Push = pushFromUrgency(urgency);
  const sale = saleability({ tier: fit.tier, age, contractMonths, matchingRequests: matchingReqs.length, trend, newsSignal: 0 });
  const worth = worthScore(score, sale, urgency);

  const reasons = buildReasons({
    contractMonths,
    mandateDays,
    requests: matchingReqs.map((r) => ({ club: r.clubName, position: r.position })),
    trend,
    coverage,
    fit,
    age,
  });
  const summary = buildSummary({ fit, push, worth, coverage });

  const analysis: TierAnalysis = {
    score,
    coverage: Math.round(coverage * 100) / 100,
    signals,
    criteria,
    fit,
    urgency,
    urgencyParts: parts,
    push,
    trend,
    worth,
    reasons,
    summaryEn: summary.en,
    summaryHe: summary.he,
    computedAt: now,
  };

  const doc: PlayerTierDoc = { playerId: p.id, tmProfile: p.tmProfile, playerName: p.fullName, analysis, effort, inputs };
  await db.collection(TIERS_COLLECTION).doc(p.id).set(clean(doc));
  ctx.tiers.set(p.id, doc);
  return { doc, refreshed };
}

/** Weekly sweep of the whole roster with bounded concurrency. */
export async function sweepRoster(
  db: Firestore,
  opts: ProcessOptions & { concurrency?: number; onlyIds?: string[]; log?: (m: string) => void }
): Promise<TierMeta> {
  const t0 = Date.now();
  const ctx = await loadContext(db);
  const log = opts.log ?? (() => {});
  const queue = ctx.players.filter((p) => (opts.onlyIds ? opts.onlyIds.includes(p.id) : true));
  queue.sort((a, b) => (ctx.tiers.get(a.id)?.analysis?.computedAt ?? 0) - (ctx.tiers.get(b.id)?.analysis?.computedAt ?? 0));
  const conc = Math.max(1, Math.min(8, opts.concurrency ?? 4));
  let analysed = 0;
  const errors: { playerId: string; error: string }[] = [];
  let i = 0;
  const workers = Array.from({ length: conc }, async () => {
    while (i < queue.length) {
      const p = queue[i++];
      try {
        const r = await processPlayer(db, ctx, p, opts);
        analysed++;
        const a = r.doc.analysis!;
        log(`✓ ${p.fullName} worth ${a.worth} · ${a.fit.labelEn} · ${a.push} [${r.refreshed.join(',') || 'cached'}]`);
      } catch (e) {
        errors.push({ playerId: p.id, error: String((e as Error)?.message ?? e).slice(0, 200) });
        log(`✗ ${p.fullName}: ${(e as Error)?.message ?? e}`);
      }
    }
  });
  await Promise.all(workers);

  // Cleanup (full sweeps only): drop tier docs for players no longer on the roster, and remove any
  // leftover legacy `ai` field from an earlier version so the doc shape stays clean.
  let removed = 0;
  if (!opts.onlyIds) {
    const rosterIds = new Set(ctx.players.map((p) => p.id));
    const legacy = await db.collection(TIERS_COLLECTION).get();
    for (const d of legacy.docs) {
      if (!rosterIds.has(d.id)) {
        await d.ref.delete();
        removed++;
        continue;
      }
      if ((d.data() as Record<string, unknown>).ai !== undefined) {
        await d.ref.update({ ai: FieldValue.delete() });
      }
    }
    if (removed) log(`cleanup: removed ${removed} off-roster tier doc(s)`);
  }

  const meta: TierMeta = { lastRunAt: Date.now(), durationMs: Date.now() - t0, analysed, total: queue.length, windows: ctx.windows, errors: errors.slice(0, 20) };
  const [col, id] = META_DOC.split('/');
  await db.collection(col).doc(id).set(clean(meta));
  return meta;
}

export async function readMeta(db: Firestore): Promise<TierMeta | null> {
  const [col, id] = META_DOC.split('/');
  const s = await db.collection(col).doc(id).get();
  return s.exists ? (s.data() as TierMeta) : null;
}

/* ───────────────────────── push alerts (optional) ───────────────────────── */

/** Deep-strip undefined (and NaN) so Firestore never rejects an optional field. */
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

/** Owners configured in TIERING_ALERT_EMAILS get a weekly digest push of the top targets. */
export async function notifyOwners(db: Firestore, msg: { title: string; body: string }): Promise<{ sent: number; owners: number }> {
  const emails = (process.env.TIERING_ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return { sent: 0, owners: 0 };
  const accounts = (await db.collection('Accounts').get()).docs.filter((d) => emails.includes(String(d.data().email ?? '').toLowerCase()));
  let sent = 0;
  for (const acc of accounts) {
    const d = acc.data();
    const tokens = new Set<string>();
    if (d.fcmToken) tokens.add(String(d.fcmToken));
    if (Array.isArray(d.fcmTokens)) for (const e of d.fcmTokens) { const tk = typeof e === 'string' ? e : e?.token; if (tk) tokens.add(String(tk)); }
    const link = '/dashboard';
    try {
      if (tokens.size) {
        const r = await getMessaging(getFirebaseAdmin()!).sendEachForMulticast({
          tokens: Array.from(tokens),
          notification: { title: msg.title, body: msg.body },
          data: { type: 'ROSTER_INTEL', link },
          android: { priority: 'high', notification: { channelId: 'mgsr_team_notifications' } },
          webpush: { notification: { title: msg.title, body: msg.body }, fcmOptions: { link } },
        });
        sent += r.successCount;
      }
      await acc.ref.collection('Notifications').add({ type: 'ROSTER_INTEL', title: msg.title, body: msg.body, data: { link }, timestamp: Date.now(), read: false });
    } catch (e) {
      console.warn('[tiering] notify failed for', acc.id, e);
    }
  }
  return { sent, owners: accounts.length };
}
