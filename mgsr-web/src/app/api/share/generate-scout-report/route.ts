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

function getSelfBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const u = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return u.startsWith('http') ? u : `https://${u}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

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
  let fm = fmRes && !fmRes.error ? fmRes : null;

  // Fallback: direct FMInside scrape when scout server has no FM data
  if (!fm || !fm.ca) {
    try {
      const fmiParams = new URLSearchParams({ player_name: playerName });
      if (club) fmiParams.set('club', club);
      if (age) fmiParams.set('age', age);
      const fmiRes = await fetch(`${getSelfBaseUrl()}/api/fminside/player?${fmiParams.toString()}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (fmiRes && !fmiRes.error && fmiRes.ca > 0) fm = fmiRes;
    } catch { /* non-critical */ }
  }

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

  if (scoutData?.profile && scoutData.profile.api_matched) {
    const p = scoutData.profile;
    const mins = p.api_minutes_90s != null ? `${Number(p.api_minutes_90s) * 90} minutes` : null;
    if (mins) parts.push(`Minutes (365d): ${mins}`);
    if (p.api_rating != null) parts.push(`API-Football Rating: ${p.api_rating}`);
    if (p.api_goals_per90 != null) parts.push(`Goals/90: ${p.api_goals_per90}`);
    if (p.api_assists_per90 != null) parts.push(`Assists/90: ${p.api_assists_per90}`);
    if (p.api_tackles_per90 != null) parts.push(`Tackles/90: ${p.api_tackles_per90}`);
    if (p.api_interceptions_per90 != null) parts.push(`Interceptions/90: ${p.api_interceptions_per90}`);
    if (p.api_key_passes_per90 != null) parts.push(`Key passes/90: ${p.api_key_passes_per90}`);
    if (p.api_dribbles_success_per90 != null) parts.push(`Dribbles/90: ${p.api_dribbles_success_per90}`);
    if (p.api_shots_per90 != null) parts.push(`Shots/90: ${p.api_shots_per90}`);
    if (p.api_duels_won_pct != null) parts.push(`Duels won: ${p.api_duels_won_pct}%`);
    if (p.api_passes_accuracy != null) parts.push(`Pass accuracy: ${p.api_passes_accuracy}%`);
    if (p.player_style) parts.push(`Playing style: ${p.player_style}`);
  }
  if (scoutData?.fm && !scoutData.fm.error) {
    const f = scoutData.fm;
    // Only pass best position and playing style descriptions — no raw FM numbers, CA/PA, tier, or attribute scores
    if (f.best_position) {
      const bp = f.best_position as { position?: string };
      if (bp.position) parts.push(`Strongest position: ${bp.position}`);
    }
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

/** Template-based scout report when Gemini fails. One paragraph, no sections. */
function buildTemplateScoutReport(
  player: PlayerPayload,
  scoutData: ScoutData | undefined,
  lang: 'he' | 'en'
): string {
  const isHe = lang === 'he';
  const name = (isHe ? player.fullNameHe || player.fullName : player.fullName || player.fullNameHe) || '—';
  const pos = player.positions?.filter(Boolean).join(', ') || '—';
  const club = player.currentClub?.clubName || '—';
  const nat = player.nationality || '—';
  const age = player.age || '—';
  const height = player.height || '';

  const parts: string[] = [];
  parts.push(`${name}, ${age}${isHe ? ' שנים' : 'yo'} ${pos} ${isHe ? 'מ' : 'from'} ${club} (${nat}).`);
  if (height) parts.push(`${isHe ? 'גובה' : 'Height'}: ${height}.`);

  const profile = scoutData?.profile;
  if (profile && profile.api_matched) {
    const statParts: string[] = [];
    if (profile.api_goals_per90 != null) statParts.push(`${profile.api_goals_per90} ${isHe ? 'שערים/90' : 'goals/90'}`);
    if (profile.api_assists_per90 != null) statParts.push(`${profile.api_assists_per90} ${isHe ? 'בישולים/90' : 'assists/90'}`);
    if (profile.api_tackles_per90 != null) statParts.push(`${profile.api_tackles_per90} ${isHe ? 'טאקלים/90' : 'tackles/90'}`);
    if (profile.api_key_passes_per90 != null) statParts.push(`${profile.api_key_passes_per90} ${isHe ? 'מסירות מפתח/90' : 'key passes/90'}`);
    if (statParts.length) parts.push(statParts.join(', ') + '.');
    if (profile.player_style) parts.push(`${isHe ? 'סגנון משחק' : 'Playing style'}: ${profile.player_style}.`);
  }

  return parts.join(' ');
}

/** Youth-specific template when no Transfermarkt/FM data — one paragraph using IFA stats */
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

  const parts: string[] = [];
  parts.push(`${name}, ${ageGroup}, ${pos} ${isHe ? 'מ' : 'from'} ${club} (${nat}).`);

  if (stats) {
    const statParts: string[] = [];
    if (stats.matches != null) statParts.push(`${stats.matches} ${isHe ? 'משחקים' : 'matches'}`);
    if (stats.goals != null) statParts.push(`${stats.goals} ${isHe ? 'שערים' : 'goals'}`);
    if (stats.assists != null) statParts.push(`${stats.assists} ${isHe ? 'בישולים' : 'assists'}`);
    if (statParts.length) parts.push(statParts.join(', ') + '.');
  }

  parts.push(isHe ? 'שחקן נוער מבטיח עם פוטנציאל להתפתחות.' : 'Promising youth player with development potential.');

  return parts.join(' ');
}

