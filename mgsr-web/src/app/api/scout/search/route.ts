/**
 * AI Scout Hybrid Search Pipeline.
 * Three-layer search: Rule-based parse + Gemini AI parse + Scout server.
 * Features: progressive loading, AI-enriched interpretation, goals filtering.
 *
 * Pipeline:
 *   Step 1 (instant): Rule-based parse → structured params
 *   Step 2 (parallel): Scout server /recruitment + Gemini AI parse (enriches notes)
 *   Step 3 (merge):    Combine results, deduplicate, re-rank
 *   Step 4 (fallback): If < 5 results and complex query → Gemini-first suggestions
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseFreeQuery } from '@/lib/parseFreeQuery';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';
import { getLeagueAvgMarketValue, searchFreeAgentsFallback } from '@/lib/transfermarkt';
import { translateHebrewToEnglish } from '@/lib/translateQuery';
import { SCOUT_PERSONA, SEARCH_PERSONA_EXT } from '@/lib/scoutPersona';
import { getFirebaseAdmin } from '@/lib/firebaseAdmin';
import {
  buildQueryFingerprint,
  buildPlayerKey,
  diversifyCandidates,
  normalizeDiversityMode,
  parseMarketValueEuro,
  type DiversityMode,
} from '@/lib/discoveryDiversity';
import { getRecentServedKeysForQuery, recordServedKeysForQuery } from '@/lib/queryDiversityMemory';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const FREESEARCH_URL = process.env.SCOUT_FREESEARCH_URL; // When set: use freesearch proxy (Python parse)

const LEAGUE_NAMES: Record<string, string> = {
  ISR1: "Ligat ha'Al",
  PL1: 'Ekstraklasa',
  GR1: 'Super League 1',
  BE1: 'Jupiler Pro League',
  NL1: 'Eredivisie',
  PO1: 'Liga Portugal',
};

function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function buildPersistentMemoryScope(userId: string | null, queryFingerprint: string): string | null {
  if (!userId?.trim() || !queryFingerprint) return null;
  return `${userId.trim()}__${shortHash(queryFingerprint)}`;
}

async function getPersistentSeenKeys(scope: string | null, maxRecent: number): Promise<string[]> {
  if (!scope || maxRecent <= 0) return [];
  const app = getFirebaseAdmin();
  if (!app) return [];
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(app);
    const snap = await db.collection('ScoutSearchDiversityMemory').doc(scope).get();
    if (!snap.exists) return [];
    const keys = Array.isArray(snap.data()?.keys) ? (snap.data()?.keys as string[]) : [];
    return keys.slice(-maxRecent).filter(Boolean);
  } catch (err) {
    console.warn('[AI Scout] persistent memory read failed:', err);
    return [];
  }
}

async function appendPersistentSeenKeys(scope: string | null, keys: string[]): Promise<void> {
  if (!scope || keys.length === 0) return;
  const app = getFirebaseAdmin();
  if (!app) return;
  try {
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    const db = getFirestore(app);
    await db.collection('ScoutSearchDiversityMemory').doc(scope).set(
      {
        keys: FieldValue.arrayUnion(...keys.slice(0, 120)),
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn('[AI Scout] persistent memory write failed:', err);
  }
}

/** Call freesearch proxy (Python) - returns full response or null on failure */
async function fetchFreesearch(
  query: string,
  queryFingerprint: string,
  persistentScope: string | null,
  lang: 'en' | 'he',
  initial: boolean,
  diversityMode: DiversityMode,
  seed: string,
  seenKeys: string[]
): Promise<NextResponse | null> {
  const parsed = parseFreeQuery(query, lang);
  const requestedTotal = parsed.limit ?? 15;
  const fetchLimit = initial ? Math.min(5, requestedTotal) : requestedTotal;
  const hasMore = initial && requestedTotal > 5;

  const params = new URLSearchParams({
    q: query,
    lang,
    limit: String(requestedTotal),
    initial: String(initial),
  });
  const url = `${FREESEARCH_URL!.replace(/\/$/, '')}/freesearch?${params.toString()}`;

  try {
    console.log('[AI Scout] Using freesearch proxy:', url.slice(0, 80) + '...');
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(180000),
    });
    const data = (await res.json().catch(() => null)) as { results?: Record<string, unknown>[]; error?: string } | null;
    if (!res.ok || !data) {
      console.error('[AI Scout] Freesearch failed:', res.status, data?.error);
      return null;
    }
    let results = data.results ?? [];
    const targetLeague = getTargetLeagueCode(query);
    const leagueAvg = targetLeague
      ? await getLeagueAvgMarketValue(targetLeague, 2025).catch(() => null)
      : null;
    const leagueAvgEuro = targetLeague && leagueAvg != null && leagueAvg > 0 ? leagueAvg : 398_000;

    // Apply market value cap — freesearch server doesn't filter by value
    const FREESEARCH_CAPS: Record<string, number> = { ISR1: 2_500_000, PL1: 5_000_000, GR1: 5_000_000, BE1: 10_000_000 };
    const FS_GLOBAL_DEFAULT_CAP = 4_000_000;
    const fsCap = targetLeague ? FREESEARCH_CAPS[targetLeague] : FS_GLOBAL_DEFAULT_CAP;
    if (fsCap != null && fsCap > 0) {
      const before = results.length;
      results = results.filter((p) => {
        const mv = p.market_value;
        if (mv == null || mv === '') return true;
        const valEuro = _parseMarketValue(String(mv));
        return valEuro <= fsCap;
      });
      if (results.length < before) {
        console.log(`[AI Scout] Freesearch market cap (€${fsCap.toLocaleString()}): ${before} → ${results.length}`);
      }
    }

    // Apply min goals filter — freesearch server doesn't support it
    const fsMinGoals = parsed.minGoals;
    if (fsMinGoals != null && fsMinGoals > 0) {
      results = results.filter((p) => {
        const goals = p.api_goals;
        if (goals == null) return false;
        const n = typeof goals === 'string' ? parseInt(goals, 10) : Number(goals);
        return !isNaN(n) && n >= fsMinGoals;
      });
      console.log(`[AI Scout] Freesearch goals filter (≥${fsMinGoals}): → ${results.length} results`);
    }

    // Apply min goal contributions filter — freesearch server doesn't support it
    const fsMinGC = parsed.minGoalContributions;
    if (fsMinGC != null && fsMinGC > 0) {
      const before = results.length;
      results = results.filter((p) => {
        const goals = Number(p.api_goals ?? 0);
        const assists = Number(p.api_assists ?? 0);
        if (p.api_goals == null && p.api_assists == null) return before <= fsMinGC;
        return (goals + assists) >= fsMinGC;
      });
      console.log(`[AI Scout] Freesearch G+A filter (≥${fsMinGC}): ${before} → ${results.length} results`);
    }

    // Apply free agent filter + TM fallback — freesearch server doesn't filter by club status
    const fsFreeAgent = parsed.freeAgent === true;
    let fsFallbackNote = '';
    if (fsFreeAgent) {
      const freeAgentPattern = /^(without\s*club|vereinslos|free\s*agent|ללא\s*מועדון|שחקן\s*חופשי|—|\s*)$/i;
      const freeResults = results.filter((p) => {
        const club = (p.club ?? p.current_club ?? '').toString().trim();
        return !club || freeAgentPattern.test(club);
      });
      if (freeResults.length > 0) {
        results = freeResults;
      } else {
        try {
          const tmFree = await searchFreeAgentsFallback({
            position: parsed.position,
            foot: parsed.foot,
            nationality: parsed.nationality,
            ageMax: parsed.ageMax,
            valueMax: fsCap ?? 3_000_000,
          });
          if (tmFree.length > 0) {
            results = tmFree;
            fsFallbackNote = lang === 'he'
              ? ` 🔄 מטרנספרמרקט (שחקנים ללא חוזה + חוזה שמסתיים תוך 6 חודשים)`
              : ` 🔄 From Transfermarkt (free agents + expiring contracts)`;
          }
        } catch { /* non-fatal */ }
      }
    }

    results = diversifyCandidates({
      candidates: results,
      limit: fetchLimit,
      mode: diversityMode,
      seed,
      seenKeys,
      getKey: (p) => buildPlayerKey((p.url as string) || null, (p.name as string) || ''),
      getBaseScore: (p) => {
        const smart = Number(p.smart_score ?? 0);
        const sim = Number(p.similarity_score ?? 0);
        const scout = Number(p.scouting_score ?? 0);
        if (smart > 0) return smart;
        if (sim > 0) return sim * 100;
        if (scout > 0) return scout;
        return 1;
      },
      getTokens: (p) => {
        const league = String(p.league ?? '').trim().toLowerCase();
        const club = String(p.club ?? '').trim().toLowerCase();
        const nation = String(p.citizenship ?? '').trim().toLowerCase();
        const position = String(p.position ?? '').trim().toLowerCase();
        const age = String(p.age ?? '').replace(/[^\d]/g, '');
        const market = parseMarketValueEuro(p.market_value);
        const valueBucket = market <= 0 ? 'value:unknown' : market <= 1_000_000 ? 'value:<=1m' : market <= 3_000_000 ? 'value:1-3m' : 'value:3m+';
        return [
          league ? `league:${league}` : '',
          club ? `club:${club}` : '',
          nation ? `nation:${nation}` : '',
          position ? `pos:${position}` : '',
          age ? `age:${Math.floor((parseInt(age, 10) || 0) / 3) * 3}` : 'age:unknown',
          valueBucket,
        ].filter(Boolean);
      },
    });
    const servedKeys = results
      .map((p) => buildPlayerKey((p.url as string) || null, (p.name as string) || ''))
      .filter(Boolean);
    if (servedKeys.length > 0) {
      recordServedKeysForQuery(queryFingerprint, servedKeys);
      await appendPersistentSeenKeys(persistentScope, servedKeys);
    }

    let interpretation =
      parsed.interpretation ||
      (lang === 'he'
        ? `מצאתי ${results.length} שחקנים מתוך מאגר (freesearch).${fsFallbackNote}`
        : `Found ${results.length} players (freesearch).${fsFallbackNote}`);
    interpretation += lang === 'he'
      ? ` מצב גיוון: ${diversityMode}`
      : ` Diversity mode: ${diversityMode}`;
    if (results.length < requestedTotal && requestedTotal > 0) {
      interpretation +=
        lang === 'he'
          ? ` (ביקשת ${requestedTotal}, נמצאו ${results.length}${hasMore ? ' – הרחב לחיפוש מלא' : ''})`
          : ` (you asked for ${requestedTotal}, found ${results.length}${hasMore ? ' – expand for full' : ''})`;
    }
    return NextResponse.json({
      results,
      interpretation,
      query,
      leagueInfo:
        targetLeague && leagueAvgEuro > 0
          ? {
              leagueName: LEAGUE_NAMES[targetLeague] || targetLeague,
              avgEuro: leagueAvgEuro,
              minEuro: Math.round(leagueAvgEuro * 0.5),
              maxEuro: Math.round(leagueAvgEuro * 2),
            }
          : undefined,
      hasMore,
      requestedTotal,
      diversityDebug: {
        mode: diversityMode,
        seenKeysInput: seenKeys.length,
        returned: results.length,
      },
    });
  } catch (err) {
    console.error('[AI Scout] Freesearch error:', err);
    return null;
  }
}

