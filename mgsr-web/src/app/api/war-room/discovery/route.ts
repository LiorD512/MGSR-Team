/**
 * GET /api/war-room/discovery
 * Fetches AI-curated discovery candidates for the War Room.
 * Varies queries each request for fresh discovery.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';
import { handlePlayer } from '@/lib/transfermarkt';
const IMAGE_FETCH_CONCURRENCY = 3;
const DISCOVERY_AGE_MIN = 18;
const DISCOVERY_AGE_MAX = 30;
const DISCOVERY_VALUE_MAX = 4_000_000;
const PLAYERS_PER_POSITION = 3;
const HIDDEN_GEM_VALUE_MAX = 1_500_000; // Very low market value
const HIDDEN_GEM_AGE_MAX = 24;
const HIDDEN_GEM_FM_PA_MIN = 130; // Impressive PA
const HIDDEN_GEM_FM_GAP_MIN = 10; // Or significant room to grow
const HIDDEN_GEM_STATS_MIN = 65; // Good stats (smart_score/scouting_score 0–100)

const ALL_POSITIONS = ['CF', 'AM', 'CM', 'CB', 'DM', 'LW', 'RW', 'LB', 'RB', 'SS'];

function parseAge(ageStr: string | undefined): number | null {
  if (!ageStr?.trim()) return null;
  const num = parseInt(ageStr.replace(/[^\d]/g, ''), 10);
  return isNaN(num) ? null : num;
}

function getFmPa(p: Record<string, unknown>): number | null {
  if (typeof p.fm_pa === 'number') return p.fm_pa;
  if (typeof p.fmi_pa === 'number') return p.fmi_pa as number;
  return null;
}

function getFmCa(p: Record<string, unknown>): number | null {
  if (typeof p.fm_ca === 'number') return p.fm_ca;
  if (typeof p.fmi_ca === 'number') return p.fmi_ca as number;
  return null;
}

function getFmPotentialGap(p: Record<string, unknown>): number | null {
  if (typeof p.fm_potential_gap === 'number') return p.fm_potential_gap;
  const pa = getFmPa(p);
  const ca = getFmCa(p);
  if (pa != null && ca != null) return pa - ca;
  return null;
}

function getStatsScore(p: Record<string, unknown>): number {
  const smart = (p.smart_score as number) ?? 0;
  const scout = (p.scouting_score as number) ?? 0;
  const sim = (p.similarity_score as number) ?? 0;
  if (smart > 0) return Math.round(smart);
  if (sim > 0) return Math.round(sim * 100);
  return Math.round(scout);
}

/**
 * Real hidden gem: FM PA impressive, very low value, age ≤24, good stats.
 * All criteria must pass.
 */
function isRealHiddenGem(p: Record<string, unknown>, valEuro: number, ageNum: number | null): boolean {
  if (ageNum == null || ageNum > HIDDEN_GEM_AGE_MAX) return false;
  if (valEuro > HIDDEN_GEM_VALUE_MAX) return false;
  const fmPa = getFmPa(p);
  const fmGap = getFmPotentialGap(p);
  const hasImpressivePa = fmPa != null && fmPa >= HIDDEN_GEM_FM_PA_MIN;
  const hasGrowthRoom = fmGap != null && fmGap >= HIDDEN_GEM_FM_GAP_MIN;
  if (!hasImpressivePa && !hasGrowthRoom) return false;
  const stats = getStatsScore(p);
  return stats >= HIDDEN_GEM_STATS_MIN;
}

function buildHiddenGemReason(
  p: Record<string, unknown>,
  valEuro: number,
  ageNum: number,
  marketValueStr: string
): { he: string; en: string } {
  const fmPa = getFmPa(p);
  const fmCa = getFmCa(p);
  const fmGap = getFmPotentialGap(p);
  const stats = getStatsScore(p);
  const partsHe: string[] = [];
  const partsEn: string[] = [];
  if (fmPa != null && fmPa >= HIDDEN_GEM_FM_PA_MIN) {
    partsHe.push(`PA ${fmPa} ב-FM — פוטנציאל גבוה`);
    partsEn.push(`FM PA ${fmPa} — high potential`);
  }
  if (fmGap != null && fmGap >= HIDDEN_GEM_FM_GAP_MIN) {
    partsHe.push(`פער פוטנציאל +${fmGap} (CA ${fmCa ?? '?'} → PA ${fmPa ?? '?'})`);
    partsEn.push(`potential gap +${fmGap} (CA ${fmCa ?? '?'} → PA ${fmPa ?? '?'})`);
  }
  partsHe.push(`ערך שוק ${marketValueStr} — נמוך מאוד ביחס לפוטנציאל`);
  partsEn.push(`market value ${marketValueStr} — very low relative to potential`);
  partsHe.push(`גיל ${ageNum} — עד 24`);
  partsEn.push(`age ${ageNum} — under 24`);
  partsHe.push(`סטטיסטיקות טובות — ציון ${stats}`);
  partsEn.push(`strong stats — score ${stats}`);
  return {
    he: partsHe.join('. '),
    en: partsEn.join('. '),
  };
}

