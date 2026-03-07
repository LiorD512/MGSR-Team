'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import {
  getRumours,
  getLeagueNews,
  getGoogleNews,
  extractPlayerIdFromUrl,
  getPlayerDetails,
  type RumourItem,
  type LeagueNewsItem,
  type GoogleNewsItem,
  type NewsFeedItem,
} from '@/lib/api';
import { collection, onSnapshot, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { SHORTLISTS_COLLECTIONS, PLAYERS_COLLECTIONS, FEED_EVENTS_COLLECTIONS, CONTACTS_COLLECTIONS } from '@/lib/platformCollections';
import AppLayout from '@/components/AppLayout';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';

/* ── Position translation map ── */
const POSITION_HE: Record<string, string> = {
  GK: 'שוער',
  LB: 'מגן שמאלי',
  CB: 'בלם',
  RB: 'מגן ימני',
  DM: 'קשר הגנתי',
  CM: 'קשר מרכזי',
  AM: 'קשר התקפי',
  RW: 'כנף ימין',
  LW: 'כנף שמאל',
  CF: 'חלוץ',
  SS: 'חלוץ שני',
  LM: 'קשר שמאלי',
  RM: 'קשר ימני',
  MT: 'קשר',
  Goalkeeper: 'שוער',
  'Left Back': 'מגן שמאלי',
  'Centre Back': 'בלם',
  'Centre-Back': 'בלם',
  'Right Back': 'מגן ימני',
  'Defensive Midfield': 'קשר הגנתי',
  'Central Midfield': 'קשר מרכזי',
  'Attacking Midfield': 'קשר התקפי',
  'Right Winger': 'כנף ימין',
  'Left Winger': 'כנף שמאל',
  'Centre Forward': 'חלוץ',
  'Centre-Forward': 'חלוץ',
  'Second Striker': 'חלוץ שני',
  'Left Midfield': 'קשר שמאלי',
  'Right Midfield': 'קשר ימני',
};

/* ── League chips config ── */
const LEAGUE_CHIPS = [
  { code: 'ISR1', label: 'ISR', flag: '🇮🇱' },
  { code: 'NL1', label: 'NL', flag: '🇳🇱' },
  { code: 'BE1', label: 'BEL', flag: '🇧🇪' },
  { code: 'TR1', label: 'TUR', flag: '🇹🇷' },
  { code: 'PO1', label: 'POR', flag: '🇵🇹' },
  { code: 'GR1', label: 'GRE', flag: '🇬🇷' },
  { code: 'PL1', label: 'POL', flag: '🇵🇱' },
  { code: 'A1', label: 'AUT', flag: '🇦🇹' },
  { code: 'SER1', label: 'SER', flag: '🇷🇸' },
  { code: 'SE1', label: 'SWE', flag: '🇸🇪' },
  { code: 'C1', label: 'SUI', flag: '🇨🇭' },
  { code: 'TS1', label: 'CZE', flag: '🇨🇿' },
  { code: 'RO1', label: 'ROM', flag: '🇷🇴' },
  { code: 'GB2', label: 'EFL', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'L2', label: 'BL2', flag: '🇩🇪' },
  { code: 'BU1', label: 'BUL', flag: '🇧🇬' },
  { code: 'UNG1', label: 'HUN', flag: '🇭🇺' },
  { code: 'ZYP1', label: 'CYP', flag: '🇨🇾' },
  { code: 'AZE1', label: 'AZE', flag: '🇦🇿' },
  { code: 'KAZ1', label: 'KAZ', flag: '🇰🇿' },
  { code: 'SLO1', label: 'SVK', flag: '🇸🇰' },
];

type TabFilter = 'all' | 'rumours' | 'news';

interface CachedData {
  rumours: RumourItem[];
  tmNews: LeagueNewsItem[];
  googleNews: GoogleNewsItem[];
  ts: number;
}

export default function NewsPage() {
  const { user } = useAuth();
  const { t, isRtl, lang } = useLanguage();
  const { platform } = usePlatform();

  const [rumours, setRumours] = useState<RumourItem[]>([]);
  const [tmNews, setTmNews] = useState<LeagueNewsItem[]>([]);
  const [googleNews, setGoogleNews] = useState<GoogleNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabFilter>('all');
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  /* ── Club contacts for relevance filtering ── */
  const [clubContactNames, setClubContactNames] = useState<string[]>([]);
  const [clubContactCountries, setClubContactCountries] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const contactsCol = CONTACTS_COLLECTIONS[platform] ?? 'Contacts';
    const unsub = onSnapshot(collection(db, contactsCol), (snap) => {
      const names: string[] = [];
      const countries = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.contactType === 'CLUB') {
          if (data.clubName) names.push((data.clubName as string).toLowerCase().trim());
          if (data.clubCountry) countries.add((data.clubCountry as string).toLowerCase().trim());
        }
      });
      setClubContactNames(names);
      setClubContactCountries(Array.from(countries));
    });
    return () => unsub();
  }, [user, platform]);

  /* ── Shortlist / Roster tracking ── */
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(new Set());
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const shortlistCol = SHORTLISTS_COLLECTIONS[platform] ?? 'Shortlists';
    const unsub = onSnapshot(collection(db, shortlistCol), (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const url = d.data().tmProfileUrl as string | undefined;
        const id = extractPlayerIdFromUrl(url);
        if (id) ids.add(id);
      });
      setShortlistIds(ids);
    });
    return () => unsub();
  }, [user, platform]);

  useEffect(() => {
    if (!user) return;
    const playersCol = PLAYERS_COLLECTIONS[platform] ?? 'Players';
    const unsub = onSnapshot(collection(db, playersCol), (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const url = d.data().tmProfile as string | undefined;
        const id = extractPlayerIdFromUrl(url);
        if (id) ids.add(id);
      });
      setRosterIds(ids);
    });
    return () => unsub();
  }, [user, platform]);

  const addToShortlist = useCallback(async (item: RumourItem) => {
    if (!user || !item.playerUrl) return;
    setAddingUrl(item.playerUrl);
    try {
      const account = await getCurrentAccountForShortlist(user);
      const shortlistCol = SHORTLISTS_COLLECTIONS[platform] ?? 'Shortlists';
      const colRef = collection(db, shortlistCol);
      const q = query(colRef, where('tmProfileUrl', '==', item.playerUrl));
      const existsSnap = await getDocs(q);
      if (existsSnap.empty) {
        let entry: Record<string, unknown>;
        try {
          const details = await getPlayerDetails(item.playerUrl);
          entry = {
            tmProfileUrl: item.playerUrl,
            addedAt: Date.now(),
            playerImage: details.profileImage ?? item.playerImage ?? null,
            playerName: details.fullName ?? item.playerName ?? null,
            playerPosition: details.positions?.[0] ?? item.position ?? null,
            playerAge: details.age ?? item.age ?? null,
            playerNationality: details.nationality ?? item.nationality?.[0] ?? null,
            playerNationalityFlag: details.nationalityFlag ?? null,
            clubJoinedName: details.currentClub?.clubName ?? item.currentClub ?? null,
            marketValue: details.marketValue ?? item.marketValue ?? null,
            addedByAgentId: account.id,
            addedByAgentName: account.name ?? null,
            addedByAgentHebrewName: account.hebrewName ?? null,
          };
        } catch {
          entry = {
            tmProfileUrl: item.playerUrl,
            addedAt: Date.now(),
            playerImage: item.playerImage ?? null,
            playerName: item.playerName ?? null,
            playerPosition: item.position ?? null,
            playerAge: item.age ?? null,
            playerNationality: item.nationality?.[0] ?? null,
            clubJoinedName: item.currentClub ?? null,
            marketValue: item.marketValue ?? null,
            addedByAgentId: account.id,
            addedByAgentName: account.name ?? null,
            addedByAgentHebrewName: account.hebrewName ?? null,
          };
        }
        await addDoc(colRef, entry);
        const feedCol = FEED_EVENTS_COLLECTIONS[platform] ?? 'FeedEvents';
        await addDoc(collection(db, feedCol), {
          type: 'SHORTLIST_ADDED',
          playerName: entry.playerName ?? null,
          playerImage: entry.playerImage ?? null,
          playerTmProfile: item.playerUrl,
          timestamp: Date.now(),
          agentName: account.name ?? null,
        });
      }
    } catch (err) {
      console.error('Add to shortlist error:', err);
    } finally {
      setAddingUrl(null);
    }
  }, [user, platform]);

  const fetchedRef = useRef(false);

  const fetchAll = useCallback(async (force = false) => {
    if (!force) {
      const cached = getScreenCache<CachedData>('news-rumors', user?.uid);
      if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
        setRumours(cached.rumours);
        setTmNews(cached.tmNews);
        setGoogleNews(cached.googleNews);
        setLastUpdated(new Date(cached.ts));
        setLoading(false);
        return;
      }
    }

    // Read language directly from localStorage to avoid stale closure on initial mount
    const currentLang = (typeof window !== 'undefined' && localStorage.getItem('mgsr-lang')) || 'en';

    setLoading(true);
    setError('');
    try {
      const [r, tn, gn] = await Promise.allSettled([
        getRumours(15),
        getLeagueNews(),
        getGoogleNews(undefined, currentLang),
      ]);

      const rumData = r.status === 'fulfilled' ? r.value : [];
      const tnData = tn.status === 'fulfilled' ? tn.value : [];
      const gnData = gn.status === 'fulfilled' ? gn.value : [];

      setRumours(rumData);
      setTmNews(tnData);
      setGoogleNews(gnData);
      setLastUpdated(new Date());

      setScreenCache('news-rumors', {
        rumours: rumData, tmNews: tnData, googleNews: gnData, ts: Date.now(),
      }, user?.uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchAll();
  }, [fetchAll]);

  /* ── Combined + filtered feed ── */
  const allItems: NewsFeedItem[] = useMemo(() => {
    let items: NewsFeedItem[] = [...rumours, ...tmNews, ...googleNews];

    // Relevance filter for NEWS only (rumours are never filtered):
    // News passes if: Israeli, from a country where user has club contacts,
    // headline mentions a contact club, or from any configured league (all news already filtered by API)
    const contactCountriesSet = new Set(clubContactCountries);
    const hasNonIsraeliContacts = clubContactCountries.some(c => c !== 'israel');
    if (hasNonIsraeliContacts) {
      // User has international contacts — filter to those countries + Israel + headline matches
      items = items.filter(item => {
        if (item.source === 'rumour') return true;
        const n = item as LeagueNewsItem | GoogleNewsItem;
        // Israeli news always passes
        if (n.leagueCode === 'ISR1' || n.country?.toLowerCase() === 'israel') return true;
        // News passes if its country matches a contact's country
        if (n.country && contactCountriesSet.has(n.country.toLowerCase())) return true;
        // Fallback: headline mentions any contact club name (min 4 chars)
        const hl = n.headline.toLowerCase();
        return clubContactNames.some(cn => cn.length >= 4 && hl.includes(cn));
      });
    }
    // If user has NO international contacts (or no contacts at all), show all news —
    // the API already filters heavily for transfer relevance per league

    // Sort by date descending (newest first)
    const parseDate = (item: NewsFeedItem): number => {
      const raw = item.source === 'rumour'
        ? (item as RumourItem).rumouredDate
        : (item as LeagueNewsItem | GoogleNewsItem).date;
      if (!raw) return 0;
      // Format: "DD.MM.YYYY - HH:MM" or "DD.MM · HH:MM"
      const full = raw.match(/(\d{2})\.(\d{2})\.(\d{4})\s*[-·]\s*(\d{2}):(\d{2})/);
      if (full) return new Date(`${full[3]}-${full[2]}-${full[1]}T${full[4]}:${full[5]}:00`).getTime() || 0;
      // Short format: "DD.MM · HH:MM" (no year — assume current year)
      const short = raw.match(/(\d{2})\.(\d{2})\s*·\s*(\d{2}):(\d{2})/);
      if (short) return new Date(`${new Date().getFullYear()}-${short[2]}-${short[1]}T${short[3]}:${short[4]}:00`).getTime() || 0;
      return 0;
    };

    items.sort((a, b) => parseDate(b) - parseDate(a));
    return items;
  }, [rumours, tmNews, googleNews, clubContactNames, clubContactCountries]);

  const filteredItems = useMemo(() => {
    let items = allItems;

    // Tab filter
    if (tab === 'rumours') items = items.filter(i => i.source === 'rumour');
    if (tab === 'news') items = items.filter(i => i.source !== 'rumour');

    // League filter
    if (leagueFilter) {
      items = items.filter(i => {
        if (i.source === 'rumour') {
          // Match rumours by checking if any club or league text matches
          const r = i as RumourItem;
          return r.interestedClubLeague?.toLowerCase().includes(leagueFilter.toLowerCase()) ||
            LEAGUE_CHIPS.find(l => l.code === leagueFilter)?.label?.toLowerCase() === leagueFilter.toLowerCase();
        }
        return (i as LeagueNewsItem | GoogleNewsItem).leagueCode === leagueFilter;
      });
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => {
        if (i.source === 'rumour') {
          const r = i as RumourItem;
          return r.playerName.toLowerCase().includes(q) ||
            r.currentClub.toLowerCase().includes(q) ||
            r.interestedClub.toLowerCase().includes(q) ||
            r.position.toLowerCase().includes(q);
        }
        const n = i as LeagueNewsItem | GoogleNewsItem;
        return n.headline.toLowerCase().includes(q) ||
          n.leagueName.toLowerCase().includes(q) ||
          n.country.toLowerCase().includes(q) ||
          ('sourceName' in n && n.sourceName.toLowerCase().includes(q));
      });
    }

    return items;
  }, [allItems, tab, leagueFilter, search]);

  const rumourCount = allItems.filter(i => i.source === 'rumour').length;
  const newsCount = allItems.filter(i => i.source !== 'rumour').length;
  const uniqueLeagues = useMemo(() => {
    const codes = new Set<string>();
    allItems.forEach(i => {
      if (i.source === 'rumour') return;
      codes.add((i as LeagueNewsItem | GoogleNewsItem).leagueCode);
    });
    return codes.size;
  }, [allItems]);

  const updatedText = lastUpdated
    ? `${t('news_updated_ago')} ${Math.round((Date.now() - lastUpdated.getTime()) / 60000)} min`
    : '';

  return (
    <AppLayout>
      <div className={`min-h-screen ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl md:text-3xl text-mgsr-text flex items-center gap-2">
              📰 {t('news_title')}
            </h1>
            <p className="text-sm text-mgsr-muted mt-1">{t('news_subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {updatedText && (
              <span className="text-xs text-mgsr-muted hidden md:block">{updatedText}</span>
            )}
            <button
              onClick={() => fetchAll(true)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-mgsr-border text-mgsr-muted hover:text-mgsr-accent hover:border-mgsr-accent transition text-sm disabled:opacity-50"
            >
              🔄 {t('news_refresh')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-mgsr-card border border-mgsr-border rounded-xl p-3 text-center">
            <div className="text-xl md:text-2xl font-bold text-mgsr-accent">{rumourCount}</div>
            <div className="text-[11px] text-mgsr-muted uppercase tracking-wide">{t('news_stat_rumours')}</div>
          </div>
          <div className="bg-mgsr-card border border-mgsr-border rounded-xl p-3 text-center">
            <div className="text-xl md:text-2xl font-bold text-blue-400">{newsCount}</div>
            <div className="text-[11px] text-mgsr-muted uppercase tracking-wide">{t('news_stat_news')}</div>
          </div>
          <div className="bg-mgsr-card border border-mgsr-border rounded-xl p-3 text-center">
            <div className="text-xl md:text-2xl font-bold text-mgsr-text">{uniqueLeagues || LEAGUE_CHIPS.length}</div>
            <div className="text-[11px] text-mgsr-muted uppercase tracking-wide">{t('news_stat_leagues')}</div>
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex gap-2">
            {(['all', 'rumours', 'news'] as TabFilter[]).map(t2 => (
              <button
                key={t2}
                onClick={() => setTab(t2)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition border ${
                  tab === t2
                    ? 'bg-mgsr-accent text-mgsr-dark border-mgsr-accent'
                    : 'border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-muted'
                }`}
              >
                {t2 === 'all' && `${t('news_tab_all')}`}
                {t2 === 'rumours' && `🔄 ${t('news_tab_rumours')}`}
                {t2 === 'news' && `📰 ${t('news_tab_news')}`}
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  tab === t2 ? 'bg-black/20' : 'bg-white/5'
                }`}>
                  {t2 === 'all' ? allItems.length : t2 === 'rumours' ? rumourCount : newsCount}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-white/[0.04] border border-mgsr-border rounded-lg px-3 py-2 w-full md:w-72">
            <span className="text-mgsr-muted text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('news_search_placeholder')}
              className="bg-transparent border-none outline-none text-mgsr-text text-sm w-full placeholder:text-mgsr-muted"
            />
          </div>
        </div>

        {/* League Chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5">
          <span className="text-[11px] uppercase tracking-widest text-mgsr-muted mr-1">
            {t('news_stat_leagues')}:
          </span>
          <button
            onClick={() => setLeagueFilter(null)}
            className={`px-2.5 py-1 rounded-full text-xs border transition flex items-center gap-1 ${
              !leagueFilter
                ? 'bg-mgsr-accent/15 border-mgsr-accent text-mgsr-accent'
                : 'border-mgsr-border text-mgsr-muted hover:border-mgsr-accent hover:text-mgsr-text'
            }`}
          >
            🌍 {t('news_all_leagues')}
          </button>
          {LEAGUE_CHIPS.map(lc => (
            <button
              key={lc.code}
              onClick={() => setLeagueFilter(leagueFilter === lc.code ? null : lc.code)}
              className={`px-2.5 py-1 rounded-full text-xs border transition flex items-center gap-1 ${
                leagueFilter === lc.code
                  ? 'bg-mgsr-accent/15 border-mgsr-accent text-mgsr-accent'
                  : 'border-mgsr-border text-mgsr-muted hover:border-mgsr-accent hover:text-mgsr-text'
              }`}
            >
              {lc.flag} {lc.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-mgsr-card border border-mgsr-border rounded-xl p-4 flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-mgsr-border/50" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-mgsr-border/50 rounded w-3/5" />
                  <div className="h-3 bg-mgsr-border/50 rounded w-2/5" />
                </div>
                <div className="w-16 h-4 bg-mgsr-border/50 rounded" />
              </div>
            ))}
            <p className="text-center text-mgsr-muted text-sm pt-2">{t('news_loading')}</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredItems.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-mgsr-muted">{t('news_no_results')}</p>
          </div>
        )}

        {/* Feed */}
        {!loading && filteredItems.length > 0 && (
          <div className="space-y-3">
            {filteredItems.map((item, idx) =>
              item.source === 'rumour' ? (
                <RumourCard
                  key={`r-${idx}`}
                  item={item as RumourItem}
                  t={t}
                  isRtl={isRtl}
                  inRoster={!!extractPlayerIdFromUrl((item as RumourItem).playerUrl) && rosterIds.has(extractPlayerIdFromUrl((item as RumourItem).playerUrl)!)}
                  inShortlist={!!extractPlayerIdFromUrl((item as RumourItem).playerUrl) && shortlistIds.has(extractPlayerIdFromUrl((item as RumourItem).playerUrl)!)}
                  onAddToShortlist={addToShortlist}
                  addingUrl={addingUrl}
                />
              ) : item.source === 'tm-news' ? (
                <TmNewsCard key={`tn-${idx}`} item={item as LeagueNewsItem} t={t} />
              ) : (
                <GoogleNewsCard key={`gn-${idx}`} item={item as GoogleNewsItem} t={t} />
              )
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Card Components
   ═══════════════════════════════════════════════════════════════════════ */

function RumourCard({ item, t, isRtl, inRoster, inShortlist, onAddToShortlist, addingUrl }: {
  item: RumourItem;
  t: (k: string) => string;
  isRtl: boolean;
  inRoster: boolean;
  inShortlist: boolean;
  onAddToShortlist: (item: RumourItem) => void;
  addingUrl: string | null;
}) {
  const probClass =
    item.probability === null ? 'bg-white/5 text-mgsr-muted'
    : item.probability >= 50 ? 'bg-green-500/20 text-green-400'
    : item.probability >= 20 ? 'bg-amber-500/20 text-amber-400'
    : 'bg-red-500/15 text-red-400';

  const displayPos = isRtl ? (POSITION_HE[item.position] || item.position) : item.position;
  const isAdding = addingUrl === item.playerUrl;
  const alreadyTracked = inRoster || inShortlist;

  return (
    <a
      href={item.playerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-mgsr-card border border-mgsr-border rounded-xl p-4 hover:border-mgsr-accent transition group cursor-pointer"
    >
      <div className="flex items-center gap-4">
        {/* Player image */}
        <div className="w-12 h-12 rounded-full bg-mgsr-accent/10 border-2 border-mgsr-border flex-shrink-0 overflow-hidden flex items-center justify-center">
          {item.playerImage ? (
            <img src={item.playerImage} alt={item.playerName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="text-xl text-mgsr-muted">👤</span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-[15px] text-mgsr-text">{item.playerName}</span>
            {item.nationality?.[0] && <span className="text-sm">{getFlagForCountry(item.nationality[0])}</span>}
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-mgsr-accent/15 text-mgsr-accent font-medium">{displayPos}</span>
            <span className="text-xs text-mgsr-muted">{item.age}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-mgsr-accent/10 text-mgsr-accent font-semibold uppercase tracking-wider">
              {t('news_tab_rumours').slice(0, 6)}
            </span>
            {/* Database / Shortlist tags */}
            {inRoster && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-semibold uppercase tracking-wider">
                📋 {t('news_tag_database')}
              </span>
            )}
            {inShortlist && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold uppercase tracking-wider">
                ⭐ {t('news_tag_shortlist')}
              </span>
            )}
          </div>
          <div className={`flex items-center gap-2 mt-1 text-sm text-mgsr-muted ${isRtl ? 'flex-row-reverse justify-end' : ''}`}>
            <span className="flex items-center gap-1">
              {item.currentClubImage && (
                <img src={item.currentClubImage} alt="" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
              )}
              <span className="text-mgsr-text font-medium truncate max-w-[140px]">{item.currentClub}</span>
            </span>
            <span className="text-mgsr-accent">→</span>
            <span className="flex items-center gap-1">
              {item.interestedClubImage && (
                <img src={item.interestedClubImage} alt="" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
              )}
              <span className="text-mgsr-text font-medium truncate max-w-[140px]">{item.interestedClub}</span>
            </span>
            {item.interestedClubLeague && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/5 text-mgsr-muted hidden md:inline">
                {item.interestedClubLeague}
              </span>
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-[11px] text-mgsr-muted">{item.rumouredDate?.replace(/ - /, ' · ').slice(0, 13)}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${probClass}`}>
            {item.probability !== null ? `${item.probability}%` : '? %'}
          </span>
          {item.marketValue && item.marketValue !== '-' && (
            <span className="text-xs font-semibold text-green-400">💰 {item.marketValue}</span>
          )}
          {!alreadyTracked && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToShortlist(item);
              }}
              disabled={isAdding}
              className="text-[10px] px-2.5 py-1 rounded-md border border-mgsr-accent/40 text-mgsr-accent hover:bg-mgsr-accent/15 transition font-medium disabled:opacity-50 whitespace-nowrap"
            >
              {isAdding ? '...' : `+ ${t('news_add_shortlist')}`}
            </button>
          )}
          <span className="w-7 h-7 rounded-md border border-mgsr-border text-mgsr-muted group-hover:text-mgsr-accent group-hover:border-mgsr-accent flex items-center justify-center text-xs transition">
            🔗
          </span>
        </div>
      </div>
    </a>
  );
}

