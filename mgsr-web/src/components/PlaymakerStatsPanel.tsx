'use client';

import { useEffect, useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type {
  PmPlayerData,
  PmMatchRating,
  PmCareerSeason,
  PmMarketValueEntry,
} from '@/lib/playmakerstats';

/* ── Color helpers ── */

function ratingColor(r: number | null): string {
  if (r === null) return 'text-mgsr-muted';
  if (r >= 7.0) return 'text-mgsr-teal';
  if (r >= 6.0) return 'text-amber-400';
  return 'text-red-400';
}

function resultClasses(r: 'W' | 'D' | 'L'): string {
  if (r === 'W') return 'bg-emerald-500/15 text-emerald-400';
  if (r === 'D') return 'bg-amber-400/15 text-amber-400';
  return 'bg-red-400/15 text-red-400';
}

function ringPct(avg: number): number {
  // 1–10 scale → percentage (6.5 → ~65%)
  return Math.min(Math.max(((avg - 1) / 9) * 100, 0), 100);
}

/* ── Date formatter: YYYY/MM/DD → DD/MM/YYYY ── */
function formatMatchDate(raw: string): string {
  const parts = raw.split('/');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return raw;
}

/* ── Skeleton ── */

function Skeleton() {
  return (
    <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-5 h-5 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-mgsr-muted">Loading PlaymakerStats data…</span>
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-mgsr-dark/40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

/* ── Props ── */

interface Props {
  playerName: string;
  pmUrl?: string;
  age?: string;
  club?: string;
  isRtl?: boolean;
  /** Callback when MV history data is found — parent can merge into existing chart */
  onMarketValueHistory?: (entries: PmMarketValueEntry[]) => void;
}

export default function PlaymakerStatsPanel({ playerName, pmUrl, age, club, isRtl, onMarketValueHistory }: Props) {
  const { t } = useLanguage();
  const [data, setData] = useState<PmPlayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllMatches, setShowAllMatches] = useState(false);

  useEffect(() => {
    if (!playerName?.trim() && !pmUrl) return;
    setLoading(true);
    setData(null);
    setError(null);

    const params = new URLSearchParams();
    if (pmUrl) params.set('url', pmUrl);
    else params.set('name', playerName.trim());
    if (age) params.set('age', age);
    if (club) params.set('club', club);

    fetch(`/api/playmakerstats/player?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.found) {
          setData(json as PmPlayerData);
          if (onMarketValueHistory && json.marketValueHistory?.length) {
            onMarketValueHistory(json.marketValueHistory);
          }
        } else {
          setError(json.message || 'Not found');
        }
      })
      .catch(() => setError('Failed to fetch'))
      .finally(() => setLoading(false));
  }, [playerName, pmUrl, age, club]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleMatches = useMemo(() => {
    if (!data?.matchRatings) return [];
    return showAllMatches ? data.matchRatings : data.matchRatings.slice(0, 8);
  }, [data?.matchRatings, showAllMatches]);

  if (loading) return <Skeleton />;
  if (error || !data) return null; // Silently hide if no data — not a broken panel

  const { careerSeasons, matchRatings, averageRating, ratingCount } = data;

  // Fallback: if careerTotals.games is 0 but matchRatings exist, use match count
  const careerTotals = {
    ...data.careerTotals,
    games: data.careerTotals.games || matchRatings.length,
  };

  const hasRatings = matchRatings.length > 0 && ratingCount > 0;
  const hasMatches = matchRatings.length > 0;

  return (
    <div className="space-y-6">
      {/* ═══ Match Performance / Recent Games ═══ */}
      {hasMatches && (
        <div className="rounded-2xl bg-mgsr-card border border-mgsr-border overflow-hidden">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-mgsr-border">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-display font-bold text-mgsr-text tracking-wide">
                ⚡ {isRtl ? (hasRatings ? 'דירוגי ביצועים במשחקים' : 'משחקים אחרונים') : (hasRatings ? 'Match Performance' : 'Recent Games')}
              </h3>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-mgsr-teal/10 text-mgsr-teal">
                PlaymakerStats
              </span>
            </div>
            <span className="text-xs text-mgsr-muted">
              {careerSeasons[0]?.season || ''}
            </span>
          </div>

          <div className="p-5">
            <div className={`grid grid-cols-1 ${hasRatings ? 'md:grid-cols-[180px_1fr]' : ''} gap-6`}>
              {/* Avg rating ring — only when there are actual ratings */}
              {hasRatings && (
              <div className="flex flex-col items-center">
                <div className="relative w-[120px] h-[120px] flex items-center justify-center">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="#253545" strokeWidth="5" />
                    {averageRating !== null && (
                      <circle
                        cx="60" cy="60" r="52" fill="none"
                        stroke="#4DB6AC"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 52}
                        strokeDashoffset={2 * Math.PI * 52 * (1 - ringPct(averageRating) / 100)}
                        className="transition-all duration-1000 ease-out"
                        style={{ filter: 'drop-shadow(0 0 6px rgba(77,182,172,0.4))' }}
                      />
                    )}
                  </svg>
                  <span className="font-display font-extrabold text-3xl text-mgsr-teal z-10">
                    {averageRating?.toFixed(1) ?? '—'}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-[0.1em] text-mgsr-muted mt-2">
                  {isRtl ? 'ממוצע דירוג' : 'Avg Rating'}
                </span>
                <span className="text-[10px] text-mgsr-muted">
                  {ratingCount} {isRtl ? 'משחקים עם דירוג' : 'rated matches'}
                </span>

                {/* Quick stats under ring */}
                <div className="flex gap-5 mt-4">
                  <div className="text-center">
                    <div className="font-display font-extrabold text-lg text-mgsr-text">{careerTotals.games}</div>
                    <div className="text-[9px] uppercase text-mgsr-muted tracking-wider">{isRtl ? 'משחקים' : 'Games'}</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display font-extrabold text-lg text-mgsr-text">{careerTotals.goals}</div>
                    <div className="text-[9px] uppercase text-mgsr-muted tracking-wider">{isRtl ? 'שערים' : 'Goals'}</div>
                  </div>
                </div>
              </div>
              )}

              {/* Summary stats when no ratings */}
              {!hasRatings && (
                <div className="flex items-center gap-5 mb-2">
                  <div className="text-center px-4 py-2 rounded-xl bg-mgsr-dark/40 border border-mgsr-border">
                    <div className="font-display font-extrabold text-lg text-mgsr-text">{careerTotals.games}</div>
                    <div className="text-[9px] uppercase text-mgsr-muted tracking-wider">{isRtl ? 'משחקים' : 'Games'}</div>
                  </div>
                  <div className="text-center px-4 py-2 rounded-xl bg-mgsr-dark/40 border border-mgsr-border">
                    <div className="font-display font-extrabold text-lg text-mgsr-text">{careerTotals.goals}</div>
                    <div className="text-[9px] uppercase text-mgsr-muted tracking-wider">{isRtl ? 'שערים' : 'Goals'}</div>
                  </div>
                </div>
              )}

              {/* Match-by-match list */}
              <div className="flex flex-col gap-1.5 max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#253545 transparent' }}>
                {visibleMatches.map((m, i) => (
                  <div
                    key={i}
                    dir="ltr"
                    className={`grid ${hasRatings ? 'grid-cols-[72px_1fr_auto_38px]' : 'grid-cols-[72px_1fr_auto]'} items-center gap-4 px-3 py-2 rounded-lg bg-mgsr-dark/40 hover:bg-mgsr-dark/60 transition-colors`}
                  >
                    <span className="font-mono text-[11px] text-mgsr-muted">{formatMatchDate(m.date)}</span>
                    <div className="flex items-center gap-1.5 text-[13px] min-w-0 overflow-hidden">
                      <span className="truncate text-mgsr-text">{m.homeTeam}</span>
                      <span className="text-mgsr-muted text-[10px] shrink-0">vs</span>
                      <span className="truncate text-mgsr-text">{m.awayTeam}</span>
                    </div>
                    <span className={`font-mono text-[11px] px-2 py-0.5 rounded-md font-semibold ${resultClasses(m.result)}`}>
                      {m.score}
                    </span>
                    {hasRatings && (
                    <span className={`font-display font-bold text-center ${ratingColor(m.rating)}`}>
                      {m.rating?.toFixed(1) ?? '—'}
                    </span>
                    )}
                  </div>
                ))}
                {matchRatings.length > 8 && !showAllMatches && (
                  <button
                    onClick={() => setShowAllMatches(true)}
                    className="text-xs text-mgsr-teal hover:text-mgsr-teal/80 transition py-2 text-center"
                  >
                    {isRtl ? `הצג את כל ${matchRatings.length} המשחקים` : `Show all ${matchRatings.length} matches`}
                  </button>
                )}
              </div>
            </div>

            {/* Rating sparkline */}
            {ratingCount >= 3 && (
              <div className="mt-4 px-3 py-2.5 rounded-lg bg-mgsr-dark/40 border border-mgsr-border/50 flex items-center gap-4">
                <span className="text-[10px] uppercase tracking-[0.08em] text-mgsr-muted shrink-0">
                  {isRtl ? 'מגמת דירוג' : 'Rating Trend'}
                </span>
                <div className="flex items-end gap-[3px] h-6 flex-1">
                  {matchRatings
                    .filter((m) => m.rating !== null)
                    .reverse()
                    .map((m, i) => {
                      const pct = ((m.rating! - 4) / 6) * 100;
                      const bg = m.rating! >= 7 ? '#4DB6AC' : m.rating! >= 6 ? '#FFB74D' : '#EF5350';
                      return (
                        <div
                          key={i}
                          className="rounded-sm flex-1 max-w-[6px]"
                          style={{ height: `${Math.max(pct, 8)}%`, background: bg }}
                        />
                      );
                    })}
                </div>
                <div className="flex gap-3 shrink-0">
                  <span className="text-[10px] text-mgsr-muted">
                    {isRtl ? 'גבוה' : 'High'}: <strong className="text-mgsr-teal">
                      {Math.max(...matchRatings.filter((m) => m.rating !== null).map((m) => m.rating!)).toFixed(1)}
                    </strong>
                  </span>
                  <span className="text-[10px] text-mgsr-muted">
                    {isRtl ? 'נמוך' : 'Low'}: <strong className="text-red-400">
                      {Math.min(...matchRatings.filter((m) => m.rating !== null).map((m) => m.rating!)).toFixed(1)}
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Career Statistics ═══ */}
      {careerSeasons.length > 0 && (
        <div className="rounded-2xl bg-mgsr-card border border-mgsr-border overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-mgsr-border">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-display font-bold text-mgsr-text tracking-wide">
                📊 {isRtl ? 'סטטיסטיקות קריירה' : 'Career Statistics'}
              </h3>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-mgsr-teal/10 text-mgsr-teal">
                PlaymakerStats
              </span>
            </div>
          </div>

          <div className="p-5">
            {/* Totals row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="text-center py-3.5 rounded-xl bg-mgsr-dark/40 border border-mgsr-border">
                <div className="font-display font-extrabold text-2xl text-mgsr-text">{careerTotals.games}</div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-mgsr-muted mt-1">
                  {isRtl ? 'משחקים' : 'Games'}
                </div>
                {careerTotals.starts > 0 && (
                  <div className="font-mono text-[10px] text-mgsr-muted">{careerTotals.starts} {isRtl ? 'התחלות' : 'starts'}</div>
                )}
              </div>
              <div className="text-center py-3.5 rounded-xl bg-mgsr-dark/40 border border-mgsr-border">
                <div className="font-display font-extrabold text-2xl text-mgsr-teal">{careerTotals.goals}</div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-mgsr-muted mt-1">
                  {isRtl ? 'שערים' : 'Goals'}
                </div>
                {careerTotals.goalsPerGame > 0 && (
                  <div className="font-mono text-[10px] text-mgsr-muted">{careerTotals.goalsPerGame}/game</div>
                )}
              </div>
              <div className="text-center py-3.5 rounded-xl bg-mgsr-dark/40 border border-mgsr-border">
                <div className="font-display font-extrabold text-2xl text-blue-400">{careerTotals.assists}</div>
                <div className="text-[10px] uppercase tracking-[0.08em] text-mgsr-muted mt-1">
                  {isRtl ? 'בישולים' : 'Assists'}
                </div>
              </div>
            </div>

            {/* Season-by-season table */}
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-mgsr-border">
                    <th className="text-left text-[10px] uppercase tracking-[0.08em] text-mgsr-muted font-semibold px-3 py-2">
                      {isRtl ? 'עונה' : 'Season'}
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-[0.08em] text-mgsr-muted font-semibold px-3 py-2">
                      {isRtl ? 'קבוצה' : 'Club'}
                    </th>
                    <th className="text-center text-[10px] uppercase tracking-[0.08em] text-mgsr-muted font-semibold px-3 py-2">G</th>
                    <th className="text-center text-[10px] uppercase tracking-[0.08em] text-mgsr-muted font-semibold px-3 py-2">⚽</th>
                    <th className="text-center text-[10px] uppercase tracking-[0.08em] text-mgsr-muted font-semibold px-3 py-2">🅰️</th>
                  </tr>
                </thead>
                <tbody>
                  {careerSeasons.map((s, i) => (
                    <tr key={i} className="border-b border-mgsr-border/30 hover:bg-mgsr-teal/[0.03] transition-colors">
                      <td className="px-3 py-2.5 font-mono text-xs text-mgsr-muted">{s.season}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-mgsr-text text-[13px]">{s.club}</span>
                          {s.isLoan && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400/12 text-amber-400 font-semibold">
                              LOAN
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-mgsr-text">{s.games ?? '—'}</td>
                      <td className={`px-3 py-2.5 text-center font-semibold ${(s.goals ?? 0) > 0 ? 'text-mgsr-teal' : 'text-mgsr-text'}`}>
                        {s.goals ?? '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-center font-semibold ${(s.assists ?? 0) > 0 ? 'text-blue-400' : 'text-mgsr-text'}`}>
                        {s.assists ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