/* ── Position mapping ──────────────────────────────────────── */
function mapToShortPosition(pos: string): string {
  if (!pos?.trim()) return '';
  const p = pos.trim();
  if (ALL_POSITIONS.includes(p)) return p;
  if (p.includes('Centre-Forward') || p.includes('Center-Forward')) return 'CF';
  if (p.includes('Second Striker')) return 'SS';
  if (p.includes('Centre-Back') || p.includes('Center-Back')) return 'CB';
  if (p.includes('Left-Back')) return 'LB';
  if (p.includes('Right-Back')) return 'RB';
  if (p.includes('Defensive Midfield')) return 'DM';
  if (p.includes('Central Midfield')) return 'CM';
  if (p.includes('Attacking Midfield')) return 'AM';
  if (p.includes('Left Wing')) return 'LW';
  if (p.includes('Right Wing')) return 'RW';
  return '';
}

/* ── Numeric value helper ─────────────────────────────────── */
function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

/* ── Position-specific quality filters (API-Football stats) ─ */
function passesPositionQuality(p: Record<string, unknown>, position: string): boolean {
  if (p.api_matched !== true) return true; // No API data — allow through

  const rating = toNum(p.api_rating);
  const min90s = toNum(p.api_minutes_90s);
  if (min90s < 3) return false; // Too few minutes to judge
  if (rating > 0 && rating < 6.2) return false; // Universal minimum

  const goals = toNum(p.api_goals);
  const assists = toNum(p.api_assists);
  const goalsPer90 = toNum(p.api_goals_per90);
  const gcPer90 = toNum(p.api_goal_contributions_per90);
  const keyPassesPer90 = toNum(p.api_key_passes_per90);
  const tackles = toNum(p.api_tackles);
  const interceptions = toNum(p.api_interceptions);
  const passAcc = toNum(p.api_passes_accuracy);
  const duelsWonPct = toNum(p.api_duels_won_pct);
  const dribblesPer90 = toNum(p.api_dribbles_per90);

  switch (position) {
    case 'CF': case 'SS':
      return goalsPer90 >= 0.25 || goals >= 3;
    case 'AM':
      return gcPer90 >= 0.3 || (goals + assists) >= 3;
    case 'LW': case 'RW':
      return gcPer90 >= 0.25 || (goals + assists) >= 3 || (dribblesPer90 >= 1.5 && keyPassesPer90 >= 0.8);
    case 'CM':
      return keyPassesPer90 >= 0.8 || passAcc >= 78 || (goals + assists) >= 2;
    case 'DM':
      return (tackles + interceptions) >= 15 || duelsWonPct >= 55;
    case 'CB':
      return (tackles + interceptions) >= 15 || duelsWonPct >= 55;
    case 'LB': case 'RB':
      return (tackles + interceptions) >= 10 || duelsWonPct >= 52;
    default:
      return true;
  }
}

/* ── Pick players with value spread across tiers ──────────── */
function pickWithValueSpread(
  players: { candidate: DiscoveryCandidate; valEuro: number }[],
  count: number
): DiscoveryCandidate[] {
  if (players.length <= count) return players.map((p) => p.candidate);

  const low = players.filter((p) => p.valEuro < 750_000);
  const mid = players.filter((p) => p.valEuro >= 750_000 && p.valEuro < 2_000_000);
  const high = players.filter((p) => p.valEuro >= 2_000_000);

  const picked: DiscoveryCandidate[] = [];
  const tiers = [low, mid, high].filter((t) => t.length > 0);

  let tierIdx = 0;
  while (picked.length < count && tiers.length > 0) {
    const tier = tiers[tierIdx % tiers.length];
    if (tier.length > 0) {
      picked.push(tier.shift()!.candidate);
    }
    // Remove empty tiers
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (tiers[i].length === 0) tiers.splice(i, 1);
    }
    tierIdx++;
  }
  return picked;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface DiscoveryCandidate {
  name: string;
  position: string;
  age: string;
  marketValue: string;
  transfermarktUrl: string;
  league?: string;
  club?: string;
  nationality?: string;
  profileImage?: string;
  source: 'request_match' | 'hidden_gem' | 'general' | 'agent_pick';
  sourceLabel: string;
  requestId?: string;
  clubName?: string;
  hiddenGemScore?: number;
  hiddenGemReason?: { he: string; en: string };
  fmPa?: number;
  fmCa?: number;
  fmPotentialGap?: number;
  apiGoals?: string | number;
  apiAssists?: string | number;
  apiGoalsPer90?: number;
  apiAssistsPer90?: number;
  apiMinutes90s?: string | number;
  apiRating?: number;
  // New: Scout Agent intelligence
  scoutNarrative?: string;
  matchScore?: number;
  profileType?: string;
  agentId?: string;
}

