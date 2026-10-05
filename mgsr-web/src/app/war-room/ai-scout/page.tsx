'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import BritLoader from '@/components/BritLoader';
import { getPositionDisplayName } from '@/lib/appConfig';
import { type DiversityMode } from '@/lib/discoveryDiversity';
import {
  samePlayer,
  shortenPosition,
  parseExplanationSections,
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
  const { t, isRtl, lang, setLang } = useLanguage();
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
    return <BritLoader fullPage />;
  }

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const diversityLabel = (m: DiversityMode) =>
    isHe
      ? m === 'strict' ? 'מדויק' : m === 'discovery' ? 'תגלית' : 'מאוזן'
      : m === 'strict' ? 'Strict' : m === 'discovery' ? 'Discovery' : 'Balanced';

  const visibleResults = scoutResults.filter((s) => {
    const url = s.transfermarktUrl;
    if (!url) return true;
    if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
    if (Array.from(shortlistUrls).some((su) => samePlayer(su, url))) return false;
    return true;
  });

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="war-room" />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_war_room')}</strong> / <strong>{t('nav_ai_scout')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{isHe ? 'סקאוט AI / חיפוש בשפה חופשית' : 'AI scout / Natural-language search'}</p>
                <h1>
                  {isHe ? 'סקאוט' : 'AI'} <span>{isHe ? 'AI.' : 'scout.'}</span>
                </h1>
                <p className="brit-ra-sub">
                  {isHe
                    ? 'כתוב חיפוש בשפה חופשית וקבל שחקנים עם ניתוח מלא: התאמה טקטית, סטטיסטיקה, והיתכנות שוק.'
                    : 'Write a natural-language search and get players with full analysis: tactical fit, stats, and market feasibility.'}
                </p>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals brit-signals-3">
              <div className="brit-signal">
                <label>{isHe ? 'תוצאות' : 'Results'}</label>
                <strong>{String(scoutResults.length).padStart(2, '0')}</strong>
                <small>{isHe ? 'מטרות נמצאו' : 'Targets acquired'}</small>
              </div>
              <div className="brit-signal">
                <label>{isHe ? 'ממוצע התאמה' : 'Match avg'}</label>
                <strong className="brit-gold">{avgScoutMatch != null ? `${avgScoutMatch}%` : '—'}</strong>
                <small>{isHe ? 'התאמת שאילתה' : 'Query fit'}</small>
              </div>
              <div className="brit-signal">
                <label>{isHe ? 'מצב גיוון' : 'Diversity'}</label>
                <strong>{diversityLabel(scoutDiversityMode)}</strong>
                <small>{isHe ? 'מצב חיפוש' : 'Search mode'}</small>
              </div>
            </section>

            {/* Command console */}
            <section className="brit-wr-console">
              <div className="brit-wr-console-head">
                <span className="dot" />
                {isHe ? 'מסוף חיפוש מודיעיני' : 'Intelligence Search Terminal'}
              </div>
              <div className="brit-wr-searchbox">
                <textarea
                  value={scoutQuery}
                  onChange={(e) => setScoutQuery(e.target.value)}
                  onKeyDown={handleScoutKeyDown}
                  placeholder={isHe ? 'תאר את השחקן שאתה מחפש...' : "Describe the player you're looking for..."}
                  rows={2}
                  dir={isRtl ? 'rtl' : 'ltr'}
                  disabled={scoutSearching}
                />
                <button
                  type="button"
                  className="brit-wr-searchbtn"
                  onClick={handleScoutSearch}
                  disabled={scoutSearching || !scoutQuery.trim()}
                >
                  {scoutSearching ? (
                    <span className="sp" />
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      {isHe ? 'חפש' : 'Search'}
                    </>
                  )}
                </button>
              </div>

              <div className="brit-wr-chiprow">
                <span className="lbl">{isHe ? 'מצב גיוון' : 'Diversity mode'}</span>
                {(['strict', 'balanced', 'discovery'] as DiversityMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`brit-wr-chip${scoutDiversityMode === m ? ' on' : ''}`}
                    onClick={() => setScoutDiversityMode(m)}
                    disabled={scoutSearching || scoutSearchingOther}
                  >
                    {diversityLabel(m)}
                  </button>
                ))}
              </div>

              <div className="brit-wr-chiprow">
                {(isHe ? SCOUT_EXAMPLES_HE : SCOUT_EXAMPLES_EN).map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className="brit-wr-chip"
                    onClick={() => setScoutQuery(ex)}
                    disabled={scoutSearching}
                    dir={isRtl ? 'rtl' : 'ltr'}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </section>

            {/* Scout error */}
            {scoutError && (
              <div className="brit-wr-error">
                <p>{scoutError}</p>
                <button
                  type="button"
                  onClick={() => {
                    fetch('/api/scout/warm').catch(() => {});
                    setScoutError(null);
                  }}
                >
                  {isHe ? 'חמם שרת ונסה שוב' : 'Warm server & retry'}
                </button>
              </div>
            )}

            {/* Interpretation */}
            {scoutInterpretation && (
              <div className="brit-wr-interp">
                <label>{isHe ? 'פרשנות AI' : 'AI Interpretation'}</label>
                {scoutInterpretation
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((line, i) => (
                    <p key={i}>{line.trim()}</p>
                  ))}
              </div>
            )}

            {/* Searching */}
            {scoutSearching && (
              <div className="brit-empty">{isHe ? 'מריץ חיפוש AI…' : 'Running AI search…'}</div>
            )}

            {/* Results */}
            {!scoutSearching && scoutResults.length > 0 && (
              <>
                <div className="brit-wr-reshead">
                  <div className="cnt">
                    <span className="dot" />
                    {scoutResults.length} {isHe ? 'מטרות נמצאו' : 'targets acquired'}
                    <span className="mode">{diversityLabel(scoutDiversityMode)}</span>
                  </div>
                  <button
                    type="button"
                    className={`brit-ra-refresh${scoutSearchingOther ? ' live' : ''}`}
                    onClick={handleScoutSearchOther}
                    disabled={scoutSearchingOther}
                  >
                    <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
                    <span>
                      {scoutSearchingOther
                        ? isHe ? 'סורק...' : 'Scanning...'
                        : isHe ? 'חפש עוד' : 'Find more targets'}
                    </span>
                  </button>
                </div>

                {addError && <div className="brit-wr-error">{addError}</div>}

                <div className="brit-ra-feed">
                  {visibleResults.map((s) => {
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
                    const recClass = rec === 'SIGN' ? 'sign' : rec === 'MONITOR' ? 'monitor' : 'pass';

                    return (
                      <article key={url || s.name} className={`brit-wr-scoutcard${isExpanded ? ' open' : ''}`}>
                        <div className="brit-wr-scouttop" onClick={() => url && handleScoutExpand(url)}>
                          <div
                            className="brit-wr-ring"
                            style={{
                              background: `conic-gradient(var(--gold) 0deg ${pct * 3.6}deg, var(--paper-2) ${pct * 3.6}deg 360deg)`,
                            }}
                          >
                            <div className="inner"><b>{pct}%</b></div>
                          </div>

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                              {url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                                  <div className="brit-wr-scoutname">{s.name || '—'}</div>
                                </a>
                              ) : (
                                <div className="brit-wr-scoutname">{s.name || '—'}</div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 'none' }}>
                                {validReport?.synthesis?.recommendation ? (
                                  <span className={`brit-wr-rec ${recClass}`}>
                                    {rec === 'SIGN' && <svg viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                    {rec === 'MONITOR' && <svg viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>}
                                    {rec === 'PASS' && <svg viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>}
                                    {rec === 'SIGN' ? t('rec_sign') : rec === 'MONITOR' ? t('rec_monitor') : rec === 'PASS' ? t('rec_pass') : validReport.synthesis.recommendation}
                                  </span>
                                ) : url ? (
                                  <span style={{ color: 'var(--muted)', font: '8px/1 var(--mono)', textTransform: 'uppercase' }}>
                                    {isHe ? 'לחץ לניתוח' : 'Click for analysis'}
                                  </span>
                                ) : null}
                                {url && (
                                  <svg className="brit-wr-chev" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
                                )}
                              </div>
                            </div>

                            <div className="brit-wr-stats" dir="ltr" style={{ marginTop: 6 }}>
                              <span>
                                {s.age ? `${s.age}` : '—'} · {displayShortPosition(s.position)} · {s.marketValue || '—'}
                                {s.club ? ` · ${s.club}` : ''}
                              </span>
                            </div>

                            {/* FM badge */}
                            {s.fmCa != null && s.fmCa > 0 && (
                              <div className="brit-wr-sec" dir="ltr">
                                <div className="chips">
                                  <span className="gold">FM · CA {s.fmCa}{s.fmPa != null ? ` → PA ${s.fmPa}` : ''}</span>
                                  {s.fmPotentialGap != null && s.fmPotentialGap > 0 && (
                                    <span className="green">+{s.fmPotentialGap} potential</span>
                                  )}
                                </div>
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
                                  <div dir="ltr">
                                    {sec.stats.length > 0 && (
                                      <div className="brit-wr-sec">
                                        <label>{isHe ? '📊 נתוני עונה' : '📊 Season'}</label>
                                        <div className="chips">
                                          {sec.stats.map((st, i) => (
                                            <span key={i} className="gold">{st}</span>
                                          ))}
                                          {sec.physical.map((ph, i) => (
                                            <span key={`p${i}`}>{ph}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {sec.strengths.length > 0 && (
                                      <div className="brit-wr-sec">
                                        <label>{isHe ? '💪 חוזקות' : '💪 Strengths'}</label>
                                        <div className="chips">
                                          {sec.strengths.map((st, i) => (
                                            <span key={i} className="green">{st}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {sec.fmAttrs.length > 0 && (
                                      <div className="brit-wr-sec">
                                        <label>🎮 FM</label>
                                        <div className="chips">
                                          {sec.fmAttrs.map((attr, i) => (
                                            <span key={i}>{attr}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {sec.insights.length > 0 && (
                                      <div className="brit-wr-sec">
                                        <div className="chips">
                                          {sec.insights.map((ins, i) => (
                                            <span key={i} className="gold">💡 {ins}</span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                            {/* Status badges + actions */}
                            <div className="brit-wr-badges" onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
                              {inRoster && <span className="brit-wr-tag roster">{isHe ? 'במאגר' : 'In roster'}</span>}
                              {inShortlist && !inRoster && (
                                <span className="brit-wr-tag shortlist">{isHe ? 'ברשימת מעקב' : 'In shortlist'}</span>
                              )}
                            </div>
                            <div className="brit-wr-acts" onClick={(e) => e.stopPropagation()}>
                              {url && (
                                <a href={url} target="_blank" rel="noopener noreferrer">
                                  TM →
                                </a>
                              )}
                              {!inRoster && url && (
                                <button className="save" onClick={() => addScoutResultToShortlist(s)} disabled={isAdding || inShortlist}>
                                  {isAdding ? (
                                    <>
                                      <span className="sp" />
                                      {isHe ? 'מוסיף...' : 'Adding...'}
                                    </>
                                  ) : inShortlist ? (
                                    <>{isHe ? 'ברשימת מעקב' : 'In shortlist'}</>
                                  ) : (
                                    <>
                                      <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                      {isHe ? 'לרשימת מעקב' : '+ Shortlist'}
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            {url && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <TeammatesPanel
                                  tmUrl={url}
                                  playerName={s.name || ''}
                                  teammates={teammatesCache[url]}
                                  isLoading={loadingTeammatesUrl === url}
                                  isExpanded={expandedTeammatesUrl === url}
                                  onToggle={(e) => handleTeammatesClick(e, url)}
                                  t={t}
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Expanded War Room report */}
                        {isExpanded && url && (
                          <div className="brit-wr-report">
                            {isLoadingRpt && (
                              <div className="loadrow">
                                <span className="sp" />
                                {isHe ? 'מריץ ניתוח מולטי-סוכנים...' : 'Running multi-agent analysis...'}
                              </div>
                            )}
                            {validReport && (
                              <>
                                {validReport.synthesis && (
                                  <div className="brit-wr-verdict">
                                    <label>{isHe ? 'חוות דעת ראש הסקאוטינג' : 'Chief Scout Verdict'}</label>
                                    <p>{validReport.synthesis.executive_summary}</p>
                                    {validReport.synthesis.key_risks?.length ? (
                                      <p className="risk">
                                        ⚠ {isHe ? 'סיכונים:' : 'Risks:'} {validReport.synthesis.key_risks.join('; ')}
                                      </p>
                                    ) : null}
                                    {validReport.synthesis.key_opportunities?.length ? (
                                      <p className="opp">
                                        ✦ {isHe ? 'הזדמנויות:' : 'Opportunities:'} {validReport.synthesis.key_opportunities.join('; ')}
                                      </p>
                                    ) : null}
                                  </div>
                                )}
                                <div className="brit-wr-repgrid">
                                  {validReport.stats?.summary && (
                                    <div className="brit-wr-repcell">
                                      <h5>{isHe ? 'סטטיסטיקות' : 'Stats'}</h5>
                                      <p>{validReport.stats.summary}</p>
                                    </div>
                                  )}
                                  {validReport.market?.summary && (
                                    <div className="brit-wr-repcell">
                                      <h5>{isHe ? 'שוק' : 'Market'}</h5>
                                      <p>{validReport.market.summary}</p>
                                    </div>
                                  )}
                                  {validReport.tactics?.summary && (
                                    <div className="brit-wr-repcell">
                                      <h5>{isHe ? 'טקטיקה' : 'Tactics'}</h5>
                                      <p>{validReport.tactics.summary}</p>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                            {report && 'error' in report && (
                              <p style={{ color: 'var(--red)', font: '11px/1.5 var(--body)' }}>{report.error}</p>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}

            {/* Empty state after search */}
            {!scoutSearching && scoutResults.length === 0 && !scoutError && scoutQuery.trim() && scoutSeenUrls.length > 0 && (
              <div className="brit-empty">
                {isHe ? 'לא נמצאו תוצאות. נסה שאילתה אחרת.' : 'No results found. Try a different query.'}
              </div>
            )}

            {/* Initial empty state */}
            {!scoutSearching && scoutResults.length === 0 && !scoutError && scoutSeenUrls.length === 0 && (
              <div className="brit-empty">
                {isHe ? 'הקלד שאילתה למעלה כדי להפעיל את חיפוש ה-AI' : 'Type a query above to activate AI search'}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
