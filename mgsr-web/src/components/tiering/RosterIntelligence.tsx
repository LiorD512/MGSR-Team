'use client';

/**
 * Dashboard "Roster intelligence" module — Level & Focus.
 * Replaces the old "top 6 by market value" table. Lives inside `.brit-room` (styles in globals.css, `.ri-*`).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { EFFORT_TARGET } from '@/lib/tiering/config';
import { effectiveFocus, effectiveLevel, hasSuggestion, suggestionOf } from '@/lib/tiering/shared';
import type { Focus, Level, PlayerTierDoc } from '@/lib/tiering/types';
import { useTiering } from './useTiering';

export interface RosterIntelPlayer {
  id: string;
  fullName?: string;
  positions?: string[];
  currentClub?: { clubName?: string };
  marketValue?: string;
  age?: string;
}

type Tab = 'priority' | 'all' | 'changes';
const LEVELS: Level[] = [1, 2, 3, 4, 5];
const FOCUSES: Focus[] = [1, 2, 3, 4];
const DAY = 24 * 3600 * 1000;

const initials = (n?: string) =>
  (n || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function RosterIntelligence({ players }: { players: RosterIntelPlayer[] }) {
  const { t } = useLanguage();
  const tt = useTiering(true);
  const [tab, setTab] = useState<Tab>('priority');
  const [lvFilter, setLvFilter] = useState<Level | 0>(0);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [inbox, setInbox] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tok = (key: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key));
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  };

  const byPlayer = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const rows = useMemo(() => tt.items.filter((d) => byPlayer.has(d.playerId) && d.ai), [tt.items, byPlayer]);
  const suggestions = useMemo(() => rows.filter(hasSuggestion), [rows]);
  const highConf = suggestions.filter((d) => (d.ai?.confidence ?? 0) >= 85).length;

  const counts = LEVELS.map((l) => rows.filter((d) => effectiveLevel(d) === l).length);

  const sorted = useMemo(() => {
    let r = rows.slice();
    if (lvFilter) r = r.filter((d) => effectiveLevel(d) === lvFilter);
    if (tab === 'changes') r = r.filter(hasSuggestion);
    if (tab === 'all') r.sort((a, b) => (effectiveLevel(a) ?? 9) - (effectiveLevel(b) ?? 9) || (effectiveFocus(a) ?? 9) - (effectiveFocus(b) ?? 9));
    else r.sort((a, b) => (effectiveFocus(a) ?? 9) - (effectiveFocus(b) ?? 9) || (b.ai?.urgency ?? 0) - (a.ai?.urgency ?? 0));
    return r;
  }, [rows, tab, lvFilter]);

  const limit = tab === 'changes' || showAll ? sorted.length : 6;
  const visible = sorted.slice(0, limit);

  // Effort: share of (notes + tasks) in the last 30 days that went to Push-now players
  const effort = useMemo(() => {
    let total = 0;
    let push = 0;
    let untouchedPush = 0;
    const now = Date.now();
    rows.forEach((d) => {
      const n = (d.effort?.notes30 ?? 0) + (d.effort?.tasks30 ?? 0);
      total += n;
      if (effectiveFocus(d) === 1) {
        push += n;
        if (!d.effort?.lastTouchAt || now - d.effort.lastTouchAt > 14 * DAY) untouchedPush++;
      }
    });
    return { pct: total ? Math.round((push / total) * 100) : null, untouchedPush };
  }, [rows]);

  const nextText = (d: PlayerTierDoc) => {
    const n = d.ai?.next;
    if (!n || n.kind === 'none') return '—';
    return tok(`ri_next_${n.kind}`, { n: n.value ?? 0 });
  };
  const nextHot = (d: PlayerTierDoc) => {
    const n = d.ai?.next;
    return !!n && ((n.kind === 'mandate' && (n.value ?? 99) <= 14) || (n.kind === 'contract' && (n.value ?? 99) <= 3));
  };

  const setLevelFilter = (l: Level) => {
    setLvFilter((cur) => (cur === l ? 0 : l));
    if (tab === 'changes') setTab('all');
  };

  /* ─────────── states: loading / error / not analysed ─────────── */
  const head = (
    <div className="brit-module-head">
      <h2>{t('room_roster_intel')}</h2>
      <Link href="/players">{tok('room_view_all', { n: players.length })}</Link>
    </div>
  );

  if (tt.loading) {
    return (
      <section className="brit-module">
        {head}
        <div className="brit-empty">…</div>
      </section>
    );
  }
  if (tt.error && !rows.length) {
    return (
      <section className="brit-module">
        {head}
        <div className="brit-empty">
          {t('ri_error')} ({tt.error}) <button className="ri-link" onClick={() => tt.refresh()}>{t('ri_retry')}</button>
        </div>
      </section>
    );
  }
  if (!rows.length) {
    return (
      <section className="brit-module">
        {head}
        <div className="ri-first">
          <p>{t('ri_empty')}</p>
          <p className="ri-first-sub">{tok('ri_pending', { n: tt.pending || players.length })}</p>
          <button className="ri-btn ri-btn-gold" disabled={tt.progress.running} onClick={() => tt.runAll(tt.pending || players.length)}>
            {tt.progress.running ? tok('ri_running', { a: tt.progress.done, b: tt.progress.total }) : t('ri_run')}
          </button>
          {tt.progress.error && <p className="ri-first-sub ri-red">{tt.progress.error}</p>}
        </div>
      </section>
    );
  }

  const open = openId ? tt.items.find((d) => d.playerId === openId) : undefined;

  return (
    <section className="brit-module" aria-label={t('room_roster_intel')}>
      {head}

      {/* 1 — who do I have */}
      <div className={`ri-bar${lvFilter ? ' dim' : ''}`} role="group">
        {LEVELS.map((l, i) =>
          counts[i] ? (
            <button
              key={l}
              className={`ri-l${l}${lvFilter === l ? ' sel' : ''}`}
              style={{ flex: counts[i] }}
              onClick={() => setLevelFilter(l)}
              title={`L${l} ${t(`ri_lvl_${l}`)}`}
            >
              {counts[i]}
            </button>
          ) : null
        )}
      </div>
      <div className="ri-key">
        {LEVELS.map((l) => (
          <button key={l} className={lvFilter === l ? 'sel' : ''} onClick={() => setLevelFilter(l)}>
            <b>L{l}</b>
            {t(`ri_lvl_${l}`)}
          </button>
        ))}
      </div>

      {/* 2 — what needs me */}
      {suggestions.length > 0 && (
        <div className="ri-call">
          <div className="ri-call-icon">AI</div>
          <div>
            <b>{tok('ri_call_title', { n: suggestions.length })}</b>
            <small>{tok('ri_call_sub', { h: highConf })}</small>
          </div>
          <button onClick={() => setInbox(true)}>{t('ri_call_btn')} →</button>
        </div>
      )}

      {/* 3 — who first */}
      <div className="ri-tabs">
        <button className={tab === 'priority' ? 'on' : ''} onClick={() => { setTab('priority'); setShowAll(false); }}>{t('ri_tab_priority')}</button>
        <button className={tab === 'all' ? 'on' : ''} onClick={() => { setTab('all'); setShowAll(false); }}>{t('ri_tab_all')}</button>
        <button className={tab === 'changes' ? 'on' : ''} onClick={() => setTab('changes')}>
          {t('ri_tab_changes')}<i>{suggestions.length}</i>
        </button>
      </div>
      <div className="brit-table-wrap">
        <table className="ri-table">
          <thead>
            <tr>
              <th>{t('ri_th_player')}</th>
              <th>{t('ri_th_level')}</th>
              <th>{t('ri_th_focus')}</th>
              <th className="ri-end">{t('ri_th_next')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => {
              const p = byPlayer.get(d.playerId)!;
              const lv = effectiveLevel(d)!;
              const fc = effectiveFocus(d)!;
              const sg = hasSuggestion(d);
              return (
                <tr key={d.playerId} onClick={() => setOpenId(d.playerId)}>
                  <td className="ri-pl">
                    {p.fullName || '—'}
                    <small>{[(p.positions ?? [])[0], p.currentClub?.clubName].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td>
                    <span className={`ri-lv${sg ? ' sg' : ''}`}>
                      <b className={`ri-l${lv}`}>L{lv}</b>
                      <i className={`ri-tr ${d.ai?.trend ?? 'flat'}`}>{d.ai?.trend === 'up' ? '▲' : d.ai?.trend === 'down' ? '▼' : '●'}</i>
                    </span>
                  </td>
                  <td><FocusTag f={fc} label={t(`ri_fc_${fc}`)} /></td>
                  <td className={`ri-end ri-nx${nextHot(d) ? ' hot' : ''}`}>{nextText(d)}</td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr><td colSpan={4} className="brit-empty">—</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {tab !== 'changes' && sorted.length > 6 && (
        <div className="ri-more">
          <span>{tok('ri_showing', { a: visible.length, b: sorted.length })}</span>
          <button onClick={() => setShowAll((s) => !s)}>{showAll ? t('ri_show_less') : t('ri_show_all')}</button>
        </div>
      )}

      {/* effort */}
      <div className="ri-eff">
        <div className="ri-eff-row">
          <span>{t('ri_eff_title')}</span>
          <b>{effort.pct == null ? '—' : `${effort.pct}% / ${EFFORT_TARGET[1]}%`}</b>
        </div>
        <div className="ri-eff-track">
          <i style={{ width: `${effort.pct ?? 0}%` }} />
          <u style={{ insetInlineStart: `${EFFORT_TARGET[1]}%` }} />
        </div>
        <p>
          {effort.untouchedPush > 0 && <>{tok('ri_eff_untouched', { n: effort.untouchedPush })}<br /></>}
          {t('ri_eff_auto')}
        </p>
      </div>
      {tt.pending > 0 && (
        <div className="ri-more" style={{ borderTop: 0 }}>
          <span>{tok('ri_pending', { n: tt.pending })}</span>
          <button disabled={tt.progress.running} onClick={() => tt.runAll(tt.pending)}>
            {tt.progress.running ? tok('ri_running', { a: tt.progress.done, b: tt.progress.total }) : t('ri_run_again')}
          </button>
        </div>
      )}

      {/* drawer */}
      {open && (
        <Drawer
          doc={open}
          player={byPlayer.get(open.playerId)}
          onClose={() => setOpenId(null)}
          tt={tt}
          flash={flash}
        />
      )}

      {/* inbox */}
      {inbox && (
        <Inbox
          docs={suggestions.slice().sort((a, b) => (b.ai?.confidence ?? 0) - (a.ai?.confidence ?? 0))}
          byPlayer={byPlayer}
          tt={tt}
          flash={flash}
          onClose={() => setInbox(false)}
          onOpen={(id) => { setInbox(false); setOpenId(id); }}
        />
      )}

      {toast && <div className="ri-toast" role="status">{toast}</div>}
    </section>
  );

}

/* ───────────────────────── pieces ───────────────────────── */

function FocusTag({ f, label }: { f: Focus; label: string }) {
  return (
    <span className={`ri-fc ri-fc${f}`}>
      <s />
      {label}
    </span>
  );
}

type TT = ReturnType<typeof useTiering>;

function Drawer({
  doc,
  player,
  onClose,
  tt,
  flash,
}: {
  doc: PlayerTierDoc;
  player?: RosterIntelPlayer;
  onClose: () => void;
  tt: TT;
  flash: (m: string) => void;
}) {
  const { t, lang } = useLanguage();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ai = doc.ai!;
  const lv = effectiveLevel(doc)!;
  const fc = effectiveFocus(doc)!;
  const sg = suggestionOf(doc);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setNote('');
      flash(ok);
    } catch (e) {
      flash(`${t('ri_error')}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const signals: [string, number | undefined][] = [
    ['ri_sig_output', ai.signals.output],
    ['ri_sig_fm', ai.signals.fm],
    ['ri_sig_value', ai.signals.value],
    ['ri_sig_league', ai.signals.league],
  ];
  const lastTouchDays = doc.effort?.lastTouchAt ? Math.floor((Date.now() - doc.effort.lastTouchAt) / DAY) : null;
  const hist = (doc.history ?? []).slice().reverse();

  return (
    <>
      <div className="ri-backdrop" onClick={onClose} />
      <aside className="ri-drawer" role="dialog" aria-modal="true">
        <div className="ri-dr-h">
          <button className="ri-x" onClick={onClose} aria-label="Close">×</button>
          <small>{[(player?.positions ?? [])[0], player?.age ? `${player.age}` : null, player?.currentClub?.clubName, player?.marketValue].filter(Boolean).join(' · ')}</small>
          <h2>{player?.fullName ?? doc.playerName}</h2>
          <div className="ri-dr-tags">
            <span className="ri-lv"><b className={`ri-l${lv}`}>L{lv}</b></span>
            <FocusTag f={fc} label={t(`ri_fc_${fc}`)} />
            {doc.level == null && <span className="ri-unconf">{t('ri_unconfirmed')}</span>}
          </div>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_level')}</span><span>{t('ri_conf')} {ai.confidence}%</span></h4>
          <div className="ri-ladder">
            {LEVELS.map((l) => (
              <button
                key={l}
                disabled={busy}
                className={`${doc.level === l || (doc.level == null && lv === l) ? `cur ri-l${l}` : ''}${sg?.level === l ? ' aim' : ''}`}
                onClick={() => act(() => tt.setTags(doc.playerId, { level: l, note: note || undefined }), t('ri_saved'))}
              >
                <b>L{l}</b>
                <small>{t(`ri_lvl_${l}`)}</small>
              </button>
            ))}
          </div>
          <h4 style={{ marginTop: 20 }}><span>{t('ri_dr_focus')}</span></h4>
          <div className="ri-fseg">
            {FOCUSES.map((f) => (
              <button
                key={f}
                disabled={busy}
                className={`${doc.focus === f || (doc.focus == null && fc === f) ? `cur ri-bgf${f}` : ''}${sg?.focus === f ? ' aim' : ''}`}
                onClick={() => act(() => tt.setTags(doc.playerId, { focus: f, note: note || undefined }), t('ri_saved'))}
              >
                {t(`ri_fc_${f}`)}
              </button>
            ))}
          </div>
          {sg && (
            <div className="ri-dr-accept">
              <button className="ri-btn ri-btn-gold" disabled={busy} onClick={() => act(() => tt.accept({ playerIds: [doc.playerId] }), t('ri_saved'))}>
                {t('ri_accept')} AI
              </button>
              <button className="ri-btn" disabled={busy} onClick={() => act(() => tt.dismiss([doc.playerId]), t('ri_dismissed'))}>
                {t('ri_dismiss')}
              </button>
            </div>
          )}
        </div>

        <div className="ri-dr-s">
          <h4><span>✦ {t('ri_dr_ai')}</span><span>{ai.model === 'engine' ? 'ENGINE' : 'GEMINI 2.5'}</span></h4>
          <div className="ri-aibox">
            <p>{lang === 'he' ? ai.reasonHe || ai.reasonEn : ai.reasonEn}</p>
            {ai.evidence?.length > 0 && (
              <div className="ri-ev">{ai.evidence.map((e, i) => <div key={i}>{e}</div>)}</div>
            )}
            <button className="ri-link ri-link-gold" disabled={busy} onClick={() => act(() => tt.rerunOne(doc.playerId), t('ri_refreshed'))}>
              {t('ri_dr_rerun')}
            </button>
          </div>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_signals')}</span><span>{t('ri_score')} {ai.score}</span></h4>
          {signals.map(([k, v]) => (
            <div className="ri-sig" key={k}>
              <span>{t(k)}</span>
              <div className="ri-sig-tr"><i style={{ width: `${v ?? 0}%`, opacity: v == null ? 0.2 : 1 }} /></div>
              <span>{v == null ? '—' : v}</span>
            </div>
          ))}
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_effort')}</span><span>{t('ri_auto')}</span></h4>
          <div className="ri-touch">
            <div><b>{doc.effort?.notes30 ?? 0}</b>{t('ri_notes')}</div>
            <div><b>{doc.effort?.tasks30 ?? 0}</b>{t('ri_tasks')}</div>
            <div><b>{lastTouchDays == null ? '—' : `${lastTouchDays}d`}</b>{t('ri_last')}</div>
          </div>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_note')}</span></h4>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="ri-lock">
            <input
              type="checkbox"
              checked={!!doc.locked}
              onChange={(e) => act(() => tt.setTags(doc.playerId, { locked: e.target.checked }), t('ri_saved'))}
            />
            {t('ri_dr_lock')}
          </label>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_history')}</span></h4>
          {hist.length === 0 && <div className="ri-muted">—</div>}
          <div className="ri-tl">
            {hist.map((h, i) => (
              <div key={i}>
                <b>
                  {h.toLevel != null && h.toLevel !== h.fromLevel ? `${t('ri_dr_level')} ${h.fromLevel ? `L${h.fromLevel}` : '—'} → L${h.toLevel}` : ''}
                  {h.toLevel != null && h.toLevel !== h.fromLevel && h.toFocus != null && h.toFocus !== h.fromFocus ? ' · ' : ''}
                  {h.toFocus != null && h.toFocus !== h.fromFocus ? `${t('ri_dr_focus')} ${h.fromFocus ? t(`ri_fc_${h.fromFocus}`) : '—'} → ${t(`ri_fc_${h.toFocus}`)}` : ''}
                </b>
                <br />
                {new Date(h.at).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {h.by}
                {h.kind === 'ai-accepted' ? ` · ${t('ri_kind_ai')}` : ''}
                {h.note ? <><br />“{h.note}”</> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="ri-dr-f">
          <Link className="ri-btn ri-btn-gold" href={`/players/${doc.playerId}`}>{t('ri_dr_profile')}</Link>
        </div>
      </aside>
    </>
  );
}

function Inbox({
  docs,
  byPlayer,
  tt,
  flash,
  onClose,
  onOpen,
}: {
  docs: PlayerTierDoc[];
  byPlayer: Map<string, RosterIntelPlayer>;
  tt: TT;
  flash: (m: string) => void;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      flash(ok);
    } catch (e) {
      flash(`${t('ri_error')}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="ri-backdrop" onClick={onClose} />
      <div className="ri-modal" role="dialog" aria-modal="true">
        <button className="ri-x" onClick={onClose} aria-label="Close">×</button>
        <h2>{t('ri_modal_title')}</h2>
        <p className="ri-modal-sub">{t('ri_modal_sub')}</p>
        {docs.length > 0 && (
          <button className="ri-btn ri-btn-gold" disabled={busy} onClick={() => run(async () => { const n = await tt.accept({ minConfidence: 85 }); flash(`${n} ✓`); }, t('ri_saved'))}>
            {t('ri_accept_high')}
          </button>
        )}
        {docs.length === 0 && <div className="brit-empty">{t('ri_inbox_empty')}</div>}
        {docs.map((d) => {
          const p = byPlayer.get(d.playerId);
          const s = suggestionOf(d)!;
          const ai = d.ai!;
          return (
            <div className="ri-sg" key={d.playerId}>
              <div>
                <h3>{p?.fullName ?? d.playerName}</h3>
                <div className="ri-sg-mv">
                  {s.level != null && (
                    <>
                      {d.level != null && <span className="ri-lv"><b className={`ri-l${d.level} ri-o`}>L{d.level}</b></span>}
                      {d.level != null && <i>→</i>}
                      <span className="ri-lv"><b className={`ri-l${s.level}`}>L{s.level}</b></span>
                    </>
                  )}
                  {s.focus != null && (
                    <>
                      {d.focus != null && <FocusTag f={d.focus} label={t(`ri_fc_${d.focus}`)} />}
                      {d.focus != null && <i>→</i>}
                      <FocusTag f={s.focus} label={t(`ri_fc_${s.focus}`)} />
                    </>
                  )}
                  <span className="ri-conf">{t('ri_conf')} {ai.confidence}%</span>
                </div>
                <p><span className="ri-ai">AI</span>{lang === 'he' ? ai.reasonHe || ai.reasonEn : ai.reasonEn}</p>
              </div>
              <div className="ri-sg-ac">
                <button className="ri-btn ri-btn-gold" disabled={busy} onClick={() => run(() => tt.accept({ playerIds: [d.playerId] }), t('ri_saved'))}>{t('ri_accept')}</button>
                <button className="ri-btn" disabled={busy} onClick={() => onOpen(d.playerId)}>{t('ri_adjust')}</button>
                <button className="ri-btn" disabled={busy} onClick={() => run(() => tt.dismiss([d.playerId]), t('ri_dismissed'))}>{t('ri_dismiss')}</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