function TmNewsCard({ item, t }: { item: LeagueNewsItem; t: (k: string) => string }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-mgsr-card border border-mgsr-border rounded-xl p-4 hover:border-blue-400 transition group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[11px] text-mgsr-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          {t('news_source_tm')} · {item.countryFlag} {item.leagueName}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-400/15 text-blue-400 font-semibold uppercase tracking-wider">
            TM News
          </span>
        </div>
        <span className="text-[11px] text-mgsr-muted">{item.date}</span>
      </div>
      <h3 className="text-[15px] font-semibold text-mgsr-text mb-1 leading-snug group-hover:text-blue-300 transition line-clamp-2">
        {item.headline}
      </h3>
      {item.excerpt && (
        <p className="text-[13px] text-mgsr-muted leading-relaxed line-clamp-2">{item.excerpt}</p>
      )}
      <div className="flex gap-1.5 mt-2.5 flex-wrap">
        <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/12 text-purple-400">
          {item.countryFlag} {item.leagueName}
        </span>
      </div>
    </a>
  );
}

function GoogleNewsCard({ item, t }: { item: GoogleNewsItem; t: (k: string) => string }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-mgsr-card border border-mgsr-border rounded-xl p-4 hover:border-emerald-400 transition group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[11px] text-mgsr-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          {item.sourceName} · {item.countryFlag} {item.leagueName}
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-400 font-semibold uppercase tracking-wider">
            News
          </span>
        </div>
        <span className="text-[11px] text-mgsr-muted">{item.date}</span>
      </div>
      <h3
        className="text-[15px] font-semibold text-mgsr-text mb-1 leading-snug group-hover:text-emerald-300 transition line-clamp-2"
        title={item.originalHeadline || undefined}
      >
        {item.headline}
        {item.originalHeadline && <span className="ml-1.5 text-[10px] text-mgsr-muted font-normal">🌐</span>}
      </h3>
      <div className="flex gap-1.5 mt-2.5 flex-wrap">
        <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/12 text-blue-400">
          {item.sourceName}
        </span>
        <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/12 text-purple-400">
          {item.countryFlag} {item.leagueName}
        </span>
      </div>
    </a>
  );
}

