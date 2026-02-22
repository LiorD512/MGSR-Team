'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, addDoc, query, where, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { searchPlayers, getPlayerDetails, SearchPlayer, PlayerDetails } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';

export default function AddPlayerPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forShortlist = searchParams.get('shortlist') === '1';
  const fromReleases = searchParams.get('from') === 'releases';
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState(searchParams.get('url') || '');
  const [searchResults, setSearchResults] = useState<SearchPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDetails | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setError('');
    setLoadingSearch(true);
    try {
      const players = await searchPlayers(searchQuery.trim());
      setSearchResults(players);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleSelectFromSearch = async (p: SearchPlayer) => {
    setError('');
    setLoadingDetails(true);
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
        const entry = {
          tmProfileUrl: selectedPlayer.tmProfile,
          addedAt: Date.now(),
          playerImage: selectedPlayer.profileImage,
          playerName: selectedPlayer.fullName,
          playerPosition: selectedPlayer.positions?.[0],
          playerAge: selectedPlayer.age,
          playerNationality: selectedPlayer.nationality,
          playerNationalityFlag: selectedPlayer.nationalityFlag,
          clubJoinedName: selectedPlayer.currentClub?.clubName,
          marketValue: selectedPlayer.marketValue,
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

        const playerToSave = {
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

        await addDoc(collection(db, 'Players'), playerToSave);
        await addDoc(collection(db, 'FeedEvents'), {
          type: 'PLAYER_ADDED',
          playerName: playerToSave.fullName,
          playerImage: playerToSave.profileImage,
          playerTmProfile: playerToSave.tmProfile,
          timestamp: Date.now(),
          agentName,
        });

        router.push(fromReleases ? '/releases' : '/players');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  const backLabel = fromReleases ? t('releases_title') : forShortlist ? t('shortlist_title') : t('players');
  const pageTitle = forShortlist ? t('add_to_shortlist_title') : t('add_player_title');

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-2xl mx-auto">
        <Link
          href={fromReleases ? '/releases' : forShortlist ? '/shortlist' : '/players'}
          className="inline-flex items-center gap-2 text-mgsr-teal hover:underline mb-6"
        >
          <span className={isRtl ? 'rotate-180' : ''}>←</span>
          {t('add_player_back')} {backLabel}
        </Link>

        <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight mb-8">
          {pageTitle}
        </h1>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-mgsr-red/20 border border-mgsr-red/30 text-mgsr-red">
            {error}
          </div>
        )}

        <div className="space-y-8">
          {/* URL input */}
          <div>
            <label className="block text-sm font-medium text-mgsr-muted mb-2">
              {t('add_player_paste_url')}
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={t('add_player_placeholder_url')}
                className="flex-1 px-4 py-3 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition"
              />
              <button
                onClick={handleLoadByUrl}
                disabled={loadingDetails || !urlInput.trim()}
                className="px-5 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 disabled:opacity-50 transition"
              >
                {loadingDetails ? t('add_player_loading') : t('add_player_load')}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-mgsr-border" />
            <span className="text-sm text-mgsr-muted">{t('common_or')}</span>
            <div className="flex-1 h-px bg-mgsr-border" />
          </div>

          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-mgsr-muted mb-2">
              {t('add_player_search')}
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={t('add_player_placeholder_search')}
                className="flex-1 px-4 py-3 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition"
              />
              <button
                onClick={handleSearch}
                disabled={loadingSearch || !searchQuery.trim()}
                className="px-5 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 disabled:opacity-50 transition"
              >
                {loadingSearch ? t('add_player_searching') : t('add_player_search_btn')}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2 max-h-64 overflow-y-auto rounded-xl border border-mgsr-border">
                {searchResults.map((p) => (
                  <button
                    key={p.tmProfile}
                    onClick={() => handleSelectFromSearch(p)}
                    disabled={loadingDetails}
                    className="w-full flex items-center gap-4 p-3 rounded-lg bg-mgsr-card hover:bg-mgsr-card/80 hover:border-mgsr-teal/30 border border-transparent text-left disabled:opacity-50 transition"
                  >
                    <img
                      src={p.playerImage || 'https://via.placeholder.com/40'}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover bg-mgsr-dark"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-mgsr-text truncate">{p.playerName || 'Unknown'}</p>
                      <p className="text-sm text-mgsr-muted truncate">
                        {p.playerPosition} • {p.currentClub} • {p.playerValue}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected player confirm */}
          {selectedPlayer && (
            <div className="p-6 bg-mgsr-card border-2 border-mgsr-teal/50 rounded-2xl animate-fade-in">
              <h3 className="font-semibold text-mgsr-text mb-4">{t('add_player_confirm')}</h3>
              <div className="flex items-start gap-4 mb-6">
                <img
                  src={selectedPlayer.profileImage || 'https://via.placeholder.com/80'}
                  alt=""
                  className="w-20 h-20 rounded-full object-cover bg-mgsr-dark ring-2 ring-mgsr-teal/40"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-mgsr-text text-lg">{selectedPlayer.fullName}</p>
                  <p className="text-sm text-mgsr-muted mt-0.5">
                    {selectedPlayer.positions?.join(', ')} • {selectedPlayer.currentClub?.clubName}
                  </p>
                  <p className="text-mgsr-teal font-semibold mt-2">{selectedPlayer.marketValue}</p>
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-3.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 disabled:opacity-50 transition"
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
      </div>
    </AppLayout>
  );
}
