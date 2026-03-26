import { NextResponse } from 'next/server';
import type { PortfolioEnrichment, SeasonStatsData } from '@/app/p/[token]/types';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { player, scoutReport, platform, lang } = body;

    if (!player) {
      return NextResponse.json({ error: 'player required' }, { status: 400 });
    }

    const enrichment = await generateEnrichment(player, scoutReport, platform, lang);
    return NextResponse.json({ enrichment });
  } catch (err) {
    console.error('Enrich portfolio error:', err);
    return NextResponse.json({ error: 'Failed to generate enrichment' }, { status: 500 });
  }
}

/* ── Real data interfaces ── */

interface PmCareerSeason {
  season: string;
  club: string;
  games: number | null;
  goals: number | null;
  assists: number | null;
  isLoan: boolean;
}

interface PmMatchRating {
  date: string;
  rating?: number;
  minutes?: string;
}

interface PmData {
  found: boolean;
  careerTotals?: { games: number; goals: number; assists: number; goalsPerGame: number; starts: number };
  careerSeasons?: PmCareerSeason[];
  matchRatings?: PmMatchRating[];
  averageRating?: number | null;
  preferredFoot?: string | null;
  nationalTeam?: { country: string | null; caps: number; goals: number };
}

interface ScoutProfile {
  fbref_matched?: boolean;
  fbref_goals_per90?: number;
  fbref_assists_per90?: number;
  fbref_tackles_per90?: number;
  fbref_interceptions_per90?: number;
  fbref_minutes_90s?: number;
  player_style?: string;
  [key: string]: unknown;
}

interface FmData {
  ca?: number;
  pa?: number;
  dimension_scores?: { overall?: number; attacking?: number; defending?: number; passing?: number; physical?: number };
  top_attributes?: { name: string; value: number }[];
  position_fit?: Record<string, number>;
  tier?: string;
}

/* ── Fetch REAL data from sources ── */

