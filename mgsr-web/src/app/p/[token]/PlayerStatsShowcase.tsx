'use client';

import type { SharedPlayerStats, SharedStatItem } from './types';

/**
 * Position-aware API Football stats showcase for shared player profiles.
 * Only shows stats that are impressive (good/great/elite tier).
 * Beautiful, scannable UI matching the GPS performance section style.
 */
export function PlayerStatsShowcase({
  stats,
  isWomen = false,
  useHebrew = false,
}: {
  stats: SharedPlayerStats;
  isWomen?: boolean;
  useHebrew?: boolean;
}) {
  const accent = isWomen ? 'from-purple-500 to-amber-400' : 'from-teal-500 to-blue-500';
  const accentText = isWomen ? 'text-purple-400' : 'text-teal-400';

  const t = useHebrew
    ? {
        title: 'סטטיסטיקות עונה',
        appearances: 'הופעות',
        minutes: 'דקות',
        season: 'עונה',
        rating: 'דירוג',
      }
    : {
        title: 'Season Statistics',
        appearances: 'Apps',
        minutes: 'Minutes',
        season: 'Season',
        rating: 'Rating',
      };

  const seasonLabel = stats.season ? `${stats.season}/${(stats.season + 1).toString().slice(-2)}` : '';

  return (
    <div dir={useHebrew ? 'rtl' : 'ltr'} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-mgsr-card via-mgsr-card to-mgsr-bg border border-mgsr-border">
      {/* Subtle gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-[0.03] pointer-events-none`} />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${accent} flex items-center justify-center shrink-0`}>
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-mgsr-text">{t.title}</h3>
              <p className="text-xs text-mgsr-muted">
                {stats.league} {seasonLabel ? `· ${seasonLabel}` : ''}
              </p>
            </div>
          </div>
          {/* API badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-mgsr-teal/10 border border-mgsr-teal/20">
            <span className="text-mgsr-teal text-[10px] font-bold tracking-wider">API</span>
          </div>
        </div>

        {/* Overview chips */}
        <div className="flex flex-wrap gap-2 mb-5">
          {stats.rating != null && stats.rating > 0 && (
            <OverviewChip
              label={t.rating}
              value={stats.rating.toFixed(2)}
              color={stats.rating >= 7.5 ? 'yellow' : stats.rating >= 7.0 ? 'green' : stats.rating >= 6.5 ? 'teal' : 'gray'}
            />
          )}
          <OverviewChip label={t.appearances} value={String(stats.appearances)} color="teal" />
          <OverviewChip label={t.minutes} value={formatMinutes(stats.minutes)} color="blue" />
        </div>

        {/* Stats grid — impressive stats only */}
        <div className="space-y-1.5">
          {stats.stats.map((stat) => (
            <StatBar key={stat.key} stat={stat} useHebrew={useHebrew} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OverviewChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'yellow' | 'green' | 'teal' | 'blue' | 'gray';
}) {
  const colors: Record<string, string> = {
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    teal: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    gray: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colors[color]}`}>
      <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function StatBar({ stat, useHebrew }: { stat: SharedStatItem; useHebrew: boolean }) {
  const label = useHebrew ? stat.labelHe : stat.label;
  const displayValue = formatStatValue(stat.value, stat.format);

  const tierColors: Record<string, { text: string; bar: string; bg: string }> = {
    elite: {
      text: 'text-yellow-400',
      bar: 'from-yellow-400 to-amber-500',
      bg: 'bg-yellow-500/[0.06]',
    },
    great: {
      text: 'text-green-400',
      bar: 'from-green-400 to-emerald-500',
      bg: 'bg-green-500/[0.06]',
    },
    good: {
      text: 'text-teal-400',
      bar: 'from-teal-400 to-teal-500',
      bg: 'bg-teal-500/[0.06]',
    },
  };

  const colors = tierColors[stat.tier] || tierColors.good;

  // Bar width: scale by reasonable max for display purposes
  const barPct = Math.min(95, Math.max(15, getBarPercent(stat)));

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl ${colors.bg} border border-white/[0.04]`}>
      <span className="text-sm w-5 text-center shrink-0">{stat.icon}</span>
      <span className="flex-1 text-xs text-mgsr-text font-medium truncate min-w-0">
        {label}
      </span>
      <div className="w-20 sm:w-28 h-1.5 bg-mgsr-dark/60 rounded-full overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${colors.bar} transition-all duration-700`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <span className={`w-14 text-right text-xs font-bold ${colors.text} tabular-nums shrink-0`}>
        {displayValue}
      </span>
    </div>
  );
}

function formatStatValue(value: number, format: string): string {
  switch (format) {
    case 'rating':
      return value.toFixed(2);
    case 'decimal':
      return value.toFixed(2);
    case 'pct':
      return value <= 1 ? `${(value * 100).toFixed(0)}%` : `${value.toFixed(0)}%`;
    case 'number':
      return String(Math.round(value));
    default:
      return String(value);
  }
}

function formatMinutes(mins: number): string {
  if (mins >= 1000) return `${(mins / 1000).toFixed(1)}k`;
  return String(mins);
}

function getBarPercent(stat: SharedStatItem): number {
  const v = stat.value;
  // Scale each stat type to a reasonable visual bar
  switch (stat.format) {
    case 'pct':
      return v <= 1 ? v * 100 : v;
    case 'rating':
      return (v / 10) * 100;
    case 'decimal': {
      // For per-90 stats, different ranges
      if (stat.key.includes('goals_per90')) return Math.min(100, (v / 0.8) * 100);
      if (stat.key.includes('goal_contributions')) return Math.min(100, (v / 1.0) * 100);
      if (stat.key.includes('tackles') || stat.key.includes('interceptions')) return Math.min(100, (v / 5.0) * 100);
      if (stat.key.includes('key_passes')) return Math.min(100, (v / 3.0) * 100);
      if (stat.key.includes('dribbles')) return Math.min(100, (v / 3.0) * 100);
      if (stat.key.includes('saves')) return Math.min(100, (v / 5.0) * 100);
      if (stat.key.includes('blocks')) return Math.min(100, (v / 2.0) * 100);
      if (stat.key.includes('shots')) return Math.min(100, (v / 3.0) * 100);
      if (stat.key.includes('fouled')) return Math.min(100, (v / 3.0) * 100);
      return Math.min(100, (v / 3.0) * 100);
    }
    default:
      return Math.min(100, v);
  }
}
