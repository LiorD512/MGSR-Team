'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { searchPlayers, getPlayerDetails, SearchPlayer, PlayerDetails } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';

const DEBOUNCE_MS = 350;
const MIN_SEARCH_LEN = 2;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function AddPlayerPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forShortlist = searchParams.get('shortlist') === '1';
  const fromReleases = searchParams.get('from') === 'releases';
  const fromShortlist = searchParams.get('from') === 'shortlist';
  const hasPreloadedUrl = !!(fromShortlist && searchParams.get('url'));

  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState(searchParams.get('url') || '');
  const [searchResults, setSearchResults] = useState<SearchPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDetails | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const debouncedSearch = useDebounce(searchQuery.trim(), DEBOUNCE_MS);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < MIN_SEARCH_LEN) {
      setSearchResults([]);
      return;
    }
    setLoadingSearch(true);
    setError('');
    try {
      const players = await searchPlayers(q);
      setSearchResults(players);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  useEffect(() => {
    runSearch(debouncedSearch);
  }, [debouncedSearch, runSearch]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const url = searchParams.get('url');
    if (url && url.startsWith('http') && !selectedPlayer) {
      setUrlInput(url);
      setLoadingDetails(true);
      getPlayerDetails(url)
        .then(setSelectedPlayer)
        .catch(() => setError('Failed to load player'))
        .finally(() => setLoadingDetails(false));
    }
  }, [searchParams]);

  const handleSelectFromSearch = async (p: SearchPlayer) => {
    setError('');
    setLoadingDetails(true);
    setSearchResults([]);
    setSearchQuery('');
    try {
      const details = await getPlayerDetails(p.tmProfile);
      setSelectedPlayer(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load player');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleLoadByUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setError('');
    setLoadingDetails(true);
    try {
      const details = await getPlayerDetails(url);
      setSelectedPlayer(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load player');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPlayer || !user) return;
    setError('');
    setSaving(true);
    try {
      if (forShortlist) {
        const docRef = doc(db, 'Shortlists', user.uid);
        const snap = await getDoc(docRef);
        const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
        const exists = current.some((e) => e.tmProfileUrl === selectedPlayer.tmProfile);
        if (exists) {
          setError('Already in shortlist');
          setSaving(false);
          return;
        }
        const entry: Record<string, unknown> = {
          tmProfileUrl: selectedPlayer.tmProfile,
          addedAt: Date.now(),
          playerImage: selectedPlayer.profileImage ?? null,
          playerName: selectedPlayer.fullName ?? null,
          playerPosition: selectedPlayer.positions?.[0] ?? null,
          playerAge: selectedPlayer.age ?? null,
          playerNationality: selectedPlayer.nationality ?? null,
          playerNationalityFlag: selectedPlayer.nationalityFlag ?? null,
          clubJoinedName: selectedPlayer.currentClub?.clubName ?? null,
          marketValue: selectedPlayer.marketValue ?? null,
        };
        await setDoc(docRef, { entries: [...current, entry] }, { merge: true });
        router.push(fromReleases ? '/releases' : '/shortlist');
      } else {
        const playersRef = collection(db, 'Players');
        const existing = await getDocs(
          query(playersRef, where('tmProfile', '==', selectedPlayer.tmProfile))
        );
        if (!existing.empty) {
          setError('Player already in roster');
          setSaving(false);
          return;
        }

        const accountsRef = collection(db, 'Accounts');
        const accountsSnap = await getDocs(accountsRef);
        let agentName = user.displayName || user.email || '';
        accountsSnap.forEach((d) => {
          const data = d.data();
          if (data.email?.toLowerCase() === user.email?.toLowerCase()) {
            agentName = data.name || agentName;
          }
        });

        const playerToSave: Record<string, unknown> = {
          tmProfile: selectedPlayer.tmProfile,
          fullName: selectedPlayer.fullName,
          height: selectedPlayer.height,
          age: selectedPlayer.age,
          positions: selectedPlayer.positions,
          profileImage: selectedPlayer.profileImage,
          nationality: selectedPlayer.nationality,
          nationalityFlag: selectedPlayer.nationalityFlag,
          contractExpired: selectedPlayer.contractExpires,
          marketValue: selectedPlayer.marketValue,
          currentClub: selectedPlayer.currentClub,
          createdAt: Date.now(),
          agentInChargeId: user.uid,
          agentInChargeName: agentName,
          isOnLoan: selectedPlayer.isOnLoan || false,
          onLoanFromClub: selectedPlayer.onLoanFromClub,
          foot: selectedPlayer.foot,
        };
        const pPhone = playerPhone.trim();
        const aPhone = agentPhone.trim();
        if (pPhone) playerToSave.playerPhoneNumber = pPhone;
        if (aPhone) playerToSave.agentPhoneNumber = aPhone;

        // Firestore rejects undefined; remove any undefined values
        const sanitized = Object.fromEntries(
          Object.entries(playerToSave).filter(([, v]) => v !== undefined)
        );

        await addDoc(collection(db, 'Players'), sanitized);
        const feedEvent: Record<string, unknown> = {
          type: 'PLAYER_ADDED',
          playerName: playerToSave.fullName ?? null,
          playerImage: playerToSave.profileImage ?? null,
          playerTmProfile: playerToSave.tmProfile,
          timestamp: Date.now(),
          agentName,
        };
        await addDoc(collection(db, 'FeedEvents'), feedEvent);

        if (fromShortlist) {
          const shortlistRef = doc(db, 'Shortlists', user.uid);
          const shortlistSnap = await getDoc(shortlistRef);
          const entries = (shortlistSnap.data()?.entries as Record<string, unknown>[]) || [];
          const sanitize = (e: Record<string, unknown>) => {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(e)) out[k] = v === undefined ? null : v;
            return out;
          };
          const filtered = entries
            .filter((e) => e.tmProfileUrl !== selectedPlayer.tmProfile)
            .map(sanitize);
          await setDoc(shortlistRef, { entries: filtered }, { merge: true });
        }

        router.push(fromReleases ? '/releases' : fromShortlist ? '/shortlist' : '/players');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const clearSelection = () => {
    setSelectedPlayer(null);
    setSearchQuery('');
    setSearchResults([]);
    setError('');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  const backHref = fromReleases ? '/releases' : (forShortlist || fromShortlist) ? '/shortlist' : '/players';
  const backLabel = fromReleases ? t('releases_title') : (forShortlist || fromShortlist) ? t('shortlist_title') : t('players');
  const pageTitle = forShortlist ? t('add_to_shortlist_title') : t('add_player_title');

  const showSearchSection = !hasPreloadedUrl;

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-mgsr-muted hover:text-mgsr-teal transition-colors mb-10 group"
          >
            <span className={`transition-transform duration-200 group-hover:-translate-x-1 ${isRtl ? 'rotate-180' : ''}`}>←</span>
            <span className="text-sm font-medium">{t('add_player_back')} {backLabel}</span>
          </Link>

          <h1 className="font-display font-bold text-2xl sm:text-3xl text-mgsr-text tracking-tight mb-1">
            {pageTitle}
          </h1>
          <p className="text-mgsr-muted text-sm mb-10">
            {hasPreloadedUrl
              ? t('add_player_from_shortlist_hint')
              : forShortlist
                ? t('add_player_shortlist_hint')
                : t('add_player_roster_hint')}
          </p>

          {error && (
            <div className="mb-8 p-4 rounded-2xl bg-mgsr-red/15 border border-mgsr-red/30 text-mgsr-red text-sm flex items-center gap-3">
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-mgsr-red animate-pulse" />
              {error}
            </div>
          )}

          {/* Preloaded from shortlist */}
          {hasPreloadedUrl && (
            <div className="space-y-8">
              {loadingDetails ? (
                <div className="flex flex-col items-center justify-center py-32">
                  <div className="w-14 h-14 rounded-2xl border-2 border-mgsr-teal/30 border-t-mgsr-teal animate-spin" />
                  <p className="mt-5 text-mgsr-muted text-sm">{t('add_player_loading')}</p>
                </div>
              ) : selectedPlayer ? (
                <div className="rounded-xl border border-mgsr-border bg-mgsr-card p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
                      <div className="shrink-0">
                        <img
                          src={selectedPlayer.profileImage || 'https://via.placeholder.com/120'}
                          alt=""
                          className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover ring-2 ring-mgsr-teal/40 shadow-lg"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-display font-bold text-xl sm:text-2xl text-mgsr-text truncate">
                          {selectedPlayer.fullName || 'Unknown'}
                        </h2>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {selectedPlayer.positions?.[0] && (
                            <span className="px-2.5 py-0.5 rounded-lg bg-mgsr-teal/20 text-mgsr-teal text-xs font-semibold">
                              {selectedPlayer.positions[0]}
                            </span>
                          )}
                          {selectedPlayer.currentClub?.clubName && (
                            <span className="text-mgsr-muted text-sm">{selectedPlayer.currentClub.clubName}</span>
                          )}
                        </div>
                        <p className="text-mgsr-teal font-semibold mt-3">{selectedPlayer.marketValue}</p>
                      </div>
                    </div>

                    {!forShortlist && (
                      <div className="mt-8 pt-6 border-t border-mgsr-border/80 space-y-4">
                        <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider">
                          {t('add_player_contact_section')}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-mgsr-muted mb-1.5">{t('player_info_player_phone')}</label>
                            <input
                              type="tel"
                              value={playerPhone}
                              onChange={(e) => setPlayerPhone(e.target.value)}
                              placeholder="+972 50 123 4567"
                              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-mgsr-muted mb-1.5">{t('player_info_agent_phone')}</label>
                            <input
                              type="tel"
                              value={agentPhone}
                              onChange={(e) => setAgentPhone(e.target.value)}
                              placeholder="+972 50 987 6543"
                              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="mt-8 w-full py-3.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {saving ? t('add_player_saving') : forShortlist ? t('shortlist_add') : t('add_player_to_roster')}
                    </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Full flow: URL + Auto-search */}
          {showSearchSection && (
            <div className="space-y-10">
              {/* URL paste */}
              <div>
                <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-3">
                  {t('add_player_paste_url')}
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder={t('add_player_placeholder_url')}
                    className="flex-1 px-4 py-3.5 rounded-xl bg-mgsr-card/80 border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/70 focus:outline-none focus:border-mgsr-teal/50 focus:ring-2 focus:ring-mgsr-teal/20 transition"
                  />
                  <button
                    onClick={handleLoadByUrl}
                    disabled={loadingDetails || !urlInput.trim()}
                    className="px-5 py-3.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 disabled:opacity-50 transition shrink-0"
                  >
                    {loadingDetails ? t('add_player_loading') : t('add_player_load')}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-mgsr-border/80" />
                <span className="text-[10px] text-mgsr-muted uppercase tracking-[0.2em] font-medium">{t('common_or')}</span>
                <div className="flex-1 h-px bg-mgsr-border/80" />
              </div>

              {/* Auto-search */}
              <div>
                <label className="block text-sm font-medium text-mgsr-muted mb-2">
                  {t('add_player_search')}
                </label>
                <div
                  className={`relative rounded-xl border transition-colors ${
                    searchFocused ? 'border-mgsr-teal/50 bg-mgsr-card' : 'border-mgsr-border bg-mgsr-card'
                  }`}
                >
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder={t('add_player_placeholder_search')}
                    className="w-full px-5 py-3.5 pr-14 bg-transparent text-mgsr-text placeholder-mgsr-muted focus:outline-none text-[15px]"
                  />
                  <div className="absolute inset-y-0 end-0 flex items-center w-14 justify-center pointer-events-none">
                    {loadingSearch ? (
                      <div className="w-5 h-5 rounded-full border-2 border-mgsr-teal/40 border-t-mgsr-teal animate-spin" />
                    ) : (
                      <svg className="w-5 h-5 text-mgsr-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-mgsr-muted">
                  {t('add_player_auto_search_hint')}
                </p>

                {/* Results list */}
                {searchResults.length > 0 && !selectedPlayer && (
                  <div className="mt-4 rounded-xl border border-mgsr-border bg-mgsr-card overflow-hidden divide-y divide-mgsr-border">
                    <div className="max-h-72 overflow-y-auto">
                      {searchResults.map((p, i) => (
                        <button
                          key={p.tmProfile}
                          onClick={() => handleSelectFromSearch(p)}
                          disabled={loadingDetails}
                          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-mgsr-teal/10 active:bg-mgsr-teal/15 transition-colors text-left disabled:opacity-50 animate-search-result-in"
                          style={{ animationDelay: `${Math.min(i * 30, 150)}ms` }}
                        >
                          <img
                            src={p.playerImage || 'https://via.placeholder.com/56'}
                            alt=""
                            className="w-14 h-14 rounded-xl object-cover bg-mgsr-dark shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-mgsr-text text-base leading-snug truncate">
                              {p.playerName || 'Unknown'}
                            </p>
                            <p className="text-sm text-mgsr-muted mt-1 leading-snug truncate">
                              {p.playerPosition && <span>{p.playerPosition}</span>}
                              {p.playerPosition && p.currentClub && <span> · </span>}
                              {p.currentClub && <span>{p.currentClub}</span>}
                              {p.playerValue && (
                                <>
                                  <span className="text-mgsr-muted/70"> · </span>
                                  <span className="text-mgsr-teal">{p.playerValue}</span>
                                </>
                              )}
                            </p>
                          </div>
                          <svg className="w-5 h-5 text-mgsr-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchQuery.length >= MIN_SEARCH_LEN && !loadingSearch && searchResults.length === 0 && debouncedSearch === searchQuery.trim() && (
                  <div className="mt-4 py-8 text-center rounded-2xl border border-mgsr-border/50 bg-mgsr-card/40">
                    <p className="text-mgsr-muted text-sm">{t('add_player_no_results')}</p>
                  </div>
                )}
              </div>

              {/* Selected player card */}
              {selectedPlayer && (
                <div className="relative rounded-xl border-2 border-mgsr-teal/40 bg-mgsr-card p-6 sm:p-8 animate-fade-in">
                    <button
                      onClick={clearSelection}
                      className="absolute top-4 end-4 p-2 rounded-lg text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-teal/10 transition"
                      aria-label="Change player"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>

                    <h3 className="font-semibold text-mgsr-text mb-4 pr-10">{t('add_player_confirm')}</h3>
                    <div className="flex items-start gap-4 mb-6">
                      <img
                        src={selectedPlayer.profileImage || 'https://via.placeholder.com/80'}
                        alt=""
                        className="w-20 h-20 rounded-xl object-cover bg-mgsr-dark ring-2 ring-mgsr-teal/40"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-mgsr-text text-lg">{selectedPlayer.fullName}</p>
                        <p className="text-sm text-mgsr-muted mt-0.5">
                          {selectedPlayer.positions?.join(', ')} • {selectedPlayer.currentClub?.clubName}
                        </p>
                        <p className="text-mgsr-teal font-semibold mt-2">{selectedPlayer.marketValue}</p>
                      </div>
                    </div>

                    {!forShortlist && (
                      <div className="mb-6 space-y-4">
                        <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider">
                          {t('add_player_contact_section')}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs text-mgsr-muted mb-1.5">{t('player_info_player_phone')}</label>
                            <input
                              type="tel"
                              value={playerPhone}
                              onChange={(e) => setPlayerPhone(e.target.value)}
                              placeholder="+972 50 123 4567"
                              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-mgsr-muted mb-1.5">{t('player_info_agent_phone')}</label>
                            <input
                              type="tel"
                              value={agentPhone}
                              onChange={(e) => setAgentPhone(e.target.value)}
                              placeholder="+972 50 987 6543"
                              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="w-full py-3.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 disabled:opacity-50 transition-colors"
                    >
                      {saving
                        ? t('add_player_saving')
                        : forShortlist
                          ? t('shortlist_add')
                          : t('add_player_to_roster')}
                    </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
