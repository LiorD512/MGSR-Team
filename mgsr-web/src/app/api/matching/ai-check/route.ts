/**
 * POST /api/matching/ai-check  { requestId, candidates: AiCandidate[] }  →  { results, cached, callsLeft }
 *
 * Optional "AI scout" second opinion on the top matches of one request (men platform). Advice only: the UI shows it
 * as a note and never hides a player because of it.
 *
 * HARD COST CAP (agreed: < $1 / month for this feature):
 *   - model gemini-2.5-flash-lite, input capped (≤10 candidates, every string truncated), output ≤ 600 tokens;
 *   - at most MONTHLY_CALL_CAP calls per calendar month AND recorded spend < MONTHLY_USD_CAP, enforced with a Firestore
 *     transaction on `MatchingAiChecks/_budget_{YYYY-MM}` BEFORE the call is made;
 *   - answers are cached per request + exact inputs, so re-opening the page never pays twice.
 *   Worst case even if Google raised Flash-Lite prices 10×: 60 calls × (~2.5k in + 600 out tokens) ≈ $0.30.
 */
import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { adminAuth, adminDb, getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { recordGeminiUsage } from '@/lib/geminiUsage';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MODEL = 'gemini-2.5-flash-lite';
const MONTHLY_CALL_CAP = 60;
const MONTHLY_USD_CAP = 0.8;
const PRICE_IN = 0.1 / 1_000_000; // $ per input token (list price, Nov 2026)
const PRICE_OUT = 0.4 / 1_000_000;
const COLLECTION = 'MatchingAiChecks';

export interface AiCandidate {
  playerId: string;
  name: string;
  age?: string | number | null;
  positions?: string[];
  marketValue?: string | null;
  club?: string | null;
  clubStrength?: string | null;
  monthsInactive?: number | null;
  minutesShare?: string | null;
  score?: number;
}

export interface AiResult { playerId: string; verdict: 'realistic' | 'unlikely'; note: string }

const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' ? v : null);

export async function POST(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!getFirebaseAdmin()) return NextResponse.json({ error: 'Server not configured' }, { status: 503 });
  try {
    await adminAuth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { requestId?: unknown; candidates?: unknown };
  const requestId = typeof body.requestId === 'string' && /^[\w-]{1,80}$/.test(body.requestId) ? body.requestId : null;
  if (!requestId || !Array.isArray(body.candidates)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const candidates = (body.candidates as Record<string, unknown>[]).slice(0, 10).map((c) => ({
    playerId: String(cut(c.playerId, 60) ?? ''),
    name: cut(c.name, 60), age: cut(c.age, 4), positions: Array.isArray(c.positions) ? c.positions.slice(0, 3).map((x) => cut(x, 4)) : [],
    marketValue: cut(c.marketValue, 12), club: cut(c.club, 50), clubStrength: cut(c.clubStrength, 20),
    monthsInactive: typeof c.monthsInactive === 'number' ? c.monthsInactive : null, minutesShare: cut(c.minutesShare, 8),
  })).filter((c) => c.playerId);
  if (!candidates.length) return NextResponse.json({ results: [], cached: true });

  const db = adminDb();
  const reqDoc = await db.collection('ClubRequests').doc(requestId).get();
  if (!reqDoc.exists) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  const r = reqDoc.data()!;
  const lvl = r.clubTmProfile ? (await db.collection('MatchingClubLevels').doc(String(r.clubTmProfile).match(/verein\/(\d+)/)?.[1] ?? '_').get()).data() : undefined;
  const clubFacts = {
    club: cut(r.clubName, 60), country: cut(r.clubCountry, 40), position: cut(r.position, 4),
    age: r.ageDoesntMatter ? 'any' : `${r.minAge || '?'}-${r.maxAge || '?'}`, fee: cut(r.transferFee, 20), salary: cut(r.salaryRange, 20),
    squadMedianValue: lvl?.squadMedian ?? null, league: lvl?.league ?? null, leagueAvgValue: lvl?.leagueAvg ?? null,
    signingsLast3Seasons: Array.isArray(lvl?.signings) ? (lvl!.signings as { mv: number }[]).map((s) => s.mv).filter((x) => x > 0).sort((a, b) => a - b) : [],
  };

  // ── cache (same request + same facts → same answer)
  const hash = createHash('sha256').update(JSON.stringify({ clubFacts, candidates })).digest('hex').slice(0, 32);
  const cacheRef = db.collection(COLLECTION).doc(requestId);
  const cached = (await cacheRef.get()).data();
  if (cached?.hash === hash) return NextResponse.json({ results: cached.results as AiResult[], cached: true });

  // ── hard monthly cap, reserved atomically before calling
  const month = new Date().toISOString().slice(0, 7);
  const budgetRef = db.collection(COLLECTION).doc(`_budget_${month}`);
  const allowed = await db.runTransaction(async (tx) => {
    const b = (await tx.get(budgetRef)).data() ?? { calls: 0, estUsd: 0 };
    if ((b.calls ?? 0) >= MONTHLY_CALL_CAP || (b.estUsd ?? 0) >= MONTHLY_USD_CAP) return false;
    tx.set(budgetRef, { month, calls: (b.calls ?? 0) + 1, estUsd: b.estUsd ?? 0, updatedAt: Date.now() }, { merge: true });
    return true;
  });
  if (!allowed) return NextResponse.json({ error: 'budget', results: [] }, { status: 429 });

  const prompt = `You are the recruitment director of a football agency. A club asked for a player. For each candidate from our roster,
judge ONLY whether this club would realistically sign him (level, budget, availability). Use only the facts given; if facts are missing say so.
Club request: ${JSON.stringify(clubFacts)}
(signingsLast3Seasons = market values in € of the players this club actually signed; squadMedianValue = median value of its current squad.)
Candidates: ${JSON.stringify(candidates)}
(clubStrength = median squad value of the club he plays for / last played for; monthsInactive = months since his last game.)
Return JSON array: [{"playerId": "...", "verdict": "realistic" | "unlikely", "note": "max 18 words, concrete reason"}] — one item per candidate.`;

  try {
    const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
      model: MODEL,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 600 },
    });
    const res = await model.generateContent(prompt);
    const usage = res.response.usageMetadata;
    const usd = (usage?.promptTokenCount ?? 0) * PRICE_IN + (usage?.candidatesTokenCount ?? 0) * PRICE_OUT;
    await Promise.all([
      recordGeminiUsage({ feature: 'request-match', model: MODEL, usage, extra: { candidates: candidates.length } }),
      db.runTransaction(async (tx) => {
        const b = (await tx.get(budgetRef)).data() ?? {};
        tx.set(budgetRef, { estUsd: (b.estUsd ?? 0) + usd, updatedAt: Date.now() }, { merge: true });
      }).catch(() => undefined),
    ]);
    const parsed = JSON.parse(res.response.text() || '[]') as Partial<AiResult>[];
    const ids = new Set(candidates.map((c) => c.playerId));
    const results: AiResult[] = (Array.isArray(parsed) ? parsed : [])
      .filter((x) => typeof x.playerId === 'string' && ids.has(x.playerId) && (x.verdict === 'realistic' || x.verdict === 'unlikely'))
      .map((x) => ({ playerId: x.playerId!, verdict: x.verdict!, note: String(x.note ?? '').slice(0, 160) }));
    await cacheRef.set({ hash, results, at: Date.now(), model: MODEL });
    const b = (await budgetRef.get()).data();
    return NextResponse.json({ results, cached: false, callsLeft: Math.max(0, MONTHLY_CALL_CAP - (b?.calls ?? 0)) });
  } catch (e) {
    await recordGeminiUsage({ feature: 'request-match', model: MODEL, failed: true });
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 200) : 'AI failed', results: [] }, { status: 502 });
  }
}
