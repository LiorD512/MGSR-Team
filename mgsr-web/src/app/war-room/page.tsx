'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, onSnapshot, getDoc, setDoc, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { extractPlayerIdFromUrl, getPlayerDetails } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import { AGENTS_CONFIG, type AgentId } from '@/lib/scoutAgentConfig';
import type { ScoutProfileResponse } from '@/types/scoutProfiles';
import { aiScoutSearch, type ScoutPlayerSuggestion } from '@/lib/scoutApi';
import FindNextTab from '@/components/FindNextTab';

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
  sourceAgentId?: string;
  sourceProfileId?: string;
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

/* ── Structured explanation parser ──────────────────────────── */
interface ExplanationSections {
  stats: string[];
  physical: string[];
  strengths: string[];
  fmAttrs: string[];
  insights: string[];
}

function parseExplanationSections(text: string): ExplanationSections {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const sec: ExplanationSections = { stats: [], physical: [], strengths: [], fmAttrs: [], insights: [] };

  for (const line of lines) {
    // Skip bio / overview line (redundant with card header)
    if (/^(Age\s|גיל\s)/i.test(line)) continue;

    // Strengths line (he: חוזקות, en: Strengths)
    if (/^(Strengths:|חוזקות:)/i.test(line)) {
      const content = line.replace(/^(Strengths:|חוזקות:)\s*/i, '');
      sec.strengths = content.split('|').map(s => s.trim()).filter(Boolean);
      continue;
    }

    // FM attributes line
    if (/^FM:/i.test(line)) {
      const content = line.replace(/^FM:\s*/i, '');
      // Strip (CA X ← PA Y) or (CA X → PA Y) since badge shows it
      const cleaned = content.replace(/\(CA\s*\d+\s*[←→➝]\s*PA\s*\d+\s*\)/g, '').trim();
      sec.fmAttrs = cleaned.split('|').map(s => s.trim()).filter(Boolean);
      continue;
    }

    // Stats line: has "key: number" pairs separated by |
    if (/\w+:\s*[\d.,]+/.test(line) && line.includes('|')) {
      const items = line.split('|').map(s => s.trim()).filter(Boolean);
      for (const item of items) {
        if (/height|גובה|foot|רגל/i.test(item)) {
          sec.physical.push(item);
        } else {
          sec.stats.push(item);
        }
      }
      continue;
    }

    // Everything else → insights
    const items = line.split('|').map(s => s.trim()).filter(Boolean);
    sec.insights.push(...items);
  }

  return sec;
}

