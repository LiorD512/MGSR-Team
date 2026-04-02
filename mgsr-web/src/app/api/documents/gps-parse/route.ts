/**
 * GPS PDF parsing API - extracts player data from Catapult GPS reports via Gemini.
 * Matches Android GpsPdfParser logic.
 */
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
// Use 2.5-flash with capped thinking budget for GPS parsing
const GEMINI_MODEL = 'gemini-2.5-flash';

const GPS_PROMPT = `You are analyzing a football/soccer GPS or physical performance match report.

This may be a Catapult Sports report, a STATSports report, a club-specific report, or a VISUAL CHART/GRAPH showing player performance data.

DATA SOURCES — extract from ANY of these:
1. TABLES with columns (Total Dist, Sprint Dist, Max Speed, etc.)
2. BAR CHARTS showing per-player distance with speed zone breakdowns (Walk, Jog, Run, High Speed Run, Sprint)
3. ANNOTATED CHARTS where exact values are written above/beside bars
4. Team comparison charts showing multiple players' metrics side by side
5. Any other visual format showing player physical performance data

For CHARTS: read the annotated numbers (e.g. "11374" above a bar). If no exact numbers, estimate from the Y-axis scale. The speed zone colors in charts map to: Walk = lowest speed, Jog, Run, High Speed Run, Sprint = highest speed.

For bar charts with speed zone breakdowns, map the data as follows:
- Total bar height / annotated total → totalDistance
- Sprint zone (highest speed, often red) → sprintDistTotal
- High Speed Run zone → hiDistTotal / highMpEffsDist
- If an "AVG" value is shown → use it for teamAverageTotalDist
- matchTitle: derive from team names (e.g. "FCSB vs UTA Arad")

Extract ALL player data. Different report formats may have different column names — map them to the standardized output fields below.

Common column mappings:
- "Tot Dur" / "Time (min)" / "Minutes" → totalDuration
- "Tot Dist" / "Total Dist" / "Total Distance" → totalDistance (in meters)
- "High MP Effs Dist" / "High Intensity Dist" → highMpEffsDist
- "High MP Effs" / "High Intensity" → highMpEffs
- "Meterage Per Minute" → meteragePerMinute (compute as totalDistance/totalDuration if not present)
- "Acc #" / "Accelerations" → accelerations
- "Decel #" / "Decelerations" → decelerations
- "High Intensity Runs" → highIntensityRuns
- "Sprints Over 25 kph" / "Sprint Dist" / "Sprints" → sprints (count) / sprintDistTotal = "Sprint Distance" (distance in meters)
- "Max Vel" / "Max Speed" / "Top Speed" → maxVelocity (in km/h)
- "Distance Per Min" / "Distance Per Minute" → meteragePerMinute
- "High Speed Running" / "High Speed Running (Absolute)" → highMpEffsDist
- "Distance Zone 4" + "Distance Zone 5" + "Distance Zone 6" → combine as hiDistTotal (or use "Distance Zone 4 - Zone 6")
- "Dynamic Stress Load" → ignore (not mapped)

Stars (★) next to values mean the player was BEST on the team for that metric.

Also extract:
- matchTitle: The match title from header (e.g. "MNFC VS ASHDOD")
- matchDate: The date from header in DD/MM/YYYY format. If multiple dates, use the most recent.
- teamName: The team or club name
- teamAverageTotalDist: From "Average" row total distance (0 if not available)
- teamAverageMeteragePerMin: From "Average" row meterage per minute (0 if not available)
- teamAverageHighIntensityRuns: From "Average" row high intensity runs (0 if not available)
- teamAverageSprints: From "Average" row sprints (0 if not available)
- teamAverageMaxVelocity: From "Average" row max velocity (0 if not available)

If the report has multiple matches per player (one row per match date), treat EACH ROW as a separate player entry with the same playerName but different dates. Use the row date as matchDate for each.

For EACH player/row return:
{
  "playerName": "Full Name",
  "totalDuration": 101,
  "totalDistance": 12160,
  "highMpEffsDist": 856,
  "highMpEffs": 205,
  "meteragePerMinute": 121,
  "accelerations": 82,
  "decelerations": 93,
  "highIntensityRuns": 30,
  "sprints": 4,
  "maxVelocity": 29.1,
  "adEffs": 175,
  "hiDistTotal": 412,
  "hiDistPercent": 3,
  "sprintDistTotal": 92,
  "sprintDistPercent": 1,
  "isStarTotalDist": false,
  "isStarHighMpEffsDist": false,
  "isStarHighMpEffs": false,
  "isStarMeteragePerMin": false,
  "isStarAccelerations": false,
  "isStarHighIntensityRuns": false,
  "isStarSprints": false,
  "isStarMaxVelocity": false,
  "matchDate": "17/08/2025"
}

If the report has only one match date for all players, omit the per-player matchDate field.
Set any field to 0 or false if the data is not available in the report.

Return ONLY a JSON object:
{
  "matchTitle": "MNFC VS ASHDOD",
  "matchDate": "03/12/2025",
  "teamName": "MACCABI NETANYA FC",
  "teamAverageTotalDist": 7285,
  "teamAverageMeteragePerMin": 107,
  "teamAverageHighIntensityRuns": 32,
  "teamAverageSprints": 8,
  "teamAverageMaxVelocity": 29.8,
  "players": [...]
}

IMPORTANT: Include ALL players/rows from the report (or all players visible in the chart). Use integer values for distances and counts. Use decimal for velocities and percentages.
Return ONLY valid JSON. No markdown, no explanation.`;

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

