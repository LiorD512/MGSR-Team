'use client';

/**
 * Dashboard "Roster intelligence" — what changed on the roster this week, from recent games.
 *
 * A weekly background agent reads each player's game-by-game log and flags movement: hot/cold form,
 * dropped from the squad, benched, breaking into the XI, output surge, back from injury, plus
 * value/contract/mandate clocks. Read-only.
 *
 * Rows reuse the Recent-activity look (small grayscale thumb + name + reason). The drawer reuses the
 * roster dossier hero (photo | slant | club crest + market value) and links to both the MGSR
 * profile and the Transfermarkt profile.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BritFilterSheetPortal from '@/components/BritFilterSheetPortal';
import { useLanguage } from '@/contexts/LanguageContext';
import { rankBoard } from '@/lib/tiering/shared';
import { isWithoutClub } from '@/lib/tiering/engine';
import type { PlayerIntelDoc, RecentGame, Signal, SignalKind } from '@/lib/tiering/types';
import { useTiering } from './useTiering';

export interface RosterIntelPlayer {
  id: string;
  fullName?: string;
  profileImage?: string;
  tmProfile?: string;
  positions?: string[];
  currentClub?: { clubName?: string; clubLogo?: string };
  marketValue?: string;
  age?: string;
}

const DAY = 24 * 3600 * 1000;
const SQUAD_KINDS = new Set<SignalKind>(['dropped_squad', 'benched', 'breaking_in']);

const BADGE: Record<SignalKind, { en: string; he: string }> = {
  hot_form: { en: 'In form', he: 'בכושר' },
  cold_form: { en: 'Form dip', he: 'ירידה בכושר' },
  dropped_squad: { en: 'Out of the squad', he: 'מחוץ לסגל' },
  benched: { en: 'On the bench', he: 'על הספסל' },
  breaking_in: { en: 'Breaking in', he: 'נכנס להרכב' },
  output_surge: { en: 'Output surge', he: 'זינוק בתפוקה' },
  back_from_injury: { en: 'Back in action', he: 'חזר לפעילות' },
  value_jump: { en: 'Value up', he: 'השווי עלה' },
  value_drop: { en: 'Value down', he: 'השווי ירד' },
  contract_clock: { en: 'Contract', he: 'חוזה' },
  mandate_clock: { en: 'Mandate', he: 'מנדט' },
};

function ago(ts: number | undefined, he: boolean): string {
  if (!ts) return '—';
  const d = Math.max(0, Math.round((Date.now() - ts) / DAY));
  if (d === 0) return he ? 'היום' : 'today';
  if (d < 14) return he ? `לפני ${d} ימים` : `${d}d ago`;
  const w = Math.round(d / 7);
  return he ? `לפני ${w} שב׳` : `${w}w ago`;
}

function initials(s?: string): string {
  return (s || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** Transfermarkt link. If the stored id is stale, point at the live id we re-resolved (TM redirects `/-/profil/spieler/{id}`). */
function tmLink(doc: PlayerIntelDoc, player?: RosterIntelPlayer): string | null {
  if (doc.staleTmId && doc.resolvedTmId) return `https://www.transfermarkt.com/-/profil/spieler/${doc.resolvedTmId}`;
  return player?.tmProfile || doc.tmProfile || null;
}

