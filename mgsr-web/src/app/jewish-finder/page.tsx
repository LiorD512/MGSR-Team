'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import AppLayout from '@/components/AppLayout';
import { db } from '@/lib/firebase';
import { collection, query as firestoreQuery, where, getDocs, addDoc, onSnapshot } from 'firebase/firestore';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { getPlayerDetails } from '@/lib/api';
import type { DiscoveredPlayer, DiscoveryResult } from '@/lib/jewishPlayerFinder';

function cc(score: number) {
  if (score >= 85) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', bar: 'bg-emerald-500' };
  if (score >= 65) return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', bar: 'bg-blue-500' };
  if (score >= 40) return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', bar: 'bg-amber-500' };
  if (score >= 20) return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', bar: 'bg-orange-500' };
  return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', bar: 'bg-red-500' };
}

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${cls}`}>{children}</span>;
}

const LABEL_HE: Record<string, string> = {
  'Very High': 'גבוה מאוד', 'High': 'גבוה', 'Medium': 'בינוני', 'Low': 'נמוך', 'Very Low': 'נמוך מאוד',
};

const ORIGIN_HE: Record<string, string> = {
  'Ashkenazi': 'אשכנזי', 'Sephardi/Mizrahi': 'ספרדי/מזרחי', 'Hungarian Jewish': 'יהודי הונגרי',
  'Polish/Russian Jewish': 'יהודי פולני/רוסי', 'South American Jewish': 'יהודי דרום אמריקאי',
  'Dutch Jewish': 'יהודי הולנדי', 'British Jewish': 'יהודי בריטי', 'French Jewish': 'יהודי צרפתי',
  'German Jewish': 'יהודי גרמני', 'Italian Jewish': 'יהודי איטלקי', 'Georgian Jewish': 'יהודי גאורגי',
  'Anglicized Jewish': 'יהודי מאונגלז',
};

const CONFIDENCE_TAG_HE: Record<string, string> = { 'common': 'נפוץ', 'notable': 'בולט' };
const WEIGHT_HE: Record<string, string> = { 'high': 'גבוה', 'medium': 'בינוני', 'low': 'נמוך' };

export default function JewishFinderPage() {
  const { user, loading: authLoading } = useAuth();
  const { isRtl } = useLanguage();
  const router = useRouter();

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [surnameStats, setSurnameStats] = useState<{ totalSurnames: number; byOrigin: Record<string, number> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [addingToShortlistUrl, setAddingToShortlistUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  // Real-time shortlist listener
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter((u): u is string => !!u)));
    });
    return () => unsub();
  }, [user]);

  const addToShortlist = useCallback(async (p: DiscoveredPlayer, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user || !p.tmUrl) return;
    setAddingToShortlistUrl(p.tmUrl);
    try {
      const account = await getCurrentAccountForShortlist(user);
      const colRef = collection(db, 'Shortlists');
      const q = firestoreQuery(colRef, where('tmProfileUrl', '==', p.tmUrl));
      const existsSnap = await getDocs(q);
      if (existsSnap.empty) {
        let entry: Record<string, unknown>;
        try {
          const details = await getPlayerDetails(p.tmUrl);
          entry = {
            tmProfileUrl: p.tmUrl, addedAt: Date.now(),
            playerImage: details.profileImage ?? null,
            playerName: details.fullName ?? p.name,
            playerPosition: details.positions?.[0] ?? p.position ?? null,
            playerAge: details.age ?? p.age ?? null,
            playerNationality: details.nationality ?? p.nationality ?? null,
            playerNationalityFlag: details.nationalityFlag ?? null,
            clubJoinedName: details.currentClub?.clubName ?? p.club ?? null,
            marketValue: details.marketValue ?? p.marketValue ?? null,
            addedByAgentId: account.id,
            addedByAgentName: account.name ?? null,
            addedByAgentHebrewName: account.hebrewName ?? null,
            instagramHandle: details.instagramHandle ?? null,
            instagramUrl: details.instagramUrl ?? null,
          };
        } catch {
          entry = {
            tmProfileUrl: p.tmUrl, addedAt: Date.now(),
            playerName: p.name, playerPosition: p.position ?? null,
            playerAge: p.age ?? null, playerNationality: p.nationality ?? null,
            clubJoinedName: p.club ?? null, marketValue: p.marketValue ?? null,
            addedByAgentId: account.id,
            addedByAgentName: account.name ?? null,
            addedByAgentHebrewName: account.hebrewName ?? null,
          };
        }
        await addDoc(colRef, entry);
        await addDoc(collection(db, 'FeedEvents'), {
          type: 'SHORTLIST_ADDED', playerName: entry.playerName ?? null,
          playerImage: entry.playerImage ?? null, playerTmProfile: p.tmUrl,
          timestamp: Date.now(), agentName: account.name ?? null,
        });
      }
    } catch { /* silent */ } finally {
      setAddingToShortlistUrl(null);
    }
  }, [user]);

  const runDiscovery = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    const currentSeed = Date.now();
    setSeed(currentSeed);

    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/jewish-finder/discover?seed=${currentSeed}&lang=${isRtl ? 'he' : 'en'}`, {
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let evt = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            evt = line.slice(7);
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (evt === 'stats') setSurnameStats(data);
              if (evt === 'result') setResults([data]);
              if (evt === 'error') setError(data.error);
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') setError(err.message);
    } finally {
      setRunning(false);
    }
  }, [running, isRtl]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  // Flatten all discovered players, deduplicate by name, sort by confidence
  const allPlayers = results
    .flatMap(r => r.players.map(p => ({ ...p, _leagues: r.leaguesScanned.join(', ') })))
    .reduce<(DiscoveredPlayer & { _leagues: string })[]>((acc, p) => {
      if (acc.some(a => a.name.toLowerCase() === p.name.toLowerCase())) return acc;
      return [...acc, p];
    }, [])
    .sort((a, b) => b.confidenceScore - a.confidenceScore);

  const totalScanned = results.reduce((s, r) => s + r.totalScanned, 0);
  const highConf = allPlayers.filter(p => p.confidenceScore >= 50).length;

  if (authLoading || !user) {
    return <AppLayout><div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-[var(--mgsr-accent)] border-t-transparent rounded-full animate-spin" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className={`max-w-5xl mx-auto px-4 py-6 ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">✡️</span>
            <h1 className="text-2xl font-bold text-[var(--mgsr-text)]">
              {isRtl ? 'הסקאוט הכשר' : 'Kosher Scout'}
            </h1>
          </div>
          <p className="text-sm text-[var(--mgsr-text)]/50 max-w-2xl">
            {isRtl
              ? 'סריקה אוטומטית של ליגות בעולם — התאמת שמות משפחה יהודיים, אימות מויקיפדיה, וסיווג AI. כל ריענון סורק ליגות ושחקנים שונים.'
              : 'Auto-scans world leagues — matches Jewish surnames, verifies via Wikipedia, classifies with AI. Each refresh scans different leagues & players.'}
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button
            onClick={running ? stop : runDiscovery}
            className={`px-6 py-3 rounded-xl text-sm font-bold transition-all ${running
              ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : 'bg-[var(--mgsr-accent)] text-[var(--mgsr-dark)] hover:brightness-110'}`}
          >
            {running
              ? (isRtl ? '⏹ עצור סריקה' : '⏹ Stop Scan')
              : results.length > 0
                ? (isRtl ? '🔄 סרוק שוב (ליגות חדשות)' : '🔄 Scan Again (New Leagues)')
                : (isRtl ? '🚀 התחל גילוי' : '🚀 Start Discovery')}
          </button>

          {/* Stats */}
          {(totalScanned > 0 || surnameStats) && (
            <div className="flex gap-4 text-xs text-[var(--mgsr-text)]/40">
              {surnameStats && <span>📚 {surnameStats.totalSurnames} {isRtl ? 'שמות משפחה במאגר' : 'surnames in DB'}</span>}
              {totalScanned > 0 && <span>🔍 {totalScanned} {isRtl ? 'שחקנים נסרקו' : 'players scanned'}</span>}
              {highConf > 0 && <span className="text-emerald-400">⭐ {highConf} {isRtl ? 'סבירות בינונית+' : 'medium+ confidence'}</span>}
              {results.length > 0 && <span>🔄 {results.length} {isRtl ? 'סריקות' : 'scans'}</span>}
            </div>
          )}
        </div>

        {/* Running State */}
        {running && (
          <div className="mb-6 p-4 rounded-xl bg-[var(--mgsr-card)] border border-[var(--mgsr-accent)]/20 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-[var(--mgsr-accent)] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-[var(--mgsr-text)]">
                {isRtl ? 'סורק ליגות, מתאים שמות משפחה, מעשיר מויקיפדיה, מסווג עם AI...' : 'Scanning leagues, matching surnames, enriching from Wikipedia, classifying with AI...'}
              </span>
            </div>
            <div className="mt-2 text-xs text-[var(--mgsr-text)]/30">
              {isRtl ? 'זה יכול לקחת 1-3 דקות. 2 ליגות × 5 קבוצות × סריקת שמות → Wikipedia → Gemini' : 'This may take 1-3 minutes. 2 leagues × 5 clubs × surname matching → Wikipedia → Gemini'}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>
        )}

        {/* Last Scan Info */}
        {results.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-[var(--mgsr-text)]/50">
            <div className="font-semibold text-[var(--mgsr-text)]/60 mb-1.5">
              {isRtl ? '📋 סריקה אחרונה' : '📋 Last Scan'}
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--mgsr-text)]/30">🏟️</span>
                <span>{isRtl ? 'ליגות: ' : 'Leagues: '}{results[0].leaguesScanned.join(' · ')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--mgsr-text)]/30">🔍</span>
                <span>{results[0].totalScanned} {isRtl ? 'שחקנים נסרקו' : 'players scanned'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--mgsr-text)]/30">✡️</span>
                <span>{results[0].players.length} {isRtl ? 'התאמות שם משפחה' : 'surname matches'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--mgsr-text)]/30">⏱️</span>
                <span>{Math.round(results[0].duration / 1000)}{isRtl ? ' שניות' : 's'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {allPlayers.length > 0 ? (
          <div className="space-y-3">
            {allPlayers.map((p, idx) => {
              const colors = cc(p.confidenceScore);
              return (
                <div key={`${p.name}-${idx}`} className="p-4 rounded-xl bg-[var(--mgsr-card)] border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-start gap-3">
                    {/* Rank */}
                    <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[11px] font-bold text-[var(--mgsr-text)]/25 shrink-0">
                      {idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + Confidence */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[15px] font-bold text-[var(--mgsr-text)]">{p.name}</span>
                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${colors.bg} ${colors.text} border ${colors.border}`}>
                          {p.confidenceScore}%
                        </span>
                        <span className={`text-[10px] font-medium ${colors.text}`}>{isRtl ? (LABEL_HE[p.confidenceLabel] || p.confidenceLabel) : p.confidenceLabel}</span>
                      </div>

                      {/* Player Meta */}
                      <div className="flex items-center gap-2 text-xs text-[var(--mgsr-text)]/40 mb-2 flex-wrap">
                        {p.position && <span className="bg-white/5 px-1.5 py-0.5 rounded">{p.position}</span>}
                        <span>{p.club}</span>
                        <span className="text-[var(--mgsr-text)]/20">·</span>
                        <span>{p.league}</span>
                        <span className="text-[var(--mgsr-text)]/20">·</span>
                        <span>🏳️ {p.nationality}</span>
                        {p.age && <span>{p.age}y</span>}
                        {p.marketValue && <span>💰 {p.marketValue}</span>}
                      </div>

                      {/* Confidence Bar */}
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden mb-2 max-w-xs">
                        <div className={`h-full rounded-full ${colors.bar} transition-all duration-700`} style={{ width: `${p.confidenceScore}%` }} />
                      </div>

                      {/* Surname Match */}
                      <div className="flex items-center gap-2 mb-2 text-xs">
                        <Badge cls={p.surnameMatch.confidence === 'common' ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-500/20 text-zinc-400'}>
                          {isRtl ? (CONFIDENCE_TAG_HE[p.surnameMatch.confidence] || p.surnameMatch.confidence) : p.surnameMatch.confidence}
                        </Badge>
                        <span className="text-[var(--mgsr-text)]/50">
                          {isRtl ? 'שם משפחה: ' : 'Surname: '}
                          <span className="font-medium text-[var(--mgsr-text)]/70">{p.surnameMatch.surname}</span>
                          {' '}({isRtl ? (ORIGIN_HE[p.surnameMatch.origin] || p.surnameMatch.origin) : p.surnameMatch.origin})
                        </span>
                      </div>

                      {/* AI Reasoning */}
                      <p className="text-xs text-[var(--mgsr-text)]/60 leading-relaxed mb-2">{p.geminiReasoning}</p>

                      {/* Signals */}
                      {p.signals.length > 1 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {p.signals.slice(0, 4).map((s, si) => (
                            <div key={si} className="flex items-center gap-1 text-[11px]">
                              <Badge cls={s.weight === 'high' ? 'bg-emerald-500/20 text-emerald-400' : s.weight === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-500/20 text-zinc-400'}>{isRtl ? (WEIGHT_HE[s.weight] || s.weight) : s.weight}</Badge>
                              <span className="text-[var(--mgsr-text)]/40">{s.signal}</span>
                            </div>
                          ))}
                          {p.signals.length > 4 && <span className="text-[10px] text-[var(--mgsr-text)]/20">+{p.signals.length - 4}</span>}
                        </div>
                      )}

                      {/* Wiki Summary */}
                      {p.wikipediaSummary && (
                        <p className="text-[11px] text-[var(--mgsr-text)]/25 leading-relaxed line-clamp-2">{p.wikipediaSummary}</p>
                      )}
                    </div>

                    {/* TM Link + Shortlist */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {p.tmUrl && (
                        <a href={p.tmUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--mgsr-accent)] hover:underline">
                          TM ↗
                        </a>
                      )}
                      {p.tmUrl && (() => {
                        const inSl = shortlistUrls.has(p.tmUrl);
                        const isAdding = addingToShortlistUrl === p.tmUrl;
                        return (
                          <button
                            type="button"
                            onClick={(e) => !inSl && addToShortlist(p, e)}
                            disabled={!!addingToShortlistUrl}
                            className={`group/sl flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all ${
                              inSl
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 cursor-default'
                                : 'border-white/10 bg-white/[0.03] text-[var(--mgsr-text)]/50 hover:border-amber-500/40 hover:text-amber-400 hover:bg-amber-500/5 disabled:opacity-50'
                            }`}
                          >
                            {isAdding ? (
                              <span className="w-3.5 h-3.5 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
                            ) : inSl ? (
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 opacity-70 group-hover/sl:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                            )}
                            {isAdding ? (isRtl ? 'מוסיף...' : 'Adding...') : inSl ? (isRtl ? 'בשורטליסט' : 'In Shortlist') : (isRtl ? 'שורטליסט' : 'Shortlist')}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : !running && (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🕵️‍♂️</div>
            <h3 className="text-lg font-semibold text-[var(--mgsr-text)]/50 mb-2">
              {isRtl ? 'לחץ "התחל גילוי" כדי לסרוק' : 'Press "Start Discovery" to scan'}
            </h3>
            <p className="text-sm text-[var(--mgsr-text)]/30 max-w-lg mx-auto mb-4">
              {isRtl
                ? 'המערכת תבחר 2 ליגות (עדיפות ל-MLS), תסרוק 5 קבוצות, תתאים שמות משפחה יהודיים מהמאגר, תבדוק ויקיפדיה, ותסווג עם Gemini AI'
                : 'The system will pick 2 leagues (MLS prioritized), scrape 5 clubs, match Jewish surnames from the database, verify via Wikipedia, and classify with Gemini AI'}
            </p>
            <div className="text-xs text-[var(--mgsr-text)]/20 max-w-md mx-auto">
              {isRtl
                ? '🔄 כל ריענון סורק ליגות וקבוצות שונות — לחץ שוב לגילויים חדשים'
                : '🔄 Each refresh scans different leagues & clubs — click again for new discoveries'}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
