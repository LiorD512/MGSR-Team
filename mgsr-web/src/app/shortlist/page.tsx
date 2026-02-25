'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { doc, onSnapshot, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist, useShortlistDocId, SHARED_SHORTLIST_DOC_ID } from '@/lib/accounts';
import { getTeammates, extractPlayerIdFromUrl } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';

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

export default function ShortlistPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const shortlistDocId = useShortlistDocId(user ?? null);
  const cached = user ? getScreenCache<ShortlistEntry[]>('shortlist', user.uid) : undefined;
  const [entries, setEntries] = useState<ShortlistEntry[]>(cached ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [rosterPlayers, setRosterPlayers] = useState<RosterPlayer[]>([]);
  const [teammatesCache, setTeammatesCache] = useState<Record<string, RosterTeammateMatch[]>>({});
  const [loadingTeammatesUrl, setLoadingTeammatesUrl] = useState<string | null>(null);
  const [expandedTeammatesUrl, setExpandedTeammatesUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user || !shortlistDocId) return;
    const teamRef = doc(db, 'Shortlists', SHARED_SHORTLIST_DOC_ID);

    const migrateFromLegacy = async () => {
      const teamSnap = await getDoc(teamRef);
      const teamEntries = (teamSnap.data()?.entries as Record<string, unknown>[]) || [];
      if (teamEntries.length > 0) return;
      const allSnap = await getDocs(collection(db, 'Shortlists'));
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
    };

    migrateFromLegacy();

    const unsub = onSnapshot(teamRef, (snap) => {
      const data = snap.data();
      const list = (data?.entries as Record<string, unknown>[]) || [];
      const mapped = list.map((e) => ({
        tmProfileUrl: e.tmProfileUrl as string,
        addedAt: e.addedAt as number,
        playerImage: e.playerImage as string,
        playerName: e.playerName as string,
        playerPosition: e.playerPosition as string,
        playerAge: e.playerAge as string,
        playerNationality: e.playerNationality as string,
        clubJoinedName: e.clubJoinedName as string,
        transferDate: e.transferDate as string,
        marketValue: e.marketValue as string,
        addedByAgentId: e.addedByAgentId as string,
        addedByAgentName: e.addedByAgentName as string,
        addedByAgentHebrewName: e.addedByAgentHebrewName as string,
      }));
      setEntries(mapped);
      setLoadingList(false);
      setScreenCache('shortlist', mapped, user.uid);
    });
    return () => unsub();
  }, [user, shortlistDocId]);

  // Load roster players for teammates matching
  useEffect(() => {
    const q = query(collection(db, 'Players'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRosterPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer)));
    });
    return () => unsub();
  }, []);

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
      out[k] = v === undefined ? null : v;
    }
    return out;
  };

  const removeFromShortlist = async (entry: ShortlistEntry) => {
    if (!user || !shortlistDocId) return;
    setRemovingUrl(entry.tmProfileUrl);
    try {
      const docRef = doc(db, 'Shortlists', SHARED_SHORTLIST_DOC_ID);
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
      await addDoc(collection(db, 'FeedEvents'), feedEvent);
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

  const getAgentDisplayName = (entry: ShortlistEntry) =>
    isRtl
      ? entry.addedByAgentHebrewName || entry.addedByAgentName || '—'
      : entry.addedByAgentName || entry.addedByAgentHebrewName || '—';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
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
              {t('shortlist_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {entries.length} {t('players')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
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
            <Link
              href="/players/add?shortlist=1"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition-all hover:scale-[1.02]"
            >
              <span>+</span>
              {t('shortlist_add_from_tm')}
            </Link>
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-mgsr-muted">{t('shortlist_loading')}</div>
          </div>
        ) : sorted.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg mb-6 relative">{t('shortlist_empty')}</p>
            <p className="text-mgsr-muted/80 text-sm mb-6 relative">{t('shortlist_empty_hint')}</p>
            <div className="flex flex-wrap justify-center gap-3 relative">
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
              <Link
                href="/players/add?shortlist=1"
                className="inline-block px-5 py-2.5 rounded-xl border border-mgsr-teal text-mgsr-teal font-semibold hover:bg-mgsr-teal/10 transition"
              >
                {t('shortlist_add_from_tm')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((entry, i) => {
              const playerUrl = entry.tmProfileUrl;
              const rosterTeammates = playerUrl ? teammatesCache[playerUrl] : undefined;
              const isLoadingTeammates = loadingTeammatesUrl === playerUrl;
              const isExpanded = expandedTeammatesUrl === playerUrl;

              return (
              <div
                key={entry.tmProfileUrl}
                className="group bg-mgsr-card border border-mgsr-border rounded-xl hover:border-mgsr-teal/30 transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="flex items-center gap-4 p-4">
                <Link
                  href={`/players/add?url=${encodeURIComponent(entry.tmProfileUrl)}&from=shortlist`}
                  className="flex items-center gap-4 flex-1 min-w-0"
                >
                  <img
                    src={entry.playerImage || 'https://via.placeholder.com/56'}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover bg-mgsr-dark ring-2 ring-mgsr-border group-hover:ring-mgsr-teal/40 transition shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-mgsr-teal truncate group-hover:underline">
                      {entry.playerName || 'Unknown'}
                    </p>
                    <p className="text-sm text-mgsr-muted truncate">
                      {entry.playerPosition} • {entry.clubJoinedName || '—'}{' '}
                      {entry.playerAge && `• ${t('players_age_display').replace('{age}', entry.playerAge)}`}
                    </p>
                    <p className="text-xs text-mgsr-muted/80 mt-1">
                      {t('shortlist_added_by')} {getAgentDisplayName(entry)}
                    </p>
                    {entry.addedAt && (
                      <p className="text-xs text-mgsr-muted/70 mt-0.5">
                        {formatAddedDate(entry.addedAt)}
                      </p>
                    )}
                  </div>
                  <span className="font-semibold text-mgsr-teal shrink-0">{entry.marketValue || '—'}</span>
                </Link>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    removeFromShortlist(entry);
                  }}
                  disabled={removingUrl === entry.tmProfileUrl}
                  className="px-3 py-1.5 rounded-lg text-sm text-mgsr-red hover:bg-mgsr-red/20 disabled:opacity-50 transition shrink-0"
                >
                  {removingUrl === entry.tmProfileUrl ? '...' : t('shortlist_remove')}
                </button>
                </div>

                {/* Roster teammates section */}
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
                    className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-mgsr-dark/60 border border-mgsr-border hover:border-mgsr-teal/30 transition-all text-left rtl:text-right"
                  >
                    <svg className="w-4 h-4 text-mgsr-teal shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                          <div className="w-5 h-5 border-2 border-mgsr-teal/40 border-t-mgsr-teal rounded-full animate-spin" />
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
                            className="flex items-center gap-3 p-2.5 rounded-xl bg-mgsr-dark/50 border border-mgsr-border/80 hover:border-mgsr-teal/40 hover:bg-mgsr-dark/70 transition-all"
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
                            <span className="text-xs font-medium text-mgsr-teal shrink-0 px-2 py-0.5 rounded-md bg-mgsr-teal/15">
                              {t('releases_games_together').replace('{n}', String(match.matchesPlayedTogether))}
                            </span>
                          </Link>
                        ))
                      )}
                    </div>
                  )}
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
