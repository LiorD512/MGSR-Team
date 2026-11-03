/**
 * Server-side pieces of Level & Focus: auth, data loading, analysis pipeline, writes, push alerts.
 * All Firestore access uses the Admin SDK (bypasses rules) — the client talks to /api/tiering/*.
 */
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import type { Firestore } from 'firebase-admin/firestore';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { ANALYST_MAX_AGE_MS, GEMINI_MODEL, META_DOC, MIN_RECOMPUTE_MS, TIERS_COLLECTION as TC } from './config';
import {
  abilitySignal,
  applyFocusAdj,
  availabilitySignal,
  computeUrgency,
  confidenceFrom,
  contractMonthsLeft,
  criteriaList,
  focusFrom,
  hashFacts,
  leagueClubSignal,
  levelFromScore,
  outputSignal,
  parseValueEuro,
  positionGroupOf,
  requestMatches,
  trendFromHistory,
  valueSignal,
  weightedScore,
} from './engine';
import { gatherInputs } from './inputs';
import { runAnalyst, type AnalystFacts } from './analyst';
import type {
  CriterionKey,
  Focus,
  Level,
  PlayerTierDoc,
  TierAi,
  TierEffort,
  TierHistoryEntry,
  TierMeta,
  TierSignals,
  Trend,
} from './types';

export const TIERS_COLLECTION = TC;
const DAY = 24 * 3600 * 1000;

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

/** Verifies a Firebase ID token. Any signed-in agent may use the tiering API. */
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

/** Scheduled jobs authenticate with a shared secret header instead of a user token. */
export async function authenticateOrSecret(req: NextRequest): Promise<Actor | NextResponse> {
  const secret = process.env.TIERING_RUN_SECRET;
  const given = req.headers.get('x-tiering-secret');
  if (secret && given) {
    const a = Buffer.from(secret);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { uid: 'system', email: '', name: 'Engine', system: true };
    }
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
  mandates: Map<string, number>; // tmProfile -> expiresAt
  requests: RequestRow[];
  taskTouches: Map<string, { count30: number; last: number }>; // key: tmProfile or playerId
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
  const windows = await loadWindows(db);
  return { now, players, tiers, mandates, requests, taskTouches, windows };
}

/** Open transfer windows (top ones by deadline). Reads the public JSON published by the transfer-windows workflow. */
async function loadWindows(_db: Firestore): Promise<{ country: string; daysLeft: number }[]> {
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
  return !tier?.ai || now - (tier.ai.computedAt || 0) > MIN_RECOMPUTE_MS;
}

export function computeEffort(p: RosterPlayer, ctx: TierContext): TierEffort {
  const cutoff = ctx.now - 30 * DAY;
  const notes = (p.noteList ?? []).filter((n) => (n.createdAt ?? 0) >= cutoff);
  const lastNote = Math.max(0, ...(p.noteList ?? []).map((n) => n.createdAt ?? 0));
  const t = (p.tmProfile && ctx.taskTouches.get(p.tmProfile)) || ctx.taskTouches.get(p.id) || { count30: 0, last: 0 };
  return { notes30: notes.length, tasks30: t.count30, lastTouchAt: Math.max(lastNote, t.last) };
}

/* ───────────────────────── analysis pipeline ───────────────────────── */

function templateReason(next: TierAi['next'], coverage: number): { en: string; he: string } {
  const thin = coverage < 0.6;
  const nextEn =
    next.kind === 'mandate' ? `Mandate ends in ${next.value} days.`
    : next.kind === 'contract' ? `Contract ends in ${next.value} months.`
    : next.kind === 'requests' ? `${next.value} open club request(s) match him.`
    : next.kind === 'untouched' ? `No contact for ${next.value} days.`
    : 'Nothing time-critical right now.';
  const nextHe =
    next.kind === 'mandate' ? `המנדט פג בעוד ${next.value} ימים.`
    : next.kind === 'contract' ? `החוזה מסתיים בעוד ${next.value} חודשים.`
    : next.kind === 'requests' ? `${next.value} בקשות מועדונים פתוחות מתאימות לו.`
    : next.kind === 'untouched' ? `אין קשר ${next.value} ימים.`
    : 'אין דחיפות בזמן כרגע.';
  return {
    en: `${thin ? 'Based mainly on market value and league (limited match data). ' : ''}${nextEn}`,
    he: `${thin ? 'מבוסס בעיקר על שווי שוק וליגה (מעט נתוני משחק). ' : ''}${nextHe}`,
  };
}

