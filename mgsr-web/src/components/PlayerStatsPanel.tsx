'use client';

import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface PlayerStatsData {
  name: string;
  position: string;
  league: string;
  club: string;
  age: string;
  api_matched: boolean;
  api_rating?: number;
  api_appearances?: number;
  api_lineups?: number;
  api_minutes?: number;
  api_minutes_90s?: number;
  api_goals?: number;
  api_assists?: number;
  api_conceded?: number;
  api_saves?: number;
  api_shots_total?: number;
  api_shots_on?: number;
  api_passes_total?: number;
  api_passes_key?: number;
  api_passes_accuracy?: number;
  api_tackles?: number;
  api_blocks?: number;
  api_interceptions?: number;
  api_duels_total?: number;
  api_duels_won?: number;
  api_dribbles_attempts?: number;
  api_dribbles_success?: number;
  api_fouls_drawn?: number;
  api_fouls_committed?: number;
  api_cards_yellow?: number;
  api_cards_red?: number;
  api_penalty_scored?: number;
  api_penalty_missed?: number;
  api_goals_per90?: number;
  api_assists_per90?: number;
  api_goal_contributions_per90?: number;
  api_shots_per90?: number;
  api_shots_on_target_per90?: number;
  api_goals_per_shot?: number;
  api_key_passes_per90?: number;
  api_tackles_per90?: number;
  api_interceptions_per90?: number;
  api_tackles_interceptions_per90?: number;
  api_fouls_per90?: number;
  api_fouled_per90?: number;
  api_dribbles_per90?: number;
  api_dribbles_success_per90?: number;
  api_duels_per90?: number;
  api_duels_won_per90?: number;
  api_duels_won_pct?: number;
  api_saves_per90?: number;
  api_blocks_per90?: number;
  api_team?: string;
  api_league?: string;
  api_photo?: string;
  api_season?: number;
}

/* ------------------------------------------------------------------ */
/*  Position classification                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Stat definitions — position-specific                              */
/* ------------------------------------------------------------------ */

interface StatDef {
  key: string;
  label: string;
  labelHe: string;
  format: 'number' | 'decimal' | 'pct' | 'rating';
  /** For bar width: approximate max for the position group */
  max: number;
  /** Highlight color tier thresholds [good, great, elite] */
  thresholds: [number, number, number];
  icon: string;
}