function parseMarketValueToEuro(val: string | undefined): number {
  if (!val?.trim()) return 0;
  const s = val.trim().replace(/,/g, '').toLowerCase();
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return 0;
  if (s.includes('m') || s.includes('million')) return num * 1_000_000;
  if (s.includes('k') || s.includes('thousand')) return num * 1_000;
  return num;
}

async function fetchRecruitment(params: Record<string, string>, limit = 15): Promise<Record<string, unknown>[]> {
  const search = new URLSearchParams(params);
  search.set('limit', String(limit));
  search.set('sort_by', 'score');
  search.set('_t', String(Date.now()));

  const url = `${getScoutBaseUrl()}/recruitment?${search.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => ({}))) as { results?: Record<string, unknown>[] };
  return data.results ?? [];
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function extractPlayerId(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const parts = url.trim().split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]?.toLowerCase();
    if (p === 'spieler' || p === 'player') {
      const id = parts[i + 1];
      return id && /^\d+$/.test(id) ? id : null;
    }
  }
  const last = parts[parts.length - 1];
  return last && /^\d+$/.test(last) ? last : null;
}

function toCandidate(
  p: Record<string, unknown>,
  source: DiscoveryCandidate['source'],
  sourceLabel: string,
  requestId?: string,
  clubName?: string,
  opts?: { hiddenGemScore?: number; hiddenGemReason?: { he: string; en: string }; fmPa?: number; fmCa?: number; fmPotentialGap?: number }
): DiscoveryCandidate {
  const url = (p.url as string) || '';
  const profileImage = (p.profile_image as string) || undefined;
  const id = extractPlayerId(url);
  const derivedImage = id ? `https://img.a.transfermarkt.technology/portrait/medium/${id}.jpg` : undefined;
  const apiMatched = p.api_matched === true;
  return {
    name: (p.name as string) || '',
    position: (p.position as string) || '',
    age: (p.age as string) || '',
    marketValue: (p.market_value as string) || '',
    transfermarktUrl: url,
    league: (p.league as string) || undefined,
    club: (p.club as string) || undefined,
    nationality: (p.citizenship as string) || undefined,
    profileImage: profileImage || derivedImage,
    source,
    sourceLabel,
    requestId,
    clubName,
    hiddenGemScore: opts?.hiddenGemScore ?? (typeof p.hidden_gem_score === 'number' ? p.hidden_gem_score : undefined),
    hiddenGemReason: opts?.hiddenGemReason,
    fmPa: opts?.fmPa ?? getFmPa(p) ?? undefined,
    fmCa: opts?.fmCa ?? getFmCa(p) ?? undefined,
    fmPotentialGap: opts?.fmPotentialGap ?? getFmPotentialGap(p) ?? undefined,
    apiGoals: apiMatched ? (p.api_goals as string | number | undefined) : undefined,
    apiAssists: apiMatched ? (p.api_assists as string | number | undefined) : undefined,
    apiGoalsPer90: apiMatched ? (typeof p.api_goals_per90 === 'number' ? p.api_goals_per90 : parseFloat(String(p.api_goals_per90 || '')) || undefined) : undefined,
    apiAssistsPer90: apiMatched ? (typeof p.api_assists_per90 === 'number' ? p.api_assists_per90 : parseFloat(String(p.api_assists_per90 || '')) || undefined) : undefined,
    apiMinutes90s: apiMatched ? (p.api_minutes_90s as string | number | undefined) : undefined,
    apiRating: apiMatched ? (typeof p.api_rating === 'number' ? p.api_rating : parseFloat(String(p.api_rating || '')) || undefined) : undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const seen = new Set<string>();
    const candidates: DiscoveryCandidate[] = [];

    // 0. Load top agent picks (ScoutProfiles with high matchScore + narrative)
    let agentPicks: DiscoveryCandidate[] = [];
    try {
      const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
      const app = getFirebaseAdmin();
      if (app) {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore(app);
        const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000; // Last 3 days
        const agentSnap = await db.collection('ScoutProfiles')
          .where('matchScore', '>=', 70)
          .where('lastRefreshedAt', '>=', cutoff)
          .orderBy('matchScore', 'desc')
          .limit(8)
          .get();
        for (const doc of agentSnap.docs) {
          const d = doc.data();
          const url = d.tmProfileUrl || '';
          if (!url || seen.has(url)) continue;
          const pickAge = typeof d.age === 'number' ? d.age : parseAge(String(d.age ?? ''));
          if (pickAge != null && (pickAge < DISCOVERY_AGE_MIN || pickAge > DISCOVERY_AGE_MAX)) continue;
          const pickVal = parseMarketValueToEuro(d.marketValue || '');
          if (pickVal > DISCOVERY_VALUE_MAX) continue;
          seen.add(url);
          const id = extractPlayerId(url);
          const derivedImage = id ? `https://img.a.transfermarkt.technology/portrait/medium/${id}.jpg` : undefined;
          const profileLabel = (d.profileType || '').replace(/_/g, ' ').toLowerCase();
          agentPicks.push({
            name: d.playerName || '',
            position: d.position || '',
            age: String(d.age || ''),
            marketValue: d.marketValue || '',
            transfermarktUrl: url,
            league: d.league || undefined,
            club: d.club || undefined,
            nationality: d.nationality || undefined,
            profileImage: d.profileImage || derivedImage,
            source: 'agent_pick',
            sourceLabel: `Agent ${(d.agentId || '').charAt(0).toUpperCase() + (d.agentId || '').slice(1)} · ${profileLabel}`,
            fmPa: d.fmPa ?? undefined,
            fmCa: d.fmCa ?? undefined,
            fmPotentialGap: d.fmPa && d.fmCa ? d.fmPa - d.fmCa : undefined,
            scoutNarrative: d.scoutNarrative || undefined,
            matchScore: d.matchScore ?? undefined,
            profileType: d.profileType || undefined,
            agentId: d.agentId || undefined,
          });
        }
        console.log(`[War Room Discovery] Loaded ${agentPicks.length} agent picks (score ≥ 70)`);
      }
    } catch (err) {
      console.warn('[War Room Discovery] Agent picks load failed (non-fatal):', err);
    }

    // Add agent picks first — they're the highest quality
    candidates.push(...agentPicks);

    // 1. Request matches (if Firestore available)
    let requests: { id: string; position?: string; minAge?: number; maxAge?: number; dominateFoot?: string; transferFee?: string; clubName?: string }[] = [];
    try {
      const { getFirebaseAdmin } = await import('@/lib/firebaseAdmin');
      const app = getFirebaseAdmin();
      if (app) {
        const { getFirestore } = await import('firebase-admin/firestore');
        const db = getFirestore(app);
        const snap = await db.collection('ClubRequests').limit(10).get();
        requests = snap.docs
          .map((d) => {
            const data = d.data();
            const status = data.status as string | undefined;
            if (status === 'fulfilled' || status === 'cancelled') return null;
            return {
              id: d.id,
              position: data.position,
              minAge: data.minAge,
              maxAge: data.maxAge,
              dominateFoot: data.dominateFoot,
              transferFee: data.transferFee,
              clubName: data.clubName,
            };
          })
          .filter((r): r is NonNullable<typeof r> => r != null);
      }
    } catch {
      // Firestore not configured or error — continue with generic discovery
    }

    // 2. For each request, fetch recruitment
    for (const req of requests) {
      if (!req.position?.trim()) continue;
      const params: Record<string, string> = {
        position: req.position.trim(),
        lang: 'en',
        value_max: String(DISCOVERY_VALUE_MAX),
      };
      if (req.minAge != null) params.age_min = String(Math.max(req.minAge, DISCOVERY_AGE_MIN));
      else params.age_min = String(DISCOVERY_AGE_MIN);
      if (req.maxAge != null) params.age_max = String(Math.min(req.maxAge, DISCOVERY_AGE_MAX));
      else params.age_max = String(DISCOVERY_AGE_MAX);
      if (req.dominateFoot?.trim() && req.dominateFoot !== 'any') params.foot = req.dominateFoot.trim();
      if (req.transferFee?.trim()) params.transfer_fee = req.transferFee.trim();

      const results = await fetchRecruitment(params);
      for (const p of results) {
        const url = (p.url as string) || '';
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const val = parseMarketValueToEuro(p.market_value as string);
        if (val > DISCOVERY_VALUE_MAX) continue;
        const ageN = parseAge(p.age as string);
        if (ageN != null && (ageN < DISCOVERY_AGE_MIN || ageN > DISCOVERY_AGE_MAX)) continue;
        candidates.push(
          toCandidate(p, 'request_match', `Matches ${req.clubName || 'request'}`.slice(0, 40), req.id, req.clubName)
        );
      }
    }

    // 3. Position-balanced discovery with quality filters
    // Track slots already filled by agent picks + request matches
    const positionCounts = new Map<string, number>();
    for (const c of candidates) {
      const shortPos = mapToShortPosition(c.position);
      if (shortPos && ALL_POSITIONS.includes(shortPos)) {
        positionCounts.set(shortPos, (positionCounts.get(shortPos) || 0) + 1);
      }
    }

    // Determine which positions still need filling
    const positionsToFill = ALL_POSITIONS.filter(
      (p) => (positionCounts.get(p) || 0) < PLAYERS_PER_POSITION
    );

    // Parallel fetch for all positions that need more players
    const positionResults = await Promise.all(
      positionsToFill.map(async (pos) => {
        const results = await fetchRecruitment({
          position: pos,
          age_min: String(DISCOVERY_AGE_MIN),
          age_max: String(DISCOVERY_AGE_MAX),
          value_max: String(DISCOVERY_VALUE_MAX),
          lang: 'en',
        }, 20);
        return { pos, results };
      })
    );

    for (const { pos, results } of positionResults) {
      const currentCount = positionCounts.get(pos) || 0;
      const slotsRemaining = PLAYERS_PER_POSITION - currentCount;
      if (slotsRemaining <= 0) continue;

      const qualified: { candidate: DiscoveryCandidate; valEuro: number }[] = [];

      for (const p of results) {
        const url = (p.url as string) || '';
        if (!url || seen.has(url)) continue;
        const ageN = parseAge(p.age as string);
        if (ageN != null && (ageN < DISCOVERY_AGE_MIN || ageN > DISCOVERY_AGE_MAX)) continue;
        const val = parseMarketValueToEuro(p.market_value as string);
        if (val > DISCOVERY_VALUE_MAX) continue;
        if (!passesPositionQuality(p, pos)) continue;

        seen.add(url);
        const isHg = isRealHiddenGem(p, val, ageN);
        const stats = getStatsScore(p);
        const source: DiscoveryCandidate['source'] = isHg ? 'hidden_gem' : 'general';
        const sourceLabel = isHg ? `Hidden Gem ${stats}` : 'Discovery';
        const reason = isHg && ageN != null ? buildHiddenGemReason(p, val, ageN, (p.market_value as string) || '') : undefined;

        qualified.push({
          candidate: toCandidate(p, source, sourceLabel, undefined, undefined, isHg ? { hiddenGemScore: stats, hiddenGemReason: reason } : undefined),
          valEuro: val,
        });
      }

      // Pick with value spread across tiers for variety
      const picked = pickWithValueSpread(qualified, slotsRemaining);
      candidates.push(...picked);
      positionCounts.set(pos, currentCount + picked.length);
    }

    console.log(`[War Room Discovery] Position distribution:`, Object.fromEntries(positionCounts));

    // Dedupe (safety net) and shuffle for variety between refreshes
    let unique = Array.from(new Map(candidates.map((c) => [c.transfermarktUrl, c])).values());
    unique = shuffle(unique).slice(0, 35);

    // Enrich with profile images from Transfermarkt
    const imageMap = new Map<string, string>();
    for (let i = 0; i < unique.length; i += IMAGE_FETCH_CONCURRENCY) {
      const chunk = unique.slice(i, i + IMAGE_FETCH_CONCURRENCY);
      await Promise.all(
        chunk.map(async (c) => {
          try {
            const data = await handlePlayer(c.transfermarktUrl);
            const img = (data as { profileImage?: string })?.profileImage?.trim();
            if (img) imageMap.set(c.transfermarktUrl, img);
          } catch {
            // ignore
          }
        })
      );
    }
    const final = unique.map((c) => {
      const img = imageMap.get(c.transfermarktUrl) || c.profileImage;
      return { ...c, profileImage: img || c.profileImage };
    });

    return NextResponse.json({
      candidates: final,
      count: final.length,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[War Room Discovery] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discovery failed', candidates: [] },
      { status: 500 }
    );
  }
}
