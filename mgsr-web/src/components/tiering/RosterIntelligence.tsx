'use client';

/**
 * Dashboard "Roster intelligence" — one ranked section.
 *
 * A weekly background agent scores the whole roster. This shows only the top players worth working on
 * next window, each with the predicted level (league tier + role), a push strength, and the reasons.
 * Read-only in Phase 1 — no marking, no buttons that change data; clicking a row opens a read-only drawer.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { rankBoard } from '@/lib/tiering/shared';
import type { CriterionKey, Push, Tier, PlayerTierDoc } from '@/lib/tiering/types';
import { useTiering } from './useTiering';

export interface RosterIntelPlayer {
  id: string;
  fullName?: string;
  positions?: string[];
  currentClub?: { clubName?: string };
  marketValue?: string;
  age?: string;
}

const CRITERIA: CriterionKey[] = ['output', 'ability', 'value', 'league'];
const DAY = 24 * 3600 * 1000;
const PUSH_RANK: Record<Push, number> = { now: 3, high: 2, medium: 1, low: 0 };

function ago(ts: number | undefined, he: boolean): string {
  if (!ts) return '—';
  const d = Math.max(0, Math.round((Date.now() - ts) / DAY));
  if (d === 0) return he ? 'היום' : 'today';
  if (d < 14) return he ? `לפני ${d} ימים` : `${d}d ago`;
  const w = Math.round(d / 7);
  return he ? `לפני ${w} שב׳` : `${w}w ago`;
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
  const win = useMemo(() => {
    const w = tt.meta?.windows ?? [];
    return w.find((x) => /israel/i.test(x.country)) ?? w[0];
  }, [tt.meta]);

  const nm = (id: string) => byPlayer.get(id)?.fullName ?? docs.find((d) => d.playerId === id)?.playerName ?? '—';
  const sub = (id: string) => {
    const p = byPlayer.get(id);
    return [(p?.positions ?? [])[0], p?.age, p?.currentClub?.clubName].filter(Boolean).join(' · ');
  };

  const head = (
    <div className="brit-module-head">
      <h2>{t('room_roster_intel')}</h2>
      <Link href="/players">{tok('room_view_all', { n: players.length })}</Link>
    </div>
  );

  if (tt.loading) {
    return <section className="brit-module">{head}<div className="brit-empty">…</div></section>;
  }
  if (tt.error && !docs.length) {
    return (
      <section className="brit-module">
        {head}
        <div className="brit-empty">{t('ri_error')} ({tt.error}) <button className="ri-link" onClick={() => tt.refresh()}>{t('ri_retry')}</button></div>
      </section>
    );
  }
  if (!board.length) {
    return (
      <section className="brit-module">
        {head}
        <div className="ri-first">
          <p>{docs.length ? t('ri_none_worth') : t('ri_empty_bg')}</p>
          <p className="ri-first-sub">{tt.meta?.lastRunAt ? tok('ri_last_run', { t: ago(tt.meta.lastRunAt, he) }) : t('ri_never_run')}</p>
        </div>
      </section>
    );
  }

  const open = openId ? docs.find((d) => d.playerId === openId) : undefined;

  return (
    <section className="brit-module" aria-label={t('room_roster_intel')}>
      {head}
      <p className="ri-caption">
        {tok('ri_caption', { n: board.length })}
        {win ? ` · ${tok('ri_window', { c: win.country, d: win.daysLeft })}` : ''}
      </p>

      <ol className="rk">
        {board.map((d, i) => {
          const a = d.analysis!;
          const top = a.reasons[0];
          return (
            <li key={d.playerId}>
              <button className="rk-row" onClick={() => setOpenId(d.playerId)}>
                <span className="rk-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="rk-main">
                  <span className="rk-top">
                    <b>{nm(d.playerId)}</b>
                    <Tiers tier={a.fit.tier} ceiling={a.fit.ceiling} />
                    <PushBadge push={a.push} label={t(`ri_push_${a.push}`)} />
                  </span>
                  <small className="rk-fit">{he ? a.fit.labelHe : a.fit.labelEn}</small>
                  <small className="rk-sub">{sub(d.playerId)}</small>
                  {top && <span className={`rk-why w${top.weight}`}>{he ? top.he || top.en : top.en}</span>}
                </span>
                <span className="rk-worth" title={t('ri_worth')}>
                  <b>{a.worth}</b>
                  <i style={{ width: `${a.worth}%` }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="ri-status">
        <span className="ri-live" />
        {tt.meta?.lastRunAt ? tok('ri_last_run', { t: ago(tt.meta.lastRunAt, he) }) : t('ri_never_run')}
        {' · '}{t('ri_weekly')}
      </div>

      {open && <Drawer doc={open} player={byPlayer.get(open.playerId)} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function Tiers({ tier, ceiling }: { tier: Tier; ceiling: Tier }) {
  return (
    <span className="rk-tier">
      <b className={`ri-l${tier}`}>L{tier}</b>
      {ceiling < tier && <em className="rk-ceil" title="ceiling">→L{ceiling}</em>}
    </span>
  );
}
function PushBadge({ push, label }: { push: Push; label: string }) {
  return <span className={`rk-push p-${push}`}>{label}</span>;
}

/* ───────────────────────── read-only drawer ───────────────────────── */

