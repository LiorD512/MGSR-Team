'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { doc, onSnapshot, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist, useShortlistDocId, SHARED_SHORTLIST_DOC_ID } from '@/lib/accounts';
import { getTeammates, extractPlayerIdFromUrl } from '@/lib/api';
import { SHORTLISTS_COLLECTIONS, PLAYERS_COLLECTIONS, FEED_EVENTS_COLLECTIONS } from '@/lib/platformCollections';
import { subscribePlayersWomen, type WomanPlayer } from '@/lib/playersWomen';
import { subscribePlayersYouth, type YouthPlayer } from '@/lib/playersYouth';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';

interface ShortlistNote {
  text: string;
  createdBy?: string;
  createdByHebrewName?: string;
  createdById?: string;
  createdAt?: number;
}

interface ShortlistEntry {
  tmProfileUrl: string;
  addedAt?: number;
  playerImage?: string;
  playerName?: string;
  playerPosition?: string;
  playerAge?: string;
  playerNationality?: string;
  clubJoinedName?: string;
  transferDate?: string;
  marketValue?: string;
  addedByAgentId?: string;
  addedByAgentName?: string;
  addedByAgentHebrewName?: string;
  notes?: ShortlistNote[];
}

interface RosterPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string };
  age?: string;
  tmProfile?: string;
}

interface RosterTeammateMatch {
  player: RosterPlayer;
  matchesPlayedTogether: number;
}

function womanToRosterPlayer(w: WomanPlayer): RosterPlayer {
  return {
    id: w.id,
    fullName: w.fullName,
    profileImage: w.profileImage,
    positions: w.positions ?? [],
    marketValue: w.marketValue,
    currentClub: w.currentClub,
    age: w.age,
    tmProfile: w.fmInsideUrl ?? w.soccerDonnaUrl ?? undefined,
  };
}

function youthToRosterPlayer(y: YouthPlayer): RosterPlayer {
  return {
    id: y.id,
    fullName: y.fullName,
    profileImage: y.profileImage,
    positions: y.positions ?? [],
    marketValue: y.marketValue,
    currentClub: y.currentClub,
    age: y.age,
    tmProfile: y.ifaUrl ?? undefined,
  };
}

