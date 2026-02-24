'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
import { aiScoutSearch, type ScoutPlayerSuggestion } from '@/lib/scoutApi';

function shortenPosition(pos: string | undefined): string {
  if (!pos?.trim()) return '—';
  const p = pos.trim();
  if (p.includes('Centre-Forward') || p.includes('Center-Forward')) return 'CF';
  if (p.includes('Second Striker')) return 'SS';
  if (p.includes('Centre-Back') || p.includes('Center-Back')) return 'CB';
  if (p.includes('Left-Back')) return 'LB';
  if (p.includes('Right-Back')) return 'RB';
  if (p.includes('Defensive Midfield')) return 'DM';
  if (p.includes('Central Midfield')) return 'CM';
  if (p.includes('Attacking Midfield')) return 'AM';
  if (p.includes('Left Wing') || p.includes('Left Winger')) return 'LW';
  if (p.includes('Right Wing') || p.includes('Right Winger')) return 'RW';
  if (p.includes('Goalkeeper')) return 'GK';
  return p.split(' - ').pop() || p;
}

const EXAMPLE_QUERIES_EN = [
  'find me 20 strikers up to 26 years old that are very fast and with at least 5 goals last season',
  'young left wingers under 23 with pace',
  'experienced center backs over 28',
];

const EXAMPLE_QUERIES_HE = [
  'תמצא לי 10 חלוצים מהירים עם דריבל טוב עד גיל 23 שכבשו לפחות 5 שערים בעונה הקודמת שמתאימים לשוק הישראלי',
  'מצא לי 20 חלוצים עד גיל 26 שהם מהירים מאוד עם לפחות 5 שערים בעונה שעברה',
  'כנפיים שמאליות צעירות מתחת ל-23 עם מהירות',
  'בלמים מנוסים מעל 28',
];

