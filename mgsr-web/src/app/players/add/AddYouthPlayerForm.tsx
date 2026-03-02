'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { addYouthPlayer, checkYouthPlayerExists, computeAgeGroup } from '@/lib/playersYouth';
import { doc, getDoc, setDoc, collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { SHORTLISTS_COLLECTIONS, SHARED_SHORTLIST_DOC_ID } from '@/lib/platformCollections';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const DEBOUNCE_MS = 400;
const MIN_SEARCH_LEN = 2;

interface YouthPlayerSearchResult {
  fullName: string;
  fullNameHe?: string;
  currentClub?: string;
  age?: string;
  dateOfBirth?: string;
  nationality?: string;
  position?: string;
  profileImage?: string;
  ifaUrl?: string;
  ifaPlayerId?: string;
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

export default function AddYouthPlayerForm() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forShortlist = searchParams.get('shortlist') === '1';
  const fromShortlist = searchParams.get('from') === 'shortlist';
  const preloadUrl = searchParams.get('url') ?? '';

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouthPlayerSearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Player info
  const [fullName, setFullName] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [currentClub, setCurrentClub] = useState('');
  const [academy, setAcademy] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [nationality, setNationality] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [ifaUrl, setIfaUrl] = useState('');
  const [ifaPlayerId, setIfaPlayerId] = useState('');
  const [notes, setNotes] = useState('');

  // Contact info
  const [playerPhone, setPlayerPhone] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentRelationship, setParentRelationship] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [searchingImage, setSearchingImage] = useState(false);

  const debouncedSearch = useDebounce(searchQuery.trim(), DEBOUNCE_MS);
  const searchRequestRef = useRef<string | null>(null);

  // ── Search IFA ── (ignore stale responses when user typed a new query)
  const runSearch = useCallback(async (q: string) => {
    if (q.length < MIN_SEARCH_LEN) {
      searchRequestRef.current = null;
      setSearchResults([]);
      return;
    }
    searchRequestRef.current = q;
    setLoadingSearch(true);
    try {
      const res = await fetch(`/api/youth-players/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: YouthPlayerSearchResult[] };
      if (searchRequestRef.current === q) {
        setSearchResults(data.results ?? []);
      }
    } catch {
      if (searchRequestRef.current === q) {
        setSearchResults([]);
      }
    } finally {
      if (searchRequestRef.current === q) {
        setLoadingSearch(false);
      }
    }
  }, []);

  useEffect(() => {
    runSearch(debouncedSearch);
  }, [debouncedSearch, runSearch]);

  // Preload URL
  useEffect(() => {
    if (!preloadUrl || !preloadUrl.includes('football.org.il')) return;
    setUrlInput(preloadUrl);
    setLoadingProfile(true);
    setError('');
    fetch('/api/youth-players/fetch-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: preloadUrl }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load profile');
        return res.json();
      })
      .then((data: Record<string, string | string[] | Record<string, unknown>>) => {
        applyProfileData(data, preloadUrl);
      })
      .catch(() => setError('Failed to load IFA profile'))
      .finally(() => setLoadingProfile(false));
  }, [preloadUrl]);

  // Click-outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyProfileData = (data: Record<string, unknown>, url?: string) => {
    setFullName(String(data.fullName ?? data.fullNameHe ?? ''));
    setCurrentClub(String(data.currentClub ?? ''));
    setAcademy(String(data.academy ?? ''));
    setNationality(String(data.nationality ?? ''));
    setProfileImage(String(data.profileImage ?? ''));
    setIfaUrl(String(data.ifaUrl ?? url ?? ''));
    setIfaPlayerId(String(data.ifaPlayerId ?? ''));
    if (data.dateOfBirth) {
      const dob = String(data.dateOfBirth);
      setDateOfBirth(dob);
      setAgeGroup(computeAgeGroup(dob) ?? '');
    }
    if (Array.isArray(data.positions) && data.positions.length) {
      setPositions(data.positions.filter((p): p is string => typeof p === 'string'));
    }
  };

  const handleSelectResult = async (r: YouthPlayerSearchResult) => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);

    if (r.ifaUrl) {
      setLoadingProfile(true);
      setError('');
      try {
        const res = await fetch('/api/youth-players/fetch-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: r.ifaUrl }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || 'Failed to load profile');
        }
        const data = (await res.json()) as Record<string, unknown>;
        applyProfileData(data, r.ifaUrl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load profile';
        setError(msg);
        // Fallback from search result
        setFullName((r.fullName || r.fullNameHe) ?? '');
        setCurrentClub(r.currentClub ?? '');
        setIfaUrl(r.ifaUrl ?? '');
        setIfaPlayerId(r.ifaPlayerId ?? '');
      } finally {
        setLoadingProfile(false);
      }
    } else {
      setFullName((r.fullName || r.fullNameHe) ?? '');
      setCurrentClub(r.currentClub ?? '');
      setIfaUrl(r.ifaUrl ?? '');
      setIfaPlayerId(r.ifaPlayerId ?? '');
    }
  };

  const clearForm = () => {
    setFullName('');
    setPositions([]);
    setCurrentClub('');
    setAcademy('');
    setDateOfBirth('');
    setAgeGroup('');
    setNationality('');
    setProfileImage('');
    setIfaUrl('');
    setIfaPlayerId('');
    setNotes('');
    setPlayerPhone('');
    setPlayerEmail('');
    setParentName('');
    setParentRelationship('');
    setParentPhone('');
    setParentEmail('');
    setSearchQuery('');
    setSearchResults([]);
    setSearchFocused(false);
    setError('');
  };

  const handleLoadByUrl = async () => {
    const url = urlInput.trim();
    if (!url || !url.includes('football.org.il')) return;
    setError('');
    setLoadingUrl(true);
    setLoadingProfile(true);
    try {
      const res = await fetch('/api/youth-players/fetch-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || 'Failed to load profile');
      }
      const data = (await res.json()) as Record<string, unknown>;
      applyProfileData(data, url);
      setUrlInput('');
      setSearchQuery('');
      setSearchResults([]);
      setSearchFocused(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load profile';
      setError(msg);
      // Keep IFA URL so user can edit other fields manually
      const pid = url.match(/player_id=(\d+)/)?.[1];
      if (pid) {
        setIfaUrl(url);
        setIfaPlayerId(pid);
      }
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
      const res = await fetch(`/api/youth-players/search-image?q=${encodeURIComponent(name)}`);
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
      const accountsSnap = await getDocs(collection(db, 'Accounts'));
      let agentName = user.displayName || user.email || '';
      accountsSnap.forEach((d) => {
        const data = d.data();
        if (data.email?.toLowerCase() === user.email?.toLowerCase()) {
          agentName = data.name || agentName;
        }
      });

      // Shortlist flow
      if (forShortlist) {
        const profileUrl = ifaUrl.trim() || urlInput.trim();
        if (!profileUrl || !profileUrl.includes('football.org.il')) {
          setError('An IFA profile URL is required for the shortlist.');
          setSaving(false);
          return;
        }
        const inRoster = await checkYouthPlayerExists(profileUrl);
        if (inRoster) {
          setError('This player is already in the youth roster.');
          setSaving(false);
          return;
        }
        const account = await getCurrentAccountForShortlist(user);
        const docRef = doc(db, SHORTLISTS_COLLECTIONS.youth, SHARED_SHORTLIST_DOC_ID);
        const snap = await getDoc(docRef);
        const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
        const exists = current.some((e) => (e.tmProfileUrl as string) === profileUrl);
        if (exists) {
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
          playerAge: ageGroup || null,
          playerNationality: nationality.trim() || null,
          clubJoinedName: currentClub.trim() || null,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
        };
        await setDoc(docRef, { entries: [...current, entry] }, { merge: true });
        await addDoc(collection(db, 'FeedEventsYouth'), {
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

      // Duplicate check
      if (ifaUrl.trim()) {
        const exists = await checkYouthPlayerExists(ifaUrl.trim());
        if (exists) {
          setError('This player already exists in the youth roster.');
          setSaving(false);
          return;
        }
      }

      const computedAgeGroup = ageGroup || (dateOfBirth ? computeAgeGroup(dateOfBirth) : '');

      const playerId = await addYouthPlayer({
        fullName: fullName.trim(),
        positions: positions.length > 0 ? positions : undefined,
        currentClub: currentClub.trim() ? { clubName: currentClub.trim() } : undefined,
        academy: academy.trim() || undefined,
        dateOfBirth: dateOfBirth.trim() || undefined,
        ageGroup: computedAgeGroup || undefined,
        nationality: nationality.trim() || undefined,
        profileImage: profileImage.trim() || undefined,
        ifaUrl: ifaUrl.trim() || undefined,
        ifaPlayerId: ifaPlayerId.trim() || undefined,
        notes: notes.trim() || undefined,
        playerPhoneNumber: playerPhone.trim() || undefined,
        playerEmail: playerEmail.trim() || undefined,
        parentContact: (parentName.trim() || parentPhone.trim() || parentRelationship.trim() || parentEmail.trim())
          ? {
              ...(parentName.trim() && { parentName: parentName.trim() }),
              ...(parentRelationship.trim() && { parentRelationship: parentRelationship.trim() }),
              ...(parentPhone.trim() && { parentPhoneNumber: parentPhone.trim() }),
              ...(parentEmail.trim() && { parentEmail: parentEmail.trim() }),
            }
          : undefined,
        agentInChargeId: user.uid,
        agentInChargeName: agentName,
      });

      // Remove from shortlist if came from there
      if (fromShortlist && preloadUrl) {
        const docRef = doc(db, SHORTLISTS_COLLECTIONS.youth, SHARED_SHORTLIST_DOC_ID);
        const snap = await getDoc(docRef);
        const entries = (snap.data()?.entries as Record<string, unknown>[]) || [];
        const filtered = entries
          .filter((e) => (e.tmProfileUrl as string) !== preloadUrl)
          .map((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v === undefined ? null : v])));
        await setDoc(docRef, { entries: filtered }, { merge: true });
        await addDoc(collection(db, 'FeedEventsYouth'), {
          type: 'SHORTLIST_REMOVED',
          playerName: fullName.trim(),
          playerImage: profileImage.trim() || null,
          playerTmProfile: preloadUrl,
          timestamp: Date.now(),
          agentName,
        });
      }

      await addDoc(collection(db, 'FeedEventsYouth'), {
        type: 'PLAYER_ADDED',
        playerName: fullName.trim(),
        playerImage: profileImage.trim() || null,
        playerYouthId: playerId,
        timestamp: Date.now(),
        agentName,
      });

      router.push(fromShortlist ? '/shortlist' : '/players');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      if (msg.toLowerCase().includes('permission') || msg.includes('PERMISSION_DENIED')) {
        setError(
          'Missing or insufficient permissions. Ensure Firestore rules are deployed and you are logged in.'
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
        <div className="animate-pulse youth-gradient-text font-display text-xl">
          {t('loading')}
        </div>
      </div>
    );
  }

  // Glassmorphism input classnames
  const glassInput =
    'w-full px-4 py-3.5 rounded-2xl youth-glass-input text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none transition';
  const glassInputSm =
    'w-full px-4 py-3 rounded-2xl youth-glass-input text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none transition text-sm';
  const glassLabel =
    'block text-xs font-medium text-[var(--youth-cyan)]/70 uppercase tracking-wider mb-2';

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen relative">
        {/* Loading overlay */}
        {loadingProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="youth-glass-card p-8 rounded-2xl flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-2 border-[var(--youth-cyan)] border-t-transparent rounded-full animate-spin" />
              <p className="text-mgsr-text font-medium">{t('youth_add_loading_profile')}</p>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Glassmorphism glow accent */}
          <div className="relative mb-10 overflow-hidden pointer-events-none">
            <div
              className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-15"
              style={{
                background: 'radial-gradient(circle, var(--youth-cyan) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute -top-10 -left-20 w-60 h-60 rounded-full opacity-10"
              style={{
                background: 'radial-gradient(circle, var(--youth-violet) 0%, transparent 70%)',
              }}
            />
          </div>

          <Link
            href={forShortlist || fromShortlist ? '/shortlist' : '/players'}
            className="inline-flex items-center gap-2 text-mgsr-muted hover:text-[var(--youth-cyan)] transition-colors mb-10 group"
          >
            <span className={`transition-transform duration-200 group-hover:-translate-x-1 ${isRtl ? 'rotate-180' : ''}`}>
              ←
            </span>
            <span className="text-sm font-medium">
              {forShortlist || fromShortlist ? t('youth_add_back_shortlist') : t('youth_add_back_players')}
            </span>
          </Link>

          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-mgsr-text tracking-tight mb-1">
            <span className="youth-gradient-text">
              {forShortlist ? t('youth_add_shortlist_title') : t('youth_add_title')}
            </span>
          </h1>
          <p className="text-mgsr-muted text-sm mb-6">
            {forShortlist
              ? t('youth_add_shortlist_subtitle')
              : t('youth_add_subtitle')}
          </p>

          {/* ── Search ── */}
          <div ref={searchRef} className="relative mb-8">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                placeholder={t('youth_add_search_placeholder')}
                className={`${glassInput} pl-10`}
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--youth-cyan)]/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Search results dropdown */}
            {searchFocused && (searchQuery.trim().length >= MIN_SEARCH_LEN || searchResults.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-2xl youth-glass-card shadow-xl z-50 overflow-hidden border border-[var(--youth-cyan)]/20">
                {loadingSearch ? (
                  <div className="px-4 py-6 text-center text-mgsr-muted text-sm">
                    <span className="inline-block w-4 h-4 border-2 border-[var(--youth-cyan)] border-t-transparent rounded-full animate-spin mr-2" />
                    {t('youth_add_searching')}
                  </div>
                ) : searchResults.length > 0 ? (
                  <ul className="max-h-64 overflow-auto py-2">
                    {searchResults.map((r, i) => (
                      <li key={`${r.fullName}-${r.source}-${i}`}>
                        <button
                          type="button"
                          onClick={() => handleSelectResult(r)}
                          className="w-full px-4 py-3 text-left hover:bg-[var(--youth-cyan)]/10 flex items-center gap-3 transition"
                        >
                          <div className="w-10 h-10 rounded-full bg-[var(--youth-cyan)]/10 border border-[var(--youth-cyan)]/20 shrink-0 flex items-center justify-center text-[var(--youth-cyan)] text-sm font-bold self-center">
                            {r.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <div className="font-medium text-mgsr-text truncate leading-tight">{r.fullName}</div>
                            {r.fullNameHe && (
                              <div className="text-xs text-[var(--youth-cyan)]/60 truncate leading-tight mt-0.5" dir="rtl">
                                {r.fullNameHe}
                              </div>
                            )}
                            <div className="text-xs text-mgsr-muted truncate leading-tight mt-0.5">
                              {[r.currentClub, r.dateOfBirth, r.nationality].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </div>
                          <span className="text-[10px] uppercase text-[var(--youth-cyan)]/40 shrink-0 font-mono self-center">IFA</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : searchQuery.trim().length >= MIN_SEARCH_LEN ? (
                  <div className="px-4 py-6 text-center text-mgsr-muted text-sm">
                    {t('youth_add_no_results')}
                  </div>
                ) : null}
                <div className="border-t border-[var(--youth-cyan)]/10 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => { clearForm(); setSearchFocused(false); }}
                    className="text-sm text-[var(--youth-cyan)] hover:underline font-medium"
                  >
                    {t('youth_add_manual')}
                  </button>
                </div>
              </div>
            )}

            <p className="mt-2 text-xs text-mgsr-muted">
              Or{' '}
              <button type="button" onClick={clearForm} className="text-[var(--youth-cyan)] hover:underline font-medium">
                {t('youth_add_or_manual')}
              </button>{' '}
              {t('youth_add_or_manual_hint')}
            </p>

            {/* IFA URL input */}
            <div className="mt-4 pt-4 border-t border-[var(--youth-cyan)]/10">
              <p className="text-xs text-mgsr-muted mb-2">
                {t('youth_add_paste_url')}
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.football.org.il/players/player/?player_id=..."
                  className={`flex-1 px-4 py-2.5 rounded-xl youth-glass-input text-mgsr-text placeholder-mgsr-muted/60 text-sm focus:outline-none`}
                />
                <button
                  type="button"
                  onClick={handleLoadByUrl}
                  disabled={loadingUrl || !urlInput.trim().includes('football.org.il')}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium bg-[var(--youth-cyan)]/15 text-[var(--youth-cyan)] hover:bg-[var(--youth-cyan)]/25 disabled:opacity-50 disabled:cursor-not-allowed transition border border-[var(--youth-cyan)]/20"
                >
                  {loadingUrl ? t('youth_add_loading') : t('youth_add_load')}
                </button>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-8 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-3 backdrop-blur-sm">
              <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              {error}
            </div>
          )}

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Names */}
            <div className="youth-glass-card rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold youth-gradient-text uppercase tracking-wider">{t('youth_add_identity')}</h3>
              <div>
                <label className={glassLabel}>{t('youth_add_name')}</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Lior Cohen / ליאור כהן"
                  required
                  className={glassInputSm}
                />
              </div>
            </div>

            {/* Positions */}
            <div className="youth-glass-card rounded-2xl p-6">
              <label className={glassLabel}>{t('youth_add_positions')}</label>
              <div className="flex flex-wrap gap-2">
                {POSITIONS.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => togglePosition(pos)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${
                      positions.includes(pos)
                        ? 'bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] border-[var(--youth-cyan)]/40 shadow-[0_0_12px_rgba(0,212,255,0.15)]'
                        : 'bg-white/5 border-white/10 text-mgsr-muted hover:text-mgsr-text hover:border-[var(--youth-cyan)]/30'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>

            {/* Club / DOB / Nationality */}
            <div className="youth-glass-card rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold youth-gradient-text uppercase tracking-wider">{t('youth_add_club_details')}</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className={glassLabel}>{t('youth_add_club')}</label>
                  <input
                    type="text"
                    value={currentClub}
                    onChange={(e) => setCurrentClub(e.target.value)}
                    placeholder="e.g. Maccabi Tel Aviv"
                    className={glassInputSm}
                  />
                </div>
                <div>
                  <label className={glassLabel}>{t('youth_add_dob')}</label>
                  <input
                    type="text"
                    value={dateOfBirth}
                    onChange={(e) => {
                      setDateOfBirth(e.target.value);
                      if (e.target.value) setAgeGroup(computeAgeGroup(e.target.value) ?? '');
                    }}
                    placeholder="DD/MM/YYYY or MM/YYYY"
                    className={glassInputSm}
                  />
                </div>
                <div>
                  <label className={glassLabel}>{t('youth_add_nationality')}</label>
                  <input
                    type="text"
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    placeholder="e.g. Israel"
                    className={glassInputSm}
                  />
                </div>
              </div>
            </div>

            {/* IFA Profile URL */}
            <div className="youth-glass-card rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold youth-gradient-text uppercase tracking-wider">{t('youth_add_ifa_profile')}</h3>
              <div>
                <label className={glassLabel}>{t('youth_add_ifa_url')}</label>
                <input
                  type="url"
                  value={ifaUrl}
                  onChange={(e) => setIfaUrl(e.target.value)}
                  placeholder="https://www.football.org.il/players/player/?player_id=..."
                  className={glassInputSm}
                />
                <p className="mt-1.5 text-xs text-mgsr-muted/60">
                  {t('youth_add_ifa_hint')}
                </p>
              </div>
            </div>

            {/* Profile Image */}
            <div className="youth-glass-card rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold youth-gradient-text uppercase tracking-wider">{t('youth_add_photo')}</h3>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={profileImage}
                      onChange={(e) => setProfileImage(e.target.value)}
                      placeholder="https://..."
                      className={`flex-1 px-4 py-3 rounded-2xl youth-glass-input text-mgsr-text placeholder-mgsr-muted/60 text-sm focus:outline-none`}
                    />
                    <button
                      type="button"
                      onClick={handleSearchImage}
                      disabled={searchingImage || !fullName.trim()}
                      className="px-4 py-3 rounded-2xl text-sm font-medium bg-[var(--youth-violet)]/15 text-[var(--youth-violet)] hover:bg-[var(--youth-violet)]/25 disabled:opacity-50 disabled:cursor-not-allowed transition border border-[var(--youth-violet)]/20 shrink-0"
                    >
                      {searchingImage ? t('youth_add_searching_photo') : `🔍 ${t('youth_add_find_photo')}`}
                    </button>
                  </div>
                </div>
                {profileImage && (
                  <div className="shrink-0">
                    <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-2">{t('youth_add_preview')}</p>
                    <div className="w-24 h-24 rounded-xl overflow-hidden border border-[var(--youth-cyan)]/20 bg-[var(--youth-cyan)]/5 flex items-center justify-center">
                      <img
                        src={profileImage}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://placehold.co/96/0A0F1C/00D4FF?text=?';
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── Contact Section ── */}
            {!forShortlist && (
              <div className="youth-glass-card rounded-2xl p-6 space-y-5">
                <h3 className="text-sm font-semibold youth-gradient-text uppercase tracking-wider">
                  {t('youth_add_contact')}
                </h3>

                {/* Player contact */}
                <div>
                  <p className="text-xs text-[var(--youth-cyan)]/50 uppercase tracking-wider mb-3 font-medium">{t('youth_add_player_section')}</p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-mgsr-muted mb-1.5">{t('youth_add_phone')}</label>
                      <input
                        type="tel"
                        value={playerPhone}
                        onChange={(e) => setPlayerPhone(e.target.value)}
                        placeholder="+972 50 123 4567"
                        className={glassInputSm}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-mgsr-muted mb-1.5">{t('youth_add_email')}</label>
                      <input
                        type="email"
                        value={playerEmail}
                        onChange={(e) => setPlayerEmail(e.target.value)}
                        placeholder="player@email.com"
                        className={glassInputSm}
                      />
                    </div>
                  </div>
                </div>

                {/* Parent / Guardian contact */}
                <div className="pt-4 border-t border-[var(--youth-cyan)]/10">
                  <p className="text-xs text-[var(--youth-violet)]/60 uppercase tracking-wider mb-3 font-medium flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[var(--youth-violet)]/10 flex items-center justify-center text-[10px]">👤</span>
                    {t('youth_add_parent')}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-mgsr-muted mb-1.5">{t('youth_add_parent_name')}</label>
                      <input
                        type="text"
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        placeholder="e.g. David Cohen"
                        className={glassInputSm}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-mgsr-muted mb-1.5">{t('youth_add_relationship')}</label>
                      <select
                        value={parentRelationship}
                        onChange={(e) => setParentRelationship(e.target.value)}
                        className={`${glassInputSm} appearance-none cursor-pointer`}
                      >
                        <option value="" className="bg-[#0A0F1C]">{t('youth_add_select')}</option>
                        <option value="Father" className="bg-[#0A0F1C]">{t('youth_add_relationship_father')}</option>
                        <option value="Mother" className="bg-[#0A0F1C]">{t('youth_add_relationship_mother')}</option>
                        <option value="Guardian" className="bg-[#0A0F1C]">{t('youth_add_relationship_guardian')}</option>
                        <option value="Agent" className="bg-[#0A0F1C]">{t('youth_add_relationship_agent')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-mgsr-muted mb-1.5">{t('youth_add_parent_phone')}</label>
                      <input
                        type="tel"
                        value={parentPhone}
                        onChange={(e) => setParentPhone(e.target.value)}
                        placeholder="+972 52 987 6543"
                        className={glassInputSm}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-mgsr-muted mb-1.5">{t('youth_add_parent_email')}</label>
                      <input
                        type="email"
                        value={parentEmail}
                        onChange={(e) => setParentEmail(e.target.value)}
                        placeholder="parent@email.com"
                        className={glassInputSm}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {!forShortlist && (
              <div className="youth-glass-card rounded-2xl p-6">
                <label className={glassLabel}>{t('youth_add_notes')}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Initial notes about the player..."
                  rows={3}
                  className={`${glassInput} resize-none`}
                />
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={saving || !fullName.trim()}
              className="w-full py-3.5 rounded-2xl font-semibold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,212,255,0.15)] hover:shadow-[0_0_40px_rgba(0,212,255,0.25)]"
              style={{
                background: 'linear-gradient(135deg, var(--youth-cyan), var(--youth-violet))',
              }}
            >
              {saving
                ? t('youth_add_saving')
                : forShortlist
                  ? t('youth_add_save_shortlist')
                  : t('youth_add_save_roster')}
            </button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
