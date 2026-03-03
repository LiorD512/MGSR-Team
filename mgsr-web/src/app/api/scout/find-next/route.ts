/**
 * "Find Me The Next..." — Elite Scout AI Talent Discovery.
 *
 * Enhanced pipeline:
 * 1. Proxy to Python scout server /find_next for signature-based matching
 * 2. Gemini AI post-processing: generates scout narrative for TOP results
 *    explaining WHY each player is "the next [reference player]"
 * 3. Returns enriched results with scout_narrative field
 */
import { NextRequest, NextResponse } from 'next/server';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';
import { SCOUT_PERSONA, FIND_NEXT_PERSONA_EXT, buildStatsContext, buildFmContext } from '@/lib/scoutPersona';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface FindNextResult {
  name: string;
  position: string;
  age: string;
  market_value: string;
  url: string;
  league: string;
  club?: string;
  find_next_score: number;
  signature_match: number;
  explanation: string;
  scout_narrative?: string;
  [key: string]: unknown;
}

/**
 * Generate scout narratives for the top Find Next results using Gemini.
 * Non-blocking: if Gemini fails, original results are returned unchanged.
 * When lang is 'he' or 'iw', narratives are generated in Hebrew.
 */
async function enrichWithScoutNarrative(
  results: FindNextResult[],
  referenceName: string,
  apiKey: string,
  lang: string,
): Promise<FindNextResult[]> {
  if (results.length === 0) return results;

  const isHebrew = lang === 'he' || lang === 'iw';
  const langInstruction = isHebrew
    ? '\n\nCRITICAL — OUTPUT LANGUAGE: You MUST write every scout_narrative in HEBREW (עברית). The user\'s app is set to Hebrew. Write like an Israeli scout would speak: natural, direct, with football terminology in Hebrew. Do NOT write in English.'
    : '';

  const top = results.slice(0, 15); // Narrate all results (up to 15) for consistent language
  const playerSummaries = top.map((p, i) => {
    const stats = buildStatsContext(p);
    const fm = buildFmContext(p);
    return `${i + 1}. ${p.name} (${p.age}, ${p.position}, ${p.club || '?'}, ${p.league || '?'})
   Value: ${p.market_value} | Score: ${p.find_next_score} | Signature match: ${p.signature_match}%
   Server explanation: ${p.explanation || 'none'}
   ${stats ? `Stats: ${stats}` : ''}${fm ? ` | FM: ${fm}` : ''}`;
  }).join('\n');

  const prompt = `Reference player: ${referenceName}

These players were identified as potential "next ${referenceName}" candidates by the scout database.
For each of the ${top.length} players, write a 1-2 sentence scout narrative explaining:
- WHY they remind you of ${referenceName} (playing characteristics, physical profile, stats pattern)
- What makes them an exciting prospect or a realistic target
- Any red flags or caveats a scout should know
${langInstruction}

Players:
${playerSummaries}

Return a JSON array of objects: [{"name": "...", "scout_narrative": "..."}]
Return ONLY valid JSON, no markdown code blocks.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const systemInstruction = SCOUT_PERSONA + '\n' + FIND_NEXT_PERSONA_EXT +
      (isHebrew ? '\n\nOUTPUT LANGUAGE: Always respond in Hebrew (עברית). The user\'s interface is in Hebrew.' : '');
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction,
    });
    const result = await model.generateContent(prompt);
    const text = result.response?.text?.() || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return results;
    const narratives: { name: string; scout_narrative: string }[] = JSON.parse(jsonMatch[0]);
    const narrativeMap = new Map(narratives.map((n) => [n.name.toLowerCase().trim(), n.scout_narrative]));

    return results.map((p) => {
      const narrative = narrativeMap.get(p.name.toLowerCase().trim());
      return narrative ? { ...p, scout_narrative: narrative } : p;
    });
  } catch (err) {
    console.warn('[Find Next] Gemini narrative enrichment failed (non-fatal):', err instanceof Error ? err.message : err);
    return results;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const url = `${getScoutBaseUrl()}/find_next?${searchParams.toString()}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(120000), // 2 min
    });
    const data = (await res.json().catch(() => ({}))) as {
      reference_player?: { name?: string };
      results?: FindNextResult[];
      error?: string;
      [key: string]: unknown;
    };
    if (!res.ok) {
      const msg = data.error || `Scout server returned ${res.status}`;
      return NextResponse.json({ error: msg, results: [] }, { status: 502 });
    }

    // Gemini enrichment: add scout narratives for top results
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const referenceName = data.reference_player?.name || searchParams.get('player_name') || '';
    const lang = searchParams.get('lang') || 'en';
    if (geminiApiKey && data.results && data.results.length > 0 && referenceName) {
      console.log(`[Find Next] Enriching ${data.results.length} results with scout narratives for "${referenceName}" (lang=${lang})`);
      data.results = await enrichWithScoutNarrative(data.results, referenceName, geminiApiKey, lang);
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Find Next API failed';
    console.error('Find Next proxy error:', msg, err);
    return NextResponse.json({ error: msg, results: [] }, { status: 502 });
  }
}
