import { NextRequest, NextResponse } from 'next/server';
import {
  searchPlayersAdvanced,
  buildSearchBody,
  TM_SEARCH_POSITION_IDS,
  TM_SEARCH_CONFEDERATION_IDS,
  TM_SEARCH_FOOT_IDS,
  type TmSearchFilters,
  type TmSearchResult,
} from '@/lib/tmAdvancedSearch';
import { createHash } from 'crypto';
import { getCached, setCache } from '@/lib/scrapingCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function intParam(sp: URLSearchParams, name: string): number | undefined {
  const raw = sp.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/**
 * GET /api/transfermarkt/advanced-search
 * Query: position, minAge, maxAge, minValue, maxValue, confederation, countryId,
 *        foot (left|right|both), contractYear, freeAgents=1, excludeLoans=1, page
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const position = (sp.get('position') || '').trim().toUpperCase();
    if (position && !(position in TM_SEARCH_POSITION_IDS)) {
      return NextResponse.json({ error: `Unknown position "${position}"` }, { status: 400 });
    }
    const confederation = (sp.get('confederation') || '').trim().toUpperCase();
    if (confederation && !(confederation in TM_SEARCH_CONFEDERATION_IDS)) {
      return NextResponse.json({ error: `Unknown confederation "${confederation}"` }, { status: 400 });
    }
    const foot = (sp.get('foot') || '').trim().toLowerCase();
    if (foot && !(foot in TM_SEARCH_FOOT_IDS)) {
      return NextResponse.json({ error: `Unknown foot "${foot}"` }, { status: 400 });
    }

    const filters: TmSearchFilters = {
      position: position || undefined,
      minAge: intParam(sp, 'minAge'),
      maxAge: intParam(sp, 'maxAge'),
      minValue: intParam(sp, 'minValue'),
      maxValue: intParam(sp, 'maxValue'),
      confederation: confederation || undefined,
      countryId: intParam(sp, 'countryId'),
      foot: (foot || undefined) as TmSearchFilters['foot'],
      contractYear: intParam(sp, 'contractYear'),
      freeAgentsOnly: sp.get('freeAgents') === '1',
      excludeLoans: sp.get('excludeLoans') === '1',
      page: intParam(sp, 'page'),
    };

    const refresh = sp.get('refresh') === 'true';
    // Hash the FULL filter string. (sanitizeKey truncates to 120 chars, which cut off
    // value/position/foot filters and made different searches share one cache entry.)
    const cacheKey = `tm-adv-${createHash('sha1').update(`${buildSearchBody(filters)}|p${filters.page ?? 1}`).digest('hex')}`;
    if (!refresh) {
      const cached = await getCached<TmSearchResult>(cacheKey, CACHE_TTL);
      if (cached) {
        return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=300' } });
      }
    }

    const result = await searchPlayersAdvanced(filters);
    // Don't cache an empty page that may be a blocked / malformed response.
    if (result.players.length > 0) await setCache(cacheKey, result);
    return NextResponse.json(result, { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=300' } });
  } catch (err) {
    console.error('TM advanced search error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Transfermarkt search failed' },
      { status: 502 }
    );
  }
}
