'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc, addDoc, collection, onSnapshot, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { db } from '@/lib/firebase';
import { getPlayerDetails, extractPlayerIdFromUrl } from '@/lib/api';

function samePlayer(url1: string, url2: string): boolean {
  const id1 = extractPlayerIdFromUrl(url1);
  const id2 = extractPlayerIdFromUrl(url2);
  return !!id1 && id1 === id2;
}

/* ─── helpers ─── */

function shortenPosition(pos: string | undefined): string {
  if (!pos?.trim()) return '—';
  const p = pos.trim();
  if (p.includes('Centre-Forward') || p.includes('Center-Forward')) return 'CF';
  if (p.includes('Second Striker')) return 'SS';
  if (p.includes('Centre-Back') || p.includes('Center-Back')) return 'CB';
  if (p.includes('Left-Back')) return 'LB';
  if (p.includes('Right-Back')) return 'RB';
  if (p.includes('Defensive Midfield')) return 'DM';
  if (p.includes('Central Midfield')) return 'CM';
  if (p.includes('Attacking Midfield')) return 'AM';
  if (p.includes('Left Wing') || p.includes('Left Winger')) return 'LW';
  if (p.includes('Right Wing') || p.includes('Right Winger')) return 'RW';
  if (p.includes('Goalkeeper')) return 'GK';
  return p.split(' - ').pop() || p;
}

interface SignatureStat {
  stat_key: string;
  label: string;
  label_en: string;
  percentile: number;
  value: number;
}

interface ReferencePlayer {
  name: string;
  position: string;
  age: string;
  market_value: string;
  league: string;
  club: string;
  foot: string;
  height: string;
  nationality: string;
  playing_style: string | null;
  url: string;
}

interface FindNextResult {
  name: string;
  position: string;
  age: string;
  market_value: string;
  url: string;
  league: string;
  club?: string;
  fbref_team?: string;
  citizenship: string;
  foot: string;
  height: string;
  contract: string;
  playing_style: string | null;
  find_next_score: number;
  signature_match: number;
  style_match_bonus: number;
  value_gap_bonus: number;
  contract_bonus: number;
  age_bonus: number;
  explanation: string;
  scout_narrative?: string;
}

interface FindNextResponse {
  reference_player?: ReferencePlayer;
  signature_stats?: SignatureStat[];
  results: FindNextResult[];
  result_count: number;
  total_candidates_scanned?: number;
  error?: string;
}

const ALL_EXAMPLE_PLAYERS = [
  'Mohamed Salah',
  'Erling Haaland',
  'Jude Bellingham',
  'Vinicius Junior',
  'Florian Wirtz',
  'Lamine Yamal',
  'Bukayo Saka',
  'Phil Foden',
  'Rodri',
  'Jamal Musiala',
  'Martin Ødegaard',
  'Pedri',
];

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const VALUE_PRESETS = [
  { label: '€500K', value: 500000 },
  { label: '€1M', value: 1000000 },
  { label: '€3M', value: 3000000 },
  { label: '€5M', value: 5000000 },
  { label: '€10M', value: 10000000 },
  { label: 'No limit', value: 0, labelHe: 'ללא הגבלה' },
];

