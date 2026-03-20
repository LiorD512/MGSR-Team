/**
 * POST /api/share/generate-scout-report
 * Generates a promotional scout report for sharing with clubs.
 * Men/Women: Uses Transfermarkt + scout server (similar_players, FM intelligence).
 * Youth: Uses IFA (football.org.il) profile and stats when ifaUrl provided.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractPlayerIdFromUrl } from '@/lib/api';
import { fetchIFAProfile, normalizeIfaUrl, isValidIfaUrl } from '@/lib/ifa';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

interface PlayerPayload {
  fullName?: string;
  fullNameHe?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  marketValueHistory?: { value?: string; date?: number }[];
  currentClub?: { clubName?: string; clubLogo?: string; clubCountry?: string };
  age?: string;
  ageGroup?: string;
  dateOfBirth?: string;
  height?: string;
  nationality?: string;
  contractExpired?: string;
  foot?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  agency?: string;
  tmProfile?: string;
  ifaUrl?: string;
  ifaStats?: { season?: string; matches?: number; goals?: number; assists?: number; yellowCards?: number; redCards?: number };
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

async function fetchScoutData(
  tmProfile: string,
  playerName: string,
  lang: string,
  club?: string,
  age?: string
): Promise<ScoutData> {
  const fmParams = new URLSearchParams();
  fmParams.set('player_name', playerName);
  if (club) fmParams.set('club', club);
  if (age) fmParams.set('age', age);
  fmParams.set('_t', String(Date.now()));

  const [similarRes, fmRes] = await Promise.all([
    fetch(`${getScoutBaseUrl()}/similar_players?player_url=${encodeURIComponent(tmProfile)}&lang=${lang}&limit=5`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${getScoutBaseUrl()}/fm_intelligence?${fmParams.toString()}`, {
      cache: 'no-store',
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
    // NOTE: progressive_carries and key_passes removed — not available on free FBref tier
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

/** Build player context from IFA (football.org.il) profile and stats — for youth players */
function buildIFAPlayerContext(
  player: PlayerPayload,
  ifaProfile: { fullName?: string; fullNameHe?: string; currentClub?: string; positions?: string[]; dateOfBirth?: string; nationality?: string; height?: string; foot?: string; stats?: { matches?: number; goals?: number; assists?: number; yellowCards?: number; redCards?: number } }
): string {
  const parts: string[] = [];
  const name = player.fullName || ifaProfile.fullName || player.fullNameHe || ifaProfile.fullNameHe || '—';
  parts.push(`Name: ${name}`);
  if (player.ageGroup) parts.push(`Age group: ${player.ageGroup}`);
  if (player.age) parts.push(`Age: ${player.age}`);
  if (player.positions?.length) parts.push(`Positions: ${player.positions.filter(Boolean).join(', ')}`);
  else if (ifaProfile.positions?.length) parts.push(`Positions: ${ifaProfile.positions.join(', ')}`);
  if (player.height || ifaProfile.height) parts.push(`Height: ${player.height || ifaProfile.height}`);
  if (player.foot || ifaProfile.foot) parts.push(`Preferred foot: ${player.foot || ifaProfile.foot}`);
  if (player.nationality || ifaProfile.nationality) parts.push(`Nationality: ${player.nationality || ifaProfile.nationality}`);
  const club = player.currentClub?.clubName || (typeof player.currentClub === 'string' ? player.currentClub : null) || ifaProfile.currentClub;
  if (club) parts.push(`Current club: ${club}`);
  if (player.dateOfBirth || ifaProfile.dateOfBirth) parts.push(`Date of birth: ${player.dateOfBirth || ifaProfile.dateOfBirth}`);
  if (player.agency) parts.push(`Agency: ${player.agency}`);

  const stats = player.ifaStats ?? ifaProfile.stats;
  if (stats) {
    if (stats.matches != null) parts.push(`Matches (season): ${stats.matches}`);
    if (stats.goals != null) parts.push(`Goals: ${stats.goals}`);
    if (stats.assists != null) parts.push(`Assists: ${stats.assists}`);
    if (stats.yellowCards != null) parts.push(`Yellow cards: ${stats.yellowCards}`);
    if (stats.redCards != null) parts.push(`Red cards: ${stats.redCards}`);
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
        fit: 'התאמה טקטית',
        stats: 'סטטיסטיקות',
        fm: 'FM',
        fmAttr: 'מאפיינים מובילים',
        style: 'סגנון משחק',
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
        fit: 'Tactical Fit',
        stats: 'Stats',
        fm: 'FM',
        fmAttr: 'Top attributes',
        style: 'Playing style',
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
  if (valueNum >= 1_500_000) {
    fit = isHe ? 'שחקן סגל/סטארטר למועדונים מובילים' : 'Squad/starter for top clubs';
  } else if (valueNum >= 500_000) {
    fit = isHe ? 'שחקן סגל לליגת העל' : 'Squad player for Ligat Ha\'Al';
  } else if (valueNum >= 100_000) {
    fit = isHe ? 'שחקן רוטציה/סגל' : 'Rotation/squad';
  } else {
    fit = isHe ? 'שחקן סגל/פרויקט' : 'Squad/project';
  }
  sections.push(`## ${L.fit}\n\n${fit}.`);

  return sections.join('\n\n');
}

/** Youth-specific template when no Transfermarkt/FM data — uses IFA stats */
function buildYouthTemplateScoutReport(
  player: PlayerPayload,
  ifaProfile: { fullName?: string; fullNameHe?: string; currentClub?: string; positions?: string[]; stats?: { matches?: number; goals?: number; assists?: number } },
  lang: 'he' | 'en'
): string {
  const isHe = lang === 'he';
  const name = (isHe ? player.fullNameHe || player.fullName : player.fullName || player.fullNameHe) || ifaProfile.fullName || ifaProfile.fullNameHe || '—';
  const pos = player.positions?.filter(Boolean).join(', ') || ifaProfile.positions?.join(', ') || '—';
  const club = player.currentClub?.clubName || (typeof player.currentClub === 'string' ? player.currentClub : null) || ifaProfile.currentClub || '—';
  const ageGroup = player.ageGroup || '—';
  const nat = player.nationality || '—';
  const stats = player.ifaStats ?? ifaProfile.stats;

  const L = isHe
    ? { exec: 'סיכום', strengths: 'חוזקות מרכזיות', stats: 'סטטיסטיקות עונה', fit: 'התאמה', matches: 'משחקים', goals: 'שערים', assists: 'בישולים' }
    : { exec: 'Executive Summary', strengths: 'Key Strengths', stats: 'Season Stats', fit: 'Tactical Fit', matches: 'matches', goals: 'goals', assists: 'assists' };

  const sections: string[] = [];
  const execLine = `${name} — ${ageGroup}, ${pos}. ${club}. ${nat}.`;
  sections.push(`## ${L.exec}\n\n${execLine}`);

  const strengths: string[] = [];
  if (stats) {
    if (stats.matches != null) strengths.push(`**${stats.matches}** ${L.matches}`);
    if (stats.goals != null) strengths.push(`**${stats.goals}** ${L.goals}`);
    if (stats.assists != null) strengths.push(`**${stats.assists}** ${L.assists}`);
  }
  if (strengths.length) sections.push(`## ${L.strengths}\n\n- ${strengths.join('\n- ')}`);
  if (stats && (stats.matches != null || stats.goals != null)) {
    sections.push(`## ${L.stats}\n\n${stats.matches ?? 0} ${L.matches}, ${stats.goals ?? 0} ${L.goals}, ${stats.assists ?? 0} ${L.assists}.`);
  }
  sections.push(`## ${L.fit}\n\n${isHe ? 'שחקן נוער מבטיח עם פוטנציאל להתפתחות בליגות הבכירות.' : 'Promising youth player with potential to develop in senior leagues.'}`);

  return sections.join('\n\n');
}

const SCOUT_REPORT_PROMPT = `You are a professional scout presenting a player to clubs. Your job is to showcase the player in the best light — promotional, engaging, data-driven. NO verdict, NO sign/monitor/pass decision. Just present the player attractively.

OUTPUT FORMAT:
- Use ## for section headers only.
- Do NOT use ** for bold text — write plain text instead.
- Do NOT use * for emphasis or italic.
- ~200–300 words total.
- Promotional tone: highlight strengths only. Never mention areas to develop, weaknesses, or weak attributes.
- Never use generic phrases ("works hard", "comfortable on the ball") — always cite specific numbers.
- Do NOT invent: minutes, stats, or facts not in the profile.
- Write in {outputLang}.

REQUIRED SECTIONS (use these exact ## headers):

## Executive Summary
1–2 sentences. Narrative hook: e.g. "A [nationality] [position] with [key standout trait] who could [value proposition for Ligat Ha'Al]." Start with impact, not "Player X is 24 years old."

## Key Strengths
2–4 bullet points. Each must cite specific data: "2.1 tackles/90", "FM CA 78", "X goals/90". Include playing style if available.

## Comparable Players
1–2 sentences. Use the comparable players list: "Statistically similar to players like X (€Y, Club Z) and W (€V, Club U)." If no comparable players, omit this section.

## Tactical Fit
Best role (from FM best_position), Ligat Ha'Al fit (rotation/squad/starter for top-6 or mid-table). Be specific.

Use ONLY data from the profile below. Never invent stats. Israeli clubs typically pay €100k–€2.5m.`;

const YOUTH_SCOUT_PROMPT = `You are a professional scout presenting a youth player to clubs. Showcase the player attractively using IFA (Israel Football Association) data. Promotional tone, data-driven. NO verdict. Write in {outputLang}.

OUTPUT FORMAT:
- Use ## for section headers only.
- Do NOT use ** for bold or * for italic — write plain text.
- ~150–250 words.
- Use ONLY data from the profile below. Never invent stats.

REQUIRED SECTIONS:
## Executive Summary — 1–2 sentences: age group, position, club, nationality. Highlight standout stats if available.
## Key Strengths — 2–4 bullet points citing specific numbers from IFA stats (matches, goals, assists).
## Tactical Fit — 1–2 sentences on potential and fit for youth academies / senior development.`;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { player: PlayerPayload; lang?: string; platform?: string; targetClub?: string; targetClubRequest?: { position?: string; salaryRange?: string; transferFee?: string; dominateFoot?: string } };
    const { player, lang = 'en', platform, targetClub, targetClubRequest } = body;
    if (!player) return NextResponse.json({ scoutReport: '' });

    const langKey = (lang === 'he' || lang === 'iw' ? 'he' : 'en') as 'he' | 'en';
    const isYouth = platform === 'youth';

    let ifaProfile: { fullName?: string; fullNameHe?: string; currentClub?: string; positions?: string[]; dateOfBirth?: string; nationality?: string; height?: string; foot?: string; stats?: { matches?: number; goals?: number; assists?: number; yellowCards?: number; redCards?: number } } | null = null;
    if (isYouth && player.ifaUrl && isValidIfaUrl(player.ifaUrl)) {
      try {
        const profile = await fetchIFAProfile(normalizeIfaUrl(player.ifaUrl));
        ifaProfile = {
          fullName: profile.fullName,
          fullNameHe: profile.fullNameHe,
          currentClub: profile.currentClub,
          positions: profile.positions,
          dateOfBirth: profile.dateOfBirth,
          nationality: profile.nationality,
          height: profile.height,
          foot: profile.foot,
          stats: profile.stats,
        };
      } catch (e) {
        console.error('[share] IFA profile fetch failed for youth:', e);
      }
    }

    let scoutData: ScoutData | undefined;
    if (!isYouth && player.tmProfile && player.fullName) {
      try {
        scoutData = await fetchScoutData(
          player.tmProfile,
          player.fullName,
          langKey,
          player.currentClub?.clubName,
          player.age
        );
      } catch {
        scoutData = undefined;
      }
    }

    let scoutReport = '';

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      try {
        const outputLang = langKey === 'he' ? 'Hebrew' : 'English';
        const playerContext = isYouth
          ? buildIFAPlayerContext(player, ifaProfile ?? {})
          : buildPlayerContext(player, scoutData);

        const promptTemplate = isYouth ? YOUTH_SCOUT_PROMPT : SCOUT_REPORT_PROMPT;
        const clubContext = targetClub
          ? `\n\nCLUB-SPECIFIC BRIEF — This report is a sales pitch to ${targetClub}.
The club is actively searching for a player for the following request:
${targetClubRequest?.position ? `- Position needed: ${targetClubRequest.position}` : ''}
${targetClubRequest?.salaryRange ? `- Salary budget: ${targetClubRequest.salaryRange}` : ''}
${targetClubRequest?.transferFee ? `- Transfer fee budget: ${targetClubRequest.transferFee}` : ''}
${targetClubRequest?.dominateFoot ? `- Preferred foot: ${targetClubRequest.dominateFoot}` : ''}

INSTRUCTIONS FOR CLUB-TARGETED REPORT:
1. Executive Summary: Open with a direct pitch to ${targetClub} — e.g. "For ${targetClub}'s search for a ${targetClubRequest?.position || 'new signing'}, [Player] represents..." Frame the player as THE answer to their specific need.
2. Key Strengths: Emphasize stats and attributes that directly match what ${targetClub} is looking for in this ${targetClubRequest?.position || 'role'}. Connect each strength to the club's need.
3. Replace "Comparable Players" with "## Why ${targetClub}?" — 2-3 sentences explaining why this player is a strong match: does the player fit the budget? does his profile/position match exactly what they asked for? mention contract situation if favorable.
4. Tactical Fit: Be specific about how this player slots into ${targetClub}'s squad for the ${targetClubRequest?.position || 'requested'} role. If salary/fee data fits within budget, mention the financial fit.
Make it feel like a personalized proposal written specifically for ${targetClub}'s sporting director, not a generic scouting report.`
          : '';
        const prompt = `${promptTemplate.replace('{outputLang}', outputLang)}${clubContext}

Player profile (ONLY use data below — never invent):
${playerContext}`;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.4, topP: 0.9 },
        });
        const result = await model.generateContent(prompt);
        scoutReport = result.response.text()?.trim() || '';
      } catch (e) {
        console.error('[share] Gemini scout report failed, using template:', e);
      }
    }

    if (!scoutReport) {
      if (isYouth) {
        scoutReport = buildYouthTemplateScoutReport(player, ifaProfile ?? {}, langKey);
      } else {
        scoutReport = buildTemplateScoutReport(player, scoutData, langKey);
      }
    }

    return NextResponse.json({ scoutReport });
  } catch (e) {
    console.error('[share] Scout report generation failed:', e);
    return NextResponse.json({ scoutReport: '' });
  }
}
