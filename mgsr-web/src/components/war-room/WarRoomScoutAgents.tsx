'use client';

/**
 * War Room → Scout Agents.
 *
 * Each AI scout persona monitors a country/region and streams its own picks.
 * Grouped into sections by agent, with 👍/👎 feedback and position filter.
 * Rendered inside the Brit light room shell.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { callShortlistAdd, callScoutProfileFeedbackSet } from '@/lib/callables';
import { extractPlayerIdFromUrl } from '@/lib/api';
import { AGENTS_CONFIG, type AgentId } from '@/lib/scoutAgentConfig';
import { getPositionDisplayName } from '@/lib/appConfig';
import type { ScoutProfileResponse } from '@/types/scoutProfiles';

function samePlayer(a: string, b: string): boolean {
  const ia = extractPlayerIdFromUrl(a);
  const ib = extractPlayerIdFromUrl(b);
  return !!ia && ia === ib;
}

function shortenPosition(pos: string | undefined): string {
  if (!pos?.trim()) return '—';
  const p = pos.trim();
  const lower = p.toLowerCase();
  const map: Record<string, string> = {
    goalkeeper: 'GK', 'centre-back': 'CB', 'center-back': 'CB',
    'right-back': 'RB', 'left-back': 'LB', 'defensive midfield': 'DM',
    'central midfield': 'CM', 'attacking midfield': 'AM',
    'left winger': 'LW', 'right winger': 'RW', 'centre-forward': 'CF',
    'second striker': 'SS', striker: 'ST',
  };
  for (const [k, v] of Object.entries(map)) if (lower.includes(k)) return v;
  return p.split(' - ').pop()?.toUpperCase() || p.toUpperCase();
}

function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const TM_DEFAULT_IMG = 'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';

export default function WarRoomScoutAgents() {
  const { user } = useAuth();
  const { lang } = useLanguage() as ReturnType<typeof useLanguage>;

  const [profiles, setProfiles] = useState<ScoutProfileResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [agentFilter, setAgentFilter] = useState<AgentId | 'all'>('all');
  const [posFilter, setPosFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<Record<string, 'up' | 'down'>>({});
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterUrls, setRosterUrls] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const he = lang === 'he';

  // Shortlist + roster status
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

  // Feedback
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'ScoutProfileFeedback', user.uid);
    const unsub = onSnapshot(ref, (snap) => {
      const raw = (snap.data()?.feedback as Record<string, unknown>) || {};
      const flat: Record<string, 'up' | 'down'> = {};
      for (const [k, v] of Object.entries(raw)) {
        flat[k] = (typeof v === 'object' && v !== null ? (v as { feedback: 'up' | 'down' }).feedback : v) as 'up' | 'down';
      }
      setFeedback(flat);
    });
    return () => unsub();
  }, [user]);

  // Load profiles
  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (agentFilter !== 'all') params.set('agentId', agentFilter);
      const res = await fetch(`/api/war-room/scout-profiles?${params.toString()}`, {
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProfiles(data.profiles ?? []);
      setLastRunAt(data.lastRunAt ?? null);
    } catch {
      setProfiles([]);
      setLastRunAt(null);
    } finally {
      setLoading(false);
    }
  }, [agentFilter]);

  useEffect(() => { if (user) fetchProfiles(); }, [user, fetchProfiles]);

  const setProfileFeedback = useCallback(async (profileId: string, fb: 'up' | 'down', agentId: string) => {
    if (!user) return;
    await callScoutProfileFeedbackSet({ uid: user.uid, profileId, feedback: fb, agentId });
    setFeedback((prev) => ({ ...prev, [profileId]: fb }));
  }, [user]);

  const addToShortlist = useCallback(async (p: ScoutProfileResponse) => {
    if (!user) return;
    const url = p.tmProfileUrl;
    if (Array.from(rosterUrls).some((r) => samePlayer(r, url))) {
      setError(he ? 'השחקן כבר במאגר' : 'Player already in roster');
      return;
    }
    setAddingUrl(url);
    setError(null);
    try {
      const account = await getCurrentAccountForShortlist(user);
      await callShortlistAdd({
        platform: 'men',
        tmProfileUrl: url,
        playerImage: p.profileImage ?? null,
        playerName: p.playerName ?? null,
        playerPosition: p.position ?? null,
        playerAge: String(p.age) ?? null,
        playerNationality: p.nationality ?? null,
        clubJoinedName: p.club ?? null,
        marketValue: p.marketValue ?? null,
        addedByAgentId: account.id,
        addedByAgentName: account.name ?? null,
        addedByAgentHebrewName: account.hebrewName ?? null,
        sourceAgentId: p.agentId,
        sourceProfileId: p.id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAddingUrl(null);
    }
  }, [user, rosterUrls, he]);

  // Filter out roster + shortlisted, apply agent + position filters, group by agent
  const visible = useMemo(() => {
    return profiles
      .filter((p) => {
        const url = p.tmProfileUrl;
        if (!url) return true;
        if (Array.from(rosterUrls).some((r) => samePlayer(r, url))) return false;
        if (Array.from(shortlistUrls).some((s) => samePlayer(s, url))) return false;
        return true;
      })
      .filter((p) => (agentFilter === 'all' ? true : p.agentId === agentFilter))
      .filter((p) => (posFilter === 'all' ? true : shortenPosition(p.position) === posFilter));
  }, [profiles, rosterUrls, shortlistUrls, agentFilter, posFilter]);

  const availablePositions = useMemo(() => {
    const set = new Set<string>();
    for (const p of visible) {
      const code = shortenPosition(p.position);
      if (code && code !== '—') set.add(code);
    }
    return Array.from(set).sort();
  }, [visible]);

  const grouped = useMemo(() => {
    return visible.reduce<Record<string, ScoutProfileResponse[]>>((acc, p) => {
      (acc[p.agentId] = acc[p.agentId] || []).push(p);
      return acc;
    }, {});
  }, [visible]);

  const agentIds = (Object.keys(AGENTS_CONFIG) as AgentId[]).sort((a, b) => {
    const na = he ? AGENTS_CONFIG[a].nameHe : AGENTS_CONFIG[a].name;
    const nb = he ? AGENTS_CONFIG[b].nameHe : AGENTS_CONFIG[b].name;
    return na.localeCompare(nb, he ? 'he' : 'en');
  });

  const displayPos = (pos: string | undefined) => {
    const code = shortenPosition(pos);
    return he ? getPositionDisplayName(code, true) : code;
  };

  return (
    <>
      {/* Masthead */}
      <header className="brit-masthead">
        <p className="brit-kicker">{he ? 'רשת פרסונות / פלטפורמת גברים' : 'Persona network / Men platform'}</p>
        <h1>{he ? 'סוכני ' : 'Scout '}<span>{he ? 'סקאוט.' : 'agents.'}</span></h1>
        <p className="brit-ra-sub">
          {he
            ? 'כל פרסונת סקאוט מכסה אזור וסגנון ומזרימה את הבחירות שלה. משוב (👍/👎) מלמד את הסוכנים מה אתה מחפש.'
            : 'Each AI scout persona works a region and style, streaming its own picks. Thumbs feedback teaches the agents what you want.'}
        </p>
      </header>

      {/* meta line */}
      <section className="brit-wr-metaline">
        <span>{profiles.length} {he ? 'פרופילים' : 'profiles'}</span>
        {lastRunAt && <span>· {he ? 'הרצה אחרונה' : 'last run'} {timeAgo(lastRunAt)}</span>}
      </section>

      {/* Agent chips */}
      <div className="brit-wr-chips">
        <button className={`brit-wr-chip${agentFilter === 'all' ? ' on' : ''}`} onClick={() => setAgentFilter('all')}>
          {he ? 'כל הסוכנים' : 'All agents'}
        </button>
        {agentIds.map((aid) => (
          <button key={aid} className={`brit-wr-chip${agentFilter === aid ? ' on' : ''}`} onClick={() => setAgentFilter(aid)}>
            {AGENTS_CONFIG[aid].flag} {he ? AGENTS_CONFIG[aid].nameHe : AGENTS_CONFIG[aid].name}
          </button>
        ))}
      </div>

      {/* Position chips */}
      <div className="brit-wr-chips">
        <button className={`brit-wr-chip gold${posFilter === 'all' ? ' on' : ''}`} onClick={() => setPosFilter('all')}>
          {he ? 'כל העמדות' : 'All positions'}
        </button>
        {availablePositions.map((code) => (
          <button key={code} className={`brit-wr-chip gold${posFilter === code ? ' on' : ''}`} onClick={() => setPosFilter(code)}>
            {displayPos(code)}
          </button>
        ))}
      </div>

      {error && <div className="brit-wr-error">{error}</div>}

      {loading && <div className="brit-wr-placeholder">{he ? 'מתחבר לרשת הסוכנים…' : 'Connecting to agent network…'}</div>}

      {!loading && visible.length === 0 && (
        <div className="brit-wr-placeholder">
          {he ? 'אין פרופילים עדיין. הסוכנים רצים כל 3 ימים.' : 'No profiles yet. Agents run every 3 days.'}
        </div>
      )}

      {!loading && Object.entries(grouped).map(([agentId, list]) => {
        const cfg = AGENTS_CONFIG[agentId as AgentId];
        return (
          <section key={agentId} className="brit-wr-agentsec">
            <div className="brit-wr-agenthead">
              <span className="flag">{cfg?.flag || '🌍'}</span>
              <b>{(he ? cfg?.nameHe : cfg?.name) || agentId}</b>
              <span className="live"><span className="d" />{list.length} {he ? 'שחקנים' : 'players'}</span>
            </div>
            <div className="brit-wr-agentbody">
              {list.map((p) => {
                const isAdding = addingUrl === p.tmProfileUrl;
                return (
                  <div key={p.id} className="brit-wr-arow">
                    <img
                      src={p.profileImage || TM_DEFAULT_IMG}
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).src = TM_DEFAULT_IMG; }}
                    />
                    <div className="abody">
                      <div className="atop">
                        <span className="ptype">{he ? p.profileTypeLabelHe : p.profileTypeLabel}</span>
                      </div>
                      <div className="aname">{p.playerName}</div>
                      <div className="ameta">
                        {displayPos(p.position)} · {he ? 'גיל' : 'Age'} {p.age} · {p.marketValue}{p.club ? ` · ${p.club}` : ''}{p.league ? ` · ${p.league}` : ''}
                      </div>
                      <div className="areason">{(he ? p.scoutExplanationHe : p.scoutExplanationEn) || p.matchReason}</div>
                      <div className="aacts">
                        <button
                          className={`brit-wr-thumb up${feedback[p.id] === 'up' ? ' on' : ''}`}
                          onClick={() => setProfileFeedback(p.id, 'up', p.agentId)}
                          title={he ? 'בחירה טובה' : 'Good pick'}
                        >
                          <svg viewBox="0 0 20 20"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.3v5.4a2 2 0 001.1 1.8A4 4 0 008.9 18h5.4a2 2 0 002-1.6l1.2-6A2 2 0 0015.6 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.7a4 4 0 01-.8 2.4L6.8 7.9a4 4 0 00-.8 2.4z" /></svg>
                        </button>
                        <button
                          className={`brit-wr-thumb down${feedback[p.id] === 'down' ? ' on' : ''}`}
                          onClick={() => setProfileFeedback(p.id, 'down', p.agentId)}
                          title={he ? 'לא רלוונטי' : 'Not relevant'}
                        >
                          <svg viewBox="0 0 20 20"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.7V4.2a2 2 0 00-1.1-1.8A4 4 0 0011 2H5.6a2 2 0 00-2 1.6l-1.2 6A2 2 0 004.4 12H8v4a2 2 0 002 2 1 1 0 001-1v-.7a4 4 0 01.8-2.4l1.4-1.9a4 4 0 00.8-2.4z" /></svg>
                        </button>
                        <a className="brit-wr-btn ghost" href={p.tmProfileUrl} target="_blank" rel="noopener noreferrer">TM →</a>
                        <button className="brit-wr-btn gold" onClick={() => addToShortlist(p)} disabled={isAdding}>
                          {isAdding ? (he ? 'מוסיף…' : 'Adding…') : `+ ${he ? 'מעקב' : 'Shortlist'}`}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