/** Map query to league for market filter display */
function getTargetLeagueCode(query: string): string | null {
  const q = query.toLowerCase();
  if (/(שוק\s*ה?ישראלי|israeli\s*market|israel\s*market|ליגה\s*ה?ישראלית|ליגת\s*העל|ligat\s*ha.?al|מתאימים?\s*(ל|ב)?ליגה\s*ה?ישראלית|for\s*(the\s*)?israeli\s*league|ישראל|israeli\s*premier)/i.test(q)) return 'ISR1';
  if (/(שוק\s*פולני|polish\s*market|poland\s*market|ekstraklasa)/i.test(q)) return 'PL1';
  if (/(שוק\s*יווני|greek\s*market|greece\s*market|super\s*league\s*(1|greece))/i.test(q)) return 'GR1';
  if (/(שוק\s*בלגי|belgian\s*market|belgium\s*market|jupiler)/i.test(q)) return 'BE1';
  return null;
}

/** Parse market value string like "€2.50m", "€500k", "€100,000" to euro number */
function _parseMarketValue(val: string): number {
  if (!val?.trim()) return 0;
  const s = val.trim().replace(/,/g, '').toLowerCase();
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return 0;
  if (s.includes('m') || s.includes('million') || s.includes('mio')) return num * 1_000_000;
  if (s.includes('k') || s.includes('thousand') || s.includes('th')) return num * 1_000;
  return num;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const lang = body?.lang === 'he' ? 'he' : 'en';
    const initial = body?.initial === true; // Progressive: first request gets 5 only
    const demo = body?.demo === true; // Demo mode: return mock data immediately (for local testing)
    const excludeUrls: string[] = Array.isArray(body?.excludeUrls) ? body.excludeUrls.filter((u: unknown) => typeof u === 'string' && u.trim()) : [];
    const diversityMode = normalizeDiversityMode(body?.diversityMode);
    const seed = typeof body?.seed === 'string' && body.seed.trim() ? body.seed.trim() : `${query}:${Date.now()}`;
    const userId = typeof body?.userId === 'string' && body.userId.trim() ? body.userId.trim() : null;
    const clientSeenKeys: string[] = Array.isArray(body?.seenKeys)
      ? body.seenKeys.filter((k: unknown) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
      : [];
    const queryFingerprint = buildQueryFingerprint(query);
    const persistentScope = buildPersistentMemoryScope(userId, queryFingerprint);
    const serverRecentKeys = getRecentServedKeysForQuery(queryFingerprint, diversityMode === 'discovery' ? 260 : 140);
    const persistentSeenKeys = await getPersistentSeenKeys(persistentScope, diversityMode === 'discovery' ? 260 : 140);
    const seenKeys: string[] = [...serverRecentKeys, ...persistentSeenKeys, ...clientSeenKeys];

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required', results: [] },
        { status: 400 }
      );
    }

    try {
      // Demo mode: return mock data immediately (for local testing when scout server is slow)
      if (demo) {
        const parsed = parseFreeQuery(query, lang);
        const mockResults = [
          { name: 'Demo Player 1', age: '25', position: 'Attack - Centre-Forward', market_value: '€500k', url: null, api_goals: '7' },
          { name: 'Demo Player 2', age: '24', position: 'Attack - Centre-Forward', market_value: '€400k', url: null, api_goals: '6' },
          { name: 'Demo Player 3', age: '26', position: 'Attack - Centre-Forward', market_value: '€600k', url: null, api_goals: '8' },
        ].filter((p) => !parsed.minGoals || parseInt(p.api_goals, 10) >= parsed.minGoals);
        return NextResponse.json({
          results: mockResults,
          interpretation: (lang === 'he' ? 'מצב דמו – נתונים לדוגמה. ' : 'Demo mode – sample data. ') + (parsed.interpretation ?? ''),
          query,
          leagueInfo: undefined,
          hasMore: false,
          requestedTotal: parsed.limit ?? 15,
        });
      }

      // Use freesearch proxy (Python) when SCOUT_FREESEARCH_URL is set
      if (FREESEARCH_URL) {
        const freesearchRes = await fetchFreesearch(query, queryFingerprint, persistentScope, lang, initial, diversityMode, seed, seenKeys);
        if (freesearchRes) {
          return freesearchRes;
        }
        console.log('[AI Scout] Freesearch failed, falling back to hybrid pipeline');
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 1: Translate + Rule-based parse (instant)
      // ═══════════════════════════════════════════════════════════════════
      let queryForParsing = query;
      let translatedQuery: string | undefined;
      if (lang === 'he') {
        const { translated, wasTranslated } = await translateHebrewToEnglish(query);
        if (wasTranslated) {
          translatedQuery = translated;
          queryForParsing = translated;
          console.log('[AI Scout] Translated query:', translated.slice(0, 80));
        }
      }

      console.log('[AI Scout] Step 1: Rule-based parse:', queryForParsing.slice(0, 60) + '...');
      const parsedHebrew = lang === 'he' ? parseFreeQuery(query, 'he') : null;
      const parsedMain = translatedQuery ? parseFreeQuery(queryForParsing, 'en') : parseFreeQuery(query, lang);

      // Merge: prefer Hebrew extraction for structured fields, English for notes
      const parsed = {
        ...parsedMain,
        position: parsedHebrew?.position || parsedMain.position,
        ageMin: parsedHebrew?.ageMin ?? parsedMain.ageMin,
        ageMax: parsedHebrew?.ageMax ?? parsedMain.ageMax,
        foot: parsedHebrew?.foot || parsedMain.foot,
        nationality: parsedHebrew?.nationality || parsedMain.nationality,
        freeAgent: parsedHebrew?.freeAgent ?? parsedMain.freeAgent,
        limit: parsedHebrew?.limit ?? parsedMain.limit,
        minGoals: parsedHebrew?.minGoals ?? parsedMain.minGoals,
        minGoalContributions: parsedHebrew?.minGoalContributions ?? parsedMain.minGoalContributions,
        transferFee: parsedHebrew?.transferFee || parsedMain.transferFee,
        valueMin: parsedHebrew?.valueMin ?? parsedMain.valueMin,
        valueMax: parsedHebrew?.valueMax ?? parsedMain.valueMax,
        notes: _mergeNotes(parsedHebrew?.notes, parsedMain?.notes),
        interpretation: parsedHebrew?.interpretation || parsedMain.interpretation,
      };

      // ═══════════════════════════════════════════════════════════════════
      // Israeli market / league-specific value caps
      // When a user says "שוק ישראלי" or "Israeli market", enforce a
      // realistic value ceiling. No scout in 40 years would suggest Højlund
      // or Orban for Ligat Ha'Al.
      // ═══════════════════════════════════════════════════════════════════
      const MARKET_VALUE_CAPS: Record<string, number> = {
        ISR1: 2_500_000,   // Ligat Ha'Al — max ~€2.5M
        PL1:  5_000_000,   // Ekstraklasa
        GR1:  5_000_000,   // Super League Greece
        BE1: 10_000_000,   // Jupiler Pro League
      };

      const targetLeague = getTargetLeagueCode(query);
      const leagueMarketCap = targetLeague ? MARKET_VALUE_CAPS[targetLeague] : undefined;

      // Global default cap — an agent working mid-tier markets has no use for €17M players
      const GLOBAL_DEFAULT_CAP = 4_000_000;
      // User's explicit value takes priority over league/global caps
      const userSetValue = parsed.valueMax != null || parsed.valueMin != null;
      const marketCap = userSetValue
        ? (parsed.valueMax ?? undefined)   // Use user's explicit max (if set)
        : (leagueMarketCap ?? GLOBAL_DEFAULT_CAP);

      // Force value_max if market detected and user didn't set their own
      if (!userSetValue && marketCap) {
        parsed.valueMax = marketCap;
        console.log(`[AI Scout] Market cap applied: ${targetLeague ?? 'global'} → value_max €${marketCap.toLocaleString()}`);
      }

      // Default age cap — mid-tier agent doesn't need 35-year-olds
      const GLOBAL_DEFAULT_AGE_MAX = 31;
      if (parsed.ageMax == null) {
        parsed.ageMax = GLOBAL_DEFAULT_AGE_MAX;
        console.log(`[AI Scout] Age cap applied: default → age_max ${GLOBAL_DEFAULT_AGE_MAX}`);
      }

      // Progressive loading settings
      const requestedTotal = parsed.limit ?? 15;
      const fetchLimit = initial ? Math.min(5, requestedTotal) : requestedTotal;
      const hasMore = initial && requestedTotal > 5;
      const minGoals = parsed.minGoals;
      const minGC = parsed.minGoalContributions;
      // If we have market cap, minGoals, minGC, or freeAgent filter → fetch extra to have enough after filtering
      const wantsFreeAgentEarly = parsed.freeAgent === true || /free\s*agent/i.test(parsed.notes ?? '');
      const needsOverfetch = minGoals != null || minGC != null || marketCap != null || wantsFreeAgentEarly;
      // Fetch aggressively to preserve quality after post-filtering and diversity penalties.
      const scoutLimit = wantsFreeAgentEarly
        ? Math.min(220, Math.max(fetchLimit * 14, 90))
        : needsOverfetch ? Math.min(180, Math.max(fetchLimit * 10, 80)) : Math.min(140, Math.max(fetchLimit * 8, 60));
      const leagueAvgPromise = targetLeague
        ? getLeagueAvgMarketValue(targetLeague, 2025).catch(() => null)
        : Promise.resolve(null);

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2: Scout server fetch (rule-based parse only)
      // ═══════════════════════════════════════════════════════════════════
      // Fire scout server request with rule-based params
      const scoutPromise = fetchScoutRecruitment({ ...parsed, limit: scoutLimit, excludeUrls }, lang);

      // Wait for scout + league avg to complete
      const [scoutResponse, leagueAvg] = await Promise.all([
        scoutPromise,
        leagueAvgPromise,
      ]);

      let results = scoutResponse.results ?? [];
      const preFilterPoolSize = results.length;

      // ═══════════════════════════════════════════════════════════════════
      // Post-filtering: goals + market value enforcement
      // Even if scout server returns high-value players, filter them out
      // when a market cap is active. A 40-year scout knows the market.
      // ═══════════════════════════════════════════════════════════════════
      if (marketCap != null && marketCap > 0) {
        const before = results.length;
        results = results.filter((p) => {
          const mv = p.market_value;
          if (mv == null || mv === '') return true; // Keep if no value data
          const valEuro = _parseMarketValue(String(mv));
          return valEuro <= marketCap;
        });
        if (results.length < before) {
          console.log(`[AI Scout] Market cap filter (€${marketCap.toLocaleString()}): ${before} → ${results.length} results`);
        }
      }

      // Filter by min_goals (scout server doesn't support it)
      if (minGoals != null && minGoals > 0) {
        results = results.filter((p) => {
          const goals = p.api_goals;
          if (goals == null) return false;
          const n = typeof goals === 'string' ? parseInt(goals, 10) : Number(goals);
          return !isNaN(n) && n >= minGoals;
        });
        console.log('[AI Scout] Filtered by min_goals:', minGoals, '→', results.length, 'results');
      }

      // Filter by min goal contributions (goals + assists) — triggered by "impressive attacking stats"
      if (minGC != null && minGC > 0) {
        const before = results.length;
        results = results.filter((p) => {
          const goals = Number(p.api_goals ?? 0);
          const assists = Number(p.api_assists ?? 0);
          // Players without API data get a pass if we have very few results
          if (p.api_goals == null && p.api_assists == null) return before <= minGC;
          return (goals + assists) >= minGC;
        });
        console.log(`[AI Scout] Goal contributions filter (≥${minGC} G+A): ${before} → ${results.length} results`);
      }

      // Filter by free agent: only players without club or "Without Club" / "Vereinslos" / "free agent"
      const wantsFreeAgent = parsed.freeAgent === true || /free\s*agent/i.test(parsed.notes ?? '');
      let freeAgentFallbackNote = '';
      if (wantsFreeAgent) {
        const before = results.length;
        const freeAgentPattern = /^(without\s*club|vereinslos|free\s*agent|ללא\s*מועדון|שחקן\s*חופשי|—|\s*)$/i;
        const freeAgentResults = results.filter((p) => {
          const club = (p.club ?? p.current_club ?? '').toString().trim();
          return !club || freeAgentPattern.test(club);
        });
        if (freeAgentResults.length > 0) {
          results = freeAgentResults;
          console.log('[AI Scout] Filtered by free agent:', before, '→', results.length, 'results');
        } else {
          // ═══════════════════════════════════════════════════════════════
          // FREE AGENT FALLBACK: Scout server had 0 free agents.
          // Fall back to Transfermarkt: free agents + contracts expiring ≤6mo
          // ═══════════════════════════════════════════════════════════════
          console.log('[AI Scout] No free agents in scout DB — triggering TM fallback');
          try {
            const tmFreeAgents = await searchFreeAgentsFallback({
              position: parsed.position,
              foot: parsed.foot,
              nationality: parsed.nationality,
              ageMax: parsed.ageMax,
              valueMax: marketCap ?? 3_000_000,
            });
            if (tmFreeAgents.length > 0) {
              results = tmFreeAgents;
              freeAgentFallbackNote = lang === 'he'
                ? `\n🔄 לא נמצאו שחקנים חופשיים במאגר הסקאוט — מצאתי ${tmFreeAgents.length} מטרנספרמרקט (שחקנים ללא חוזה + חוזה שמסתיים תוך 6 חודשים)`
                : `\n🔄 No free agents in scout DB — found ${tmFreeAgents.length} from Transfermarkt (free agents + contracts expiring within 6 months)`;
              console.log(`[AI Scout] TM fallback: ${tmFreeAgents.length} results`);
            } else {
              freeAgentFallbackNote = lang === 'he'
                ? '\n⚠️ לא נמצאו שחקנים חופשיים גם בטרנספרמרקט — מציג שחקנים עם מועדון'
                : '\n⚠️ No free agents found even on Transfermarkt — showing players with clubs';
            }
          } catch (tmErr) {
            console.warn('[AI Scout] TM free agent fallback failed:', tmErr);
            freeAgentFallbackNote = lang === 'he'
              ? '\n⚠️ לא נמצאו שחקנים חופשיים התואמים לקריטריונים — מציג שחקנים עם מועדון'
              : '\n⚠️ No free agents found matching criteria — showing players with clubs';
          }
        }
      }

      // Guardrail: if strict notes/filters collapsed the pool too far, backfill with a relaxed second pass.
      if (!wantsFreeAgent && results.length < fetchLimit) {
        try {
          const seenUrls = results
            .map((p) => (typeof p.url === 'string' ? p.url : ''))
            .filter(Boolean);
          const relaxedResponse = await fetchScoutRecruitment(
            {
              ...parsed,
              notes: undefined,
              limit: Math.min(240, Math.max(fetchLimit * 16, 120)),
              excludeUrls: [...excludeUrls, ...seenUrls],
            },
            lang,
          );
          const relaxedResults = (relaxedResponse.results ?? []).filter((p) => {
            const mv = p.market_value;
            if (marketCap != null && marketCap > 0 && mv != null && mv !== '') {
              const valEuro = _parseMarketValue(String(mv));
              if (valEuro > marketCap) return false;
            }
            if (minGoals != null && minGoals > 0) {
              const goals = p.api_goals;
              const g = typeof goals === 'string' ? parseInt(goals, 10) : Number(goals);
              if (Number.isNaN(g) || g < minGoals) return false;
            }
            if (minGC != null && minGC > 0) {
              const goals = Number(p.api_goals ?? 0);
              const assists = Number(p.api_assists ?? 0);
              if ((goals + assists) < minGC) return false;
            }
            return true;
          });

          if (relaxedResults.length > 0) {
            const byKey = new Map<string, Record<string, unknown>>();
            for (const p of [...results, ...relaxedResults]) {
              const key = buildPlayerKey((p.url as string) || null, (p.name as string) || '');
              if (key && !byKey.has(key)) byKey.set(key, p);
            }
            results = Array.from(byKey.values());
          }
        } catch (err) {
          console.warn('[AI Scout] relaxed backfill failed:', err);
        }
      }

      const modeLabel = diversityMode;
      const seenAndExcluded: string[] = [
        ...seenKeys,
        ...excludeUrls.map((u) => buildPlayerKey(u, '')),
      ];

      results = diversifyCandidates({
        candidates: results,
        limit: fetchLimit,
        mode: diversityMode,
        seed,
        seenKeys: seenAndExcluded,
        getKey: (p) => buildPlayerKey((p.url as string) || null, (p.name as string) || ''),
        getBaseScore: (p) => {
          const smart = Number(p.smart_score ?? 0);
          const sim = Number(p.similarity_score ?? 0);
          const scout = Number(p.scouting_score ?? 0);
          if (smart > 0) return smart;
          if (sim > 0) return sim * 100;
          if (scout > 0) return scout;
          return 1;
        },
        getTokens: (p) => {
          const league = String(p.league ?? '').trim().toLowerCase();
          const club = String(p.club ?? '').trim().toLowerCase();
          const nation = String(p.citizenship ?? '').trim().toLowerCase();
          const position = String(p.position ?? '').trim().toLowerCase();
          const style = String(p.playing_style ?? '').trim().toLowerCase();
          const age = String(p.age ?? '').replace(/[^\d]/g, '');
          const market = parseMarketValueEuro(p.market_value);
          const valueBucket = market <= 0 ? 'value:unknown' : market <= 1_000_000 ? 'value:<=1m' : market <= 3_000_000 ? 'value:1-3m' : 'value:3m+';
          return [
            league ? `league:${league}` : '',
            club ? `club:${club}` : '',
            nation ? `nation:${nation}` : '',
            position ? `pos:${position}` : '',
            style ? `style:${style}` : '',
            age ? `age:${Math.floor((parseInt(age, 10) || 0) / 3) * 3}` : 'age:unknown',
            valueBucket,
          ].filter(Boolean);
        },
      });
      const servedKeys = results
        .map((p) => buildPlayerKey((p.url as string) || null, (p.name as string) || ''))
        .filter(Boolean);
      if (servedKeys.length > 0) {
        recordServedKeysForQuery(queryFingerprint, servedKeys);
        await appendPersistentSeenKeys(persistentScope, servedKeys);
      }

      const leagueAvgEuro =
        targetLeague && leagueAvg != null && leagueAvg > 0 ? leagueAvg : 398_000;

      const leagueInfo =
        targetLeague && leagueAvgEuro > 0
          ? {
              leagueName: LEAGUE_NAMES[targetLeague] || targetLeague,
              avgEuro: leagueAvgEuro,
              minEuro: Math.round(leagueAvgEuro * 0.5),
              maxEuro: Math.round(leagueAvgEuro * 2),
            }
          : undefined;

      // ═══════════════════════════════════════════════════════════════════
      // Build interpretation — structured, clean, one line per criterion
      // ═══════════════════════════════════════════════════════════════════
      const iLines: string[] = [];

      // Parsed criteria (each as its own line from buildInterpretation)
      const parsedInterp = parsed.interpretation || '';
      if (parsedInterp) {
        // parsedInterp is already newline-separated lines from buildInterpretation
        for (const line of parsedInterp.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !iLines.some(existing => existing.includes(trimmed))) {
            iLines.push(trimmed);
          }
        }
      }

      // Result count
      if (results.length > 0) {
        iLines.push(lang === 'he'
          ? `✅ נמצאו ${results.length} שחקנים תואמים`
          : `✅ Found ${results.length} matching players`);
      } else {
        iLines.push(lang === 'he'
          ? `⚠️ לא נמצאו שחקנים תואמים`
          : `⚠️ No matching players found`);
      }

      // Partial results note
      if (results.length < requestedTotal && results.length > 0 && requestedTotal > 0) {
        if (hasMore) {
          iLines.push(lang === 'he'
            ? `📌 ביקשת ${requestedTotal} — הרחב לחיפוש מלא`
            : `📌 You asked for ${requestedTotal} — expand for full search`);
        }
      }

      // Translation note
      if (translatedQuery) {
        iLines.push(lang === 'he'
          ? `🔄 תרגום: "${translatedQuery.slice(0, 80)}"`
          : `🔄 Translation: "${translatedQuery.slice(0, 80)}"`);
      }

      // Market cap indicator
      if (marketCap != null && marketCap > 0) {
        const capStr = marketCap >= 1_000_000
          ? `€${(marketCap / 1_000_000).toFixed(1)}M`
          : `€${(marketCap / 1_000).toFixed(0)}K`;
        const leagueName = targetLeague ? (LEAGUE_NAMES[targetLeague] || targetLeague) : '';
        iLines.push(lang === 'he'
          ? `💰 סינון שווי שוק: עד ${capStr}${leagueName ? ` (${leagueName})` : ''}`
          : `💰 Value cap: up to ${capStr}${leagueName ? ` (${leagueName})` : ''}`);
      }

      iLines.push(lang === 'he'
        ? `🎛️ מצב גיוון: ${modeLabel}`
        : `🎛️ Diversity mode: ${modeLabel}`);

      // Append free agent fallback note if no free agents were found
      if (freeAgentFallbackNote) {
        iLines.push(freeAgentFallbackNote.trim());
      }

      const interpretation = iLines.join('\n');

      console.log(
        '[AI Scout] rule-based search returned',
        results.length,
        'results for',
        parsed.position || 'any',
        targetLeague ? `(league ${targetLeague})` : ''
      );

      return NextResponse.json(
        {
          results,
          interpretation,
          query,
          leagueInfo,
          hasMore,
          requestedTotal,
          searchMethod: 'rule-based',
          diversityDebug: {
            mode: modeLabel,
            preFilterPoolSize,
            postSelectionCount: results.length,
            fetchLimit,
            scoutLimit,
            seenKeysInput: seenKeys.length,
            persistentScopeEnabled: !!persistentScope,
          },
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Pragma: 'no-cache',
          },
        }
      );
    } catch (parseErr) {
      const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error('AI Scout failed:', errMsg, parseErr);
      const isTimeout = /timeout|aborted/i.test(errMsg);
      const hint = isTimeout
        ? (lang === 'he'
            ? ' נסה שוב (השרת מתעורר) או השתמש במצב דמו.'
            : ' Try again (server waking up) or use demo mode.')
        : '';
      return NextResponse.json(
        {
          error: (lang === 'he' ? `שגיאה: ${errMsg}` : `Error: ${errMsg}`) + hint,
          results: [],
        },
        { status: 502 }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI Scout search failed';
    console.error('AI Scout search error:', msg, err);
    return NextResponse.json(
      { error: msg, results: [] },
      { status: 500 }
    );
  }
}