interface GpsPlayerRow {
  playerName: string;
  totalDuration: number;
  totalDistance: number;
  highMpEffsDist: number;
  highMpEffs: number;
  meteragePerMinute: number;
  accelerations: number;
  decelerations: number;
  highIntensityRuns: number;
  sprints: number;
  maxVelocity: number;
  adEffs: number;
  hiDistTotal: number;
  hiDistPercent: number;
  sprintDistTotal: number;
  sprintDistPercent: number;
  isStarTotalDist: boolean;
  isStarHighMpEffsDist: boolean;
  isStarHighMpEffs: boolean;
  isStarMeteragePerMin: boolean;
  isStarAccelerations: boolean;
  isStarHighIntensityRuns: boolean;
  isStarSprints: boolean;
  isStarMaxVelocity: boolean;
  /** Per-row match date for multi-match reports (DD/MM/YYYY) */
  matchDate?: string;
}

interface GpsReportResult {
  matchTitle: string;
  matchDate: string;
  teamName: string;
  teamAverageTotalDist: number;
  teamAverageMeteragePerMin: number;
  teamAverageHighIntensityRuns: number;
  teamAverageSprints: number;
  teamAverageMaxVelocity: number;
  players: GpsPlayerRow[];
}

/**
 * Filter out thinking parts from Gemini 2.5 Flash response.
 */
function extractNonThoughtText(response: unknown): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = response as any;
    const parts = r?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    const nonThought = parts
      .filter((p: { text?: string; thought?: boolean }) => typeof p.text === 'string' && !p.thought)
      .map((p: { text: string }) => p.text)
      .join('')
      .trim();
    return nonThought || parts
      .filter((p: { text?: string }) => typeof p.text === 'string')
      .map((p: { text: string }) => p.text)
      .join('')
      .trim();
  } catch {
    return '';
  }
}

/** Strip diacritical marks (accents) from a string — e.g. "Poulolö" → "poulolo" */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findPlayerRow(players: GpsPlayerRow[], playerName: string): GpsPlayerRow | undefined {
  const normalized = stripAccents(playerName.trim().toLowerCase());
  const nameParts = normalized.split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts[0];

  // Helper to normalize a chart player name (strip accents + lowercase)
  const norm = (s: string) => stripAccents(s.trim().toLowerCase());

  // 1. Last name match first — charts often show only last name
  if (lastName) {
    const lastNameMatch = players.find(p => {
      const pName = norm(p.playerName);
      const pParts = pName.split(/\s+/);
      return pName === lastName || pParts[pParts.length - 1] === lastName || pParts[0] === lastName;
    });
    if (lastNameMatch) return lastNameMatch;
  }
  // 2. Exact full name match
  const exact = players.find(p => norm(p.playerName) === normalized);
  if (exact) return exact;
  // 3. First name match (chart may show first name only, e.g. "Paulo" for "Paulo Henrique")
  if (firstName && firstName !== lastName) {
    const firstNameMatch = players.find(p => {
      const pName = norm(p.playerName);
      return pName === firstName || pName.split(/\s+/)[0] === firstName;
    });
    if (firstNameMatch) return firstNameMatch;
  }
  // 4. Any name part contains match (handles "Popescu37" matching "Popescu")
  for (const part of nameParts) {
    if (part.length < 3) continue;
    const partialMatch = players.find(p => {
      const pName = norm(p.playerName);
      return pName.includes(part) || part.includes(pName);
    });
    if (partialMatch) return partialMatch;
  }
  // 5. Fuzzy initial match — "F. Poulolo" or "F Poulolo" matching "Florent Poulolo"
  if (firstName.length > 0 && lastName.length > 0) {
    const initial = firstName[0];
    const fuzzyMatch = players.find(p => {
      const pName = norm(p.playerName);
      const pParts = pName.split(/[\s.]+/).filter(Boolean);
      // Check pattern: initial + last name (e.g. "f poulolo", "f. poulolo")
      if (pParts.length >= 2) {
        const pFirst = pParts[0];
        const pLast = pParts[pParts.length - 1];
        if (pFirst.length === 1 && pFirst === initial && pLast === lastName) return true;
        // Also check reversed: "poulolo f"
        if (pLast.length === 1 && pLast === initial && pFirst === lastName) return true;
      }
      return false;
    });
    if (fuzzyMatch) return fuzzyMatch;
  }
  return undefined;
}

