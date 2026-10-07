'use client';

/**
 * War Room → Scout Agents — "The Director's Desk".
 *
 * An action-first decision surface, not a country-grouped list. Each pick
 * already passed through the AI Sport Director (scoutAgent → sportDirector →
 * Gemini); this screen surfaces that judgement:
 *   • the recommended action (SIGN NOW / MONITOR / LOW PRIORITY),
 *   • the Director's plain-language verdict,
 *   • the fit score, value arc, contract leverage, FM potential, and
 *   • cross-agent corroboration ("found by N scouts").
 *
 * One calm sentence up top conveys the daily scale of the 44-agent network.
 * No thumbs — the honest feedback signal is a shortlist add. Cards open a
 * dossier drawer with the full report. Rendered inside the Brit light shell.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { callShortlistAdd } from '@/lib/callables';
import { extractPlayerIdFromUrl } from '@/lib/api';
import { getPositionDisplayName } from '@/lib/appConfig';
import type { ScoutProfileResponse, ScoutRunSummary } from '@/types/scoutProfiles';

const TM_DEFAULT_IMG = 'https://img.a.transfermarkt.technology/portrait/big/default.jpg?lm=1';

function samePlayer(a: string, b: string): boolean {
  const ia = extractPlayerIdFromUrl(a);
  const ib = extractPlayerIdFromUrl(b);
  return !!ia && ia === ib;
}

function shortenPosition(pos: string | undefined): string {
  if (!pos?.trim()) return '—';
  const lower = pos.trim().toLowerCase();
  const map: Record<string, string> = {
    goalkeeper: 'GK', 'centre-back': 'CB', 'center-back': 'CB',
    'right-back': 'RB', 'left-back': 'LB', 'defensive midfield': 'DM',
    'central midfield': 'CM', 'attacking midfield': 'AM',
    'left winger': 'LW', 'right winger': 'RW', 'centre-forward': 'CF',
    'second striker': 'SS', striker: 'ST',
  };
  for (const [k, v] of Object.entries(map)) if (lower.includes(k)) return v;
  return pos.trim().split(' - ').pop()?.toUpperCase() || pos.trim().toUpperCase();
}

function timeAgo(ms: number, he: boolean): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 3600) return he ? 'ממש עכשיו' : 'just now';
  if (s < 86400) return `${Math.floor(s / 3600)}${he ? ' שע׳' : 'h ago'}`;
  return `${Math.floor(s / 86400)}${he ? ' ימים' : 'd ago'}`;
}

const fmtInt = (n: number) => n.toLocaleString('en-US');

// Director action → verdict flag class + label
type Lens = 'sign' | 'monitor' | 'all';
function actionTier(action?: string | null): 'sign' | 'monitor' | 'low' {
  if (action === 'SHORTLIST_NOW') return 'sign';
  if (action === 'LOW_PRIORITY') return 'low';
  return 'monitor';
}

export default function WarRoomScoutAgents() {
  const { user } = useAuth();
  const { lang } = useLanguage() as ReturnType<typeof useLanguage>;
  const he = lang === 'he';

  const [profiles, setProfiles] = useState<ScoutProfileResponse[]>([]);
  const [run, setRun] = useState<ScoutRunSummary | null>(null);
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lens, setLens] = useState<Lens>('sign');
  const [posFilter, setPosFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterUrls, setRosterUrls] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<ScoutProfileResponse | null>(null);

  // Shortlist + roster status (to exclude players you already have)
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

  // Load profiles + sweep funnel
  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/war-room/scout-profiles', { signal: AbortSignal.timeout(30000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProfiles(data.profiles ?? []);
      setRun(data.run ?? null);
      setLastRunAt(data.lastRunAt ?? null);
    } catch {
      setProfiles([]);
      setRun(null);
      setLastRunAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) fetchProfiles(); }, [user, fetchProfiles]);

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
      setSavedUrls((prev) => new Set(prev).add(url));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAddingUrl(null);
    }
  }, [user, rosterUrls, he]);

  // Exclude roster + shortlisted, then rank by Director fit score → match score.
  const ranked = useMemo(() => {
    const base = profiles.filter((p) => {
      const url = p.tmProfileUrl;
      if (!url) return true;
      if (Array.from(rosterUrls).some((r) => samePlayer(r, url))) return false;
      if (Array.from(shortlistUrls).some((s) => samePlayer(s, url))) return false;
      return true;
    });
    return base.sort((a, b) => {
      const fa = a.directorFitScore ?? 0;
      const fb = b.directorFitScore ?? 0;
      if (fb !== fa) return fb - fa;
      return (b.matchScore ?? 0) - (a.matchScore ?? 0);
    });
  }, [profiles, rosterUrls, shortlistUrls]);

  const counts = useMemo(() => {
    let sign = 0, monitor = 0;
    for (const p of ranked) {
      const t = actionTier(p.directorAction);
      if (t === 'sign') sign += 1;
      else if (t === 'monitor') monitor += 1;
    }
    return { sign, monitor, all: ranked.length };
  }, [ranked]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ranked.filter((p) => {
      // lens
      if (lens === 'sign' && actionTier(p.directorAction) !== 'sign') return false;
      if (lens === 'monitor' && actionTier(p.directorAction) !== 'monitor') return false;
      // position
      if (posFilter !== 'all' && shortenPosition(p.position) !== posFilter) return false;
      // search
      if (q) {
        const hay = `${p.playerName} ${p.club} ${p.league} ${p.agentName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ranked, lens, posFilter, search]);

  const positions = useMemo(() => {
    const order = ['GK', 'CB', 'RB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'CF'];
    const present = new Set<string>();
    for (const p of ranked) {
      const c = shortenPosition(p.position);
      if (c && c !== '—') present.add(c);
    }
    return order.filter((c) => present.has(c));
  }, [ranked]);

  const displayPos = (pos: string | undefined) => {
    const code = shortenPosition(pos);
    return he ? getPositionDisplayName(code, true) : code;
  };

  const laneTitle =
    lens === 'sign'
      ? (he ? <>המנהל <em>ממליץ להחתים</em></> : <>The Director is <em>telling you to sign</em></>)
      : lens === 'monitor'
        ? (he ? <>שחקנים <em>למעקב</em></> : <>Players to <em>monitor</em></>)
        : (he ? <>כל <em>ההמלצות</em></> : <>All <em>calls</em></>);

  const laneCount =
    lens === 'sign' ? `${counts.sign} ${he ? 'המלצות · לפי ציון התאמה' : 'calls · ranked by fit score'}`
      : lens === 'monitor' ? `${counts.monitor} ${he ? 'למעקב' : 'to monitor'}`
        : `${counts.all} ${he ? 'המלצות' : 'approved'}`;

  const isSaved = (url: string) => savedUrls.has(url) || Array.from(shortlistUrls).some((s) => samePlayer(s, url));

  return (
    <>
      {/* Masthead */}
      <header className="brit-masthead">
        <div className="brit-ab-mastflex">
          <div>
            <p className="brit-kicker">{he ? 'רשת פרסונות / פלטפורמת גברים' : 'Persona network / Men platform'}</p>
            <h1>{he ? 'סוכני ' : 'Scout '}<span>{he ? 'סקאוט.' : 'agents.'}</span></h1>
            <p className="brit-ra-sub">
              {he
                ? 'אלה ההמלצות — מדורגות לפי כמה המנהל הספורטיבי נוטה אליהן, לא לפי מדינה.'
                : 'These are the calls — ranked by how hard your Sport Director is leaning, not by country.'}
            </p>
          </div>
        </div>
      </header>

      {/* Scale line — the agents' daily work in one sentence */}
      {run && (
        <div className="brit-dd-scale">
          <span className="dot" />
          <p>
            {he ? (
              <>
                {run.leaguesScanned ? <>הרשת סרקה <b>{fmtInt(run.leaguesScanned)}</b> ליגות ו</> : null}
                {run.matched != null && <>העלתה <b>{fmtInt(run.matched)}</b> מועמדים. </>}
                {run.approved != null && <>המנהל אישר <b>{fmtInt(run.approved)}</b>, מתוכם <b className="go">{counts.sign} להחתמה מיידית</b>.</>}
              </>
            ) : (
              <>
                Your scout network {run.leaguesScanned ? <>swept <b>{fmtInt(run.leaguesScanned)}</b> league scans and </> : null}
                {run.matched != null && <>surfaced <b>{fmtInt(run.matched)}</b> candidates. </>}
                {run.approved != null && <>The Director backed <b>{fmtInt(run.approved)}</b> — <b className="go">{counts.sign} to sign now</b>.</>}
                {' '}Here they are.
              </>
            )}
          </p>
          {lastRunAt && <span className="ago">{timeAgo(lastRunAt, he)}</span>}
        </div>
      )}

      {error && <div className="brit-dd-error">{error}</div>}

      {/* Lane head */}
      <div className="brit-dd-lane">
        <h2>{laneTitle}</h2>
        <span className="count">{laneCount}</span>
      </div>

      {/* Filter rail */}
      <div className="brit-dd-rail">
        <div className="brit-dd-seg">
          <button className={lens === 'sign' ? 'on' : ''} onClick={() => setLens('sign')}>
            {he ? 'להחתמה' : 'Sign now'} · {counts.sign}
          </button>
          <button className={lens === 'monitor' ? 'on' : ''} onClick={() => setLens('monitor')}>
            {he ? 'מעקב' : 'Monitor'} · {counts.monitor}
          </button>
          <button className={lens === 'all' ? 'on' : ''} onClick={() => setLens('all')}>
            {he ? 'הכל' : 'All'} · {counts.all}
          </button>
        </div>
        <button className={`brit-wr-chip gold${posFilter === 'all' ? ' on' : ''}`} onClick={() => setPosFilter('all')}>
          {he ? 'כל העמדות' : 'All positions'}
        </button>
        {positions.map((code) => (
          <button key={code} className={`brit-wr-chip gold${posFilter === code ? ' on' : ''}`} onClick={() => setPosFilter(code)}>
            {he ? getPositionDisplayName(code, true) : code}
          </button>
        ))}
        <span className="spacer" />
        <label className="brit-dd-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={he ? 'שם, מועדון, ליגה או סוכן…' : 'Name, club, league or scout…'}
          />
        </label>
      </div>

      {loading && <div className="brit-dd-placeholder">{he ? 'מתחבר לרשת הסוכנים…' : 'Connecting to agent network…'}</div>}

      {!loading && visible.length === 0 && (
        <div className="brit-dd-placeholder">
          {he ? 'אין המלצות תואמות. הסוכנים רצים כל כמה ימים.' : 'No matching calls. Agents run every few days.'}
        </div>
      )}

      {/* The deck */}
      {!loading && visible.length > 0 && (
        <div className="brit-dd-deck">
          {visible.map((p) => {
            const tier = actionTier(p.directorAction);
            const arc = p.directorValueArc;
            const months = contractMonths(p.contractExpires);
            const saved = isSaved(p.tmProfileUrl);
            const adding = addingUrl === p.tmProfileUrl;
            return (
              <article key={p.id} className={`brit-dd-card ${tier}`} role="button" tabIndex={0}
                onClick={() => setDrawer(p)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawer(p); } }}>
                <div className="brit-dd-act">
                  <span className={`brit-dd-flag ${tier}`}>
                    {tier === 'sign'
                      ? <><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>{he ? 'להחתמה' : 'Sign now'}</>
                      : tier === 'low'
                        ? (he ? 'עדיפות נמוכה' : 'Low priority')
                        : <><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>{he ? 'מעקב' : 'Monitor'}</>}
                  </span>
                  {arc && (
                    <span className={`brit-dd-arc ${arc}`}>
                      <i />{arc === 'rising' ? (he ? 'ערך עולה' : 'Value rising') : arc === 'peak' ? (he ? 'בשיא' : 'At peak') : (he ? 'ערך יורד' : 'Value declining')}
                    </span>
                  )}
                  {typeof p.directorFitScore === 'number' && (
                    <span className="brit-dd-fit"><b>{p.directorFitScore}</b><small>{he ? 'התאמה' : 'fit /10'}</small></span>
                  )}
                </div>

                <div className="brit-dd-id">
                  <div className="brit-dd-pf">
                    {p.profileImage
                      ? <img src={p.profileImage} alt="" onError={(e) => { (e.target as HTMLImageElement).src = TM_DEFAULT_IMG; }} />
                      : initials(p.playerName)}
                    <span className="fl">{p.agentFlag}</span>
                  </div>
                  <div>
                    <div className="brit-dd-nm">{p.playerName}</div>
                    <div className="brit-dd-meta">{displayPos(p.position)} · {he ? 'גיל' : ''} {p.age} · {p.marketValue}</div>
                    <div className="brit-dd-loc">
                      {p.club}{p.league ? ` · ${p.league}` : ''} · {he ? p.agentNameHe : p.agentName} {he ? 'סקאוט' : 'scout'}
                    </div>
                  </div>
                </div>

                <div className="brit-dd-verdict">
                  <div className="q">
                    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 10h8M8 14h5" /></svg>
                    {he ? 'המלצת המנהל' : "Director's call"}
                  </div>
                  <p>{p.directorVerdict || p.scoutNarrative || (he ? p.scoutExplanationHe : p.scoutExplanationEn) || p.matchReason}</p>
                </div>

                <div className="brit-dd-sigs">
                  {p.corroborationCount && p.corroborationCount >= 2 && (
                    <span className="brit-dd-sig cor">
                      <svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                      {he ? `${p.corroborationCount} סוכנים` : `${p.corroborationCount} scouts`}
                    </span>
                  )}
                  {months != null && months <= 12 && (
                    <span className="brit-dd-sig hot">
                      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                      {he ? 'חוזה' : 'Contract'} <b>&nbsp;{months}{he ? ' ח׳' : 'mo'}</b>
                    </span>
                  )}
                  {typeof p.fmPa === 'number' && p.fmPa > 0 && (
                    <span className="brit-dd-sig rise">
                      <svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 7-8" /></svg>FM PA <b>&nbsp;{p.fmPa}</b>
                    </span>
                  )}
                  {typeof p.matchScore === 'number' && p.matchScore > 0 && (
                    <span className="brit-dd-sig">
                      <svg viewBox="0 0 24 24"><path d="M12 2 2 7l10 5 10-5z" /></svg>{he ? 'התאמה' : 'Match'} <b>&nbsp;{p.matchScore}</b>
                    </span>
                  )}
                </div>

                <div className="brit-dd-foot">
                  <button className="brit-dd-btn ghost" onClick={(e) => { e.stopPropagation(); setDrawer(p); }}>
                    {he ? 'דוח מלא' : 'Full report'}
                  </button>
                  <button className="brit-dd-btn gold" disabled={adding || saved}
                    onClick={(e) => { e.stopPropagation(); addToShortlist(p); }}>
                    {saved
                      ? (he ? 'נוסף ✓' : 'Added ✓')
                      : adding ? (he ? 'מוסיף…' : 'Adding…')
                        : <><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>{he ? 'מעקב' : 'Shortlist'}</>}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Dossier drawer */}
      <div className={`brit-scrim${drawer ? ' open' : ''}`} onClick={() => setDrawer(null)} />
      <aside className={`brit-drawer brit-dossier${drawer ? ' open' : ''}`}>
        {drawer && <DossierBody p={drawer} he={he} displayPos={displayPos}
          onClose={() => setDrawer(null)}
          onShortlist={() => addToShortlist(drawer)}
          saved={isSaved(drawer.tmProfileUrl)}
          adding={addingUrl === drawer.tmProfileUrl} />}
      </aside>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function DossierBody({
  p, he, displayPos, onClose, onShortlist, saved, adding,
}: {
  p: ScoutProfileResponse;
  he: boolean;
  displayPos: (pos: string | undefined) => string;
  onClose: () => void;
  onShortlist: () => void;
  saved: boolean;
  adding: boolean;
}) {
  const tier = actionTier(p.directorAction);
  const months = contractMonths(p.contractExpires);
  const actionLabel = tier === 'sign' ? (he ? 'להחתמה מיידית' : 'SIGN NOW')
    : tier === 'low' ? (he ? 'עדיפות נמוכה' : 'LOW PRIORITY') : (he ? 'מעקב' : 'MONITOR');

  return (
    <>
      <div className="brit-drawer-hero">
        {p.profileImage ? <img src={p.profileImage} alt="" onError={(e) => { (e.target as HTMLImageElement).src = TM_DEFAULT_IMG; }} /> : <div className="brit-drawer-flagbg-ph" />}
        <button className="brit-drawer-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="brit-drawer-hero-copy">
          <small>{p.agentFlag} {(he ? p.profileTypeLabelHe : p.profileTypeLabel)} · {actionLabel}</small>
          <h2>{p.playerName}</h2>
          <div style={{ fontSize: 12, color: 'var(--gold-soft)', marginTop: 6 }}>
            {displayPos(p.position)} · {he ? 'גיל' : 'Age'} {p.age}{p.intelHeight ? ` · ${p.intelHeight}` : ''}{p.intelFoot ? ` · ${p.intelFoot}` : ''} · {p.club}
          </div>
        </div>
      </div>

      <div className="brit-drawer-body">
        {/* Director verdict */}
        {(p.directorVerdict || p.scoutNarrative) && (
          <div className="brit-drawer-box">
            <div className="brit-drawer-box-head">
              <label>{he ? 'המלצת המנהל הספורטיבי' : 'Sport Director verdict'}</label>
              <span className="badge">{actionLabel}</span>
            </div>
            <p className="brit-dd-dossier-verdict">{p.directorVerdict || p.scoutNarrative}</p>
            {p.directorDataFlags && p.directorDataFlags.length > 0 && (
              <div className="brit-dd-flags">
                {p.directorDataFlags.map((f, i) => <div className="f" key={i}>⚠ {f}</div>)}
              </div>
            )}
          </div>
        )}

        {/* Corroboration */}
        {p.corroboratingAgents && p.corroboratingAgents.length >= 2 && (
          <div className="brit-drawer-box">
            <div className="brit-drawer-box-head">
              <label>{he ? 'חיזוק בין-סוכנים' : 'Scout corroboration'}</label>
            </div>
            <div className="brit-dd-corrob">
              {p.corroboratingAgents.map((a) => (
                <span className="ag" key={a.id}>{a.flag} {he ? a.nameHe : a.name}</span>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', font: '11.5px/1.4 var(--body)', color: 'var(--muted)' }}>
              {he ? 'שחקן זה עלה אצל מספר סוכנים באופן עצמאי — אות אמון חזק.' : 'Surfaced independently by multiple scouts — a strong corroboration signal.'}
            </p>
          </div>
        )}

        {/* Performance */}
        {(p.apiGoals != null || p.apiRating != null || p.goalsPer90 != null) && (
          <div className="brit-drawer-box">
            <div className="brit-drawer-box-head">
              <label>{he ? 'ביצועים · API-Football' : 'Performance · API-Football'}</label>
            </div>
            <div className="brit-dossier-grid">
              {p.apiGoals != null && <div className="brit-dossier-stat"><b>{p.apiGoals}</b><small>{he ? 'שערים' : 'goals'}</small></div>}
              {p.apiAssists != null && <div className="brit-dossier-stat"><b>{p.apiAssists}</b><small>{he ? 'בישולים' : 'assists'}</small></div>}
              {p.contribPer90 != null && <div className="brit-dossier-stat"><b>{p.contribPer90.toFixed(2)}</b><small>G+A /90</small></div>}
              {p.apiRating != null && <div className="brit-dossier-stat"><b>{p.apiRating.toFixed(1)}</b><small>{he ? 'דירוג' : 'rating'}</small></div>}
              {p.apiMinutes90s != null && <div className="brit-dossier-stat"><b>{Math.round(p.apiMinutes90s)}</b><small>{he ? 'משחקים מלאים' : 'full matches'}</small></div>}
            </div>
          </div>
        )}

        {/* Potential + Market */}
        <div className="brit-drawer-box">
          <div className="brit-drawer-box-head"><label>{he ? 'פוטנציאל ושוק' : 'Potential & market'}</label></div>
          <div className="brit-dossier-kv-list">
            {typeof p.fmPa === 'number' && p.fmPa > 0 && <KV k={he ? 'פוטנציאל FM' : 'FM potential'} v={String(p.fmPa)} />}
            {typeof p.fmCa === 'number' && p.fmCa > 0 && <KV k={he ? 'יכולת נוכחית FM' : 'FM current'} v={String(p.fmCa)} />}
            {typeof p.fmPa === 'number' && typeof p.fmCa === 'number' && p.fmPa > 0 && p.fmCa > 0 && (
              <KV k={he ? 'מרחב גדילה' : 'Headroom'} v={`+${p.fmPa - p.fmCa}`} />
            )}
            <KV k={he ? 'שווי שוק' : 'Market value'} v={p.marketValue} />
            {months != null && <KV k={he ? 'חודשים לחוזה' : 'Months left'} v={String(months)} />}
          </div>
        </div>

        {/* Real-world intel */}
        {(p.intelWage || p.intelAgent || p.intelHonours != null || p.intelClubElo != null) && (
          <div className="brit-drawer-box">
            <div className="brit-drawer-box-head"><label>{he ? 'מודיעין · TheSportsDB / ClubElo' : 'Real-world intel · TheSportsDB / ClubElo'}</label></div>
            <div className="brit-dossier-kv-list">
              {p.intelWage && <KV k={he ? 'שכר משוער' : 'Est. wage'} v={p.intelWage} />}
              {p.intelAgent && <KV k={he ? 'סוכן' : 'Agent'} v={p.intelAgent} />}
              {p.intelHonours != null && <KV k={he ? 'תארים' : 'Honours'} v={String(p.intelHonours)} />}
              {p.intelClubElo != null && <KV k={he ? 'חוזק מועדון' : 'Club strength'} v={`Elo ${p.intelClubElo}`} />}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="brit-dossier-cta">
          <a className="ghost" href={p.tmProfileUrl} target="_blank" rel="noopener noreferrer">{he ? 'פתח בטרנספרמרקט' : 'Open on Transfermarkt'}</a>
          <button className="primary" disabled={adding || saved} onClick={onShortlist}>
            {saved ? (he ? 'נוסף ✓' : 'Added ✓') : adding ? (he ? 'מוסיף…' : 'Adding…') : (he ? 'הוסף למעקב' : 'Add to shortlist')}
          </button>
        </div>
      </div>
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="brit-dossier-kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '—';
}

/** Rough months remaining from a contract-expiry string/timestamp. */
function contractMonths(contractExpires: string | number | null | undefined): number | null {
  if (contractExpires == null) return null;
  const d = typeof contractExpires === 'number' ? new Date(contractExpires) : new Date(contractExpires);
  if (isNaN(d.getTime())) return null;
  const months = Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
  return months < 0 ? 0 : months;
}