function formatTimeAgo(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** Derive Transfermarkt portrait URL from profile URL when scout does not return image. */
const TM_DEFAULT_IMG = 'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';
function getPlayerImageUrl(profileImage: string | undefined, transfermarktUrl: string): string {
  if (profileImage?.trim()) return profileImage.trim();
  return TM_DEFAULT_IMG;
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

  // War Room main tabs: Discovery | AI Scout Agents | AI Scout Search
  const [warRoomTab, setWarRoomTab] = useState<'discovery' | 'scout-agents' | 'ai-scout' | 'find-next'>('discovery');
  const [scoutProfiles, setScoutProfiles] = useState<ScoutProfileResponse[]>([]);
  const [loadingScoutProfiles, setLoadingScoutProfiles] = useState(false);
  const [scoutLastRunAt, setScoutLastRunAt] = useState<number | null>(null);
  const [scoutAgentFilter, setScoutAgentFilter] = useState<AgentId | 'all'>('all');
  const [scoutFeedback, setScoutFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const [scoutRotationPage, setScoutRotationPage] = useState(0);

  // AI Scout Search state
  const [scoutQuery, setScoutQuery] = useState('');
  const [scoutResults, setScoutResults] = useState<ScoutPlayerSuggestion[]>([]);
  const [scoutInterpretation, setScoutInterpretation] = useState<string | null>(null);
  const [scoutSearching, setScoutSearching] = useState(false);
  const [scoutError, setScoutError] = useState<string | null>(null);
  const [scoutExpandedUrl, setScoutExpandedUrl] = useState<string | null>(null);
  const [addingScoutUrl, setAddingScoutUrl] = useState<string | null>(null);
  const [scoutSeenUrls, setScoutSeenUrls] = useState<string[]>([]);
  const [scoutSearchingOther, setScoutSearchingOther] = useState(false);

  const SCOUT_EXAMPLES_EN = [
    'Fast strikers under 24 with 5+ goals for Israeli market',
    'Creative midfielders from Belgium or Portugal under 26',
    'Left-footed center backs from Eastern Europe',
    'Free agent wingers with pace and dribbling ability',
  ];
  const SCOUT_EXAMPLES_HE = [
    'חלוצים מהירים עד גיל 24 עם 5+ שערים לשוק הישראלי',
    'קשרים יצירתיים מבלגיה או פורטוגל עד גיל 26',
    'בלמים שמאליים ממזרח אירופה',
    'כנפים חופשיים עם מהירות ודריבל',
  ];

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Warm scout server when entering AI Scout tab
  useEffect(() => {
    if (user && warRoomTab === 'ai-scout') {
      fetch('/api/scout/warm').catch(() => {});
    }
  }, [user, warRoomTab]);

  // Listen to shortlist and roster for status badges
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
    return () => {
      shortlistUnsub();
      rosterUnsub();
    };
  }, [user]);

  // Listen to scout profile feedback (thumbs up/down)
  useEffect(() => {
    if (!user || warRoomTab !== 'scout-agents') return;
    const feedbackRef = doc(db, 'ScoutProfileFeedback', user.uid);
    const unsub = onSnapshot(feedbackRef, (snap) => {
      const data = snap.data();
      const fb = (data?.feedback as Record<string, 'up' | 'down' | { feedback: 'up' | 'down'; agentId: string }>) || {};
      const flat: Record<string, 'up' | 'down'> = {};
      for (const [k, v] of Object.entries(fb)) {
        flat[k] = typeof v === 'object' && v?.feedback ? v.feedback : (v as 'up' | 'down');
      }
      setScoutFeedback(flat);
    });
    return () => unsub();
  }, [user, warRoomTab]);

  const setProfileFeedback = useCallback(
    async (profileId: string, feedback: 'up' | 'down', agentId: string) => {
      if (!user) return;
      const feedbackRef = doc(db, 'ScoutProfileFeedback', user.uid);
      const snap = await getDoc(feedbackRef);
      const current = (snap.data()?.feedback as Record<string, 'up' | 'down' | { feedback: 'up' | 'down'; agentId: string }>) || {};
      const next = { ...current, [profileId]: { feedback, agentId } };
      await setDoc(feedbackRef, { feedback: next, updatedAt: Date.now() }, { merge: true });
      setScoutFeedback((prev) => ({ ...prev, [profileId]: feedback }));
    },
    [user]
  );

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
        const colRef = collection(db, 'Shortlists');
        const q = query(colRef, where('tmProfileUrl', '==', url));
        const existsSnap = await getDocs(q);
        if (!existsSnap.empty) return;
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
          ...(c.sourceAgentId && { sourceAgentId: c.sourceAgentId }),
          ...(c.sourceProfileId && { sourceProfileId: c.sourceProfileId }),
        };
        await addDoc(colRef, entry);
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
        sourceAgentId: p.agentId,
        sourceProfileId: p.id,
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

  // AI Scout search expand (uses same report cache)
  const handleScoutExpand = useCallback(
    (url: string) => {
      if (scoutExpandedUrl === url) {
        setScoutExpandedUrl(null);
        return;
      }
      setScoutExpandedUrl(url);
      fetchReport(url);
    },
    [scoutExpandedUrl, fetchReport]
  );

  // AI Scout search handler
  const handleScoutSearch = useCallback(async () => {
    const q = scoutQuery.trim();
    if (!q) return;
    setScoutSearching(true);
    setScoutError(null);
    setScoutResults([]);
    setScoutInterpretation(null);
    setScoutSeenUrls([]);
    try {
      const data = await aiScoutSearch(q, lang as 'en' | 'he', true, false);
      setScoutResults(data.players);
      setScoutInterpretation(data.interpretation ?? null);
      const urls = data.players.map((p) => p.transfermarktUrl).filter((u): u is string => !!u);
      setScoutSeenUrls(urls);
    } catch (err) {
      setScoutError(err instanceof Error ? err.message : String(err));
      setScoutResults([]);
    } finally {
      setScoutSearching(false);
    }
  }, [scoutQuery, lang]);

  const handleScoutSearchOther = useCallback(async () => {
    const q = scoutQuery.trim();
    if (!q || scoutSearchingOther) return;
    setScoutSearchingOther(true);
    setScoutError(null);
    try {
      const data = await aiScoutSearch(q, lang as 'en' | 'he', false, false, scoutSeenUrls);
      setScoutResults(data.players);
      setScoutInterpretation(data.interpretation ?? null);
      const newUrls = data.players.map((p) => p.transfermarktUrl).filter((u): u is string => !!u);
      setScoutSeenUrls((prev) => [...prev, ...newUrls.filter((u) => !prev.includes(u))]);
    } catch (err) {
      setScoutError(err instanceof Error ? err.message : String(err));
    } finally {
      setScoutSearchingOther(false);
    }
  }, [scoutQuery, lang, scoutSearchingOther, scoutSeenUrls]);

  const handleScoutKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleScoutSearch();
    }
  }, [handleScoutSearch]);

  // Add to shortlist from AI Scout result
  const addScoutResultToShortlist = useCallback(
    async (s: ScoutPlayerSuggestion) => {
      const url = s.transfermarktUrl;
      if (!user || !url) return;
      if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) {
        setAddError(lang === 'he' ? 'השחקן כבר במאגר' : 'Player already in roster');
        return;
      }
      setAddingScoutUrl(url);
      setAddError(null);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const colRef = collection(db, 'Shortlists');
        const q = query(colRef, where('tmProfileUrl', '==', url));
        const existsSnap = await getDocs(q);
        if (!existsSnap.empty) return;
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
            playerName: s.name ?? null,
            playerPosition: s.position ?? null,
            playerAge: s.age ?? null,
            playerNationality: s.nationality ?? null,
            clubJoinedName: s.club ?? null,
            marketValue: s.marketValue ?? null,
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
      } catch (err) {
        setAddError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setAddingScoutUrl(null);
      }
    },
    [user, rosterTmProfiles, lang]
  );

  const filteredCandidates = (
    sourceFilter === 'all'
      ? candidates
      : sourceFilter === 'request'
        ? candidates.filter((c) => c.source === 'request_match')
        : sourceFilter === 'hidden_gem'
          ? candidates.filter((c) => c.source === 'hidden_gem')
          : candidates
  ).filter((c) => {
    const url = c.transfermarktUrl;
    if (!url) return true;
    if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
    if (Array.from(shortlistUrls).some((s) => samePlayer(s, url))) return false;
    return true;
  });

  const isHe = lang === 'he';

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex flex-col items-center justify-center gap-4">
        <div className="war-orbital">
          <div className="ring ring-1" />
          <div className="ring ring-2" />
          <div className="ring ring-3" />
          <div className="core" />
        </div>
        <span className="text-sm text-purple-400 font-medium">{t('loading')}</span>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="relative max-w-[52rem] mx-auto">
        {/* Hero gradient — multi-layered command center glow */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden -top-20 -left-20"
          aria-hidden
        >
          <div
            className="w-[80%] h-[60%] opacity-100"
            style={{
              background: 'radial-gradient(ellipse at 30% 20%, rgba(168, 85, 247, 0.1) 0%, transparent 60%)',
            }}
          />
          <div
            className="absolute top-10 right-0 w-[50%] h-[40%] opacity-100"
            style={{
              background: 'radial-gradient(ellipse at 70% 30%, rgba(99, 102, 241, 0.06) 0%, transparent 50%)',
            }}
          />
        </div>

        <div className="relative">
          {/* War Room Header */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="relative">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/25 flex items-center justify-center">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-mgsr-dark war-live-dot" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-extrabold tracking-tight war-gradient-text">
                {t('nav_war_room')}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 war-live-dot" />
                <span className="text-[10px] sm:text-xs font-medium text-mgsr-muted uppercase tracking-wider">
                  {isHe ? 'מערכת פעילה' : 'Systems Active'}
                </span>
              </div>
            </div>
          </div>

          {/* War Room Tabs — premium glassmorphic design with SVG icons */}
          <div className="flex gap-1.5 p-1.5 rounded-2xl bg-mgsr-card/80 backdrop-blur-md border border-mgsr-border/80 mt-5 mb-5 overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {[
              {
                id: 'discovery' as const,
                label: isHe ? 'גילוי' : 'Discovery',
                activeClass: 'bg-gradient-to-r from-purple-500/20 to-indigo-500/15 text-purple-400 border-purple-500/30 shadow-lg shadow-purple-500/5',
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ),
              },
              {
                id: 'scout-agents' as const,
                label: isHe ? 'סוכנים' : 'Agents',
                activeClass: 'bg-gradient-to-r from-mgsr-teal/20 to-emerald-500/15 text-mgsr-teal border-mgsr-teal/30 shadow-lg shadow-mgsr-teal/5',
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                  </svg>
                ),
              },
              {
                id: 'ai-scout' as const,
                label: isHe ? 'AI חיפוש' : 'AI Search',
                activeClass: 'bg-gradient-to-r from-cyan-500/20 to-blue-500/15 text-cyan-400 border-cyan-500/30 shadow-lg shadow-cyan-500/5',
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                ),
              },
              {
                id: 'find-next' as const,
                label: isHe ? 'מצא את הכוכב הבא' : 'Find Next',
                activeClass: 'bg-gradient-to-r from-amber-500/20 to-orange-500/15 text-amber-400 border-amber-500/30 shadow-lg shadow-amber-500/5',
                icon: (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                ),
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setWarRoomTab(tab.id)}
                className={`shrink-0 flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 whitespace-nowrap min-h-[44px] border ${
                  warRoomTab === tab.id
                    ? `${tab.activeClass} war-tab-indicator`
                    : 'text-mgsr-muted hover:text-mgsr-text hover:bg-mgsr-dark/60 border-transparent'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {warRoomTab === 'discovery' && (
            <>
          <p className="text-sm md:text-base text-mgsr-muted mt-1">
            {isHe
              ? 'פיד גילוי מבוסס AI. רק שחקנים ריאליסטיים לליגת העל — שווי €0–€2.5m.'
              : "AI-curated discovery feed. Only players realistic for Ligat Ha'Al — value €0–€2.5m."}
          </p>

          <div className="flex gap-2 mt-4 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {updatedAt && (
              <span className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-teal/15 text-mgsr-teal border border-mgsr-teal/30 whitespace-nowrap">
                {isHe ? 'עודכן' : 'Updated'} {formatTimeAgo(updatedAt)}
              </span>
            )}
            <span className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-teal/15 text-mgsr-teal border border-mgsr-teal/30 whitespace-nowrap">
              {candidates.length} {isHe ? 'שחקנים' : 'players'}
            </span>
            <span className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30 whitespace-nowrap">
              {isHe ? 'מסנן ליגת העל: פעיל' : 'Ligat Ha\'Al filter: on'}
            </span>
            <button
              onClick={fetchDiscovery}
              disabled={loadingDiscovery}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-mgsr-border text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition disabled:opacity-50 whitespace-nowrap min-h-[36px]"
            >
              {loadingDiscovery ? (isHe ? 'מרענן...' : 'Refreshing...') : isHe ? 'רענן גילוי' : 'Refresh discovery'}
            </button>
          </div>

          <p className="text-xs text-mgsr-muted mt-3 px-3 py-2 rounded-lg bg-mgsr-card/50 border border-mgsr-border/50 hidden sm:block">
            <strong className="text-mgsr-text">{isHe ? 'מסנן רלוונטיות:' : 'Relevance filter:'}</strong>{' '}
            {isHe
              ? "שווי נוכחי €0–€2.5m, דמי העברה אחרונים ≤€2.5m, ליגות נגישות. ללא כוכבים שנקנו ביוקר."
              : 'Current value €0–€2.5m, last transfer fee ≤€2.5m, reachable leagues. Excludes players bought for big money.'}
          </p>

        {/* Source tabs */}
        <div className="flex gap-1 p-1.5 rounded-2xl bg-mgsr-card/80 backdrop-blur-md border border-mgsr-border/80 mt-4 sm:mt-6 mb-4 sm:mb-6 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[
            { key: 'all', label: isHe ? 'הכל' : 'All' },
            { key: 'request', label: isHe ? 'התאמות לבקשות' : 'Request Matches' },
            { key: 'hidden_gem', label: isHe ? 'יהלומים חבויים' : 'Hidden Gems' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSourceFilter(key)}
              className={`shrink-0 px-3 sm:px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 whitespace-nowrap min-h-[40px] ${
                sourceFilter === key
                  ? 'bg-gradient-to-r from-purple-500/20 to-indigo-500/15 text-purple-400 border border-purple-500/25 shadow-sm shadow-purple-500/5'
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

        {/* Loading skeleton — premium shimmer */}
        {loadingDiscovery && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`rounded-2xl border border-purple-500/10 bg-mgsr-card p-5 animate-war-card-in war-stagger-${i}`}
              >
                <div className="flex gap-4 items-start">
                  <div className="w-14 h-14 rounded-xl bg-mgsr-border/60 shrink-0 war-shimmer" />
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="h-5 w-3/4 rounded-lg bg-mgsr-border/60 war-shimmer" />
                    <div className="h-4 w-1/2 rounded-lg bg-mgsr-border/40 war-shimmer" style={{ animationDelay: '0.2s' }} />
                    <div className="flex gap-2">
                      <div className="h-5 w-16 rounded-lg bg-purple-500/10 war-shimmer" style={{ animationDelay: '0.4s' }} />
                      <div className="h-5 w-12 rounded-lg bg-mgsr-border/30 war-shimmer" style={{ animationDelay: '0.5s' }} />
                    </div>
                  </div>
                  <div className="w-16 h-8 rounded-lg bg-mgsr-border/40 shrink-0 war-shimmer" />
                </div>
              </div>
            ))}
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <div className="war-orbital">
                <div className="ring ring-1" />
                <div className="ring ring-2" />
                <div className="ring ring-3" />
                <div className="core" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-purple-400 font-medium">{isHe ? 'סורק רשתות מודיעין...' : 'Scanning intelligence networks...'}</span>
                <div className="war-dots"><span className="bg-purple-400" /><span className="bg-purple-400" /><span className="bg-purple-400" /></div>
              </div>
            </div>
          </div>
        )}

        {/* Discovery feed — empty (no candidates at all) */}
        {!loadingDiscovery && candidates.length === 0 && !error && (
          <div className="py-20 text-center rounded-2xl bg-gradient-to-b from-mgsr-card to-mgsr-card/50 border border-mgsr-border/50">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-purple-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <p className="text-mgsr-muted font-medium">
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
            {filteredCandidates.map((c, idx) => {
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
                  className={`rounded-2xl border transition-all duration-300 cursor-pointer animate-war-card-in war-card-glow ${
                    isExpanded
                      ? 'border-purple-500/40 bg-gradient-to-br from-mgsr-card to-purple-950/10 shadow-xl shadow-purple-500/8'
                      : 'border-mgsr-border/70 bg-mgsr-card hover:border-purple-500/30'
                  }`}
                  style={{ animationDelay: `${Math.min(idx, 8) * 60}ms` }}
                  onClick={() => handleExpand(c.transfermarktUrl)}
                >
                  <div className="p-3 sm:p-5">
                    <div className="flex gap-3 sm:gap-4 items-start">
                      <img
                        src={getPlayerImageUrl(c.profileImage, c.transfermarktUrl)}
                        alt=""
                        className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl object-cover bg-mgsr-border shrink-0 ring-2 ring-mgsr-border/50 ring-offset-1 ring-offset-mgsr-card"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = TM_DEFAULT_IMG;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display font-bold text-base sm:text-lg text-mgsr-text truncate">{c.name}</p>
                          <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                            {validReport?.synthesis?.recommendation ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold shadow-sm ${
                                  rec === 'SIGN'
                                    ? 'bg-gradient-to-r from-green-500/25 to-emerald-500/15 text-green-400 border border-green-500/30 shadow-green-500/10'
                                    : rec === 'MONITOR'
                                      ? 'bg-gradient-to-r from-amber-500/25 to-orange-500/15 text-amber-400 border border-amber-500/30 shadow-amber-500/10'
                                      : 'bg-gradient-to-r from-red-500/25 to-rose-500/15 text-red-400 border border-red-500/30 shadow-red-500/10'
                                }`}
                              >
                                {rec === 'SIGN' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                {rec === 'MONITOR' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>}
                                {rec === 'PASS' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>}
                                {rec === 'SIGN' ? t('rec_sign') : rec === 'MONITOR' ? t('rec_monitor') : rec === 'PASS' ? t('rec_pass') : validReport.synthesis.recommendation}
                              </span>
                            ) : (
                              <span className="text-mgsr-muted text-[10px] sm:text-xs hidden sm:inline opacity-60">{isHe ? 'לחץ לדוח' : 'Tap for report'}</span>
                            )}
                            <svg
                              className={`w-4 h-4 sm:w-5 sm:h-5 text-mgsr-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm text-mgsr-muted mt-0.5">
                          {c.age}
                          <span className="mx-1 sm:mx-1.5">·</span>
                          {shortenPosition(c.position)}
                          <span className="mx-1 sm:mx-1.5">·</span>
                          {c.marketValue}
                          {c.club && (
                            <>
                              <span className="mx-1 sm:mx-1.5">·</span>
                              <span className="hidden sm:inline">{c.club}</span>
                              <span className="sm:hidden">{c.club.length > 15 ? c.club.slice(0, 15) + '…' : c.club}</span>
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-border text-mgsr-muted hover:bg-mgsr-teal/20 hover:text-mgsr-teal border border-mgsr-border transition min-h-[36px]"
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
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 border border-mgsr-teal/40 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]"
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
                    </div>

                    {/* Expanded report */}
                    {isExpanded && (
                      <div className="mt-3 sm:mt-5 pt-3 sm:pt-5 border-t border-purple-500/20">
                        {isLoadingReport && (
                          <div className="flex items-center gap-3 text-mgsr-muted py-5">
                            <div className="war-orbital" style={{ width: 32, height: 32 }}>
                              <div className="ring ring-1" />
                              <div className="ring ring-2" />
                              <div className="core" />
                            </div>
                            <div>
                              <span className="text-sm text-purple-400 font-medium">{isHe ? 'מריץ ניתוח מולטי-סוכנים...' : 'Running multi-agent analysis...'}</span>
                              <div className="war-dots mt-1"><span className="bg-purple-400" /><span className="bg-purple-400" /><span className="bg-purple-400" /></div>
                            </div>
                          </div>
                        )}
                        {validReport && (
                          <div className="space-y-4">
                            {validReport.synthesis && (
                              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/15 via-purple-500/10 to-indigo-500/10 border border-purple-500/25 shadow-sm shadow-purple-500/5">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-6 h-6 rounded-lg bg-purple-500/25 flex items-center justify-center">
                                    <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                  </div>
                                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                                    {isHe ? 'סיכום' : 'Synthesis'}
                                  </h4>
                                </div>
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
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                              {validReport.stats?.summary && (
                                <div className="p-3 rounded-xl bg-mgsr-dark/80 border border-mgsr-border/80 hover:border-blue-400/30 transition-colors">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
                                    <h5 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                                      {isHe ? 'סטטיסטיקות' : 'Stats'}
                                    </h5>
                                  </div>
                                  <p className="text-xs text-mgsr-text">{validReport.stats.summary}</p>
                                </div>
                              )}
                              {validReport.market?.summary && (
                                <div className="p-3 rounded-xl bg-mgsr-dark/80 border border-mgsr-border/80 hover:border-emerald-400/30 transition-colors">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                                    <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                      {isHe ? 'שוק' : 'Market'}
                                    </h5>
                                  </div>
                                  <p className="text-xs text-mgsr-text">{validReport.market.summary}</p>
                                </div>
                              )}
                              {validReport.tactics?.summary && (
                                <div className="p-3 rounded-xl bg-mgsr-dark/80 border border-mgsr-border/80 hover:border-amber-400/30 transition-colors">
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" /></svg>
                                    <h5 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                                      {isHe ? 'טקטיקה' : 'Tactics'}
                                    </h5>
                                  </div>
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
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-mgsr-teal/10 via-mgsr-card to-emerald-950/10 border border-mgsr-teal/25 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 opacity-[0.05] pointer-events-none" aria-hidden>
                  <svg viewBox="0 0 200 200" fill="none"><circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="1.5" className="text-mgsr-teal" /><circle cx="100" cy="100" r="50" stroke="currentColor" strokeWidth="0.8" className="text-mgsr-teal" /><circle cx="100" cy="100" r="25" stroke="currentColor" strokeWidth="0.5" className="text-mgsr-teal" /></svg>
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-mgsr-teal/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-mgsr-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                    </div>
                    <h2 className="font-display font-bold text-mgsr-text">
                      {isHe ? 'רשת סוכני AI Scout' : 'AI Scout Agent Network'}
                    </h2>
                  </div>
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
                    onClick={() => setScoutRotationPage((p) => p + 1)}
                    disabled={loadingScoutProfiles}
                    className="px-2 py-1 rounded text-xs font-medium border border-mgsr-border text-mgsr-muted hover:text-mgsr-teal hover:border-mgsr-teal/50 transition disabled:opacity-50"
                  >
                    {loadingScoutProfiles ? (isHe ? 'מרענן...' : 'Refreshing...') : isHe ? 'רענן' : 'Refresh'}
                  </button>
                </div>
                <p className="text-xs text-mgsr-muted/70 mt-2">
                  {isHe
                    ? '💡 כל סוכן מציג 5 פרופילים בכל פעם. לחץ על ״רענן״ כדי לראות 5 פרופילים שונים.'
                    : '💡 Each agent shows 5 profiles at a time. Click "Refresh" to see 5 different ones.'}
                </p>
                </div>
              </div>

              <div className="flex gap-1 p-1.5 rounded-2xl bg-mgsr-card/80 backdrop-blur-md border border-mgsr-border/80 overflow-x-auto" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                <button
                  onClick={() => { setScoutAgentFilter('all'); setScoutRotationPage(0); }}
                  className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[40px] ${
                    scoutAgentFilter === 'all'
                      ? 'bg-gradient-to-r from-mgsr-teal/20 to-emerald-500/15 text-mgsr-teal border border-mgsr-teal/30 shadow-sm shadow-mgsr-teal/5'
                      : 'text-mgsr-muted hover:text-mgsr-text border border-transparent'
                  }`}
                >
                  {isHe ? 'כל הסוכנים' : 'All agents'}
                </button>
                {(Object.keys(AGENTS_CONFIG) as AgentId[]).sort((a, b) => {
                  const nameA = isHe ? AGENTS_CONFIG[a].nameHe : AGENTS_CONFIG[a].name;
                  const nameB = isHe ? AGENTS_CONFIG[b].nameHe : AGENTS_CONFIG[b].name;
                  return nameA.localeCompare(nameB, isHe ? 'he' : 'en');
                }).map((aid) => (
                  <button
                    key={aid}
                    onClick={() => { setScoutAgentFilter(aid); setScoutRotationPage(0); }}
                    className={`shrink-0 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap min-h-[40px] ${
                      scoutAgentFilter === aid
                        ? 'bg-gradient-to-r from-mgsr-teal/20 to-emerald-500/15 text-mgsr-teal border border-mgsr-teal/30 shadow-sm shadow-mgsr-teal/5'
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
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={`rounded-2xl border border-mgsr-teal/10 bg-mgsr-card p-4 animate-war-card-in war-stagger-${i}`}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-mgsr-teal/5 rounded-lg mb-3">
                        <div className="w-6 h-6 rounded bg-mgsr-border/60 war-shimmer" />
                        <div className="h-4 w-32 rounded bg-mgsr-border/60 war-shimmer" />
                      </div>
                      <div className="flex gap-3 p-3">
                        <div className="w-12 h-12 rounded-lg bg-mgsr-border/50 war-shimmer" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-2/3 rounded bg-mgsr-border/60 war-shimmer" />
                          <div className="h-3 w-1/2 rounded bg-mgsr-border/40 war-shimmer" style={{ animationDelay: '0.15s' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="war-orbital">
                      <div className="ring ring-1" style={{ borderTopColor: '#4DB6AC', borderRightColor: 'rgba(77,182,172,0.3)' }} />
                      <div className="ring ring-2" style={{ borderBottomColor: '#4DB6AC', borderLeftColor: 'rgba(77,182,172,0.3)' }} />
                      <div className="ring ring-3" style={{ borderTopColor: '#34d399', borderRightColor: 'rgba(52,211,153,0.3)' }} />
                      <div className="core" style={{ background: 'radial-gradient(circle, rgba(77,182,172,0.5) 0%, transparent 70%)' }} />
                    </div>
                    <span className="text-sm text-mgsr-teal font-medium">{isHe ? 'מחבר לרשת הסוכנים...' : 'Connecting to agent network...'}</span>
                  </div>
                </div>
              )}

              {!loadingScoutProfiles && scoutProfiles.length === 0 && (
                <div className="py-20 text-center rounded-2xl bg-gradient-to-b from-mgsr-card to-mgsr-card/50 border border-mgsr-border/50">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-mgsr-teal/10 border border-mgsr-teal/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-mgsr-teal/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" />
                    </svg>
                  </div>
                  <p className="text-mgsr-muted font-medium">
                    {isHe
                      ? 'אין פרופילים עדיין. הסוכנים רצים מדי יום ב-05:00.'
                      : 'No profiles yet. Agents run daily at 05:00 Israel time.'}
                  </p>
                  <p className="text-mgsr-muted/50 text-xs mt-1.5">
                    {isHe ? 'הפרופילים יופיעו אוטומטית אחרי ההרצה הבאה' : 'Profiles will populate automatically after the next run'}
                  </p>
                </div>
              )}

              {!loadingScoutProfiles && scoutProfiles.length > 0 && (
                <div className="space-y-4">
                  {Object.entries(
                    scoutProfiles
                      .filter((p) => {
                        const url = p.tmProfileUrl;
                        if (!url) return true;
                        if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
                        if (Array.from(shortlistUrls).some((s) => samePlayer(s, url))) return false;
                        return true;
                      })
                      .reduce<Record<string, ScoutProfileResponse[]>>((acc, p) => {
                      if (scoutAgentFilter !== 'all' && p.agentId !== scoutAgentFilter) return acc;
                      (acc[p.agentId] = acc[p.agentId] || []).push(p);
                      return acc;
                    }, {})
                  ).sort(([a], [b]) => {
                    const nameA = isHe ? AGENTS_CONFIG[a as AgentId]?.nameHe || a : AGENTS_CONFIG[a as AgentId]?.name || a;
                    const nameB = isHe ? AGENTS_CONFIG[b as AgentId]?.nameHe || b : AGENTS_CONFIG[b as AgentId]?.name || b;
                    return nameA.localeCompare(nameB, isHe ? 'he' : 'en');
                  }).map(([agentId, allProfiles]) => {
                    const cfg = AGENTS_CONFIG[agentId as AgentId];
                    const maxPerAgent = 5;
                    const totalPages = Math.max(1, Math.ceil(allProfiles.length / maxPerAgent));
                    const page = allProfiles.length <= maxPerAgent ? 0 : scoutRotationPage % totalPages;
                    const profiles = allProfiles.slice(page * maxPerAgent, (page + 1) * maxPerAgent);
                    return (
                      <section
                        key={agentId}
                        className="rounded-2xl border border-mgsr-border/70 bg-mgsr-card overflow-hidden animate-war-card-in war-card-glow-teal"
                      >
                        <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 sm:py-3.5 bg-gradient-to-r from-mgsr-teal/10 to-emerald-950/10 border-b border-mgsr-border/60">
                          <span className="text-xl sm:text-2xl">{cfg?.flag || '🌍'}</span>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-display font-bold text-sm sm:text-base text-mgsr-text">
                              {isHe ? cfg?.nameHe : cfg?.name} Agent
                            </h3>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {totalPages > 1 && (
                              <span className="text-[10px] text-mgsr-muted mr-1">{page + 1}/{totalPages}</span>
                            )}
                            <div className="w-1.5 h-1.5 rounded-full bg-mgsr-teal war-live-dot" />
                            <span className="text-xs font-semibold text-mgsr-teal">
                              {profiles.length}/{allProfiles.length}
                            </span>
                          </div>
                        </div>
                        <div className="p-2 sm:p-3 space-y-2">
                          {profiles.map((p) => {
                            const inRoster = Array.from(rosterTmProfiles).some((r) => samePlayer(r, p.tmProfileUrl));
                            const inShortlist = Array.from(shortlistUrls).some((s) => samePlayer(s, p.tmProfileUrl));
                            const isAdding = addingUrl === p.tmProfileUrl;
                            return (
                              <div
                                key={p.id}
                                className="flex gap-3 p-3 sm:p-4 rounded-xl bg-mgsr-dark/80 border border-mgsr-border/60 hover:border-mgsr-teal/30 transition-all duration-200 hover:shadow-md hover:shadow-mgsr-teal/5"
                              >
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-mgsr-border/50 shrink-0 overflow-hidden flex items-center justify-center ring-2 ring-mgsr-border/30 ring-offset-1 ring-offset-mgsr-dark">
                                  <img
                                    src={getPlayerImageUrl(p.profileImage ?? undefined, p.tmProfileUrl)}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = TM_DEFAULT_IMG;
                                    }}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-mgsr-teal/25 text-mgsr-teal border border-mgsr-teal/40">
                                      <span>{p.agentFlag}</span>
                                      <span className="hidden sm:inline">{isHe ? 'נמצא על ידי' : 'Found by'} {p.agentName} Agent</span>
                                      <span className="sm:hidden">{p.agentName}</span>
                                      {p.league && <span className="hidden sm:inline">· {p.league}</span>}
                                    </div>
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-purple-500/20 text-purple-400 shrink-0">
                                      {isHe ? p.profileTypeLabelHe : p.profileTypeLabel}
                                    </span>
                                  </div>
                                  <p className="font-display font-bold text-sm sm:text-base text-mgsr-text truncate">{p.playerName}</p>
                                  <p className="text-xs text-mgsr-muted">
                                    {p.age} · {shortenPosition(p.position)} · {p.marketValue}
                                    {p.club && <span className="hidden sm:inline"> · {p.club}</span>}
                                  </p>
                                  <p className="text-xs text-mgsr-text mt-1 line-clamp-2 sm:line-clamp-none">
                                    {(isHe ? p.scoutExplanationHe : p.scoutExplanationEn) || p.matchReason}
                                  </p>
                                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 items-center" onClick={(e) => e.stopPropagation()}>
                                    <a
                                      href={p.tmProfileUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-mgsr-border text-mgsr-muted hover:text-mgsr-teal border border-mgsr-border transition min-h-[32px]"
                                    >
                                      TM →
                                    </a>
                                    <span className="flex items-center gap-0.5 text-mgsr-muted">
                                      <button
                                        type="button"
                                        onClick={() => setProfileFeedback(p.id, 'up', p.agentId)}
                                        className={`p-1.5 rounded transition ${scoutFeedback[p.id] === 'up' ? 'text-green-500 bg-green-500/20' : 'hover:text-green-500 hover:bg-green-500/10'}`}
                                        title={isHe ? 'טוב' : 'Good pick'}
                                        aria-label={isHe ? 'טוב' : 'Good pick'}
                                      >
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" /></svg>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setProfileFeedback(p.id, 'down', p.agentId)}
                                        className={`p-1.5 rounded transition ${scoutFeedback[p.id] === 'down' ? 'text-red-500 bg-red-500/20' : 'hover:text-red-500 hover:bg-red-500/10'}`}
                                        title={isHe ? 'לא רלוונטי' : 'Not relevant'}
                                        aria-label={isHe ? 'לא רלוונטי' : 'Not relevant'}
                                      >
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" /></svg>
                                      </button>
                                    </span>
                                    {!inRoster && (
                                      <button
                                        onClick={() => addToShortlistFromProfile(p)}
                                        disabled={isAdding || inShortlist}
                                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 border border-mgsr-teal/40 transition disabled:opacity-50 min-h-[32px]"
                                      >
                                        {isAdding ? (isHe ? 'מוסיף...' : 'Adding...') : inShortlist ? (isHe ? 'ברשימת מעקב' : 'Shortlist') : (isHe ? 'לרשימת מעקב' : '+ Shortlist')}
                                      </button>
                                    )}
                                    {inRoster && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-mgsr-teal/25 text-mgsr-teal">
                                        {isHe ? 'במאגר' : 'In roster'}
                                      </span>
                                    )}
                                  </div>
                                </div>
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

          {/* ═══════════════════ AI SCOUT SEARCH TAB ═══════════════════ */}
          {warRoomTab === 'ai-scout' && (
            <div className="space-y-5">
              {/* Command console header */}
              <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-mgsr-card via-mgsr-card to-cyan-950/20">
                <div className="absolute top-0 right-0 w-48 h-48 opacity-[0.07] pointer-events-none" aria-hidden>
                  <svg viewBox="0 0 200 200" fill="none"><circle cx="100" cy="100" r="80" stroke="currentColor" strokeWidth="1" className="text-cyan-400" /><circle cx="100" cy="100" r="50" stroke="currentColor" strokeWidth="0.5" className="text-cyan-400" /><line x1="100" y1="20" x2="100" y2="180" stroke="currentColor" strokeWidth="0.5" className="text-cyan-400" /><line x1="20" y1="100" x2="180" y2="100" stroke="currentColor" strokeWidth="0.5" className="text-cyan-400" /></svg>
                </div>
                <div className="relative p-4 sm:p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-[0.2em]">
                      {isHe ? 'מסוף חיפוש מודיעיני' : 'Intelligence Search Terminal'}
                    </span>
                  </div>
                  <p className="text-sm text-mgsr-muted mb-4">
                    {isHe
                      ? 'חפש שחקנים בשפה חופשית. הסקאוט AI מבין עברית ואנגלית, תנאי גיל, עמדות, סגנון משחק ותקציב.'
                      : 'Free-text player search. The AI Scout understands Hebrew & English, age, position, play style, and budget constraints.'}
                  </p>

                  {/* Search input */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <div className="absolute top-3 left-3 pointer-events-none">
                        <svg className="w-5 h-5 text-cyan-400/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <textarea
                        value={scoutQuery}
                        onChange={(e) => setScoutQuery(e.target.value)}
                        onKeyDown={handleScoutKeyDown}
                        placeholder={isHe ? 'תאר את השחקן שאתה מחפש...' : 'Describe the player you\'re looking for...'}
                        rows={2}
                        dir={isRtl ? 'rtl' : 'ltr'}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-mgsr-dark/80 border border-cyan-500/20 text-mgsr-text placeholder:text-mgsr-muted/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/40 resize-none text-sm"
                        disabled={scoutSearching}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleScoutSearch}
                      disabled={scoutSearching || !scoutQuery.trim()}
                      className="shrink-0 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-bold hover:from-cyan-400 hover:to-cyan-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 self-start shadow-lg shadow-cyan-500/20"
                    >
                      {scoutSearching ? (
                        <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Example chips */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {(isHe ? SCOUT_EXAMPLES_HE : SCOUT_EXAMPLES_EN).map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => setScoutQuery(ex)}
                        disabled={scoutSearching}
                        dir={isRtl ? 'rtl' : 'ltr'}
                        className="px-2.5 py-1 rounded-lg text-[11px] border border-cyan-500/20 text-cyan-400/70 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-cyan-500/5 transition disabled:opacity-40 truncate max-w-[280px]"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scout error */}
              {scoutError && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                  <p>{scoutError}</p>
                  <button
                    type="button"
                    onClick={() => { fetch('/api/scout/warm').catch(() => {}); setScoutError(null); }}
                    className="mt-2 text-xs underline hover:no-underline"
                  >
                    {isHe ? 'חמם שרת ונסה שוב' : 'Warm server & retry'}
                  </button>
                </div>
              )}

              {/* Interpretation */}
              {scoutInterpretation && (
                <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1.5">
                      {isHe ? 'פרשנות AI' : 'AI Interpretation'}
                    </p>
                    <div className="space-y-1">
                      {scoutInterpretation.split('\n').filter(l => l.trim()).map((line, i) => (
                        <p key={i} className="text-sm text-mgsr-text leading-snug">{line.trim()}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Searching skeleton — radar sweep loader */}
              {scoutSearching && (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={`rounded-2xl border border-cyan-500/10 bg-mgsr-card p-5 animate-war-card-in war-stagger-${i}`}>
                      <div className="flex gap-4 items-start">
                        <div className="w-12 h-12 rounded-full bg-mgsr-border/50 shrink-0 war-shimmer-cyan" />
                        <div className="flex-1 space-y-3">
                          <div className="h-5 w-2/3 rounded-lg bg-mgsr-border/50 war-shimmer-cyan" />
                          <div className="h-4 w-1/2 rounded-lg bg-mgsr-border/30 war-shimmer-cyan" style={{ animationDelay: '0.2s' }} />
                        </div>
                        <div className="w-16 h-8 rounded-lg bg-mgsr-border/30 shrink-0 war-shimmer-cyan" />
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-col items-center justify-center gap-3 py-6">
                    <div className="war-radar">
                      <div className="radar-bg" />
                      <div className="radar-ring" />
                      <div className="radar-sweep" />
                      <div className="radar-dot" />
                    </div>
                    <span className="text-sm text-cyan-400 font-medium">
                      {isHe ? 'סורק את רשת המודיעין...' : 'Scanning intelligence network...'}
                    </span>
                    <div className="war-dots"><span className="bg-cyan-400" /><span className="bg-cyan-400" /><span className="bg-cyan-400" /></div>
                  </div>
                </div>
              )}

              {/* Results */}
              {!scoutSearching && scoutResults.length > 0 && (
                <>
                  <div className="flex items-center justify-between pb-3 border-b border-cyan-500/15">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2 h-2 rounded-full bg-green-400 war-live-dot" />
                      <p className="font-display font-bold text-mgsr-text text-sm">
                        {scoutResults.length} {isHe ? 'מטרות נמצאו' : 'targets acquired'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleScoutSearchOther}
                      disabled={scoutSearchingOther}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500/15 to-blue-500/10 text-cyan-400 hover:from-cyan-500/25 hover:to-blue-500/15 border border-cyan-500/25 transition-all disabled:opacity-50 flex items-center gap-1.5 min-h-[36px]"
                    >
                      {scoutSearchingOther ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin shrink-0" />
                          {isHe ? 'סורק...' : 'Scanning...'}
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
                          {isHe ? 'חפש עוד' : 'Find more targets'}
                        </>
                      )}
                    </button>
                  </div>

                  {addError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                      {addError}
                    </div>
                  )}

                  <div className="space-y-3">
                    {scoutResults.filter((s) => {
                      const url = s.transfermarktUrl;
                      if (!url) return true;
                      if (Array.from(rosterTmProfiles).some((r) => samePlayer(r, url))) return false;
                      if (Array.from(shortlistUrls).some((su) => samePlayer(su, url))) return false;
                      return true;
                    }).map((s) => {
                      const url = s.transfermarktUrl;
                      const pct = s.matchPercent ?? 0;
                      const isExpanded = url ? scoutExpandedUrl === url : false;
                      const report = url ? reportCache[url] : undefined;
                      const validReport = report && !('error' in report) ? report : undefined;
                      const isLoadingRpt = url ? loadingReport === url : false;
                      const rec = validReport?.synthesis?.recommendation?.toUpperCase();
                      const inRoster = url ? Array.from(rosterTmProfiles).some((r) => samePlayer(r, url)) : false;
                      const inShortlist = url ? Array.from(shortlistUrls).some((su) => samePlayer(su, url)) : false;
                      const isAdding = addingScoutUrl === url;

                      return (
                        <div
                          key={url || s.name}
                          className={`rounded-2xl border transition-all duration-300 animate-war-card-in war-card-glow-cyan ${
                            isExpanded
                              ? 'border-cyan-500/40 bg-gradient-to-br from-mgsr-card to-cyan-950/10 shadow-xl shadow-cyan-500/8'
                              : 'border-mgsr-border/70 bg-mgsr-card hover:border-cyan-500/30'
                          } ${url ? 'cursor-pointer' : ''}`}
                          style={{ animationDelay: `${Math.min(scoutResults.indexOf(s), 8) * 60}ms` }}
                          onClick={() => url && handleScoutExpand(url)}
                        >
                          <div className="p-4 sm:p-5">
                            <div className="flex items-start gap-4">
                              {/* Match ring — gradient progress */}
                              <div
                                className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/10"
                                style={{
                                  background: `conic-gradient(#22d3ee 0deg ${pct * 3.6 * 0.5}deg, #6366f1 ${pct * 3.6 * 0.5}deg ${pct * 3.6}deg, rgba(37,53,69,0.5) ${pct * 3.6}deg 360deg)`,
                                }}
                              >
                                <div className="w-[36px] h-[36px] rounded-full bg-mgsr-card flex items-center justify-center">
                                  <span className="font-display font-extrabold text-xs text-cyan-400">{pct}%</span>
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    {url ? (
                                      <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <p className="font-display font-bold text-base text-mgsr-text truncate">{s.name || '—'}</p>
                                      </a>
                                    ) : (
                                      <p className="font-display font-bold text-base text-mgsr-text truncate">{s.name || '—'}</p>
                                    )}
                                  </div>
                                  <div className="shrink-0 flex items-center gap-1.5">
                                    {validReport?.synthesis?.recommendation ? (
                                      <span
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm ${
                                          rec === 'SIGN'
                                            ? 'bg-gradient-to-r from-green-500/25 to-emerald-500/15 text-green-400 border border-green-500/30 shadow-green-500/10'
                                            : rec === 'MONITOR'
                                              ? 'bg-gradient-to-r from-amber-500/25 to-orange-500/15 text-amber-400 border border-amber-500/30 shadow-amber-500/10'
                                              : 'bg-gradient-to-r from-red-500/25 to-rose-500/15 text-red-400 border border-red-500/30 shadow-red-500/10'
                                        }`}
                                      >
                                        {rec === 'SIGN' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                                        {rec === 'MONITOR' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>}
                                        {rec === 'PASS' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>}
                                        {rec === 'SIGN' ? t('rec_sign') : rec === 'MONITOR' ? t('rec_monitor') : rec === 'PASS' ? t('rec_pass') : validReport.synthesis.recommendation}
                                      </span>
                                    ) : url ? (
                                      <span className="text-mgsr-muted text-[10px] hidden sm:inline opacity-60">{isHe ? 'לחץ לניתוח' : 'Click for analysis'}</span>
                                    ) : null}
                                    {url && (
                                      <svg
                                        className={`w-4 h-4 text-mgsr-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                                <p className="text-xs text-mgsr-muted mt-0.5">
                                  {s.age ? `${s.age}` : '—'}
                                  <span className="mx-1.5">·</span>
                                  {shortenPosition(s.position)}
                                  <span className="mx-1.5">·</span>
                                  {s.marketValue || '—'}
                                  {s.club && (
                                    <>
                                      <span className="mx-1.5">·</span>
                                      {s.club}
                                    </>
                                  )}
                                </p>

                                {/* FM + FBref badges */}
                                {(s.fmCa != null && s.fmCa > 0) && (
                                  <div className="flex items-center gap-2 mt-2 flex-wrap" dir="ltr">
                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/25">
                                      <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">FM</span>
                                      <span className="text-xs text-indigo-300">CA {s.fmCa}</span>
                                      {s.fmPa != null && <span className="text-xs font-bold text-indigo-400">→ PA {s.fmPa}</span>}
                                    </div>
                                    {s.fmPotentialGap != null && s.fmPotentialGap > 0 && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 border border-green-500/25 text-green-400 font-medium">
                                        +{s.fmPotentialGap} potential
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Scout analysis — structured sections */}
                                {s.scoutAnalysis && (() => {
                                  const sec = parseExplanationSections(s.scoutAnalysis);
                                  const hasAnything = sec.stats.length + sec.strengths.length + sec.fmAttrs.length + sec.insights.length > 0;
                                  if (!hasAnything) return null;
                                  return (
                                    <div className="space-y-1.5 mt-2" dir="ltr">
                                      {/* Season Stats */}
                                      {sec.stats.length > 0 && (
                                        <div>
                                          <span className="text-[9px] font-semibold text-mgsr-muted/50 uppercase tracking-wider">{isHe ? '📊 נתוני עונה' : '📊 Season'}</span>
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {sec.stats.map((st, i) => (
                                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-cyan-300/80 bg-cyan-500/10 border border-cyan-500/20">{st}</span>
                                            ))}
                                            {sec.physical.map((ph, i) => (
                                              <span key={`p${i}`} className="px-1.5 py-0.5 rounded text-[10px] text-mgsr-muted/70 bg-mgsr-dark/60 border border-mgsr-border/40">{ph}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Key Strengths */}
                                      {sec.strengths.length > 0 && (
                                        <div>
                                          <span className="text-[9px] font-semibold text-mgsr-muted/50 uppercase tracking-wider">{isHe ? '💪 חוזקות' : '💪 Strengths'}</span>
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {sec.strengths.map((st, i) => (
                                              <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] border ${st.includes('✓') ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30 font-medium' : 'text-green-300/80 bg-green-500/10 border-green-500/20'}`}>{st}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* FM Attributes */}
                                      {sec.fmAttrs.length > 0 && (
                                        <div>
                                          <span className="text-[9px] font-semibold text-mgsr-muted/50 uppercase tracking-wider">🎮 FM</span>
                                          <div className="flex flex-wrap gap-1 mt-0.5">
                                            {sec.fmAttrs.map((attr, i) => (
                                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-indigo-300/80 bg-indigo-500/10 border border-indigo-500/20">{attr}</span>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Market Insights */}
                                      {sec.insights.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {sec.insights.map((ins, i) => (
                                            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20">💡 {ins}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* Status badges + actions */}
                                <div className="flex flex-wrap gap-1.5 mt-2 items-center" onClick={(e) => e.stopPropagation()}>
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
                                  {url && (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-mgsr-border text-mgsr-muted hover:text-cyan-400 border border-mgsr-border transition"
                                    >
                                      TM →
                                    </a>
                                  )}
                                  {!inRoster && url && (
                                    <button
                                      onClick={() => addScoutResultToShortlist(s)}
                                      disabled={isAdding || inShortlist}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 transition disabled:opacity-50"
                                    >
                                      {isAdding ? (
                                        <>
                                          <span className="w-3 h-3 border-2 border-cyan-400/40 border-t-cyan-400 rounded-full animate-spin" />
                                          {isHe ? 'מוסיף...' : 'Adding...'}
                                        </>
                                      ) : inShortlist ? (
                                        <>{isHe ? 'ברשימת מעקב' : 'In shortlist'}</>
                                      ) : (
                                        <>
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                          </svg>
                                          {isHe ? 'לרשימת מעקב' : '+ Shortlist'}
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Expanded War Room report */}
                            {isExpanded && url && (
                              <div className="mt-4 pt-4 border-t border-cyan-500/20">
                                {isLoadingRpt && (
                                  <div className="flex items-center gap-3 py-5">
                                    <div className="war-orbital" style={{ width: 32, height: 32 }}>
                                      <div className="ring ring-1" style={{ borderTopColor: '#22d3ee', borderRightColor: 'rgba(34,211,238,0.3)' }} />
                                      <div className="ring ring-2" style={{ borderBottomColor: '#a855f7', borderLeftColor: 'rgba(168,85,247,0.3)' }} />
                                      <div className="core" />
                                    </div>
                                    <div>
                                      <span className="text-sm text-cyan-400 font-medium">{isHe ? 'מריץ ניתוח מולטי-סוכנים...' : 'Running multi-agent analysis...'}</span>
                                      <div className="war-dots mt-1"><span className="bg-cyan-400" /><span className="bg-cyan-400" /><span className="bg-cyan-400" /></div>
                                    </div>
                                  </div>
                                )}
                                {validReport && (
                                  <div className="space-y-3">
                                    {validReport.synthesis && (
                                      <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/15 to-cyan-500/10 border border-purple-500/25">
                                        <div className="flex items-center gap-2 mb-2">
                                          <div className="w-6 h-6 rounded-lg bg-purple-500/25 flex items-center justify-center">
                                            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                          </div>
                                          <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                                            {isHe ? 'חוות דעת ראש הסקאוטינג' : 'Chief Scout Verdict'}
                                          </h4>
                                        </div>
                                        <p className="text-sm text-mgsr-text leading-relaxed">
                                          {validReport.synthesis.executive_summary}
                                        </p>
                                        {validReport.synthesis.key_risks?.length ? (
                                          <p className="text-xs text-red-400/80 mt-2">
                                            ⚠ {isHe ? 'סיכונים:' : 'Risks:'} {validReport.synthesis.key_risks.join('; ')}
                                          </p>
                                        ) : null}
                                        {validReport.synthesis.key_opportunities?.length ? (
                                          <p className="text-xs text-green-400/80 mt-1">
                                            ✦ {isHe ? 'הזדמנויות:' : 'Opportunities:'} {validReport.synthesis.key_opportunities.join('; ')}
                                          </p>
                                        ) : null}
                                      </div>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      {validReport.stats?.summary && (
                                        <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                          <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">{isHe ? 'סטטיסטיקות' : 'Stats'}</h5>
                                          <p className="text-xs text-mgsr-text">{validReport.stats.summary}</p>
                                        </div>
                                      )}
                                      {validReport.market?.summary && (
                                        <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                          <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">{isHe ? 'שוק' : 'Market'}</h5>
                                          <p className="text-xs text-mgsr-text">{validReport.market.summary}</p>
                                        </div>
                                      )}
                                      {validReport.tactics?.summary && (
                                        <div className="p-3 rounded-lg bg-mgsr-dark border border-mgsr-border">
                                          <h5 className="text-[10px] font-semibold text-mgsr-muted uppercase mb-1">{isHe ? 'טקטיקה' : 'Tactics'}</h5>
                                          <p className="text-xs text-mgsr-text">{validReport.tactics.summary}</p>
                                        </div>
                                      )}
                                    </div>
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
                </>
              )}

              {/* Empty state after search */}
              {!scoutSearching && scoutResults.length === 0 && !scoutError && scoutQuery.trim() && scoutSeenUrls.length > 0 && (
                <div className="py-12 text-center rounded-2xl bg-mgsr-card border border-mgsr-border">
                  <p className="text-mgsr-muted">{isHe ? 'לא נמצאו תוצאות. נסה שאילתה אחרת.' : 'No results found. Try a different query.'}</p>
                </div>
              )}

              {/* Initial empty state */}
              {!scoutSearching && scoutResults.length === 0 && !scoutError && scoutSeenUrls.length === 0 && (
                <div className="py-20 text-center rounded-2xl border border-dashed border-cyan-500/15 bg-gradient-to-b from-mgsr-card/40 to-transparent">
                  <div className="relative w-20 h-20 mx-auto mb-5">
                    <div className="absolute inset-0 rounded-2xl bg-cyan-500/5 border border-cyan-500/15" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-10 h-10 text-cyan-400/30" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-mgsr-muted text-sm font-medium">
                    {isHe
                      ? 'הקלד שאילתה למעלה כדי להפעיל את חיפוש ה-AI'
                      : 'Type a query above to activate AI search'}
                  </p>
                  <p className="text-mgsr-muted/40 text-xs mt-1.5">
                    {isHe ? 'תוצאות ניתנות להרחבה לניתוח מלא של חדר המלחמה' : 'Results can be expanded for full War Room analysis'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════ FIND THE NEXT TAB ═══════════════════ */}
          {warRoomTab === 'find-next' && (
            <div className="mt-1">
              <FindNextTab />
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
