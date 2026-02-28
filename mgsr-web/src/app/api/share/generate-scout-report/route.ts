/**
 * POST /api/share/generate-scout-report
 * Generates a promotional scout report for sharing with clubs.
 * Uses all available tools: similar_players (5), full FM intelligence, market history.
 * Output: structured markdown with sections.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractPlayerIdFromUrl } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

interface ScoutData {
  profile?: Record<string, unknown>;
  fm?: Record<string, unknown>;
  similarResults?: Record<string, unknown>[];
}

function samePlayer(url1: string, url2: string): boolean {
  const id1 = extractPlayerIdFromUrl(url1);
  const id2 = extractPlayerIdFromUrl(url2);
  return !!id1 && id1 === id2;
}

async function fetchScoutData(tmProfile: string, playerName: string, lang: string): Promise<ScoutData> {
  const [similarRes, fmRes] = await Promise.all([
    fetch(`${SCOUT_BASE}/similar_players?player_url=${encodeURIComponent(tmProfile)}&lang=${lang}&limit=5`, {
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${SCOUT_BASE}/fm_intelligence?player_name=${encodeURIComponent(playerName)}`, {
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const similarResults = (similarRes?.results ?? []) as Record<string, unknown>[];
  const playerMatch = similarResults.find((r) => samePlayer((r.url as string) || '', tmProfile));
  const profile = similarRes?.player_profile ?? playerMatch ?? similarResults[0];
  const fm = fmRes && !fmRes.error ? fmRes : null;
  return { profile, fm, similarResults };
}

function buildPlayerContext(player: PlayerPayload, scoutData?: ScoutData): string {
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
    if (p.fbref_progressive_carries_per90 != null || p.fbref_progressive_carries != null)
      parts.push(`Progressive carries/90: ${p.fbref_progressive_carries_per90 ?? p.fbref_progressive_carries ?? '?'}`);
    if (p.fbref_key_passes_per90 != null || p.fbref_key_passes != null)
      parts.push(`Key passes/90: ${p.fbref_key_passes_per90 ?? p.fbref_key_passes ?? '?'}`);
    if (p.player_style) parts.push(`Playing style: ${p.player_style}`);
  }
  if (scoutData?.fm && !scoutData.fm.error) {
    const f = scoutData.fm;
    parts.push(`FM CA: ${f.ca}, PA: ${f.pa}, Tier: ${f.tier}`);
    if (f.best_position) parts.push(`Best position: ${(f.best_position as { position?: string }).position} (fit ${(f.best_position as { fit?: number }).fit})`);
    if (typeof f.dimension_scores === 'object' && f.dimension_scores) {
      const dims = Object.entries(f.dimension_scores as Record<string, number>)
        .filter(([k]) => k !== 'overall')
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (dims) parts.push(`FM dimension scores: ${dims}`);
    }
    if (typeof f.position_fit === 'object' && f.position_fit) {
      const fits = Object.entries(f.position_fit as Record<string, number>)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 5)
        .map(([pos, fit]) => `${pos}: ${fit}`)
        .join(', ');
      if (fits) parts.push(`FM position fit: ${fits}`);
    }
    if (Array.isArray(f.top_attributes) && f.top_attributes.length > 0) {
      const attrs = (f.top_attributes as { name: string; value: number }[])
        .slice(0, 8)
        .map((a) => `${a.name} ${a.value}`)
        .join(', ');
      parts.push(`Top attributes: ${attrs}`);
    }
    if (Array.isArray(f.weak_attributes) && f.weak_attributes.length > 0) {
      const weak = (f.weak_attributes as { name: string; value: number }[])
        .slice(0, 4)
        .map((a) => `${a.name} ${a.value}`)
        .join(', ');
      parts.push(`Areas to develop: ${weak}`);
    }
  }
  if (scoutData?.similarResults && scoutData.similarResults.length > 0) {
    const similarSummary = scoutData.similarResults
      .slice(0, 5)
      .map((p) => `${p.name} (${p.market_value ?? '?'}, ${p.club ?? '?'})`)
      .join('; ');
    parts.push(`Comparable players (statistically similar): ${similarSummary}`);
  }
  return parts.join('\n');
}

/** Template-based scout report when Gemini fails. Outputs structured markdown. */
function buildTemplateScoutReport(
  player: PlayerPayload,
  scoutData: ScoutData | undefined,
  lang: 'he' | 'en'
): string {
  const isHe = lang === 'he';
  const name = (isHe ? player.fullNameHe || player.fullName : player.fullName || player.fullNameHe) || '—';
  const pos = player.positions?.filter(Boolean).join(', ') || '—';
  const club = player.currentClub?.clubName || '—';
  const league = player.currentClub?.clubCountry || '';
  const value = player.marketValue || '—';
  const nat = player.nationality || '—';
  const contract = player.contractExpired || '—';
  const age = player.age || '—';
  const height = player.height || '';

  const L = isHe
    ? {
        exec: 'סיכום',
        strengths: 'חוזקות מרכזיות',
        comparable: 'שחקנים דומים',
        market: 'הקשר שוק',
        fit: 'התאמה טקטית',
        stats: 'סטטיסטיקות',
        fm: 'FM',
        fmAttr: 'מאפיינים מובילים',
        style: 'סגנון משחק',
        price: 'טווח מחיר',
        minutes: 'דקות',
        goals: 'שערים',
        assists: 'אסיסטים',
        tackles: 'טאקלים',
        interceptions: 'חטיפות',
      }
    : {
        exec: 'Executive Summary',
        strengths: 'Key Strengths',
        comparable: 'Comparable Players',
        market: 'Market Context',
        fit: 'Tactical Fit',
        stats: 'Stats',
        fm: 'FM',
        fmAttr: 'Top attributes',
        style: 'Playing style',
        price: 'Price range',
        minutes: 'minutes',
        goals: 'goals',
        assists: 'assists',
        tackles: 'tackles',
        interceptions: 'interceptions',
      };

  const sections: string[] = [];

  const execLine = `${name} — ${age}${isHe ? ' שנים' : 'yo'}, ${pos}. ${club}${league ? ` (${league})` : ''}. ${isHe ? 'שווי שוק' : 'Market value'}: **${value}**. ${nat}. ${isHe ? 'חוזה' : 'Contract'}: ${contract}.`;
  sections.push(`## ${L.exec}\n\n${execLine}${height ? ` ${isHe ? 'גובה' : 'Height'}: ${height}.` : '.'}`);

  const profile = scoutData?.profile;
  const fm = scoutData?.fm && !scoutData.fm.error ? scoutData.fm : null;

  const strengths: string[] = [];
  if (profile && profile.fbref_matched) {
    const p = profile;
    const mins = p.fbref_minutes_90s != null ? Math.round(Number(p.fbref_minutes_90s) * 90) : null;
    if (mins) strengths.push(`**${mins}** ${L.minutes} (365d)`);
    if (p.fbref_goals_per90 != null) strengths.push(`**${p.fbref_goals_per90}** ${L.goals}/90`);
    if (p.fbref_assists_per90 != null) strengths.push(`**${p.fbref_assists_per90}** ${L.assists}/90`);
    if (p.fbref_tackles_per90 != null) strengths.push(`**${p.fbref_tackles_per90}** ${L.tackles}/90`);
    if (p.fbref_interceptions_per90 != null) strengths.push(`**${p.fbref_interceptions_per90}** ${L.interceptions}/90`);
  }
  if (fm) {
    const f = fm as { ca?: number; pa?: number; tier?: string; best_position?: { position?: string; fit?: number }; top_attributes?: { name: string; value: number }[] };
    if (f.ca != null) strengths.push(`FM CA **${f.ca}**${f.tier ? ` (${f.tier})` : ''}`);
    if (f.best_position?.position) strengths.push(`${isHe ? 'עמדה מובילה' : 'Best position'}: **${f.best_position.position}** (fit ${f.best_position.fit ?? '?'})`);
    if (Array.isArray(f.top_attributes) && f.top_attributes.length) {
      const attrs = f.top_attributes.slice(0, 4).map((a) => `${a.name} ${a.value}`).join(', ');
      strengths.push(`${L.fmAttr}: ${attrs}`);
    }
  }
  if (profile?.player_style) strengths.push(`${L.style}: ${profile.player_style}`);
  if (strengths.length) sections.push(`## ${L.strengths}\n\n- ${strengths.join('\n- ')}`);

  if (scoutData?.similarResults && scoutData.similarResults.length > 0) {
    const similarList = scoutData.similarResults
      .slice(0, 5)
      .map((p) => `${p.name} (${p.market_value ?? '?'}, ${p.club ?? '?'})`)
      .join('; ');
    sections.push(`## ${L.comparable}\n\n${isHe ? 'דומה סטטיסטית ל' : 'Statistically similar to'}: ${similarList}.`);
  }

  const valueStr = (value || '').replace(/,/g, '');
  const hasM = /m|M|million/i.test(valueStr);
  const hasK = /k|K|thousand/i.test(valueStr);
  let valueNum = parseFloat(valueStr.replace(/[^0-9.]/g, '')) || 0;
  if (hasM) valueNum *= 1_000_000;
  else if (hasK) valueNum *= 1_000;
  let fit = '';
  let priceRange = '';
  if (valueNum >= 1_500_000) {
    fit = isHe ? 'שחקן סגל/סטארטר למועדונים מובילים' : 'Squad/starter for top clubs';
    priceRange = '€1M–€2.5m';
  } else if (valueNum >= 500_000) {
    fit = isHe ? 'שחקן סגל לליגת העל' : 'Squad player for Ligat Ha\'Al';
    priceRange = '€500k–€1.5m';
  } else if (valueNum >= 100_000) {
    fit = isHe ? 'שחקן רוטציה/סגל' : 'Rotation/squad';
    priceRange = '€100k–€500k';
  } else {
    fit = isHe ? 'שחקן סגל/פרויקט' : 'Squad/project';
    priceRange = '€50k–€200k';
  }
  const marketParts: string[] = [];
  if (player.marketValueHistory?.length) {
    const trend = player.marketValueHistory.slice(-3).map((h) => h.value ?? '?').join(' → ');
    marketParts.push(`${isHe ? 'מגמת שווי' : 'Value trend'}: ${trend}`);
  }
  marketParts.push(`${L.price}: **${priceRange}**`);
  sections.push(`## ${L.market}\n\n${marketParts.join('. ')}.`);

  sections.push(`## ${L.fit}\n\n${fit}.`);

  return sections.join('\n\n');
}

