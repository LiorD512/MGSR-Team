'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, setDoc, addDoc, collection, onSnapshot, getDocs, query as firestoreQuery, where } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
import FindNextTab from '@/components/FindNextTab';
import { aiScoutSearch, type ScoutPlayerSuggestion } from '@/lib/scoutApi';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { db } from '@/lib/firebase';
import { getPlayerDetails, extractPlayerIdFromUrl } from '@/lib/api';

function samePlayer(url1: string, url2: string): boolean {
  const id1 = extractPlayerIdFromUrl(url1);
  const id2 = extractPlayerIdFromUrl(url2);
  return !!id1 && id1 === id2;
}

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
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'scout' | 'find-next'>(
    searchParams.get('tab') === 'find-next' ? 'find-next' : 'scout'
  );

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

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
  const [seenUrls, setSeenUrls] = useState<string[]>([]);
  const [searchingOther, setSearchingOther] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState<string | null>(null);
  const [addingToShortlistUrl, setAddingToShortlistUrl] = useState<string | null>(null);
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter((u): u is string => !!u)));
    });
    return () => unsub();
  }, [user]);

  const addToShortlist = useCallback(
    async (s: ScoutPlayerSuggestion, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = s.transfermarktUrl;
      if (!user || !url) return;
      setShortlistError(null);
      setAddingToShortlistUrl(url);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const colRef = collection(db, 'Shortlists');
        const q = firestoreQuery(colRef, where('tmProfileUrl', '==', url));
        const existsSnap = await getDocs(q);
        if (existsSnap.empty) {
          let entry: Record<string, unknown>;
          try {
            const details = await getPlayerDetails(url);
            entry = {
              tmProfileUrl: url,
              addedAt: Date.now(),
              playerImage: details.profileImage ?? null,
              playerName: details.fullName ?? null,
              playerPosition: details.positions?.[0] ?? null,
              playerAge: details.age ?? null,
              playerNationality: details.nationality ?? null,
              playerNationalityFlag: details.nationalityFlag ?? null,
              clubJoinedName: details.currentClub?.clubName ?? null,
              marketValue: details.marketValue ?? null,
              addedByAgentId: account.id,
              addedByAgentName: account.name ?? null,
              addedByAgentHebrewName: account.hebrewName ?? null,
              instagramHandle: details.instagramHandle ?? null,
              instagramUrl: details.instagramUrl ?? null,
            };
          } catch {
            entry = {
              tmProfileUrl: url,
              addedAt: Date.now(),
              playerName: s.name ?? null,
              playerPosition: s.position ?? null,
              playerAge: s.age ?? null,
              playerNationality: s.nationality ?? null,
              clubJoinedName: s.club ?? null,
              marketValue: s.marketValue ?? null,
              addedByAgentId: account.id,
              addedByAgentName: account.name ?? null,
              addedByAgentHebrewName: account.hebrewName ?? null,
            };
          }
          await addDoc(colRef, entry);
          await addDoc(collection(db, 'FeedEvents'), {
            type: 'SHORTLIST_ADDED',
            playerName: entry.playerName ?? null,
            playerImage: entry.playerImage ?? null,
            playerTmProfile: url,
            timestamp: Date.now(),
            agentName: account.name ?? null,
          });
        }
      } catch (err) {
        setShortlistError(err instanceof Error ? err.message : 'Failed to add');
      } finally {
        setAddingToShortlistUrl(null);
      }
    },
    [user]
  );

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
      const data = await aiScoutSearch(q, lang, true, false);
      setResults(data.players);
      setInterpretation(data.interpretation ?? null);
      setLeagueInfo(data.leagueInfo ?? null);
      setHasMore(data.hasMore ?? false);
      setRequestedTotal(data.requestedTotal ?? null);
      const urls = data.players
        .map((p) => p.transfermarktUrl)
        .filter((u): u is string => !!u);
      setSeenUrls(urls);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setSearching(false);
      setLastSearchedQuery(q);
    }
  };

  const handleLoadMore = async () => {
    const q = query.trim();
    if (!q || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await aiScoutSearch(q, lang, false, false);
      setResults(data.players);
      setInterpretation(data.interpretation ?? null);
      setHasMore(false);
      const urls = data.players
        .map((p) => p.transfermarktUrl)
        .filter((u): u is string => !!u);
      setSeenUrls(urls);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      const data = await aiScoutSearch(q, lang, false, false, seenUrls);
      setResults(data.players);
      setInterpretation(data.interpretation ?? null);
      setLeagueInfo(data.leagueInfo ?? null);
      setHasMore(data.hasMore ?? false);
      setRequestedTotal(data.requestedTotal ?? null);
      const newUrls = data.players
        .map((p) => p.transfermarktUrl)
        .filter((u): u is string => !!u);
      setSeenUrls((prev) => [...prev, ...newUrls.filter((u) => !prev.includes(u))]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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

  const examples = lang === 'he' ? EXAMPLE_QUERIES_HE : EXAMPLE_QUERIES_EN;

  return (
    <AppLayout>
      {/* Tab bar */}
      <div className="max-w-[52rem] mx-auto mb-6">
        <div className="flex gap-1 p-1 rounded-xl bg-mgsr-card border border-mgsr-border">
          <button
            type="button"
            onClick={() => setActiveTab('scout')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'scout'
                ? 'bg-mgsr-teal/20 text-mgsr-teal border border-mgsr-teal/30'
                : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-card/80 border border-transparent'
            }`}
          >
            {lang === 'he' ? '🔍 סקאוט AI' : '🔍 AI Scout'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('find-next')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'find-next'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-card/80 border border-transparent'
            }`}
          >
            {lang === 'he' ? '🧠 מצא את הבא' : '🧠 Find The Next'}
          </button>
        </div>
      </div>

      {activeTab === 'find-next' ? (
        <FindNextTab />
      ) : (
      <div dir={isRtl ? 'rtl' : 'ltr'} className="relative">
        {/* Hero Command: radial gradient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden
        >
          <div
            className="absolute -top-20 -left-[10%] w-[50%] h-[60%] opacity-100"
            style={{
              background: 'radial-gradient(ellipse, rgba(77, 182, 172, 0.08) 0%, transparent 70%)',
            }}
          />
        </div>

        <div className="relative max-w-[52rem] mx-auto">
          {/* Hero */}
          <div className="mb-10">
            <h1 className="text-3xl md:text-4xl font-display font-extrabold text-mgsr-text tracking-tight">
              {t('ai_scout_title')}
            </h1>
            <p className="text-sm md:text-base text-mgsr-muted mt-1">
              {t('ai_scout_subtitle')}
            </p>
          </div>

          {/* Search */}
          <div className="mb-8">
            <div className="rounded-2xl border border-mgsr-border bg-mgsr-card p-4 md:p-6">
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
                dir={isRtl ? 'rtl' : 'ltr'}
                className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder:text-mgsr-muted focus:outline-none focus:ring-2 focus:ring-mgsr-teal/30 focus:border-mgsr-teal resize-none"
                disabled={searching}
              />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-4">
                <div className="flex flex-wrap gap-2">
                  {examples.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setQuery(ex)}
                      disabled={searching}
                      dir={isRtl ? 'rtl' : 'ltr'}
                      className="px-3 py-1.5 rounded-lg text-xs border border-mgsr-border text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition disabled:opacity-50"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={searching || !query.trim()}
                  className="shrink-0 px-6 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[120px]"
                >
                  {searching ? (
                    <>
                      <span className="w-4 h-4 border-2 border-mgsr-dark/30 border-t-mgsr-dark rounded-full animate-spin shrink-0" />
                      {t('ai_scout_searching')}
                    </>
                  ) : (
                    t('ai_scout_search')
                  )}
                </button>
              </div>
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
                <button type="button" onClick={runConnectionTest} className="text-xs underline hover:no-underline">
                  {lang === 'he' ? 'בדוק חיבור' : 'Test connection'}
                </button>
              </div>
            </div>
          )}

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

          {/* League info */}
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

          {/* Results */}
          {results.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-mgsr-border">
                <p className="font-semibold text-mgsr-text">
                  {hasMore && requestedTotal != null
                    ? t('ai_scout_results_of').replace('{count}', String(results.length)).replace('{total}', String(requestedTotal))
                    : t('ai_scout_results_count').replace('{count}', String(results.length))}
                </p>
                <div className="flex items-center gap-2">
                  {hasMore && requestedTotal != null && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="px-4 py-2 rounded-lg text-sm bg-mgsr-teal/15 border border-mgsr-teal/40 text-mgsr-teal hover:bg-mgsr-teal/25 transition disabled:opacity-50"
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
                    className="px-3 py-2 rounded-lg text-sm bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition disabled:opacity-50 flex items-center gap-1.5"
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

              {shortlistError && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {shortlistError}
                </div>
              )}
              <div className="space-y-3">
                {results.map((s) => {
                  const url = s.transfermarktUrl;
                  const pct = s.matchPercent ?? 0;
                  const isAdding = addingToShortlistUrl === url;
                  const inShortlist = url ? Array.from(shortlistUrls).some((u) => samePlayer(u, url)) : false;
                  const content = (
                    <div className="flex items-start gap-5 p-5 rounded-2xl bg-mgsr-card border border-mgsr-border hover:border-mgsr-teal/30 hover:shadow-lg hover:shadow-black/20 transition-all duration-250">
                      {/* Match ring */}
                      <div
                        className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center"
                        style={{
                          background: `conic-gradient(#4DB6AC 0deg ${pct * 3.6}deg, #253545 ${pct * 3.6}deg 360deg)`,
                        }}
                      >
                        <div className="w-[38px] h-[38px] rounded-full bg-mgsr-card flex items-center justify-center">
                          <span className="font-display font-bold text-sm text-mgsr-teal">{pct}%</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block hover:underline"
                              >
                                <p className="font-semibold text-mgsr-text truncate">{s.name || '—'}</p>
                              </a>
                            ) : (
                              <p className="font-semibold text-mgsr-text truncate">{s.name || '—'}</p>
                            )}
                          </div>
                          {url && (
                            <button
                              type="button"
                              onClick={(e) => !inShortlist && addToShortlist(s, e)}
                              disabled={!!addingToShortlistUrl}
                              className={`group/bookmark flex items-center gap-2 px-3 py-1.5 rounded-full border shrink-0 transition-all duration-200 ${
                                inShortlist
                                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 cursor-default'
                                  : 'border-mgsr-border/80 bg-mgsr-dark/40 text-mgsr-muted hover:border-amber-500/40 hover:text-amber-400/90 hover:bg-amber-500/5 disabled:opacity-60'
                              }`}
                            >
                              {isAdding ? (
                                <span className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />
                              ) : inShortlist ? (
                                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 shrink-0 opacity-70 group-hover/bookmark:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                              )}
                              <span className="text-xs font-medium">
                                {isAdding ? t('shortlist_adding') : inShortlist ? t('shortlist_already_added') : t('shortlist_add')}
                              </span>
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-mgsr-muted mt-0.5">
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
                        </p>
                        {/* FM Data Badge - dir="ltr" ensures CA → PA always shows 55→65 not reversed in RTL */}
                        {s.fmCa != null && s.fmCa > 0 && (
                          <div className="flex items-center justify-end gap-2 mt-2 flex-wrap" dir="ltr">
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30">
                              <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">FM</span>
                              <span className="text-xs font-normal text-indigo-300">
                                CA {s.fmCa}
                              </span>
                              {s.fmPa != null && (
                                <span className="text-xs font-bold text-indigo-400">→ PA {s.fmPa}</span>
                              )}
                            </div>
                            {s.fmPotentialGap != null && s.fmPotentialGap > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 border border-green-500/30 text-green-400 font-medium">
                                +{s.fmPotentialGap} potential
                              </span>
                            )}
                            {s.fmTier && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                s.fmTier === 'world_class' ? 'bg-yellow-500/20 border border-yellow-500/40 text-yellow-400' :
                                s.fmTier === 'elite' ? 'bg-purple-500/20 border border-purple-500/40 text-purple-400' :
                                s.fmTier === 'top_league' ? 'bg-blue-500/15 border border-blue-500/30 text-blue-400' :
                                s.fmTier === 'solid_pro' ? 'bg-sky-500/15 border border-sky-500/30 text-sky-400' :
                                s.fmTier === 'prospect' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' :
                                'bg-mgsr-card border border-mgsr-border text-mgsr-muted'
                              }`}>
                                {s.fmTier.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                        )}
                        {s.scoutAnalysis && (
                          <div className="text-xs text-mgsr-muted mt-2 space-y-0.5" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                            {s.scoutAnalysis.split('\n').map((line, i) => (
                              <p key={i} className={i === 0 ? 'font-medium text-mgsr-text/80' : ''}>
                                {line}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                  return <div key={url || s.name}>{content}</div>;
                })}
              </div>
            </>
          )}

          {!searching && results.length === 0 && !error && lastSearchedQuery && query.trim() === lastSearchedQuery && (
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
      </div>
      )}
    </AppLayout>
  );
}