/**
 * Find ALL matching player rows — handles multi-match reports where the same
 * player appears once per match date (e.g. Leixões SC individual reports).
 */
function findAllPlayerRows(players: GpsPlayerRow[], playerName: string): GpsPlayerRow[] {
  const first = findPlayerRow(players, playerName);
  if (!first) return [];
  // Get the matched name, then return ALL rows with that exact name
  const matchedName = stripAccents(first.playerName.trim().toLowerCase());
  const all = players.filter(p => stripAccents(p.playerName.trim().toLowerCase()) === matchedName);
  // If only one row matched by name, it's a single-match report — return just that
  return all.length > 0 ? all : [first];
}

function parseMatchDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const m = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (!m) return null;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), 12, 0, 0).getTime();
}

// ── Position-aware benchmarks (matches web GpsPerformancePanel) ──────────────
type PosGroup = 'cb' | 'fb' | 'cm' | 'winger' | 'fw' | 'default';
interface PosBenchmark {
  totalDistance: number; meteragePerMin: number; highIntensityRuns: number;
  sprints: number; maxVelocity: number; accelerations: number;
  label: string; labelHe: string;
}
const POS_BENCHMARKS: Record<PosGroup, PosBenchmark> = {
  cb:      { totalDistance: 9800,  meteragePerMin: 108, highIntensityRuns: 45, sprints: 12, maxVelocity: 30.0, accelerations: 70,  label: 'Centre-Back', labelHe: 'בלם' },
  fb:      { totalDistance: 10600, meteragePerMin: 117, highIntensityRuns: 60, sprints: 18, maxVelocity: 31.5, accelerations: 90,  label: 'Full-Back',   labelHe: 'מגן צד' },
  cm:      { totalDistance: 11000, meteragePerMin: 122, highIntensityRuns: 55, sprints: 12, maxVelocity: 30.0, accelerations: 85,  label: 'Midfielder',  labelHe: 'קשר' },
  winger:  { totalDistance: 10600, meteragePerMin: 117, highIntensityRuns: 65, sprints: 20, maxVelocity: 32.0, accelerations: 80,  label: 'Winger',      labelHe: 'כנף' },
  fw:      { totalDistance: 9900,  meteragePerMin: 110, highIntensityRuns: 50, sprints: 16, maxVelocity: 31.0, accelerations: 70,  label: 'Striker',     labelHe: 'חלוץ' },
  default: { totalDistance: 10400, meteragePerMin: 115, highIntensityRuns: 55, sprints: 15, maxVelocity: 31.0, accelerations: 80,  label: 'Pro Average', labelHe: 'ממוצע מקצועי' },
};
function detectPosGroup(position: string): PosGroup {
  const p = position.toLowerCase().replace(/[-_]/g, ' ');
  if (/centre.back|center.back|\bcb\b|stopper/i.test(p)) return 'cb';
  if (/left.back|right.back|full.back|wing.back|\blb\b|\brb\b|\blwb\b|\brwb\b/i.test(p)) return 'fb';
  if (/midfield|\bcm\b|\bcdm\b|\bcam\b|\bdm\b|\bam\b|central mid/i.test(p)) return 'cm';
  if (/winger|left.wing|right.wing|\blw\b|\brw\b|\blm\b|\brm\b|left.mid|right.mid/i.test(p)) return 'winger';
  if (/striker|forward|\bcf\b|\bst\b|centre.forward|center.forward|second.striker/i.test(p)) return 'fw';
  return 'default';
}
function fmtDist(m: number): string { return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`; }

interface StoredInsight {
  type: 'strength' | 'weakness';
  titleEn: string; titleHe: string;
  descriptionEn: string; descriptionHe: string;
  value: string; benchmark?: string;
}

function computeInsights(
  allMatches: Array<Record<string, unknown>>,
  position: string
): StoredInsight[] {
  interface M { totalDuration?: number; totalDistance?: number; meteragePerMinute?: number; highIntensityRuns?: number; sprints?: number; maxVelocity?: number; accelerations?: number; teamAverageTotalDist?: number; teamAverageSprints?: number; teamAverageMaxVelocity?: number; isStarTotalDist?: boolean; isStarHighMpEffsDist?: boolean; isStarHighMpEffs?: boolean; isStarMeteragePerMin?: boolean; isStarAccelerations?: boolean; isStarHighIntensityRuns?: boolean; isStarSprints?: boolean; isStarMaxVelocity?: boolean; }
  const matches = allMatches as M[];
  const significant = matches.filter(m => (m.totalDuration ?? 0) >= 45);
  const data = significant.length > 0 ? significant : matches;
  if (data.length === 0) return [];

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const posGroup = detectPosGroup(position);
  const bench = POS_BENCHMARKS[posGroup];
  const posEn = bench.label;
  const posHe = bench.labelHe;

  const avgMeterage = avg(data.map(m => (m.meteragePerMinute ?? 0) as number));
  const avgDist = avg(data.map(m => (m.totalDistance ?? 0) as number));
  const peakVel = Math.max(...data.map(m => (m.maxVelocity ?? 0) as number));
  const avgSprints = avg(data.map(m => (m.sprints ?? 0) as number));
  const avgHI = avg(data.map(m => (m.highIntensityRuns ?? 0) as number));
  const avgAcc = avg(data.map(m => (m.accelerations ?? 0) as number));
  const teamAvgDist = avg(data.map(m => (m.teamAverageTotalDist ?? 0) as number).filter(v => v > 0));
  const teamAvgSprints = avg(data.map(m => (m.teamAverageSprints ?? 0) as number).filter(v => v > 0));
  const teamAvgMaxVel = avg(data.map(m => (m.teamAverageMaxVelocity ?? 0) as number).filter(v => v > 0));
  const hasTeamData = teamAvgDist > 0;
  const starCount = matches.reduce((sum, m) => sum + [m.isStarTotalDist, m.isStarHighMpEffsDist, m.isStarHighMpEffs, m.isStarMeteragePerMin, m.isStarAccelerations, m.isStarHighIntensityRuns, m.isStarSprints, m.isStarMaxVelocity].filter(Boolean).length, 0);

  const insights: StoredInsight[] = [];

  // ── STRENGTHS ──
  if (avgMeterage >= bench.meteragePerMin)
    insights.push({ type: 'strength', titleEn: 'High Work Rate', titleHe: 'קצב עבודה גבוה',
      descriptionEn: `Covers ${Math.round(avgMeterage)} m/min on average — above the ${posEn} benchmark of ${bench.meteragePerMin} m/min`,
      descriptionHe: `מכסה ${Math.round(avgMeterage)} מ׳/דקה בממוצע — מעל הסטנדרט ל${posHe} של ${bench.meteragePerMin} מ׳/דקה`,
      value: `${Math.round(avgMeterage)} m/min`, benchmark: `${bench.meteragePerMin} (${posEn})` });
  if (avgDist >= bench.totalDistance)
    insights.push({ type: 'strength', titleEn: 'Elite Distance Coverage', titleHe: 'כיסוי מרחק עילית',
      descriptionEn: `Averages ${fmtDist(Math.round(avgDist))} total distance per match — exceeds the ${posEn} standard of ${fmtDist(bench.totalDistance)}`,
      descriptionHe: `ממוצע ${fmtDist(Math.round(avgDist))} מרחק כולל למשחק — מעל הסטנדרט ל${posHe} של ${fmtDist(bench.totalDistance)}`,
      value: fmtDist(Math.round(avgDist)), benchmark: `${fmtDist(bench.totalDistance)} (${posEn})` });
  if (peakVel >= bench.maxVelocity)
    insights.push({ type: 'strength', titleEn: 'Explosive Top Speed', titleHe: 'מהירות שיא נפיצה',
      descriptionEn: `Reached ${peakVel.toFixed(1)} km/h peak velocity — above the ${posEn} benchmark of ${bench.maxVelocity.toFixed(1)} km/h`,
      descriptionHe: `הגיע ל-${peakVel.toFixed(1)} קמ״ש מהירות שיא — מעל הסטנדרט ל${posHe} של ${bench.maxVelocity.toFixed(1)} קמ״ש`,
      value: `${peakVel.toFixed(1)} km/h`, benchmark: `${bench.maxVelocity.toFixed(1)} (${posEn})` });
  if (avgSprints >= bench.sprints)
    insights.push({ type: 'strength', titleEn: 'Strong Sprint Output', titleHe: 'תפוקת ספרינטים חזקה',
      descriptionEn: `Averages ${avgSprints.toFixed(1)} sprints (>25 km/h) per match — meets/exceeds the ${posEn} standard of ${bench.sprints}`,
      descriptionHe: `ממוצע ${avgSprints.toFixed(1)} ספרינטים (מעל 25 קמ״ש) למשחק — עומד/מעל הסטנדרט ל${posHe} של ${bench.sprints}`,
      value: `${avgSprints.toFixed(1)}`, benchmark: `${bench.sprints} (${posEn})` });
  if (avgHI >= bench.highIntensityRuns)
    insights.push({ type: 'strength', titleEn: 'High-Intensity Machine', titleHe: 'מכונת אינטנסיביות',
      descriptionEn: `Makes ${Math.round(avgHI)} high-intensity runs per match — above the ${posEn} benchmark of ${bench.highIntensityRuns}`,
      descriptionHe: `מבצע ${Math.round(avgHI)} ריצות אינטנסיביות למשחק — מעל הסטנדרט ל${posHe} של ${bench.highIntensityRuns}`,
      value: `${Math.round(avgHI)}`, benchmark: `${bench.highIntensityRuns} (${posEn})` });
  if (avgAcc >= bench.accelerations)
    insights.push({ type: 'strength', titleEn: 'Active Pressing Player', titleHe: 'שחקן לחץ פעיל',
      descriptionEn: `Averages ${Math.round(avgAcc)} accelerations per match — shows constant engagement above the ${posEn} standard of ${bench.accelerations}`,
      descriptionHe: `ממוצע ${Math.round(avgAcc)} האצות למשחק — מגלה מעורבות מתמדת מעל הסטנדרט ל${posHe} של ${bench.accelerations}`,
      value: `${Math.round(avgAcc)}`, benchmark: `${bench.accelerations} (${posEn})` });
  if (hasTeamData && avgDist > teamAvgDist * 1.1) {
    const pct = Math.round(((avgDist - teamAvgDist) / teamAvgDist) * 100);
    insights.push({ type: 'strength', titleEn: 'Above Squad Distance', titleHe: 'מרחק מעל ממוצע הקבוצה',
      descriptionEn: `Covers ${pct}% more distance than the squad average of ${fmtDist(Math.round(teamAvgDist))}`,
      descriptionHe: `מכסה ${pct}% יותר מרחק מממוצע הקבוצה של ${fmtDist(Math.round(teamAvgDist))}`,
      value: fmtDist(Math.round(avgDist)), benchmark: fmtDist(Math.round(teamAvgDist)) });
  }
  if (hasTeamData && peakVel > teamAvgMaxVel * 1.05)
    insights.push({ type: 'strength', titleEn: 'Fastest in Squad', titleHe: 'המהיר בסגל',
      descriptionEn: `Peak velocity ${peakVel.toFixed(1)} km/h exceeds the squad average of ${teamAvgMaxVel.toFixed(1)} km/h`,
      descriptionHe: `מהירות שיא ${peakVel.toFixed(1)} קמ״ש מעל ממוצע הסגל של ${teamAvgMaxVel.toFixed(1)} קמ״ש`,
      value: `${peakVel.toFixed(1)} km/h`, benchmark: `${teamAvgMaxVel.toFixed(1)} km/h` });
  if (starCount > 0 && matches.length > 1)
    insights.push({ type: 'strength', titleEn: 'Team Leader in Key Metrics', titleHe: 'מוביל קבוצתי במדדים מרכזיים',
      descriptionEn: `Earned ${starCount} ★ team-best marks across ${matches.length} matches`,
      descriptionHe: `זכה ב-${starCount} ★ סימוני מצטיין קבוצתי ב-${matches.length} משחקים`,
      value: `${starCount} ★` });

  // ── WEAKNESSES ──
  if (avgMeterage < bench.meteragePerMin * 0.92)
    insights.push({ type: 'weakness', titleEn: 'Low Work Rate', titleHe: 'קצב עבודה נמוך',
      descriptionEn: `Only ${Math.round(avgMeterage)} m/min vs the ${posEn} standard of ${bench.meteragePerMin} m/min`,
      descriptionHe: `רק ${Math.round(avgMeterage)} מ׳/דקה מול הסטנדרט ל${posHe} של ${bench.meteragePerMin} מ׳/דקה`,
      value: `${Math.round(avgMeterage)} m/min`, benchmark: `${bench.meteragePerMin} (${posEn})` });
  if (avgDist < bench.totalDistance * 0.88)
    insights.push({ type: 'weakness', titleEn: 'Low Total Distance', titleHe: 'מרחק כולל נמוך',
      descriptionEn: `Averages ${fmtDist(Math.round(avgDist))} — below the ${posEn} benchmark of ${fmtDist(bench.totalDistance)}`,
      descriptionHe: `ממוצע ${fmtDist(Math.round(avgDist))} — מתחת לסטנדרט ל${posHe} של ${fmtDist(bench.totalDistance)}`,
      value: fmtDist(Math.round(avgDist)), benchmark: `${fmtDist(bench.totalDistance)} (${posEn})` });
  if (peakVel < bench.maxVelocity * 0.9)
    insights.push({ type: 'weakness', titleEn: 'Lacks Top-End Speed', titleHe: 'חסר מהירות שיא',
      descriptionEn: `Peak velocity ${peakVel.toFixed(1)} km/h is below the ${posEn} standard of ${bench.maxVelocity.toFixed(1)} km/h`,
      descriptionHe: `מהירות שיא ${peakVel.toFixed(1)} קמ״ש מתחת לסטנדרט ל${posHe} של ${bench.maxVelocity.toFixed(1)} קמ״ש`,
      value: `${peakVel.toFixed(1)} km/h`, benchmark: `${bench.maxVelocity.toFixed(1)} (${posEn})` });
  if (avgSprints < bench.sprints * 0.6)
    insights.push({ type: 'weakness', titleEn: 'Very Few Sprints', titleHe: 'מעט מאוד ספרינטים',
      descriptionEn: `Only ${avgSprints.toFixed(1)} sprints per match — below the ${posEn} standard of ${bench.sprints}`,
      descriptionHe: `רק ${avgSprints.toFixed(1)} ספרינטים למשחק — מתחת לסטנדרט ל${posHe} של ${bench.sprints}`,
      value: `${avgSprints.toFixed(1)}`, benchmark: `${bench.sprints} (${posEn})` });
  if (avgHI < bench.highIntensityRuns * 0.7)
    insights.push({ type: 'weakness', titleEn: 'Low Intensity Running', titleHe: 'ריצה באינטנסיביות נמוכה',
      descriptionEn: `Only ${Math.round(avgHI)} high-intensity runs — below the ${posEn} standard of ${bench.highIntensityRuns}`,
      descriptionHe: `רק ${Math.round(avgHI)} ריצות אינטנסיביות — מתחת לסטנדרט ל${posHe} של ${bench.highIntensityRuns}`,
      value: `${Math.round(avgHI)}`, benchmark: `${bench.highIntensityRuns} (${posEn})` });
  if (avgAcc < bench.accelerations * 0.7)
    insights.push({ type: 'weakness', titleEn: 'Low Accelerations', titleHe: 'האצות נמוכות',
      descriptionEn: `Only ${Math.round(avgAcc)} accelerations per match — below the ${posEn} standard of ${bench.accelerations}`,
      descriptionHe: `רק ${Math.round(avgAcc)} האצות למשחק — מתחת לסטנדרט ל${posHe} של ${bench.accelerations}`,
      value: `${Math.round(avgAcc)}`, benchmark: `${bench.accelerations} (${posEn})` });
  if (hasTeamData && avgDist < teamAvgDist * 0.85) {
    const pct = Math.round(((teamAvgDist - avgDist) / teamAvgDist) * 100);
    insights.push({ type: 'weakness', titleEn: 'Below Squad Distance', titleHe: 'מתחת למרחק הקבוצתי',
      descriptionEn: `Covers ${pct}% less distance than the squad average of ${fmtDist(Math.round(teamAvgDist))}`,
      descriptionHe: `מכסה ${pct}% פחות מרחק מממוצע הקבוצה של ${fmtDist(Math.round(teamAvgDist))}`,
      value: fmtDist(Math.round(avgDist)), benchmark: fmtDist(Math.round(teamAvgDist)) });
  }
  if (hasTeamData && avgSprints < teamAvgSprints * 0.6 && teamAvgSprints > 0)
    insights.push({ type: 'weakness', titleEn: 'Below Squad Sprints', titleHe: 'מתחת לספרינטים של הסגל',
      descriptionEn: `Only ${avgSprints.toFixed(1)} sprints vs squad average of ${teamAvgSprints.toFixed(1)}`,
      descriptionHe: `רק ${avgSprints.toFixed(1)} ספרינטים מול ממוצע סגל של ${teamAvgSprints.toFixed(1)}`,
      value: `${avgSprints.toFixed(1)}`, benchmark: `${teamAvgSprints.toFixed(1)}` });

  return insights;
}

/**
 * After saving/replacing a GPS match, re-compute aggregate insights for the player
 * and write them to GpsPlayerInsights/{playerTmProfile}.
 */
async function recomputeAndStoreInsights(playerTmProfile: string): Promise<void> {
  try {
    // 1. Fetch all GPS matches for this player
    const allSnap = await adminDb().collection('GpsMatchData')
      .where('playerTmProfile', '==', playerTmProfile)
      .get();
    const allMatches = allSnap.docs.map(d => d.data());
    if (allMatches.length === 0) return;

    // 2. Look up player position from Players collection
    let position = '';
    const playerSnap = await adminDb().collection('Players')
      .where('tmProfile', '==', playerTmProfile)
      .limit(1)
      .get();
    if (!playerSnap.empty) {
      const pData = playerSnap.docs[0].data();
      position = (pData.position as string) || (pData.mainPosition as string) || '';
    }

    // 3. Compute insights
    const insights = computeInsights(allMatches, position);

    // 4. Store in GpsPlayerInsights (use playerTmProfile as doc ID for easy lookup)
    const safeId = playerTmProfile.replace(/[/\\]/g, '_');
    await adminDb().collection('GpsPlayerInsights').doc(safeId).set({
      playerTmProfile,
      position,
      positionGroup: detectPosGroup(position),
      insights,
      matchCount: allMatches.length,
      updatedAt: Date.now(),
    });
    console.log(`[gps-parse] Stored ${insights.length} insights for ${playerTmProfile} (${allMatches.length} matches)`);
  } catch (err) {
    console.error('[gps-parse] Failed to compute insights:', err);
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });
  }

  try {
    const body = await req.json() as {
      base64: string;
      mimeType: string;
      playerName: string;
      playerTmProfile: string;
      storageUrl: string;
      documentId?: string;
    };

    const { base64, mimeType, playerName, playerTmProfile, storageUrl, documentId } = body;
    if (!base64 || !playerName || !playerTmProfile) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Parse with Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      safetySettings: SAFETY_SETTINGS,
      generationConfig: {
        responseMimeType: 'application/json',
        // Disable thinking entirely — pure data extraction, no reasoning needed
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinkingConfig: { thinkingBudget: 0 },
      } as any,
    });

    const result = await model.generateContent([
      { inlineData: { mimeType: mimeType || 'application/pdf', data: base64 } },
      { text: GPS_PROMPT },
    ]);

    const response = result.response;
    const extracted = extractNonThoughtText(response);
    let rawText = '';
    try { rawText = (typeof response.text === 'function' ? response.text() : '') ?? ''; } catch { /* blocked */ }
    let text = (extracted || rawText || '').trim();

    if (!text) {
      console.error('[gps-parse] Gemini returned empty response');
      return NextResponse.json({ error: 'Gemini returned empty response — the document may not be readable' }, { status: 422 });
    }

    // Clean JSON from potential markdown wrappers
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1].trim();
    if (!text.startsWith('{')) {
      const start = text.indexOf('{');
      if (start >= 0) {
        let depth = 0, end = start;
        for (let i = start; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        text = text.slice(start, end + 1);
      }
    }

    const report = JSON.parse(text) as GpsReportResult;
    if (!report.players?.length) {
      return NextResponse.json({ error: 'No players found in GPS report' }, { status: 422 });
    }

    // Find matching player rows — multi-match reports have many rows for same player
    const allPlayerRows = findAllPlayerRows(report.players, playerName);
    if (allPlayerRows.length === 0) {
      console.log(`[gps-parse] Player "${playerName}" not found. Available: ${report.players.map(p => p.playerName).join(', ')}`);
      return NextResponse.json({ 
        error: 'Player not found in GPS report',
        availablePlayers: report.players.map(p => p.playerName),
      }, { status: 404 });
    }

    console.log(`[gps-parse] Found ${allPlayerRows.length} rows for "${playerName}"`);

    const savedDocs: string[] = [];
    for (const playerRow of allPlayerRows) {
      // Use per-row matchDate if available, else fall back to report-level matchDate
      const rowDateStr = playerRow.matchDate || report.matchDate;
      const matchDate = parseMatchDate(rowDateStr);

      // Check for duplicate — if same date exists, replace it
      const existing = rowDateStr ? await adminDb().collection('GpsMatchData')
        .where('playerTmProfile', '==', playerTmProfile)
        .where('matchDateStr', '==', rowDateStr)
        .limit(1)
        .get() : null;

      // Write to Firestore
      const gpsDoc: Record<string, unknown> = {
        playerTmProfile,
        playerName: playerRow.playerName,
        matchTitle: report.matchTitle,
        matchDate: matchDate ?? Date.now(),
        matchDateStr: rowDateStr || '',
        teamName: report.teamName,
        totalDuration: playerRow.totalDuration,
        totalDistance: playerRow.totalDistance,
        highMpEffsDist: playerRow.highMpEffsDist,
        highMpEffs: playerRow.highMpEffs,
        meteragePerMinute: playerRow.meteragePerMinute,
        accelerations: playerRow.accelerations,
        decelerations: playerRow.decelerations,
        highIntensityRuns: playerRow.highIntensityRuns,
        sprints: playerRow.sprints,
        maxVelocity: playerRow.maxVelocity,
        adEffs: playerRow.adEffs,
        hiDistTotal: playerRow.hiDistTotal,
        hiDistPercent: playerRow.hiDistPercent,
        sprintDistTotal: playerRow.sprintDistTotal,
        sprintDistPercent: playerRow.sprintDistPercent,
        isStarTotalDist: playerRow.isStarTotalDist,
        isStarHighMpEffsDist: playerRow.isStarHighMpEffsDist,
        isStarHighMpEffs: playerRow.isStarHighMpEffs,
        isStarMeteragePerMin: playerRow.isStarMeteragePerMin,
        isStarAccelerations: playerRow.isStarAccelerations,
        isStarHighIntensityRuns: playerRow.isStarHighIntensityRuns,
        isStarSprints: playerRow.isStarSprints,
        isStarMaxVelocity: playerRow.isStarMaxVelocity,
        teamAverageTotalDist: report.teamAverageTotalDist,
        teamAverageMeteragePerMin: report.teamAverageMeteragePerMin,
        teamAverageHighIntensityRuns: report.teamAverageHighIntensityRuns,
        teamAverageSprints: report.teamAverageSprints,
        teamAverageMaxVelocity: report.teamAverageMaxVelocity,
        storageUrl: storageUrl || '',
        createdAt: Date.now(),
      };

      let docRefId: string;
      if (existing && !existing.empty) {
        const existingDoc = existing.docs[0];
        await adminDb().collection('GpsMatchData').doc(existingDoc.id).update({ ...gpsDoc, updatedAt: Date.now() });
        docRefId = existingDoc.id;
        console.log(`[gps-parse] Replaced GPS data for ${playerRow.playerName} — ${rowDateStr} -> ${docRefId}`);
      } else {
        const docRef = await adminDb().collection('GpsMatchData').add(gpsDoc);
        docRefId = docRef.id;
        console.log(`[gps-parse] Saved GPS data for ${playerRow.playerName} — ${rowDateStr} -> ${docRefId}`);
      }
      savedDocs.push(docRefId);
    }

    // Re-compute aggregate insights for this player (bilingual, stored in Firestore)
    await recomputeAndStoreInsights(playerTmProfile);

    return NextResponse.json({ 
      status: 'ok',
      matchCount: savedDocs.length,
      documentIds: savedDocs,
      matchTitle: report.matchTitle,
      playerName: allPlayerRows[0].playerName,
    });
  } catch (err) {
    console.error('[gps-parse] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GPS parsing failed' },
      { status: 500 }
    );
  }
}
