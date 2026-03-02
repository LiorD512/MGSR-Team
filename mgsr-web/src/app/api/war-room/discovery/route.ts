/**
 * GET /api/war-room/discovery
 * Fetches AI-curated discovery candidates for the War Room.
 * Ligat Ha'Al filter: value_max €2.5m, last transfer fee ≤€2.5m, reachable leagues.
 * Varies queries each request for fresh discovery.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';
import { handlePlayer, getLastTransferFee } from '@/lib/transfermarkt';
const IMAGE_FETCH_CONCURRENCY = 3;
const LIGAT_HAAL_VALUE_MAX = 2_500_000;
const LIGAT_HAAL_LAST_TRANSFER_MAX = 2_500_000;
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
  source: 'request_match' | 'hidden_gem' | 'general';
  sourceLabel: string;
  requestId?: string;
  clubName?: string;
  hiddenGemScore?: number;
  hiddenGemReason?: { he: string; en: string };
  fmPa?: number;
  fmCa?: number;
  fmPotentialGap?: number;
  fbrefGoals?: string | number;
  fbrefAssists?: string | number;
  fbrefGoalsPer90?: number;
  fbrefAssistsPer90?: number;
  fbrefMinutes90s?: string | number;
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

async function fetchRecruitment(params: Record<string, string>): Promise<Record<string, unknown>[]> {
  const search = new URLSearchParams(params);
  search.set('value_max', String(LIGAT_HAAL_VALUE_MAX));
  search.set('limit', '15');
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
  const fbrefMatched = p.fbref_matched === true;
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
    fbrefGoals: fbrefMatched ? (p.fbref_goals as string | number | undefined) : undefined,
    fbrefAssists: fbrefMatched ? (p.fbref_assists as string | number | undefined) : undefined,
    fbrefGoalsPer90: fbrefMatched ? (typeof p.fbref_goals_per90 === 'number' ? p.fbref_goals_per90 : parseFloat(String(p.fbref_goals_per90 || '')) || undefined) : undefined,
    fbrefAssistsPer90: fbrefMatched ? (typeof p.fbref_assists_per90 === 'number' ? p.fbref_assists_per90 : parseFloat(String(p.fbref_assists_per90 || '')) || undefined) : undefined,
    fbrefMinutes90s: fbrefMatched ? (p.fbref_minutes_90s as string | number | undefined) : undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const seen = new Set<string>();
    const candidates: DiscoveryCandidate[] = [];

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

    // 2. For each request, fetch recruitment (with Ligat Ha'Al value cap)
    for (const req of requests) {
      if (!req.position?.trim()) continue;
      const params: Record<string, string> = {
        position: req.position.trim(),
        lang: 'en',
      };
      if (req.minAge != null) params.age_min = String(req.minAge);
      if (req.maxAge != null) params.age_max = String(req.maxAge);
      if (req.dominateFoot?.trim() && req.dominateFoot !== 'any') params.foot = req.dominateFoot.trim();
      if (req.transferFee?.trim()) params.transfer_fee = req.transferFee.trim();

      const results = await fetchRecruitment(params);
      for (const p of results) {
        const url = (p.url as string) || '';
        if (!url || seen.has(url)) continue;
        seen.add(url);
        const val = parseMarketValueToEuro(p.market_value as string);
        if (val > LIGAT_HAAL_VALUE_MAX) continue;
        candidates.push(
          toCandidate(p, 'request_match', `Matches ${req.clubName || 'request'}`.slice(0, 40), req.id, req.clubName)
        );
      }
    }

    // 3. Varied discovery — mixed ages for All tab; only players passing strict criteria appear in Hidden Gems tab
    const shuffledPositions = shuffle(ALL_POSITIONS);
    const ageMax = 24 + Math.floor(Math.random() * 6); // 24–29 for variety in All tab
    let debugLogged = false;
    for (const pos of shuffledPositions) {
      if (candidates.length >= 25) break;
      const params: Record<string, string> = {
        position: pos,
        age_max: String(ageMax),
        lang: 'en',
      };
      const results = await fetchRecruitment(params);
      if (results.length > 0 && !debugLogged) {
        console.log('[War Room Discovery] Recruitment sample keys:', Object.keys(results[0]));
        debugLogged = true;
      }
      for (const p of results) {
        const url = (p.url as string) || '';
        if (!url || seen.has(url)) continue;
        const val = parseMarketValueToEuro(p.market_value as string);
        if (val > LIGAT_HAAL_VALUE_MAX) continue;
        seen.add(url);
        const ageNum = parseAge(p.age as string);
        const isHg = isRealHiddenGem(p, val, ageNum);
        const stats = getStatsScore(p);
        const source: DiscoveryCandidate['source'] = isHg ? 'hidden_gem' : 'general';
        const sourceLabel = isHg ? `Hidden Gem ${stats}` : 'Discovery';
        const reason = isHg && ageNum != null ? buildHiddenGemReason(p, val, ageNum, (p.market_value as string) || '') : undefined;
        candidates.push(
          toCandidate(p, source, sourceLabel, undefined, undefined, isHg ? { hiddenGemScore: stats, hiddenGemReason: reason } : undefined)
        );
      }
    }

    // Dedupe, shuffle for variety, then limit
    let unique = Array.from(new Map(candidates.map((c) => [c.transfermarktUrl, c])).values());
    unique = shuffle(unique).slice(0, 25);

    // Filter by last transfer fee — exclude players bought for >€2.5M (not realistic for Ligat Ha'Al)
    const passedTransferFilter: DiscoveryCandidate[] = [];
    for (let i = 0; i < unique.length; i += IMAGE_FETCH_CONCURRENCY) {
      const chunk = unique.slice(i, i + IMAGE_FETCH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (c) => {
          try {
            const last = await getLastTransferFee(c.transfermarktUrl);
            if (last && last.fee > LIGAT_HAAL_LAST_TRANSFER_MAX) return null;
            return c;
          } catch {
            return c;
          }
        })
      );
      for (const c of results) {
        if (c) passedTransferFilter.push(c);
      }
    }

    // Enrich with profile images from Transfermarkt
    const imageMap = new Map<string, string>();
    const toEnrich = passedTransferFilter.slice(0, 20);
    for (let i = 0; i < toEnrich.length; i += IMAGE_FETCH_CONCURRENCY) {
      const chunk = toEnrich.slice(i, i + IMAGE_FETCH_CONCURRENCY);
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
    const final = toEnrich.map((c) => {
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
