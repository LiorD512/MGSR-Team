/**
 * Server-side Roster Intelligence: auth, data loading, the weekly analysis pipeline, and push alerts.
 * All Firestore access uses the Admin SDK (bypasses rules) — the client only reads via /api/tiering.
 */
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import type { Firestore } from 'firebase-admin/firestore';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { ANALYST_MAX_AGE_MS, GEMINI_MODEL, META_DOC, REANALYSE_AFTER_MS, TIER_DEFINITIONS, TIERS_COLLECTION as TC } from './config';
import {
  abilitySignal,
  availabilitySignal,
  computeUrgency,
  contractMonthsLeft,
  criteriaList,
  fitLabel,
  hashFacts,
  leagueClubSignal,
  outputSignal,
  parseValueEuro,
  positionGroupOf,
  predictFit,
  pushFromUrgency,
  requestMatches,
  saleability,
  tierFromScore,
  trendFromHistory,
  valueSignal,
  weightedScore,
  worth as worthScore,
} from './engine';
import { gatherInputs } from './inputs';
import { runAnalyst, type AnalystFacts } from './analyst';
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

function fallbackReasons(opts: {
  contractMonths: number | null;
  mandateDays: number | null;
  requests: number;
  coverage: number;
  trend: Trend;
}): TierReason[] {
  const r: TierReason[] = [];
  if (opts.mandateDays != null && opts.mandateDays <= 45)
    r.push({ en: `Mandate expires in ${Math.max(0, Math.round(opts.mandateDays))} days`, he: `המנדט פג בעוד ${Math.max(0, Math.round(opts.mandateDays))} ימים`, weight: 3 });
  if (opts.contractMonths != null && opts.contractMonths <= 12)
    r.push({ en: `Contract ends in ${Math.max(0, Math.round(opts.contractMonths))} months`, he: `החוזה מסתיים בעוד ${Math.max(0, Math.round(opts.contractMonths))} חודשים`, weight: opts.contractMonths <= 6 ? 3 : 2 });
  if (opts.requests > 0)
    r.push({ en: `${opts.requests} open club request(s) match him`, he: `${opts.requests} בקשות מועדונים פתוחות מתאימות לו`, weight: 2 });
  if (opts.trend === 'up') r.push({ en: 'Market value trending up', he: 'שווי השוק במגמת עלייה', weight: 1 });
  if (!r.length) r.push({ en: opts.coverage < 0.6 ? 'Limited data — ranked mainly on value and league' : 'Stable profile, no time pressure', he: opts.coverage < 0.6 ? 'מעט נתונים — דירוג לפי שווי וליגה בעיקר' : 'פרופיל יציב, ללא דחיפות', weight: 1 });
  return r;
}

export interface ProcessOptions {
  appOrigin: string | null;
  force?: boolean;
  useAnalyst?: boolean;
}

export interface ProcessResult {
  doc: PlayerTierDoc;
  analystRan: boolean;
  refreshed: string[];
}