export interface ProcessOptions {
  /** Base URL of the deployed app, used only for the live FMInside lookup fallback. */
  appOrigin: string | null;
  /** Re-fetch every source and re-run the analyst regardless of caches. */
  force?: boolean;
  useAnalyst?: boolean;
}

export interface ProcessResult {
  doc: PlayerTierDoc;
  analystRan: boolean;
  refreshed: string[];
}

/** Full pipeline for one roster player: gather → criteria → urgency → AI analyst (when needed) → write. */
export async function processPlayer(db: Firestore, ctx: TierContext, p: RosterPlayer, opts: ProcessOptions): Promise<ProcessResult> {
  const now = ctx.now;
  const prev = ctx.tiers.get(p.id);
  const { inputs, refreshed } = await gatherInputs(db, p, prev?.inputs, { now, appOrigin: opts.appOrigin, force: opts.force });

  const age = p.age ? parseInt(p.age, 10) || null : null;
  const group = positionGroupOf(p.positions);
  const valueEuro = parseValueEuro(p.marketValue);
  const intel = inputs.intel ?? {};

  // Output: best available rating source (API stats → SofaScore → FotMob)
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
  const baseLevel = levelFromScore(score, group);
  const { trend: valueTrend } = trendFromHistory(p.marketValueHistory, now);
  const trend: Trend =
    intel.formTrend === 'rising' && valueTrend !== 'down' ? 'up'
    : intel.formTrend === 'declining' && valueTrend !== 'up' ? 'down'
    : valueTrend;

  const effort = computeEffort(p, ctx);
  // No recorded touch: count it as a 30-day gap for urgency, but don't present an invented number as "next".
  const daysSinceTouch = effort.lastTouchAt ? Math.floor((now - effort.lastTouchAt) / DAY) : 30;
  const contractMonths = contractMonthsLeft(p.contractExpired, now);
  const mandateExp = p.tmProfile ? ctx.mandates.get(p.tmProfile) : undefined;
  const mandateDays = mandateExp ? (mandateExp - now) / DAY : null;
  const matchingReqs = ctx.requests.filter((r) => requestMatches(r, { positions: p.positions, age }));
  const u = computeUrgency({ contractMonths, mandateDays, matchingRequests: matchingReqs.length, daysSinceTouch, trend });
  const baseFocus = focusFrom(u.urgency, baseLevel);

  const recentNotes = (p.noteList ?? [])
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 5)
    .map((n) => String(n.notes ?? '').slice(0, 220));

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
    engine: { score, baseLevel, dataCoverage: Math.round(coverage * 100), focus: baseFocus, urgency: u.urgency },
    matchingClubRequests: matchingReqs.slice(0, 6).map((r) => ({
      club: r.clubName ?? '—',
      position: r.position ?? '',
      ...(r.minAge || r.maxAge ? { ages: `${r.minAge ?? ''}-${r.maxAge ?? ''}` } : {}),
      ...(r.euOnly ? { euOnly: true } : {}),
    })),
    transferWindows: ctx.windows,
    daysSinceLastTouch: effort.lastTouchAt ? daysSinceTouch : null,
    recentAgentNotes: recentNotes,
    headlines: (inputs.news ?? []).slice(0, 8).map((n) => ({ title: n.title, source: n.source, date: n.date })),
    today: new Date(now).toISOString().slice(0, 10),
  };
  // Hash only facts that should trigger a new analysis (not "today" or touch-days that tick daily).
  const dataHash = hashFacts({ ...facts, today: undefined, daysSinceLastTouch: undefined, transferWindows: undefined });

  const prevAi = prev?.ai;
  const analystDue =
    opts.useAnalyst !== false &&
    (opts.force || !prevAi?.analystAt || prevAi.dataHash !== dataHash || now - prevAi.analystAt > ANALYST_MAX_AGE_MS);

  let analystRan = false;
  let read: Awaited<ReturnType<typeof runAnalyst>> = null;
  if (analystDue) {
    read = await runAnalyst(facts);
    analystRan = !!read;
  }

  // Reuse the last analyst read when it was not due (or failed) — keeps reasons/plan/news stable.
  const keep = !read && prevAi?.analystAt ? prevAi : null;
  const adj = read ? read.adj : keep ? keep.adj : 0;
  const focusAdj = read ? read.focusAdj : keep ? keep.focusAdj ?? 0 : 0;
  const level = Math.max(1, Math.min(5, baseLevel - adj)) as Level;
  const focus = applyFocusAdj(focusFrom(u.urgency, level), focusAdj);

  const engineConf = confidenceFrom(coverage, score, group);
  const confidence = read ? Math.round((engineConf + read.confidence) / 2) : keep ? keep.confidence : engineConf;
  const tmpl = templateReason(u.next, coverage);

  const ai: TierAi = {
    score,
    coverage: Math.round(coverage * 100) / 100,
    baseLevel,
    adj,
    level,
    focus,
    focusAdj,
    urgency: u.urgency,
    urgencyParts: u.parts,
    trend,
    newsSignal: read ? read.newsSignal : keep?.newsSignal ?? 0,
    confidence,
    reasonEn: read?.reasonEn || keep?.reasonEn || tmpl.en,
    reasonHe: read?.reasonHe || keep?.reasonHe || tmpl.he,
    evidence: read?.evidence ?? keep?.evidence ?? [],
    criteria,
    signals,
    news: read?.news ?? keep?.news ?? [],
    risks: read?.risks ?? keep?.risks ?? [],
    ...(read?.plan ? { plan: read.plan } : keep?.plan ? { plan: keep.plan } : {}),
    sources: read?.sources ?? keep?.sources ?? [],
    next: u.next,
    model: read ? GEMINI_MODEL : keep?.model ?? 'engine',
    computedAt: now,
    ...(read ? { analystAt: now, dataHash } : keep?.analystAt ? { analystAt: keep.analystAt, dataHash: keep.dataHash } : {}),
    alertedFocus1: focus === 1 ? prevAi?.alertedFocus1 : false,
  };

  const doc: PlayerTierDoc = {
    ...(prev ?? { playerId: p.id }),
    playerId: p.id,
    tmProfile: p.tmProfile,
    playerName: p.fullName,
    ai,
    effort,
    inputs,
  };
  await db.collection(TIERS_COLLECTION).doc(p.id).set(clean(doc));
  ctx.tiers.set(p.id, doc);
  return { doc, analystRan, refreshed };
}

