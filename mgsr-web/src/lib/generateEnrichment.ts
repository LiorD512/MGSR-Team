/**
 * Shared enrichment generation logic.
 * Used by both share/create (pre-generation) and share/enrich-portfolio (fallback).
 */
import type { PortfolioEnrichment } from '@/app/p/[token]/types';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

/* ── Real data interfaces ── */

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

/* ── Gemini: generate full dossier content in one call ── */

async function generateDossierContent(
  apiKey: string,
  player: Record<string, unknown>,
  scoutReport: string | undefined,
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

  const prompt = `You are a professional football agent creating a HIGH-CONVERSION scouting dossier for a player being presented to club sporting directors and scouts.

FACTUAL DATA (use ONLY these facts, do NOT invent stats):
${facts.join('\n')}

SCOUT REPORT:
${scoutReport || 'Not available.'}

Generate a JSON object with ALL of these fields:

1. "hookLine": One punchy sentence (max 15 words) that captures the player's essence as a transfer target. Like a headline. Example: "Explosive Nigerian striker with European experience — strong, fast, and ready to deliver."
2. "hookLineHe": Hebrew translation of hookLine.

3. "clubSummary": Array of exactly 5 short bullet strings — "Why Clubs Like Him" — each 5-12 words. Focus on what makes him attractive to a buying club. Be direct and persuasive.
4. "clubSummaryHe": Hebrew translations array (same order).

5. "keyTraits": Array of exactly 6 short trait phrases (2-4 words each) — scannable key strengths. Examples: "Pace & power", "Finishing under pressure", "Aerial dominance". Pick traits that match the player's real profile.
6. "keyTraitsHe": Hebrew translations array (same order).

7. "tacticalFit": Object with:
   - "systems": Array of 2-3 formation strings (e.g. "4-3-3", "4-2-3-1")
   - "role": English role name (e.g. "Target Forward / Pressing Forward")
   - "roleHe": Hebrew translation
   - "description": 1-2 English sentences about tactical fit and what type of team he suits
   - "descriptionHe": Hebrew translation

8. "sellingPoints": Array of exactly 3 selling points, each with:
   - "icon": single emoji
   - "title": 3-5 word English title
   - "titleHe": Hebrew translation
   - "description": 1-2 English sentences — agent pitch based on FACTS
   - "descriptionHe": Hebrew translation

RULES:
- Reference REAL data from the facts above
- NEVER invent statistics that aren't in the data
- Be persuasive and direct — this is a sales document, not an academic report
- Hebrew must be proper modern Hebrew (not transliteration)
- Return ONLY valid JSON object, no markdown fences`;

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(text);
  } catch (err) {
    console.error('Gemini dossier content failed:', err);
    return null;
  }
}

/* ── Main orchestrator (exported for reuse) ── */

export async function generateEnrichment(
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

  // Fetch scout server data (FM intelligence + FBref via similar_players)
  const { profile, fm } = tmProfile
    ? await fetchScoutData(tmProfile, name, langStr, club, age)
    : { profile: null, fm: null };

  // Build enrichment from REAL data
  const radarAttributes = buildRadarFromFM(fm);
  const aiScore = buildAIScore(fm, player);

  // Only use Gemini for qualitative dossier content
  const apiKey = process.env.GEMINI_API_KEY;
  const dossier = apiKey
    ? await generateDossierContent(apiKey, player, scoutReport, profile, fm)
    : null;

  const enrichment: PortfolioEnrichment = {};
  if (aiScore) enrichment.aiScore = aiScore;
  if (radarAttributes) enrichment.radarAttributes = radarAttributes;
  if (dossier?.sellingPoints) enrichment.sellingPoints = dossier.sellingPoints;
  if (dossier?.hookLine) enrichment.hookLine = dossier.hookLine;
  if (dossier?.hookLineHe) enrichment.hookLineHe = dossier.hookLineHe;
  if (dossier?.clubSummary) enrichment.clubSummary = dossier.clubSummary;
  if (dossier?.clubSummaryHe) enrichment.clubSummaryHe = dossier.clubSummaryHe;
  if (dossier?.keyTraits) enrichment.keyTraits = dossier.keyTraits;
  if (dossier?.keyTraitsHe) enrichment.keyTraitsHe = dossier.keyTraitsHe;
  if (dossier?.tacticalFit) enrichment.tacticalFit = dossier.tacticalFit;

  return enrichment;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
