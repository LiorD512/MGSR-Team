/**
 * Re-compute GPS insights for a player from existing GpsMatchData.
 * Used to backfill insights for players who already have GPS data
 * but no GpsPlayerInsights doc yet.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

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

function computeInsights(allMatches: Array<Record<string, unknown>>, position: string): StoredInsight[] {
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
    insights.push({ type: 'strength', titleEn: 'High Work Rate', titleHe: 'קצב עבודה גבוה', descriptionEn: `Covers ${Math.round(avgMeterage)} m/min on average — above the ${posEn} benchmark of ${bench.meteragePerMin} m/min`, descriptionHe: `מכסה ${Math.round(avgMeterage)} מ׳/דקה בממוצע — מעל הסטנדרט ל${posHe} של ${bench.meteragePerMin} מ׳/דקה`, value: `${Math.round(avgMeterage)} m/min`, benchmark: `${bench.meteragePerMin} (${posEn})` });
  if (avgDist >= bench.totalDistance)
    insights.push({ type: 'strength', titleEn: 'Elite Distance Coverage', titleHe: 'כיסוי מרחק עילית', descriptionEn: `Averages ${fmtDist(Math.round(avgDist))} total distance per match — exceeds the ${posEn} standard of ${fmtDist(bench.totalDistance)}`, descriptionHe: `ממוצע ${fmtDist(Math.round(avgDist))} מרחק כולל למשחק — מעל הסטנדרט ל${posHe} של ${fmtDist(bench.totalDistance)}`, value: fmtDist(Math.round(avgDist)), benchmark: `${fmtDist(bench.totalDistance)} (${posEn})` });
  if (peakVel >= bench.maxVelocity)
    insights.push({ type: 'strength', titleEn: 'Explosive Top Speed', titleHe: 'מהירות שיא נפיצה', descriptionEn: `Reached ${peakVel.toFixed(1)} km/h peak velocity — above the ${posEn} benchmark of ${bench.maxVelocity.toFixed(1)} km/h`, descriptionHe: `הגיע ל-${peakVel.toFixed(1)} קמ״ש מהירות שיא — מעל הסטנדרט ל${posHe} של ${bench.maxVelocity.toFixed(1)} קמ״ש`, value: `${peakVel.toFixed(1)} km/h`, benchmark: `${bench.maxVelocity.toFixed(1)} (${posEn})` });
  if (avgSprints >= bench.sprints)
    insights.push({ type: 'strength', titleEn: 'Strong Sprint Output', titleHe: 'תפוקת ספרינטים חזקה', descriptionEn: `Averages ${avgSprints.toFixed(1)} sprints (>25 km/h) per match — meets/exceeds the ${posEn} standard of ${bench.sprints}`, descriptionHe: `ממוצע ${avgSprints.toFixed(1)} ספרינטים (מעל 25 קמ״ש) למשחק — עומד/מעל הסטנדרט ל${posHe} של ${bench.sprints}`, value: `${avgSprints.toFixed(1)}`, benchmark: `${bench.sprints} (${posEn})` });
  if (avgHI >= bench.highIntensityRuns)
    insights.push({ type: 'strength', titleEn: 'High-Intensity Machine', titleHe: 'מכונת אינטנסיביות', descriptionEn: `Makes ${Math.round(avgHI)} high-intensity runs per match — above the ${posEn} benchmark of ${bench.highIntensityRuns}`, descriptionHe: `מבצע ${Math.round(avgHI)} ריצות אינטנסיביות למשחק — מעל הסטנדרט ל${posHe} של ${bench.highIntensityRuns}`, value: `${Math.round(avgHI)}`, benchmark: `${bench.highIntensityRuns} (${posEn})` });
  if (avgAcc >= bench.accelerations)
    insights.push({ type: 'strength', titleEn: 'Active Pressing Player', titleHe: 'שחקן לחץ פעיל', descriptionEn: `Averages ${Math.round(avgAcc)} accelerations per match — shows constant engagement above the ${posEn} standard of ${bench.accelerations}`, descriptionHe: `ממוצע ${Math.round(avgAcc)} האצות למשחק — מגלה מעורבות מתמדת מעל הסטנדרט ל${posHe} של ${bench.accelerations}`, value: `${Math.round(avgAcc)}`, benchmark: `${bench.accelerations} (${posEn})` });
  if (hasTeamData && avgDist > teamAvgDist * 1.1) {
    const pct = Math.round(((avgDist - teamAvgDist) / teamAvgDist) * 100);
    insights.push({ type: 'strength', titleEn: 'Above Squad Distance', titleHe: 'מרחק מעל ממוצע הקבוצה', descriptionEn: `Covers ${pct}% more distance than the squad average of ${fmtDist(Math.round(teamAvgDist))}`, descriptionHe: `מכסה ${pct}% יותר מרחק מממוצע הקבוצה של ${fmtDist(Math.round(teamAvgDist))}`, value: fmtDist(Math.round(avgDist)), benchmark: fmtDist(Math.round(teamAvgDist)) });
  }
  if (hasTeamData && peakVel > teamAvgMaxVel * 1.05)
    insights.push({ type: 'strength', titleEn: 'Fastest in Squad', titleHe: 'המהיר בסגל', descriptionEn: `Peak velocity ${peakVel.toFixed(1)} km/h exceeds the squad average of ${teamAvgMaxVel.toFixed(1)} km/h`, descriptionHe: `מהירות שיא ${peakVel.toFixed(1)} קמ״ש מעל ממוצע הסגל של ${teamAvgMaxVel.toFixed(1)} קמ״ש`, value: `${peakVel.toFixed(1)} km/h`, benchmark: `${teamAvgMaxVel.toFixed(1)} km/h` });
  if (starCount > 0 && matches.length > 1)
    insights.push({ type: 'strength', titleEn: 'Team Leader in Key Metrics', titleHe: 'מוביל קבוצתי במדדים מרכזיים', descriptionEn: `Earned ${starCount} ★ team-best marks across ${matches.length} matches`, descriptionHe: `זכה ב-${starCount} ★ סימוני מצטיין קבוצתי ב-${matches.length} משחקים`, value: `${starCount} ★` });

  // ── WEAKNESSES ──
  if (avgMeterage < bench.meteragePerMin * 0.92)
    insights.push({ type: 'weakness', titleEn: 'Low Work Rate', titleHe: 'קצב עבודה נמוך', descriptionEn: `Only ${Math.round(avgMeterage)} m/min vs the ${posEn} standard of ${bench.meteragePerMin} m/min`, descriptionHe: `רק ${Math.round(avgMeterage)} מ׳/דקה מול הסטנדרט ל${posHe} של ${bench.meteragePerMin} מ׳/דקה`, value: `${Math.round(avgMeterage)} m/min`, benchmark: `${bench.meteragePerMin} (${posEn})` });
  if (avgDist < bench.totalDistance * 0.88)
    insights.push({ type: 'weakness', titleEn: 'Low Total Distance', titleHe: 'מרחק כולל נמוך', descriptionEn: `Averages ${fmtDist(Math.round(avgDist))} — below the ${posEn} benchmark of ${fmtDist(bench.totalDistance)}`, descriptionHe: `ממוצע ${fmtDist(Math.round(avgDist))} — מתחת לסטנדרט ל${posHe} של ${fmtDist(bench.totalDistance)}`, value: fmtDist(Math.round(avgDist)), benchmark: `${fmtDist(bench.totalDistance)} (${posEn})` });
  if (peakVel < bench.maxVelocity * 0.9)
    insights.push({ type: 'weakness', titleEn: 'Lacks Top-End Speed', titleHe: 'חסר מהירות שיא', descriptionEn: `Peak velocity ${peakVel.toFixed(1)} km/h is below the ${posEn} standard of ${bench.maxVelocity.toFixed(1)} km/h`, descriptionHe: `מהירות שיא ${peakVel.toFixed(1)} קמ״ש מתחת לסטנדרט ל${posHe} של ${bench.maxVelocity.toFixed(1)} קמ״ש`, value: `${peakVel.toFixed(1)} km/h`, benchmark: `${bench.maxVelocity.toFixed(1)} (${posEn})` });
  if (avgSprints < bench.sprints * 0.6)
    insights.push({ type: 'weakness', titleEn: 'Very Few Sprints', titleHe: 'מעט מאוד ספרינטים', descriptionEn: `Only ${avgSprints.toFixed(1)} sprints per match — below the ${posEn} standard of ${bench.sprints}`, descriptionHe: `רק ${avgSprints.toFixed(1)} ספרינטים למשחק — מתחת לסטנדרט ל${posHe} של ${bench.sprints}`, value: `${avgSprints.toFixed(1)}`, benchmark: `${bench.sprints} (${posEn})` });
  if (avgHI < bench.highIntensityRuns * 0.7)
    insights.push({ type: 'weakness', titleEn: 'Low Intensity Running', titleHe: 'ריצה באינטנסיביות נמוכה', descriptionEn: `Only ${Math.round(avgHI)} high-intensity runs — below the ${posEn} standard of ${bench.highIntensityRuns}`, descriptionHe: `רק ${Math.round(avgHI)} ריצות אינטנסיביות — מתחת לסטנדרט ל${posHe} של ${bench.highIntensityRuns}`, value: `${Math.round(avgHI)}`, benchmark: `${bench.highIntensityRuns} (${posEn})` });
  if (avgAcc < bench.accelerations * 0.7)
    insights.push({ type: 'weakness', titleEn: 'Low Accelerations', titleHe: 'האצות נמוכות', descriptionEn: `Only ${Math.round(avgAcc)} accelerations per match — below the ${posEn} standard of ${bench.accelerations}`, descriptionHe: `רק ${Math.round(avgAcc)} האצות למשחק — מתחת לסטנדרט ל${posHe} של ${bench.accelerations}`, value: `${Math.round(avgAcc)}`, benchmark: `${bench.accelerations} (${posEn})` });
  if (hasTeamData && avgDist < teamAvgDist * 0.85) {
    const pct = Math.round(((teamAvgDist - avgDist) / teamAvgDist) * 100);
    insights.push({ type: 'weakness', titleEn: 'Below Squad Distance', titleHe: 'מתחת למרחק הקבוצתי', descriptionEn: `Covers ${pct}% less distance than the squad average of ${fmtDist(Math.round(teamAvgDist))}`, descriptionHe: `מכסה ${pct}% פחות מרחק מממוצע הקבוצה של ${fmtDist(Math.round(teamAvgDist))}`, value: fmtDist(Math.round(avgDist)), benchmark: fmtDist(Math.round(teamAvgDist)) });
  }
  if (hasTeamData && avgSprints < teamAvgSprints * 0.6 && teamAvgSprints > 0)
    insights.push({ type: 'weakness', titleEn: 'Below Squad Sprints', titleHe: 'מתחת לספרינטים של הסגל', descriptionEn: `Only ${avgSprints.toFixed(1)} sprints vs squad average of ${teamAvgSprints.toFixed(1)}`, descriptionHe: `רק ${avgSprints.toFixed(1)} ספרינטים מול ממוצע סגל של ${teamAvgSprints.toFixed(1)}`, value: `${avgSprints.toFixed(1)}`, benchmark: `${teamAvgSprints.toFixed(1)}` });

  return insights;
}

export async function POST(req: NextRequest) {
  try {
    const { playerTmProfile } = await req.json() as { playerTmProfile: string };
    if (!playerTmProfile) {
      return NextResponse.json({ error: 'Missing playerTmProfile' }, { status: 400 });
    }

    // Fetch all GPS matches
    const allSnap = await adminDb().collection('GpsMatchData')
      .where('playerTmProfile', '==', playerTmProfile)
      .get();
    const allMatches = allSnap.docs.map(d => d.data());
    if (allMatches.length === 0) {
      // No GPS data left — remove stale insights doc if it exists
      const safeId = playerTmProfile.replace(/[/\\]/g, '_');
      await adminDb().collection('GpsPlayerInsights').doc(safeId).delete();
      return NextResponse.json({ status: 'ok', insightCount: 0, matchCount: 0 });
    }

    // Look up player position
    let position = '';
    const playerSnap = await adminDb().collection('Players')
      .where('tmProfile', '==', playerTmProfile)
      .limit(1)
      .get();
    if (!playerSnap.empty) {
      const pData = playerSnap.docs[0].data();
      const positions = pData.positions as string[] | undefined;
      position = positions?.[0] || (pData.position as string) || (pData.mainPosition as string) || '';
    }
    const insights = computeInsights(allMatches, position);
    const safeId = playerTmProfile.replace(/[/\\]/g, '_');
    await adminDb().collection('GpsPlayerInsights').doc(safeId).set({
      playerTmProfile,
      position,
      positionGroup: detectPosGroup(position),
      insights,
      matchCount: allMatches.length,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ status: 'ok', insightCount: insights.length, matchCount: allMatches.length });
  } catch (err) {
    console.error('[gps-recompute] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
