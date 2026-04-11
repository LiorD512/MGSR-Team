/**
 * Pre-compute API Football stats for sharing.
 * Fetches from scout server, filters by position relevance and impressiveness.
 * Only includes stats that are at least "good" tier.
 */
import type { SharedPlayerStats, SharedStatItem } from '@/app/p/[token]/types';
import { getScoutBaseUrl } from '@/lib/scoutServerUrl';

/* ── Position classification ── */

type PosGroup = 'GK' | 'DEF' | 'FB' | 'MID' | 'ATT_MID' | 'WING' | 'FWD';

function classifyPosition(position: string): PosGroup {
  if (!position) return 'FWD';
  const p = position.toLowerCase();
  if (p.includes('goalkeeper') || p.includes('gk')) return 'GK';
  if (p.includes('left-back') || p.includes('right-back') || p.includes('wing-back') || p.includes('lb') || p.includes('rb') || p.includes('wb')) return 'FB';
  if (p.includes('centre-back') || p.includes('center-back') || p.includes('cb')) return 'DEF';
  if (p.includes('left wing') || p.includes('right wing') || p.includes('lw') || p.includes('rw')) return 'WING';
  if (p.includes('attacking mid') || p.includes('am')) return 'ATT_MID';
  if (p.includes('midfield') || p.includes('dm') || p.includes('cm')) return 'MID';
  if (p.includes('forward') || p.includes('striker') || p.includes('cf') || p.includes('ss')) return 'FWD';
  if (p.includes('attack')) return 'FWD';
  if (p.includes('defend')) return 'DEF';
  return 'FWD';
}

/* ── Stat definitions per position: key, label, thresholds [good, great, elite] ── */

interface StatSpec {
  key: string;
  label: string;
  labelHe: string;
  format: 'decimal' | 'pct' | 'number' | 'rating';
  thresholds: [number, number, number]; // [good, great, elite]
  icon: string;
  lowerIsBetter?: boolean;
}

const POSITION_STATS: Record<PosGroup, StatSpec[]> = {
  GK: [
    { key: 'api_saves_per90', label: 'Saves / 90', labelHe: 'הצלות / 90', format: 'decimal', thresholds: [2.0, 3.0, 4.0], icon: '🧤' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', thresholds: [55, 65, 75], icon: '🎯' },
    { key: 'api_duels_won_pct', label: 'Duels Won', labelHe: 'מאבקים', format: 'pct', thresholds: [40, 55, 70], icon: '💪' },
  ],
  DEF: [
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'תיקולים וחטיפות / 90', format: 'decimal', thresholds: [2.5, 4.0, 5.5], icon: '🛡️' },
    { key: 'api_duels_won_pct', label: 'Duels Won', labelHe: 'מאבקים', format: 'pct', thresholds: [55, 65, 75], icon: '💪' },
    { key: 'api_blocks_per90', label: 'Blocks / 90', labelHe: 'חסימות / 90', format: 'decimal', thresholds: [0.5, 1.0, 1.5], icon: '🧱' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', thresholds: [70, 80, 88], icon: '🎯' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', thresholds: [0.05, 0.1, 0.2], icon: '⚽' },
  ],
  FB: [
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'תיקולים וחטיפות / 90', format: 'decimal', thresholds: [2.0, 3.0, 4.5], icon: '🛡️' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', thresholds: [0.5, 1.0, 1.8], icon: '🔑' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', thresholds: [0.5, 1.0, 1.5], icon: '⚡' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', thresholds: [0.1, 0.2, 0.35], icon: '⚽' },
    { key: 'api_duels_won_pct', label: 'Duels Won', labelHe: 'מאבקים', format: 'pct', thresholds: [50, 55, 65], icon: '💪' },
  ],
  MID: [
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', thresholds: [0.8, 1.5, 2.5], icon: '🔑' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', thresholds: [72, 82, 90], icon: '🎯' },
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'תיקולים וחטיפות / 90', format: 'decimal', thresholds: [1.5, 3.0, 4.5], icon: '🛡️' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', thresholds: [0.15, 0.3, 0.5], icon: '⚽' },
    { key: 'api_duels_won_pct', label: 'Duels Won', labelHe: 'מאבקים', format: 'pct', thresholds: [48, 55, 65], icon: '💪' },
  ],
  ATT_MID: [
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', thresholds: [0.3, 0.5, 0.8], icon: '⚽' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', thresholds: [1.0, 2.0, 3.0], icon: '🔑' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', thresholds: [0.8, 1.5, 2.5], icon: '⚡' },
    { key: 'api_shots_per90', label: 'Shots / 90', labelHe: 'בעיטות / 90', format: 'decimal', thresholds: [1.0, 2.0, 3.0], icon: '🎯' },
    { key: 'api_fouled_per90', label: 'Fouled / 90', labelHe: 'עבירות שספג / 90', format: 'decimal', thresholds: [1.0, 1.8, 2.5], icon: '⚡' },
  ],
  WING: [
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', thresholds: [0.25, 0.45, 0.7], icon: '⚽' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', thresholds: [0.8, 1.5, 2.5], icon: '⚡' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', thresholds: [0.8, 1.5, 2.5], icon: '🔑' },
    { key: 'api_shots_on_target_per90', label: 'Shots on Target / 90', labelHe: 'בעיטות למסגרת / 90', format: 'decimal', thresholds: [0.5, 1.0, 1.5], icon: '🎯' },
    { key: 'api_fouled_per90', label: 'Fouled / 90', labelHe: 'עבירות שספג / 90', format: 'decimal', thresholds: [1.0, 2.0, 3.0], icon: '⚡' },
  ],
  FWD: [
    { key: 'api_goals_per90', label: 'Goals / 90', labelHe: 'שערים / 90', format: 'decimal', thresholds: [0.25, 0.45, 0.7], icon: '⚽' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', thresholds: [0.35, 0.6, 0.9], icon: '🔥' },
    { key: 'api_shots_on_target_per90', label: 'Shots on Target / 90', labelHe: 'בעיטות למסגרת / 90', format: 'decimal', thresholds: [0.8, 1.2, 2.0], icon: '🎯' },
    { key: 'api_goals_per_shot', label: 'Conversion Rate', labelHe: 'אחוז המרה', format: 'pct', thresholds: [0.1, 0.2, 0.35], icon: '💎' },
    { key: 'api_duels_won_pct', label: 'Duels Won', labelHe: 'מאבקים', format: 'pct', thresholds: [40, 50, 60], icon: '💪' },
  ],
};

