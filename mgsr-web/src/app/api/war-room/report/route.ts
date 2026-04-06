/**
 * POST /api/war-room/report
 * Generates a multi-agent War Room report for a player.
 * Uses 2 Gemini calls (combined agents + synthesis) to stay within free-tier rate limits (5/min).
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { handlePlayer } from '@/lib/transfermarkt';
import { extractPlayerIdFromUrl } from '@/lib/api';

import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

function getSelfBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const u = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return u.startsWith('http') ? u : `https://${u}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

import {
  SCOUT_PERSONA,
  WAR_ROOM_PERSONA_EXT,
  buildStatsContext,
  buildFmContext,
} from '@/lib/scoutPersona';

function samePlayer(url1: string, url2: string): boolean {
  const id1 = extractPlayerIdFromUrl(url1);
  const id2 = extractPlayerIdFromUrl(url2);
  return !!id1 && id1 === id2;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Retry generateContent on 429, waiting the suggested delay. */
async function generateWithRetry(
  model: { generateContent: (p: string) => Promise<{ response: { text: () => string } }> },
  prompt: string,
  maxRetries = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await model.generateContent(prompt);
      return res.response.text()?.trim() || '{}';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests');
      const retryMatch = msg.match(/retry in (\d+(?:\.\d+)?)s/i) || msg.match(/"retryDelay":"(\d+)s"/);
      const delayMs = retryMatch ? Math.ceil(parseFloat(retryMatch[1]) * 1000) : 12000;
      if (is429 && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  return '{}';
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function parseJson(s: string): Record<string, unknown> {
  try {
    const cleaned = s.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { raw: s };
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 500 });
  }

  let body: { player_url?: string; playerUrl?: string; lang?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const playerUrl = (body.player_url || body.playerUrl || '').trim();
  const lang = body.lang === 'he' ? 'he' : 'en';

  if (!playerUrl) {
    return NextResponse.json({ error: 'player_url required' }, { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SCOUT_PERSONA + WAR_ROOM_PERSONA_EXT,
    });

    // 1. Fetch TM data (direct from transfermarkt lib)
    const tmData = await handlePlayer(playerUrl).catch(() => null);
    if (!tmData) {
      return NextResponse.json({ error: 'Failed to fetch player' }, { status: 502 });
    }

    const name = (tmData as Record<string, unknown>).fullName as string || 'Player';
    const age = (tmData as Record<string, unknown>).age as string || '';
    const position = ((tmData as Record<string, unknown>).positions as string[])?.[0] || '';
    const club = ((tmData as Record<string, unknown>).currentClub as { clubName?: string })?.clubName || '';
    const league = ((tmData as Record<string, unknown>).currentClub as { clubCountry?: string })?.clubCountry || '';
    const marketValue = (tmData as Record<string, unknown>).marketValue as string || '';
    const contractExpires = (tmData as Record<string, unknown>).contractExpires as string || '';
    const height = (tmData as Record<string, unknown>).height as string || '';
    const foot = (tmData as Record<string, unknown>).foot as string || '';
    const playingStyle = (tmData as Record<string, unknown>).playingStyle as string || '';
    const nationality = (tmData as Record<string, unknown>).nationality as string ||
      ((tmData as Record<string, unknown>).nationalities as string[])?.[0] || '';

    // 2. Fetch player stats, similar players + FM intelligence in parallel
    //    Primary: direct player_stats by URL (has API-Football data)
    //    Secondary: recruitment endpoint with player ID (finds player even with URL mismatches)
    //    Tertiary: similar_players (self-match)
    const playerId = extractPlayerIdFromUrl(playerUrl);
    const [playerStatsData, similarData, fmDataRaw] = await Promise.all([
      // Direct stats lookup — most reliable
      fetchJson<Record<string, unknown>>(
        `${getScoutBaseUrl()}/player_stats?url=${encodeURIComponent(playerUrl)}`
      ),
      fetchJson<{ results?: Record<string, unknown>[] }>(
        `${getScoutBaseUrl()}/similar_players?player_url=${encodeURIComponent(playerUrl)}&lang=${lang}&limit=5`
      ),
      fetchJson<Record<string, unknown>>(
        `${getScoutBaseUrl()}/fm_intelligence?player_name=${encodeURIComponent(name)}`
      ),
    ]);

    // Fallback: search recruitment with broad query, find player by TM ID
    let directStats = playerStatsData && !playerStatsData.error ? playerStatsData : null;
    if (!directStats) {
      try {
        // Map TM position to server position code
        const posMap: Record<string, string> = {
          'Centre-Forward': 'CF', 'Second Striker': 'SS',
          'Left Winger': 'LW', 'Right Winger': 'RW',
          'Attacking Midfield': 'AM', 'Central Midfield': 'CM',
          'Defensive Midfield': 'DM',
          'Centre-Back': 'CB', 'Left-Back': 'LB', 'Right-Back': 'RB',
          'Goalkeeper': 'GK',
        };
        const pos = posMap[position] || '';
        const recruitParams = new URLSearchParams({
          notes: 'x',
          limit: '30',
          sort_by: 'score',
          lang,
        });
        if (pos) recruitParams.set('position', pos);
        const recruitData = await fetchJson<{ results?: Record<string, unknown>[] }>(
          `${getScoutBaseUrl()}/recruitment?${recruitParams.toString()}`
        );
        const recruitResults = recruitData?.results ?? [];
        // Try by TM player ID first, then by exact name match (handles duplicate TM profiles)
        directStats = recruitResults.find((r) =>
          playerId && samePlayer((r.url as string) || '', playerUrl)
        ) ?? recruitResults.find((r) => {
          const rName = ((r.name as string) || '').toLowerCase().trim();
          return rName === name.toLowerCase().trim();
        }) ?? null;
        if (directStats) {
          console.log(`[War Room] Found player stats via recruitment fallback: ${name}`);
        }
      } catch { /* non-critical */ }
    }

    // Fallback: direct FMInside scrape when scout server has no FM data
    let fmData = fmDataRaw && !(fmDataRaw as Record<string, unknown>).error ? fmDataRaw : null;
    if (!fmData || !(fmData as Record<string, unknown>).ca) {
      try {
        const fmiParams = new URLSearchParams({ player_name: name });
        if (club) fmiParams.set('club', club);
        if (age) fmiParams.set('age', age);
        const fmiRes = await fetchJson<Record<string, unknown>>(
          `${getSelfBaseUrl()}/api/fminside/player?${fmiParams.toString()}`
        );
        if (fmiRes && !fmiRes.error && (fmiRes.ca as number) > 0) fmData = fmiRes;
      } catch { /* non-critical */ }
    }

    const similarResults = (similarData?.results ?? []) as Record<string, unknown>[];
    // Stats priority: direct player_stats > similar_players self-match > first similar
    const similarMatch = similarResults.find((r) => samePlayer((r.url as string) || '', playerUrl));
    const statsSource = directStats ?? similarMatch ?? similarResults[0];
    const statsContext = statsSource
      ? buildStatsContext(statsSource)
      : 'No stats available';
    const fmContext = buildFmContext(fmData as Record<string, unknown> | null);
    const similarSummary = (similarData?.results || [])
      .filter((p: Record<string, unknown>) => !samePlayer((p.url as string) || '', playerUrl))
      .slice(0, 5)
      .map((p: Record<string, unknown>) => {
        const pStyle = (p.playing_style as string) || '';
        return `${p.name} (${p.market_value}, ${p.club}, ${p.age}yo${pStyle ? `, style: ${pStyle}` : ''})`;
      })
      .join('; ');

    const outputLang = lang === 'he' ? 'Hebrew' : 'English';

    // Call 1: Deep Analysis — Stats + Market + Tactics + Player Profile (with elite persona)
    const combinedPrompt = `Analyze this player for a Ligat Ha'Al club. Produce a War Room brief.

PLAYER: ${name}, ${age}, ${position}
NATIONALITY: ${nationality}
CLUB: ${club}, ${league}
MARKET VALUE: ${marketValue}
CONTRACT: ${contractExpires}
HEIGHT: ${height}, FOOT: ${foot}
${playingStyle ? `PLAYING STYLE: ${playingStyle}` : ''}
STATS (per 90): ${statsContext}
FM INTELLIGENCE: ${fmContext}
COMPARABLE PLAYERS: ${similarSummary || 'None available'}

Output a single JSON with three keys (write in ${outputLang}):
{
  "stats": {
    "strengths": ["strength with metric if available"],
    "weaknesses": ["weakness with evidence"],
    "key_metrics": ["metric: value — context"],
    "playing_minutes_assessment": "Is he a regular starter? How many minutes?",
    "summary": "3-4 sentence statistical profile. Be specific about what the numbers tell you."
  },
  "market": {
    "market_position": "undervalued|fair|overvalued",
    "rationale": "2-3 sentences with specific comparisons",
    "comparable_range": "€X–€Y based on similar players",
    "contract_leverage": "high|medium|low",
    "suggested_bid": "€X opening / €Y max based on contract and market",
    "summary": "2-3 sentence market analysis"
  },
  "tactics": {
    "best_role": "specific role in specific formation",
    "best_system": "tactical system where he thrives",
    "ligat_haal_fit": "START|ROTATION|SQUAD|BENEATH",
    "club_fit": ["Club Name: why he fits their specific needs"],
    "comparison_player": "He reminds me of [player] because [reason]",
    "ceiling_assessment": "Best case outcome in 2-3 years",
    "floor_assessment": "Worst case / what could go wrong",
    "summary": "2-3 sentence tactical fit analysis"
  }
}

CRITICAL RULES:
- Base analysis ONLY on data provided. Never invent stats.
- Israeli clubs typically pay €100K–€2.5M. A player valued at €500K in Belgium who performs like a €1.5M player = undervalued.
- If a player in Eredivisie/Belgian league is ROTATION, they are likely STARTER in Ligat Ha'Al.
- For comparison_player: use a well-known player the sporting director would recognize. Explain the specific similarity.
- Be decisive and opinionated. Don't hedge with "could be good" — say "IS good because X."`;

    const combinedText = await generateWithRetry(model, combinedPrompt);
    const combined = parseJson(combinedText) as { stats?: Record<string, unknown>; market?: Record<string, unknown>; tactics?: Record<string, unknown> };
    const statsAnalysis = JSON.stringify(combined.stats ?? {});
    const marketAnalysis = JSON.stringify(combined.market ?? {});
    const tacticsAnalysis = JSON.stringify(combined.tactics ?? {});

    // Call 2: Synthesis — Executive brief with confidence and actionable intelligence
    const synthesisPrompt = `You are the Chief Scout making the final call. Combine these three analyses into a decisive War Room verdict.

STATS ANALYSIS: ${statsAnalysis}
MARKET ANALYSIS: ${marketAnalysis}
TACTICAL ANALYSIS: ${tacticsAnalysis}

PLAYER CONTEXT: ${name}, ${age}, ${position}, ${club} (${league}), ${marketValue}

Output JSON (write in ${outputLang}):
{
  "executive_summary": "4-5 sentence overview written with authority. Open with the verdict, then justify it.",
  "recommendation": "SIGN|MONITOR|PASS",
  "recommendation_rationale": "2-3 sentences — why this specific recommendation, spoken as if to the sporting director",
  "confidence_level": 75,
  "confidence_explanation": "1 sentence explaining what data supports/undermines your confidence",
  "action_timeline": "e.g. 'SIGN within 2 months — contract leverage is high' or 'MONITOR until winter window'",
  "key_risks": ["specific, actionable risk with mitigation"],
  "key_opportunities": ["specific opportunity with why it's time-sensitive"],
  "negotiation_leverage": "1-2 sentences on how to approach a deal based on contract, market position",
  "one_liner": "The one sentence that makes the sporting director pick up the phone — or close the file"
}

RULES:
- Be DECISIVE. No "maybe" or "possibly." You're staking your reputation.
- confidence_level is 0-100. Below 50 = insufficient data. 50-70 = reasonable bet. 70-90 = strong conviction. 90+ = once-in-a-window opportunity.
- The one_liner should be memorable. It's the kind of thing scouts say in transfer meetings.
- Reconcile any contradictions between the three analyses. If stats say SIGN but market says PASS, resolve it.`;

    const synthesisText = await generateWithRetry(model, synthesisPrompt);

    return NextResponse.json({
      stats: (combined.stats as Record<string, unknown>) ?? {},
      market: (combined.market as Record<string, unknown>) ?? {},
      tactics: (combined.tactics as Record<string, unknown>) ?? {},
      synthesis: parseJson(synthesisText),
    });
  } catch (err) {
    console.error('[War Room Report] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Report generation failed' },
      { status: 500 }
    );
  }
}
