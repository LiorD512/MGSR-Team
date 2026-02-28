'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, onSnapshot, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist, SHARED_SHORTLIST_DOC_ID } from '@/lib/accounts';
import { extractPlayerIdFromUrl } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import { AGENTS_CONFIG, type AgentId } from '@/lib/scoutAgentConfig';
import type { ScoutProfileResponse } from '@/types/scoutProfiles';

interface DiscoveryCandidate {
  name: string;
  position: string;
  age: string;
  marketValue: string;
  transfermarktUrl: string;
  league?: string;
  club?: string;
  nationality?: string;
  profileImage?: string;
  source: 'request_match' | 'hidden_gem' | 'general';
  sourceLabel: string;
  requestId?: string;
  clubName?: string;
  hiddenGemScore?: number;
  hiddenGemReason?: { he: string; en: string };
  fmPa?: number;
  fmCa?: number;
  fmPotentialGap?: number;
  fbrefGoals?: string | number;
  fbrefAssists?: string | number;
  fbrefGoalsPer90?: number;
  fbrefAssistsPer90?: number;
  fbrefMinutes90s?: string | number;
}

interface WarRoomReport {
  stats?: { strengths?: string[]; weaknesses?: string[]; key_metrics?: string[]; summary?: string };
  market?: { market_position?: string; rationale?: string; comparable_range?: string; contract_leverage?: string; summary?: string };
  tactics?: { best_role?: string; best_system?: string; ligat_haal_fit?: string; club_fit?: string[]; summary?: string };
  synthesis?: {
    executive_summary?: string;
    recommendation?: string;
    recommendation_rationale?: string;
    key_risks?: string[];
    key_opportunities?: string[];
  };
}

type ReportCache = Record<string, WarRoomReport | { error: string }>;

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

function formatTimeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** Derive Transfermarkt portrait URL from profile URL when scout does not return image. */
function getPlayerImageUrl(profileImage: string | undefined, transfermarktUrl: string): string {
  if (profileImage?.trim()) return profileImage.trim();
  const id = extractPlayerIdFromUrl(transfermarktUrl);
  if (id) return `https://img.a.transfermarkt.technology/portrait/medium/${id}.jpg`;
  return 'https://img.a.transfermarkt.technology/portrait/medium/0.jpg';
}

function samePlayer(url1: string, url2: string): boolean {
  const id1 = extractPlayerIdFromUrl(url1);
  const id2 = extractPlayerIdFromUrl(url2);
  return !!id1 && id1 === id2;
}

