/**
 * POST /api/war-room/report
 * Generates a multi-agent War Room report for a player.
 * Uses 2 Gemini calls (combined agents + synthesis) to stay within free-tier rate limits (5/min).
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { handlePlayer } from '@/lib/transfermarkt';
import { extractPlayerIdFromUrl } from '@/lib/api';

const SCOUT_BASE = process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';

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
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

    // 2. Fetch similar players + FM intelligence in parallel
    const [similarData, fmData] = await Promise.all([
      fetchJson<{ results?: Record<string, unknown>[] }>(
        `${SCOUT_BASE}/similar_players?player_url=${encodeURIComponent(playerUrl)}&lang=${lang}&limit=5`
      ),
      fetchJson<Record<string, unknown>>(
        `${SCOUT_BASE}/fm_intelligence?player_name=${encodeURIComponent(name)}`
      ),
    ]);

    const similarResults = (similarData?.results ?? []) as Record<string, unknown>[];
    const playerMatch = similarResults.find((r) => samePlayer((r.url as string) || '', playerUrl));
    const statsSource = playerMatch ?? similarResults[0];
    const statsContext = statsSource
      ? `Goals/90: ${statsSource.fbref_goals ?? statsSource.fbref_goals_per90 ?? '?'}, Assists/90: ${statsSource.fbref_assists ?? statsSource.fbref_assists_per90 ?? '?'}, Progressive carries: ${statsSource.fbref_progressive_carries ?? statsSource.fbref_progressive_carries_per90 ?? '?'}, Key passes: ${statsSource.fbref_key_passes ?? statsSource.fbref_key_passes_per90 ?? '?'}`
      : 'No FBref stats available';
    const fmContext = fmData && !fmData.error
      ? `CA: ${fmData.ca}, PA: ${fmData.pa}, Tier: ${fmData.tier}`
      : 'N/A';
    const similarSummary = (similarData?.results || [])
      .slice(0, 5)
      .map((p: Record<string, unknown>) => `${p.name} (${p.market_value}, ${p.club})`)
      .join('; ');

    const outputLang = lang === 'he' ? 'Hebrew' : 'English';

    // Call 1: Combined Stats + Market + Tactics (reduces from 4 to 1 API call for free-tier quota)
    const combinedPrompt = `You are a scouting war room for Ligat Ha'Al (Israeli league). Analyze this player and output a single JSON with three keys: "stats", "market", "tactics".

PLAYER: ${name}, ${age}, ${position}
CLUB: ${club}, ${league}
MARKET VALUE: ${marketValue}
CONTRACT: ${contractExpires}
HEIGHT: ${height}, FOOT: ${foot}
STATS (per 90): ${statsContext}
FM: ${fmContext}
SIMILAR PLAYERS: ${similarSummary || 'None'}

Output this exact JSON structure (write in ${outputLang}):
{
  "stats": {"strengths": ["s1","s2"], "weaknesses": ["w1"], "key_metrics": ["m1: val"], "summary": "2-3 sentence statistical profile"},
  "market": {"market_position": "undervalued|fair|overvalued", "rationale": "1-2 sentences", "comparable_range": "€X–€Y", "contract_leverage": "high|medium|low", "summary": "2-3 sentence market analysis"},
  "tactics": {"best_role": "e.g. lone striker in 4-3-3", "best_system": "e.g. counter-attacking", "ligat_haal_fit": "START|ROTATION|SQUAD|BENEATH", "club_fit": ["Maccabi Haifa: ..."], "summary": "2-3 sentence tactical analysis"}
}

Base analysis ONLY on the data provided. Never invent stats. Israeli clubs typically pay €100k–€2.5m.`;

    const combinedText = await generateWithRetry(model, combinedPrompt);
    const combined = parseJson(combinedText) as { stats?: Record<string, unknown>; market?: Record<string, unknown>; tactics?: Record<string, unknown> };
    const statsAnalysis = JSON.stringify(combined.stats ?? {});
    const marketAnalysis = JSON.stringify(combined.market ?? {});
    const tacticsAnalysis = JSON.stringify(combined.tactics ?? {});

    // Call 2: Synthesis
    const synthesisPrompt = `You are the SYNTHESIS AGENT. Combine these three specialist reports into one unified War Room report for Ligat Ha'Al.

STATS: ${statsAnalysis}
MARKET: ${marketAnalysis}
TACTICS: ${tacticsAnalysis}

Output JSON:
{"executive_summary": "3-4 sentence overview", "recommendation": "SIGN|MONITOR|PASS", "recommendation_rationale": "1-2 sentences", "key_risks": ["r1","r2"], "key_opportunities": ["o1","o2"]}

Write in ${outputLang}. Be decisive. Reconcile contradictions.`;

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
