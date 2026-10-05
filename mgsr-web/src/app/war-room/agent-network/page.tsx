'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import BritLoader from '@/components/BritLoader';
import { AGENTS_CONFIG, type AgentId } from '@/lib/scoutAgentConfig';
import type { ScoutProfileResponse } from '@/types/scoutProfiles';
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

export default function WarRoomAgentNetworkPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang, setLang } = useLanguage();
  const router = useRouter();
  const isHe = lang === 'he';

  const {
    scoutProfiles,
    scoutProfilesExcludingRosterAndShortlist,
    loadingScoutProfiles,
    scoutLastRunAt,
    scoutAgentFilter,
    setScoutAgentFilter,
    scoutPositionFilter,
    setScoutPositionFilter,
    scoutFeedback,
    setProfileFeedback,
    fetchScoutProfiles,
    shortlistUrls,
    rosterTmProfiles,
    addingUrl,
    addError,
    addToShortlistFromProfile,
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
    if (user) fetchScoutProfiles();
  }, [user, scoutAgentFilter, fetchScoutProfiles]);

  const scoutProfilesAfterAgentFilter = useMemo(
    () =>
      scoutProfilesExcludingRosterAndShortlist.filter((p) =>
        scoutAgentFilter === 'all' ? true : p.agentId === scoutAgentFilter
      ),
    [scoutProfilesExcludingRosterAndShortlist, scoutAgentFilter]
  );

  const availableScoutPositions = useMemo(() => {
    const unique = new Set<string>();
    for (const profile of scoutProfilesAfterAgentFilter) {
      const code = shortenPosition(profile.position);
      if (!code || code === '—') continue;
      unique.add(code);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [scoutProfilesAfterAgentFilter]);

  useEffect(() => {
    if (scoutPositionFilter !== 'all' && !availableScoutPositions.includes(scoutPositionFilter)) {
      setScoutPositionFilter('all');
    }
  }, [availableScoutPositions, scoutPositionFilter, setScoutPositionFilter]);

  const visibleScoutProfiles = useMemo(
    () =>
      scoutProfilesAfterAgentFilter.filter((p) =>
        scoutPositionFilter === 'all' ? true : shortenPosition(p.position) === scoutPositionFilter
      ),
    [scoutProfilesAfterAgentFilter, scoutPositionFilter]
  );

  const groupedVisibleScoutProfiles = useMemo(
    () =>
      visibleScoutProfiles.reduce<Record<string, ScoutProfileResponse[]>>((acc, p) => {
        (acc[p.agentId] = acc[p.agentId] || []).push(p);
        return acc;
      }, {}),
    [visibleScoutProfiles]
  );

  if (loading || !user) {
    return <BritLoader fullPage />;
  }

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="war-room" />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_war_room')}</strong> / <strong>{t('nav_war_room_agent_network')}</strong> / {dateStr}
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
                <p className="brit-kicker">{isHe ? 'רשת סוכנים / הגשות סקאוט' : 'Agent network / Scout submissions'}</p>
                <h1>
                  {isHe ? 'רשת' : 'The'} <span>{isHe ? 'הסוכנים.' : 'agent network.'}</span>
                </h1>
                <p className="brit-ra-sub">
                  {isHe
                    ? 'כל פרופיל נמצא על ידי סוכן שמנטר מדינה וליגותיה. המקור מוצג בבירור.'
                    : 'Each profile was found by an AI scout agent that monitors a specific country and its leagues. Source is shown clearly.'}
                </p>
              </div>
              {scoutLastRunAt && (
                <div className="brit-ra-mast">
                  <span className="brit-ra-lastrun">
                    {isHe ? 'הרצה אחרונה' : 'Last run'} {formatTimeAgo(scoutLastRunAt)}
                  </span>
                </div>
              )}
            </header>

            {/* Signals */}
            <section className="brit-signals brit-signals-3">
              <div className="brit-signal">
                <label>{isHe ? 'פרופילים' : 'Profiles'}</label>
                <strong>{pad(scoutProfiles.length)}</strong>
                <small>{isHe ? 'הגשות סקאוט פעילות' : 'Active scout submissions'}</small>
              </div>
              <div className="brit-signal">
                <label>{isHe ? 'סוכנים' : 'Agents'}</label>
                <strong>{pad(Object.keys(AGENTS_CONFIG).length)}</strong>
                <small>{isHe ? 'סוכנים לפי מדינה' : 'Country scout agents'}</small>
              </div>
              <div className="brit-signal">
                <label>{isHe ? 'מוצגים' : 'Shown'}</label>
                <strong className="brit-gold">{pad(visibleScoutProfiles.length)}</strong>
                <small>{isHe ? 'אחרי סינון' : 'After filters'}</small>
              </div>
            </section>

            {/* Agent filter */}
            <section className="brit-tray">
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{isHe ? 'סוכן' : 'Agent'}</span>
                <div className="brit-req-chipset">
                  <button className={scoutAgentFilter === 'all' ? 'on' : ''} onClick={() => setScoutAgentFilter('all')}>
                    {isHe ? 'כל הסוכנים' : 'All agents'}
                  </button>
                  {(Object.keys(AGENTS_CONFIG) as AgentId[])
                    .sort((a, b) => {
                      const nameA = isHe ? AGENTS_CONFIG[a].nameHe : AGENTS_CONFIG[a].name;
                      const nameB = isHe ? AGENTS_CONFIG[b].nameHe : AGENTS_CONFIG[b].name;
                      return nameA.localeCompare(nameB, isHe ? 'he' : 'en');
                    })
                    .map((aid) => (
                      <button
                        key={aid}
                        className={scoutAgentFilter === aid ? 'on' : ''}
                        onClick={() => setScoutAgentFilter(aid)}
                      >
                        {AGENTS_CONFIG[aid].flag} {isHe ? AGENTS_CONFIG[aid].nameHe : AGENTS_CONFIG[aid].name}
                      </button>
                    ))}
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{isHe ? 'עמדה' : 'Position'}</span>
                <div className="brit-req-chipset">
                  <button className={scoutPositionFilter === 'all' ? 'on' : ''} onClick={() => setScoutPositionFilter('all')}>
                    {isHe ? 'כל העמדות' : 'All positions'}
                  </button>
                  {availableScoutPositions.map((position) => (
                    <button
                      key={position}
                      className={scoutPositionFilter === position ? 'on' : ''}
                      onClick={() => setScoutPositionFilter(position)}
                    >
                      {isHe ? getPositionDisplayName(position, true) : position}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {addError && <div className="brit-wr-error">{addError}</div>}

            <p className="brit-result-count">
              {isHe
                ? `מציג ${visibleScoutProfiles.length} פרופילים`
                : `Showing ${visibleScoutProfiles.length} profiles`}
            </p>

            {/* Grouped profiles */}
            {loadingScoutProfiles ? (
              <div className="brit-empty">{isHe ? 'טוען פרופילים…' : 'Loading profiles…'}</div>
            ) : scoutProfiles.length === 0 ? (
              <div className="brit-empty">
                {isHe
                  ? 'אין פרופילים עדיין. הסוכנים רצים כל 3 ימים (עם בדיקת שחזור יומית).'
                  : 'No profiles yet. Agents run every 3 days (with a daily recovery watchdog).'}
              </div>
            ) : Object.keys(groupedVisibleScoutProfiles).length === 0 ? (
              <div className="brit-empty">
                {isHe ? 'אין פרופילים שתואמים למסנן העמדה הנוכחי.' : 'No scout profiles match the selected position filter.'}
              </div>
            ) : (
              <div>
                {Object.entries(groupedVisibleScoutProfiles)
                  .sort(([a], [b]) => {
                    const nameA = isHe ? AGENTS_CONFIG[a as AgentId]?.nameHe || a : AGENTS_CONFIG[a as AgentId]?.name || a;
                    const nameB = isHe ? AGENTS_CONFIG[b as AgentId]?.nameHe || b : AGENTS_CONFIG[b as AgentId]?.name || b;
                    return nameA.localeCompare(nameB, isHe ? 'he' : 'en');
                  })
                  .map(([agentId, allProfiles]) => {
                    const cfg = AGENTS_CONFIG[agentId as AgentId];
                    return (
                      <section key={agentId} className="brit-wr-agentgroup">
                        <div className="brit-wr-agenthead">
                          <span className="flag">{cfg?.flag || '🌍'}</span>
                          <h3>{isHe ? cfg?.nameHe : cfg?.name} Agent</h3>
                          <span className="cnt">
                            {allProfiles.length} {isHe ? 'שחקנים' : 'players'}
                          </span>
                        </div>
                        <div className="brit-wr-profiles">
                          {allProfiles.map((p) => {
                            const inRoster = Array.from(rosterTmProfiles).some((r) => samePlayer(r, p.tmProfileUrl));
                            const inShortlist = Array.from(shortlistUrls).some((s) => samePlayer(s, p.tmProfileUrl));
                            const isAdding = addingUrl === p.tmProfileUrl;
                            const tmUrl = p.tmProfileUrl;
                            return (
                              <div key={p.id} className="brit-wr-profile">
                                <img
                                  className="pic"
                                  src={getPlayerImageUrl(p.profileImage ?? undefined, p.tmProfileUrl)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = TM_DEFAULT_IMG;
                                  }}
                                />
                                <div className="body">
                                  <span className="foundby">
                                    {p.agentFlag} {isHe ? 'נמצא על ידי' : 'Found by'} {p.agentName}
                                    {p.league ? ` · ${p.league}` : ''}
                                    {' · '}
                                    {isHe ? p.profileTypeLabelHe : p.profileTypeLabel}
                                  </span>
                                  <div className="nm" title={p.playerName}>{p.playerName}</div>
                                  <div className="sub">
                                    {p.age} · {displayShortPosition(p.position)} · {p.marketValue}
                                    {p.club ? ` · ${p.club}` : ''}
                                  </div>
                                  <p className="reason">
                                    {(isHe ? p.scoutExplanationHe : p.scoutExplanationEn) || p.matchReason}
                                  </p>

                                  <div className="brit-wr-badges">
                                    {inRoster && <span className="brit-wr-tag roster">{isHe ? 'במאגר' : 'In roster'}</span>}
                                    {inShortlist && !inRoster && (
                                      <span className="brit-wr-tag shortlist">{isHe ? 'ברשימת מעקב' : 'In shortlist'}</span>
                                    )}
                                  </div>

                                  <div className="brit-wr-acts">
                                    <a href={p.tmProfileUrl} target="_blank" rel="noopener noreferrer">
                                      TM →
                                    </a>
                                    <button
                                      type="button"
                                      className={`fb up${scoutFeedback[p.id] === 'up' ? ' on' : ''}`}
                                      onClick={() => setProfileFeedback(p.id, 'up', p.agentId)}
                                      title={isHe ? 'טוב' : 'Good pick'}
                                      aria-label={isHe ? 'טוב' : 'Good pick'}
                                    >
                                      <svg viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" /></svg>
                                    </button>
                                    <button
                                      type="button"
                                      className={`fb down${scoutFeedback[p.id] === 'down' ? ' on' : ''}`}
                                      onClick={() => setProfileFeedback(p.id, 'down', p.agentId)}
                                      title={isHe ? 'לא רלוונטי' : 'Not relevant'}
                                      aria-label={isHe ? 'לא רלוונטי' : 'Not relevant'}
                                    >
                                      <svg viewBox="0 0 20 20"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" /></svg>
                                    </button>
                                    {!inRoster && (
                                      <button className="save" onClick={() => addToShortlistFromProfile(p)} disabled={isAdding || inShortlist}>
                                        {isAdding ? (
                                          <>
                                            <span className="sp" />
                                            {isHe ? 'מוסיף...' : 'Adding...'}
                                          </>
                                        ) : inShortlist ? (
                                          <>{isHe ? 'ברשימת מעקב' : 'Shortlist'}</>
                                        ) : (
                                          <>
                                            <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                            {isHe ? 'לרשימת מעקב' : 'Shortlist'}
                                          </>
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  <TeammatesPanel
                                    tmUrl={tmUrl}
                                    playerName={p.playerName}
                                    teammates={tmUrl ? teammatesCache[tmUrl] : undefined}
                                    isLoading={loadingTeammatesUrl === tmUrl}
                                    isExpanded={expandedTeammatesUrl === tmUrl}
                                    onToggle={(e) => handleTeammatesClick(e, tmUrl)}
                                    t={t}
                                    compact
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
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