const SCOUT_REPORT_PROMPT = `You are a professional scout presenting a player to clubs. Your job is to showcase the player in the best light — promotional, engaging, data-driven. NO verdict, NO sign/monitor/pass decision. Just present the player attractively.

OUTPUT FORMAT:
- Structured markdown with ## section headers.
- Use **bold** for key numbers and standout stats.
- ~200–300 words total.
- Promotional tone: highlight strengths; mention 1–2 "areas to develop" only if weak_attributes data supports it.
- Never use generic phrases ("works hard", "comfortable on the ball") — always cite specific numbers.
- Do NOT invent: minutes, stats, or facts not in the profile.
- Write in {outputLang}.

REQUIRED SECTIONS (use these exact ## headers):

## Executive Summary
1–2 sentences. Narrative hook: e.g. "A [nationality] [position] with [key standout trait] who could [value proposition for Ligat Ha'Al]." Start with impact, not "Player X is 24 years old."

## Key Strengths
2–4 bullet points. Each must cite specific data: "**2.1** tackles/90", "FM CA **78**", "**X** goals/90". Include playing style if available.

## Comparable Players
1–2 sentences. Use the comparable players list: "Statistically similar to players like X (€Y, Club Z) and W (€V, Club U)." If no comparable players, omit this section.

## Market Context
Value trend (if marketValueHistory available), contract leverage, realistic price range €X–€Y for Israeli clubs.

## Tactical Fit
Best role (from FM best_position), Ligat Ha'Al fit (rotation/squad/starter for top-6 or mid-table). Be specific.

Use ONLY data from the profile below. Never invent stats. Israeli clubs typically pay €100k–€2.5m.`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { player: PlayerPayload; lang?: string };
    const { player, lang = 'en' } = body;
    if (!player) return NextResponse.json({ scoutReport: '' });

    const langKey = (lang === 'he' || lang === 'iw' ? 'he' : 'en') as 'he' | 'en';

    let scoutData: ScoutData | undefined;
    if (player.tmProfile && player.fullName) {
      try {
        scoutData = await fetchScoutData(player.tmProfile, player.fullName, langKey);
      } catch {
        scoutData = undefined;
      }
    }

    let scoutReport = '';

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const playerContext = buildPlayerContext(player, scoutData);
        const outputLang = langKey === 'he' ? 'Hebrew' : 'English';
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.4, topP: 0.9 },
        });
        const prompt = `${SCOUT_REPORT_PROMPT.replace('{outputLang}', outputLang)}

Player profile (ONLY use data below — never invent):
${playerContext}`;
        const result = await model.generateContent(prompt);
        scoutReport = result.response.text()?.trim() || '';
      } catch (e) {
        console.error('[share] Gemini scout report failed, using template:', e);
      }
    }

    if (!scoutReport) {
      scoutReport = buildTemplateScoutReport(player, scoutData, langKey);
    }

    return NextResponse.json({ scoutReport });
  } catch (e) {
    console.error('[share] Scout report generation failed:', e);
    return NextResponse.json({ scoutReport: '' });
  }
}