/** Full pipeline for one roster player. */
export async function processPlayer(db: Firestore, ctx: TierContext, p: RosterPlayer, opts: ProcessOptions): Promise<ProcessResult> {
  const now = ctx.now;
  const prev = ctx.tiers.get(p.id);
  const { inputs, refreshed } = await gatherInputs(db, p, prev?.inputs, { now, appOrigin: opts.appOrigin, force: opts.force });

  const age = p.age ? parseInt(p.age, 10) || null : null;
  const group = positionGroupOf(p.positions);
  const valueEuro = parseValueEuro(p.marketValue);
  const intel = inputs.intel ?? {};

  const rating = inputs.apiRating ?? intel.sofascoreRating ?? intel.fotmobRating;
  const minutes = inputs.apiRating ? inputs.apiMinutes : intel.minutes;
  const ratingSrc = inputs.apiRating ? 'API' : intel.sofascoreRating ? 'SofaScore' : intel.fotmobRating ? 'FotMob' : '';

  const signals: TierSignals = {
    output: outputSignal(rating, minutes),
    ability: abilitySignal(inputs.fmCa, inputs.fmPa, age),
    value: valueSignal(valueEuro),
    league: leagueClubSignal(p.currentClub?.clubCountry, intel.eloLevel),
    availability: availabilitySignal(intel),
  };
  const notes: Partial<Record<CriterionKey, string>> = {
    output: rating ? `${ratingSrc} rating ${rating.toFixed(2)}${minutes ? ` · ${Math.round(minutes).toLocaleString('en-US')} min` : ''}` : undefined,
    ability: inputs.fmCa ? `FM CA ${inputs.fmCa}${inputs.fmPa ? ` / PA ${inputs.fmPa}` : ''}` : undefined,
    value: p.marketValue ? `${p.marketValue} (Transfermarkt)` : undefined,
    league: `${p.currentClub?.clubCountry ?? '—'}${intel.elo ? ` · club Elo ${Math.round(intel.elo)}` : ''}`,
    availability: intel.daysMissed != null ? `${intel.daysMissed} days missed${intel.injuryProne ? ' · injury-prone' : ''}` : undefined,
  };
  const criteria = criteriaList(signals, notes);
  const { score, coverage } = weightedScore(signals);

  const { trend: valueTrend } = trendFromHistory(p.marketValueHistory, now);
  const trend: Trend =
    intel.formTrend === 'rising' && valueTrend !== 'down' ? 'up'
    : intel.formTrend === 'declining' && valueTrend !== 'up' ? 'down'
    : valueTrend;

  const effort = computeEffort(p, ctx);
  const daysSinceTouch = effort.lastTouchAt ? Math.floor((now - effort.lastTouchAt) / DAY) : null;
  const contractMonths = contractMonthsLeft(p.contractExpired, now);
  const mandateExp = p.tmProfile ? ctx.mandates.get(p.tmProfile) : undefined;
  const mandateDays = mandateExp ? (mandateExp - now) / DAY : null;
  const matchingReqs = ctx.requests.filter((r) => requestMatches(r, { positions: p.positions, age }));

  let fitBase = predictFit({
    score,
    coverage,
    group,
    age,
    minutes: minutes ?? undefined,
    trend,
    abilityGap: inputs.fmPa && inputs.fmCa ? inputs.fmPa - inputs.fmCa : undefined,
  });

  // Facts the analyst sees (hash excludes volatile "today"/touch so it doesn't re-run daily).
  const recentNotes = (p.noteList ?? [])
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 5)
    .map((n) => String(n.notes ?? '').slice(0, 220));
  const preUrg = computeUrgency({ now, tier: fitBase.tier, contractMonths, mandateDays, matchingRequests: matchingReqs.length, daysSinceTouch, trend, newsSignal: prev?.analysis?.newsSignal ?? 0 });
  const preSale = saleability({ tier: fitBase.tier, age, contractMonths, matchingRequests: matchingReqs.length, trend, newsSignal: prev?.analysis?.newsSignal ?? 0 });
  const facts: AnalystFacts = {
    player: p.fullName ?? '',
    age,
    positions: p.positions ?? [],
    nationality: p.nationality,
    club: p.currentClub?.clubName,
    clubCountry: p.currentClub?.clubCountry,
    marketValue: p.marketValue,
    valueTrend,
    contractMonthsLeft: contractMonths != null ? Math.round(contractMonths) : null,
    haveMandate: !!p.haveMandate || mandateDays != null,
    mandateDaysLeft: mandateDays != null ? Math.round(mandateDays) : null,
    criteria: criteria.map((c) => ({ key: c.key, weight: c.weight, score: c.score, note: c.note })),
    engine: { score, dataCoverage: Math.round(coverage * 100), fitTier: fitBase.tier, fitRole: fitBase.role, ceiling: fitBase.ceiling, urgency: preUrg.urgency, worth: worthScore(score, preSale, preUrg.urgency) },
    matchingClubRequests: matchingReqs.slice(0, 6).map((r) => ({
      club: r.clubName ?? '—',
      position: r.position ?? '',
      ...(r.minAge || r.maxAge ? { ages: `${r.minAge ?? ''}-${r.maxAge ?? ''}` } : {}),
      ...(r.euOnly ? { euOnly: true } : {}),
      ...(r.createdAt ? { daysOld: Math.max(0, Math.floor((now - r.createdAt) / DAY)) } : {}),
    })),
    transferWindows: ctx.windows,
    daysSinceLastTouch: daysSinceTouch,
    recentAgentNotes: recentNotes,
    headlines: (inputs.news ?? []).slice(0, 8).map((n) => ({ title: n.title, source: n.source, date: n.date })),
    today: new Date(now).toISOString().slice(0, 10),
  };
  const dataHash = hashFacts({ ...facts, today: undefined, daysSinceLastTouch: undefined, transferWindows: undefined, engine: undefined });

  const prevA = prev?.analysis;
  const analystDue =
    opts.useAnalyst !== false && (opts.force || !prevA?.analystAt || prevA.dataHash !== dataHash || now - prevA.analystAt > ANALYST_MAX_AGE_MS);

  let read: Awaited<ReturnType<typeof runAnalyst>> = null;
  let analystRan = false;
  if (analystDue) {
    read = await runAnalyst(facts);
    analystRan = !!read;
  }
  const keep = !read && prevA?.analystAt ? prevA : null;

  // Apply AI fit nudges (±1), re-derive role/ceiling.
  const tierAdj = read ? read.tierAdj : 0;
  const ceilAdj = read ? read.ceilingAdj : 0;
  const tier = clampTier(fitBase.tier - tierAdj);
  const role: Role = read?.role ?? (tier === fitBase.tier ? fitBase.role : fitBase.role);
  const ceiling = clampTier(Math.min(tier, fitBase.ceiling - ceilAdj));
  const fitConf = read ? Math.round((fitBase.confidence + read.confidence) / 2) : keep ? keep.fit.confidence : fitBase.confidence;
  const label = fitLabel({ tier, role, ceiling, confidence: fitConf }, TIER_DEFINITIONS);
  const fit: FitPrediction = { tier, role, ceiling, confidence: fitConf, labelEn: label.en, labelHe: label.he };

  const newsSignal = read ? read.newsSignal : keep?.newsSignal ?? 0;
  const { urgency, parts } = computeUrgency({ now, tier, contractMonths, mandateDays, matchingRequests: matchingReqs.length, daysSinceTouch, trend, newsSignal });
  const push: Push = pushFromUrgency(urgency);
  const sale = saleability({ tier, age, contractMonths, matchingRequests: matchingReqs.length, trend, newsSignal });
  const worth = worthScore(score, sale, urgency);

  const reasons: TierReason[] = read?.reasons?.length
    ? read.reasons
    : keep?.reasons?.length
    ? keep.reasons
    : fallbackReasons({ contractMonths, mandateDays, requests: matchingReqs.length, coverage, trend });

  const summaryEn = read?.summaryEn || keep?.summaryEn || label.en;
  const summaryHe = read?.summaryHe || keep?.summaryHe || label.he;

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
    summaryEn,
    summaryHe,
    newsSignal,
    news: read?.news ?? keep?.news ?? [],
    sources: read?.sources ?? keep?.sources ?? [],
    model: read ? GEMINI_MODEL : keep?.model ?? 'engine',
    computedAt: now,
    ...(read ? { analystAt: now, dataHash } : keep?.analystAt ? { analystAt: keep.analystAt, dataHash: keep.dataHash } : {}),
  };

  const doc: PlayerTierDoc = { playerId: p.id, tmProfile: p.tmProfile, playerName: p.fullName, analysis, effort, inputs };
  await db.collection(TIERS_COLLECTION).doc(p.id).set(clean(doc));
  ctx.tiers.set(p.id, doc);
  return { doc, analystRan, refreshed };
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
  let aiCalls = 0;
  const errors: { playerId: string; error: string }[] = [];
  let i = 0;
  const workers = Array.from({ length: conc }, async () => {
    while (i < queue.length) {
      const p = queue[i++];
      try {
        const r = await processPlayer(db, ctx, p, opts);
        analysed++;
        if (r.analystRan) aiCalls++;
        const a = r.doc.analysis!;
        log(`✓ ${p.fullName} worth ${a.worth} · ${a.fit.labelEn} · ${a.push}${r.analystRan ? ' (AI)' : ''} [${r.refreshed.join(',') || 'cached'}]`);
      } catch (e) {
        errors.push({ playerId: p.id, error: String((e as Error)?.message ?? e).slice(0, 200) });
        log(`✗ ${p.fullName}: ${(e as Error)?.message ?? e}`);
      }
    }
  });
  await Promise.all(workers);
  const meta: TierMeta = { lastRunAt: Date.now(), durationMs: Date.now() - t0, analysed, aiCalls, total: queue.length, windows: ctx.windows, errors: errors.slice(0, 20) };
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