/** Merge notes from Hebrew parse and English parse, de-duplicating */
function _mergeNotes(heNotes?: string, enNotes?: string): string | undefined {
  if (!heNotes && !enNotes) return undefined;
  if (!heNotes) return enNotes;
  if (!enNotes) return heNotes;
  // Combine and deduplicate
  const heParts = heNotes.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const enParts = enNotes.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of [...heParts, ...enParts]) {
    if (!seen.has(part)) {
      seen.add(part);
      merged.push(part);
    }
  }
  return merged.join(', ') || undefined;
}

/** Call football scout server recruitment API with parsed params */
async function fetchScoutRecruitment(
  parsed: {
    position?: string;
    ageMin?: number;
    ageMax?: number;
    foot?: string;
    nationality?: string;
    notes?: string;
    transferFee?: string;
    valueMin?: number;
    valueMax?: number;
    salaryRange?: string;
    limit?: number;
    excludeUrls?: string[];
  },
  lang: string
): Promise<{ results?: Record<string, unknown>[] }> {
  const params = new URLSearchParams();
  if (parsed.position) params.set('position', parsed.position);
  if (parsed.ageMin != null) params.set('age_min', String(parsed.ageMin));
  if (parsed.ageMax != null) params.set('age_max', String(parsed.ageMax));
  if (parsed.foot?.trim()) params.set('foot', parsed.foot.trim());
  if (parsed.nationality?.trim()) params.set('nationality', parsed.nationality.trim());
  if (parsed.notes?.trim()) params.set('notes', parsed.notes.trim());
  if (parsed.transferFee?.trim()) params.set('transfer_fee', parsed.transferFee.trim());
  if (parsed.valueMin != null) params.set('value_min', String(parsed.valueMin));
  if (parsed.valueMax != null) params.set('value_max', String(parsed.valueMax));
  if (parsed.salaryRange?.trim()) params.set('salary_range', parsed.salaryRange.trim());
  if (parsed.excludeUrls?.length) params.set('exclude_urls', parsed.excludeUrls.join(','));
  params.set('lang', lang);
  params.set('sort_by', 'score');
  params.set('limit', String(parsed.limit ?? 15));
  params.set('_t', String(Date.now()));

  const url = `${getScoutBaseUrl()}/recruitment?${params.toString()}`;
  console.log('[AI Scout] Fetching:', url);

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(180000), // 3 min - Render cold start can take 60-90s
  });

  const data = (await res.json().catch((e) => {
    console.error('[AI Scout] Scout server JSON parse failed:', e);
    return {};
  })) as {
    results?: Record<string, unknown>[];
    error?: string;
  };

  if (!res.ok) {
    const msg = data?.error || `Scout server: ${res.status}`;
    console.error('[AI Scout] Scout server error:', res.status, msg);
    throw new Error(msg);
  }

  const count = data?.results?.length ?? 0;
  console.log('[AI Scout] Scout server OK:', count, 'results');
  return data;
}
