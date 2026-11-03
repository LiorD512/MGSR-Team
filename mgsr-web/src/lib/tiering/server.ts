/**
 * Server-side pieces of Level & Focus: auth, data loading, analysis pipeline, writes, push alerts.
 * All Firestore access uses the Admin SDK (bypasses rules) — the client talks to /api/tiering/*.
 */
import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getMessaging } from 'firebase-admin/messaging';
import type { Firestore } from 'firebase-admin/firestore';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';
import {
  GEMINI_MODEL,
  INPUTS_TTL_MS,
  LEVEL_DEFINITIONS,
  REANALYSE_AFTER_MS,
} from './config';
import {
  computeUrgency,
  confidenceFrom,
  contractMonthsLeft,
  fmSignal,
  focusFrom,
  leagueSignal,
  levelFromScore,
  outputSignal,
  parseValueEuro,
  positionGroupOf,
  requestMatches,
  trendFromHistory,
  valueSignal,
  weightedScore,
} from './engine';
import type {
  Focus,
  Level,
  PlayerTierDoc,
  TierAi,
  TierEffort,
  TierHistoryEntry,
  TierInputs,
  TierSignals,
  Trend,
} from './types';

export const TIERS_COLLECTION = 'PlayerTiers';
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
  return { now, players, tiers, mandates, requests, taskTouches };
}

export function isStale(tier: PlayerTierDoc | undefined, now: number): boolean {
  return !tier?.ai || now - (tier.ai.computedAt || 0) > REANALYSE_AFTER_MS;
}

export function computeEffort(p: RosterPlayer, ctx: TierContext): TierEffort {
  const cutoff = ctx.now - 30 * DAY;
  const notes = (p.noteList ?? []).filter((n) => (n.createdAt ?? 0) >= cutoff);
  const lastNote = Math.max(0, ...(p.noteList ?? []).map((n) => n.createdAt ?? 0));
  const t = (p.tmProfile && ctx.taskTouches.get(p.tmProfile)) || ctx.taskTouches.get(p.id) || { count30: 0, last: 0 };
  return { notes30: notes.length, tasks30: t.count30, lastTouchAt: Math.max(lastNote, t.last) };
}

/* ───────────────────────── external inputs (cached) ───────────────────────── */

async function fetchJson(url: string, ms: number): Promise<Record<string, unknown> | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function gatherInputs(p: RosterPlayer, prev: TierInputs | undefined, origin: string, now: number): Promise<TierInputs> {
  if (prev?.fetchedAt && now - prev.fetchedAt < INPUTS_TTL_MS) return prev;
  const out: TierInputs = { ...(prev ?? {}), fetchedAt: now };
  const name = p.fullName ?? '';
  const [fm, stats] = await Promise.all([
    name
      ? fetchJson(
          `${origin}/api/fminside/player?` +
            new URLSearchParams({
              player_name: name,
              club: p.currentClub?.clubName ?? '',
              age: p.age ?? '',
              position: (p.positions ?? [])[0] ?? '',
              nationality: p.nationality ?? '',
            }).toString(),
          15000
        )
      : null,
    p.tmProfile ? fetchJson(`${getScoutBaseUrl()}/player_stats?${new URLSearchParams({ url: p.tmProfile })}`, 10000) : null,
  ]);
  const ca = Number(fm?.ca);
  const pa = Number(fm?.pa);
  if (ca > 0) out.fmCa = ca;
  if (pa > 0) out.fmPa = pa;
  if (stats && stats.api_matched) {
    const r = Number(stats.api_rating);
    const m = Number(stats.api_minutes);
    if (r > 0) out.apiRating = r;
    if (m > 0) out.apiMinutes = m;
  }
  return out;
}

/* ───────────────────────── Gemini ───────────────────────── */

interface GeminiRead {
  adj: -1 | 0 | 1;
  confidence: number;
  reasonEn: string;
  reasonHe: string;
  evidence: string[];
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
}

async function askGemini(facts: Record<string, unknown>): Promise<GeminiRead | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const levels = (Object.keys(LEVEL_DEFINITIONS) as unknown as Level[])
    .map((l) => `L${l}: ${LEVEL_DEFINITIONS[l].en}`)
    .join('\n');
  const prompt = `You are the head scout of a football agency (Israel / Europe / Gulf market).
Classify the player's current LEVEL using this scale:
${levels}

The engine already computed a base level from market value, league strength and (when available) FM ability and match ratings.
Your job: decide whether a qualitative adjustment of exactly -1, 0 or +1 level is justified (+1 = better level), using ONLY the facts below
(agent notes, age, trend, contract, data coverage). Be conservative: use 0 unless the facts clearly justify a move.
Never invent statistics. If data is thin, say so and lower confidence.

FACTS (JSON):
${JSON.stringify(facts)}

Return ONLY JSON:
{"adj": -1|0|1, "confidence": 0-100, "reasonEn": "1-2 sentences, concrete, agent-facing", "reasonHe": "same in Hebrew", "evidence": ["short fact", "short fact"]}`;
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await model.generateContent(prompt);
      const j = extractJson(res.response.text()) as Partial<GeminiRead>;
      const adj = j.adj === 1 || j.adj === -1 ? j.adj : 0;
      return {
        adj,
        confidence: Math.max(0, Math.min(100, Number(j.confidence) || 50)),
        reasonEn: String(j.reasonEn ?? '').slice(0, 400),
        reasonHe: String(j.reasonHe ?? '').slice(0, 400),
        evidence: Array.isArray(j.evidence) ? j.evidence.slice(0, 4).map((e) => String(e).slice(0, 160)) : [],
      };
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (attempt === 0 && /429|quota|rate/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      return null;
    }
  }
  return null;
}

