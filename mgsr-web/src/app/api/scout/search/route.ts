/**
 * AI Scout free-text search API.
 * Rule-based parsing (no Gemini) → Scout server search over 17k players.
 * Features: cache (5 min), progressive loading (5 first, then more).
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseFreeQuery } from '@/lib/parseFreeQuery';
import { getLeagueAvgMarketValue } from '@/lib/transfermarkt';
import { translateHebrewToEnglish } from '@/lib/translateQuery';

export const dynamic = 'force-dynamic';

const SCOUT_BASE = process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';
const FREESEARCH_URL = process.env.SCOUT_FREESEARCH_URL; // When set: use freesearch proxy (Python parse)

const LEAGUE_NAMES: Record<string, string> = {
  ISR1: "Ligat ha'Al",
  PL1: 'Ekstraklasa',
  GR1: 'Super League 1',
  BE1: 'Jupiler Pro League',
  NL1: 'Eredivisie',
  PO1: 'Liga Portugal',
};

/** Call freesearch proxy (Python) - returns full response or null on failure */
async function fetchFreesearch(
  query: string,
  lang: 'en' | 'he',
  initial: boolean
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
    const results = data.results ?? [];
    const targetLeague = getTargetLeagueCode(query);
    const leagueAvg = targetLeague
      ? await getLeagueAvgMarketValue(targetLeague, 2025).catch(() => null)
      : null;
    const leagueAvgEuro = targetLeague && leagueAvg != null && leagueAvg > 0 ? leagueAvg : 398_000;
    let interpretation =
      parsed.interpretation ||
      (lang === 'he'
        ? `מצאתי ${results.length} שחקנים מתוך מאגר (freesearch).`
        : `Found ${results.length} players (freesearch).`);
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
    });
  } catch (err) {
    console.error('[AI Scout] Freesearch error:', err);
    return null;
  }
}