/** Background sweep of the whole roster with bounded concurrency. Used by the worker. */
export async function sweepRoster(
  db: Firestore,
  opts: ProcessOptions & { concurrency?: number; onlyIds?: string[]; log?: (m: string) => void }
): Promise<TierMeta> {
  const t0 = Date.now();
  const ctx = await loadContext(db);
  const log = opts.log ?? (() => {});
  const queue = ctx.players.filter((p) => (opts.onlyIds ? opts.onlyIds.includes(p.id) : true));
  // stalest first
  queue.sort((a, b) => (ctx.tiers.get(a.id)?.ai?.computedAt ?? 0) - (ctx.tiers.get(b.id)?.ai?.computedAt ?? 0));
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
        await alertNewPushRecommendation(db, r.doc);
        analysed++;
        if (r.analystRan) aiCalls++;
        log(`✓ ${p.fullName} → L${r.doc.ai?.level} F${r.doc.ai?.focus}${r.analystRan ? ' (AI)' : ''} [${r.refreshed.join(',') || 'cached'}]`);
      } catch (e) {
        errors.push({ playerId: p.id, error: String((e as Error)?.message ?? e).slice(0, 200) });
        log(`✗ ${p.fullName}: ${(e as Error)?.message ?? e}`);
      }
    }
  });
  await Promise.all(workers);
  const meta: TierMeta = { lastRunAt: Date.now(), durationMs: Date.now() - t0, analysed, aiCalls, total: queue.length, errors: errors.slice(0, 20) };
  const [col, id] = META_DOC.split('/');
  await db.collection(col).doc(id).set(clean(meta));
  return meta;
}

export async function readMeta(db: Firestore): Promise<TierMeta | null> {
  const [col, id] = META_DOC.split('/');
  const s = await db.collection(col).doc(id).get();
  return s.exists ? (s.data() as TierMeta) : null;
}

/* ───────────────────────── writes ───────────────────────── */

function clean<T>(o: T): T {
  return JSON.parse(JSON.stringify(o)) as T;
}

export interface TagChange {
  level?: Level;
  focus?: Focus;
  note?: string;
  locked?: boolean;
}

