'use client';

/**
 * Dashboard "Roster intelligence" — what changed on the roster this week, and who needs attention.
 *
 * A weekly background agent flags players whose situation moved (form up/down, suddenly playing,
 * fallen out of the side, output surge, value move, contract/mandate clock). Read-only: each card
 * shows the badge, the reason with real numbers, a rating sparkline, and opens a detail drawer.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { rankBoard } from '@/lib/tiering/shared';
import type { PlayerIntelDoc, Signal, SignalKind } from '@/lib/tiering/types';
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
  breaking_in: { icon: '⬆️', en: 'Playing more', he: 'משחק יותר' },
  losing_place: { icon: '🪑', en: 'Out of the side', he: 'מחוץ להרכב' },
  output_surge: { icon: '⚽', en: 'Output surge', he: 'זינוק בתפוקה' },
  value_jump: { icon: '💹', en: 'Value up', he: 'השווי עלה' },
  value_drop: { icon: '🔻', en: 'Value down', he: 'השווי ירד' },
  contract_clock: { icon: '⏳', en: 'Contract', he: 'חוזה' },
  mandate_clock: { icon: '📄', en: 'Mandate', he: 'מנדט' },
  standout_form: { icon: '⭐', en: 'Standout', he: 'בולט' },
  standout_output: { icon: '🎯', en: 'High output', he: 'תפוקה גבוהה' },
  heavy_load: { icon: '🏃', en: 'Key player', he: 'שחקן מפתח' },
};

function ago(ts: number | undefined, he: boolean): string {
  if (!ts) return '—';
  const d = Math.max(0, Math.round((Date.now() - ts) / DAY));
  if (d === 0) return he ? 'היום' : 'today';
  if (d < 14) return he ? `לפני ${d} ימים` : `${d}d ago`;
  const w = Math.round(d / 7);
  return he ? `לפני ${w} שב׳` : `${w}w ago`;
}

/** Tiny inline rating sparkline (last ~6 captures). */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 56;
  const h = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`).join(' ');
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg className="ri-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={rising ? 'var(--green)' : 'var(--red)'} strokeWidth="1.5" />
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
  const firstRun = board.length > 0 && board.every((d) => d.intel?.firstRun);

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
      <p className="ri-caption">
        {tok('ri_caption', { n: board.length })}
        {firstRun ? ` · ${t('ri_baseline')}` : ''}
      </p>

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
                  </span>
                  <span className="rk-reason">{sig(it.top)}</span>
                  <span className="rk-sub">{sub(d.playerId)}{det(it.top) ? ` · ${det(it.top)}` : ''}</span>
                </span>
                <Spark values={it.ratingSpark} />
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

function Drawer({ doc, player, onClose }: { doc: PlayerIntelDoc; player?: RosterIntelPlayer; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const he = lang === 'he';
  const it = doc.intel!;
  const c = it.current;
  const sig = (s: Signal) => (he ? s.he : s.en);
  const det = (s: Signal) => (he ? s.detailHe || s.detailEn : s.detailEn);

  const facts: { k: string; v: string }[] = [];
  if (c.rating != null) facts.push({ k: t('ri_f_rating'), v: c.rating.toFixed(2) });
  if (c.minutes != null) facts.push({ k: t('ri_f_minutes'), v: c.minutes.toLocaleString(he ? 'he-IL' : 'en-US') });
  if (c.appearances != null) facts.push({ k: t('ri_f_apps'), v: `${c.appearances}${c.lineups != null ? ` (${c.lineups} ${he ? 'הרכב' : 'st'})` : ''}` });
  if (c.goals != null || c.assists != null) facts.push({ k: t('ri_f_ga'), v: `${c.goals ?? 0}G / ${c.assists ?? 0}A` });
  if (c.league) facts.push({ k: t('ri_f_league'), v: c.league });

  return (
    <>
      <div className="ri-backdrop" onClick={onClose} />
      <aside className="ri-drawer" role="dialog" aria-modal="true">
        <div className="ri-dr-h">
          <button className="ri-x" onClick={onClose} aria-label="Close">×</button>
          <small>{[(player?.positions ?? [])[0], player?.age, player?.currentClub?.clubName, player?.marketValue].filter(Boolean).join(' · ')}</small>
          <h2>{player?.fullName ?? doc.playerName}</h2>
          <div className="ri-dr-tags">
            {Spark2(it.ratingSpark)}
            <span className="ri-fitlabel">{t('ri_updated')} {it.computedAt ? new Date(it.computedAt).toLocaleDateString(he ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short' }) : '—'}</span>
          </div>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_why')}</span>{it.firstRun && <span>{t('ri_baseline')}</span>}</h4>
          <ul className="pb-why big">
            {it.signals.map((s, i) => (
              <li key={i} className={`tone-${s.tone}`}>
                <b>{he ? s.he : s.en}</b>
                {det(s) ? <><br /><span className="ri-muted">{det(s)}</span></> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_stats')}</span>{c.season ? <span>{c.season}/{(c.season + 1) % 100}</span> : null}</h4>
          <div className="ri-facts">
            {facts.map((f) => (
              <div key={f.k}><b>{f.v}</b><span>{f.k}</span></div>
            ))}
            {!facts.length && <div className="ri-muted">{t('ri_no_stats')}</div>}
          </div>
        </div>

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

  function Spark2(values: number[]) {
    if (values.length < 2) return null;
    const w = 120, h = 34, min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / span) * h}`).join(' ');
    const rising = values[values.length - 1] >= values[0];
    return (
      <svg className="ri-spark-lg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
        <polyline points={pts} fill="none" stroke={rising ? 'var(--green)' : 'var(--red)'} strokeWidth="2" />
      </svg>
    );
  }

}