export default function ShortlistPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const { platform } = usePlatform();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shortlistDocId = useShortlistDocId(user ?? null);
  const shortlistsCollection = SHORTLISTS_COLLECTIONS[platform];
  const isWomen = platform === 'women';
  const isYouth = platform === 'youth';
  const shortlistCacheKey = user ? `shortlist_${platform}_${user.uid}` : undefined;
  const cached = shortlistCacheKey ? getScreenCache<ShortlistEntry[]>(shortlistCacheKey) : undefined;
  const [entries, setEntries] = useState<ShortlistEntry[]>(cached ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);
  const [highlightedUrl, setHighlightedUrl] = useState<string | null>(null);

  // ── Notes state ──
  const [noteModalEntry, setNoteModalEntry] = useState<ShortlistEntry | null>(null);
  const [noteModalMode, setNoteModalMode] = useState<'add' | 'edit'>('add');
  const [noteModalText, setNoteModalText] = useState('');
  const [noteModalEditIndex, setNoteModalEditIndex] = useState(-1);
  const [savingNote, setSavingNote] = useState(false);
  const [expandedNotesUrl, setExpandedNotesUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Handle ?highlight=url — scroll to and animate the matching shortlist entry
  const highlightParam = searchParams.get('highlight');
  useEffect(() => {
    if (!highlightParam || entries.length === 0) return;
    const decoded = decodeURIComponent(highlightParam);
    const sorted = [...entries].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    const idx = sorted.findIndex((e) => e.tmProfileUrl === decoded || e.tmProfileUrl === highlightParam);
    if (idx < 0) return;
    setHighlightedUrl(decoded);
    const el = document.getElementById(`shortlist-entry-${idx}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    // Clear highlight from URL and animation after a delay
    const t1 = setTimeout(() => {
      router.replace('/shortlist', { scroll: false });
    }, 500);
    const t2 = setTimeout(() => setHighlightedUrl(null), 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [highlightParam, entries.length, router]);

  useEffect(() => {
    if (!user || !shortlistDocId) return;
    const teamRef = doc(db, shortlistsCollection, SHARED_SHORTLIST_DOC_ID);

    const migrateFromLegacy = async () => {
      // Skip migration for women and youth — no legacy data to migrate
      if (platform === 'women' || platform === 'youth') return;
      try {
        const teamSnap = await getDoc(teamRef);
        const teamEntries = (teamSnap.data()?.entries as Record<string, unknown>[]) || [];
        if (teamEntries.length > 0) return;
        const allSnap = await getDocs(collection(db, shortlistsCollection));
        const allEntries: Record<string, unknown>[] = [];
        const seen = new Set<string>();
        for (const d of allSnap.docs) {
          if (d.id === SHARED_SHORTLIST_DOC_ID) continue;
          const list = (d.data()?.entries as Record<string, unknown>[]) || [];
          for (const e of list) {
            const url = e.tmProfileUrl as string;
            if (url && !seen.has(url)) {
              seen.add(url);
              allEntries.push(e);
            }
          }
        }
        if (allEntries.length > 0) {
          const sanitize = (x: Record<string, unknown>) =>
            Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v === undefined ? null : v]));
          await setDoc(teamRef, { entries: allEntries.map(sanitize) }, { merge: true });
        }
      } catch (err) {
        console.warn('[Shortlist] Migration skipped:', err);
      }
    };

    migrateFromLegacy();

    const unsub = onSnapshot(
      teamRef,
      (snap) => {
        const data = snap.data();
        const list = (data?.entries as Record<string, unknown>[]) || [];
        const mapped = list.map((e) => {
          const clubRaw = e.clubJoinedName ?? (e.currentClub && typeof e.currentClub === 'object' ? (e.currentClub as { clubName?: string }).clubName : null) ?? (e.currentClub as string);
          const nameVal = e.playerName ?? e.fullName;
          const playerName = typeof nameVal === 'string' ? nameVal : undefined;
          return {
            tmProfileUrl: (e.tmProfileUrl as string) ?? '',
            addedAt: e.addedAt as number,
            playerImage: (e.playerImage as string) ?? undefined,
            playerName,
            playerPosition: (e.playerPosition as string) ?? undefined,
            playerAge: (e.playerAge as string) ?? undefined,
            playerNationality: (e.playerNationality as string) ?? undefined,
            clubJoinedName: typeof clubRaw === 'string' ? clubRaw : undefined,
            transferDate: (e.transferDate as string) ?? undefined,
            marketValue: (e.marketValue as string) ?? undefined,
            addedByAgentId: (e.addedByAgentId as string) ?? undefined,
            addedByAgentName: (e.addedByAgentName as string) ?? undefined,
            addedByAgentHebrewName: (e.addedByAgentHebrewName as string) ?? undefined,
            notes: Array.isArray(e.notes)
              ? (e.notes as Record<string, unknown>[]).map((n) => ({
                  text: (n.text as string) ?? '',
                  createdBy: (n.createdBy as string) ?? undefined,
                  createdByHebrewName: (n.createdByHebrewName as string) ?? undefined,
                  createdById: (n.createdById as string) ?? undefined,
                  createdAt: (n.createdAt as number) ?? undefined,
                }))
              : [],
          };
        });
        setEntries(mapped);
        setLoadingList(false);
        if (shortlistCacheKey) setScreenCache(shortlistCacheKey, mapped);
      },
      (err) => {
        console.error('Shortlist snapshot error:', err);
        setLoadingList(false);
      }
    );
    return () => unsub();
  }, [user, shortlistDocId, shortlistsCollection, platform]);

  // Load roster players for teammates matching
  useEffect(() => {
    if (platform === 'youth') {
      const unsub = subscribePlayersYouth((list) => {
        setRosterPlayers(list.map(youthToRosterPlayer));
      });
      return unsub;
    }
    if (platform === 'women') {
      const unsub = subscribePlayersWomen((list) => {
        setRosterPlayers(list.map(womanToRosterPlayer));
      });
      return unsub;
    }
    const q = query(collection(db, PLAYERS_COLLECTIONS[platform]), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRosterPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer)));
    });
    return () => unsub();
  }, [platform]);

  const fetchTeammates = useCallback(async (playerUrl: string) => {
    setLoadingTeammatesUrl(playerUrl);
    try {
      const teammates = await getTeammates(playerUrl);
      const rosterIds = new Set(rosterPlayers.map((p) => extractPlayerIdFromUrl(p.tmProfile)).filter(Boolean));
      const matches: RosterTeammateMatch[] = teammates
        .filter((t) => rosterIds.has(extractPlayerIdFromUrl(t.tmProfileUrl) ?? ''))
        .map((t) => {
          const id = extractPlayerIdFromUrl(t.tmProfileUrl);
          const rosterPlayer = rosterPlayers.find((p) => extractPlayerIdFromUrl(p.tmProfile) === id);
          return rosterPlayer ? { player: rosterPlayer, matchesPlayedTogether: t.matchesPlayedTogether } : null;
        })
        .filter((m): m is RosterTeammateMatch => m != null)
        .sort((a, b) => b.matchesPlayedTogether - a.matchesPlayedTogether);
      setTeammatesCache((prev) => ({ ...prev, [playerUrl]: matches }));
    } catch {
      setTeammatesCache((prev) => ({ ...prev, [playerUrl]: [] }));
    } finally {
      setLoadingTeammatesUrl(null);
    }
  }, [rosterPlayers]);

  const toggleTeammates = useCallback((url: string) => {
    setExpandedTeammatesUrl((prev) => (prev === url ? null : url));
  }, []);

  const sanitizeForFirestore = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) {
        out[k] = null;
      } else if (Array.isArray(v)) {
        out[k] = v.map((item) =>
          typeof item === 'object' && item !== null
            ? sanitizeForFirestore(item as Record<string, unknown>)
            : item === undefined ? null : item
        );
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  // ── Notes CRUD ──
  const addNoteToEntry = useCallback(async (entry: ShortlistEntry, noteText: string) => {
    if (!user || !shortlistDocId) return;
    setSavingNote(true);
    try {
      const account = await getCurrentAccountForShortlist(user);
      const docRef = doc(db, shortlistsCollection, SHARED_SHORTLIST_DOC_ID);
      const snap = await getDoc(docRef);
      const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
      const idx = current.findIndex((e) => e.tmProfileUrl === entry.tmProfileUrl);
      if (idx < 0) return;
      const entryData = { ...current[idx] };
      const existingNotes = Array.isArray(entryData.notes) ? [...(entryData.notes as Record<string, unknown>[])] : [];
      existingNotes.push({
        text: noteText,
        createdBy: account.name ?? 'Unknown',
        createdByHebrewName: account.hebrewName ?? null,
        createdById: account.id,
        createdAt: Date.now(),
      });
      entryData.notes = existingNotes;
      current[idx] = entryData;
      await setDoc(docRef, { entries: current.map((e) => sanitizeForFirestore(e as Record<string, unknown>)) }, { merge: true });
    } finally {
      setSavingNote(false);
    }
  }, [user, shortlistDocId, shortlistsCollection]);

  const updateNoteInEntry = useCallback(async (entry: ShortlistEntry, noteIndex: number, newText: string) => {
    if (!user || !shortlistDocId) return;
    setSavingNote(true);
    try {
      const docRef = doc(db, shortlistsCollection, SHARED_SHORTLIST_DOC_ID);
      const snap = await getDoc(docRef);
      const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
      const idx = current.findIndex((e) => e.tmProfileUrl === entry.tmProfileUrl);
      if (idx < 0) return;
      const entryData = { ...current[idx] };
      const existingNotes = Array.isArray(entryData.notes) ? [...(entryData.notes as Record<string, unknown>[])] : [];
      if (noteIndex < 0 || noteIndex >= existingNotes.length) return;
      existingNotes[noteIndex] = { ...existingNotes[noteIndex], text: newText, updatedAt: Date.now() };
      entryData.notes = existingNotes;
      current[idx] = entryData;
      await setDoc(docRef, { entries: current.map((e) => sanitizeForFirestore(e as Record<string, unknown>)) }, { merge: true });
    } finally {
      setSavingNote(false);
    }
  }, [user, shortlistDocId, shortlistsCollection]);

  const deleteNoteFromEntry = useCallback(async (entry: ShortlistEntry, noteIndex: number) => {
    if (!user || !shortlistDocId) return;
    try {
      const docRef = doc(db, shortlistsCollection, SHARED_SHORTLIST_DOC_ID);
      const snap = await getDoc(docRef);
      const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
      const idx = current.findIndex((e) => e.tmProfileUrl === entry.tmProfileUrl);
      if (idx < 0) return;
      const entryData = { ...current[idx] };
      const existingNotes = Array.isArray(entryData.notes) ? [...(entryData.notes as Record<string, unknown>[])] : [];
      existingNotes.splice(noteIndex, 1);
      entryData.notes = existingNotes;
      current[idx] = entryData;
      await setDoc(docRef, { entries: current.map((e) => sanitizeForFirestore(e as Record<string, unknown>)) }, { merge: true });
    } catch (err) {
      console.error('Delete note error:', err);
    }
  }, [user, shortlistDocId, shortlistsCollection]);

  const handleSaveNote = useCallback(async () => {
    if (!noteModalEntry || !noteModalText.trim()) return;
    if (noteModalMode === 'edit' && noteModalEditIndex >= 0) {
      await updateNoteInEntry(noteModalEntry, noteModalEditIndex, noteModalText.trim());
    } else {
      await addNoteToEntry(noteModalEntry, noteModalText.trim());
    }
    setNoteModalEntry(null);
    setNoteModalText('');
    setNoteModalEditIndex(-1);
  }, [noteModalEntry, noteModalText, noteModalMode, noteModalEditIndex, addNoteToEntry, updateNoteInEntry]);

  const formatNoteDate = useCallback((timestamp?: number) => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days < 1) return t('shortlist_date_today');
    if (days === 1) return t('shortlist_date_yesterday');
    if (days < 7) return t('shortlist_notes_days_ago').replace('{n}', String(days));
    return new Date(timestamp).toLocaleDateString();
  }, [t]);

  const getNoteAuthor = useCallback((note: ShortlistNote) =>
    isRtl
      ? note.createdByHebrewName || note.createdBy || '—'
      : note.createdBy || note.createdByHebrewName || '—',
  [isRtl]);

  const removeFromShortlist = async (entry: ShortlistEntry) => {
    if (!user || !shortlistDocId) return;
    setRemovingUrl(entry.tmProfileUrl);
    try {
      const docRef = doc(db, shortlistsCollection, SHARED_SHORTLIST_DOC_ID);
      const snap = await getDoc(docRef);
      const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
      const filtered = current
        .filter((e) => e.tmProfileUrl !== entry.tmProfileUrl)
        .map((e) => sanitizeForFirestore(e));
      await setDoc(docRef, { entries: filtered }, { merge: true });
      const account = await getCurrentAccountForShortlist(user);
      const feedEvent: Record<string, unknown> = {
        type: 'SHORTLIST_REMOVED',
        playerName: entry.playerName ?? null,
        playerImage: entry.playerImage ?? null,
        playerTmProfile: entry.tmProfileUrl,
        timestamp: Date.now(),
        agentName: account.name ?? null,
      };
      await addDoc(collection(db, FEED_EVENTS_COLLECTIONS[platform]), feedEvent);
    } finally {
      setRemovingUrl(null);
    }
  };

  const sorted = [...entries].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  const formatAddedDate = (addedAt?: number) => {
    if (!addedAt) return '';
    const now = Date.now();
    const diff = now - addedAt;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(days / 7);
    if (days < 1) return t('shortlist_added_today');
    if (days === 1) return t('shortlist_added_yesterday');
    if (days < 7) return t('shortlist_added_days_ago').replace('{n}', String(days));
    if (weeks === 1) return t('shortlist_added_week_ago');
    if (weeks < 4) return t('shortlist_added_weeks_ago').replace('{n}', String(weeks));
    return t('shortlist_added_months_ago').replace('{n}', String(Math.floor(days / 30)));
  };

  const formatAddedDateShort = (addedAt?: number) => {
    if (!addedAt) return '';
    const now = Date.now();
    const diff = now - addedAt;
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(days / 7);
    if (days < 1) return t('shortlist_date_today');
    if (days === 1) return t('shortlist_date_yesterday');
    if (days < 7) return t('shortlist_date_days_ago').replace('{n}', String(days));
    if (weeks === 1) return t('shortlist_date_week_ago');
    if (weeks < 4) return t('shortlist_date_weeks_ago').replace('{n}', String(weeks));
    return t('shortlist_date_months_ago').replace('{n}', String(Math.floor(days / 30)));
  };

  const sanitizeMarketValue = (val: string | undefined) => {
    if (!val?.trim()) return '—';
    return val
      .replace(/&euro;/gi, '€')
      .replace(/&#8364;/g, '€')
      .replace(/euro&/gi, '€')
      .replace(/;&euro;?/gi, '€')
      .replace(/;euro&/gi, '€')
      .replace(/&euro/gi, '€')
      .trim();
  };

  const getAgentDisplayName = (entry: ShortlistEntry) =>
    isRtl
      ? entry.addedByAgentHebrewName || entry.addedByAgentName || '—'
      : entry.addedByAgentName || entry.addedByAgentHebrewName || '—';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className={`animate-pulse font-display ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {isWomen ? t('shortlist_title_women') : t('shortlist_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {entries.length} {isWomen ? t('players_women') : t('players')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {platform === 'men' && (
              <>
                <Link
                  href="/releases"
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text font-medium hover:border-mgsr-teal/50 hover:text-mgsr-teal transition"
                >
                  {t('shortlist_browse_releases')}
                </Link>
                <Link
                  href="/returnees"
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text font-medium hover:border-purple-500/50 hover:text-purple-400 transition"
                >
                  {t('shortlist_browse_returnees')}
                </Link>
              </>
            )}
            <Link
              href="/players/add?shortlist=1"
              className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-semibold transition-all hover:scale-[1.02] ${
                isYouth
                  ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.2)] hover:opacity-90'
                  : isWomen
                    ? 'bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)] hover:opacity-90'
                    : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'
              }`}
            >
              <span>+</span>
              {isYouth ? t('shortlist_add_youth_player') : t(isWomen ? 'shortlist_add_from_soccerdonna' : 'shortlist_add_from_tm')}
            </Link>
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <div className={`flex items-center gap-3 ${isYouth ? 'text-[var(--youth-cyan)]/70' : isWomen ? 'text-[var(--women-rose)]/70' : 'text-mgsr-muted'}`}>
              <div className={`w-3 h-3 rounded-full animate-pulse ${isYouth ? 'bg-[var(--youth-cyan)]/50' : isWomen ? 'bg-[var(--women-rose)]/50' : 'bg-mgsr-teal/50'}`} />
              {isWomen ? t('shortlist_loading_women') : t('shortlist_loading')}
            </div>
          </div>
        ) : sorted.length === 0 ? (
          <div className={`relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center ${isYouth ? 'shadow-[0_0_30px_rgba(0,212,255,0.06)]' : isWomen ? 'shadow-[0_0_30px_rgba(232,160,191,0.06)]' : ''}`}>
            <div className={`absolute inset-0 ${isYouth ? 'bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.08)_0%,transparent_70%)]' : isWomen ? 'bg-[radial-gradient(ellipse_at_center,rgba(232,160,191,0.08)_0%,transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]'}`} />
            <p className="text-mgsr-muted text-lg mb-6 relative">{isWomen ? t('shortlist_empty_women') : t('shortlist_empty')}</p>
            <p className="text-mgsr-muted/80 text-sm mb-6 relative">{isYouth ? t('shortlist_empty_hint_youth') : isWomen ? t('shortlist_empty_hint_women') : t('shortlist_empty_hint')}</p>
            <div className="flex flex-wrap justify-center gap-3 relative">
              {platform === 'men' && (
                <>
                  <Link
                    href="/releases"
                    className="inline-block px-5 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition"
                  >
                    {t('shortlist_browse_releases')}
                  </Link>
                  <Link
                    href="/returnees"
                    className="inline-block px-5 py-2.5 rounded-xl bg-purple-500 text-white font-semibold hover:bg-purple-600 transition"
                  >
                    {t('shortlist_browse_returnees')}
                  </Link>
                  <span className="text-mgsr-muted self-center">{t('common_or')}</span>
                </>
              )}
              <Link
                href="/players/add?shortlist=1"
                className={`inline-block px-5 py-2.5 rounded-xl font-semibold transition ${
                  isYouth
                    ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white hover:opacity-90'
                    : isWomen
                      ? 'bg-[var(--women-gradient)] text-white hover:opacity-90'
                      : 'border border-mgsr-teal text-mgsr-teal hover:bg-mgsr-teal/10'
                }`}
              >
                {isYouth ? t('shortlist_add_youth_player') : t(isWomen ? 'shortlist_add_from_soccerdonna' : 'shortlist_add_from_tm')}
              </Link>
            </div>
          </div>
        ) : (
          <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${isWomen ? 'gap-5' : ''}`}>
            {sorted.map((entry, i) => {
              const playerUrl = entry.tmProfileUrl;
              const rosterTeammates = playerUrl ? teammatesCache[playerUrl] : undefined;
              const isLoadingTeammates = loadingTeammatesUrl === playerUrl;
              const isExpanded = expandedTeammatesUrl === playerUrl;
              const clubDisplay = (() => {
                const c = entry.clubJoinedName?.trim();
                if (!c) return '—';
                if (c.toLowerCase() === 'vereinslos' || c === 'Without Club') return t('without_club');
                return c;
              })();
              const ageDisplay = entry.playerAge
                ? t(isWomen ? 'players_age_display_women' : 'players_age_display').replace('{age}', entry.playerAge)
                : null;
              const infoParts = [entry.playerPosition, clubDisplay, entry.playerNationality, ageDisplay].filter(Boolean);
              const isSoccerDonnaUrl = playerUrl?.includes('soccerdonna');
              const isFmInsideUrl = playerUrl?.includes('fminside');

              const isHighlighted = highlightedUrl === entry.tmProfileUrl;
              const isNotesExpanded = expandedNotesUrl === entry.tmProfileUrl;
              const notes = entry.notes ?? [];
              return (
              <div
                key={entry.tmProfileUrl}
                id={`shortlist-entry-${i}`}
                className={`group overflow-hidden transition-all duration-300 animate-fade-in ${
                  isHighlighted ? 'shortlist-entry-highlight' : ''
                } ${
                  isYouth
                    ? 'rounded-2xl border border-[var(--youth-cyan)]/25 bg-mgsr-card shadow-[0_0_30px_rgba(0,212,255,0.06)] hover:border-[var(--youth-cyan)]/40 hover:shadow-[0_0_30px_rgba(0,212,255,0.12)]'
                    : isWomen
                      ? 'rounded-2xl border border-[var(--women-rose)]/25 bg-mgsr-card shadow-[0_0_30px_rgba(232,160,191,0.06)] hover:border-[var(--women-rose)]/40 hover:shadow-[0_0_30px_rgba(232,160,191,0.12)]'
                      : 'rounded-xl border border-mgsr-border bg-mgsr-card hover:border-mgsr-teal/30'
                }`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {isYouth && (
                  <div className="h-1 bg-gradient-to-r from-[var(--youth-cyan)] via-[var(--youth-violet)] to-[var(--youth-cyan)]/60" />
                )}
                {isWomen && (
                  <div className="h-1 bg-gradient-to-r from-[var(--women-rose)] via-[var(--women-blush)] to-[var(--women-rose)]/60" />
                )}
                {isYouth ? (
                  /* Youth: glassmorphism card — cyan/violet accent */
                  <div className="p-4 space-y-4">
                    <Link
                      href={`/players/add?url=${encodeURIComponent(entry.tmProfileUrl)}&from=shortlist`}
                      className="block group/link"
                    >
                      <div className="flex gap-4">
                        <img
                          src={entry.playerImage || 'https://placehold.co/64x64/1A2736/00D4FF?text=?'}
                          alt=""
                          className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-[var(--youth-cyan)]/20 group-hover/link:ring-[var(--youth-cyan)]/50 transition shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/1A2736/00D4FF?text=?';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-mgsr-text truncate group-hover/link:text-[var(--youth-cyan)] transition">
                            {entry.playerName || t('shortlist_unknown_player')}
                          </h3>
                          <p className="text-sm text-mgsr-muted mt-0.5 line-clamp-2">
                            {infoParts.length > 0 ? infoParts.join(' • ') : t('shortlist_no_info')}
                          </p>
                          <p className="text-xs text-mgsr-muted/80 mt-2">
                            {entry.addedAt
                              ? t('shortlist_added_by_date')
                                .replace('{agent}', getAgentDisplayName(entry))
                                .replace('{date}', formatAddedDateShort(entry.addedAt))
                              : `${t('shortlist_added_by')} ${getAgentDisplayName(entry)}`}
                          </p>
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--youth-cyan)]/10">
                      <span />
                      <button
                        onClick={() => removeFromShortlist(entry)}
                        disabled={removingUrl === entry.tmProfileUrl}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-mgsr-red hover:bg-mgsr-red/15 disabled:opacity-50 transition"
                      >
                        {removingUrl === entry.tmProfileUrl ? '...' : t('shortlist_remove')}
                      </button>
                    </div>
                  </div>
                ) : isWomen ? (
                  /* Women: editorial card — clear hierarchy, no cramping */
                  <div className="p-4 space-y-4">
                    <Link
                      href={`/players/add?url=${encodeURIComponent(entry.tmProfileUrl)}&from=shortlist`}
                      className="block group/link"
                    >
                      <div className="flex gap-4">
                        <img
                          src={entry.playerImage || 'https://placehold.co/64x64/1A2736/E8A0BF?text=?'}
                          alt=""
                          className="w-16 h-16 rounded-2xl object-cover bg-mgsr-dark ring-2 ring-[var(--women-rose)]/20 group-hover/link:ring-[var(--women-rose)]/50 transition shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/1A2736/E8A0BF?text=?';
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold text-mgsr-text truncate group-hover/link:text-[var(--women-rose)] transition">
                            {entry.playerName || t('shortlist_unknown_player')}
                          </h3>
                          <p className="text-sm text-mgsr-muted mt-0.5 line-clamp-2">
                            {infoParts.length > 0 ? infoParts.join(' • ') : t('shortlist_no_info')}
                          </p>
                          <p className="text-xs text-mgsr-muted/80 mt-2">
                            {entry.addedAt
                              ? t('shortlist_added_by_date')
                                .replace('{agent}', getAgentDisplayName(entry))
                                .replace('{date}', formatAddedDateShort(entry.addedAt))
                              : `${t('shortlist_added_by')} ${getAgentDisplayName(entry)}`}
                          </p>
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--women-rose)]/10">
                      {isSoccerDonnaUrl || isFmInsideUrl ? (
                        <a
                          href={playerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl bg-[var(--women-rose)]/15 text-[var(--women-rose)] text-sm font-medium hover:bg-[var(--women-rose)]/25 transition"
                        >
                          {isSoccerDonnaUrl ? t('similar_players_view_soccerdonna') : t('similar_players_view_fminside')}
                        </a>
                      ) : (
                        <span />
                      )}
                      <button
                        onClick={() => removeFromShortlist(entry)}
                        disabled={removingUrl === entry.tmProfileUrl}
                        className="px-4 py-2 rounded-xl text-sm font-medium text-mgsr-red hover:bg-mgsr-red/15 disabled:opacity-50 transition"
                      >
                        {removingUrl === entry.tmProfileUrl ? '...' : t('shortlist_remove')}
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="p-4">
                <div className="flex items-start gap-4">
                <Link
                  href={`/players/add?url=${encodeURIComponent(entry.tmProfileUrl)}&from=shortlist`}
                  className="flex items-start gap-4 flex-1 min-w-0"
                >
                  <img
                    src={entry.playerImage || 'https://via.placeholder.com/56'}
                    alt=""
                    className={`w-14 h-14 rounded-full object-cover bg-mgsr-dark ring-2 ring-mgsr-border transition shrink-0 group-hover:ring-mgsr-teal/40`}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/56';
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate group-hover:underline text-mgsr-teal">
                      {entry.playerName || 'Unknown'}
                    </p>
                    <p className="text-sm text-mgsr-muted truncate mt-0.5">
                      {infoParts.join(' • ')}
                    </p>
                    <p className="text-xs text-mgsr-muted/80 mt-1.5">
                      {entry.addedAt
                        ? t('shortlist_added_by_date')
                          .replace('{agent}', getAgentDisplayName(entry))
                          .replace('{date}', formatAddedDateShort(entry.addedAt))
                        : `${t('shortlist_added_by')} ${getAgentDisplayName(entry)}`}
                    </p>
                  </div>
                  <span className="font-semibold shrink-0 text-mgsr-teal">
                    {sanitizeMarketValue(entry.marketValue)}
                  </span>
                </Link>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      removeFromShortlist(entry);
                    }}
                    disabled={removingUrl === entry.tmProfileUrl}
                    className="px-3 py-1.5 rounded-lg text-sm text-mgsr-red hover:bg-mgsr-red/20 disabled:opacity-50 transition whitespace-nowrap"
                  >
                    {removingUrl === entry.tmProfileUrl ? '...' : t('shortlist_remove')}
                  </button>
                </div>
                </div>
                </div>
                )}

                {/* ── Notes Section — all platforms ── */}
                {(() => {
                  const accentText = isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-orange-400';
                  const accentBorder = isYouth ? 'border-[var(--youth-cyan)]/20' : isWomen ? 'border-[var(--women-rose)]/20' : 'border-orange-400/20';
                  return (
                    <div className="px-4 pb-3">
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedNotesUrl(isNotesExpanded ? null : entry.tmProfileUrl); }}
                        className="w-full flex items-center gap-2 py-2 px-3 rounded-xl bg-mgsr-dark/40 border border-mgsr-border/60 hover:border-mgsr-border transition-all text-left rtl:text-right"
                      >
                        <svg className={`w-4 h-4 shrink-0 ${accentText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="text-sm text-mgsr-text flex-1">
                          {notes.length === 0
                            ? t('shortlist_notes_tap_to_add')
                            : t('shortlist_notes_count').replace('{n}', String(notes.length))}
                        </span>
                        {notes.length > 0 && (
                          <svg
                            className={`w-4 h-4 text-mgsr-muted shrink-0 transition-transform duration-200 ${isNotesExpanded ? 'rotate-180' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        )}
                      </button>

                      {(isNotesExpanded || notes.length === 0) && (
                        <div className="mt-2 space-y-2">
                          {notes.map((note, ni) => (
                            <div
                              key={ni}
                              className={`p-3 rounded-xl bg-mgsr-dark/50 border ${accentBorder}`}
                            >
                              <p className="text-sm text-mgsr-text whitespace-pre-wrap">{note.text}</p>
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-mgsr-muted">
                                  {getNoteAuthor(note)} · {formatNoteDate(note.createdAt)}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setNoteModalEntry(entry); setNoteModalMode('edit'); setNoteModalText(note.text); setNoteModalEditIndex(ni); }}
                                    className="text-xs text-mgsr-muted hover:text-mgsr-text transition"
                                  >
                                    {t('shortlist_notes_edit')}
                                  </button>
                                  <button
                                    onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); deleteNoteFromEntry(entry, ni); }}
                                    className="text-xs text-mgsr-red/70 hover:text-mgsr-red transition"
                                  >
                                    {t('shortlist_notes_delete')}
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); setNoteModalEntry(entry); setNoteModalMode('add'); setNoteModalText(''); setNoteModalEditIndex(-1); }}
                            className={`w-full py-2.5 rounded-xl text-sm font-medium ${accentText} ${isYouth ? 'bg-[var(--youth-cyan)]/10' : isWomen ? 'bg-[var(--women-rose)]/10' : 'bg-orange-400/10'} transition hover:opacity-80`}
                          >
                            {t('shortlist_notes_add')}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Roster teammates section — Transfermarkt only, men platform only */}
                {platform === 'men' && (
                <div className="px-4 pb-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (!playerUrl) return;
                      toggleTeammates(playerUrl);
                      if (!(playerUrl in teammatesCache) && !loadingTeammatesUrl) {
                        fetchTeammates(playerUrl);
                      }
                    }}
                    className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border transition-all text-left rtl:text-right hover:border-mgsr-teal/30"
                  >
                    <svg className="w-4 h-4 shrink-0 text-mgsr-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span className="text-sm text-mgsr-text flex-1">
                      {isLoadingTeammates
                        ? t('releases_roster_teammates_loading')
                        : rosterTeammates != null
                          ? t('releases_roster_teammates').replace('{count}', String(rosterTeammates.length))
                          : t('releases_roster_teammates_tap')}
                    </span>
                    <svg
                      className={`w-4 h-4 text-mgsr-muted shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="mt-2 space-y-2">
                      {isLoadingTeammates ? (
                        <div className="py-6 flex justify-center">
                          <div className={`w-5 h-5 border-2 rounded-full animate-spin ${isWomen ? 'border-[var(--women-rose)]/40 border-t-[var(--women-rose)]' : 'border-mgsr-teal/40 border-t-mgsr-teal'}`} />
                        </div>
                      ) : rosterTeammates?.length === 0 ? (
                        <p className="text-xs text-mgsr-muted py-3 px-3 rounded-lg bg-mgsr-dark/40 border border-mgsr-border/60">
                          {t('releases_no_roster_teammates')}
                        </p>
                      ) : (
                        rosterTeammates?.map((match) => (
                          <Link
                            key={match.player.id}
                            href={`/players/${match.player.id}?from=/shortlist`}
                            className="flex items-center gap-3 p-2.5 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/80 transition-all hover:border-mgsr-teal/40 hover:bg-mgsr-dark/70"
                          >
                            <img
                              src={match.player.profileImage || 'https://via.placeholder.com/40'}
                              alt=""
                              className="w-9 h-9 rounded-full object-cover bg-mgsr-card ring-1 ring-mgsr-border"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-mgsr-text truncate">
                                {match.player.fullName || 'Unknown'}
                              </p>
                              <p className="text-xs text-mgsr-muted truncate">
                                {match.player.positions?.filter(Boolean).join(', ') || '—'} • {(match.player.age ? t('players_age_display').replace('{age}', match.player.age) : '—')} • {match.player.marketValue || '—'}
                              </p>
                            </div>
                            <span className="text-xs font-medium shrink-0 px-2 py-0.5 rounded-md text-mgsr-teal bg-mgsr-teal/15">
                              {t('releases_games_together').replace('{n}', String(match.matchesPlayedTogether))}
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  )}
                </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Note Add/Edit Modal ── */}
      {noteModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { setNoteModalEntry(null); setNoteModalText(''); setNoteModalEditIndex(-1); }}>
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
              isYouth
                ? 'bg-mgsr-card border-[var(--youth-cyan)]/30'
                : isWomen
                  ? 'bg-mgsr-card border-[var(--women-rose)]/30'
                  : 'bg-mgsr-card border-mgsr-border'
            }`}
          >
            {/* Title */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-mgsr-text">
                {noteModalMode === 'edit' ? t('shortlist_notes_edit_title') : t('shortlist_notes_add_title')}
              </h3>
              <button onClick={() => { setNoteModalEntry(null); setNoteModalText(''); setNoteModalEditIndex(-1); }} className="text-mgsr-muted hover:text-mgsr-text transition">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Player context */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/60">
              <img
                src={noteModalEntry.playerImage || 'https://via.placeholder.com/40'}
                alt=""
                className="w-10 h-10 rounded-full object-cover bg-mgsr-dark"
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-mgsr-text truncate">
                  {noteModalEntry.playerName || t('shortlist_unknown_player')}
                </p>
                <p className="text-xs text-mgsr-muted truncate">
                  {[noteModalEntry.playerPosition, noteModalEntry.clubJoinedName].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>

            {/* Text input */}
            <textarea
              value={noteModalText}
              onChange={(e) => setNoteModalText(e.target.value)}
              placeholder={t('shortlist_notes_placeholder')}
              rows={4}
              autoFocus
              className={`w-full rounded-xl border p-3 text-sm text-mgsr-text bg-mgsr-dark/60 placeholder:text-mgsr-muted/60 resize-none focus:outline-none transition ${
                isYouth
                  ? 'border-[var(--youth-cyan)]/30 focus:border-[var(--youth-cyan)]/60'
                  : isWomen
                    ? 'border-[var(--women-rose)]/30 focus:border-[var(--women-rose)]/60'
                    : 'border-mgsr-border focus:border-orange-400/60'
              }`}
              dir="auto"
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setNoteModalEntry(null); setNoteModalText(''); setNoteModalEditIndex(-1); }}
                className="px-4 py-2 rounded-xl text-sm font-medium text-mgsr-muted border border-mgsr-border hover:text-mgsr-text transition"
              >
                {t('common_cancel')}
              </button>
              <button
                onClick={handleSaveNote}
                disabled={!noteModalText.trim() || savingNote}
                className={`px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition ${
                  isYouth
                    ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)]'
                    : isWomen
                      ? 'bg-[var(--women-rose)]'
                      : 'bg-orange-500 hover:bg-orange-600'
                }`}
              >
                {savingNote ? '...' : t('shortlist_notes_save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
