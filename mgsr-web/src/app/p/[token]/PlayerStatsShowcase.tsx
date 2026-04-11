'use client';

import type { SharedPlayerStats, SharedStatItem } from './types';

/**
 * Clean, professional API Football stats for shared player profiles.
 * Shows key numbers in a clear, scannable grid — no ambiguous progress bars.
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
  const accentBorder = isWomen ? 'border-[var(--women-rose)]/20' : 'border-mgsr-border';
  const accentText = isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal';
  const accentBg = isWomen ? 'bg-[var(--women-rose)]/10' : 'bg-mgsr-teal/10';

  const t = useHebrew
    ? {
        title: 'סטטיסטיקות עונה',
        appearances: 'הופעות',
        minutes: 'דקות',
        goals: 'שערים',
        assists: 'בישולים',
        per90: '/ 90 דק׳',
      }
    : {
        title: 'Season Statistics',
        appearances: 'Appearances',
        minutes: 'Minutes',
        goals: 'Goals',
        assists: 'Assists',
        per90: '/ 90 min',
      };

  const hasGoalsOrAssists = (stats.goals != null && stats.goals > 0) || (stats.assists != null && stats.assists > 0);

  const seasonLabel = stats.season ? `${stats.season}/${(stats.season + 1).toString().slice(-2)}` : '';

  return (
    <div dir={useHebrew ? 'rtl' : 'ltr'} className={`rounded-2xl bg-mgsr-card border ${accentBorder} overflow-hidden`}>
      <div className="p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider">{t.title}</h3>
            <p className="text-xs text-mgsr-muted/60 mt-0.5">
              {stats.league} {seasonLabel ? `· ${seasonLabel}` : ''}
            </p>
          </div>
        </div>

        {/* Top-line numbers */}
        <div className={`grid ${hasGoalsOrAssists ? 'grid-cols-4' : 'grid-cols-2'} gap-3 mb-5`}>
          <div className={`rounded-xl ${accentBg} px-4 py-3 text-center`}>
            <div className={`text-2xl font-bold tabular-nums ${accentText}`}>{stats.appearances}</div>
            <div className="text-[11px] text-mgsr-muted mt-0.5">{t.appearances}</div>
          </div>
          <div className={`rounded-xl ${accentBg} px-4 py-3 text-center`}>
            <div className={`text-2xl font-bold tabular-nums ${accentText}`}>{formatMinutes(stats.minutes)}</div>
            <div className="text-[11px] text-mgsr-muted mt-0.5">{t.minutes}</div>
          </div>
          {hasGoalsOrAssists && stats.goals != null && (
            <div className={`rounded-xl ${accentBg} px-4 py-3 text-center`}>
              <div className={`text-2xl font-bold tabular-nums ${accentText}`}>{stats.goals}</div>
              <div className="text-[11px] text-mgsr-muted mt-0.5">{t.goals}</div>
            </div>
          )}
          {hasGoalsOrAssists && stats.assists != null && (
            <div className={`rounded-xl ${accentBg} px-4 py-3 text-center`}>
              <div className={`text-2xl font-bold tabular-nums ${accentText}`}>{stats.assists}</div>
              <div className="text-[11px] text-mgsr-muted mt-0.5">{t.assists}</div>
            </div>
          )}
        </div>

        {/* Stats list — clean rows */}
        <div className="space-y-0 divide-y divide-mgsr-border/40">
          {stats.stats.map((stat) => (
            <StatRow key={stat.key} stat={stat} useHebrew={useHebrew} isWomen={isWomen} per90Label={t.per90} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatRow({ stat, useHebrew, isWomen, per90Label }: { stat: SharedStatItem; useHebrew: boolean; isWomen: boolean; per90Label: string }) {
  const label = useHebrew ? stat.labelHe : stat.label;
  const displayValue = formatStatValue(stat.value, stat.format);

  const tierBadge: Record<string, { text: string; bg: string; label: string; labelHe: string }> = {
    elite: { text: 'text-yellow-400', bg: 'bg-yellow-500/15', label: 'Elite', labelHe: 'עילית' },
    great: { text: 'text-green-400', bg: 'bg-green-500/15', label: 'Great', labelHe: 'מצוין' },
    good: { text: 'text-teal-400', bg: 'bg-teal-500/15', label: 'Good', labelHe: 'טוב' },
  };

  const tier = tierBadge[stat.tier] || tierBadge.good;
  const accentText = isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal';

  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="text-base w-6 text-center shrink-0">{stat.icon}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-mgsr-text font-medium">{label}</span>
      </div>
      <span className={`text-sm font-bold tabular-nums ${accentText}`}>
        {displayValue}
      </span>
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${tier.bg} ${tier.text} shrink-0`}>
        {useHebrew ? tier.labelHe : tier.label}
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
  return mins.toLocaleString('en-US');
}