const CORE_STATS: Record<PosGroup, StatDef[]> = {
  GK: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_saves_per90', label: 'Saves / 90', labelHe: 'הצלות / 90', format: 'decimal', max: 5, thresholds: [2.0, 3.0, 4.0], icon: '🧤' },
    { key: 'api_conceded', label: 'Goals Conceded', labelHe: 'שערים שספג', format: 'number', max: 40, thresholds: [25, 15, 8], icon: '🥅' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', max: 100, thresholds: [55, 65, 75], icon: '🎯' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% דו-קרבות', format: 'pct', max: 100, thresholds: [40, 55, 70], icon: '💪' },
    { key: 'api_blocks_per90', label: 'Blocks / 90', labelHe: 'חסימות / 90', format: 'decimal', max: 3, thresholds: [0.3, 0.6, 1.0], icon: '🛡️' },
  ],
  DEF: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'נטילות+יירוטים / 90', format: 'decimal', max: 8, thresholds: [2.5, 4.0, 5.5], icon: '🛡️' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% דו-קרבות', format: 'pct', max: 100, thresholds: [55, 65, 75], icon: '💪' },
    { key: 'api_blocks_per90', label: 'Blocks / 90', labelHe: 'חסימות / 90', format: 'decimal', max: 3, thresholds: [0.5, 1.0, 1.5], icon: '🧱' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', max: 100, thresholds: [70, 80, 88], icon: '🎯' },
    { key: 'api_fouls_per90', label: 'Fouls / 90', labelHe: 'עבירות / 90', format: 'decimal', max: 3, thresholds: [2.0, 1.5, 0.8], icon: '⚠️' },
  ],
  FB: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'נטילות+יירוטים / 90', format: 'decimal', max: 6, thresholds: [2.0, 3.0, 4.5], icon: '🛡️' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', max: 3, thresholds: [0.5, 1.0, 1.8], icon: '🔑' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', max: 3, thresholds: [0.5, 1.0, 1.5], icon: '⚡' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 0.6, thresholds: [0.1, 0.2, 0.35], icon: '⚽' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% דו-קרבות', format: 'pct', max: 100, thresholds: [50, 55, 65], icon: '💪' },
  ],
  MID: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', max: 3, thresholds: [0.8, 1.5, 2.5], icon: '🔑' },
    { key: 'api_passes_accuracy', label: 'Pass Accuracy', labelHe: 'דיוק מסירות', format: 'pct', max: 100, thresholds: [72, 82, 90], icon: '🎯' },
    { key: 'api_tackles_interceptions_per90', label: 'Tackles+Int / 90', labelHe: 'נטילות+יירוטים / 90', format: 'decimal', max: 6, thresholds: [1.5, 3.0, 4.5], icon: '🛡️' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 0.8, thresholds: [0.15, 0.3, 0.5], icon: '⚽' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% דו-קרבות', format: 'pct', max: 100, thresholds: [48, 55, 65], icon: '💪' },
  ],
  ATT_MID: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 1.2, thresholds: [0.3, 0.5, 0.8], icon: '⚽' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', max: 4, thresholds: [1.0, 2.0, 3.0], icon: '🔑' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', max: 4, thresholds: [0.8, 1.5, 2.5], icon: '⚡' },
    { key: 'api_shots_per90', label: 'Shots / 90', labelHe: 'בעיטות / 90', format: 'decimal', max: 4, thresholds: [1.0, 2.0, 3.0], icon: '🎯' },
    { key: 'api_fouled_per90', label: 'Fouled / 90', labelHe: 'עבירות שנפלו / 90', format: 'decimal', max: 4, thresholds: [1.0, 1.8, 2.5], icon: '⚡' },
  ],
  WING: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 1.2, thresholds: [0.25, 0.45, 0.7], icon: '⚽' },
    { key: 'api_dribbles_success_per90', label: 'Dribbles / 90', labelHe: 'כדרורים / 90', format: 'decimal', max: 4, thresholds: [0.8, 1.5, 2.5], icon: '⚡' },
    { key: 'api_key_passes_per90', label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', format: 'decimal', max: 3, thresholds: [0.8, 1.5, 2.5], icon: '🔑' },
    { key: 'api_shots_on_target_per90', label: 'Shots on Target / 90', labelHe: 'בעיטות למסגרת / 90', format: 'decimal', max: 2.5, thresholds: [0.5, 1.0, 1.5], icon: '🎯' },
    { key: 'api_fouled_per90', label: 'Fouled / 90', labelHe: 'עבירות שנפלו / 90', format: 'decimal', max: 4, thresholds: [1.0, 2.0, 3.0], icon: '⚡' },
  ],
  FWD: [
    { key: 'api_rating', label: 'Rating', labelHe: 'דירוג', format: 'rating', max: 10, thresholds: [6.5, 7.0, 7.5], icon: '⭐' },
    { key: 'api_goals_per90', label: 'Goals / 90', labelHe: 'שערים / 90', format: 'decimal', max: 1.0, thresholds: [0.25, 0.45, 0.7], icon: '⚽' },
    { key: 'api_goal_contributions_per90', label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', format: 'decimal', max: 1.5, thresholds: [0.35, 0.6, 0.9], icon: '🔥' },
    { key: 'api_shots_on_target_per90', label: 'Shots on Target / 90', labelHe: 'בעיטות למסגרת / 90', format: 'decimal', max: 3, thresholds: [0.8, 1.2, 2.0], icon: '🎯' },
    { key: 'api_goals_per_shot', label: 'Conversion Rate', labelHe: 'אחוז המרה', format: 'pct', max: 1, thresholds: [0.1, 0.2, 0.35], icon: '💎' },
    { key: 'api_duels_won_pct', label: 'Duels Won %', labelHe: '% דו-קרבות', format: 'pct', max: 100, thresholds: [40, 50, 60], icon: '💪' },
  ],
};

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                    */
/* ------------------------------------------------------------------ */

