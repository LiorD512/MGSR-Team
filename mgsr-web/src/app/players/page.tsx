'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';

interface Player {
  id: string;
  fullName?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string };
  age?: string;
  tmProfile?: string;
  createdAt?: number;
}

interface PlayersCache {
  players: Player[];
  search: string;
}

export default function PlayersPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const cached = getScreenCache<PlayersCache>('players');
  const [players, setPlayers] = useState<Player[]>(cached?.players ?? []);
  const [playersLoading, setPlayersLoading] = useState(cached === undefined);
  const [search, setSearch] = useState(cached?.search ?? '');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const q = query(
      collection(db, 'Players'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Player));
      setPlayers(list);
      setPlayersLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setScreenCache<PlayersCache>('players', { players, search });
  }, [players, search]);

  const filtered = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.toLowerCase().trim();
    return players.filter(
      (p) =>
        p.fullName?.toLowerCase().includes(q) ||
        p.positions?.some((pos) => pos?.toLowerCase().includes(q)) ||
        p.currentClub?.clubName?.toLowerCase().includes(q)
    );
  }, [players, search]);

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
              {t('players_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {players.length} {t('players')}
            </p>
          </div>
          <Link
            href="/players/add"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>+</span>
            {t('players_add')}
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className="w-full max-w-md px-4 py-3 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60 focus:ring-1 focus:ring-mgsr-teal/30 transition"
          />
        </div>

        {playersLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-mgsr-muted">{t('players_loading')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg mb-4 relative">
              {search.trim() ? t('search_no_results') : t('players_empty')}
            </p>
            {!search.trim() && (
              <Link
                href="/players/add"
                className="inline-block px-6 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition relative"
              >
                {t('players_empty_hint')}
              </Link>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p, i) => (
              <Link
                key={p.id}
                href={`/players/${p.id}?from=/players`}
                className="group flex items-center gap-4 p-4 bg-mgsr-card border border-mgsr-border rounded-xl hover:border-mgsr-teal/40 hover:bg-mgsr-card/80 transition-all duration-300 animate-fade-in"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="relative shrink-0">
                  <img
                    src={p.profileImage || '/placeholder-player.png'}
                    alt=""
                    className="w-14 h-14 rounded-full object-cover bg-mgsr-dark ring-2 ring-mgsr-border group-hover:ring-mgsr-teal/40 transition"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://via.placeholder.com/56?text=?';
                    }}
                  />
                  {p.currentClub?.clubLogo && (
                    <img
                      src={p.currentClub.clubLogo}
                      alt=""
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full object-cover border border-mgsr-dark"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-mgsr-text truncate group-hover:text-mgsr-teal transition">
                    {p.fullName || 'Unknown'}
                  </p>
                  <p className="text-sm text-mgsr-muted truncate">
                    {p.positions?.filter(Boolean).join(', ') || '—'} • {p.currentClub?.clubName || t('no_club')}{' '}
                    {p.age && `• ${p.age} ${t('players_age')}`}
                  </p>
                </div>
                <div className={`text-right shrink-0 ${isRtl ? 'text-left' : ''}`}>
                  <p className="font-semibold text-mgsr-teal">{p.marketValue || '—'}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