function getScoutReportPrompt(outputLang: string): string {
  return `You are a professional football scout. Write a SHORT player introduction — one paragraph only (3-5 sentences max).

INCLUDE:
- Who the player is (name, age, nationality)
- Where he plays (club, position)
- His key strengths (be specific, cite stats if available)
- Notable statistics if available in the profile

RULES:
- Do NOT use any section headers (no ##, no bold headers)
- Do NOT use ** for bold or * for italic — write plain text only
- Do NOT mention market value, transfer fees, or price
- Do NOT mention league-specific fit or name specific leagues
- Do NOT add "Key Strengths" or "Tactical Fit" sections
- Do NOT invent stats or facts not in the profile
- Do NOT reference FM (Football Manager) data
- Keep it professional, direct, and factual — one paragraph
- ~60-100 words total
- Write in ${outputLang}

Use ONLY data from the profile below. Never invent stats.`;
}

const YOUTH_SCOUT_PROMPT = `You are a professional football scout. Write a SHORT player introduction for a youth player — one paragraph only (3-5 sentences max). Use IFA (Israel Football Association) data.

INCLUDE: Who the player is (name, age group, nationality), where he plays (club, position), key stats if available (matches, goals, assists).

RULES:
- Do NOT use section headers, bold, or markdown formatting
- Do NOT mention market value or transfer fees
- Keep it professional and factual — one paragraph
- ~60-100 words
- Write in {outputLang}
- Use ONLY data from the profile below. Never invent stats.`;

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
        const isHe = langKey === 'he';
        const playerContext = isYouth
          ? buildIFAPlayerContext(player, ifaProfile ?? {})
          : buildPlayerContext(player, scoutData);

        const promptTemplate = isYouth
          ? YOUTH_SCOUT_PROMPT.replace('{outputLang}', outputLang)
          : getScoutReportPrompt(outputLang);
        const clubContext = targetClub
          ? `\n\nCLUB-SPECIFIC BRIEF — This report is for ${targetClub}.
The club is searching for:
${targetClubRequest?.position ? `- Position: ${targetClubRequest.position}` : ''}
${targetClubRequest?.dominateFoot ? `- Preferred foot: ${targetClubRequest.dominateFoot}` : ''}

Keep it as one paragraph. Mention why this player fits ${targetClub}'s needs based on position and profile. Do NOT mention market value, transfer fees, or salary budgets.`
          : '';
        const prompt = `${promptTemplate}${clubContext}

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