function getStatColor(value: number, thresholds: [number, number, number], isLowerBetter = false): string {
  const [good, great, elite] = thresholds;
  if (isLowerBetter) {
    if (value <= elite) return 'text-yellow-400';
    if (value <= great) return 'text-green-400';
    if (value <= good) return 'text-teal-400';
    return 'text-mgsr-muted';
  }
  if (value >= elite) return 'text-yellow-400';
  if (value >= great) return 'text-green-400';
  if (value >= good) return 'text-teal-400';
  return 'text-mgsr-muted';
}

function getBarGradient(value: number, thresholds: [number, number, number], isLowerBetter = false): string {
  const [good, great, elite] = thresholds;
  if (isLowerBetter) {
    if (value <= elite) return 'from-yellow-400 to-amber-500';
    if (value <= great) return 'from-green-400 to-emerald-500';
    if (value <= good) return 'from-teal-400 to-teal-500';
    return 'from-gray-500 to-gray-600';
  }
  if (value >= elite) return 'from-yellow-400 to-amber-500';
  if (value >= great) return 'from-green-400 to-emerald-500';
  if (value >= good) return 'from-teal-400 to-teal-500';
  return 'from-gray-500 to-gray-600';
}

function ratingColor(rating: number): string {
  if (rating >= 7.5) return 'text-yellow-400';
  if (rating >= 7.0) return 'text-green-400';
  if (rating >= 6.5) return 'text-teal-400';
  return 'text-mgsr-muted';
}

function ratingBg(rating: number): string {
  if (rating >= 7.5) return 'from-yellow-400/20 to-amber-500/10 border-yellow-400/30';
  if (rating >= 7.0) return 'from-green-400/20 to-emerald-500/10 border-green-400/30';
  if (rating >= 6.5) return 'from-teal-400/20 to-teal-500/10 border-teal-400/30';
  return 'from-gray-500/20 to-gray-600/10 border-gray-500/30';
}

/* ------------------------------------------------------------------ */
/*  Format helpers                                                    */
/* ------------------------------------------------------------------ */

function formatStat(value: number | undefined | null, format: string): string {
  if (value == null || value === 0) return '—';
  switch (format) {
    case 'rating': return value.toFixed(2);
    case 'decimal': return value.toFixed(2);
    case 'pct': return value <= 1 ? `${(value * 100).toFixed(0)}%` : `${value.toFixed(0)}%`;
    case 'number': return String(Math.round(value));
    default: return String(value);
  }
}

