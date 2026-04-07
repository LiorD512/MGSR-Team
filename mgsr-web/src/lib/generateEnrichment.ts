/**
 * Shared enrichment generation logic.
 * Used by both share/create (pre-generation) and share/enrich-portfolio (fallback).
 */
import type { PortfolioEnrichment } from '@/app/p/[token]/types';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

function getSelfBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const u = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    return u.startsWith('http') ? u : `https://${u}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/* ── Real data interfaces ── */

interface ScoutProfile {
  api_matched?: boolean;
  api_goals_per90?: number;
  api_assists_per90?: number;
  api_tackles_per90?: number;
  api_interceptions_per90?: number;
  api_minutes_90s?: number;
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
  let fm = fmRes && !fmRes.error ? (fmRes as FmData) : null;

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
      if (fmiRes && !fmiRes.error && fmiRes.ca > 0) {
        fm = fmiRes as FmData;
      }
    } catch { /* non-critical */ }
  }

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

  if (profile?.api_matched) {
    if (profile.api_goals_per90 != null) facts.push(`Goals/90: ${profile.api_goals_per90}`);
    if (profile.api_assists_per90 != null) facts.push(`Assists/90: ${profile.api_assists_per90}`);
    if (profile.api_tackles_per90 != null) facts.push(`Tackles/90: ${profile.api_tackles_per90}`);
    if (profile.player_style) facts.push(`Playing style: ${profile.player_style}`);
  }
  if (fm?.ca) {
    // Only use FM best position — do NOT expose raw FM numbers (CA, PA, tier, attributes)
    if (fm.position_fit) {
      const fits = Object.entries(fm.position_fit as Record<string, number>)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([pos]) => pos);
      if (fits.length) facts.push(`Strongest positions: ${fits.join(', ')}`);
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
- NEVER reference FM (Football Manager) data: no CA, PA, tier names, attribute scores, or any game data as numbers
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

  // Fetch scout server data (FM intelligence + API via similar_players)
  const { profile, fm } = tmProfile
    ? await fetchScoutData(tmProfile, name, langStr, club, age)
    : { profile: null, fm: null };

  // AI score and radar are no longer generated — they were based on FM game data
  // which produces misleading scores for real scouting contexts

  // Only use Gemini for qualitative dossier content
  const apiKey = process.env.GEMINI_API_KEY;
  const dossier = apiKey
    ? await generateDossierContent(apiKey, player, scoutReport, profile, fm)
    : null;

  const enrichment: PortfolioEnrichment = {};
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
