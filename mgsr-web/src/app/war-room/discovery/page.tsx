'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
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

export default function WarRoomDiscoveryPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang } = useLanguage();
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
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-[var(--mgsr-gold)] font-display">{t('loading')}</div>
      </div>
    );
  }

  const requestMatches = filteredCandidates.filter((c) => c.source === 'request_match').length;
  const hiddenGems = filteredCandidates.filter((c) => c.source === 'hidden_gem').length;

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-[78rem] mx-auto">
        <WarRoomMasthead
          kicker={isHe ? 'מודיעין גילוי / פלטפורמת גברים' : 'Discovery intelligence / Men platform'}
          titleLead={isHe ? 'פיד' : 'The'}
          titleAccent={isHe ? 'הגילוי.' : 'discovery feed.'}
          sub={
            isHe
              ? 'פיד גילוי מבוסס AI. שחקנים ריאליסטיים עד גיל 31.'
              : 'AI-curated discovery feed. Realistic players up to age 31.'
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              {updatedAt && (
                <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] border border-[var(--mgsr-gold)]/30 whitespace-nowrap">
                  {isHe ? 'עודכן' : 'Updated'} {formatTimeAgo(updatedAt)}
                </span>
              )}
              <button
                onClick={fetchDiscovery}
                disabled={loadingDiscovery}
                className="px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-[0.08em] border border-[var(--mgsr-gold)]/40 text-[var(--mgsr-gold)] hover:bg-[var(--mgsr-gold-dim)] transition disabled:opacity-50 whitespace-nowrap min-h-[40px]"
              >
                {loadingDiscovery
                  ? isHe
                    ? 'מרענן...'
                    : 'Refreshing...'
                  : isHe
                    ? 'הרץ סריקת גילוי'
                    : 'Run discovery sweep'}
              </button>
            </div>
          }
        />

        <WarRoomSignals
          items={[
            { label: isHe ? 'מועמדים פעילים' : 'Live candidates', value: filteredCandidates.length },
            { label: isHe ? 'התאמות בקשה' : 'Request matches', value: requestMatches },
            { label: isHe ? 'יהלומים חבויים' : 'Hidden gems', value: hiddenGems, accent: 'gold' },
            { label: isHe ? 'ברשימת מעקב' : 'In shortlist', value: shortlistUrls.size },
          ]}
        />

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <p>{error}</p>
            <button onClick={fetchDiscovery} className="mt-2 text-sm underline hover:no-underline">
              {isHe ? 'נסה שוב' : 'Try again'}
            </button>
          </div>
        )}

        {/* Add to shortlist error */}
        {addError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {addError}
          </div>
        )}

        {/* Loading skeleton */}
        {loadingDiscovery && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl border border-mgsr-border bg-mgsr-card p-5 animate-pulse">
                <div className="flex gap-4 items-start">
                  <div className="w-14 h-14 rounded-xl bg-mgsr-border/60 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="h-5 w-3/4 rounded-lg bg-mgsr-border/60" />
                    <div className="h-4 w-1/2 rounded-lg bg-mgsr-border/40" />
                    <div className="flex gap-2">
                      <div className="h-5 w-16 rounded-lg bg-[var(--mgsr-gold-dim)]" />
                      <div className="h-5 w-12 rounded-lg bg-mgsr-border/30" />
                    </div>
                  </div>
                  <div className="w-16 h-8 rounded-lg bg-mgsr-border/40 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty — no candidates */}
        {!loadingDiscovery && candidates.length === 0 && !error && (
          <div className="py-20 text-center rounded-2xl bg-mgsr-card border border-mgsr-border/50">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--mgsr-gold-dim)] border border-[var(--mgsr-gold)]/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--mgsr-gold)]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-mgsr-muted font-medium">
              {isHe
                ? 'לא נמצאו שחקנים. נסה לרענן או הוסף בקשות מועדונים.'
                : 'No players found. Try refreshing or add club requests.'}
            </p>
          </div>
        )}

        {!loadingDiscovery && filteredCandidates.length > 0 && (
          <div className="space-y-4">
            {filteredCandidates.map((c) => {
              const inRoster = Array.from(rosterTmProfiles).some((r) => samePlayer(r, c.transfermarktUrl));
              const inShortlist = Array.from(shortlistUrls).some((s) => samePlayer(s, c.transfermarktUrl));
              const isAdding = addingUrl === c.transfermarktUrl;
              const tmUrl = c.transfermarktUrl;

              return (
                <div
                  key={c.transfermarktUrl}
                  className="rounded-2xl border border-mgsr-border bg-mgsr-card hover:border-[var(--mgsr-gold)]/30 transition-all duration-300 shadow-sm shadow-black/20"
                >
                  <div className="p-3 sm:p-5">
                    <div className="flex gap-3 sm:gap-4 items-start">
                      <img
                        src={getPlayerImageUrl(c.profileImage, c.transfermarktUrl)}
                        alt=""
                        className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl object-cover bg-mgsr-border shrink-0 ring-2 ring-mgsr-border/50 ring-offset-1 ring-offset-mgsr-card"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = TM_DEFAULT_IMG;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-bold text-base sm:text-lg text-mgsr-text truncate">{c.name}</p>
                        <p className="text-xs sm:text-sm text-mgsr-muted mt-0.5">
                          {c.age}
                          <span className="mx-1 sm:mx-1.5">·</span>
                          {displayShortPosition(c.position)}
                          <span className="mx-1 sm:mx-1.5">·</span>
                          {c.marketValue}
                          {c.club && (
                            <>
                              <span className="mx-1 sm:mx-1.5">·</span>
                              <span className="hidden sm:inline">{c.club}</span>
                              <span className="sm:hidden">{c.club.length > 15 ? c.club.slice(0, 15) + '…' : c.club}</span>
                            </>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              c.source === 'request_match'
                                ? 'bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)]'
                                : c.source === 'hidden_gem'
                                  ? 'bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)]'
                                  : 'bg-mgsr-border/40 text-mgsr-muted'
                            }`}
                          >
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--mgsr-gold)]/30 text-[var(--mgsr-gold)] border border-[var(--mgsr-gold)]/40">
                              ★ {c.hiddenGemScore}
                            </span>
                          )}
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
                        </div>
                        {((c.apiGoalsPer90 != null && !isNaN(c.apiGoalsPer90)) ||
                          (c.apiAssistsPer90 != null && !isNaN(c.apiAssistsPer90)) ||
                          c.apiRating != null ||
                          c.fmPa != null ||
                          c.fmCa != null) && (
                          <p className="text-xs text-mgsr-muted mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                            {c.apiRating != null && (
                              <span className="text-yellow-400 font-semibold">Rating: {c.apiRating.toFixed(2)}</span>
                            )}
                            {(c.apiGoalsPer90 != null && !isNaN(c.apiGoalsPer90)) ||
                            (c.apiAssistsPer90 != null && !isNaN(c.apiAssistsPer90)) ? (
                              <span>
                                G/90 {((c.apiGoalsPer90 ?? 0) as number).toFixed(2)}
                                {c.apiAssistsPer90 != null && !isNaN(c.apiAssistsPer90) && (
                                  <> · A/90 {(c.apiAssistsPer90 as number).toFixed(2)}</>
                                )}
                              </span>
                            ) : null}
                            {(c.fmPa != null || c.fmCa != null) && (
                              <span>
                                FM: CA {c.fmCa ?? '?'} · PA {c.fmPa ?? '?'}
                                {c.fmPotentialGap != null && c.fmPotentialGap > 0 && <> (+{c.fmPotentialGap})</>}
                              </span>
                            )}
                          </p>
                        )}
                        {c.source === 'hidden_gem' && c.hiddenGemReason && (
                          <div className="mt-3 p-3 rounded-xl bg-[var(--mgsr-gold-dim)] border border-[var(--mgsr-gold)]/25 text-start">
                            <p className="text-xs font-semibold text-[var(--mgsr-gold)] uppercase tracking-wider mb-1.5">
                              {isHe ? 'למה יהלום חבוי?' : 'Why hidden gem?'}
                            </p>
                            <p className="text-sm text-mgsr-text leading-relaxed">
                              {isHe ? c.hiddenGemReason.he : c.hiddenGemReason.en}
                            </p>
                          </div>
                        )}

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

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2 shrink-0 self-center">
                        <a
                          href={c.transfermarktUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-mgsr-border/80 text-mgsr-muted hover:bg-[var(--mgsr-gold-dim)] hover:text-[var(--mgsr-gold)] border border-mgsr-border transition whitespace-nowrap"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          Transfermarkt
                        </a>
                        {!inRoster && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addToShortlist(c);
                            }}
                            disabled={isAdding || inShortlist}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[var(--mgsr-gold-dim)] text-[var(--mgsr-gold)] hover:bg-[var(--mgsr-gold)]/20 border border-[var(--mgsr-gold)]/40 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {isAdding ? (
                              <>
                                <div className="w-3 h-3 border-2 border-[var(--mgsr-gold)]/50 border-t-[var(--mgsr-gold)] rounded-full animate-spin" />
                                {isHe ? 'מוסיף...' : 'Adding...'}
                              </>
                            ) : inShortlist ? (
                              <>{isHe ? 'ברשימת מעקב' : 'In shortlist'}</>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                {isHe ? 'הוסף למעקב' : 'Shortlist'}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