export default function RosterIntelligence({ players }: { players: RosterIntelPlayer[] }) {
  const { t, lang } = useLanguage();
  const he = lang === 'he';
  const tt = useTiering(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const tok = (key: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key));

  const byPlayer = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  // Players without a club can't be "out of the squad" / "on the bench" / "breaking in". The worker no
  // longer emits these for them; also strip them here so docs written by older sweeps render correctly.
  const docs = useMemo(
    () =>
      tt.items
        .filter((d) => byPlayer.has(d.playerId))
        .map((d) => {
          if (!d.intel || !isWithoutClub(byPlayer.get(d.playerId)?.currentClub?.clubName)) return d;
          const signals = d.intel.signals.filter((s) => !SQUAD_KINDS.has(s.kind));
          if (signals.length === d.intel.signals.length) return d;
          if (!signals.length) return { ...d, intel: undefined };
          return { ...d, intel: { ...d.intel, signals, top: signals[0], score: signals[0].strength } };
        }),
    [tt.items, byPlayer]
  );
  const board = useMemo(() => rankBoard(docs), [docs]);

  const nm = (id: string) => byPlayer.get(id)?.fullName ?? docs.find((d) => d.playerId === id)?.playerName ?? '—';
  const sub = (id: string) => {
    const p = byPlayer.get(id);
    const value = p?.marketValue && p.marketValue.trim() !== '-' ? p.marketValue : '';
    return [
      (p?.positions ?? [])[0],
      p?.currentClub?.clubName,
      p?.age ? t('ri_age').replace('{n}', String(p.age)) : '',
      value,
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const sig = (s: Signal) => (he ? s.he : s.en);

  const head = (
    <div className="brit-module-head">
      <h2>{t('room_roster_intel')}</h2>
      <Link href="/players">{tok('room_view_all', { n: players.length })}</Link>
    </div>
  );

  if (tt.loading) return <section className="brit-module">{head}<div className="brit-empty">…</div></section>;
  if (tt.error && !docs.length)
    return (
      <section className="brit-module">
        {head}
        <div className="brit-empty">{t('ri_error')} ({tt.error}) <button className="ri-link" onClick={() => tt.refresh()}>{t('ri_retry')}</button></div>
      </section>
    );
  if (!board.length)
    return (
      <section className="brit-module">
        {head}
        <div className="ri-first">
          <p>{docs.length ? t('ri_none') : t('ri_empty_bg')}</p>
          <p className="ri-first-sub">{tt.meta?.lastRunAt ? tok('ri_last_run', { t: ago(tt.meta.lastRunAt, he) }) : t('ri_never_run')}</p>
        </div>
      </section>
    );

  const open = openId ? docs.find((d) => d.playerId === openId) : undefined;

  return (
    <section className="brit-module" aria-label={t('room_roster_intel')}>
      {head}
      <p className="ri-caption">{tok('ri_caption', { n: board.length })}</p>

      <div className="ri-list">
        {board.map((d) => {
          const it = d.intel!;
          const b = BADGE[it.top.kind];
          const p = byPlayer.get(d.playerId);
          const name = nm(d.playerId);
          return (
            <button key={d.playerId} type="button" className="brit-feed-row brit-feed-activity ri-row" onClick={() => setOpenId(d.playerId)}>
              {p?.profileImage ? (
                <img className="brit-feed-thumb" src={p.profileImage} alt={name} loading="lazy" />
              ) : (
                <div className="brit-feed-thumb brit-feed-thumb-fallback">{name.charAt(0).toUpperCase()}</div>
              )}
              <p>
                <strong>{name}</strong>
                <em className="ri-reason">{sig(it.top)}</em>
                {it.signals.length > 1 ? (
                  <em className="ri-also">{t('ri_also')}: {it.signals.slice(1).map(sig).join(' · ')}</em>
                ) : null}
                {sub(d.playerId) ? <small className="ri-sub">{sub(d.playerId)}</small> : null}
              </p>
              <span className="ri-side">
                <b className={`rk-chip t-${it.top.tone}`}>{he ? b.he : b.en}</b>
                {d.staleTmId && <i className="rk-relink" title={t('ri_stale_title')}>⚠</i>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ri-status">
        <span className="ri-live" />
        {tt.meta?.lastRunAt ? tok('ri_last_run', { t: ago(tt.meta.lastRunAt, he) }) : t('ri_never_run')}
        {' · '}{t('ri_weekly')}
      </div>

      {open && <Drawer doc={open} player={byPlayer.get(open.playerId)} onClose={() => setOpenId(null)} />}
    </section>
  );
}

/* ───────────────────────── read-only drawer ───────────────────────── */

function stateLabel(g: RecentGame, he: boolean): { txt: string; cls: string } {
  if (g.minutes >= 1 || g.state === 'played') return { txt: `${g.minutes}'${g.started ? (he ? ' פתח' : ' ST') : ''}`, cls: 'played' };
  if (/not in squad/i.test(g.state)) return { txt: he ? 'מחוץ לסגל' : 'not in squad', cls: 'out' };
  if (/in squad/i.test(g.state)) return { txt: he ? 'ספסל' : 'bench', cls: 'bench' };
  if (g.injured || /injur/i.test(g.state)) return { txt: he ? 'פצוע' : 'injured', cls: 'out' };
  return { txt: g.state || '—', cls: 'out' };
}

/** League tier / competition kind from TM's competition typeId. */
function compKind(type: number | undefined, he: boolean): string {
  switch (type) {
    case 1: return he ? 'ליגה בכירה' : 'Top tier';
    case 2: return he ? 'ליגה שנייה' : '2nd tier';
    case 3: return he ? 'ליגה שלישית' : '3rd tier';
    case 4: return he ? 'ליגה רביעית' : '4th tier';
    case 5: return he ? 'ליגה חמישית' : '5th tier';
    case 8: return he ? 'גביע' : 'Cup';
    default: return '';
  }
}

const flagUrl = (countryId?: number) => (countryId ? `https://tmssl.akamaized.net/images/flagge/tiny/${countryId}.png` : '');
const matchUrl = (gameId?: string) => (gameId ? `https://www.transfermarkt.com/spielbericht/index/spielbericht/${gameId}` : '');

function GameRow({ g, he }: { g: RecentGame; he: boolean }) {
  const st = stateLabel(g, he);
  const kind = compKind(g.competitionType, he);
  const flag = flagUrl(g.countryId);
  const href = matchUrl(g.gameId);
  const venue = g.venue === 'home' ? (he ? 'בית' : 'home') : g.venue === 'away' ? (he ? 'חוץ' : 'away') : '';
  const inner = (
    <>
      <span className="ri-g-date">{g.date?.slice(5).split('-').reverse().join('/')}</span>
      <span className="ri-g-match">
        <span className="ri-g-comp">
          {flag ? <img src={flag} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} /> : null}
          <span className="nm">{g.competitionName || g.competition}</span>
          {kind ? <span className="kind">{kind}</span> : null}
        </span>
        <span className="ri-g-opp">
          {g.opponent ? <>{he ? 'נגד' : 'vs'} <b>{g.opponent}</b></> : null}
          {venue ? <span className="ven"> · {venue}</span> : null}
          {g.score ? <span className={`res r-${g.result}`}>{g.score}</span> : null}
        </span>
      </span>
      <span className="ri-g-state">{st.txt}</span>
      <span className="ri-g-g">{g.goals > 0 ? `⚽ ${g.goals}` : '–'}</span>
      <span className="ri-g-a">{g.assists > 0 ? `🅰 ${g.assists}` : '–'}</span>
    </>
  );
  return href ? (
    <a className={`ri-game ri-g-${st.cls} ri-g-link`} href={href} target="_blank" rel="noopener noreferrer" title={he ? 'פתח את דף המשחק בטרנספרמרקט' : 'Open match sheet on Transfermarkt'}>
      {inner}
    </a>
  ) : (
    <div className={`ri-game ri-g-${st.cls}`}>{inner}</div>
  );
}

function Drawer({ doc, player, onClose }: { doc: PlayerIntelDoc; player?: RosterIntelPlayer; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const he = lang === 'he';
  const it = doc.intel!;
  const f = it.form;
  const games = doc.recentGames ?? [];
  const name = player?.fullName ?? doc.playerName ?? '—';
  const club = player?.currentClub?.clubName || '—';
  const tm = tmLink(doc, player);
  const position = (player?.positions ?? [])[0];

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portal to <body>: inside the scrolling `.brit-room` / animated `.brit-canvas`, a position:fixed
  // drawer anchors to the page's full scroll height instead of the viewport (opened off-screen).
  return (
    <BritFilterSheetPortal active isRtl={he}>
      <div className="ri-backdrop" onClick={onClose} />
      <aside className="ri-drawer" role="dialog" aria-modal="true" aria-label={name}>
        {/* Hero — same design as the roster player dossier (photo | slant | club crest + value) */}
        <div className="brit-asset-modal ri-hero">
          <button className="brit-close" onClick={onClose} aria-label={t('room_close')}>×</button>
          <section className="bam-hero">
            <div className="bam-shot">
              {player?.profileImage ? (
                <img src={player.profileImage} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
              ) : null}
            </div>
            <span className="bam-slant" aria-hidden />
            <div className="bam-clubside">
              <div className="bam-stadium" aria-hidden />
              <div className="bam-crestwrap">
                <div className="crest">
                  {player?.currentClub?.clubLogo ? (
                    <img src={player.currentClub.clubLogo} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} />
                  ) : (
                    <span className="ph">{initials(club)}</span>
                  )}
                </div>
              </div>
              <span className="clubname">{club}</span>
            </div>
            {player?.marketValue ? (
              <div className="bam-valtab">
                <div className="v">{player.marketValue}</div>
                <div className="l">{t('room_market_value')}</div>
              </div>
            ) : null}
            <div className="bam-hero-inner">
              <p className="bam-eyebrow">{club}</p>
              <h2>{name}</h2>
              <div className="bam-tags">
                {position ? <span className="tag">{position}</span> : null}
                {player?.age ? <span className="tag">{t('ri_age').replace('{n}', String(player.age))}</span> : null}
              </div>
            </div>
          </section>
        </div>

        <div className="ri-dr-s">
          <h4>
            <span>{t('ri_dr_why')}</span>
            <span>{t('ri_updated')} {it.computedAt ? new Date(it.computedAt).toLocaleDateString(he ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short' }) : '—'}</span>
          </h4>
          <ul className="pb-why big">
            {it.signals.map((s, i) => (
              <li key={i} className={`tone-${s.tone}`}>
                <b>{he ? s.he : s.en}</b>
                {(he ? s.detailHe || s.detailEn : s.detailEn) ? <><br /><span className="ri-muted">{he ? s.detailHe || s.detailEn : s.detailEn}</span></> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_form')}</span><span>{t('ri_form_last').replace('{n}', String(f.games))}</span></h4>
          <div className="ri-facts">
            <div><b>{f.played}/{f.games}</b><span>{t('ri_f_played')}</span></div>
            <div><b>{f.starts}</b><span>{t('ri_f_starts')}</span></div>
            <div><b>{f.goals}</b><span>{t('ri_f_goals')}</span></div>
            <div><b>{f.assists}</b><span>{t('ri_f_assists')}</span></div>
            <div><b>{f.avgGrade ?? '—'}</b><span>{t('ri_f_grade')}</span></div>
          </div>
        </div>

        {games.length > 0 && (
          <div className="ri-dr-s">
            <h4><span>{t('ri_dr_last4')}</span></h4>
            <div className="ri-games">
              <div className="ri-game ri-g-head">
                <span className="ri-g-date">{t('ri_g_date')}</span>
                <span className="ri-g-match">{t('ri_g_match')}</span>
                <span className="ri-g-state">{t('ri_g_status')}</span>
                <span className="ri-g-g">{t('ri_g_goals')}</span>
                <span className="ri-g-a">{t('ri_g_assists')}</span>
              </div>
              {games.slice(0, 4).map((g, i) => (
                <GameRow key={g.gameId ?? i} g={g} he={he} />
              ))}
            </div>
          </div>
        )}

        {it.noGameData && (
          <div className="ri-dr-s"><div className="ri-muted">{t('ri_no_games')}</div></div>
        )}

        {doc.staleTmId && (
          <div className="ri-dr-s">
            <div className="ri-stale">
              <b>{t('ri_stale_title')}</b>
              <span className="ri-muted">{t('ri_stale_body')}{doc.resolvedTmId ? ` (TM #${doc.resolvedTmId})` : ''}</span>
            </div>
          </div>
        )}

        {doc.lastTouchAt ? (
          <div className="ri-dr-s">
            <h4><span>{t('ri_dr_touch')}</span></h4>
            <div className="ri-muted">{t('ri_last_touch')}: {new Date(doc.lastTouchAt).toLocaleDateString(he ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        ) : null}

        <div className="ri-dr-f">
          <Link className="ri-btn ri-btn-gold" href={`/players/${doc.playerId}`}>{t('ri_dr_profile')}</Link>
          {tm ? (
            <a className="ri-btn" href={tm} target="_blank" rel="noopener noreferrer">{t('ri_dr_tm')}</a>
          ) : null}
        </div>
      </aside>
    </BritFilterSheetPortal>
  );
}
