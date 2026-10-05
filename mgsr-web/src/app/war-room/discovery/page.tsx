'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import BritLoader from '@/components/BritLoader';
import { getPositionDisplayName } from '@/lib/appConfig';
import {
  TM_DEFAULT_IMG,
  getPlayerImageUrl,
  samePlayer,
  shortenPosition,
  formatTimeAgo,
  TeammatesPanel,
} from '../_shared';
import { useWarRoomData } from '../useWarRoomData';

export default function WarRoomDiscoveryPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang, setLang } = useLanguage();
  const router = useRouter();
  const isHe = lang === 'he';

  const {
    candidates,
    filteredCandidates,
    loadingDiscovery,
    error,
    updatedAt,
    fetchDiscovery,
    shortlistUrls,
    rosterTmProfiles,
    addingUrl,
    addError,
    addToShortlist,
    teammatesCache,
    loadingTeammatesUrl,
    expandedTeammatesUrl,
    handleTeammatesClick,
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
    if (user) fetchDiscovery();
  }, [user, fetchDiscovery]);

  if (loading || !user) {
    return <BritLoader fullPage />;
  }

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const requestMatches = filteredCandidates.filter((c) => c.source === 'request_match').length;
  const hiddenGems = filteredCandidates.filter((c) => c.source === 'hidden_gem').length;
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="war-room" />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_war_room')}</strong> / <strong>{t('nav_war_room_discovery')}</strong> / {dateStr}
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
                <p className="brit-kicker">{isHe ? 'מודיעין גילוי / פלטפורמת גברים' : 'Discovery intelligence / Men platform'}</p>
                <h1>
                  {isHe ? 'פיד' : 'The'} <span>{isHe ? 'הגילוי.' : 'discovery feed.'}</span>
                </h1>
                <p className="brit-ra-sub">
                  {isHe
                    ? 'פיד גילוי מבוסס AI. שחקנים ריאליסטיים עד גיל 31.'
                    : 'AI-curated discovery feed. Realistic players up to age 31.'}
                </p>
              </div>
              <div className="brit-ra-mast">
                <button
                  className={`brit-ra-refresh${loadingDiscovery ? ' live' : ''}`}
                  onClick={fetchDiscovery}
                  disabled={loadingDiscovery}
                >
                  <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
                  <span>
                    {loadingDiscovery
                      ? isHe ? 'מרענן...' : 'Refreshing...'
                      : isHe ? 'הרץ סריקת גילוי' : 'Run discovery sweep'}
                  </span>
                </button>
                {updatedAt && (
                  <span className="brit-ra-lastrun">
                    {isHe ? 'עודכן' : 'Updated'} {formatTimeAgo(updatedAt)}
                  </span>
                )}
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals brit-signals-4">
              <div className="brit-signal">
                <label>{isHe ? 'מועמדים פעילים' : 'Live candidates'}</label>
                <strong>{pad(filteredCandidates.length)}</strong>
                <small>{isHe ? 'מוצגים כעת' : 'Shown now'}</small>
              </div>
              <div className="brit-signal">
                <label>{isHe ? 'התאמות בקשה' : 'Request matches'}</label>
                <strong>{pad(requestMatches)}</strong>
                <small>{isHe ? 'תואמים לדרישות מועדון' : 'Match club requirements'}</small>
              </div>
              <div className="brit-signal">
                <label>{isHe ? 'יהלומים חבויים' : 'Hidden gems'}</label>
                <strong className="brit-gold">{pad(hiddenGems)}</strong>
                <small>{isHe ? 'פוטנציאל נסתר' : 'Undervalued upside'}</small>
              </div>
              <div className="brit-signal">
                <label>{isHe ? 'ברשימת מעקב' : 'In shortlist'}</label>
                <strong>{pad(shortlistUrls.size)}</strong>
                <small>{isHe ? 'שמורים לרשימה' : 'Saved to shortlist'}</small>
              </div>
            </section>

            {/* Error */}
            {error && (
              <div className="brit-wr-error">
                <p>{error}</p>
                <button onClick={fetchDiscovery}>{isHe ? 'נסה שוב' : 'Try again'}</button>
              </div>
            )}

            {/* Add to shortlist error */}
            {addError && <div className="brit-wr-error">{addError}</div>}

            <p className="brit-result-count">
              {isHe
                ? `מציג ${filteredCandidates.length} מתוך ${candidates.length}`
                : `Showing ${filteredCandidates.length} of ${candidates.length}`}
            </p>

            {/* Feed */}
            {loadingDiscovery ? (
              <div className="brit-empty">{isHe ? 'טוען פיד גילוי…' : 'Loading discovery feed…'}</div>
            ) : candidates.length === 0 ? (
              <div className="brit-empty">
                {isHe
                  ? 'לא נמצאו שחקנים. נסה לרענן או הוסף בקשות מועדונים.'
                  : 'No players found. Try refreshing or add club requests.'}
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="brit-empty">{isHe ? 'אין תוצאות' : 'No results'}</div>
            ) : (
              <div className="brit-ra-feed">
                {filteredCandidates.map((c) => {
                  const inRoster = Array.from(rosterTmProfiles).some((r) => samePlayer(r, c.transfermarktUrl));
                  const inShortlist = Array.from(shortlistUrls).some((s) => samePlayer(s, c.transfermarktUrl));
                  const isAdding = addingUrl === c.transfermarktUrl;
                  const tmUrl = c.transfermarktUrl;
                  const hasStats =
                    (c.apiGoalsPer90 != null && !isNaN(c.apiGoalsPer90)) ||
                    (c.apiAssistsPer90 != null && !isNaN(c.apiAssistsPer90)) ||
                    c.apiRating != null ||
                    c.fmPa != null ||
                    c.fmCa != null;

                  return (
                    <article key={c.transfermarktUrl} className={`brit-ra-alert${inRoster ? ' roster' : ''}`}>
                      <div className="brit-ra-top">
                        <div className="brit-ra-flagbg-ph" aria-hidden="true" />
                        <div className="brit-ra-portrait">
                          <img
                            className="p"
                            src={getPlayerImageUrl(c.profileImage, c.transfermarktUrl)}
                            alt=""
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = TM_DEFAULT_IMG;
                            }}
                          />
                        </div>
                        <div className="brit-ra-who">
                          <div className="nm" title={c.name}>{c.name}</div>
                          <div className="meta">
                            <span className="age">{t('players_age_display').replace('{age}', c.age)}</span>
                            <span className="pos">{displayShortPosition(c.position)}</span>
                            <span className="nat">{c.marketValue}</span>
                            {c.club && <span className="nat">{c.club}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="brit-wr-body">
                        <div className="brit-wr-badges">
                          <span className={`brit-wr-tag${c.source === 'general' ? '' : ' gold'}`}>
                            {c.source === 'request_match'
                              ? c.sourceLabel
                              : c.source === 'hidden_gem'
                                ? isHe
                                  ? `יהלום חבוי ${c.sourceLabel.replace('Hidden Gem ', '')}`
                                  : c.sourceLabel
                                : isHe
                                  ? 'גילוי'
                                  : 'Discovery'}
                          </span>
                          {c.source === 'hidden_gem' && c.hiddenGemScore != null && (
                            <span className="brit-wr-tag solid">★ {c.hiddenGemScore}</span>
                          )}
                          {inRoster && <span className="brit-wr-tag roster">{isHe ? 'במאגר' : 'In roster'}</span>}
                          {inShortlist && !inRoster && (
                            <span className="brit-wr-tag shortlist">{isHe ? 'ברשימת מעקב' : 'In shortlist'}</span>
                          )}
                        </div>

                        {hasStats && (
                          <div className="brit-wr-stats" dir="ltr">
                            {c.apiRating != null && <span className="rating">Rating: {c.apiRating.toFixed(2)}</span>}
                            {((c.apiGoalsPer90 != null && !isNaN(c.apiGoalsPer90)) ||
                              (c.apiAssistsPer90 != null && !isNaN(c.apiAssistsPer90))) && (
                              <span>
                                G/90 <b>{((c.apiGoalsPer90 ?? 0) as number).toFixed(2)}</b>
                                {c.apiAssistsPer90 != null && !isNaN(c.apiAssistsPer90) && (
                                  <> · A/90 <b>{(c.apiAssistsPer90 as number).toFixed(2)}</b></>
                                )}
                              </span>
                            )}
                            {(c.fmPa != null || c.fmCa != null) && (
                              <span>
                                FM: CA <b>{c.fmCa ?? '?'}</b> · PA <b>{c.fmPa ?? '?'}</b>
                                {c.fmPotentialGap != null && c.fmPotentialGap > 0 && <> (+{c.fmPotentialGap})</>}
                              </span>
                            )}
                          </div>
                        )}

                        {c.source === 'hidden_gem' && c.hiddenGemReason && (
                          <div className="brit-wr-gem">
                            <label>{isHe ? 'למה יהלום חבוי?' : 'Why hidden gem?'}</label>
                            <p>{isHe ? c.hiddenGemReason.he : c.hiddenGemReason.en}</p>
                          </div>
                        )}

                        <div className="brit-wr-acts">
                          <a href={c.transfermarktUrl} target="_blank" rel="noopener noreferrer">
                            Transfermarkt
                          </a>
                          {!inRoster && (
                            <button className="save" onClick={() => addToShortlist(c)} disabled={isAdding || inShortlist}>
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
                                  {isHe ? 'הוסף למעקב' : 'Shortlist'}
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        <TeammatesPanel
                          tmUrl={tmUrl}
                          playerName={c.name}
                          teammates={tmUrl ? teammatesCache[tmUrl] : undefined}
                          isLoading={loadingTeammatesUrl === tmUrl}
                          isExpanded={expandedTeammatesUrl === tmUrl}
                          onToggle={(e) => handleTeammatesClick(e, tmUrl)}
                          t={t}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