/* ───────────────────────── analysis ───────────────────────── */

function templateReason(opts: {
  level: Level;
  focus: Focus;
  next: TierAi['next'];
  coverage: number;
  trend: Trend;
}): { en: string; he: string } {
  const thin = opts.coverage < 0.6;
  const nextEn =
    opts.next.kind === 'mandate' ? `Mandate ends in ${opts.next.value} days.`
    : opts.next.kind === 'contract' ? `Contract ends in ${opts.next.value} months.`
    : opts.next.kind === 'requests' ? `${opts.next.value} open club request(s) match him.`
    : opts.next.kind === 'untouched' ? `No contact for ${opts.next.value} days.`
    : 'Nothing time-critical right now.';
  const nextHe =
    opts.next.kind === 'mandate' ? `המנדט פג בעוד ${opts.next.value} ימים.`
    : opts.next.kind === 'contract' ? `החוזה מסתיים בעוד ${opts.next.value} חודשים.`
    : opts.next.kind === 'requests' ? `${opts.next.value} בקשות מועדונים פתוחות מתאימות לו.`
    : opts.next.kind === 'untouched' ? `אין קשר ${opts.next.value} ימים.`
    : 'אין דחיפות בזמן כרגע.';
  return {
    en: `${thin ? 'Based mainly on market value and league (limited match data). ' : ''}${nextEn}`,
    he: `${thin ? 'מבוסס בעיקר על שווי שוק וליגה (מעט נתוני משחק). ' : ''}${nextHe}`,
  };
}

export async function analyzePlayer(
  db: Firestore,
  ctx: TierContext,
  p: RosterPlayer,
  origin: string,
  opts: { useGemini?: boolean } = {}
): Promise<PlayerTierDoc> {
  const now = ctx.now;
  const prev = ctx.tiers.get(p.id);
  const inputs = await gatherInputs(p, prev?.inputs, origin, now);

  const group = positionGroupOf(p.positions);
  const valueEuro = parseValueEuro(p.marketValue);
  const signals: TierSignals = {
    value: valueSignal(valueEuro),
    league: leagueSignal(p.currentClub?.clubCountry),
    fm: fmSignal(inputs.fmCa),
    output: outputSignal(inputs.apiRating, inputs.apiMinutes),
  };
  const { score, coverage } = weightedScore(signals);
  const baseLevel = levelFromScore(score, group);
  const { trend } = trendFromHistory(p.marketValueHistory, now);

  const effort = computeEffort(p, ctx);
  const daysSinceTouch = effort.lastTouchAt ? Math.floor((now - effort.lastTouchAt) / DAY) : 60;
  const age = p.age ? parseInt(p.age, 10) || null : null;
  const contractMonths = contractMonthsLeft(p.contractExpired, now);
  const mandateExp = p.tmProfile ? ctx.mandates.get(p.tmProfile) : undefined;
  const mandateDays = mandateExp ? (mandateExp - now) / DAY : null;
  const matching = ctx.requests.filter((r) => requestMatches(r, { positions: p.positions, age })).length;

  const u = computeUrgency({ contractMonths, mandateDays, matchingRequests: matching, daysSinceTouch, trend });

  let adj: -1 | 0 | 1 = 0;
  let reasonEn = '';
  let reasonHe = '';
  let evidence: string[] = [];
  let confidence = confidenceFrom(coverage, score, group);
  let model = 'engine';

  if (opts.useGemini !== false) {
    const recentNotes = (p.noteList ?? [])
      .slice()
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      .slice(0, 5)
      .map((n) => String(n.notes ?? '').slice(0, 220));
    const read = await askGemini({
      player: p.fullName,
      age,
      positions: p.positions,
      club: p.currentClub?.clubName,
      clubCountry: p.currentClub?.clubCountry,
      marketValue: p.marketValue,
      valueTrend: trend,
      contractMonthsLeft: contractMonths != null ? Math.round(contractMonths) : null,
      mandateDaysLeft: mandateDays != null ? Math.round(mandateDays) : null,
      matchingOpenClubRequests: matching,
      daysSinceLastTouch: effort.lastTouchAt ? daysSinceTouch : null,
      fm: inputs.fmCa ? { currentAbility: inputs.fmCa, potential: inputs.fmPa ?? null } : null,
      matchData: inputs.apiRating ? { avgRating: inputs.apiRating, minutes: inputs.apiMinutes ?? null } : null,
      engine: { score, baseLevel, signals, dataCoverage: Math.round(coverage * 100) },
      recentAgentNotes: recentNotes,
    });
    if (read) {
      adj = read.adj;
      reasonEn = read.reasonEn;
      reasonHe = read.reasonHe;
      evidence = read.evidence;
      confidence = Math.round((confidence + read.confidence) / 2);
      model = GEMINI_MODEL;
    }
  }

  const level = Math.max(1, Math.min(5, baseLevel - adj)) as Level;
  const focus = focusFrom(u.urgency, level);
  if (!reasonEn) {
    const t = templateReason({ level, focus, next: u.next, coverage, trend });
    reasonEn = t.en;
    reasonHe = t.he;
  }

  const ai: TierAi = {
    score,
    baseLevel,
    adj,
    level,
    focus,
    urgency: u.urgency,
    urgencyParts: u.parts,
    trend,
    confidence,
    reasonEn,
    reasonHe,
    evidence,
    signals,
    next: u.next,
    model,
    computedAt: now,
    alertedFocus1: focus === 1 ? prev?.ai?.alertedFocus1 : false,
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
  return doc;
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
