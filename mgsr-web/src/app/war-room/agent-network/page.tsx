'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
import { AGENTS_CONFIG, type AgentId } from '@/lib/scoutAgentConfig';
import type { ScoutProfileResponse } from '@/types/scoutProfiles';
import { getPositionDisplayName } from '@/lib/appConfig';
import {
  TM_DEFAULT_IMG,
  getPlayerImageUrl,
  samePlayer,
  shortenPosition,
  formatTimeAgo,
  WarRoomMasthead,
  WarRoomSignals,
  TeammatesPanel,
} from '../_shared';
import { useWarRoomData } from '../useWarRoomData';

export default function WarRoomAgentNetworkPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang } = useLanguage();
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
          kicker={isHe ? 'רשת סוכנים / הגשות סקאוט' : 'Agent network / Scout submissions'}
          titleLead={isHe ? 'רשת' : 'The'}
          titleAccent={isHe ? 'הסוכנים.' : 'agent network.'}
          sub={
            isHe
              ? 'כל פרופיל נמצא על ידי סוכן שמנטר מדינה וליגותיה. המקור מוצג בבירור.'
              : 'Each profile was found by an AI scout agent that monitors a specific country and its leagues. Source is shown clearly.'
          }
          right={
            scoutLastRunAt ? (
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] border border-[var(--mgsr-gold)]/30 whitespace-nowrap">
                {isHe ? 'הרצה אחרונה' : 'Last run'} {formatTimeAgo(scoutLastRunAt)}
              </span>
            ) : undefined
          }
        />

        <WarRoomSignals
          items={[
            { label: isHe ? 'פרופילים' : 'Profiles', value: scoutProfiles.length },
            { label: isHe ? 'סוכנים' : 'Agents', value: Object.keys(AGENTS_CONFIG).length },
            { label: isHe ? 'מוצגים' : 'Shown', value: visibleScoutProfiles.length, accent: 'gold' },
          ]}
        />

        <div className="space-y-4">
          {/* Agent filter carousel */}
          <div
            className="flex gap-1 p-1.5 rounded-2xl bg-mgsr-card/80 backdrop-blur-md border border-mgsr-border/80 overflow-x-auto"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            <button
              onClick={() => setScoutAgentFilter('all')}
              className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[40px] ${
                scoutAgentFilter === 'all'
                  ? 'bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] border border-[var(--mgsr-gold)]/30'
                  : 'text-mgsr-muted hover:text-mgsr-text border border-transparent'
              }`}
            >
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
                  onClick={() => setScoutAgentFilter(aid)}
                  className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap min-h-[40px] ${
                    scoutAgentFilter === aid
                      ? 'bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] border border-[var(--mgsr-gold)]/30'
                      : 'text-mgsr-muted hover:text-mgsr-text border border-transparent'
                  }`}
                >
                  <span>{AGENTS_CONFIG[aid].flag}</span>
                  <span>{isHe ? AGENTS_CONFIG[aid].nameHe : AGENTS_CONFIG[aid].name}</span>
                </button>
              ))}
          </div>

          {/* Position filter */}
          <div
            className="flex gap-1 p-1.5 rounded-2xl bg-mgsr-card/70 backdrop-blur-md border border-mgsr-border/70 overflow-x-auto"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            <button
              onClick={() => setScoutPositionFilter('all')}
              className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[40px] ${
                scoutPositionFilter === 'all'
                  ? 'bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] border border-[var(--mgsr-gold)]/30'
                  : 'text-mgsr-muted hover:text-mgsr-text border border-transparent'
              }`}
            >
              {isHe ? 'כל העמדות' : 'All positions'}
            </button>
            {availableScoutPositions.map((position) => (
              <button
                key={position}
                onClick={() => setScoutPositionFilter(position)}
                className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[40px] ${
                  scoutPositionFilter === position
                    ? 'bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] border border-[var(--mgsr-gold)]/30'
                    : 'text-mgsr-muted hover:text-mgsr-text border border-transparent'
                }`}
              >
                {isHe ? getPositionDisplayName(position, true) : position}
              </button>
            ))}
          </div>

          {addError && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{addError}</div>
          )}

          {loadingScoutProfiles && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-mgsr-border bg-mgsr-card p-4 animate-pulse">
                  <div className="flex items-center gap-2 px-3 py-2 bg-[var(--mgsr-gold-dim)]/40 rounded-lg mb-3">
                    <div className="w-6 h-6 rounded bg-mgsr-border/60" />
                    <div className="h-4 w-32 rounded bg-mgsr-border/60" />
                  </div>
                  <div className="flex gap-3 p-3">
                    <div className="w-12 h-12 rounded-lg bg-mgsr-border/50" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-2/3 rounded bg-mgsr-border/60" />
                      <div className="h-3 w-1/2 rounded bg-mgsr-border/40" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loadingScoutProfiles && scoutProfiles.length === 0 && (
            <div className="py-20 text-center rounded-2xl bg-mgsr-card border border-mgsr-border/50">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--mgsr-gold-dim)] border border-[var(--mgsr-gold)]/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--mgsr-gold)]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                </svg>
              </div>
              <p className="text-mgsr-muted font-medium">
                {isHe
                  ? 'אין פרופילים עדיין. הסוכנים רצים כל 3 ימים (עם בדיקת שחזור יומית).'
                  : 'No profiles yet. Agents run every 3 days (with a daily recovery watchdog).'}
              </p>
              <p className="text-mgsr-muted/50 text-xs mt-1.5">
                {isHe ? 'הפרופילים יופיעו אוטומטית אחרי ההרצה הבאה' : 'Profiles will populate automatically after the next run'}
              </p>
            </div>
          )}

          {!loadingScoutProfiles && scoutProfiles.length > 0 && (
            <div className="space-y-4">
              {Object.keys(groupedVisibleScoutProfiles).length === 0 && (
                <div className="p-4 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/70 text-sm text-mgsr-muted">
                  {isHe ? 'אין פרופילים שתואמים למסנן העמדה הנוכחי.' : 'No scout profiles match the selected position filter.'}
                </div>
              )}
              {Object.entries(groupedVisibleScoutProfiles)
                .sort(([a], [b]) => {
                  const nameA = isHe ? AGENTS_CONFIG[a as AgentId]?.nameHe || a : AGENTS_CONFIG[a as AgentId]?.name || a;
                  const nameB = isHe ? AGENTS_CONFIG[b as AgentId]?.nameHe || b : AGENTS_CONFIG[b as AgentId]?.name || b;
                  return nameA.localeCompare(nameB, isHe ? 'he' : 'en');
                })
                .map(([agentId, allProfiles]) => {
                  const cfg = AGENTS_CONFIG[agentId as AgentId];
                  return (
                    <section key={agentId} className="rounded-2xl border border-mgsr-border bg-mgsr-card overflow-hidden">
                      <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 bg-[var(--mgsr-gold-dim)]/40 border-b border-mgsr-border/60">
                        <span className="text-xl sm:text-2xl">{cfg?.flag || '🌍'}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-display font-bold text-sm sm:text-base text-mgsr-text">
                            {isHe ? cfg?.nameHe : cfg?.name} Agent
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-[var(--mgsr-gold)]" />
                          <span className="text-xs font-semibold text-[var(--mgsr-gold)]">
                            {allProfiles.length} {isHe ? 'שחקנים' : 'players'}
                          </span>
                        </div>
                      </div>
                      <div className="p-2 sm:p-3 space-y-2">
                        {allProfiles.map((p) => {
                          const inRoster = Array.from(rosterTmProfiles).some((r) => samePlayer(r, p.tmProfileUrl));
                          const inShortlist = Array.from(shortlistUrls).some((s) => samePlayer(s, p.tmProfileUrl));
                          const isAdding = addingUrl === p.tmProfileUrl;
                          const tmUrl = p.tmProfileUrl;
                          return (
                            <div
                              key={p.id}
                              className="flex gap-3 p-3 sm:p-4 rounded-xl bg-mgsr-dark/80 border border-mgsr-border/60 hover:border-[var(--mgsr-gold)]/30 transition-all duration-200"
                            >
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-mgsr-border/50 shrink-0 overflow-hidden flex items-center justify-center ring-2 ring-mgsr-border/30 ring-offset-1 ring-offset-mgsr-dark">
                                <img
                                  src={getPlayerImageUrl(p.profileImage ?? undefined, p.tmProfileUrl)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = TM_DEFAULT_IMG;
                                  }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] border border-[var(--mgsr-gold)]/40">
                                    <span>{p.agentFlag}</span>
                                    <span className="hidden sm:inline">
                                      {isHe ? 'נמצא על ידי' : 'Found by'} {p.agentName} Agent
                                    </span>
                                    <span className="sm:hidden">{p.agentName}</span>
                                    {p.league && <span className="hidden sm:inline">· {p.league}</span>}
                                  </div>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] shrink-0">
                                    {isHe ? p.profileTypeLabelHe : p.profileTypeLabel}
                                  </span>
                                </div>
                                <p className="font-display font-bold text-sm sm:text-base text-mgsr-text truncate">{p.playerName}</p>
                                <p className="text-xs text-mgsr-muted">
                                  {p.age} · {displayShortPosition(p.position)} · {p.marketValue}
                                  {p.club && <span className="hidden sm:inline"> · {p.club}</span>}
                                </p>
                                <p className="text-xs text-mgsr-text mt-1 line-clamp-2 sm:line-clamp-none">
                                  {(isHe ? p.scoutExplanationHe : p.scoutExplanationEn) || p.matchReason}
                                </p>
                                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 items-center" onClick={(e) => e.stopPropagation()}>
                                  <a
                                    href={p.tmProfileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-mgsr-border text-mgsr-muted hover:text-[var(--mgsr-gold)] border border-mgsr-border transition min-h-[32px]"
                                  >
                                    TM →
                                  </a>
                                  <span className="flex items-center gap-0.5 text-mgsr-muted">
                                    <button
                                      type="button"
                                      onClick={() => setProfileFeedback(p.id, 'up', p.agentId)}
                                      className={`p-1.5 rounded transition ${scoutFeedback[p.id] === 'up' ? 'text-green-500 bg-green-500/20' : 'hover:text-green-500 hover:bg-green-500/10'}`}
                                      title={isHe ? 'טוב' : 'Good pick'}
                                      aria-label={isHe ? 'טוב' : 'Good pick'}
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" /></svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setProfileFeedback(p.id, 'down', p.agentId)}
                                      className={`p-1.5 rounded transition ${scoutFeedback[p.id] === 'down' ? 'text-red-500 bg-red-500/20' : 'hover:text-red-500 hover:bg-red-500/10'}`}
                                      title={isHe ? 'לא רלוונטי' : 'Not relevant'}
                                      aria-label={isHe ? 'לא רלוונטי' : 'Not relevant'}
                                    >
                                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" /></svg>
                                    </button>
                                  </span>
                                  {!inRoster && (
                                    <button
                                      onClick={() => addToShortlistFromProfile(p)}
                                      disabled={isAdding || inShortlist}
                                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] hover:bg-[var(--mgsr-gold)]/20 border border-[var(--mgsr-gold)]/40 transition disabled:opacity-50 min-h-[32px]"
                                    >
                                      {isAdding ? (isHe ? 'מוסיף...' : 'Adding...') : inShortlist ? (isHe ? 'ברשימת מעקב' : 'Shortlist') : isHe ? 'לרשימת מעקב' : '+ Shortlist'}
                                    </button>
                                  )}
                                  {inRoster && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--mgsr-teal)]/25 text-[var(--mgsr-teal)]">
                                      {isHe ? 'במאגר' : 'In roster'}
                                    </span>
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
        </div>
      </div>
    </AppLayout>
  );
}