function barWidth(value: number | undefined, max: number): number {
  if (!value || max <= 0) return 0;
  return Math.min(100, Math.max(3, (value / max) * 100));
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function ApiBadge() {
  return (
    <svg width={28} height={28} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="apiBadgeGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4DB6AC" />
          <stop offset="1" stopColor="#26A69A" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#apiBadgeGrad)" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="6" fill="rgba(0,0,0,0.18)" />
      <text
        x="16" y="17" textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize="10" fontWeight="800" letterSpacing="0.3"
      >
        API
      </text>
    </svg>
  );
}

function OverviewChip({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-mgsr-dark/60 rounded-lg px-2.5 py-1.5">
      <span className="text-xs">{icon}</span>
      <span className="text-[10px] text-mgsr-muted uppercase tracking-wider">{label}</span>
      <span className="text-xs font-bold text-mgsr-text ml-auto">{value}</span>
    </div>
  );
}

function StatRow({
  stat,
  value,
  isRtl,
  isLowerBetter,
}: {
  stat: StatDef;
  value: number | undefined;
  isRtl: boolean;
  isLowerBetter: boolean;
}) {
  const displayVal = formatStat(value, stat.format);
  const numVal = value ?? 0;
  const width = stat.format === 'pct' && stat.max === 100
    ? (numVal <= 1 ? numVal * 100 : numVal)
    : barWidth(numVal, stat.max);
  const gradient = getBarGradient(numVal, stat.thresholds, isLowerBetter);
  const valColor = getStatColor(numVal, stat.thresholds, isLowerBetter);

  return (
    <div className="group flex items-center gap-3 py-1.5 transition-colors hover:bg-mgsr-dark/30 rounded-lg px-1">
      <span className="text-sm w-5 text-center shrink-0">{stat.icon}</span>
      <span className={`w-[130px] text-xs text-mgsr-muted shrink-0 truncate ${isRtl ? 'text-right' : 'text-left'}`}>
        {isRtl ? stat.labelHe : stat.label}
      </span>
      <div className="flex-1 h-2 bg-mgsr-dark rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all duration-700 ease-out`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className={`w-12 text-right text-xs font-bold ${valColor} shrink-0 tabular-nums`}>
        {displayVal}
      </span>
    </div>
  );
}

function RatingRing({ rating }: { rating: number }) {
  const pct = Math.min((rating / 10) * 100, 100);
  const color = rating >= 7.5 ? '#FBBF24' : rating >= 7.0 ? '#4ADE80' : rating >= 6.5 ? '#4DB6AC' : '#6B7280';
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="relative w-[80px] h-[80px] flex items-center justify-center">
      <svg className="absolute inset-0" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" fill="none" stroke="#253545" strokeWidth="4" />
        <circle
          cx="40" cy="40" r="36" fill="none"
          stroke={color} strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 40 40)"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <span className="font-display font-extrabold text-xl z-10" style={{ color }}>
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

interface PlayerStatsPanelProps {
  playerUrl?: string;
  playerName?: string;
  playerClub?: string;
  playerPosition?: string;
  isRtl?: boolean;
}

export default function PlayerStatsPanel({
  playerUrl,
  playerName,
  playerClub,
  playerPosition,
}: PlayerStatsPanelProps) {
  const { isRtl } = useLanguage();
  const [data, setData] = useState<PlayerStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playerUrl && !playerName) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (playerUrl) params.set('url', playerUrl);
    else if (playerName) params.set('name', playerName);
    if (playerClub) params.set('club', playerClub);

    fetch(`/api/scout/player-stats?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) {
            setError('not_found');
          } else {
            setError('failed');
          }
          return;
        }
        const json = await res.json();
        if (json.api_matched) {
          setData(json);
        } else {
          setError('not_enriched');
        }
      })
      .catch(() => setError('failed'))
      .finally(() => setLoading(false));
  }, [playerUrl, playerName, playerClub]);

  const posGroup = useMemo(() => {
    return classifyPosition(playerPosition || data?.position || '');
  }, [playerPosition, data?.position]);

  const coreStats = useMemo(() => CORE_STATS[posGroup] || CORE_STATS.FWD, [posGroup]);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="bg-mgsr-card border border-mgsr-border rounded-2xl p-5 animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-7 h-7 rounded-lg bg-mgsr-dark" />
          <div className="h-4 w-36 bg-mgsr-dark rounded" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-5 h-3 bg-mgsr-dark rounded" />
              <div className="w-28 h-3 bg-mgsr-dark rounded" />
              <div className="flex-1 h-2 bg-mgsr-dark rounded-full" />
              <div className="w-8 h-3 bg-mgsr-dark rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Error / empty states ── */
  if (error || !data) {
    return (
      <div className="bg-mgsr-card border border-mgsr-border rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <ApiBadge />
          <h3 className="text-sm font-display font-bold text-mgsr-text">
            {isRtl ? 'סטטיסטיקות ביצועים' : 'Performance Stats'}
          </h3>
        </div>
        <div className="text-center py-6">
          <div className="text-2xl mb-2">📊</div>
          <p className="text-sm text-mgsr-muted">
            {error === 'not_found'
              ? (isRtl ? 'השחקן לא נמצא במאגר' : 'Player not found in database')
              : error === 'not_enriched'
              ? (isRtl ? 'אין נתוני ביצועים עדיין' : 'No performance data available yet')
              : (isRtl ? 'טעינת הנתונים נכשלה' : 'Failed to load stats')}
          </p>
        </div>
      </div>
    );
  }

  const rating = data.api_rating;
  const appearances = data.api_appearances ?? 0;
  const minutes = data.api_minutes ?? 0;
  const goals = data.api_goals ?? 0;
  const assists = data.api_assists ?? 0;
  const season = data.api_season ?? 2025;
  const seasonLabel = `${season}/${String(season + 1).slice(-2)}`;
  const isLowerBetterKeys = new Set(['api_fouls_per90', 'api_conceded']);

  return (
    <div className="bg-mgsr-card border border-mgsr-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-mgsr-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ApiBadge />
            <div>
              <h3 className="text-sm font-display font-bold text-mgsr-text">
                {isRtl ? 'סטטיסטיקות ביצועים' : 'Performance Stats'}
              </h3>
              <p className="text-[10px] text-mgsr-muted mt-0.5">
                {data.api_league || data.league} · {seasonLabel}
              </p>
            </div>
          </div>
          {rating != null && rating > 0 && <RatingRing rating={rating} />}
        </div>
      </div>

      {/* Overview chips */}
      <div className="px-5 py-3 border-b border-mgsr-border/30">
        <div className="grid grid-cols-4 gap-2">
          <OverviewChip label={isRtl ? 'הופעות' : 'Apps'} value={appearances} icon="🏟️" />
          <OverviewChip label={isRtl ? 'דקות' : 'Mins'} value={minutes.toLocaleString()} icon="⏱️" />
          <OverviewChip label={isRtl ? 'שערים' : 'Goals'} value={goals} icon="⚽" />
          <OverviewChip label={isRtl ? 'בישולים' : 'Assists'} value={assists} icon="👟" />
        </div>
      </div>

      {/* Position-specific core stats */}
      <div className="px-4 py-4 space-y-0.5">
        <p className="text-[10px] text-mgsr-muted uppercase tracking-wider mb-2 px-1">
          {isRtl ? 'מדדי מפתח לפי עמדה' : 'Key Metrics by Position'}
        </p>
        {coreStats.map((stat) => {
          const raw = data[stat.key as keyof PlayerStatsData];
          const val = typeof raw === 'number' ? raw : undefined;
          // Skip rating from bars since we show it as a ring
          if (stat.key === 'api_rating') return null;
          return (
            <StatRow
              key={stat.key}
              stat={stat}
              value={val}
              isRtl={isRtl}
              isLowerBetter={isLowerBetterKeys.has(stat.key)}
            />
          );
        })}
      </div>

      {/* Secondary Stats — expandable */}
      <SecondaryStats data={data} posGroup={posGroup} isRtl={isRtl} />

      {/* Footer */}
      <div className="px-5 py-2.5 border-t border-mgsr-border/30 flex items-center justify-between">
        <span className="text-[10px] text-mgsr-muted/60">
          {data.api_team && `${data.api_team} · `}API-Football
        </span>
        {data.api_photo && (
          <img src={data.api_photo} alt="" className="w-6 h-6 rounded-full opacity-50" />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Secondary Stats (expandable)                                      */
/* ------------------------------------------------------------------ */

function SecondaryStats({
  data,
  posGroup,
  isRtl,
}: {
  data: PlayerStatsData;
  posGroup: PosGroup;
  isRtl: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const secondaryDefs: { label: string; labelHe: string; value: string }[] = useMemo(() => {
    const s: { label: string; labelHe: string; value: string }[] = [];

    // Add stats NOT already shown in core
    const coreKeys = new Set((CORE_STATS[posGroup] || []).map((d) => d.key));

    if (!coreKeys.has('api_goals_per90') && data.api_goals_per90)
      s.push({ label: 'Goals / 90', labelHe: 'שערים / 90', value: data.api_goals_per90.toFixed(2) });
    if (!coreKeys.has('api_assists_per90') && data.api_assists_per90)
      s.push({ label: 'Assists / 90', labelHe: 'בישולים / 90', value: data.api_assists_per90.toFixed(2) });
    if (!coreKeys.has('api_goal_contributions_per90') && data.api_goal_contributions_per90)
      s.push({ label: 'G+A / 90', labelHe: 'שערים+בישולים / 90', value: data.api_goal_contributions_per90.toFixed(2) });
    if (!coreKeys.has('api_shots_per90') && data.api_shots_per90)
      s.push({ label: 'Shots / 90', labelHe: 'בעיטות / 90', value: data.api_shots_per90.toFixed(2) });
    if (!coreKeys.has('api_shots_on_target_per90') && data.api_shots_on_target_per90)
      s.push({ label: 'On Target / 90', labelHe: 'למסגרת / 90', value: data.api_shots_on_target_per90.toFixed(2) });
    if (!coreKeys.has('api_goals_per_shot') && data.api_goals_per_shot)
      s.push({ label: 'Conversion', labelHe: 'אחוז המרה', value: `${(data.api_goals_per_shot * 100).toFixed(0)}%` });
    if (!coreKeys.has('api_key_passes_per90') && data.api_key_passes_per90)
      s.push({ label: 'Key Passes / 90', labelHe: 'מסירות מפתח / 90', value: data.api_key_passes_per90.toFixed(2) });
    if (!coreKeys.has('api_passes_accuracy') && data.api_passes_accuracy)
      s.push({ label: 'Pass Accuracy', labelHe: 'דיוק מסירות', value: `${data.api_passes_accuracy.toFixed(0)}%` });
    if (!coreKeys.has('api_dribbles_success_per90') && data.api_dribbles_success_per90)
      s.push({ label: 'Dribbles / 90', labelHe: 'כדרורים / 90', value: data.api_dribbles_success_per90.toFixed(2) });
    if (!coreKeys.has('api_tackles_interceptions_per90') && data.api_tackles_interceptions_per90)
      s.push({ label: 'Tackles+Int / 90', labelHe: 'נטילות+יירוטים / 90', value: data.api_tackles_interceptions_per90.toFixed(2) });
    if (!coreKeys.has('api_blocks_per90') && data.api_blocks_per90)
      s.push({ label: 'Blocks / 90', labelHe: 'חסימות / 90', value: data.api_blocks_per90.toFixed(2) });
    if (!coreKeys.has('api_duels_won_pct') && data.api_duels_won_pct)
      s.push({ label: 'Duels Won', labelHe: 'דו-קרבות', value: `${data.api_duels_won_pct.toFixed(0)}%` });
    if (!coreKeys.has('api_fouled_per90') && data.api_fouled_per90)
      s.push({ label: 'Fouled / 90', labelHe: 'עבירות שנפלו / 90', value: data.api_fouled_per90.toFixed(2) });
    if (!coreKeys.has('api_fouls_per90') && data.api_fouls_per90)
      s.push({ label: 'Fouls / 90', labelHe: 'עבירות / 90', value: data.api_fouls_per90.toFixed(2) });
    if (data.api_cards_yellow)
      s.push({ label: 'Yellow Cards', labelHe: 'כרטיסים צהובים', value: String(data.api_cards_yellow) });
    if (data.api_cards_red)
      s.push({ label: 'Red Cards', labelHe: 'כרטיסים אדומים', value: String(data.api_cards_red) });
    if (data.api_penalty_scored)
      s.push({ label: 'Penalties Scored', labelHe: 'פנדלים שהוכנסו', value: String(data.api_penalty_scored) });

    return s;
  }, [data, posGroup]);

  if (secondaryDefs.length === 0) return null;

  return (
    <div className="border-t border-mgsr-border/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-2.5 flex items-center justify-between text-xs text-mgsr-muted hover:text-mgsr-text transition-colors"
      >
        <span>{isRtl ? 'כל הסטטיסטיקות' : 'All Statistics'}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-5 pb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 animate-[fadeIn_0.2s_ease-out]">
          {secondaryDefs.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1">
              <span className="text-[11px] text-mgsr-muted truncate">
                {isRtl ? s.labelHe : s.label}
              </span>
              <span className="text-[11px] font-semibold text-mgsr-text tabular-nums ml-2">
                {s.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
