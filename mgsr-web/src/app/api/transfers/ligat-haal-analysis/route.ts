import { handleLigatHaalAnalysis, LigatHaalAnalysisResult } from '@/lib/transfermarkt';
import * as admin from 'firebase-admin';

/**
 * GET /api/transfers/ligat-haal-analysis
 * Analyzes foreign player arrivals to Ligat Ha'al in a specific transfer window.
 *
 * Query params:
 * - window: 'SUMMER_2025' or 'WINTER_2025_2026' (default: SUMMER_2025)
 * - useCache: 'true' or 'false' (default: true)
 *
 * Returns: LigatHaalAnalysisResult with player list and aggregated stats
 */

const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

async function getCachedAnalysis(window: string): Promise<LigatHaalAnalysisResult | null> {
  try {
    const db = admin.firestore();
    const docId = `ligat-haal-${window}`;
    console.log(`[Ligat Ha'al Cache] Checking cache for doc: ${docId}`);
    
    const doc = await db.collection('TransferAnalysis').doc(docId).get();
    if (!doc.exists) {
      console.log(`[Ligat Ha'al Cache] No cached doc found for ${docId}`);
      return null;
    }

    const data = doc.data();
    if (!data) {
      console.log(`[Ligat Ha'al Cache] Doc exists but empty for ${docId}`);
      return null;
    }

    const cachedAt = new Date(data.cachedAt || 0).getTime();
    const now = Date.now();
    const ageMs = now - cachedAt;
    
    if (ageMs > CACHE_TTL_MS) {
      console.log(`[Ligat Ha'al Cache] Cache expired for ${docId} (${Math.round(ageMs / 1000 / 60)}m old)`);
      return null;
    }

    console.log(`[Ligat Ha'al Cache] Valid cache found for ${docId} (${Math.round(ageMs / 1000)}s old)`);
    return data as LigatHaalAnalysisResult;
  } catch (e) {
    console.error('[Ligat Ha\'al Cache] Error reading cache:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function setCachedAnalysis(window: string, result: LigatHaalAnalysisResult): Promise<void> {
  try {
    const db = admin.firestore();
    await db.collection('TransferAnalysis').doc(`ligat-haal-${window}`).set(result, { merge: true });
  } catch (e) {
    // Non-critical - just log and continue
    console.warn('[Ligat Ha\'al Cache] Failed to write cache:', e instanceof Error ? e.message : String(e));
  }
}

export async function GET(request: Request): Promise<Response> {
  const startTime = Date.now();
  try {
    const url = new URL(request.url);
    const window = (url.searchParams.get('window') || 'SUMMER_2025') as 'SUMMER_2025' | 'WINTER_2025_2026';
    const useCache = url.searchParams.get('useCache') !== 'false';

    console.log(`[Ligat Ha'al Analysis] REQUEST: window=${window}, useCache=${useCache}`);

    // Validate window param
    if (window !== 'SUMMER_2025' && window !== 'WINTER_2025_2026') {
      console.warn(`[Ligat Ha'al Analysis] Invalid window param: ${window}`);
      return new Response(
        JSON.stringify({ error: 'Invalid window. Must be SUMMER_2025 or WINTER_2025_2026' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Try cache first
    if (useCache) {
      console.log(`[Ligat Ha'al Analysis] Attempting cache lookup...`);
      const cached = await getCachedAnalysis(window);
      if (cached) {
        const duration = Date.now() - startTime;
        console.log(`[Ligat Ha'al Analysis] SUCCESS (cache hit) - ${cached.players?.length || 0} players in ${duration}ms`);
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
            'X-Duration-Ms': duration.toString(),
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        });
      }
    }

    console.log(`[Ligat Ha'al Analysis] Starting fresh analysis for ${window}...`);
    const analysisStart = Date.now();

    const result: LigatHaalAnalysisResult = await handleLigatHaalAnalysis(window);
    
    const analysisDuration = Date.now() - analysisStart;
    console.log(`[Ligat Ha'al Analysis] Analysis complete: ${result.players?.length || 0} arrivals, €${result.stats?.totalMarketValue || 0} total value in ${analysisDuration}ms`);

    // Try to cache the result
    console.log(`[Ligat Ha'al Analysis] Caching result...`);
    await setCachedAnalysis(window, result);

    const totalDuration = Date.now() - startTime;
    console.log(`[Ligat Ha'al Analysis] SUCCESS (cache miss) - returning ${result.players?.length || 0} players in ${totalDuration}ms`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'MISS',
        'X-Duration-Ms': totalDuration.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    
    console.error(`[Ligat Ha'al Analysis] FATAL ERROR after ${duration}ms:`, message);
    console.error(`[Ligat Ha'al Analysis] Stack trace:`, stack);

    return new Response(
      JSON.stringify({
        error: 'Failed to analyze Ligat Ha\'al transfers',
        details: message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