/* ── Helper: rough country → flag mapping ── */
function getFlagForCountry(country: string): string {
  const map: Record<string, string> = {
    'Germany': '🇩🇪', 'France': '🇫🇷', 'Spain': '🇪🇸', 'Italy': '🇮🇹',
    'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Netherlands': '🇳🇱', 'Belgium': '🇧🇪', 'Turkey': '🇹🇷',
    'Portugal': '🇵🇹', 'Greece': '🇬🇷', 'Poland': '🇵🇱', 'Austria': '🇦🇹',
    'Serbia': '🇷🇸', 'Sweden': '🇸🇪', 'Switzerland': '🇨🇭', 'Czech Republic': '🇨🇿',
    'Romania': '🇷🇴', 'Bulgaria': '🇧🇬', 'Hungary': '🇭🇺', 'Cyprus': '🇨🇾',
    'Israel': '🇮🇱', 'Croatia': '🇭🇷', 'Brazil': '🇧🇷', 'Argentina': '🇦🇷',
    'Colombia': '🇨🇴', 'Peru': '🇵🇪', 'Nigeria': '🇳🇬', 'DR Congo': '🇨🇩',
    'Algeria': '🇩🇿', 'Angola': '🇦🇴', 'Slovakia': '🇸🇰', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'Azerbaijan': '🇦🇿', 'Kazakhstan': '🇰🇿',
    'United States': '🇺🇸', 'Japan': '🇯🇵', 'South Korea': '🇰🇷',
  };
  return map[country] || '🏳️';
}
