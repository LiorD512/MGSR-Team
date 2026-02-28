/**
 * POST /api/share/generate-scout-report
 * Generates a short, promotional scout report for sharing with clubs.
 * Fetches FBref + FM data when tmProfile available. No verdict/sign decision.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

const SCOUT_BASE = process.env.SCOUT_SERVER_URL || 'https://football-scout-server-l38w.onrender.com';

interface PlayerPayload {
  fullName?: string;
  fullNameHe?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  marketValueHistory?: { value?: string; date?: number }[];
  currentClub?: { clubName?: string; clubLogo?: string; clubCountry?: string };
  age?: string;
  height?: string;
  nationality?: string;
  contractExpired?: string;
  foot?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  agency?: string;
  tmProfile?: string;
}

async function fetchScoutData(tmProfile: string, playerName: string) {
  const [similarRes, fmRes] = await Promise.all([
    fetch(`${SCOUT_BASE}/similar_players?player_url=${encodeURIComponent(tmProfile)}&lang=en&limit=1`, {
      signal: AbortSignal.timeout(20000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${SCOUT_BASE}/fm_intelligence?player_name=${encodeURIComponent(playerName)}`, {
      signal: AbortSignal.timeout(15000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const profile = similarRes?.player_profile ?? similarRes?.results?.[0];
  const fm = fmRes && !fmRes.error ? fmRes : null;
  return { profile, fm };
}

function buildPlayerContext(player: PlayerPayload, scoutData?: { profile?: Record<string, unknown>; fm?: Record<string, unknown> }): string {
  const parts: string[] = [];
  if (player.fullName) parts.push(`Name: ${player.fullName}`);
  if (player.age) parts.push(`Age: ${player.age}`);
  if (player.positions?.length)
    parts.push(`Positions: ${player.positions.filter(Boolean).join(', ')}`);
  if (player.height) parts.push(`Height: ${player.height}`);
  if (player.foot) parts.push(`Preferred foot: ${player.foot}`);
  if (player.marketValue) parts.push(`Market value: ${player.marketValue}`);
  if (player.marketValueHistory?.length) {
    const recent = player.marketValueHistory
      .slice(-3)
      .map((h) => h.value ?? '?')
      .join(' → ');
    parts.push(`Market value trend: ${recent}`);
  }
  if (player.nationality) parts.push(`Nationality: ${player.nationality}`);
  if (player.currentClub?.clubName)
    parts.push(`Current club: ${player.currentClub.clubName}`);
  if (player.currentClub?.clubCountry)
    parts.push(`League: ${player.currentClub.clubCountry}`);
  if (player.contractExpired) parts.push(`Contract: ${player.contractExpired}`);
  if (player.isOnLoan) parts.push('On loan: yes');
  if (player.onLoanFromClub)
    parts.push(`On loan from: ${player.onLoanFromClub}`);
  if (player.agency) parts.push(`Agency: ${player.agency}`);
  if (player.tmProfile) parts.push(`Transfermarkt: ${player.tmProfile}`);

  if (scoutData?.profile && scoutData.profile.fbref_matched) {
    const p = scoutData.profile;
    const mins = p.fbref_minutes_90s != null ? `${Number(p.fbref_minutes_90s) * 90} minutes` : null;
    if (mins) parts.push(`Minutes (365d): ${mins}`);
    if (p.fbref_tackles_per90 != null) parts.push(`Tackles/90: ${p.fbref_tackles_per90}`);
    if (p.fbref_interceptions_per90 != null) parts.push(`Interceptions/90: ${p.fbref_interceptions_per90}`);
    if (p.fbref_goals_per90 != null) parts.push(`Goals/90: ${p.fbref_goals_per90}`);
    if (p.fbref_assists_per90 != null) parts.push(`Assists/90: ${p.fbref_assists_per90}`);
    if (p.player_style) parts.push(`Playing style: ${p.player_style}`);
  }
  if (scoutData?.fm && !scoutData.fm.error) {
    const f = scoutData.fm;
    parts.push(`FM CA: ${f.ca}, PA: ${f.pa}, Tier: ${f.tier}`);
    if (f.best_position) parts.push(`Best position: ${(f.best_position as { position?: string }).position} (fit ${(f.best_position as { fit?: number }).fit})`);
    if (Array.isArray(f.top_attributes) && f.top_attributes.length > 0) {
      const attrs = (f.top_attributes as { name: string; value: number }[])
        .slice(0, 8)
        .map((a) => `${a.name} ${a.value}`)
        .join(', ');
      parts.push(`Top attributes: ${attrs}`);
    }
  }
  return parts.join('\n');
}

const SCOUT_REPORT_PROMPT = `You are a professional scout presenting a player to clubs. Your job is to showcase the player in the best light — promotional, concise, data-driven. NO verdict, NO sign/monitor/pass decision. Just present the player.

FORMAT:
- All in prose (words), NO tables.
- Short: ~150–250 words max.
- Clear, punchy sentences. Bold key numbers where they stand out.
- Promotional tone: highlight strengths, never list weaknesses or diminish value.
- Do NOT include: key passes, progressive carries (we don't have this data — omit entirely).
- Do NOT invent: minutes, stats, or facts not in the profile.
- End with Ligat Ha'Al fit (rotation/squad/starter) and realistic price range if relevant.

STRUCTURE (flow naturally in prose):
1. Identity: name, age, position, club, league, market value, nationality.
2. Stats (if available): minutes, tackles/90, interceptions/90, goals/90 — only what's in the data.
3. FM attributes (if available): CA, PA, tier, top attributes, best position.
4. Playing style (if available): one line.
5. Ligat Ha'Al fit: rotation/squad/starter for top-6 or mid-table. Price range €X–€Y if relevant.

Write in {outputLang}. Plain text only, no markdown. Be professional and club-ready.`;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ scoutReport: '' });
    }

    const body = (await request.json()) as { player: PlayerPayload; lang?: string };
    const { player, lang = 'en' } = body;
    if (!player) return NextResponse.json({ scoutReport: '' });

    let scoutData: { profile?: Record<string, unknown>; fm?: Record<string, unknown> } | undefined;
    if (player.tmProfile && player.fullName) {
      scoutData = await fetchScoutData(player.tmProfile, player.fullName);
    }

    const playerContext = buildPlayerContext(player, scoutData);
    const outputLang = lang === 'he' || lang === 'iw' ? 'Hebrew' : 'English';

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.4,
        topP: 0.9,
      },
    });

    const prompt = `${SCOUT_REPORT_PROMPT.replace('{outputLang}', outputLang)}

Player profile (ONLY use data below — never invent):
${playerContext}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() || '';

    return NextResponse.json({ scoutReport: text });
  } catch (e) {
    console.error('[share] Scout report generation failed:', e);
    return NextResponse.json({ scoutReport: '' });
  }
}
