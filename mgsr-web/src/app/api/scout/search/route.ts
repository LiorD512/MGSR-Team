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
import { getLeagueAvgMarketValue } from '@/lib/transfermarkt';
import { translateHebrewToEnglish } from '@/lib/translateQuery';
import { parseScoutQueryWithGemini } from '@/lib/aiQueryParser';
import { SCOUT_PERSONA, SEARCH_PERSONA_EXT } from '@/lib/scoutPersona';

export const dynamic = 'force-dynamic';
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
  if (/(שוק\s*ה?ישראלי|israeli market|israel market|ליגה\s*ה?ישראלית|ligat\s*ha.?al)/i.test(q)) return 'ISR1';
  if (/(שוק\s*פולני|polish market|poland market)/i.test(q)) return 'PL1';
  if (/(שוק\s*יווני|greek market|greece market)/i.test(q)) return 'GR1';
  if (/(שוק\s*בלגי|belgian market|belgium market)/i.test(q)) return 'BE1';
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
        limit: parsedHebrew?.limit ?? parsedMain.limit,
        minGoals: parsedHebrew?.minGoals ?? parsedMain.minGoals,
        transferFee: parsedHebrew?.transferFee || parsedMain.transferFee,
        valueMin: parsedHebrew?.valueMin ?? parsedMain.valueMin,
        valueMax: parsedHebrew?.valueMax ?? parsedMain.valueMax,
        notes: _mergeNotes(parsedHebrew?.notes, parsedMain.notes),
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
      const marketCap = targetLeague ? MARKET_VALUE_CAPS[targetLeague] : undefined;

      // Force value_max if market detected and user didn't set their own
      if (marketCap && parsed.valueMax == null) {
        parsed.valueMax = marketCap;
        console.log(`[AI Scout] Market cap applied: ${targetLeague} → value_max €${marketCap.toLocaleString()}`);
      }

      // Progressive loading settings
      const requestedTotal = parsed.limit ?? 15;
      const fetchLimit = initial ? Math.min(5, requestedTotal) : requestedTotal;
      const hasMore = initial && requestedTotal > 5;
      const minGoals = parsed.minGoals;
      // If we have market cap or minGoals, fetch extra to have enough after filtering
      const needsOverfetch = minGoals != null || marketCap != null;
      const scoutLimit = needsOverfetch ? Math.min(30, Math.max(fetchLimit * 3, 15)) : fetchLimit;
      const leagueAvgPromise = targetLeague
        ? getLeagueAvgMarketValue(targetLeague, 2025).catch(() => null)
        : Promise.resolve(null);

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2: Parallel — Scout server fetch + Gemini AI parse (enrichment)
      // ═══════════════════════════════════════════════════════════════════
      const geminiApiKey = process.env.GEMINI_API_KEY;
      const isComplexQuery = _isComplexQuery(query);

      // Fire scout server request immediately with rule-based params
      const scoutPromise = fetchScoutRecruitment({ ...parsed, limit: scoutLimit, excludeUrls }, lang);

      // In parallel: Gemini AI parse for complex queries (enriches notes & catches nuances)
      let geminiEnrichment: {
        notes?: string;
        interpretation?: string;
        position?: string;
        ageMax?: number;
        transferFee?: string;
      } | null = null;

      const geminiPromise = (geminiApiKey && isComplexQuery && !initial)
        ? parseScoutQueryWithGemini(query, lang, geminiApiKey)
            .then((aiParsed) => {
              console.log('[AI Scout] Step 2: Gemini parse completed:', aiParsed.interpretation?.slice(0, 60));
              return aiParsed;
            })
            .catch((err) => {
              console.warn('[AI Scout] Gemini parse failed (non-fatal):', err instanceof Error ? err.message : err);
              return null;
            })
        : Promise.resolve(null);

      // Wait for both to complete
      const [scoutResponse, geminiResult, leagueAvg] = await Promise.all([
        scoutPromise,
        geminiPromise,
        leagueAvgPromise,
      ]);

      geminiEnrichment = geminiResult;

      // ═══════════════════════════════════════════════════════════════════
      // STEP 3: Merge results — if Gemini enriched notes, do a second
      //         scout fetch with richer query (only if notes differ significantly)
      // ═══════════════════════════════════════════════════════════════════
      let results = scoutResponse.results ?? [];
      let enrichedScoutResults: Record<string, unknown>[] | null = null;

      if (geminiEnrichment?.notes && geminiEnrichment.notes !== parsed.notes) {
        // Gemini caught nuances the regex missed — do a refined search
        const enrichedNotes = _mergeNotes(parsed.notes, geminiEnrichment.notes);
        const enrichedPosition = geminiEnrichment.position || parsed.position;
        const enrichedAgeMax = geminiEnrichment.ageMax ?? parsed.ageMax;
        const enrichedTransferFee = geminiEnrichment.transferFee || parsed.transferFee;

        // Only fetch if the enrichment actually changes the query
        const notesChanged = enrichedNotes !== parsed.notes;
        const posChanged = enrichedPosition !== parsed.position;
        if (notesChanged || posChanged) {
          console.log('[AI Scout] Step 3: Enriched search with Gemini notes:', enrichedNotes?.slice(0, 60));
          try {
            const enrichedResponse = await fetchScoutRecruitment(
              {
                ...parsed,
                notes: enrichedNotes,
                position: enrichedPosition,
                ageMax: enrichedAgeMax,
                transferFee: enrichedTransferFee,
                limit: scoutLimit,
                excludeUrls,
              },
              lang
            );
            enrichedScoutResults = enrichedResponse.results ?? [];
          } catch (err) {
            console.warn('[AI Scout] Enriched fetch failed (non-fatal):', err);
          }
        }
      }

      // Merge: deduplicate by URL, boost players found in BOTH searches
      if (enrichedScoutResults && enrichedScoutResults.length > 0) {
        const urlSet = new Set<string>();
        const merged: Record<string, unknown>[] = [];
        const enrichedUrlSet = new Set(enrichedScoutResults.map((p) => (p.url as string || '').trim().toLowerCase()));

        // Add all primary results, marking those also found by enriched search
        for (const p of results) {
          const url = (p.url as string || '').trim().toLowerCase();
          if (urlSet.has(url)) continue;
          urlSet.add(url);
          // Boost: if found in both, increase smart_score by 10%
          if (enrichedUrlSet.has(url)) {
            const score = Number(p.smart_score || p.scouting_score || 0);
            if (score > 0) p.smart_score = Math.min(100, Math.round(score * 1.1));
          }
          merged.push(p);
        }

        // Add enriched-only results (new discoveries) at the end
        for (const p of enrichedScoutResults) {
          const url = (p.url as string || '').trim().toLowerCase();
          if (urlSet.has(url)) continue;
          urlSet.add(url);
          merged.push(p);
        }

        results = merged;
        console.log('[AI Scout] Merged results:', results.length, '(primary + enriched)');
      }

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
          const goals = p.fbref_goals;
          if (goals == null) return false;
          const n = typeof goals === 'string' ? parseInt(goals, 10) : Number(goals);
          return !isNaN(n) && n >= minGoals;
        });
        console.log('[AI Scout] Filtered by min_goals:', minGoals, '→', results.length, 'results');
      }

      results = results.slice(0, fetchLimit);

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
      // Build interpretation — rich, insightful, scout-like
      // ═══════════════════════════════════════════════════════════════════
      let interpretation = '';

      // Use Gemini interpretation if available (richer understanding)
      if (geminiEnrichment?.interpretation) {
        interpretation = geminiEnrichment.interpretation;
      } else {
        interpretation = parsed.interpretation || '';
      }

      // Add search metadata
      if (!interpretation) {
        interpretation = lang === 'he'
          ? `מצאתי ${results.length} שחקנים תואמים מתוך מאגר של 17,000+ שחקנים.`
          : `Found ${results.length} matching players from a database of 17,000+ players.`;
      }

      if (translatedQuery) {
        interpretation += lang === 'he'
          ? `\n🔄 תרגום: "${translatedQuery.slice(0, 100)}"`
          : '';
      }

      if (results.length < requestedTotal && requestedTotal > 0) {
        interpretation += lang === 'he'
          ? ` (ביקשת ${requestedTotal}, נמצאו ${results.length} תואמים${hasMore ? ' – הרחב לחיפוש מלא' : ''})`
          : ` (you asked for ${requestedTotal}, found ${results.length} matching${hasMore ? ' – expand for full search' : ''})`;
      }

      if (results.length === 0) {
        interpretation += lang === 'he'
          ? ' חיפוש בוצע במאגר השחקנים.'
          : ' Search was performed in the player database.';
      }

      // Market cap indicator — let the user know we filtered for realism
      if (marketCap != null && marketCap > 0) {
        const capStr = marketCap >= 1_000_000
          ? `€${(marketCap / 1_000_000).toFixed(1)}M`
          : `€${(marketCap / 1_000).toFixed(0)}K`;
        const leagueName = targetLeague ? (LEAGUE_NAMES[targetLeague] || targetLeague) : '';
        interpretation += lang === 'he'
          ? `\n💰 סינון ריאלי ל${leagueName ? leagueName : 'שוק יעד'} — שווי שוק עד ${capStr}`
          : `\n💰 Realistic filter for ${leagueName || 'target market'} — value up to ${capStr}`;
      }

      // Add search method indicator
      const searchMethod = geminiEnrichment ? 'hybrid' : 'rule-based';
      console.log(
        `[AI Scout] ${searchMethod} search returned`,
        results.length,
        'results for',
        parsed.position || 'any',
        targetLeague ? `(league ${targetLeague})` : '',
        geminiEnrichment ? '(Gemini-enriched)' : ''
      );

      return NextResponse.json(
        {
          results,
          interpretation,
          query,
          leagueInfo,
          hasMore,
          requestedTotal,
          searchMethod,
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

/**
 * Detect if a query is "complex" enough to benefit from Gemini AI parsing.
 * Simple queries like "CF under 23" don't need AI — regex handles them fine.
 * Complex queries have playing style descriptors, comparisons, or nuanced requirements.
 */
function _isComplexQuery(query: string): boolean {
  const q = query.toLowerCase();
  // Style descriptors
  if (/target\s*man|playmaker|box[\s-]to[\s-]box|deep[\s-]lying|false\s*9|inverted/i.test(q)) return true;
  if (/דמוי|כמו|סגנון|טרגט|פלייסמייקר|בוקס|עמוק/i.test(q)) return true;
  // Player comparisons ("like Drogba", "next Messi")
  if (/like\s+\w+|כמו\s+\w+|next\s+\w+|הבא\s+של|דומה\s+ל/i.test(q)) return true;
  // Tactical context
  if (/counter[\s-]attack|press|possession|4[\s-]?[23][\s-]?[123]|3[\s-]?[45][\s-]?[123]/i.test(q)) return true;
  if (/הגנתי|התקפי|לחץ|החזקה|קונטרה|מערך/i.test(q)) return true;
  // Multiple style attributes (more than regex can handle well)
  const styleWords = q.match(/(fast|pace|quick|strong|physical|aerial|creative|technical|dribbl|pass|shoot|מהיר|חזק|טכני|אווירי|יצירתי|דריבל)/gi) || [];
  if (styleWords.length >= 3) return true;
  // Long complex query
  if (q.split(/\s+/).length >= 10) return true;
  return false;
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