export default function FindNextTab() {
  const { user } = useAuth();
  const { isRtl, lang, t } = useLanguage();

  const [playerName, setPlayerName] = useState('');
  const [ageMax, setAgeMax] = useState(23);
  const [valueMax, setValueMax] = useState<number>(3000000);

  const [response, setResponse] = useState<FindNextResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examples, setExamples] = useState<string[]>([]);
  const [addingToShortlistUrl, setAddingToShortlistUrl] = useState<string | null>(null);
  const [shortlistError, setShortlistError] = useState<string | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterTmProfiles, setRosterTmProfiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    const shortlistUnsub = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter((u): u is string => !!u)));
    });
    const rosterUnsub = onSnapshot(collection(db, 'Players'), (snap) => {
      const urls = snap.docs
        .map((d) => (d.data().tmProfile as string)?.trim())
        .filter((u): u is string => !!u);
      setRosterTmProfiles(new Set(urls));
    });
    return () => { shortlistUnsub(); rosterUnsub(); };
  }, [user]);

  const addToShortlist = useCallback(
    async (player: FindNextResult, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = player.url;
      if (!user || !url) return;
      setShortlistError(null);
      setAddingToShortlistUrl(url);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const colRef = collection(db, 'Shortlists');
        const q = query(colRef, where('tmProfileUrl', '==', url));
        const existsSnap = await getDocs(q);
        if (existsSnap.empty) {
          let entry: Record<string, unknown>;
          try {
            const details = await getPlayerDetails(url);
            entry = {
              tmProfileUrl: url,
              addedAt: Date.now(),
              playerImage: details.profileImage ?? null,
              playerName: details.fullName ?? null,
              playerPosition: details.positions?.[0] ?? null,
              playerAge: details.age ?? null,
              playerNationality: details.nationality ?? null,
              playerNationalityFlag: details.nationalityFlag ?? null,
              clubJoinedName: details.currentClub?.clubName ?? null,
              marketValue: details.marketValue ?? null,
              addedByAgentId: account.id,
              addedByAgentName: account.name ?? null,
              addedByAgentHebrewName: account.hebrewName ?? null,
            };
          } catch {
            entry = {
              tmProfileUrl: url,
              addedAt: Date.now(),
              playerName: player.name ?? null,
              playerPosition: player.position ?? null,
              playerAge: player.age ?? null,
              playerNationality: player.citizenship ?? null,
              clubJoinedName: player.club ?? player.fbref_team ?? null,
              marketValue: player.market_value ?? null,
              addedByAgentId: account.id,
              addedByAgentName: account.name ?? null,
              addedByAgentHebrewName: account.hebrewName ?? null,
            };
          }
          await addDoc(colRef, entry);
          await addDoc(collection(db, 'FeedEvents'), {
            type: 'SHORTLIST_ADDED',
            playerName: entry.playerName ?? null,
            playerImage: entry.playerImage ?? null,
            playerTmProfile: url,
            timestamp: Date.now(),
            agentName: account.name ?? null,
          });
        }
      } catch (err) {
        setShortlistError(err instanceof Error ? err.message : 'Failed to add');
      } finally {
        setAddingToShortlistUrl(null);
      }
    },
    [user]
  );

  // Shuffle example badges on mount
  useEffect(() => {
    setExamples(shuffleArray(ALL_EXAMPLE_PLAYERS).slice(0, 5));
  }, []);

  const handleSearch = useCallback(async () => {
    const name = playerName.trim();
    if (!name) return;
    setSearching(true);
    setError(null);
    setResponse(null);
    try {
      const params = new URLSearchParams({
        player_name: name,
        age_max: String(ageMax),
        lang: lang,
        limit: '15',
      });
      if (valueMax > 0) {
        params.set('value_max', String(valueMax));
      }
      const res = await fetch(`/api/scout/find-next?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(120000),
      });
      const data = (await res.json()) as FindNextResponse;
      if (data.error) {
        setError(data.error);
      } else {
        setResponse(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }, [playerName, ageMax, valueMax, lang]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  const isHe = lang === 'he';

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="relative">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div
          className="absolute -top-24 -left-[15%] w-[55%] h-[65%]"
          style={{
            background:
              'radial-gradient(ellipse, rgba(168, 85, 247, 0.10) 0%, rgba(99, 102, 241, 0.04) 40%, transparent 70%)',
          }}
        />
        <div
          className="absolute top-[30%] -right-[10%] w-[40%] h-[50%]"
          style={{
            background:
              'radial-gradient(ellipse, rgba(34, 211, 238, 0.06) 0%, transparent 70%)',
          }}
        />
      </div>

      <div className="relative max-w-[52rem] mx-auto">
        {/* Hero */}
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/20 flex items-center justify-center shadow-lg shadow-purple-500/10">
              <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight war-gradient-text">
                {isHe ? 'מצא את הכוכב הבא' : 'Find Me The Next...'}
              </h1>
              <p className="text-sm md:text-base text-mgsr-muted mt-0.5">
                {isHe
                  ? 'חפש שחקנים צעירים וזולים שמראים סימנים סטטיסטיים דומים לכוכבים גדולים'
                  : 'Find young, affordable players showing early statistical signs of star potential'}
              </p>
            </div>
          </div>
        </div>

        {/* Search Form */}
        <div className="mb-8">
          <div className="rounded-2xl border border-mgsr-border/60 bg-mgsr-card/80 backdrop-blur-sm p-4 md:p-6 space-y-5 shadow-xl shadow-black/10">
            {/* Player name input */}
            <div>
              <label
                htmlFor="find-next-name"
                className="block text-sm font-semibold text-mgsr-text mb-2"
              >
                {isHe ? 'שם השחקן לחיפוש' : 'Reference player name'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-4 pointer-events-none">
                  <svg className="w-4 h-4 text-mgsr-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <input
                  id="find-next-name"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isHe ? 'למשל: Mohamed Salah' : 'e.g. Mohamed Salah'}
                  dir="ltr"
                  className="w-full ps-11 pe-4 py-3.5 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder:text-mgsr-muted/60 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500/60 transition-all duration-200"
                  disabled={searching}
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {examples.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPlayerName(name)}
                    disabled={searching}
                    className="px-3 py-1.5 rounded-lg text-xs border border-mgsr-border/60 text-mgsr-muted hover:text-purple-300 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all duration-200 disabled:opacity-50"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Filters row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Age Max */}
              <div>
                <label className="block text-sm font-semibold text-mgsr-text mb-2">
                  {isHe ? 'גיל מקסימלי' : 'Max age'}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={17}
                    max={27}
                    value={ageMax}
                    onChange={(e) => setAgeMax(Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                    disabled={searching}
                  />
                  <span className="text-lg font-display font-bold text-purple-400 w-8 text-center">
                    {ageMax}
                  </span>
                </div>
              </div>

              {/* Value Max */}
              <div>
                <label className="block text-sm font-semibold text-mgsr-text mb-2">
                  {isHe ? 'שווי מקסימלי' : 'Max market value'}
                </label>
                <div className="flex flex-wrap gap-2">
                  {VALUE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setValueMax(preset.value)}
                      disabled={searching}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                        valueMax === preset.value
                          ? 'border-purple-500 bg-purple-500/20 text-purple-300 font-semibold'
                          : 'border-mgsr-border text-mgsr-muted hover:text-purple-400 hover:border-purple-400/50'
                      } disabled:opacity-50`}
                    >
                      {isHe && preset.labelHe ? preset.labelHe : preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Search button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching || !playerName.trim()}
                className="group/btn px-7 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold hover:from-purple-500 hover:to-indigo-500 hover:shadow-lg hover:shadow-purple-500/20 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center gap-2.5 min-w-[180px]"
              >
                {searching ? (
                  <>
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-dot-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-dot-pulse" style={{ animationDelay: '0.15s' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-dot-pulse" style={{ animationDelay: '0.3s' }} />
                    </span>
                    {isHe ? 'מחפש...' : 'Searching...'}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 transition-transform duration-300 group-hover/btn:scale-110" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    {isHe ? 'מצא את הכוכב הבא' : 'Find The Next'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <p>{error}</p>
          </div>
        )}

        {/* Reference player + signature */}
        {response?.reference_player && (
          <div className="mb-6">
            {/* Reference card */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-500/5 border border-purple-500/30 mb-4 shadow-lg shadow-purple-500/5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/25 to-indigo-500/15 border border-purple-500/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold text-mgsr-text">
                    {response.reference_player.name}
                  </h2>
                  <p className="text-sm text-mgsr-muted">
                    {shortenPosition(response.reference_player.position)}
                    <span className="mx-1.5">·</span>
                    {response.reference_player.age}
                    <span className="mx-1.5">·</span>
                    {response.reference_player.market_value}
                    {response.reference_player.club && response.reference_player.club !== '?' && (
                      <>
                        <span className="mx-1.5">·</span>
                        {response.reference_player.club}
                      </>
                    )}
                    {response.reference_player.playing_style && (
                      <>
                        <span className="mx-1.5">·</span>
                        <span className="text-purple-400">
                          {response.reference_player.playing_style}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Signature stats */}
              {response.signature_stats && response.signature_stats.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                    {isHe ? 'חתימה סטטיסטית' : 'Statistical Signature'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                    {response.signature_stats.map((stat) => (
                      <div
                        key={stat.stat_key}
                        className="rounded-xl bg-mgsr-dark/60 border border-mgsr-border/60 p-3 text-center hover:border-purple-500/20 transition-colors duration-200"
                      >
                        <div className="text-xs text-mgsr-muted mb-1 truncate">
                          {stat.label}
                        </div>
                        <div className="text-lg font-display font-bold text-purple-400">
                          P{stat.percentile}
                        </div>
                        <div className="text-xs text-mgsr-muted">{stat.value}</div>
                        {/* Percentile bar */}
                        <div className="mt-1.5 h-1.5 bg-mgsr-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${stat.percentile}%`,
                              background:
                                stat.percentile >= 90
                                  ? '#a855f7'
                                  : stat.percentile >= 75
                                    ? '#8b5cf6'
                                    : stat.percentile >= 60
                                      ? '#7c3aed'
                                      : '#6366f1',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Results count */}
            {response.result_count > 0 && (
              <p className="text-sm text-mgsr-muted mb-1">
                {isHe
                  ? `נמצאו ${response.result_count} שחקנים צעירים עם פרופיל דומה (מתוך ${response.total_candidates_scanned ?? '?'} מועמדים)`
                  : `Found ${response.result_count} young players with matching profile (from ${response.total_candidates_scanned ?? '?'} candidates)`}
              </p>
            )}
          </div>
        )}

        {/* Results */}
        {response && response.results.length > 0 && (
          <>
            {shortlistError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {shortlistError}
              </div>
            )}
            <div className="space-y-3">
              {response.results.filter((player) => {
                const url = player.url;
                if (!url) return true;
                if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
                if (Array.from(shortlistUrls).some((s) => samePlayer(s, url))) return false;
                return true;
              }).map((player) => {
                const pct = Math.round(player.find_next_score);
                const url = player.url;
                const isAdding = addingToShortlistUrl === url;
                const inShortlist = url ? Array.from(shortlistUrls).some((u) => samePlayer(u, url)) : false;
                return (
                  <div
                    key={url || player.name}
                    className="flex items-start gap-5 p-5 rounded-2xl bg-mgsr-card border border-mgsr-border/60 hover:border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 war-card-glow"
                  >
                    {/* Score ring */}
                    <div
                      className="w-14 h-14 shrink-0 rounded-full flex items-center justify-center shadow-md shadow-purple-500/10"
                      style={{
                        background: `conic-gradient(#a855f7 0deg, #6366f1 ${pct * 3.6}deg, #253545 ${pct * 3.6}deg 360deg)`,
                      }}
                    >
                      <div className="w-[42px] h-[42px] rounded-full bg-mgsr-card flex items-center justify-center">
                        <span className="font-display font-bold text-sm text-purple-400">
                          {pct}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block hover:underline"
                            >
                              <p className="font-semibold text-mgsr-text truncate">
                                {player.name || '—'}
                              </p>
                            </a>
                          ) : (
                            <p className="font-semibold text-mgsr-text truncate">
                              {player.name || '—'}
                            </p>
                          )}
                        </div>
                        {url && user && (
                          <button
                            type="button"
                            onClick={(e) => !inShortlist && addToShortlist(player, e)}
                            disabled={!!addingToShortlistUrl}
                            className={`group/bookmark flex items-center gap-2 px-3 py-1.5 rounded-full border shrink-0 transition-all duration-200 ${
                              inShortlist
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 cursor-default'
                                : 'border-mgsr-border/80 bg-mgsr-dark/40 text-mgsr-muted hover:border-amber-500/40 hover:text-amber-400/90 hover:bg-amber-500/5 disabled:opacity-60'
                            }`}
                          >
                            {isAdding ? (
                              <span className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />
                            ) : inShortlist ? (
                              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 shrink-0 opacity-70 group-hover/bookmark:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                              </svg>
                            )}
                            <span className="text-xs font-medium">
                              {isAdding ? t('shortlist_adding') : inShortlist ? t('shortlist_already_added') : t('shortlist_add')}
                            </span>
                          </button>
                        )}
                      </div>

                    {/* Meta line */}
                    <p className="text-sm text-mgsr-muted mt-0.5">
                      {isHe ? `גיל ${player.age}` : `Age ${player.age}`}
                      <span className="mx-1.5">·</span>
                      {shortenPosition(player.position)}
                      <span className="mx-1.5">·</span>
                      {player.market_value || '—'}
                      <span className="mx-1.5">·</span>
                      {player.club || player.fbref_team || player.league || '—'}
                      {(player.club || player.fbref_team) && player.league && (
                        <span className="text-mgsr-muted/60">
                          {' '}({player.league})
                        </span>
                      )}
                      {player.foot && (
                        <>
                          <span className="mx-1.5">·</span>
                          {player.foot}
                        </>
                      )}
                    </p>

                    {/* Bonus badges */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {player.playing_style && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-purple-500/15 to-indigo-500/10 text-purple-400 border border-purple-500/20">
                          {player.playing_style}
                        </span>
                      )}
                      {player.value_gap_bonus >= 7 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-emerald-500/15 to-teal-500/10 text-emerald-400 border border-emerald-500/20">
                          <svg className="w-3 h-3 inline-block -mt-px me-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
                          {isHe ? 'פער ערך' : 'Value Gap'}
                        </span>
                      )}
                      {player.contract_bonus >= 5 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-amber-500/15 to-orange-500/10 text-amber-400 border border-amber-500/20">
                          <svg className="w-3 h-3 inline-block -mt-px me-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {isHe ? 'חוזה קצר' : 'Expiring Contract'}
                        </span>
                      )}
                      {player.style_match_bonus >= 10 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-blue-500/15 to-indigo-500/10 text-blue-400 border border-blue-500/20">
                          <svg className="w-3 h-3 inline-block -mt-px me-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          {isHe ? 'סגנון זהה' : 'Style Match'}
                        </span>
                      )}
                      {player.age_bonus >= 5 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-cyan-500/15 to-sky-500/10 text-cyan-400 border border-cyan-500/20">
                          <svg className="w-3 h-3 inline-block -mt-px me-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>
                          {isHe ? 'צעיר מאוד' : 'Very Young'}
                        </span>
                      )}
                    </div>

                    {/* Explanation: prefer scout_narrative (Gemini, locale-aware) over explanation (Python, English) */}
                    {(player.scout_narrative || player.explanation) && (
                      <div
                        className="text-xs text-mgsr-muted mt-2 space-y-0.5"
                        dir={isHe ? 'rtl' : 'ltr'}
                      >
                        {(player.scout_narrative || player.explanation || '').split('\n').map((line, i) => (
                          <p
                            key={i}
                            className={i === 0 ? 'font-medium text-mgsr-text/80' : ''}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* No results */}
        {response && response.results.length === 0 && !error && (
          <div className="p-10 rounded-2xl bg-gradient-to-b from-mgsr-card/80 to-mgsr-card/40 border border-mgsr-border/60 text-center">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-purple-400/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-mgsr-muted">
              {isHe
                ? 'לא נמצאו שחקנים צעירים עם פרופיל מתאים. נסה להגדיל את הגיל או שווי השוק המקסימלי.'
                : 'No young players found matching this profile. Try increasing the age or value cap.'}
            </p>
            <p className="text-xs text-mgsr-muted/60 mt-2">
              {isHe ? 'נסה שם שחקן אחר או הרחב את הפילטרים' : 'Try a different player or widen the filters'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
