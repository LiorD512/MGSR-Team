/**
 * GET /api/playmakerstats/player
 * Scrapes PlaymakerStats for a player by URL or by name search.
 * Returns career stats, match ratings, transfers, market value history.
 *
 * Query params:
 *  - url: Direct PlaymakerStats player URL
 *  - name: Player name to search (used if url not provided)
 *  - age: Optional age for matching
 *  - club: Optional club for matching
 */
import { NextRequest, NextResponse } from 'next/server';
import { scrapePlayer, scrapeResults, scrapeMarketValueHistory, searchPlayer, type PmPlayerData } from '@/lib/playmakerstats';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const pmUrl = searchParams.get('url');
    const name = searchParams.get('name');
    const ageParam = searchParams.get('age');
    const clubParam = searchParams.get('club');

    if (!pmUrl && !name) {
      return NextResponse.json({ found: false, message: 'Provide url or name param' }, { status: 400 });
    }

    let targetUrl = pmUrl || '';

    // If no direct URL, search by name
    if (!targetUrl && name) {
      const results = await searchPlayer(name);
      if (results.length === 0) {
        return NextResponse.json({ found: false, message: `No PlaymakerStats results for "${name}"` });
      }

      // Try to pick best match by name similarity, age, club
      let best = results[0];
      let bestScore = 0;
      const searchNorm = normalize(name);

      for (const r of results.slice(0, 5)) {
        const nameNorm = normalize(r.name);
        let score = 0;
        // Name similarity
        if (nameNorm === searchNorm) score += 100;
        else if (nameNorm.includes(searchNorm) || searchNorm.includes(nameNorm)) score += 70;
        else {
          const words = searchNorm.split(/\s+/);
          const matches = words.filter((w) => nameNorm.includes(w)).length;
          score += (matches / words.length) * 60;
        }
        if (score > bestScore) {
          bestScore = score;
          best = r;
        }
      }

      targetUrl = best.url;
    }

    // Scrape the player page
    const result = await scrapePlayer(targetUrl);
    if (!result.found) {
      return NextResponse.json(result);
    }

    const data = result as PmPlayerData;

    // Fetch the /results sub-page for full match ratings (main page only has ~5)
    const fullResults = await scrapeResults(data.pmUrl);
    if (fullResults.length > data.matchRatings.length) {
      data.matchRatings = fullResults;
      const rated = fullResults.filter((m) => m.rating !== null);
      data.averageRating = rated.length > 0
        ? Math.round((rated.reduce((s, m) => s + m.rating!, 0) / rated.length) * 10) / 10
        : null;
      data.ratingCount = rated.length;
    }

    // Fix totals: if games_totals_hp was empty but results page has matches
    if (data.careerTotals.games === 0 && data.matchRatings.length > 0) {
      data.careerTotals.games = data.matchRatings.length;
    }

    // If market value history is sparse, try the dedicated MV sub-page
    if (data.marketValueHistory.length === 0) {
      const mvHistory = await scrapeMarketValueHistory(data.pmUrl);
      if (mvHistory.length > 0) {
        data.marketValueHistory = mvHistory;
      }
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (err) {
    console.error('[PlaymakerStats API] Error:', err);
    return NextResponse.json(
      { found: false, message: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