/** Any agent can change tags; notes are optional. Records history; alerts owners on Push now. */
export async function applyTags(
  db: Firestore,
  playerId: string,
  change: TagChange,
  actor: Actor,
  kind: TierHistoryEntry['kind']
): Promise<PlayerTierDoc> {
  const ref = db.collection(TIERS_COLLECTION).doc(playerId);
  const playerSnap = await db.collection('Players').doc(playerId).get();
  const pdata = playerSnap.data() as RosterPlayer | undefined;
  const snap = await ref.get();
  const cur = (snap.exists ? (snap.data() as PlayerTierDoc) : { playerId }) as PlayerTierDoc;
  const next: PlayerTierDoc = { ...cur, playerId, tmProfile: cur.tmProfile ?? pdata?.tmProfile, playerName: cur.playerName ?? pdata?.fullName };

  const fromLevel = cur.level ?? null;
  const fromFocus = cur.focus ?? null;
  const toLevel = change.level ?? cur.level;
  const toFocus = change.focus ?? cur.focus;
  const changed = (change.level != null && change.level !== cur.level) || (change.focus != null && change.focus !== cur.focus);

  if (change.level != null) next.level = change.level;
  if (change.focus != null) next.focus = change.focus;
  if (change.locked != null) next.locked = change.locked;
  if (changed) {
    next.confirmedBy = actor.name;
    next.confirmedAt = Date.now();
    // Accepting/overriding clears a dismissal that no longer applies.
    delete next.dismissed;
    const entry: TierHistoryEntry = {
      at: Date.now(),
      by: actor.name,
      kind,
      fromLevel,
      toLevel: toLevel ?? null,
      fromFocus,
      toFocus: toFocus ?? null,
      ...(change.note ? { note: change.note.slice(0, 400) } : {}),
    };
    next.history = [...(cur.history ?? []), entry].slice(-40);
  }
  await ref.set(clean(next));

  if (change.focus === 1 && cur.focus !== 1) {
    await notifyOwners(db, {
      title: 'Push now',
      body: `${next.playerName ?? 'Player'} moved to Push now${actor.system ? '' : ` by ${actor.name}`}.`,
      playerId,
    });
  }
  return next;
}

export async function dismissSuggestion(db: Firestore, playerId: string): Promise<void> {
  const ref = db.collection(TIERS_COLLECTION).doc(playerId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const d = snap.data() as PlayerTierDoc;
  await ref.set(clean({ ...d, dismissed: { level: d.ai?.level, focus: d.ai?.focus, at: Date.now() } }));
}

/* ───────────────────────── push alerts ───────────────────────── */

/**
 * Alerts go to the owner(s) configured in TIERING_ALERT_EMAILS (comma-separated account emails).
 * Push only (FCM) + an entry in the account's in-app Notifications list.
 */
export async function notifyOwners(
  db: Firestore,
  msg: { title: string; body: string; playerId: string }
): Promise<{ sent: number; owners: number }> {
  const emails = (process.env.TIERING_ALERT_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return { sent: 0, owners: 0 };
  const accounts = (await db.collection('Accounts').get()).docs.filter((d) =>
    emails.includes(String(d.data().email ?? '').toLowerCase())
  );
  let sent = 0;
  for (const acc of accounts) {
    const d = acc.data();
    const tokens = new Set<string>();
    if (d.fcmToken) tokens.add(String(d.fcmToken));
    if (Array.isArray(d.fcmTokens)) {
      for (const e of d.fcmTokens) {
        const t = typeof e === 'string' ? e : e?.token;
        if (t) tokens.add(String(t));
      }
    }
    const link = '/dashboard';
    try {
      if (tokens.size) {
        const r = await getMessaging(getFirebaseAdmin()!).sendEachForMulticast({
          tokens: Array.from(tokens),
          notification: { title: msg.title, body: msg.body },
          data: { type: 'LEVEL_FOCUS', playerId: msg.playerId, link },
          android: { priority: 'high', notification: { channelId: 'mgsr_team_notifications' } },
          webpush: { notification: { title: msg.title, body: msg.body }, fcmOptions: { link } },
        });
        sent += r.successCount;
      }
      await acc.ref.collection('Notifications').add({
        type: 'LEVEL_FOCUS',
        title: msg.title,
        body: msg.body,
        data: { playerId: msg.playerId, link },
        timestamp: Date.now(),
        read: false,
      });
    } catch (e) {
      console.warn('[tiering] notify failed for', acc.id, e);
    }
  }
  return { sent, owners: accounts.length };
}

/** After a run: alert once when the engine newly recommends Push now for a not-yet-Push-now player. */
export async function alertNewPushRecommendation(db: Firestore, doc: PlayerTierDoc): Promise<void> {
  const ai = doc.ai;
  if (!ai || ai.focus !== 1 || doc.focus === 1 || ai.alertedFocus1) return;
  await notifyOwners(db, {
    title: 'AI recommends Push now',
    body: `${doc.playerName ?? 'Player'}: ${ai.reasonEn.split('.')[0]}.`,
    playerId: doc.playerId,
  });
  await db.collection(TIERS_COLLECTION).doc(doc.playerId).set({ ai: { ...ai, alertedFocus1: true } }, { merge: true });
}
