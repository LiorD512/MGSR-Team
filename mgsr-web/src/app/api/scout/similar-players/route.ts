/**
 * Similar Players — Elite Scout AI Analysis.
 *
 * Enhanced pipeline:
 * 1. Proxy to Python scout server /similar_players for statistical similarity matching
 * 2. Gemini AI post-processing: generates structured "why similar" analysis
 *    with playing style comparison, scouting value, and red flags
 * 3. Returns enriched results with scout_analysis field
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';
import { SCOUT_PERSONA, buildStatsContext, buildFmContext } from '@/lib/scoutPersona';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Enrich similar player results with Gemini scout analysis.
 * Adds structured "why similar" explanation for the top results.
 */
async function enrichSimilarPlayers(
  results: Record<string, unknown>[],
  playerName: string,
  playerPosition: string,
  apiKey: string,
): Promise<Record<string, unknown>[]> {
  if (results.length === 0) return results;

  const top = results.slice(0, 6);
  const summaries = top.map((p, i) => {
    const stats = buildStatsContext(p);
    const fm = buildFmContext(p);
    return `${i + 1}. ${p.name} (${p.age}, ${p.position}, ${p.club || p.fbref_team || '?'})
   Value: ${p.market_value} | Similarity: ${p.similarity_score || p.matchPercent || '?'}
   Existing reason: ${p.similarity_reason || p.similarityReason || 'none'}
   ${stats ? `Stats: ${stats}` : ''}${fm ? ` | FM: ${fm}` : ''}`;
  }).join('\n');

  const prompt = `Reference: ${playerName} (${playerPosition})

These players are statistically similar. For each, write a concise scout analysis:
- What makes them SIMILAR to ${playerName} (profile, stats pattern, role)
- Their UNIQUE selling point (what they offer that ${playerName} doesn't)
- One CONCERN or limitation to watch
- Rate the comparison quality: "Strong", "Moderate", or "Loose"

Players:
${summaries}

Return JSON array: [{"name":"...","scout_analysis":"...","comparison_quality":"Strong|Moderate|Loose","unique_trait":"..."}]
ONLY valid JSON, no markdown code blocks.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SCOUT_PERSONA + '\nYou are analyzing player similarity comparisons. Be honest — if a comparison is loose, say so.',
    });
    const result = await model.generateContent(prompt);
    const text = result.response?.text?.() || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return results;

    const analyses: { name: string; scout_analysis: string; comparison_quality?: string; unique_trait?: string }[] = JSON.parse(jsonMatch[0]);
    const analysisMap = new Map(analyses.map((a) => [a.name.toLowerCase().trim(), a]));

    return results.map((p) => {
      const analysis = analysisMap.get(((p.name as string) || '').toLowerCase().trim());
      if (!analysis) return p;
      return {
        ...p,
        scoutAnalysis: analysis.scout_analysis,
        comparisonQuality: analysis.comparison_quality,
        uniqueTrait: analysis.unique_trait,
      };
    });
  } catch (err) {
    console.warn('[Similar Players] Gemini enrichment failed (non-fatal):', err instanceof Error ? err.message : err);
    return results;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const url = `${getScoutBaseUrl()}/similar_players?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(120000), // 2 min — similarity search can be slow on cold start
    });
    const data = (await res.json().catch(() => ({}))) as {
      results?: Record<string, unknown>[];
      error?: string;
      [key: string]: unknown;
    };
    if (!res.ok) {
      const msg = data.error || `Scout server returned ${res.status}`;
      return NextResponse.json({ error: msg, results: [] }, { status: 502 });
    }

    // Gemini enrichment: scout analysis for similar players
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const playerName = searchParams.get('player_name') || '';
    const playerPosition = searchParams.get('target_position') || '';
    if (geminiApiKey && data.results && data.results.length > 0 && playerName) {
      console.log(`[Similar Players] Enriching ${data.results.length} results with scout analysis for "${playerName}"`);
      data.results = await enrichSimilarPlayers(data.results, playerName, playerPosition, geminiApiKey);
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Similar Players API failed';
    console.error('Similar Players proxy error:', msg, err);
    return NextResponse.json({ error: msg, results: [] }, { status: 502 });
  }
}