async function fetchPmStats(
  playerName: string,
  age?: string,
  club?: string,
): Promise<PmData | null> {
  try {
    const params = new URLSearchParams({ name: playerName });
    if (age) params.set('age', age);
    if (club) params.set('club', club);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
    const res = await fetch(
      `${baseUrl}/api/playmakerstats/player?${params.toString()}`,
      { cache: 'no-store', signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.found ? data : null;
  } catch {
    return null;
  }
}

async function fetchScoutData(
  tmProfile: string,
  playerName: string,
  lang: string,
  club?: string,
  age?: string,
): Promise<{ profile: ScoutProfile | null; fm: FmData | null }> {
  const fmParams = new URLSearchParams({ player_name: playerName, _t: String(Date.now()) });
  if (club) fmParams.set('club', club);
  if (age) fmParams.set('age', age);

  const [similarRes, fmRes] = await Promise.all([
    fetch(`${getScoutBaseUrl()}/similar_players?player_url=${encodeURIComponent(tmProfile)}&lang=${lang}&limit=1`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${getScoutBaseUrl()}/fm_intelligence?${fmParams.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const profile = (similarRes?.player_profile ?? null) as ScoutProfile | null;
  const fm = fmRes && !fmRes.error ? (fmRes as FmData) : null;

  return { profile, fm };
}

/* ── Build real season stats ── */

function buildSeasonStats(pm: PmData | null, profile: ScoutProfile | null): SeasonStatsData | null {
  if (pm?.careerSeasons?.length) {
    // Get the latest season label
    const latestSeason = pm.careerSeasons[pm.careerSeasons.length - 1].season;

    // Aggregate ALL entries for the same season (league + cup + etc.)
    let totalGames = 0;
    let totalGoals = 0;
    let totalAssists = 0;
    let hasAnyGames = false;
    for (const entry of pm.careerSeasons) {
      if (entry.season === latestSeason) {
        if (entry.games != null) { totalGames += entry.games; hasAnyGames = true; }
        if (entry.goals != null) totalGoals += entry.goals;
        if (entry.assists != null) totalAssists += entry.assists;
      }
    }

    // Calculate minutes from matchRatings (covers all competitions)
    let totalMinutes: number | undefined;
    if (pm.matchRatings?.length) {
      totalMinutes = 0;
      for (const m of pm.matchRatings) {
        if (m.minutes) {
          const mins = parseInt(m.minutes.replace(/[^0-9]/g, ''), 10);
          if (!isNaN(mins)) totalMinutes += mins;
        }
      }
      if (totalMinutes === 0) totalMinutes = undefined;
    }

    let keyStatLabel: string | undefined;
    let keyStatLabelHe: string | undefined;
    let keyStatValue: number | undefined;

    if (profile?.fbref_matched) {
      if (profile.fbref_goals_per90 != null && profile.fbref_goals_per90 > 0.2) {
        keyStatLabel = 'Goals/90';
        keyStatLabelHe = 'שערים ל-90 דקות';
        keyStatValue = Math.round(profile.fbref_goals_per90 * 100) / 100;
      } else if (profile.fbref_assists_per90 != null && profile.fbref_assists_per90 > 0.1) {
        keyStatLabel = 'Assists/90';
        keyStatLabelHe = 'בישולים ל-90 דקות';
        keyStatValue = Math.round(profile.fbref_assists_per90 * 100) / 100;
      } else if (profile.fbref_tackles_per90 != null) {
        keyStatLabel = 'Tackles/90';
        keyStatLabelHe = 'חטיפות ל-90 דקות';
        keyStatValue = Math.round(profile.fbref_tackles_per90 * 100) / 100;
      }
    }

    if (!keyStatLabel && pm.averageRating) {
      keyStatLabel = 'Avg Rating';
      keyStatLabelHe = 'דירוג ממוצע';
      keyStatValue = Math.round(pm.averageRating * 10) / 10;
    }

    return {
      season: latestSeason || '2024/25',
      goals: totalGoals,
      assists: totalAssists,
      appearances: hasAnyGames ? totalGames : undefined,
      minutes: totalMinutes,
      keyStatLabel,
      keyStatLabelHe,
      keyStatValue,
    };
  }

  if (profile?.fbref_matched && profile.fbref_minutes_90s) {
    const totalMins = Math.round(Number(profile.fbref_minutes_90s) * 90);
    return {
      season: '2024/25',
      minutes: totalMins > 0 ? totalMins : undefined,
      keyStatLabel: profile.fbref_goals_per90 != null ? 'Goals/90' : undefined,
      keyStatLabelHe: profile.fbref_goals_per90 != null ? 'שערים ל-90 דקות' : undefined,
      keyStatValue: profile.fbref_goals_per90 != null ? Math.round(Number(profile.fbref_goals_per90) * 100) / 100 : undefined,
    };
  }

  return null;
}

/* ── Build radar attributes from FM data ── */

function buildRadarFromFM(fm: FmData | null) {
  if (!fm?.dimension_scores) return null;

  const dims = fm.dimension_scores;
  const scale = (v: number | undefined, fallback: number) => {
    if (v == null) return fallback;
    return clamp(v, 10, 99);
  };

  return [
    { name: 'Pace', nameHe: 'מהירות', value: scale(dims.physical, 60) },
    { name: 'Technique', nameHe: 'טכניקה', value: scale(dims.overall, 65) },
    { name: 'Passing', nameHe: 'מסירות', value: scale(dims.passing, 60) },
    { name: 'Defending', nameHe: 'הגנה', value: scale(dims.defending, 50) },
    { name: 'Aerial', nameHe: 'משחק אווירי', value: clamp(Math.round(((dims.physical ?? 60) + (dims.defending ?? 50)) / 2), 10, 99) },
    { name: 'Work Rate', nameHe: 'קצב עבודה', value: clamp(Math.round(((dims.physical ?? 60) + (dims.overall ?? 60)) / 2), 10, 99) },
  ];
}

/* ── Build AI score from FM + FBref ── */

function buildAIScore(fm: FmData | null, player: Record<string, unknown>) {
  const age = parseInt((player.age || '25') as string) || 25;

  if (fm?.ca) {
    const overall = clamp(Math.round(fm.ca / 2), 30, 95);
    const dims = fm.dimension_scores;
    const potential = fm.pa ? clamp(Math.round(fm.pa / 2), 30, 99) : (age <= 24 ? overall + 8 : overall + 2);

    const tierBonus: Record<string, number> = { world_class: 50, elite: 60, top_league: 70, solid_pro: 80, lower_league: 85, prospect: 90 };
    const valueDeal = clamp(tierBonus[fm.tier ?? 'solid_pro'] ?? 75, 30, 95);

    return {
      overall,
      categories: [
        { name: 'Technical', nameHe: 'טכני', value: clamp(dims?.overall ?? overall, 30, 95) },
        { name: 'Physical', nameHe: 'פיזי', value: clamp(dims?.physical ?? overall - 3, 30, 95) },
        { name: 'Tactical IQ', nameHe: 'חוש טקטי', value: clamp(dims?.passing ?? overall, 30, 95) },
        { name: 'Consistency', nameHe: 'עקביות', value: clamp(overall - 2, 30, 95) },
        { name: 'Potential', nameHe: 'פוטנציאל', value: clamp(potential, 30, 99) },
        { name: 'Value Deal', nameHe: 'עסקה משתלמת', value: valueDeal },
      ],
    };
  }

  return null;
}

/* ── Gemini: qualitative selling points only ── */

async function generateSellingPoints(
  apiKey: string,
  player: Record<string, unknown>,
  scoutReport: string | undefined,
  pm: PmData | null,
  profile: ScoutProfile | null,
  fm: FmData | null,
) {
  const name = (player.fullName || player.fullNameHe || 'Player') as string;
  const age = (player.age || '?') as string;
  const positions = ((player.positions as string[]) || []).join(', ');
  const club = ((player.currentClub as Record<string, string>)?.clubName || '?');
  const value = (player.marketValue || '?') as string;
  const nationality = (player.nationality || '?') as string;
  const contract = (player.contractExpired || '?') as string;

  const facts: string[] = [`Name: ${name}`, `Age: ${age}`, `Position: ${positions}`, `Club: ${club}`, `Value: ${value}`, `Nationality: ${nationality}`, `Contract: ${contract}`];

  if (pm?.careerSeasons?.length) {
    const latest = pm.careerSeasons[pm.careerSeasons.length - 1];
    facts.push(`Current season (${latest.season}): ${latest.games ?? '?'} games, ${latest.goals ?? '?'} goals, ${latest.assists ?? '?'} assists at ${latest.club}`);
  }
  if (pm?.careerTotals) {
    facts.push(`Career totals: ${pm.careerTotals.games} games, ${pm.careerTotals.goals} goals, ${pm.careerTotals.assists} assists`);
  }
  if (pm?.averageRating) {
    facts.push(`Average match rating: ${pm.averageRating.toFixed(1)}/10`);
  }
  if (pm?.nationalTeam?.caps) {
    facts.push(`National team: ${pm.nationalTeam.country} — ${pm.nationalTeam.caps} caps, ${pm.nationalTeam.goals} goals`);
  }
  if (profile?.fbref_matched) {
    if (profile.fbref_goals_per90 != null) facts.push(`FBref Goals/90: ${profile.fbref_goals_per90}`);
    if (profile.fbref_assists_per90 != null) facts.push(`FBref Assists/90: ${profile.fbref_assists_per90}`);
    if (profile.fbref_tackles_per90 != null) facts.push(`FBref Tackles/90: ${profile.fbref_tackles_per90}`);
    if (profile.player_style) facts.push(`Playing style: ${profile.player_style}`);
  }
  if (fm?.ca) {
    facts.push(`FM Current Ability: ${fm.ca}/200, Potential: ${fm.pa}/200, Tier: ${fm.tier}`);
    if (fm.top_attributes?.length) {
      facts.push(`Top attributes: ${fm.top_attributes.slice(0, 5).map((a) => `${a.name}(${a.value})`).join(', ')}`);
    }
  }

  const prompt = `You are a football agent writing SHORT, persuasive selling points for a player profile being sent to club scouts.

FACTUAL DATA (use ONLY these facts, do NOT invent stats):
${facts.join('\n')}

SCOUT REPORT:
${scoutReport || 'Not available.'}

Generate exactly 3-4 selling points as JSON array. Each selling point has:
- "icon": single relevant emoji
- "title": 3-5 word English title
- "titleHe": Hebrew translation
- "description": 1-2 English sentences — agent pitch based on FACTS above
- "descriptionHe": Hebrew translation

RULES:
- Reference REAL numbers from the data above (goals, assists, appearances, ratings)
- NEVER invent statistics that aren't in the data
- Focus on: value-for-money, proven performance, tactical versatility, development upside, passport/nationality advantages
- Hebrew must be proper modern Hebrew
- Return ONLY valid JSON array, no markdown fences`;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('Gemini selling points failed:', err);
    return null;
  }
}

/* ── Main orchestrator ── */

async function generateEnrichment(
  player: Record<string, unknown>,
  scoutReport: string | undefined,
  platform: string | undefined,
  lang: string | undefined,
): Promise<PortfolioEnrichment> {
  const name = (player.fullName || player.fullNameHe || '') as string;
  const age = (player.age || '') as string;
  const club = ((player.currentClub as Record<string, string>)?.clubName || '') as string;
  const tmProfile = (player.tmProfile || '') as string;
  const langStr = lang || 'en';

  // Fetch real data in parallel
  const [pm, scoutResult] = await Promise.all([
    fetchPmStats(name, age, club),
    tmProfile ? fetchScoutData(tmProfile, name, langStr, club, age) : Promise.resolve({ profile: null, fm: null }),
  ]);

  const { profile, fm } = scoutResult;

  // Build enrichment from REAL data
  const seasonStats = buildSeasonStats(pm, profile);
  const radarAttributes = buildRadarFromFM(fm);
  const aiScore = buildAIScore(fm, player);

  // Only use Gemini for qualitative selling points
  const apiKey = process.env.GEMINI_API_KEY;
  const sellingPoints = apiKey
    ? await generateSellingPoints(apiKey, player, scoutReport, pm, profile, fm)
    : null;

  const enrichment: PortfolioEnrichment = {};
  if (seasonStats) enrichment.seasonStats = seasonStats;
  if (aiScore) enrichment.aiScore = aiScore;
  if (radarAttributes) enrichment.radarAttributes = radarAttributes;
  if (sellingPoints) enrichment.sellingPoints = sellingPoints;

  return enrichment;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