/** Map query to league for market filter display */
function getTargetLeagueCode(query: string): string | null {
  const q = query.toLowerCase();
  if (/(שוק\s*ה?ישראלי|israeli market|israel market|ליגה\s*ה?ישראלית)/i.test(q)) return 'ISR1';
  if (/(שוק\s*פולני|polish market|poland market)/i.test(q)) return 'PL1';
  if (/(שוק\s*יווני|greek market|greece market)/i.test(q)) return 'GR1';
  if (/(שוק\s*בלגי|belgian market|belgium market)/i.test(q)) return 'BE1';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    const lang = body?.lang === 'he' ? 'he' : 'en';
    const initial = body?.initial === true; // Progressive: first request gets 5 only
    const demo = body?.demo === true; // Demo mode: return mock data immediately (for local testing)
    const excludeUrls: string[] = Array.isArray(body?.excludeUrls) ? body.excludeUrls.filter((u: unknown) => typeof u === 'string' && u.trim()) : [];

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
          { name: 'Demo Player 1', age: '25', position: 'Attack - Centre-Forward', market_value: '€500k', url: null, fbref_goals: '7' },
          { name: 'Demo Player 2', age: '24', position: 'Attack - Centre-Forward', market_value: '€400k', url: null, fbref_goals: '6' },
          { name: 'Demo Player 3', age: '26', position: 'Attack - Centre-Forward', market_value: '€600k', url: null, fbref_goals: '8' },
        ].filter((p) => !parsed.minGoals || parseInt(p.fbref_goals, 10) >= parsed.minGoals);
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
        const freesearchRes = await fetchFreesearch(query, lang, initial);
        if (freesearchRes) {
          return freesearchRes;
        }
        // Fallback to mgsr-web parse if freesearch fails
        console.log('[AI Scout] Freesearch failed, falling back to local parse');
      }

      // 1. Translate Hebrew → English for better parsing & backend handling
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

      // 2. Rule-based parse: query → structured params
      //    Parse BOTH original Hebrew (for Hebrew-specific patterns) and English translation
      console.log('[AI Scout] Parsing query (rule-based):', queryForParsing.slice(0, 60) + '...');
      const parsedHebrew = lang === 'he' ? parseFreeQuery(query, 'he') : null;
      const parsedEnglish = translatedQuery ? parseFreeQuery(translatedQuery, 'en') : null;
      const parsedMain = translatedQuery ? parseFreeQuery(queryForParsing, 'en') : parseFreeQuery(query, lang);

      // Merge: prefer Hebrew extraction for structured fields (position, age, nationality, foot)
      // since Hebrew patterns are more precise. Use English translation for notes.
      const parsed = {
        ...parsedMain,
        position: parsedHebrew?.position || parsedMain.position,
        ageMin: parsedHebrew?.ageMin ?? parsedMain.ageMin,
        ageMax: parsedHebrew?.ageMax ?? parsedMain.ageMax,
        foot: parsedHebrew?.foot || parsedMain.foot,
        nationality: parsedHebrew?.nationality || parsedMain.nationality,
        limit: parsedHebrew?.limit ?? parsedMain.limit,
        minGoals: parsedHebrew?.minGoals ?? parsedMain.minGoals,
        transferFee: parsedHebrew?.transferFee || parsedMain.transferFee,
        valueMin: parsedHebrew?.valueMin ?? parsedMain.valueMin,
        valueMax: parsedHebrew?.valueMax ?? parsedMain.valueMax,
        // Combine notes from both parses (English translation often has richer keywords)
        notes: _mergeNotes(parsedHebrew?.notes, parsedMain.notes),
        // Keep Hebrew interpretation for Hebrew users
        interpretation: parsedHebrew?.interpretation || parsedMain.interpretation,
      };
      if (translatedQuery) {
        parsed.interpretation = (parsed.interpretation || '') +
          (lang === 'he' ? `\n🔄 תרגום: "${translatedQuery.slice(0, 100)}"` : '');
      }

      // Progressive loading: first request uses limit=5 for faster response
      const requestedTotal = parsed.limit ?? 15;
      const fetchLimit = initial ? Math.min(5, requestedTotal) : requestedTotal;
      const hasMore = initial && requestedTotal > 5;

      // When minGoals: request more from scout (we filter client-side) so we have enough after filtering
      const minGoals = parsed.minGoals;
      const scoutLimit = minGoals != null ? Math.min(25, Math.max(fetchLimit * 3, 15)) : fetchLimit;

      const targetLeague = getTargetLeagueCode(query);
      const leagueAvgPromise = targetLeague
        ? getLeagueAvgMarketValue(targetLeague, 2025).catch(() => null)
        : Promise.resolve(null);

      // 2. Always fetch fresh from scout server (no cache) — backend randomizes
      //    results on every request for variety across searches.
      let scoutResponse: { results?: Record<string, unknown>[] };
      let leagueAvg: number | null = null;
      [scoutResponse, leagueAvg] = await Promise.all([
        fetchScoutRecruitment({ ...parsed, limit: scoutLimit, excludeUrls }, lang),
        leagueAvgPromise,
      ]);
      let results = scoutResponse.results ?? [];

      // Filter by min_goals (scout server doesn't support it - we filter client-side)
      if (minGoals != null && minGoals > 0) {
        results = results.filter((p) => {
          const goals = p.fbref_goals;
          if (goals == null) return false; // no FBref data = exclude when goals required
          const n = typeof goals === 'string' ? parseInt(goals, 10) : Number(goals);
          return !isNaN(n) && n >= minGoals;
        });
        console.log('[AI Scout] Filtered by min_goals:', minGoals, '→', results.length, 'results');
        results = results.slice(0, fetchLimit); // trim to requested count
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

      const requestedCount = fetchLimit;
      let interpretation =
        parsed.interpretation ||
        (lang === 'he'
          ? `מצאתי ${results.length} שחקנים תואמים מתוך מאגר השחקנים.`
          : `Found ${results.length} matching players from the player database.`);
      if (results.length < requestedTotal && requestedTotal > 0) {
        interpretation +=
          lang === 'he'
            ? ` (ביקשת ${requestedTotal}, נמצאו ${results.length} תואמים${hasMore ? ' – הרחב לחיפוש מלא' : ''})`
            : ` (you asked for ${requestedTotal}, found ${results.length} matching${hasMore ? ' – expand for full search' : ''})`;
      }
      if (results.length === 0) {
        interpretation +=
          lang === 'he'
            ? ' חיפוש בוצע במאגר השחקנים.'
            : ' Search was performed in the player database.';
      }

      console.log(
        '[AI Scout] Scout server returned',
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

  const url = `${SCOUT_BASE}/recruitment?${params.toString()}`;
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