export default function AiScoutPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang } = useLanguage();
  const router = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Warm scout server on page load (reduces cold start when user searches)
  useEffect(() => {
    if (user) fetch('/api/scout/warm').catch(() => {});
  }, [user]);
  const [results, setResults] = useState<ScoutPlayerSuggestion[]>([]);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [leagueInfo, setLeagueInfo] = useState<{
    leagueName: string;
    avgEuro: number;
    minEuro: number;
    maxEuro: number;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionTest, setConnectionTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [requestedTotal, setRequestedTotal] = useState<number | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [seenUrls, setSeenUrls] = useState<string[]>([]);
  const [searchingOther, setSearchingOther] = useState(false);

  const runConnectionTest = async () => {
    setConnectionTest(null);
    try {
      const r = await fetch('/api/scout/search/test');
      const j = await r.json();
      setConnectionTest({
        ok: j.ok && (j.resultCount ?? 0) > 0,
        msg: j.ok
          ? `${j.resultCount ?? 0} results from scout server (${j.elapsedMs}ms)`
          : j.error || `Status ${j.status}`,
      });
    } catch (e) {
      setConnectionTest({ ok: false, msg: String(e) });
    }
  };

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    setResults([]);
    setInterpretation(null);
    setLeagueInfo(null);
    setHasMore(false);
    setRequestedTotal(null);
    setSeenUrls([]);
    try {
      // Progressive: first request gets 5 results (faster). Demo mode = instant mock data.
      const data = await aiScoutSearch(q, lang, true, demoMode);
      setResults(data.players);
      setInterpretation(data.interpretation ?? null);
      setLeagueInfo(data.leagueInfo ?? null);
      setHasMore(data.hasMore ?? false);
      setRequestedTotal(data.requestedTotal ?? null);
      // Track seen player URLs for "Search Other Options"
      const urls = data.players
        .map((p) => p.transfermarktUrl)
        .filter((u): u is string => !!u);
      setSeenUrls(urls);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleLoadMore = async () => {
    const q = query.trim();
    if (!q || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await aiScoutSearch(q, lang, false, demoMode);
      setResults(data.players);
      setInterpretation(data.interpretation ?? null);
      setHasMore(false);
      // Accumulate all URLs from the full result set
      const urls = data.players
        .map((p) => p.transfermarktUrl)
        .filter((u): u is string => !!u);
      setSeenUrls(urls);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleSearchOtherOptions = async () => {
    const q = query.trim();
    if (!q || searchingOther) return;
    setSearchingOther(true);
    setError(null);
    try {
      // Send all previously seen URLs so server excludes them
      const data = await aiScoutSearch(q, lang, false, demoMode, seenUrls);
      setResults(data.players);
      setInterpretation(data.interpretation ?? null);
      setLeagueInfo(data.leagueInfo ?? null);
      setHasMore(data.hasMore ?? false);
      setRequestedTotal(data.requestedTotal ?? null);
      // Accumulate new URLs into seenUrls (keep old ones too)
      const newUrls = data.players
        .map((p) => p.transfermarktUrl)
        .filter((u): u is string => !!u);
      setSeenUrls((prev) => [...prev, ...newUrls.filter((u) => !prev.includes(u))]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSearchingOther(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight">
            {t('ai_scout_title')}
          </h1>
          <p className="text-mgsr-muted mt-1 text-sm">
            {t('ai_scout_subtitle')}
          </p>
        </div>

        {/* Search */}
        <div className="rounded-2xl border border-mgsr-border bg-mgsr-card p-4 md:p-6 mb-6">
          <label htmlFor="ai-scout-query" className="sr-only">
            {t('ai_scout_placeholder')}
          </label>
          <textarea
            id="ai-scout-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('ai_scout_placeholder')}
            rows={3}
            dir="auto"
            className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder:text-mgsr-muted focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50 focus:border-mgsr-teal resize-none"
            disabled={searching}
          />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
            <label className="flex items-center gap-2 text-xs text-mgsr-muted cursor-pointer">
              <input
                type="checkbox"
                checked={demoMode}
                onChange={(e) => setDemoMode(e.target.checked)}
                className="rounded"
              />
              {lang === 'he' ? 'מצב דמו (תוצאות מיידיות לבדיקה)' : 'Demo mode (instant results for testing)'}
            </label>
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="shrink-0 px-6 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {searching ? (
                <>
                  <span className="w-4 h-4 border-2 border-mgsr-dark/30 border-t-mgsr-dark rounded-full animate-spin shrink-0" />
                  {t('ai_scout_searching')} — {t('ai_scout_searching_hint')}
                </>
              ) : (
                t('ai_scout_search')
              )}
            </button>
          </div>
        </div>

        {/* Example queries */}
        <div className="mb-6">
          <p className="text-sm text-mgsr-muted mb-2">{t('ai_scout_examples')}</p>
          <div className="flex flex-wrap gap-2">
            {(lang === 'he' ? EXAMPLE_QUERIES_HE : EXAMPLE_QUERIES_EN).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setQuery(ex)}
                className="text-xs px-3 py-1.5 rounded-lg bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <p>{error}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => fetch('/api/scout/warm').then(() => setError(null))}
                className="text-xs underline hover:no-underline"
              >
                {lang === 'he' ? 'הפעל שרת (warm) ונסה שוב' : 'Warm server & retry'}
              </button>
              <button
                type="button"
                onClick={runConnectionTest}
                className="text-xs underline hover:no-underline"
              >
                {lang === 'he' ? 'בדוק חיבור' : 'Test connection'}
              </button>
            </div>
          </div>
        )}

        {/* Connection test result */}
        {connectionTest && (
          <div
            className={`mb-6 p-4 rounded-xl border text-sm ${
              connectionTest.ok
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            {connectionTest.msg}
          </div>
        )}

        {/* League market info - shown when filtering by league */}
        {leagueInfo && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/15 border-2 border-amber-500/50 shadow-lg">
            <p className="text-base font-bold text-amber-400 mb-2">
              {lang === 'he' ? 'ממוצע ערך שוק בליגה שביקשת' : 'League market average (used for filter)'}
            </p>
            <p className="text-sm text-mgsr-text" dir={lang === 'he' ? 'rtl' : 'ltr'}>
              {lang === 'he' ? (
                <>
                  <strong>{leagueInfo.leagueName}</strong>: ממוצע €{(leagueInfo.avgEuro / 1000).toFixed(0)}k
                  {' '}(רק שחקנים עם שווי). טווח סינון: €{(leagueInfo.minEuro / 1000).toFixed(0)}k – €{(leagueInfo.maxEuro / 1000).toFixed(0)}k (50%–200%).
                </>
              ) : (
                <>
                  <strong>{leagueInfo.leagueName}</strong>: avg €{(leagueInfo.avgEuro / 1000).toFixed(0)}k
                  {' '}(players with value only). Filter range: €{(leagueInfo.minEuro / 1000).toFixed(0)}k – €{(leagueInfo.maxEuro / 1000).toFixed(0)}k (50%–200%).
                </>
              )}
            </p>
          </div>
        )}

        {/* AI interpretation - show even with 0 results so user sees how query was parsed */}
        {interpretation && (
          <div className="mb-6 p-4 rounded-xl bg-mgsr-teal/10 border border-mgsr-teal/30">
            <p className="text-sm font-medium text-mgsr-teal mb-1">{t('ai_scout_interpretation')}</p>
            <p className="text-sm text-mgsr-text" dir={lang === 'he' ? 'rtl' : 'ltr'}>
              {interpretation}
            </p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="rounded-2xl border border-mgsr-border overflow-hidden bg-mgsr-card">
            <div className="px-4 py-3 border-b border-mgsr-border bg-mgsr-dark/30 flex items-center justify-between gap-2">
              <p className="font-semibold text-mgsr-text">
                {t('ai_scout_results_count').replace('{count}', String(results.length))}
              </p>
              <div className="flex items-center gap-2">
                {hasMore && requestedTotal != null && (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="text-sm px-3 py-1.5 rounded-lg bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 transition disabled:opacity-50"
                  >
                    {loadingMore
                      ? (lang === 'he' ? 'טוען...' : 'Loading...')
                      : lang === 'he'
                        ? `הרחב ל־${requestedTotal} שחקנים`
                        : `Load all ${requestedTotal} players`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSearchOtherOptions}
                  disabled={searchingOther}
                  className="text-sm px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {searchingOther ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin shrink-0" />
                      {lang === 'he' ? 'מחפש...' : 'Searching...'}
                    </>
                  ) : (
                    lang === 'he' ? 'חפש אפשרויות נוספות' : 'Search other options'
                  )}
                </button>
              </div>
            </div>
            <div className="divide-y divide-mgsr-border">
              {results.map((s) => {
                const url = s.transfermarktUrl;
                return (
                  <div
                    key={url || s.name}
                    className="flex flex-col gap-1 p-4 hover:bg-mgsr-dark/20 transition"
                  >
                    <div className="flex items-start gap-3">
                      {s.transfermarktUrl ? (
                        <a
                          href={s.transfermarktUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-0 hover:underline"
                        >
                          <p className="font-medium text-mgsr-text truncate">{s.name || '—'}</p>
                          <p className="text-sm text-mgsr-muted truncate">
                            {s.age ? t('players_age_display').replace('{age}', s.age) : '—'}
                            <span className="mx-1.5">·</span>
                            {shortenPosition(s.position)}
                            <span className="mx-1.5">·</span>
                            {s.marketValue || '—'}
                            {s.club && (
                              <>
                                <span className="mx-1.5">·</span>
                                {s.club}
                              </>
                            )}
                            {s.matchPercent != null && (
                              <>
                                <span className="mx-1.5">·</span>
                                {t('requests_online_match_score').replace('{pct}', String(s.matchPercent))}
                              </>
                            )}
                          </p>
                        </a>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-mgsr-text truncate">{s.name || '—'}</p>
                          <p className="text-sm text-mgsr-muted truncate">
                            {s.age ? t('players_age_display').replace('{age}', s.age) : '—'}
                            <span className="mx-1.5">·</span>
                            {shortenPosition(s.position)}
                            <span className="mx-1.5">·</span>
                            {s.marketValue || '—'}
                          </p>
                        </div>
                      )}
                    </div>
                    {s.scoutAnalysis && (
                      <div className="text-xs text-mgsr-muted mt-1.5 space-y-0.5" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                        {s.scoutAnalysis.split('\n').map((line, i) => (
                          <p key={i} className={i === 0 ? 'font-medium text-mgsr-text/80' : ''}>
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!searching && results.length === 0 && !error && query.trim() && (
          <div className="p-8 rounded-2xl bg-mgsr-card/50 border border-mgsr-border text-center">
            <p className="text-mgsr-muted">{t('ai_scout_no_results')}</p>
            <button
              type="button"
              onClick={runConnectionTest}
              className="mt-3 text-sm text-mgsr-teal hover:underline"
            >
              {lang === 'he' ? 'בדוק חיבור לשרת השחקנים' : 'Test scout server connection'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
