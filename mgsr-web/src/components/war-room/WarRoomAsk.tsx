'use client';

/**
 * War Room → Ask (AI Search).
 *
 * Natural-language search: describe a player, get ranked matches.
 * Console-style prompt, interpretation callout, results with match-% ring.
 * Rendered inside the Brit light room shell.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { callShortlistAdd } from '@/lib/callables';
import { extractPlayerIdFromUrl, getPlayerDetails } from '@/lib/api';
import { aiScoutSearch, type ScoutPlayerSuggestion } from '@/lib/scoutApi';
import { appendSeenKeys, appendStoredKeys, getSeenKeys, getStoredKeys } from '@/lib/searchNoveltyMemory';
import { buildPlayerKey, type DiversityMode } from '@/lib/discoveryDiversity';

const MEMORY_SCOPE = 'war-room-ai-scout';
const FRESHNESS_SCOPE = 'war-room-ai-scout:freshness';

function samePlayer(a: string, b: string): boolean {
  const ia = extractPlayerIdFromUrl(a);
  const ib = extractPlayerIdFromUrl(b);
  return !!ia && ia === ib;
}

const EXAMPLES_EN = [
  'Fast strikers under 24 with 5+ goals for Israeli market',
  'Creative midfielders from Belgium or Portugal under 26',
  'Left-footed center backs from Eastern Europe',
  'Free agent wingers with pace and dribbling ability',
];
const EXAMPLES_HE = [
  'חלוצים מהירים עד גיל 24 עם 5+ שערים לשוק הישראלי',
  'קשרים יצירתיים מבלגיה או פורטוגל עד גיל 26',
  'בלמים שמאליים ממזרח אירופה',
  'כנפים חופשיים עם מהירות ודריבל',
];

export default function WarRoomAsk() {
  const { user } = useAuth();
  const { lang, isRtl } = useLanguage();
  const he = lang === 'he';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScoutPlayerSuggestion[]>([]);
  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchingOther, setSearchingOther] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenUrls, setSeenUrls] = useState<string[]>([]);
  const [diversityMode, setDiversityMode] = useState<DiversityMode>('balanced');

  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterUrls, setRosterUrls] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const u1 = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter(Boolean)));
    });
    const u2 = onSnapshot(collection(db, 'Players'), (snap) => {
      setRosterUrls(new Set(snap.docs.map((d) => (d.data().tmProfile as string)?.trim()).filter(Boolean)));
    });
    return () => { u1(); u2(); };
  }, [user]);

  // Warm server on mount
  useEffect(() => { if (user) fetch('/api/scout/warm').catch(() => {}); }, [user]);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const freshnessScope = user?.uid ? `${FRESHNESS_SCOPE}:${user.uid}` : FRESHNESS_SCOPE;
    const priorKeys = Array.from(new Set([
      ...getSeenKeys(MEMORY_SCOPE, q),
      ...getStoredKeys(freshnessScope),
    ]));
    const seed = `${new Date().toISOString().slice(0, 10)}-${user?.uid ?? 'anon'}-${q}`;
    setSearching(true);
    setError(null);
    setResults([]);
    setInterpretation(null);
    setSeenUrls([]);
    try {
      const data = await aiScoutSearch(q, lang as 'en' | 'he', true, false, [], diversityMode, seed, priorKeys, user?.uid);
      setResults(data.players);
      setInterpretation(data.interpretation ?? null);
      const urls = data.players.map((p) => p.transfermarktUrl).filter(Boolean) as string[];
      setSeenUrls(urls);
      const keys = data.players.map((p) => buildPlayerKey(p.transfermarktUrl, p.name)).filter(Boolean);
      appendSeenKeys(MEMORY_SCOPE, q, keys);
      appendStoredKeys(freshnessScope, keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, lang, diversityMode, user?.uid]);

  const handleSearchMore = useCallback(async () => {
    const q = query.trim();
    if (!q || searchingOther) return;
    const freshnessScope = user?.uid ? `${FRESHNESS_SCOPE}:${user.uid}` : FRESHNESS_SCOPE;
    const memKeys = Array.from(new Set([
      ...getSeenKeys(MEMORY_SCOPE, q),
      ...getStoredKeys(freshnessScope),
    ]));
    const curKeys = results.map((p) => buildPlayerKey(p.transfermarktUrl, p.name)).filter(Boolean);
    const seed = `${new Date().toISOString().slice(0, 10)}-${user?.uid ?? 'anon'}-${q}`;
    setSearchingOther(true);
    setError(null);
    try {
      const data = await aiScoutSearch(q, lang as 'en' | 'he', false, false, seenUrls, diversityMode, seed, [...memKeys, ...curKeys], user?.uid);
      setResults(data.players);
      setInterpretation(data.interpretation ?? null);
      const newUrls = data.players.map((p) => p.transfermarktUrl).filter(Boolean) as string[];
      setSeenUrls((prev) => [...prev, ...newUrls.filter((u) => !prev.includes(u))]);
      const keys = data.players.map((p) => buildPlayerKey(p.transfermarktUrl, p.name)).filter(Boolean);
      appendSeenKeys(MEMORY_SCOPE, q, keys);
      appendStoredKeys(freshnessScope, keys);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearchingOther(false);
    }
  }, [query, lang, searchingOther, seenUrls, diversityMode, results, user?.uid]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch(); }
  }, [handleSearch]);

  const addToShortlist = useCallback(async (s: ScoutPlayerSuggestion) => {
    const url = s.transfermarktUrl;
    if (!user || !url) return;
    if (Array.from(rosterUrls).some((r) => samePlayer(r, url))) {
      setAddError(he ? 'השחקן כבר במאגר' : 'Player already in roster');
      return;
    }
    setAddingUrl(url);
    setAddError(null);
    try {
      const account = await getCurrentAccountForShortlist(user);
      let entry: Record<string, unknown> = {
        addedByAgentId: account.id,
        addedByAgentName: account.name ?? null,
        addedByAgentHebrewName: account.hebrewName ?? null,
      };
      try {
        const details = await getPlayerDetails(url);
        entry = { ...entry, playerImage: details.profileImage ?? null, playerName: details.fullName ?? null, playerPosition: details.positions?.[0] ?? null, playerAge: details.age ?? null, playerNationality: details.nationality ?? null, clubJoinedName: details.currentClub?.clubName ?? null, marketValue: details.marketValue ?? null };
      } catch {
        entry = { ...entry, playerName: s.name ?? null, playerPosition: s.position ?? null, playerAge: s.age ?? null, playerNationality: s.nationality ?? null, clubJoinedName: s.club ?? null, marketValue: s.marketValue ?? null };
      }
      await callShortlistAdd({ platform: 'men', tmProfileUrl: url, ...entry } as Parameters<typeof callShortlistAdd>[0]);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAddingUrl(null);
    }
  }, [user, rosterUrls, he]);

  const visibleResults = useMemo(() => {
    return results.filter((s) => {
      const url = s.transfermarktUrl;
      if (!url) return true;
      if (Array.from(rosterUrls).some((r) => samePlayer(r, url))) return false;
      if (Array.from(shortlistUrls).some((su) => samePlayer(su, url))) return false;
      return true;
    });
  }, [results, rosterUrls, shortlistUrls]);

  return (
    <>
      {/* Masthead */}
      <header className="brit-masthead">
        <p className="brit-kicker">{he ? 'חיפוש בשפה טבעית / פלטפורמת גברים' : 'Natural-language search / Men platform'}</p>
        <h1>{he ? 'שאל את ' : 'Ask the '}<span>{he ? 'הסקאוט.' : 'scout.'}</span></h1>
        <p className="brit-ra-sub">
          {he
            ? 'תאר את השחקן במילים שלך. הסקאוט מפרש את הבריף ומחזיר התאמות מדורגות.'
            : 'Describe the player in your own words. The scout interprets the brief and returns matches ranked by fit.'}
        </p>
      </header>

      {/* Console */}
      <div className="brit-wr-console">
        <div className="term"><span className="d" />{he ? 'מסוף חיפוש הסקאוט' : 'Scout search terminal'}</div>
        <div className="askwrap">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            dir={isRtl ? 'rtl' : 'ltr'}
            placeholder={he ? 'תאר שחקן… למשל "חלוץ מהיר עד 23 בטווח שלי"' : 'Describe a player… e.g. "fast striker under 23 in my band"'}
            disabled={searching}
          />
          <button className="go" onClick={handleSearch} disabled={searching || !query.trim()}>
            {searching ? '…' : (he ? 'חפש' : 'Search')}
          </button>
        </div>
        <div className="divmode">
          <span className="dl">{he ? 'מצב גיוון' : 'Diversity'}</span>
          {(['strict', 'balanced', 'discovery'] as DiversityMode[]).map((m) => (
            <button
              key={m}
              className={`brit-wr-chip${diversityMode === m ? ' on' : ''}`}
              onClick={() => setDiversityMode(m)}
              disabled={searching || searchingOther}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <div className="examples">
          {(he ? EXAMPLES_HE : EXAMPLES_EN).map((ex) => (
            <button key={ex} className="ex" onClick={() => setQuery(ex)} disabled={searching}>{ex}</button>
          ))}
        </div>
      </div>

      {error && <div className="brit-wr-error">{error} <button onClick={() => { fetch('/api/scout/warm').catch(() => {}); setError(null); }}>{he ? 'חמם ונסה שוב' : 'Warm & retry'}</button></div>}
      {addError && <div className="brit-wr-error">{addError}</div>}

      {/* Interpretation */}
      {interpretation && (
        <div className="brit-wr-interp">
          <b>{he ? 'פרשנות הסקאוט' : 'Scout interpretation'}</b>
          {interpretation.split('\n').filter((l) => l.trim()).map((line, i) => <p key={i}>{line.trim()}</p>)}
        </div>
      )}

      {/* Results */}
      {!searching && visibleResults.length > 0 && (
        <>
          <p className="brit-wr-count"><b>{visibleResults.length}</b> {he ? 'מטרות נמצאו · מדורג לפי התאמה' : 'targets acquired · ranked by fit'}</p>
          <div className="brit-wr-askresults">
            {visibleResults.map((s) => {
              const url = s.transfermarktUrl;
              const pct = s.matchPercent ?? 0;
              const deg = pct * 3.6;
              const isAdding = addingUrl === url;
              return (
                <div key={url || s.name} className="brit-wr-qrow">
                  <div className="ring" style={{ background: `conic-gradient(var(--gold) ${deg}deg, var(--paper-2) ${deg}deg)` }}>
                    <div className="inner">{pct}%</div>
                  </div>
                  <div className="qbody">
                    <div className="qtop">
                      <a className="qname" href={url} target="_blank" rel="noopener noreferrer">{s.name || '—'}</a>
                    </div>
                    <div className="qmeta">
                      {s.age ?? '—'} · {s.position ?? '—'} · {s.marketValue ?? '—'}{s.club ? ` · ${s.club}` : ''}
                    </div>
                    <div className="aacts">
                      <a className="brit-wr-btn ghost" href={url} target="_blank" rel="noopener noreferrer">TM →</a>
                      <button className="brit-wr-btn gold" onClick={() => addToShortlist(s)} disabled={isAdding}>
                        {isAdding ? (he ? 'מוסיף…' : 'Adding…') : `+ ${he ? 'מעקב' : 'Shortlist'}`}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="brit-wr-findmore" onClick={handleSearchMore} disabled={searchingOther}>
            <svg viewBox="0 0 24 24"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
            {searchingOther ? (he ? 'מחפש…' : 'Scanning…') : (he ? 'חפש עוד מטרות' : 'Find more targets')}
          </button>
        </>
      )}

      {searching && <div className="brit-wr-placeholder">{he ? 'סורק את רשת המודיעין…' : 'Scanning intelligence network…'}</div>}
      {!searching && results.length === 0 && query.trim() && !error && (
        <div className="brit-wr-placeholder">{he ? 'הקלד בריף למעלה וחפש' : 'Type a brief above and search'}</div>
      )}
    </>
  );
}