export default function WarRoomPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang } = useLanguage();
  const router = useRouter();
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [reportCache, setReportCache] = useState<ReportCache>({});
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterTmProfiles, setRosterTmProfiles] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  // War Room main tabs: Discovery | AI Scout Agents
  const [warRoomTab, setWarRoomTab] = useState<'discovery' | 'scout-agents'>('discovery');
  const [scoutProfiles, setScoutProfiles] = useState<ScoutProfileResponse[]>([]);
  const [loadingScoutProfiles, setLoadingScoutProfiles] = useState(false);
  const [scoutLastRunAt, setScoutLastRunAt] = useState<number | null>(null);
  const [scoutAgentFilter, setScoutAgentFilter] = useState<AgentId | 'all'>('all');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Listen to shortlist and roster for status badges
  useEffect(() => {
    if (!user) return;
    const shortlistRef = doc(db, 'Shortlists', SHARED_SHORTLIST_DOC_ID);
    const shortlistUnsub = onSnapshot(shortlistRef, (snap) => {
      const entries = (snap.data()?.entries as { tmProfileUrl?: string }[]) || [];
      setShortlistUrls(new Set(entries.map((e) => e.tmProfileUrl).filter((u): u is string => !!u)));
    });
    const rosterUnsub = onSnapshot(collection(db, 'Players'), (snap) => {
      const urls = snap.docs
        .map((d) => (d.data().tmProfile as string)?.trim())
        .filter((u): u is string => !!u);
      setRosterTmProfiles(new Set(urls));
    });
    return () => {
      shortlistUnsub();
      rosterUnsub();
    };
  }, [user]);

  useEffect(() => {
    if (addError) {
      const id = setTimeout(() => setAddError(null), 4000);
      return () => clearTimeout(id);
    }
  }, [addError]);

  const addToShortlist = useCallback(
    async (c: DiscoveryCandidate) => {
      if (!user || !c.transfermarktUrl) return;
      const url = c.transfermarktUrl;
      if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) {
        setAddError(lang === 'he' ? 'השחקן כבר במאגר' : 'Player already in roster');
        return;
      }
      setAddingUrl(url);
      setAddError(null);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const docRef = doc(db, 'Shortlists', SHARED_SHORTLIST_DOC_ID);
        const snap = await getDoc(docRef);
        const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
        const exists = current.some((e) => samePlayer((e.tmProfileUrl as string) || '', url));
        if (exists) return;
        const entry: Record<string, unknown> = {
          tmProfileUrl: url,
          addedAt: Date.now(),
          playerImage: c.profileImage ?? null,
          playerName: c.name ?? null,
          playerPosition: c.position ?? null,
          playerAge: c.age ?? null,
          playerNationality: c.nationality ?? null,
          clubJoinedName: c.club ?? null,
          marketValue: c.marketValue ?? null,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
        };
        await setDoc(docRef, { entries: [...current, entry] }, { merge: true });
        await addDoc(collection(db, 'FeedEvents'), {
          type: 'SHORTLIST_ADDED',
          playerName: entry.playerName ?? null,
          playerImage: entry.playerImage ?? null,
          playerTmProfile: url,
          timestamp: Date.now(),
          agentName: account.name ?? null,
        });
      } catch (err) {
        setAddError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setAddingUrl(null);
      }
    },
    [user, rosterTmProfiles, lang]
  );

  const addToShortlistFromProfile = useCallback(
    async (p: ScoutProfileResponse) => {
      const c: DiscoveryCandidate = {
        name: p.playerName,
        position: p.position,
        age: String(p.age),
        marketValue: p.marketValue,
        transfermarktUrl: p.tmProfileUrl,
        club: p.club,
        nationality: p.nationality ?? undefined,
        profileImage: p.profileImage ?? undefined,
        source: 'general',
        sourceLabel: 'AI Scout',
      };
      return addToShortlist(c);
    },
    [addToShortlist]
  );

  const fetchScoutProfiles = useCallback(async () => {
    setLoadingScoutProfiles(true);
    try {
      const params = new URLSearchParams();
      if (scoutAgentFilter !== 'all') params.set('agentId', scoutAgentFilter);
      const res = await fetch(`/api/war-room/scout-profiles?${params.toString()}`, {
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setScoutProfiles(data.profiles ?? []);
      setScoutLastRunAt(data.lastRunAt ?? null);
    } catch (err) {
      setScoutProfiles([]);
      setScoutLastRunAt(null);
    } finally {
      setLoadingScoutProfiles(false);
    }
  }, [scoutAgentFilter]);

  useEffect(() => {
    if (user && warRoomTab === 'scout-agents') fetchScoutProfiles();
  }, [user, warRoomTab, scoutAgentFilter, fetchScoutProfiles]);

  const fetchDiscovery = useCallback(async () => {
    const thisFetchId = ++fetchIdRef.current;
    setLoadingDiscovery(true);
    setError(null);
    try {
      const res = await fetch('/api/war-room/discovery', {
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json();
      if (thisFetchId !== fetchIdRef.current) return;
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCandidates(data.candidates ?? []);
      setUpdatedAt(data.updatedAt ?? Date.now());
    } catch (err) {
      if (thisFetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Discovery failed');
      setCandidates([]);
    } finally {
      if (thisFetchId === fetchIdRef.current) setLoadingDiscovery(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchDiscovery();
  }, [user, fetchDiscovery]);

  const fetchReport = useCallback(async (playerUrl: string) => {
    if (reportCache[playerUrl]) return;
    setLoadingReport(playerUrl);
    try {
      const res = await fetch('/api/war-room/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_url: playerUrl, lang }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Report failed');
      setReportCache((prev) => ({ ...prev, [playerUrl]: data }));
    } catch (err) {
      setReportCache((prev) => ({ ...prev, [playerUrl]: { error: err instanceof Error ? err.message : 'Failed' } }));
    } finally {
      setLoadingReport(null);
    }
  }, [lang, reportCache]);

  const handleExpand = useCallback(
    (url: string) => {
      if (expandedUrl === url) {
        setExpandedUrl(null);
        return;
      }
      setExpandedUrl(url);
      fetchReport(url);
    },
    [expandedUrl, fetchReport]
  );

  const filteredCandidates =
    sourceFilter === 'all'
      ? candidates
      : sourceFilter === 'request'
        ? candidates.filter((c) => c.source === 'request_match')
        : sourceFilter === 'hidden_gem'
          ? candidates.filter((c) => c.source === 'hidden_gem')
          : candidates;

  const isHe = lang === 'he';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="relative max-w-[52rem] mx-auto">
        {/* Hero gradient */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden -top-20 -left-20"
          aria-hidden
        >
          <div
            className="w-[80%] h-[80%] opacity-100"
            style={{
              background: 'radial-gradient(ellipse, rgba(168, 85, 247, 0.08) 0%, transparent 70%)',
            }}
          />
        </div>

        <div className="relative">
          <h1 className="text-3xl md:text-4xl font-display font-extrabold text-mgsr-text tracking-tight">
            {t('nav_war_room')}
          </h1>

          {/* War Room main tabs: Discovery | AI Scout Agents */}
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-mgsr-card border border-mgsr-border mt-4 mb-4">
            <button
              onClick={() => setWarRoomTab('discovery')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                warRoomTab === 'discovery'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark border border-transparent'
              }`}
            >
              {isHe ? 'גילוי' : 'Discovery'}
            </button>
            <button
              onClick={() => setWarRoomTab('scout-agents')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                warRoomTab === 'scout-agents'
                  ? 'bg-mgsr-teal/20 text-mgsr-teal border border-mgsr-teal/40'
                  : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark border border-transparent'
              }`}
            >
              {isHe ? 'סוכני AI Scout' : 'AI Scout Agents'}
            </button>
          </div>

          {warRoomTab === 'discovery' && (
            <>
          <p className="text-sm md:text-base text-mgsr-muted mt-1">
            {isHe
              ? 'פיד גילוי מבוסס AI. רק שחקנים ריאליסטיים לליגת העל — שווי €0–€2.5m.'
              : "AI-curated discovery feed. Only players realistic for Ligat Ha'Al — value €0–€2.5m."}
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-4">
            {updatedAt && (
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-teal/15 text-mgsr-teal border border-mgsr-teal/30">
                {isHe ? 'עודכן' : 'Updated'} {formatTimeAgo(updatedAt)}
              </span>
            )}
            <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-teal/15 text-mgsr-teal border border-mgsr-teal/30">
              {candidates.length} {isHe ? 'שחקנים' : 'players'}
            </span>
            <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">
              {isHe ? 'מסנן ליגת העל: פעיל' : 'Ligat Ha\'Al filter: on'}
            </span>
            <button
              onClick={fetchDiscovery}
              disabled={loadingDiscovery}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-mgsr-border text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition disabled:opacity-50"
            >
              {loadingDiscovery ? (isHe ? 'מרענן...' : 'Refreshing...') : isHe ? 'רענן גילוי' : 'Refresh discovery'}
            </button>
          </div>

          <p className="text-xs text-mgsr-muted mt-3 px-3 py-2 rounded-lg bg-mgsr-card/50 border border-mgsr-border/50">
            <strong className="text-mgsr-text">{isHe ? 'מסנן רלוונטיות:' : 'Relevance filter:'}</strong>{' '}
            {isHe
              ? "שווי נוכחי €0–€2.5m, דמי העברה אחרונים ≤€2.5m, ליגות נגישות. ללא כוכבים שנקנו ביוקר."
              : 'Current value €0–€2.5m, last transfer fee ≤€2.5m, reachable leagues. Excludes players bought for big money.'}
          </p>

        {/* Source tabs */}
        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-mgsr-card border border-mgsr-border mt-6 mb-6">
          {[
            { key: 'all', label: isHe ? 'הכל' : 'All' },
            { key: 'request', label: isHe ? 'התאמות לבקשות' : 'Request Matches' },
            { key: 'hidden_gem', label: isHe ? 'יהלומים חבויים' : 'Hidden Gems' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSourceFilter(key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                sourceFilter === key
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-card/80 border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <p>{error}</p>
            <button
              onClick={fetchDiscovery}
              className="mt-2 text-sm underline hover:no-underline"
            >
              {isHe ? 'נסה שוב' : 'Try again'}
            </button>
          </div>
        )}

        {/* Add to shortlist error */}
        {addError && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {addError}
          </div>
        )}

        {/* Loading skeleton */}
        {loadingDiscovery && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-mgsr-border bg-mgsr-card p-5 animate-pulse"
              >
                <div className="flex gap-4 items-start">
                  <div className="w-14 h-14 rounded-xl bg-mgsr-border shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="h-5 w-3/4 rounded bg-mgsr-border" />
                    <div className="h-4 w-1/2 rounded bg-mgsr-border" />
                    <div className="h-5 w-20 rounded bg-mgsr-border mt-3" />
                  </div>
                  <div className="w-16 h-6 rounded bg-mgsr-border shrink-0" />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-center gap-2 py-4 text-mgsr-muted text-sm">
              <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <span>{isHe ? 'מחפש שחקנים ריאליסטיים לליגת העל...' : 'Finding players realistic for Ligat Ha\'Al...'}</span>
            </div>
          </div>
        )}

        {/* Discovery feed — empty (no candidates at all) */}
        {!loadingDiscovery && candidates.length === 0 && !error && (
          <div className="py-16 text-center rounded-2xl bg-mgsr-card border border-mgsr-border">
            <p className="text-mgsr-muted">
              {isHe
                ? 'לא נמצאו שחקנים. נסה לרענן או הוסף בקשות מועדונים.'
                : 'No players found. Try refreshing or add club requests.'}
            </p>
          </div>
        )}

        {/* Discovery feed — filtered tab has no results */}
        {!loadingDiscovery && candidates.length > 0 && filteredCandidates.length === 0 && !error && (
          <div className="py-12 text-center rounded-2xl bg-mgsr-card border border-mgsr-border">
            <p className="text-mgsr-muted">
              {sourceFilter === 'request'
                ? (isHe ? 'אין התאמות לבקשות כרגע. נסה "הכל" או הוסף בקשות.' : 'No request matches right now. Try "All" or add club requests.')
                : (isHe ? 'אין יהלומים חבויים כרגע. נסה "הכל".' : 'No hidden gems right now. Try "All".')}
            </p>
          </div>
        )}

        {!loadingDiscovery && filteredCandidates.length > 0 && (
          <div className="space-y-4">
            {filteredCandidates.map((c) => {
              const isExpanded = expandedUrl === c.transfermarktUrl;
              const report = reportCache[c.transfermarktUrl];
              const validReport = report && !('error' in report) ? report : undefined;
              const isLoadingReport = loadingReport === c.transfermarktUrl;
              const rec = validReport?.synthesis?.recommendation?.toUpperCase();
              const inRoster = Array.from(rosterTmProfiles).some((r) => samePlayer(r, c.transfermarktUrl));
              const inShortlist = Array.from(shortlistUrls).some((s) => samePlayer(s, c.transfermarktUrl));
              const isAdding = addingUrl === c.transfermarktUrl;

              return (
                <div
                  key={c.transfermarktUrl}
                  className={`rounded-2xl border transition-all duration-250 cursor-pointer ${
                    isExpanded
                      ? 'border-purple-500/40 bg-mgsr-card shadow-lg shadow-purple-500/5'
                      : 'border-mgsr-border bg-mgsr-card hover:border-purple-500/30 hover:shadow-lg hover:shadow-black/20'
                  }`}
                  onClick={() => handleExpand(c.transfermarktUrl)}
                >
                  <div className="p-5">
                    <div className="flex gap-4 items-start">
                      <img
                        src={getPlayerImageUrl(c.profileImage, c.transfermarktUrl)}
                        alt=""
                        className="w-14 h-14 rounded-xl object-cover bg-mgsr-border shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://img.a.transfermarkt.technology/portrait/medium/0.jpg';
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-bold text-lg text-mgsr-text truncate">{c.name}</p>
                        <p className="text-sm text-mgsr-muted mt-0.5">
                          {c.age}
                          <span className="mx-1.5">·</span>
                          {shortenPosition(c.position)}
                          <span className="mx-1.5">·</span>
                          {c.marketValue}
                          {c.club && (
                            <>
                              <span className="mx-1.5">·</span>
                              {c.club}
                            </>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              c.source === 'request_match'
                                ? 'bg-mgsr-teal/20 text-mgsr-teal'
                                : sourceFilter === 'hidden_gem' && c.source === 'hidden_gem'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-purple-500/20 text-purple-400'
                            }`}
                            title={sourceFilter === 'all' && c.source !== 'request_match' ? (isHe ? 'שחקן שנמצא בחיפוש כללי' : 'Player found in general discovery') : undefined}
                          >
                            {sourceFilter === 'all'
                              ? c.source === 'request_match'
                                ? c.sourceLabel
                                : (isHe ? 'גילוי' : 'Discovery')
                              : c.source === 'request_match'
                                ? c.sourceLabel
                                : c.source === 'hidden_gem'
                                  ? (isHe ? `יהלום חבוי ${c.sourceLabel.replace('Hidden Gem ', '')}` : c.sourceLabel)
                                  : (isHe ? 'גילוי' : 'Discovery')}
                          </span>
                          {sourceFilter === 'hidden_gem' && c.hiddenGemScore != null && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/30 text-amber-300 border border-amber-500/40">
                              ★ {c.hiddenGemScore}
                            </span>
                          )}
                          {inRoster && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-mgsr-teal/25 text-mgsr-teal border border-mgsr-teal/40">
                              {isHe ? 'במאגר' : 'In roster'}
                            </span>
                          )}
                          {inShortlist && !inRoster && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/25 text-blue-400 border border-blue-500/40">
                              {isHe ? 'ברשימת מעקב' : 'In shortlist'}
                            </span>
                          )}
                        </div>
                        {((c.fbrefGoalsPer90 != null && !isNaN(c.fbrefGoalsPer90)) ||
                          (c.fbrefAssistsPer90 != null && !isNaN(c.fbrefAssistsPer90)) ||
                          (c.fmPa != null || c.fmCa != null)) && (
                          <p className="text-xs text-mgsr-muted mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                            {(c.fbrefGoalsPer90 != null && !isNaN(c.fbrefGoalsPer90)) ||
                            (c.fbrefAssistsPer90 != null && !isNaN(c.fbrefAssistsPer90)) ? (
                              <span>
                                FBref: G/90 {((c.fbrefGoalsPer90 ?? 0) as number).toFixed(2)}
                                {(c.fbrefAssistsPer90 != null && !isNaN(c.fbrefAssistsPer90)) && (
                                  <> · A/90 {(c.fbrefAssistsPer90 as number).toFixed(2)}</>
                                )}
                              </span>
                            ) : null}
                            {(c.fmPa != null || c.fmCa != null) && (
                              <span>
                                FM: CA {c.fmCa ?? '?'} · PA {c.fmPa ?? '?'}
                                {c.fmPotentialGap != null && c.fmPotentialGap > 0 && (
                                  <> (+{c.fmPotentialGap})</>
                                )}
                              </span>
                            )}
                          </p>
                        )}
                        {sourceFilter === 'hidden_gem' && c.hiddenGemReason && (
                          <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-start">
                            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
                              {isHe ? 'למה יהלום חבוי?' : 'Why hidden gem?'}
                            </p>
                            <p className="text-sm text-mgsr-text leading-relaxed">
                              {isHe ? c.hiddenGemReason.he : c.hiddenGemReason.en}
                            </p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={c.transfermarktUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-border text-mgsr-muted hover:bg-mgsr-teal/20 hover:text-mgsr-teal border border-mgsr-border transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            {isHe ? 'Transfermarkt' : 'Transfermarkt'}
                          </a>
                          {!inRoster && (
                            <button
                              onClick={() => addToShortlist(c)}
                              disabled={isAdding || inShortlist}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 border border-mgsr-teal/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isAdding ? (
                                <>
                                  <div className="w-3 h-3 border-2 border-mgsr-teal/50 border-t-mgsr-teal rounded-full animate-spin" />
                                  {isHe ? 'מוסיף...' : 'Adding...'}
                                </>
                              ) : inShortlist ? (
                                <>{isHe ? 'ברשימת מעקב' : 'In shortlist'}</>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                  {isHe ? 'הוסף לרשימת מעקב' : 'Add to shortlist'}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {validReport?.synthesis?.recommendation ? (
                          <span
                            className={`inline-flex px-3 py-1.5 rounded-lg text-sm font-bold ${
                              rec === 'SIGN'
                                ? 'bg-green-500/20 text-green-400'
                                : rec === 'MONITOR'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {rec === 'SIGN' ? t('rec_sign') : rec === 'MONITOR' ? t('rec_monitor') : rec === 'PASS' ? t('rec_pass') : validReport.synthesis.recommendation}
                          </span>
                        ) : (
                          <span className="text-mgsr-muted text-xs">{isHe ? 'לחץ לדוח' : 'Tap for report'}</span>
                        )}
                        <svg
                          className={`w-5 h-5 text-mgsr-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {/* Expanded report */}
                    {isExpanded && (
                      <div className="mt-5 pt-5 border-t border-mgsr-border">
                        {isLoadingReport && (
                          <div className="flex items-center gap-2 text-mgsr-muted py-4">
                            <div className="w-5 h-5 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                            <span>{isHe ? 'מייצר דוח...' : 'Generating report...'}</span>
                          </div>
                        )}
                        {validReport && (
                          <div className="space-y-4">
                            {validReport.synthesis && (
                              <div className="p-4 rounded-xl bg-purple-500/20 border border-purple-500/30">
                                <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2">
                                  {isHe ? 'סיכום' : 'Synthesis'}
                                </h4>
                                <p className="text-sm text-mgsr-text leading-relaxed">
                                  {validReport.synthesis.executive_summary}
                                </p>
                                {validReport.synthesis.key_risks?.length ? (
                                  <p className="text-xs text-mgsr-muted mt-2">
                                    {isHe ? 'סיכונים:' : 'Risks:'} {validReport.synthesis.key_risks.join('; ')}
                                  </p>
                                ) : null}
                                {validReport.synthesis.key_opportunities?.length ? (
                                  <p className="text-xs text-mgsr-muted mt-1">
                                    {isHe ? 'הזדמנויות:' : 'Opportunities:'} {validReport.synthesis.key_opportunities.join('; ')}
                                  </p>
                                ) : null}
                              </div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              {validReport.stats?.summary && (
                                <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                  <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">
                                    {isHe ? 'סטטיסטיקות' : 'Stats'}
                                  </h5>
                                  <p className="text-xs text-mgsr-text">{validReport.stats.summary}</p>
                                </div>
                              )}
                              {validReport.market?.summary && (
                                <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                  <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">
                                    {isHe ? 'שוק' : 'Market'}
                                  </h5>
                                  <p className="text-xs text-mgsr-text">{validReport.market.summary}</p>
                                </div>
                              )}
                              {validReport.tactics?.summary && (
                                <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                  <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">
                                    {isHe ? 'טקטיקה' : 'Tactics'}
                                  </h5>
                                  <p className="text-xs text-mgsr-text">{validReport.tactics.summary}</p>
                                </div>
                              )}
                            </div>
                            {c.transfermarktUrl && (
                              <a
                                href={c.transfermarktUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block text-sm text-mgsr-teal hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isHe ? 'צפה ב-Transfermarkt' : 'View on Transfermarkt'} →
                              </a>
                            )}
                          </div>
                        )}
                        {report && 'error' in report && (
                          <p className="text-red-400 text-sm">{report.error}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
            </>
          )}

          {warRoomTab === 'scout-agents' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-mgsr-teal/10 border border-mgsr-teal/25 border-l-4 border-l-mgsr-teal">
                <h2 className="font-display font-bold text-mgsr-text mb-1">
                  {isHe ? 'רשת סוכני AI Scout' : 'AI Scout Agent Network'}
                </h2>
                <p className="text-sm text-mgsr-muted">
                  {isHe ? (
                    <>
                      <strong className="text-mgsr-teal">מאיפה הפרופילים?</strong> כל פרופיל נמצא על ידי סוכן שמנטר מדינה וליגותיה (Firebase/Cloud). המקור מוצג בבירור.
                    </>
                  ) : (
                    <>
                      <strong className="text-mgsr-teal">Where do these profiles come from?</strong> Each profile was found by an AI scout agent that monitors a specific country and its leagues (Firebase/Cloud). Source is shown clearly.
                    </>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {scoutLastRunAt && (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-mgsr-teal/15 text-mgsr-teal">
                      {isHe ? 'הרצה אחרונה' : 'Last run'} {formatTimeAgo(scoutLastRunAt)}
                    </span>
                  )}
                  <span className="px-2 py-1 rounded text-xs font-medium bg-mgsr-teal/15 text-mgsr-teal">
                    {scoutProfiles.length} {isHe ? 'פרופילים' : 'profiles'}
                  </span>
                  <button
                    onClick={fetchScoutProfiles}
                    disabled={loadingScoutProfiles}
                    className="px-2 py-1 rounded text-xs font-medium border border-mgsr-border text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition disabled:opacity-50"
                  >
                    {loadingScoutProfiles ? (isHe ? 'מרענן...' : 'Refreshing...') : isHe ? 'רענן' : 'Refresh'}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-mgsr-card border border-mgsr-border">
                <button
                  onClick={() => setScoutAgentFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    scoutAgentFilter === 'all'
                      ? 'bg-mgsr-teal/20 text-mgsr-teal border border-mgsr-teal/40'
                      : 'text-mgsr-muted hover:text-mgsr-text border border-transparent'
                  }`}
                >
                  {isHe ? 'כל הסוכנים' : 'All agents'}
                </button>
                {(Object.keys(AGENTS_CONFIG) as AgentId[]).map((aid) => (
                  <button
                    key={aid}
                    onClick={() => setScoutAgentFilter(aid)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                      scoutAgentFilter === aid
                        ? 'bg-mgsr-teal/20 text-mgsr-teal border border-mgsr-teal/40'
                        : 'text-mgsr-muted hover:text-mgsr-text border border-transparent'
                    }`}
                  >
                    <span>{AGENTS_CONFIG[aid].flag}</span>
                    <span>{isHe ? AGENTS_CONFIG[aid].nameHe : AGENTS_CONFIG[aid].name}</span>
                  </button>
                ))}
              </div>

              {addError && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  {addError}
                </div>
              )}

              {loadingScoutProfiles && (
                <div className="flex items-center justify-center gap-2 py-12 text-mgsr-muted">
                  <div className="w-5 h-5 border-2 border-mgsr-teal/30 border-t-mgsr-teal rounded-full animate-spin" />
                  <span>{isHe ? 'טוען פרופילי סוכנים...' : 'Loading scout profiles...'}</span>
                </div>
              )}

              {!loadingScoutProfiles && scoutProfiles.length === 0 && (
                <div className="py-16 text-center rounded-2xl bg-mgsr-card border border-mgsr-border">
                  <p className="text-mgsr-muted">
                    {isHe
                      ? 'אין פרופילים עדיין. הסוכנים רצים מדי יום ב-05:00.'
                      : 'No profiles yet. Agents run daily at 05:00 Israel time.'}
                  </p>
                </div>
              )}

              {!loadingScoutProfiles && scoutProfiles.length > 0 && (
                <div className="space-y-4">
                  {Object.entries(
                    scoutProfiles.reduce<Record<string, ScoutProfileResponse[]>>((acc, p) => {
                      if (scoutAgentFilter !== 'all' && p.agentId !== scoutAgentFilter) return acc;
                      (acc[p.agentId] = acc[p.agentId] || []).push(p);
                      return acc;
                    }, {})
                  ).map(([agentId, profiles]) => {
                    const cfg = AGENTS_CONFIG[agentId as AgentId];
                    return (
                      <section
                        key={agentId}
                        className="rounded-xl border border-mgsr-border bg-mgsr-card overflow-hidden"
                      >
                        <div className="flex items-center gap-2 px-4 py-3 bg-mgsr-teal/10 border-b border-mgsr-border">
                          <span className="text-xl">{cfg?.flag || '🌍'}</span>
                          <h3 className="font-display font-bold text-mgsr-text">
                            {isHe ? cfg?.nameHe : cfg?.name} Agent
                          </h3>
                          <span className="text-xs text-mgsr-muted ml-auto">
                            <strong className="text-mgsr-teal">{profiles.length}</strong> {isHe ? 'פרופילים' : 'profiles'}
                          </span>
                        </div>
                        <div className="p-3 space-y-2">
                          {profiles.map((p) => {
                            const inRoster = Array.from(rosterTmProfiles).some((r) => samePlayer(r, p.tmProfileUrl));
                            const inShortlist = Array.from(shortlistUrls).some((s) => samePlayer(s, p.tmProfileUrl));
                            const isAdding = addingUrl === p.tmProfileUrl;
                            return (
                              <div
                                key={p.id}
                                className="flex gap-3 p-3 rounded-lg bg-mgsr-dark border border-mgsr-border hover:border-mgsr-teal/40 transition"
                              >
                                <img
                                  src={getPlayerImageUrl(p.profileImage ?? undefined, p.tmProfileUrl)}
                                  alt=""
                                  className="w-12 h-12 rounded-lg object-cover bg-mgsr-border shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://img.a.transfermarkt.technology/portrait/medium/0.jpg';
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-mgsr-teal/25 text-mgsr-teal border border-mgsr-teal/40 mb-1">
                                    <span>{p.agentFlag}</span>
                                    <span>{isHe ? 'נמצא על ידי' : 'Found by'} {p.agentName} Agent</span>
                                    {p.league && <span>· {p.league}</span>}
                                  </div>
                                  <p className="font-display font-bold text-mgsr-text">{p.playerName}</p>
                                  <p className="text-xs text-mgsr-muted">
                                    {p.age} · {shortenPosition(p.position)} · {p.marketValue}
                                    {p.club && ` · ${p.club}`}
                                  </p>
                                  <p className="text-xs text-mgsr-text mt-1">
                                    {(isHe ? p.scoutExplanationHe : p.scoutExplanationEn) || p.matchReason}
                                  </p>
                                  <div className="flex flex-wrap gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                                    <a
                                      href={p.tmProfileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-mgsr-border text-mgsr-muted hover:text-mgsr-teal border border-mgsr-border transition"
                                    >
                                      Transfermarkt →
                                    </a>
                                    {!inRoster && (
                                      <button
                                        onClick={() => addToShortlistFromProfile(p)}
                                        disabled={isAdding || inShortlist}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 border border-mgsr-teal/40 transition disabled:opacity-50"
                                      >
                                        {isAdding ? (isHe ? 'מוסיף...' : 'Adding...') : inShortlist ? (isHe ? 'ברשימת מעקב' : 'In shortlist') : (isHe ? 'הוסף לרשימת מעקב' : 'Add to shortlist')}
                                      </button>
                                    )}
                                    {inRoster && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-mgsr-teal/25 text-mgsr-teal">
                                        {isHe ? 'במאגר' : 'In roster'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-purple-500/20 text-purple-400 shrink-0 h-fit">
                                  {isHe ? p.profileTypeLabelHe : p.profileTypeLabel}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
