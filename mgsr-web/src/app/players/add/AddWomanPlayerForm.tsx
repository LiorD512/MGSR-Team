'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { addWomanPlayer, checkWomanPlayerExists } from '@/lib/playersWomen';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { SHORTLISTS_COLLECTIONS } from '@/lib/platformCollections';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const DEBOUNCE_MS = 350;
const MIN_SEARCH_LEN = 2;

interface WomanPlayerSearchResult {
  fullName: string;
  currentClub?: string;
  age?: string;
  nationality?: string;
  position?: string;
  profileImage?: string;
  soccerDonnaUrl?: string;
  wosostatId?: string;
  source: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export default function AddWomanPlayerForm() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forShortlist = searchParams.get('shortlist') === '1';
  const fromShortlist = searchParams.get('from') === 'shortlist';
  const preloadUrl = searchParams.get('url') ?? '';
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WomanPlayerSearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [fullName, setFullName] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [currentClub, setCurrentClub] = useState('');
  const [age, setAge] = useState('');
  const [nationality, setNationality] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [soccerDonnaUrl, setSoccerDonnaUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [wosostatId, setWosostatId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [searchingImage, setSearchingImage] = useState(false);

  const debouncedSearch = useDebounce(searchQuery.trim(), DEBOUNCE_MS);

  const mapPosition = (pos: string): string[] => {
    const p = pos.toLowerCase();
    if (p.includes('keeper') || p.includes('goalkeeper') || p === 'gk') return ['GK'];
    if (p.includes('centre back') || p.includes('center back') || p === 'cb') return ['CB'];
    if (p.includes('left back') || p.includes('fullback, left') || p === 'lb') return ['LB'];
    if (p.includes('right back') || p.includes('fullback, right') || p === 'rb') return ['RB'];
    if (p.includes('defensive mid') || p === 'dm') return ['DM'];
    if (p.includes('central mid') || p.includes('centre mid') || p === 'cm') return ['CM'];
    if (p.includes('attacking mid') || p === 'am') return ['AM'];
    if (p.includes('left wing') || p.includes('left winger') || p === 'lw') return ['LW'];
    if (p.includes('right wing') || p.includes('right winger') || p === 'rw') return ['RW'];
    if (p.includes('centre forward') || p.includes('center forward') || p.includes('striker') || p === 'cf') return ['CF'];
    if (p.includes('second striker') || p === 'ss') return ['SS'];
    return [pos];
  };

  const runSearch = useCallback(async (q: string) => {
    if (q.length < MIN_SEARCH_LEN) {
      setSearchResults([]);
      return;
    }
    setLoadingSearch(true);
    try {
      const res = await fetch(`/api/women-players/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: WomanPlayerSearchResult[] };
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  useEffect(() => {
    runSearch(debouncedSearch);
  }, [debouncedSearch, runSearch]);

  useEffect(() => {
    if (!preloadUrl || !preloadUrl.includes('soccerdonna')) return;
    setUrlInput(preloadUrl);
    setLoadingProfile(true);
    setError('');
    fetch('/api/women-players/fetch-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: preloadUrl }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load profile');
        return res.json();
      })
      .then((data: Record<string, string>) => {
        setFullName(data.fullName ?? '');
        setCurrentClub(data.currentClub ?? '');
        setAge(data.age ?? '');
        setNationality(data.nationality ?? '');
        setMarketValue(data.marketValue ?? '');
        setProfileImage(data.profileImage ?? '');
        setSoccerDonnaUrl(data.soccerDonnaUrl ?? preloadUrl);
        if (data.position) setPositions(mapPosition(data.position));
      })
      .catch(() => setError('Failed to load profile'))
      .finally(() => setLoadingProfile(false));
  }, [preloadUrl]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectResult = async (r: WomanPlayerSearchResult) => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);

    if (r.soccerDonnaUrl && r.source === 'soccerdonna') {
      setLoadingProfile(true);
      setError('');
      try {
        const res = await fetch('/api/women-players/fetch-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: r.soccerDonnaUrl }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || 'Failed to load profile');
        }
        const data = (await res.json()) as Record<string, string>;
        setFullName(data.fullName ?? r.fullName);
        setCurrentClub(data.currentClub ?? r.currentClub ?? '');
        setAge(data.age ?? r.age ?? '');
        setNationality(data.nationality ?? r.nationality ?? '');
        setMarketValue(data.marketValue ?? '');
        setProfileImage(data.profileImage ?? r.profileImage ?? '');
        setSoccerDonnaUrl(data.soccerDonnaUrl ?? r.soccerDonnaUrl ?? '');
        if (data.position) setPositions(mapPosition(data.position));
        else if (r.position) {
          const pos = r.position.toUpperCase().replace(/\s/g, '');
          const matched = POSITIONS.filter((p) => pos.includes(p) || p.includes(pos));
          setPositions(matched.length > 0 ? matched : [r.position]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load profile';
        const isFetchFailed = msg.toLowerCase().includes('fetch') || msg.includes('network');
        setError(isFetchFailed ? t('add_woman_player_fetch_failed_select') : msg);
        setFullName(r.fullName);
        setCurrentClub(r.currentClub ?? '');
        setAge(r.age ?? '');
        setNationality(r.nationality ?? '');
        setProfileImage(r.profileImage ?? '');
        setSoccerDonnaUrl(r.soccerDonnaUrl ?? '');
        setWosostatId(r.wosostatId);
        if (r.position) {
          const pos = r.position.toUpperCase().replace(/\s/g, '');
          const matched = POSITIONS.filter((p) => pos.includes(p) || p.includes(pos));
          setPositions(matched.length > 0 ? matched : [r.position]);
        }
      } finally {
        setLoadingProfile(false);
      }
    } else {
      setFullName(r.fullName);
      setCurrentClub(r.currentClub ?? '');
      setAge(r.age ?? '');
      setNationality(r.nationality ?? '');
      setProfileImage(r.profileImage ?? '');
      setSoccerDonnaUrl(r.soccerDonnaUrl ?? '');
      setWosostatId(r.wosostatId);
      if (r.position) {
        const pos = r.position.toUpperCase().replace(/\s/g, '');
        const matched = POSITIONS.filter((p) => pos.includes(p) || p.includes(pos));
        setPositions(matched.length > 0 ? matched : [r.position]);
      }
    }
  };

  const clearForm = () => {
    setFullName('');
    setPositions([]);
    setCurrentClub('');
    setAge('');
    setNationality('');
    setMarketValue('');
    setProfileImage('');
    setSoccerDonnaUrl('');
    setNotes('');
    setPlayerPhone('');
    setAgentPhone('');
    setWosostatId(undefined);
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
  };

  const handleLoadByUrl = async () => {
    const url = urlInput.trim();
    if (!url || !url.includes('soccerdonna')) return;
    setError('');
    setLoadingUrl(true);
    setLoadingProfile(true);
    try {
      const res = await fetch('/api/women-players/fetch-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Failed to load profile');
      }
      const data = (await res.json()) as Record<string, string>;
      setFullName(data.fullName ?? '');
      setCurrentClub(data.currentClub ?? '');
      setAge(data.age ?? '');
      setNationality(data.nationality ?? '');
      setMarketValue(data.marketValue ?? '');
      setProfileImage(data.profileImage ?? '');
      setSoccerDonnaUrl(data.soccerDonnaUrl ?? url);
      if (data.position) setPositions(mapPosition(data.position));
      setUrlInput('');
      setSearchQuery('');
      setSearchResults([]);
      setSearchFocused(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load profile';
      const isFetchFailed = msg.toLowerCase().includes('fetch') || msg.includes('network');
      setError(isFetchFailed ? t('add_woman_player_fetch_failed_url') : msg);
    } finally {
      setLoadingUrl(false);
      setLoadingProfile(false);
    }
  };

  const handleSearchImage = async () => {
    const name = fullName.trim();
    if (!name) return;
    setSearchingImage(true);
    setError('');
    try {
      const res = await fetch(`/api/women-players/search-image?q=${encodeURIComponent(name)}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Image search failed');
      }
      const data = (await res.json()) as { images?: string[] };
      const first = data.images?.[0];
      if (first) setProfileImage(first);
      else setError('No image found. Try a different name or paste a URL.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image search failed');
    } finally {
      setSearchingImage(false);
    }
  };

  const togglePosition = (pos: string) => {
    setPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !user) return;
    setError('');
    setSaving(true);
    try {
      const { collection, getDocs, addDoc, query, where, deleteDoc } = await import('firebase/firestore');
      const accountsSnap = await getDocs(collection(db, 'Accounts'));
      let agentName = user.displayName || user.email || '';
      accountsSnap.forEach((d) => {
        const data = d.data();
        if (data.email?.toLowerCase() === user.email?.toLowerCase()) {
          agentName = data.name || agentName;
        }
      });

      if (forShortlist) {
        const profileUrl = soccerDonnaUrl.trim() || urlInput.trim();
        if (!profileUrl || (!profileUrl.includes('soccerdonna') && !profileUrl.includes('fminside'))) {
          setError(t('shortlist_women_profile_url_required'));
          setSaving(false);
          return;
        }
        if (profileUrl.includes('soccerdonna')) {
          const inRoster = await checkWomanPlayerExists(profileUrl);
          if (inRoster) {
            setError(t('shortlist_player_in_roster_women'));
            setSaving(false);
            return;
          }
        }
        const account = await getCurrentAccountForShortlist(user);
        const colRef = collection(db, SHORTLISTS_COLLECTIONS.women);
        const q = query(colRef, where('tmProfileUrl', '==', profileUrl));
        const existsSnap = await getDocs(q);
        if (!existsSnap.empty) {
          setError(t('shortlist_already_added'));
          setSaving(false);
          return;
        }
        const entry = {
          tmProfileUrl: profileUrl,
          addedAt: Date.now(),
          playerImage: profileImage.trim() || null,
          playerName: fullName.trim(),
          playerPosition: positions[0] ?? null,
          playerAge: age.trim() || null,
          playerNationality: nationality.trim() || null,
          clubJoinedName: currentClub.trim() || null,
          marketValue: marketValue.trim() || null,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
        };
        await addDoc(colRef, entry);
        await addDoc(collection(db, 'FeedEventsWomen'), {
          type: 'SHORTLIST_ADDED',
          playerName: fullName.trim(),
          playerImage: profileImage.trim() || null,
          playerTmProfile: profileUrl,
          timestamp: Date.now(),
          agentName: account.name ?? null,
        });
        router.push('/shortlist');
        return;
      }

      if (soccerDonnaUrl.trim()) {
        const exists = await checkWomanPlayerExists(soccerDonnaUrl.trim());
        if (exists) {
          setError(t('add_woman_player_duplicate_error'));
          setSaving(false);
          return;
        }
      }

      const pPhone = playerPhone.trim();
      const aPhone = agentPhone.trim();

      const playerId = await addWomanPlayer({
        fullName: fullName.trim(),
        positions: positions.length > 0 ? positions : undefined,
        currentClub: currentClub.trim() ? { clubName: currentClub.trim() } : undefined,
        age: age.trim() || undefined,
        nationality: nationality.trim() || undefined,
        marketValue: marketValue.trim() || undefined,
        profileImage: profileImage.trim() || undefined,
        soccerDonnaUrl: soccerDonnaUrl.trim() || undefined,
        wosostatId: wosostatId?.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(pPhone ? { playerPhoneNumber: pPhone } : {}),
        ...(aPhone ? { agentPhoneNumber: aPhone } : {}),
        agentInChargeId: user.uid,
        agentInChargeName: agentName,
      });

      if (fromShortlist && preloadUrl) {
        const q = query(collection(db, SHORTLISTS_COLLECTIONS.women), where('tmProfileUrl', '==', preloadUrl));
        const shortlistSnap = await getDocs(q);
        for (const d of shortlistSnap.docs) {
          await deleteDoc(d.ref);
        }
        await addDoc(collection(db, 'FeedEventsWomen'), {
          type: 'SHORTLIST_REMOVED',
          playerName: fullName.trim(),
          playerImage: profileImage.trim() || null,
          playerTmProfile: preloadUrl,
          timestamp: Date.now(),
          agentName,
        });
      }

      await addDoc(collection(db, 'FeedEventsWomen'), {
        type: 'PLAYER_ADDED',
        playerName: fullName.trim(),
        playerImage: profileImage.trim() || null,
        playerWomenId: playerId,
        timestamp: Date.now(),
        agentName,
      });

      router.push(fromShortlist ? '/shortlist' : '/players');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      if (msg.toLowerCase().includes('permission') || msg.includes('PERMISSION_DENIED')) {
        setError(
          'Missing or insufficient permissions. Ensure Firestore rules are deployed (firebase deploy --only firestore) and you are logged in.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-[var(--women-rose)] font-display">
          {t('loading')}
        </div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen relative">
        {loadingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center women-dialog-backdrop">
            <div className="women-dialog-content flex flex-col items-center gap-4 p-8 rounded-2xl bg-mgsr-card overflow-hidden">
              <div className="women-dialog-accent -mx-8 -mt-8 mb-0" />
              <div className="w-10 h-10 border-2 border-[var(--women-rose)] border-t-transparent rounded-full animate-spin" />
              <p className="text-mgsr-text font-medium">{t('add_woman_player_load_profile')}</p>
            </div>
          </div>
        )}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Athletic feminine: curved gradient accent */}
          <div className="relative mb-10 overflow-hidden">
            <div
              className="absolute -top-16 -right-16 w-72 h-72 rounded-full opacity-20"
              style={{
                background: 'radial-gradient(circle, var(--women-rose) 0%, transparent 70%)',
              }}
            />
          </div>

          <Link
            href={forShortlist ? '/shortlist' : fromShortlist ? '/shortlist' : '/players'}
            className="inline-flex items-center gap-2 text-mgsr-muted hover:text-[var(--women-rose)] transition-colors mb-10 group"
          >
            <span
              className={`transition-transform duration-200 group-hover:-translate-x-1 ${isRtl ? 'rotate-180' : ''}`}
            >
              ←
            </span>
            <span className="text-sm font-medium">
              {t('add_player_back')} {forShortlist || fromShortlist ? t('shortlist_title_women') : t('players_women')}
            </span>
          </Link>

          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-mgsr-text tracking-tight mb-1">
            {forShortlist ? t('shortlist_add_to_shortlist_women') : t('add_woman_player_title')}
          </h1>
          <p className="text-mgsr-muted text-sm mb-6">
            {forShortlist ? t('shortlist_add_hint_women') : t('add_woman_player_subtitle')}
          </p>

          {/* Search with autocomplete */}
          <div ref={searchRef} className="relative mb-8">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder={t('add_woman_player_search_placeholder')}
                className="w-full px-4 py-3.5 pl-10 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mgsr-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {searchFocused && (searchQuery.trim().length >= MIN_SEARCH_LEN || searchResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-2xl bg-mgsr-card border border-mgsr-border shadow-xl z-50 overflow-hidden">
                {loadingSearch ? (
                  <div className="px-4 py-6 text-center text-mgsr-muted text-sm">{t('add_woman_player_searching')}</div>
                ) : searchResults.length > 0 ? (
                  <ul className="max-h-64 overflow-auto py-2">
                    {searchResults.map((r, i) => (
                      <li key={`${r.fullName}-${r.source}-${i}`}>
                        <button
                          type="button"
                          onClick={() => handleSelectResult(r)}
                          className="w-full px-4 py-3 text-left hover:bg-mgsr-dark/80 flex items-center gap-3 transition"
                        >
                          {r.profileImage ? (
                            <img src={r.profileImage} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-mgsr-border shrink-0 flex items-center justify-center text-mgsr-muted text-sm font-medium">
                              {r.fullName.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-mgsr-text truncate">{r.fullName}</div>
                            <div className="text-xs text-mgsr-muted truncate">
                              {[r.currentClub && (r.currentClub.toLowerCase() === 'vereinslos' ? t('without_club') : r.currentClub), r.nationality, r.position].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                          <span className="text-[10px] uppercase text-mgsr-muted shrink-0">{r.source}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : searchQuery.trim().length >= MIN_SEARCH_LEN ? (
                  <div className="px-4 py-6 text-center text-mgsr-muted text-sm">
                    {t('add_woman_player_no_results')}
                  </div>
                ) : null}
                <div className="border-t border-mgsr-border px-4 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      clearForm();
                      setSearchFocused(false);
                    }}
                    className="text-sm text-[var(--women-rose)] hover:underline font-medium"
                  >
                    {t('add_woman_player_add_manually')}
                  </button>
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-mgsr-muted">
              {t('add_woman_player_or_manual')}{' '}
              <button
                type="button"
                onClick={clearForm}
                className="text-[var(--women-rose)] hover:underline font-medium"
              >
                {t('add_woman_player_add_manually_link')}
              </button>
              {' '}{t('add_woman_player_with_details')}
            </p>
            <div className="mt-4 pt-4 border-t border-mgsr-border">
              <p className="text-xs text-mgsr-muted mb-2">
                {t('add_woman_player_paste_url_hint')}
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder={t('add_woman_player_url_placeholder')}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted text-sm focus:outline-none focus:border-[var(--women-rose)]/50"
                />
                <button
                  type="button"
                  onClick={handleLoadByUrl}
                  disabled={loadingUrl || !urlInput.trim().includes('soccerdonna')}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {loadingUrl ? t('add_woman_player_loading') : t('add_woman_player_load')}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-8 p-4 rounded-2xl bg-mgsr-red/15 border border-mgsr-red/30 text-mgsr-red text-sm flex items-center gap-3">
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-mgsr-red animate-pulse" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                {t('add_woman_player_full_name')}
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('add_woman_player_full_name_placeholder')}
                required
                className="w-full px-4 py-3.5 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                {t('add_woman_player_positions')}
              </label>
              <div className="flex flex-wrap gap-2">
                {POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => togglePosition(pos)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                      positions.includes(pos)
                        ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)]'
                        : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                  {t('add_woman_player_club')}
                </label>
                <input
                  type="text"
                  value={currentClub}
                  onChange={(e) => setCurrentClub(e.target.value)}
                  placeholder={t('add_woman_player_club_placeholder')}
                  className="w-full px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                  {t('add_woman_player_age')}
                </label>
                <input
                  type="text"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder={t('add_woman_player_age_placeholder')}
                  className="w-full px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition"
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                  {t('add_woman_player_nationality')}
                </label>
                <input
                  type="text"
                  value={nationality}
                  onChange={(e) => setNationality(e.target.value)}
                  placeholder={t('add_woman_player_nationality_placeholder')}
                  className="w-full px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                  {t('add_woman_player_market_value')}
                </label>
                <input
                  type="text"
                  value={marketValue}
                  onChange={(e) => setMarketValue(e.target.value)}
                  placeholder={t('add_woman_player_market_value_placeholder')}
                  className="w-full px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                SoccerDonna profile URL
              </label>
              <input
                type="url"
                value={soccerDonnaUrl}
                onChange={(e) => setSoccerDonnaUrl(e.target.value)}
                placeholder="https://www.soccerdonna.de/..."
                className="w-full px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition"
              />
              <p className="mt-1.5 text-xs text-mgsr-muted">
                Optional. Used for duplicate check and future enrichment.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                {t('add_woman_player_profile_image')}
              </label>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={profileImage}
                      onChange={(e) => setProfileImage(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition"
                    />
                    <button
                      type="button"
                      onClick={handleSearchImage}
                      disabled={searchingImage || !fullName.trim()}
                      className="px-4 py-3 rounded-2xl text-sm font-medium bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30 disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
                    >
                      {searchingImage ? t('add_woman_player_searching_image') : t('add_woman_player_search_image')}
                    </button>
                  </div>
                </div>
                {profileImage && (
                  <div className="shrink-0">
                    <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                      {t('add_woman_player_image_preview')}
                    </p>
                    <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-mgsr-border bg-mgsr-dark flex items-center justify-center">
                      <img
                        src={profileImage}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/96/1A2736/E8A0BF?text=?';
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!forShortlist && (
            <div className="space-y-4">
              <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider">
                {t('add_player_contact_section')}
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-mgsr-muted mb-1.5">{t('player_info_player_phone_women')}</label>
                  <input
                    type="tel"
                    value={playerPhone}
                    onChange={(e) => setPlayerPhone(e.target.value)}
                    placeholder="+972 50 123 4567"
                    className="w-full px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-mgsr-muted mb-1.5">{t('player_info_agent_phone')}</label>
                  <input
                    type="tel"
                    value={agentPhone}
                    onChange={(e) => setAgentPhone(e.target.value)}
                    placeholder="+972 50 987 6543"
                    className="w-full px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition text-sm"
                  />
                </div>
              </div>
            </div>
            )}

            {!forShortlist && (
            <div>
              <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">
                {t('add_woman_player_notes')}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('add_woman_player_notes_placeholder')}
                rows={3}
                className="w-full px-4 py-3 rounded-2xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50 focus:ring-2 focus:ring-[var(--women-rose)]/20 transition resize-none"
              />
            </div>
            )}

            <button
              type="submit"
              disabled={saving || !fullName.trim()}
              className="w-full py-3.5 rounded-2xl font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors bg-[var(--women-gradient)] text-white shadow-[0_0_30px_rgba(232,160,191,0.2)]"
            >
              {saving
                ? t('add_woman_player_saving')
                : forShortlist
                  ? t('shortlist_add')
                  : t('add_woman_player_to_roster')}
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
