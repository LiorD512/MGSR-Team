'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
import { getPositionDisplayName } from '@/lib/appConfig';
import { type DiversityMode } from '@/lib/discoveryDiversity';
import {
  TM_DEFAULT_IMG,
  samePlayer,
  shortenPosition,
  parseExplanationSections,
  WarRoomMasthead,
  WarRoomSignals,
  TeammatesPanel,
} from '../_shared';
import { useWarRoomData } from '../useWarRoomData';

const SCOUT_EXAMPLES_EN = [
  'Fast strikers under 24 with 5+ goals for Israeli market',
  'Creative midfielders from Belgium or Portugal under 26',
  'Left-footed center backs from Eastern Europe',
  'Free agent wingers with pace and dribbling ability',
];
const SCOUT_EXAMPLES_HE = [
  'חלוצים מהירים עד גיל 24 עם 5+ שערים לשוק הישראלי',
  'קשרים יצירתיים מבלגיה או פורטוגל עד גיל 26',
  'בלמים שמאליים ממזרח אירופה',
  'כנפים חופשיים עם מהירות ודריבל',
];

export default function WarRoomAiScoutPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang } = useLanguage();
  const router = useRouter();
  const isHe = lang === 'he';

  const {
    reportCache,
    loadingReport,
    shortlistUrls,
    rosterTmProfiles,
    addError,
    addScoutResultToShortlist,
    addingScoutUrl,
    teammatesCache,
    loadingTeammatesUrl,
    expandedTeammatesUrl,
    handleTeammatesClick,
    scoutQuery,
    setScoutQuery,
    scoutResults,
    scoutInterpretation,
    scoutSearching,
    scoutError,
    setScoutError,
    scoutExpandedUrl,
    handleScoutExpand,
    scoutSeenUrls,
    scoutSearchingOther,
    scoutDiversityMode,
    setScoutDiversityMode,
    handleScoutSearch,
    handleScoutSearchOther,
    avgScoutMatch,
  } = useWarRoomData();

  const displayShortPosition = useCallback(
    (pos: string | undefined) => {
      const code = shortenPosition(pos);
      return isHe ? getPositionDisplayName(code, true) : code;
    },
    [isHe]
  );

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) fetch('/api/scout/warm').catch(() => {});
  }, [user]);

  const handleScoutKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleScoutSearch();
      }
    },
    [handleScoutSearch]
  );

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-[var(--mgsr-gold)] font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-[78rem] mx-auto">
        <WarRoomMasthead
          kicker={isHe ? 'סקאוט AI / חיפוש בשפה חופשית' : 'AI scout / Natural-language search'}
          titleLead={isHe ? 'סקאוט' : 'AI'}
          titleAccent={isHe ? 'AI.' : 'scout.'}
          sub={
            isHe
              ? 'כתוב חיפוש בשפה חופשית וקבל שחקנים עם ניתוח מלא: התאמה טקטית, סטטיסטיקה, והיתכנות שוק.'
              : 'Write a natural-language search and get players with full analysis: tactical fit, stats, and market feasibility.'
          }
        />

        <WarRoomSignals
          items={[
            { label: isHe ? 'תוצאות' : 'Results', value: scoutResults.length },
            { label: isHe ? 'ממוצע התאמה' : 'Match avg', value: avgScoutMatch != null ? `${avgScoutMatch}%` : '—', accent: 'gold' },
            { label: isHe ? 'מצב גיוון' : 'Diversity', value: scoutDiversityMode },
          ]}
        />

        <div className="space-y-5">
          {/* Command console header */}
          <div className="relative overflow-hidden rounded-2xl border border-[var(--mgsr-gold)]/30 bg-mgsr-card">
            <div className="relative p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-[var(--mgsr-gold)] animate-pulse" />
                <span className="text-[10px] font-bold text-[var(--mgsr-gold)] uppercase tracking-[0.2em]">
                  {isHe ? 'מסוף חיפוש מודיעיני' : 'Intelligence Search Terminal'}
                </span>
              </div>

              {/* Search input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute top-3 left-3 pointer-events-none">
                    <svg className="w-5 h-5 text-[var(--mgsr-gold)]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <textarea
                    value={scoutQuery}
                    onChange={(e) => setScoutQuery(e.target.value)}
                    onKeyDown={handleScoutKeyDown}
                    placeholder={isHe ? 'תאר את השחקן שאתה מחפש...' : "Describe the player you're looking for..."}
                    rows={2}
                    dir={isRtl ? 'rtl' : 'ltr'}
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-mgsr-dark/80 border border-[var(--mgsr-gold)]/20 text-mgsr-text placeholder:text-mgsr-muted/60 focus:outline-none focus:ring-2 focus:ring-[var(--mgsr-gold)]/30 focus:border-[var(--mgsr-gold)]/40 resize-none text-sm"
                    disabled={scoutSearching}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleScoutSearch}
                  disabled={scoutSearching || !scoutQuery.trim()}
                  className="shrink-0 px-5 py-3 rounded-xl bg-[var(--mgsr-gold)] text-mgsr-dark font-bold hover:bg-[var(--mgsr-gold-dim)] hover:text-[var(--mgsr-gold)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 self-start"
                >
                  {scoutSearching ? (
                    <span className="w-5 h-5 border-2 border-mgsr-dark/30 border-t-mgsr-dark rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[var(--mgsr-gold)]/80 font-semibold">
                  {isHe ? 'מצב גיוון' : 'Diversity mode'}
                </span>
                {(
                  [
                    { key: 'strict', en: 'Strict', he: 'מדויק' },
                    { key: 'balanced', en: 'Balanced', he: 'מאוזן' },
                    { key: 'discovery', en: 'Discovery', he: 'תגלית' },
                  ] as { key: DiversityMode; en: string; he: string }[]
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setScoutDiversityMode(m.key)}
                    disabled={scoutSearching || scoutSearchingOther}
                    className={`px-2.5 py-1 rounded-lg text-[11px] border transition ${
                      scoutDiversityMode === m.key
                        ? 'bg-[var(--mgsr-gold-dim)] border-[var(--mgsr-gold)]/50 text-[var(--mgsr-gold)]'
                        : 'bg-mgsr-dark/40 border-[var(--mgsr-gold)]/20 text-[var(--mgsr-gold)]/70 hover:border-[var(--mgsr-gold)]/40'
                    }`}
                  >
                    {isHe ? m.he : m.en}
                  </button>
                ))}
              </div>

              {/* Example chips */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {(isHe ? SCOUT_EXAMPLES_HE : SCOUT_EXAMPLES_EN).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setScoutQuery(ex)}
                    disabled={scoutSearching}
                    dir={isRtl ? 'rtl' : 'ltr'}
                    className="px-2.5 py-1 rounded-lg text-[11px] border border-[var(--mgsr-gold)]/20 text-[var(--mgsr-gold)]/70 hover:text-[var(--mgsr-gold)] hover:border-[var(--mgsr-gold)]/40 hover:bg-[var(--mgsr-gold-dim)] transition disabled:opacity-40 truncate max-w-[280px]"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scout error */}
          {scoutError && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <p>{scoutError}</p>
              <button
                type="button"
                onClick={() => {
                  fetch('/api/scout/warm').catch(() => {});
                  setScoutError(null);
                }}
                className="mt-2 text-xs underline hover:no-underline"
              >
                {isHe ? 'חמם שרת ונסה שוב' : 'Warm server & retry'}
              </button>
            </div>
          )}

          {/* Interpretation */}
          {scoutInterpretation && (
            <div className="p-3 rounded-xl bg-[var(--mgsr-gold-dim)] border border-[var(--mgsr-gold)]/25 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--mgsr-gold)]/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-[var(--mgsr-gold)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-[var(--mgsr-gold)] uppercase tracking-wider mb-1.5">
                  {isHe ? 'פרשנות AI' : 'AI Interpretation'}
                </p>
                <div className="space-y-1">
                  {scoutInterpretation
                    .split('\n')
                    .filter((l) => l.trim())
                    .map((line, i) => (
                      <p key={i} className="text-sm text-mgsr-text leading-snug">
                        {line.trim()}
                      </p>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Searching skeleton */}
          {scoutSearching && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-mgsr-border bg-mgsr-card p-5 animate-pulse">
                  <div className="flex gap-4 items-start">
                    <div className="w-12 h-12 rounded-full bg-mgsr-border/50 shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-5 w-2/3 rounded-lg bg-mgsr-border/50" />
                      <div className="h-4 w-1/2 rounded-lg bg-mgsr-border/30" />
                    </div>
                    <div className="w-16 h-8 rounded-lg bg-mgsr-border/30 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          {!scoutSearching && scoutResults.length > 0 && (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-[var(--mgsr-gold)]/15">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-[var(--mgsr-teal)]" />
                  <p className="font-display font-bold text-mgsr-text text-sm">
                    {scoutResults.length} {isHe ? 'מטרות נמצאו' : 'targets acquired'}
                  </p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--mgsr-gold)]/25 text-[var(--mgsr-gold)]/80 uppercase tracking-wide">
                    {scoutDiversityMode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleScoutSearchOther}
                  disabled={scoutSearchingOther}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] hover:bg-[var(--mgsr-gold)]/20 border border-[var(--mgsr-gold)]/25 transition-all disabled:opacity-50 flex items-center gap-1.5 min-h-[36px]"
                >
                  {scoutSearchingOther ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-[var(--mgsr-gold)]/30 border-t-[var(--mgsr-gold)] rounded-full animate-spin shrink-0" />
                      {isHe ? 'סורק...' : 'Scanning...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                      </svg>
                      {isHe ? 'חפש עוד' : 'Find more targets'}
                    </>
                  )}
                </button>
              </div>

              {addError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{addError}</div>
              )}

              <div className="space-y-3">
                {scoutResults
                  .filter((s) => {
                    const url = s.transfermarktUrl;
                    if (!url) return true;
                    if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
                    if (Array.from(shortlistUrls).some((su) => samePlayer(su, url))) return false;
                    return true;
                  })
                  .map((s) => {
                    const url = s.transfermarktUrl;
                    const pct = s.matchPercent ?? 0;
                    const isExpanded = url ? scoutExpandedUrl === url : false;
                    const report = url ? reportCache[url] : undefined;
                    const validReport = report && !('error' in report) ? report : undefined;
                    const isLoadingRpt = url ? loadingReport === url : false;
                    const rec = validReport?.synthesis?.recommendation?.toUpperCase();
                    const inRoster = url ? Array.from(rosterTmProfiles).some((r) => samePlayer(r, url)) : false;
                    const inShortlist = url ? Array.from(shortlistUrls).some((su) => samePlayer(su, url)) : false;
                    const isAdding = addingScoutUrl === url;

                    return (
                      <div
                        key={url || s.name}
                        className={`rounded-2xl border transition-all duration-300 ${
                          isExpanded
                            ? 'border-[var(--mgsr-gold)]/40 bg-mgsr-card'
                            : 'border-mgsr-border bg-mgsr-card hover:border-[var(--mgsr-gold)]/30'
                        } ${url ? 'cursor-pointer' : ''}`}
                        onClick={() => url && handleScoutExpand(url)}
                      >
                        <div className="p-4 sm:p-5">
                          <div className="flex items-start gap-4">
                            {/* Match ring */}
                            <div
                              className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center"
                              style={{
                                background: `conic-gradient(var(--mgsr-gold) 0deg ${pct * 3.6}deg, rgba(255,255,255,0.08) ${pct * 3.6}deg 360deg)`,
                              }}
                            >
                              <div className="w-[36px] h-[36px] rounded-full bg-mgsr-card flex items-center justify-center">
                                <span className="font-display font-extrabold text-xs text-[var(--mgsr-gold)]">{pct}%</span>
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  {url ? (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <p className="font-display font-bold text-base text-mgsr-text truncate">{s.name || '—'}</p>
                                    </a>
                                  ) : (
                                    <p className="font-display font-bold text-base text-mgsr-text truncate">{s.name || '—'}</p>
                                  )}
                                </div>
                                <div className="shrink-0 flex items-center gap-1.5">
                                  {validReport?.synthesis?.recommendation ? (
                                    <span
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                                        rec === 'SIGN'
                                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                          : rec === 'MONITOR'
                                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                      }`}
                                    >
                                      {rec === 'SIGN' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                      {rec === 'MONITOR' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>}
                                      {rec === 'PASS' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>}
                                      {rec === 'SIGN' ? t('rec_sign') : rec === 'MONITOR' ? t('rec_monitor') : rec === 'PASS' ? t('rec_pass') : validReport.synthesis.recommendation}
                                    </span>
                                  ) : url ? (
                                    <span className="text-mgsr-muted text-[10px] hidden sm:inline opacity-60">{isHe ? 'לחץ לניתוח' : 'Click for analysis'}</span>
                                  ) : null}
                                  {url && (
                                    <svg
                                      className={`w-4 h-4 text-mgsr-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-mgsr-muted mt-0.5">
                                {s.age ? `${s.age}` : '—'}
                                <span className="mx-1.5">·</span>
                                {displayShortPosition(s.position)}
                                <span className="mx-1.5">·</span>
                                {s.marketValue || '—'}
                                {s.club && (
                                  <>
                                    <span className="mx-1.5">·</span>
                                    {s.club}
                                  </>
                                )}
                              </p>

                              {/* FM badge */}
                              {s.fmCa != null && s.fmCa > 0 && (
                                <div className="flex items-center gap-2 mt-2 flex-wrap" dir="ltr">
                                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/25">
                                    <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">FM</span>
                                    <span className="text-xs text-indigo-300">CA {s.fmCa}</span>
                                    {s.fmPa != null && <span className="text-xs font-bold text-indigo-400">→ PA {s.fmPa}</span>}
                                  </div>
                                  {s.fmPotentialGap != null && s.fmPotentialGap > 0 && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 border border-green-500/25 text-green-400 font-medium">
                                      +{s.fmPotentialGap} potential
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Scout analysis — structured sections */}
                              {s.scoutAnalysis &&
                                (() => {
                                  const sec = parseExplanationSections(s.scoutAnalysis);
                                  const hasAnything =
                                    sec.stats.length + sec.strengths.length + sec.fmAttrs.length + sec.insights.length > 0;
                                  if (!hasAnything) return null;
                                  return (
                                    <div className="space-y-1.5 mt-2" dir="ltr">
                                      {sec.stats.length > 0 && (
                                        <div>
                                          <span className="text-[9px] font-semibold text-mgsr-muted/50 uppercase tracking-wider">{isHe ? '📊 נתוני עונה' : '📊 Season'}</span>
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {sec.stats.map((st, i) => (
                                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--mgsr-gold)]/80 bg-[var(--mgsr-gold-dim)] border border-[var(--mgsr-gold)]/20">{st}</span>
                                            ))}
                                            {sec.physical.map((ph, i) => (
                                              <span key={`p${i}`} className="px-1.5 py-0.5 rounded text-[10px] text-mgsr-muted/70 bg-mgsr-dark/60 border border-mgsr-border/40">{ph}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {sec.strengths.length > 0 && (
                                        <div>
                                          <span className="text-[9px] font-semibold text-mgsr-muted/50 uppercase tracking-wider">{isHe ? '💪 חוזקות' : '💪 Strengths'}</span>
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {sec.strengths.map((st, i) => (
                                              <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] border ${st.includes('✓') ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30 font-medium' : 'text-green-300/80 bg-green-500/10 border-green-500/20'}`}>{st}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {sec.fmAttrs.length > 0 && (
                                        <div>
                                          <span className="text-[9px] font-semibold text-mgsr-muted/50 uppercase tracking-wider">🎮 FM</span>
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {sec.fmAttrs.map((attr, i) => (
                                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-indigo-300/80 bg-indigo-500/10 border border-indigo-500/20">{attr}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      {sec.insights.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {sec.insights.map((ins, i) => (
                                            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--mgsr-gold)]/80 bg-[var(--mgsr-gold-dim)] border border-[var(--mgsr-gold)]/20">💡 {ins}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                              {/* Status badges + actions */}
                              <div className="flex flex-wrap gap-1.5 mt-2 items-center" onClick={(e) => e.stopPropagation()}>
                                {inRoster && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--mgsr-teal)]/25 text-[var(--mgsr-teal)] border border-[var(--mgsr-teal)]/40">
                                    {isHe ? 'במאגר' : 'In roster'}
                                  </span>
                                )}
                                {inShortlist && !inRoster && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/25 text-blue-400 border border-blue-500/40">
                                    {isHe ? 'ברשימת מעקב' : 'In shortlist'}
                                  </span>
                                )}
                                {url && (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-mgsr-border text-mgsr-muted hover:text-[var(--mgsr-gold)] border border-mgsr-border transition"
                                  >
                                    TM →
                                  </a>
                                )}
                                {!inRoster && url && (
                                  <button
                                    onClick={() => addScoutResultToShortlist(s)}
                                    disabled={isAdding || inShortlist}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] hover:bg-[var(--mgsr-gold)]/20 border border-[var(--mgsr-gold)]/30 transition disabled:opacity-50"
                                  >
                                    {isAdding ? (
                                      <>
                                        <span className="w-3 h-3 border-2 border-[var(--mgsr-gold)]/40 border-t-[var(--mgsr-gold)] rounded-full animate-spin" />
                                        {isHe ? 'מוסיף...' : 'Adding...'}
                                      </>
                                    ) : inShortlist ? (
                                      <>{isHe ? 'ברשימת מעקב' : 'In shortlist'}</>
                                    ) : (
                                      <>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        {isHe ? 'לרשימת מעקב' : '+ Shortlist'}
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>

                              {url && (
                                <TeammatesPanel
                                  tmUrl={url}
                                  playerName={s.name || ''}
                                  teammates={teammatesCache[url]}
                                  isLoading={loadingTeammatesUrl === url}
                                  isExpanded={expandedTeammatesUrl === url}
                                  onToggle={(e) => handleTeammatesClick(e, url)}
                                  t={t}
                                />
                              )}
                            </div>
                          </div>

                          {/* Expanded War Room report */}
                          {isExpanded && url && (
                            <div className="mt-4 pt-4 border-t border-[var(--mgsr-gold)]/20">
                              {isLoadingRpt && (
                                <div className="flex items-center gap-3 py-5">
                                  <div className="w-5 h-5 border-2 border-[var(--mgsr-gold)]/40 border-t-[var(--mgsr-gold)] rounded-full animate-spin" />
                                  <span className="text-sm text-[var(--mgsr-gold)] font-medium">
                                    {isHe ? 'מריץ ניתוח מולטי-סוכנים...' : 'Running multi-agent analysis...'}
                                  </span>
                                </div>
                              )}
                              {validReport && (
                                <div className="space-y-3">
                                  {validReport.synthesis && (
                                    <div className="p-4 rounded-xl bg-[var(--mgsr-gold-dim)] border border-[var(--mgsr-gold)]/25">
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className="w-6 h-6 rounded-lg bg-[var(--mgsr-gold)]/25 flex items-center justify-center">
                                          <svg className="w-3.5 h-3.5 text-[var(--mgsr-gold)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                        </div>
                                        <h4 className="text-xs font-bold text-[var(--mgsr-gold)] uppercase tracking-wider">
                                          {isHe ? 'חוות דעת ראש הסקאוטינג' : 'Chief Scout Verdict'}
                                        </h4>
                                      </div>
                                      <p className="text-sm text-mgsr-text leading-relaxed">{validReport.synthesis.executive_summary}</p>
                                      {validReport.synthesis.key_risks?.length ? (
                                        <p className="text-xs text-red-400/80 mt-2">
                                          ⚠ {isHe ? 'סיכונים:' : 'Risks:'} {validReport.synthesis.key_risks.join('; ')}
                                        </p>
                                      ) : null}
                                      {validReport.synthesis.key_opportunities?.length ? (
                                        <p className="text-xs text-green-400/80 mt-1">
                                          ✦ {isHe ? 'הזדמנויות:' : 'Opportunities:'} {validReport.synthesis.key_opportunities.join('; ')}
                                        </p>
                                      ) : null}
                                    </div>
                                  )}
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {validReport.stats?.summary && (
                                      <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                        <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">{isHe ? 'סטטיסטיקות' : 'Stats'}</h5>
                                        <p className="text-xs text-mgsr-text">{validReport.stats.summary}</p>
                                      </div>
                                    )}
                                    {validReport.market?.summary && (
                                      <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                        <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">{isHe ? 'שוק' : 'Market'}</h5>
                                        <p className="text-xs text-mgsr-text">{validReport.market.summary}</p>
                                      </div>
                                    )}
                                    {validReport.tactics?.summary && (
                                      <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                        <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">{isHe ? 'טקטיקה' : 'Tactics'}</h5>
                                        <p className="text-xs text-mgsr-text">{validReport.tactics.summary}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {report && 'error' in report && <p className="text-red-400 text-sm">{report.error}</p>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}

          {/* Empty state after search */}
          {!scoutSearching && scoutResults.length === 0 && !scoutError && scoutQuery.trim() && scoutSeenUrls.length > 0 && (
            <div className="py-12 text-center rounded-2xl bg-mgsr-card border border-mgsr-border">
              <p className="text-mgsr-muted">{isHe ? 'לא נמצאו תוצאות. נסה שאילתה אחרת.' : 'No results found. Try a different query.'}</p>
            </div>
          )}

          {/* Initial empty state */}
          {!scoutSearching && scoutResults.length === 0 && !scoutError && scoutSeenUrls.length === 0 && (
            <div className="py-20 text-center rounded-2xl border border-dashed border-[var(--mgsr-gold)]/15 bg-mgsr-card/40">
              <div className="relative w-20 h-20 mx-auto mb-5">
                <div className="absolute inset-0 rounded-2xl bg-[var(--mgsr-gold-dim)] border border-[var(--mgsr-gold)]/15" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-10 h-10 text-[var(--mgsr-gold)]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-mgsr-muted text-sm font-medium">
                {isHe ? 'הקלד שאילתה למעלה כדי להפעיל את חיפוש ה-AI' : 'Type a query above to activate AI search'}
              </p>
              <p className="text-mgsr-muted/40 text-xs mt-1.5">
                {isHe ? 'תוצאות ניתנות להרחבה לניתוח מלא של חדר המלחמה' : 'Results can be expanded for full War Room analysis'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
