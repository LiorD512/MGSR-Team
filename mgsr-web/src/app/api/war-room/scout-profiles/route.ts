/**
 * GET /api/war-room/scout-profiles
 * Fetches AI Scout Agent Network profiles from Firestore.
 * Query params: agentId (filter by agent), limit (default 50)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebaseAdmin';
import { AGENTS_CONFIG, SCOUT_PROFILES, type AgentId } from '@/lib/scoutAgentConfig';
import { extractPlayerIdFromUrl } from '@/lib/api';
import { formatMarketValue } from '@/lib/releases';
import type { ScoutProfileResponse } from '@/types/scoutProfiles';

export const dynamic = 'force-dynamic';

export type { ScoutProfileResponse };

function getProfileImage(profileImage: string | null | undefined, tmProfileUrl: string): string {
  if (profileImage?.trim()) return profileImage.trim();
  // TM now requires timestamp-suffixed image URLs — plain ID.jpg no longer works.
  // Return the official TM default placeholder instead of a broken URL.
  return 'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';
}

// ──────────────────────────────────────────────────────────────────────────
// DETERMINISTIC VERDICT ENGINE
// No AI / Gemini. The verdict, score and reason are computed from the raw
// numbers already on every ScoutProfiles doc (match score, FM potential,
// contract months, per-90 output, value, age, league tier). This means every
// profile gets a verdict — not just the top-10 Gemini subset.
// ──────────────────────────────────────────────────────────────────────────

/** Months remaining on a contract from TM's "contract until" string/number. */
function contractMonthsLeft(contractExpires: unknown): number | null {
  if (contractExpires == null) return null;
  const d = typeof contractExpires === 'number' ? new Date(contractExpires) : new Date(String(contractExpires));
  if (isNaN(d.getTime())) return null;
  const m = Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
  return m < 0 ? 0 : m;
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

interface ComputedVerdict {
  score: number;              // 0-100 opportunity score
  tier: 'sign' | 'monitor' | 'watch';
  valueArc: 'rising' | 'peak' | 'declining' | null;
  reasonEn: string;
  reasonHe: string;
}

/**
 * Compute an opportunity score + verdict from real data.
 * Blends: base match score, FM potential headroom, contract leverage,
 * per-90 output, youth, and value-for-band — all signals that exist on the doc.
 */
function computeVerdict(d: Record<string, unknown>): ComputedVerdict {
  const match = num(d.matchScore) ?? 0;              // 0-100 from the worker
  const fmPa = num(d.fmPa);
  const fmCa = num(d.fmCa);
  const age = num(d.age) ?? 0;
  const valEuro = num(d.marketValueEuro) ?? 0;
  const goals90 = num(d.goalsPer90);
  const contrib90 = num(d.contribPer90);
  const rating = num(d.apiRating);
  const mins90 = num(d.apiMinutes90s);
  const months = contractMonthsLeft(d.contractExpires);

  // Start from the worker's match score (already a calibrated 0-100), then
  // layer transparent bonuses. Cap at 100.
  let score = match * 0.6; // 0-60 base from match score
  const reasons: { en: string; he: string; weight: number }[] = [];

  // FM potential headroom (CA→PA gap) — the clearest "upside" signal.
  if (fmPa != null && fmPa > 0) {
    const gap = fmCa != null && fmCa > 0 ? fmPa - fmCa : 0;
    if (fmPa >= 150) { score += 14; reasons.push({ weight: 14, en: `elite FM potential (PA ${fmPa})`, he: `פוטנציאל FM גבוה (PA ${fmPa})` }); }
    else if (fmPa >= 135) { score += 9; reasons.push({ weight: 9, en: `strong FM potential (PA ${fmPa})`, he: `פוטנציאל FM חזק (PA ${fmPa})` }); }
    else if (fmPa >= 120) { score += 4; }
    if (gap >= 25) { score += 6; reasons.push({ weight: 6, en: `${gap} points of growth room`, he: `${gap} נק׳ מרחב גדילה` }); }
    else if (gap >= 12) { score += 3; }
  }

  // Contract leverage — expiring deals are cheap/free opportunities.
  if (months != null) {
    if (months <= 6) { score += 12; reasons.push({ weight: 12, en: `contract up in ${months} months — free/token-fee leverage`, he: `חוזה מסתיים בעוד ${months} ח׳ — מינוף להעברה חופשית/זולה` }); }
    else if (months <= 12) { score += 7; reasons.push({ weight: 7, en: `contract down to ${months} months`, he: `נותרו ${months} ח׳ לחוזה` }); }
    else if (months <= 18) { score += 3; }
  }

  // Per-90 output (only meaningful with real minutes).
  if (mins90 != null && mins90 >= 5) {
    if (goals90 != null && goals90 >= 0.5) { score += 9; reasons.push({ weight: 9, en: `${goals90.toFixed(2)} goals/90`, he: `${goals90.toFixed(2)} שערים ל-90` }); }
    else if (contrib90 != null && contrib90 >= 0.6) { score += 7; reasons.push({ weight: 7, en: `${contrib90.toFixed(2)} G+A/90`, he: `${contrib90.toFixed(2)} G+A ל-90` }); }
    else if (contrib90 != null && contrib90 >= 0.35) { score += 3; }
    if (rating != null && rating >= 7.0) { score += 5; reasons.push({ weight: 5, en: `${rating.toFixed(2)} avg match rating`, he: `דירוג משחק ${rating.toFixed(2)}` }); }
  }

  // Youth premium.
  if (age > 0 && age <= 20) { score += 6; reasons.push({ weight: 6, en: `only ${age} years old`, he: `בן ${age} בלבד` }); }
  else if (age > 0 && age <= 23) { score += 3; }

  // Value-for-band — cheaper picks inside the Israeli ceiling score better.
  if (valEuro > 0) {
    if (valEuro <= 500_000) { score += 5; reasons.push({ weight: 5, en: `low ask (€${Math.round(valEuro / 1000)}K)`, he: `מחיר נמוך (€${Math.round(valEuro / 1000)}K)` }); }
    else if (valEuro <= 1_000_000) score += 2;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // Verdict tiers from the computed score.
  const tier: ComputedVerdict['tier'] = score >= 72 ? 'sign' : score >= 55 ? 'monitor' : 'watch';

  // Value arc from the real trajectory signals we have.
  let valueArc: ComputedVerdict['valueArc'] = null;
  const gap = fmPa != null && fmCa != null ? fmPa - fmCa : null;
  if (age > 0 && age <= 23 && (gap == null || gap >= 10)) valueArc = 'rising';
  else if (age >= 29) valueArc = 'declining';
  else if (age >= 24 && age <= 28) valueArc = 'peak';

  // Build the reason sentence from the top-weighted real signals.
  const top = reasons.sort((a, b) => b.weight - a.weight).slice(0, 3);
  const lead = tier === 'sign'
    ? { en: 'Act now — ', he: 'כדאי לפעול עכשיו — ' }
    : tier === 'monitor'
      ? { en: 'Worth watching — ', he: 'שווה מעקב — ' }
      : { en: 'On the radar — ', he: 'על הרדאר — ' };
  const joinEn = top.length ? top.map((r) => r.en).join(', ') : 'solid profile match in your band';
  const joinHe = top.length ? top.map((r) => r.he).join(', ') : 'התאמת פרופיל טובה בטווח שלך';
  const reasonEn = `${lead.en}${joinEn}.`;
  const reasonHe = `${lead.he}${joinHe}.`;

  return { score, tier, valueArc, reasonEn, reasonHe };
}

export async function GET(request: NextRequest) {
  try {
    const app = getFirebaseAdmin();
    if (!app) {
      return NextResponse.json({ error: 'Firebase not configured', profiles: [] }, { status: 500 });
    }

    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(app);

    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get('agentId') as AgentId | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '1500', 10), 2000);

    // Per-agent: simple where() without orderBy (no composite index needed).
    // All agents: orderBy only, fetch all profiles.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db.collection('ScoutProfiles');

    if (agentId && AGENTS_CONFIG[agentId]) {
      query = query.where('agentId', '==', agentId);
    } else {
      query = query.orderBy('lastRefreshedAt', 'desc');
    }

    const snapshot = await query.limit(limit).get();
    const docs = snapshot.docs;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let profiles: ScoutProfileResponse[] = docs.map((doc: any) => {
      const d = doc.data();
      const agentCfg = AGENTS_CONFIG[(d.agentId as AgentId) || 'portugal'];
      const profileCfg = SCOUT_PROFILES[(d.profileType as keyof typeof SCOUT_PROFILES) || 'HIDDEN_GEM'];
      const marketValueEuro = d.marketValueEuro ?? 0;
      const displayValue =
        marketValueEuro > 0 ? formatMarketValue(marketValueEuro) : (d.marketValue || '');
      // Corroborating agents (players surfaced by 2+ scouts) — written by the
      // worker. Resolve agent ids to display flags for the "found by N scouts" badge.
      const corroboratingIds: string[] = Array.isArray(d.corroboratingAgents) ? d.corroboratingAgents : [];
      const corroboratingAgents = corroboratingIds.map((aid: string) => {
        const cfg = AGENTS_CONFIG[aid as AgentId];
        return { id: aid, name: cfg?.name || aid, nameHe: cfg?.nameHe || cfg?.name || aid, flag: cfg?.flag || '🌍' };
      });

      // Deterministic verdict from the real numbers on the doc.
      const verdict = computeVerdict(d as Record<string, unknown>);

      return {
        id: doc.id,
        tmProfileUrl: d.tmProfileUrl || '',
        agentId: d.agentId || '',
        profileType: d.profileType || '',
        profileTypeLabel: profileCfg?.label || d.profileType || '',
        profileTypeLabelHe: profileCfg?.labelHe || d.profileType || '',
        playerName: d.playerName || 'Unknown',
        profileImage: getProfileImage(d.profileImage, d.tmProfileUrl),
        age: d.age ?? 0,
        position: d.position || '',
        marketValue: displayValue,
        marketValueEuro,
        club: d.club || '',
        league: d.league || '',
        leagueTier: d.leagueTier ?? 1,
        nationality: d.nationality || null,
        matchReason: d.matchReason || '',
        matchScore: d.matchScore ?? 0,
        fmPa: d.fmPa ?? null,
        fmCa: d.fmCa ?? null,
        contractExpires: d.contractExpires || null,
        discoveredAt: d.discoveredAt ?? 0,
        lastRefreshedAt: d.lastRefreshedAt ?? 0,
        agentName: agentCfg?.name || d.agentId || '',
        agentNameHe: agentCfg?.nameHe || agentCfg?.name || d.agentId || '',
        agentFlag: agentCfg?.flag || '🌍',
        scoutExplanationEn: profileCfg?.explanationEn || '',
        scoutExplanationHe: profileCfg?.explanationHe || '',

        // ── Computed verdict (deterministic, from real numbers — no AI) ──
        computedScore: verdict.score,                 // 0-100 opportunity score
        computedTier: verdict.tier,                   // sign | monitor | watch
        computedValueArc: verdict.valueArc,           // rising | peak | declining | null
        computedReasonEn: verdict.reasonEn,
        computedReasonHe: verdict.reasonHe,

        // ── Per-90 performance (API-Football) ──
        goalsPer90: typeof d.goalsPer90 === 'number' ? d.goalsPer90 : null,
        contribPer90: typeof d.contribPer90 === 'number' ? d.contribPer90 : null,
        apiRating: typeof d.apiRating === 'number' ? d.apiRating : null,
        apiGoals: typeof d.apiGoals === 'number' ? d.apiGoals : null,
        apiAssists: typeof d.apiAssists === 'number' ? d.apiAssists : null,
        apiMinutes90s: typeof d.apiMinutes90s === 'number' ? d.apiMinutes90s : null,

        // ── Real-world intel (TheSportsDB / ClubElo), previously dropped ──
        intelWage: d.intelWage || null,
        intelAgent: d.intelAgent || null,
        intelHonours: typeof d.intelHonours === 'number' ? d.intelHonours : null,
        intelClubElo: typeof d.intelClubElo === 'number' ? d.intelClubElo : null,
        intelFoot: d.intelFoot || null,
        intelHeight: d.intelHeight || null,

        // ── Cross-agent corroboration ──
        corroboratingAgents,
        corroborationCount: corroboratingAgents.length,
      };
    });

    // Deduplicate by player (tmProfileUrl) — keep one profile per player, preferring most specific type
    const PROFILE_PRIORITY: Record<string, number> = {
      CONTRACT_EXPIRING: 1,
      YOUNG_STRIKER_HOT: 2,
      HIDDEN_GEM: 3,
      HIGH_VALUE_BENCHED: 4,
      LOWER_LEAGUE_RISER: 5,
      LOW_VALUE_STARTER: 6,
    };
    const seenUrls = new Map<string, ScoutProfileResponse>();
    for (const p of profiles) {
      const url = p.tmProfileUrl;
      const existing = seenUrls.get(url);
      const priority = PROFILE_PRIORITY[p.profileType] ?? 99;
      const existingPriority = existing ? (PROFILE_PRIORITY[existing.profileType] ?? 99) : 99;
      if (!existing || priority < existingPriority) {
        seenUrls.set(url, p);
      }
    }
    // Rank by the computed opportunity score (best picks first), then recency.
    profiles = Array.from(seenUrls.values()).sort((a, b) => {
      const d = (b.computedScore ?? 0) - (a.computedScore ?? 0);
      if (d !== 0) return d;
      return (b.lastRefreshedAt ?? 0) - (a.lastRefreshedAt ?? 0);
    });

    // Images use fallback URL from getProfileImage (constructed from TM player ID)
    // Market values are already stored in Firestore from scout agent runs

    const lastRun = await db
      .collection('ScoutAgentRuns')
      .orderBy('runAt', 'desc')
      .limit(1)
      .get();
    const lastRunData = lastRun.docs[0]?.data();
    const lastRunAt = lastRunData?.runAt ?? null;

    // The sweep funnel — makes the agents' daily scale legible on the client.
    // Sweep funnel from the latest run doc. Guard against the worker's initial
    // "status: running" placeholder (profilesFound/BeforeReview written as 0 at
    // start, filled at the end) and a stale "runAt" ordering by only trusting
    // the funnel when it is non-zero; otherwise fall back to the actual number
    // of profiles we loaded, so the UI never claims "0 candidates" while 847
    // profiles are on screen.
    const nz = (v: unknown): number | null => (typeof v === 'number' && v > 0 ? v : null);
    const sd = (lastRunData?.sportDirector as Record<string, unknown> | undefined) || undefined;
    const funnelApproved = nz(sd?.approvedCount) ?? nz(lastRunData?.profilesFound);
    const run = {
      scanned: nz(lastRunData?.playersScanned) ?? nz(lastRunData?.unmatchedCandidatesTotal),
      matched: nz(lastRunData?.profilesBeforeReview) ?? funnelApproved ?? profiles.length,
      approved: funnelApproved ?? profiles.length,
      rejected: nz(sd?.rejectedCount) ?? nz(lastRunData?.profilesRejected),
      leaguesScanned: nz(lastRunData?.leaguesScanned),
      crossAgent: nz(lastRunData?.crossLeagueDetections),
    };

    const byAgent = profiles.reduce<Record<string, number>>((acc, p) => {
      acc[p.agentId] = (acc[p.agentId] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      profiles,
      lastRunAt,
      run,
      totalCount: profiles.length,
      byAgent,
    });
  } catch (err) {
    console.error('[ScoutProfiles API] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch scout profiles', profiles: [] },
      { status: 500 }
    );
  }
}