function Drawer({ doc, player, onClose }: { doc: PlayerTierDoc; player?: RosterIntelPlayer; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const he = lang === 'he';
  const a = doc.analysis!;
  const days = doc.effort?.lastTouchAt ? Math.floor((Date.now() - doc.effort.lastTouchAt) / DAY) : null;

  return (
    <>
      <div className="ri-backdrop" onClick={onClose} />
      <aside className="ri-drawer" role="dialog" aria-modal="true">
        <div className="ri-dr-h">
          <button className="ri-x" onClick={onClose} aria-label="Close">×</button>
          <small>{[(player?.positions ?? [])[0], player?.age, player?.currentClub?.clubName, player?.marketValue].filter(Boolean).join(' · ')}</small>
          <h2>{player?.fullName ?? doc.playerName}</h2>
          <div className="ri-dr-tags">
            <span className="ri-lv"><b className={`ri-l${a.fit.tier}`}>L{a.fit.tier}</b></span>
            <span className="ri-fitlabel">{he ? a.fit.labelHe : a.fit.labelEn}</span>
            <span className={`rk-push p-${a.push}`}>{t(`ri_push_${a.push}`)}</span>
          </div>
          <div className="ri-dr-worth">
            <span>{t('ri_worth')} <b>{a.worth}</b></span>
            <span>{t('ri_urgency')} <b>{a.urgency}</b></span>
            <span>{t('ri_conf')} <b>{a.fit.confidence}%</b></span>
          </div>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_summary')}</span><span>{ago(a.computedAt, he)}</span></h4>
          <div className="ri-aibox"><p>{he ? a.summaryHe || a.summaryEn : a.summaryEn}</p></div>
        </div>

        {a.reasons.length > 0 && (
          <div className="ri-dr-s">
            <h4><span>{t('ri_dr_why')}</span></h4>
            <ul className="pb-why big">
              {a.reasons.map((r, i) => <li key={i} className={`s${r.weight}`}>{he ? r.he || r.en : r.en}</li>)}
            </ul>
          </div>
        )}

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_basis')}</span><span>{t('ri_score')} {a.score} · {t('ri_coverage')} {Math.round((a.coverage ?? 0) * 100)}%</span></h4>
          {a.criteria.filter((c) => CRITERIA.includes(c.key)).map((c) => (
            <div className="ri-sig" key={c.key}>
              <span>{t(`ri_crit_${c.key}`)}<em>{c.weight}%</em></span>
              <div className="ri-sig-tr"><i style={{ width: `${c.score ?? 0}%`, opacity: c.score == null ? 0.2 : 1 }} /></div>
              <span>{c.score == null ? '—' : c.score}</span>
              {c.note && <small>{c.note}</small>}
            </div>
          ))}
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_effort')}</span><span>{t('ri_auto')}</span></h4>
          <div className="ri-touch">
            <div><b>{doc.effort?.notes30 ?? 0}</b>{t('ri_notes')}</div>
            <div><b>{doc.effort?.tasks30 ?? 0}</b>{t('ri_tasks')}</div>
            <div><b>{days == null ? '—' : `${days}d`}</b>{t('ri_last')}</div>
          </div>
        </div>

        <div className="ri-dr-f">
          <Link className="ri-btn ri-btn-gold" href={`/players/${doc.playerId}`}>{t('ri_dr_profile')}</Link>
        </div>
      </aside>
    </>
  );
}
