'use client';

/**
 * Dashboard "Roster intelligence" — what changed on the roster this week, from recent games.
 *
 * A weekly background agent reads each player's game-by-game log and flags movement: hot/cold form,
 * dropped from the squad, benched, breaking into the XI, output surge, back from injury, plus
 * value/contract/mandate clocks. Read-only: card shows badge + reason + a form sparkline; the drawer
 * shows the recent games behind it.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { rankBoard } from '@/lib/tiering/shared';
import type { PlayerIntelDoc, RecentGame, Signal, SignalKind } from '@/lib/tiering/types';
import { useTiering } from './useTiering';

export interface RosterIntelPlayer {
  id: string;
  fullName?: string;
  positions?: string[];
  currentClub?: { clubName?: string };
  marketValue?: string;
  age?: string;
}

const DAY = 24 * 3600 * 1000;

const BADGE: Record<SignalKind, { icon: string; en: string; he: string }> = {
  hot_form: { icon: '🔥', en: 'In form', he: 'בכושר' },
  cold_form: { icon: '📉', en: 'Form dip', he: 'ירידה בכושר' },
  dropped_squad: { icon: '🪑', en: 'Out of the squad', he: 'מחוץ לסגל' },
  benched: { icon: '🛋️', en: 'On the bench', he: 'על הספסל' },
  breaking_in: { icon: '⬆️', en: 'Breaking in', he: 'נכנס להרכב' },
  output_surge: { icon: '⚽', en: 'Output surge', he: 'זינוק בתפוקה' },
  back_from_injury: { icon: '🩹', en: 'Back in action', he: 'חזר לפעילות' },
  value_jump: { icon: '💹', en: 'Value up', he: 'השווי עלה' },
  value_drop: { icon: '🔻', en: 'Value down', he: 'השווי ירד' },
  contract_clock: { icon: '⏳', en: 'Contract', he: 'חוזה' },
  mandate_clock: { icon: '📄', en: 'Mandate', he: 'מנדט' },
};

function ago(ts: number | undefined, he: boolean): string {
  if (!ts) return '—';
  const d = Math.max(0, Math.round((Date.now() - ts) / DAY));
  if (d === 0) return he ? 'היום' : 'today';
  if (d < 14) return he ? `לפני ${d} ימים` : `${d}d ago`;
  const w = Math.round(d / 7);
  return he ? `לפני ${w} שב׳` : `${w}w ago`;
}

function Spark({ values, w = 58, h = 18, sw = 1.5 }: { values: number[]; w?: number; h?: number; sw?: number }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${(h - ((v - min) / span) * h).toFixed(1)}`).join(' ');
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg className="ri-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={rising ? 'var(--green)' : 'var(--red)'} strokeWidth={sw} />
    </svg>
  );
}

export default function RosterIntelligence({ players }: { players: RosterIntelPlayer[] }) {
  const { t, lang } = useLanguage();
  const he = lang === 'he';
  const tt = useTiering(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const tok = (key: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key));

  const byPlayer = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const docs = useMemo(() => tt.items.filter((d) => byPlayer.has(d.playerId)), [tt.items, byPlayer]);
  const board = useMemo(() => rankBoard(docs), [docs]);

  const nm = (id: string) => byPlayer.get(id)?.fullName ?? docs.find((d) => d.playerId === id)?.playerName ?? '—';
  const sub = (id: string) => {
    const p = byPlayer.get(id);
    return [(p?.positions ?? [])[0], p?.currentClub?.clubName].filter(Boolean).join(' · ');
  };
  const sig = (s: Signal) => (he ? s.he : s.en);
  const det = (s: Signal) => (he ? s.detailHe || s.detailEn : s.detailEn);

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

      <ul className="rk">
        {board.map((d) => {
          const it = d.intel!;
          const b = BADGE[it.top.kind];
          return (
            <li key={d.playerId}>
              <button className={`rk-row tone-${it.top.tone}`} onClick={() => setOpenId(d.playerId)}>
                <span className={`rk-badge t-${it.top.tone}`} title={he ? b.he : b.en}>{b.icon}</span>
                <span className="rk-main">
                  <span className="rk-top">
                    <b>{nm(d.playerId)}</b>
                    <span className={`rk-chip t-${it.top.tone}`}>{he ? b.he : b.en}</span>
                    {it.signals.length > 1 && <span className="rk-more">+{it.signals.length - 1}</span>}
                    {d.staleTmId && <span className="rk-relink" title={t('ri_stale_title')}>⚠</span>}
                  </span>
                  <span className="rk-reason">{sig(it.top)}</span>
                  <span className="rk-sub">{sub(d.playerId)}{det(it.top) ? ` · ${det(it.top)}` : ''}</span>
                </span>
                <Spark values={it.form.spark} />
              </button>
            </li>
          );
        })}
      </ul>

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
  return { txt: g.state || '—', cls: 'out' };
}

function Drawer({ doc, player, onClose }: { doc: PlayerIntelDoc; player?: RosterIntelPlayer; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const he = lang === 'he';
  const it = doc.intel!;
  const f = it.form;
  const games = doc.recentGames ?? [];

  return (
    <>
      <div className="ri-backdrop" onClick={onClose} />
      <aside className="ri-drawer" role="dialog" aria-modal="true">
        <div className="ri-dr-h">
          <button className="ri-x" onClick={onClose} aria-label="Close">×</button>
          <small>{[(player?.positions ?? [])[0], player?.age, player?.currentClub?.clubName, player?.marketValue].filter(Boolean).join(' · ')}</small>
          <h2>{player?.fullName ?? doc.playerName}</h2>
          <div className="ri-dr-tags">
            <Spark values={f.spark} w={120} h={34} sw={2} />
            <span className="ri-fitlabel">{t('ri_updated')} {it.computedAt ? new Date(it.computedAt).toLocaleDateString(he ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short' }) : '—'}</span>
          </div>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_why')}</span></h4>
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
          <h4><span>{t('ri_dr_form')}</span><span>{tok2(t('ri_form_last'), f.games)}</span></h4>
          <div className="ri-facts">
            <div><b>{f.played}/{f.games}</b><span>{t('ri_f_played')}</span></div>
            <div><b>{f.starts}</b><span>{t('ri_f_starts')}</span></div>
            <div><b>{f.goals}/{f.assists}</b><span>{t('ri_f_ga')}</span></div>
            <div><b>{f.avgGrade ?? '—'}</b><span>{t('ri_f_grade')}</span></div>
          </div>
        </div>

        {games.length > 0 && (
          <div className="ri-dr-s">
            <h4><span>{t('ri_dr_games')}</span></h4>
            <div className="ri-games">
              {games.slice(0, 8).map((g, i) => {
                const st = stateLabel(g, he);
                return (
                  <div className={`ri-game ri-g-${st.cls}`} key={i}>
                    <span className="ri-g-date">{g.date?.slice(5)}</span>
                    <span className="ri-g-comp">{g.competition}</span>
                    <span className="ri-g-state">{st.txt}</span>
                    <span className="ri-g-out">{g.goals ? `${g.goals}⚽` : ''}{g.assists ? ` ${g.assists}🅰` : ''}{g.grade != null ? ` ${g.grade}` : ''}</span>
                  </div>
                );
              })}
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
        </div>
      </aside>
    </>
  );

  function tok2(s: string, n: number) {
    return s.replace('{n}', String(n));
  }
}