/* ── Leagues with unreliable API-Football data (skip stats for these) ── */

const UNRELIABLE_LEAGUE_COUNTRIES = new Set([
  'israel',       // Ligat Ha'Al — spotty data
  'cyprus',       // low coverage
  'georgia',      // low coverage
  'kazakhstan',   // low coverage
  'iceland',      // low coverage
  'malta',        // low coverage
]);

/* ── Main: fetch and build shareable stats ── */

export async function fetchPlayerStatsForShare(
  tmProfile: string | undefined,
  positions: string[] | undefined,
): Promise<SharedPlayerStats | undefined> {
  if (!tmProfile) return undefined;

  try {
    const params = new URLSearchParams({ url: tmProfile });
    const res = await fetch(`${getScoutBaseUrl()}/player_stats?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    if (!data.api_matched) return undefined;

    // Skip leagues with unreliable data
    const leagueCountry = (data.api_league_country || '').toLowerCase().trim();
    if (UNRELIABLE_LEAGUE_COUNTRIES.has(leagueCountry)) return undefined;

    // Minimum minutes threshold — ignore very low sample sizes
    const minutes = data.api_minutes ?? 0;
    if (minutes < 300) return undefined;

    // Classify position: prefer api_position, fallback to player's positions
    const apiPosition = data.api_position || data.position || '';
    const playerPos = (positions ?? [])[0] || '';
    const posGroup = classifyPosition(apiPosition || playerPos);

    const posStats = POSITION_STATS[posGroup] || POSITION_STATS.FWD;

    // Build impressive stats list
    const impressiveStats: SharedStatItem[] = [];
    for (const spec of posStats) {
      const rawValue = data[spec.key];
      if (rawValue == null || rawValue === 0) continue;
      const value = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
      if (isNaN(value) || value === 0) continue;

      const [good, great, elite] = spec.thresholds;
      const isLowerBetter = spec.lowerIsBetter ?? false;

      let tier: 'good' | 'great' | 'elite' | null = null;
      if (isLowerBetter) {
        if (value <= elite) tier = 'elite';
        else if (value <= great) tier = 'great';
        else if (value <= good) tier = 'good';
      } else {
        if (value >= elite) tier = 'elite';
        else if (value >= great) tier = 'great';
        else if (value >= good) tier = 'good';
      }

      // Only include stats that are at least "good"
      if (!tier) continue;

      impressiveStats.push({
        key: spec.key,
        label: spec.label,
        labelHe: spec.labelHe,
        value,
        format: spec.format,
        tier,
        icon: spec.icon,
      });
    }

    // Also add rating if impressive
    const rating = data.api_rating;
    if (rating != null && rating >= 6.5) {
      const rTier = rating >= 7.5 ? 'elite' : rating >= 7.0 ? 'great' : 'good';
      impressiveStats.unshift({
        key: 'api_rating',
        label: 'Rating',
        labelHe: 'דירוג',
        value: rating,
        format: 'rating',
        tier: rTier as 'good' | 'great' | 'elite',
        icon: '⭐',
      });
    }

    // Skip if no impressive stats at all
    if (impressiveStats.length === 0) return undefined;

    return {
      position: apiPosition || playerPos,
      league: data.api_league || data.league || '',
      leagueCountry: data.api_league_country || '',
      season: data.api_season,
      appearances: data.api_appearances ?? 0,
      minutes,
      goals: data.api_goals ?? undefined,
      assists: data.api_assists ?? undefined,
      rating: data.api_rating,
      stats: impressiveStats,
    };
  } catch {
    return undefined;
  }
}
