'use client';

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LigatHaalAnalysisResult, getLigatHaalAnalysis } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';

interface ForeignArrivalsPanelProps {
  leagueCode?: string;
}

const CHART_COLORS = [
  '#4DB6AC', '#26C6DA', '#29B6F6', '#42A5F5', '#5C6BC0',
  '#7E57C2', '#AB47BC', '#EC407A', '#EF5350', '#FF7043',
];

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return `€${value}`;
}

export default function ForeignArrivalsPanel({ leagueCode }: ForeignArrivalsPanelProps) {
  const { t, isRtl } = useLanguage();
  const [window, setWindow] = useState<'SUMMER_2025' | 'WINTER_2025_2026'>('WINTER_2025_2026');
  const [data, setData] = useState<LigatHaalAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableExpanded, setTableExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getLigatHaalAnalysis(window)
      .then(setData)
      .catch((err) => {
        console.error('Error fetching Ligat Ha\'al analysis:', err);
        setError(err instanceof Error ? err.message : 'Failed to load analysis');
      })
      .finally(() => setLoading(false));
  }, [window]);

  /* ── Skeleton loading (matches dashboard animate-pulse pattern) ── */
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {/* Window toggle skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 rounded-lg bg-mgsr-muted/20" />
          <div className="h-8 w-28 rounded-lg bg-mgsr-muted/20" />
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-4 rounded-xl bg-mgsr-dark/40 border border-mgsr-border/30">
              <div className="h-3 w-20 rounded bg-mgsr-muted/30 mb-3" />
              <div className="h-6 w-16 rounded bg-mgsr-muted/40 mb-2" />
              <div className="h-2.5 w-24 rounded bg-mgsr-muted/20" />
            </div>
          ))}
        </div>
        {/* Charts skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-64 rounded-xl bg-mgsr-dark/40 border border-mgsr-border/30" />
          <div className="h-64 rounded-xl bg-mgsr-dark/40 border border-mgsr-border/30" />
        </div>
        {/* Table skeleton */}
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-mgsr-dark/40 border border-mgsr-border/30">
              <div className="w-6 h-6 rounded-full bg-mgsr-muted/40 shrink-0" />
              <div className="h-4 flex-1 max-w-[120px] rounded bg-mgsr-muted/30" />
              <div className="h-4 w-16 rounded bg-mgsr-muted/20" />
              <div className="h-4 w-12 rounded bg-mgsr-muted/20" />
              <div className="h-4 w-20 rounded bg-mgsr-muted/20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error || !data) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
        <h3 className="font-semibold text-red-400 text-sm">{t('fa_error_title')}</h3>
        <p className="text-xs text-red-400/70 mt-1">{error || t('fa_error_no_data')}</p>
      </div>
    );
  }

  const { stats } = data;

  const countryData = Object.entries(stats.countByCountry)
    .map(([country, count]) => ({
      name: country,
      value: count,
      marketValue: stats.valueByCountry[country] || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const avgMarketValue = stats.totalCount > 0 ? stats.totalMarketValue / stats.totalCount : 0;

  const statCards = [
    { label: t('fa_total_arrivals'), value: String(stats.totalCount), sub: t('fa_foreign_players'), color: 'var(--mgsr-accent)' },
    { label: t('fa_total_spend'), value: formatCurrency(stats.totalSpend), sub: t('fa_transfer_fees'), color: '#29B6F6' },
    { label: t('fa_total_market_value'), value: formatCurrency(stats.totalMarketValue), sub: t('fa_combined_value'), color: '#AB47BC' },
    { label: t('fa_avg_market_value'), value: formatCurrency(avgMarketValue), sub: t('fa_per_player'), color: '#7E57C2' },
    { label: t('fa_median_age'), value: String(stats.medianAge), sub: t('fa_years_old'), color: '#FF7043' },
  ];

  return (
    <div className="space-y-5">
      {/* Window toggle */}
      <div className="flex items-center gap-2">
        {(['WINTER_2025_2026', 'SUMMER_2025'] as const).map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
              window === w
                ? 'bg-mgsr-teal/20 text-mgsr-teal border border-mgsr-teal/30'
                : 'text-mgsr-muted hover:text-mgsr-text border border-mgsr-border/50 hover:border-mgsr-border'
            }`}
          >
            {w === 'WINTER_2025_2026' ? t('fa_window_winter') : t('fa_window_summer')}
          </button>
        ))}
        <span className="text-xs text-mgsr-muted/50 hidden sm:inline">
          {t('fa_subtitle')}
        </span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statCards.map((card, i) => (
          <div key={i} className="p-3.5 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/40">
            <p className="text-[0.65rem] uppercase tracking-wider text-mgsr-muted font-medium">{card.label}</p>
            <p className="text-xl font-bold text-mgsr-text mt-1.5 tabular-nums" style={{ color: card.color }}>
              {card.value}
            </p>
            <p className="text-[0.6rem] text-mgsr-muted/60 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Country Breakdown - Bar chart */}
        <div className="p-4 md:p-5 rounded-xl bg-mgsr-dark/40 border border-mgsr-border/30">
          <h4 className="text-sm font-semibold text-mgsr-text mb-4 font-display">{t('fa_by_country')}</h4>
          {countryData.length > 0 ? (
            <div className="space-y-2.5">
              {(() => {
                const maxVal = Math.max(...countryData.map((d) => d.value), 1);
                return countryData.map((item, i) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="text-xs text-mgsr-text/80 truncate min-w-0">{item.name}</span>
                      <span className="text-xs font-semibold text-mgsr-text tabular-nums shrink-0">{item.value}</span>
                    </div>
                    <div className="h-5 bg-mgsr-dark rounded-md overflow-hidden">
                      <div
                        className="h-full rounded-md transition-all duration-500"
                        style={{
                          width: `${Math.max((item.value / maxVal) * 100, 6)}%`,
                          backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                          opacity: 0.8,
                        }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <p className="text-sm text-mgsr-muted text-center py-8">{t('fa_no_data')}</p>
          )}
        </div>

        {/* Market Value by Country - Pie chart */}
        <div className="p-4 md:p-5 rounded-xl bg-mgsr-dark/40 border border-mgsr-border/30">
          <h4 className="text-sm font-semibold text-mgsr-text mb-4 font-display">{t('fa_mv_by_country')}</h4>
          {countryData.length > 0 ? (
            <div>
              <div className="h-64 sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={countryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="marketValue"
                      stroke="none"
                    >
                      {countryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} opacity={0.85} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--mgsr-card)',
                        border: '1px solid var(--mgsr-card-border)',
                        borderRadius: '0.75rem',
                        color: 'var(--mgsr-text)',
                        fontSize: '0.75rem',
                      }}
                      itemStyle={{ color: 'var(--mgsr-text)' }}
                      labelStyle={{ color: 'var(--mgsr-text)' }}
                      formatter={(value: number | undefined, name?: string) => [formatCurrency(value ?? 0), name ?? '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend — outside fixed-height chart container */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 justify-center">
                {countryData.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-xs text-mgsr-muted">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-mgsr-muted text-center py-8">{t('fa_no_data')}</p>
          )}
        </div>
      </div>

      {/* Player Table — Expandable */}
      {data.players.length > 0 && (
        <div className="rounded-xl bg-mgsr-dark/40 border border-mgsr-border/30 overflow-hidden">
          <button
            onClick={() => setTableExpanded((prev) => !prev)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-mgsr-card/30 transition-colors"
          >
            <h4 className="text-sm font-semibold text-mgsr-text font-display">
              {t('fa_all_arrivals')}{' '}
              <span className="text-mgsr-muted font-normal">({data.players.length})</span>
            </h4>
            <svg
              className={`w-4 h-4 text-mgsr-muted transition-transform duration-200 ${tableExpanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {tableExpanded && (
          <div className="overflow-x-auto border-t border-mgsr-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mgsr-border/20">
                  <th className={`${isRtl ? 'text-right' : 'text-left'} py-2.5 px-3 text-[0.65rem] uppercase tracking-wider font-semibold text-mgsr-muted`}>{t('fa_col_player')}</th>
                  <th className={`${isRtl ? 'text-right' : 'text-left'} py-2.5 px-3 text-[0.65rem] uppercase tracking-wider font-semibold text-mgsr-muted hidden sm:table-cell`}>{t('fa_col_country')}</th>
                  <th className={`${isRtl ? 'text-right' : 'text-left'} py-2.5 px-3 text-[0.65rem] uppercase tracking-wider font-semibold text-mgsr-muted`}>{t('fa_col_age')}</th>
                  <th className={`${isRtl ? 'text-right' : 'text-left'} py-2.5 px-3 text-[0.65rem] uppercase tracking-wider font-semibold text-mgsr-muted hidden md:table-cell`}>{t('fa_col_pos')}</th>
                  <th className={`${isRtl ? 'text-right' : 'text-left'} py-2.5 px-3 text-[0.65rem] uppercase tracking-wider font-semibold text-mgsr-muted`}>{t('fa_col_club_joined')}</th>
                  <th className={`${isRtl ? 'text-right' : 'text-left'} py-2.5 px-3 text-[0.65rem] uppercase tracking-wider font-semibold text-mgsr-muted hidden lg:table-cell`}>{t('fa_col_from')}</th>
                  <th className={`${isRtl ? 'text-left' : 'text-right'} py-2.5 px-3 text-[0.65rem] uppercase tracking-wider font-semibold text-mgsr-muted`}>{t('fa_col_market_value')}</th>
                  <th className={`${isRtl ? 'text-left' : 'text-right'} py-2.5 px-3 text-[0.65rem] uppercase tracking-wider font-semibold text-mgsr-muted hidden sm:table-cell`}>{t('fa_col_fee')}</th>
                </tr>
              </thead>
              <tbody>
                {data.players
                  .sort((a, b) => b.marketValue - a.marketValue)
                  .map((player, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-mgsr-border/10 hover:bg-mgsr-card/40 transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {player.playerImage ? (
                            <img src={player.playerImage} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 border border-mgsr-border/30" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-mgsr-border/20 flex items-center justify-center text-[0.5rem] text-mgsr-muted shrink-0">⚽</div>
                          )}
                          <span className="text-sm font-medium text-mgsr-text truncate">
                            {player.playerName || t('fa_unknown')}
                          </span>
                          {player.playerNationalityFlag && (
                            <img src={player.playerNationalityFlag} alt="" className="w-4 h-3 shrink-0 sm:hidden" />
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          {player.playerNationalityFlag && (
                            <img src={player.playerNationalityFlag} alt="" className="w-4 h-3 shrink-0" />
                          )}
                          <span className="text-xs text-mgsr-muted">{player.playerNationality || '—'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-mgsr-muted tabular-nums">{player.playerAge || '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-mgsr-muted hidden md:table-cell">{player.playerPosition || '—'}</td>
                      <td className="py-2.5 px-3 text-xs font-medium text-mgsr-text">{player.clubJoinedName || '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-mgsr-muted/70 hidden lg:table-cell">{player.previousClub || '—'}</td>
                      <td className={`py-2.5 px-3 text-xs ${isRtl ? 'text-left' : 'text-right'} font-semibold text-mgsr-teal tabular-nums`}>
                        {player.marketValueFormatted || '—'}
                      </td>
                      <td className={`py-2.5 px-3 text-xs ${isRtl ? 'text-left' : 'text-right'} text-mgsr-muted hidden sm:table-cell`}>
                        {player.transferFee || '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-[0.6rem] text-mgsr-muted/40 text-center">
        {t('fa_last_updated')}: {new Date(data.cachedAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US')}
      </div>
    </div>
  );
}
