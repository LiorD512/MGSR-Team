'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { doc, onSnapshot, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
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

export default function ShortlistPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const cached = user ? getScreenCache<ShortlistEntry[]>('shortlist', user.uid) : undefined;
  const [entries, setEntries] = useState<ShortlistEntry[]>(cached ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, 'Shortlists', user.uid);
    const unsub = onSnapshot(docRef, (snap) => {
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
  }, [user]);

  const sanitizeForFirestore = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = v === undefined ? null : v;
    }
    return out;
  };

  const removeFromShortlist = async (entry: ShortlistEntry) => {
    if (!user) return;
    setRemovingUrl(entry.tmProfileUrl);
    try {
      const docRef = doc(db, 'Shortlists', user.uid);
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
            {sorted.map((entry, i) => (
              <div
                key={entry.tmProfileUrl}
                className="group flex items-center gap-4 p-4 bg-mgsr-card border border-mgsr-border rounded-xl hover:border-mgsr-teal/30 transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${i * 40}ms` }}
              >
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
                      {entry.playerAge && `• ${entry.playerAge} ${t('players_age')}`}
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
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
