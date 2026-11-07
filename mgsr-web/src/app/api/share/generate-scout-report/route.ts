/**
 * POST /api/share/generate-scout-report
 * Builds a short template scout report for sharing with clubs. No AI.
 * Men/Women: player profile + scout-server stats (similar_players, FM intelligence).
 * Youth: IFA (football.org.il) profile and stats when ifaUrl provided.
 */
import { NextRequest, NextResponse } from 'next/server';
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

/** Template-based scout report. One paragraph, no sections. */
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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { player: PlayerPayload; lang?: string; platform?: string; targetClub?: string; targetClubRequest?: { position?: string; salaryRange?: string; transferFee?: string; dominateFoot?: string } };
    // targetClub / targetClubRequest are still accepted for backward compatibility but unused (no AI).
    const { player, lang = 'en', platform } = body;
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

    const scoutReport = isYouth
      ? buildYouthTemplateScoutReport(player, ifaProfile ?? {}, langKey)
      : buildTemplateScoutReport(player, scoutData, langKey);

    return NextResponse.json({ scoutReport });
  } catch (e) {
    console.error('[share] Scout report generation failed:', e);
    return NextResponse.json({ scoutReport: '' });
  }
}
