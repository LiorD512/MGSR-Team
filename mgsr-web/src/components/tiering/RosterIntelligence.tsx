'use client';

/**
 * Dashboard "Roster intelligence" — the Push board.
 *
 *   PUSH NOW        players with time-critical reasons (mandate, contract, matching request, news, AI plan,
 *                   neglected window target). Found automatically by the background analyst.
 *   WINDOW TARGETS  players an agent marked: "we work hard on him in the next window".
 *
 * Everyone else stays off the dashboard. Styles: `.ri-*` / `.pb-*` in globals.css (scoped to .brit-room).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  daysSinceTouch,
  daysToDeadline,
  isHandled,
  isUrgent,
  liveTriggers,
  NEGLECT_DAYS,
  sortUrgent,
  windowSuggestions,
} from '@/lib/tiering/shared';
import type { CriterionKey, PlayerTierDoc, PushTiming, TierTrigger } from '@/lib/tiering/types';
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
const CRITERIA: CriterionKey[] = ['output', 'ability', 'value', 'league', 'availability'];
const URGENT_VISIBLE = 5;

function ago(ts: number | undefined, he: boolean): string {
  if (!ts) return '—';
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return he ? `לפני ${m} דק׳` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return he ? `לפני ${h} שע׳` : `${h}h ago`;
  const d = Math.round(h / 24);
  return he ? `לפני ${d} ימים` : `${d}d ago`;
}

const tx = (t: TierTrigger, he: boolean) => (he ? t.he || t.en : t.en);

export default function RosterIntelligence({ players }: { players: RosterIntelPlayer[] }) {
  const { t, lang } = useLanguage();
  const he = lang === 'he';
  const tt = useTiering(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [showAllUrgent, setShowAllUrgent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const tok = (key: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(key));
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2600);
  };
  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      flash(ok);
    } catch (e) {
      flash(`${t('ri_error')}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const byPlayer = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const docs = useMemo(() => tt.items.filter((d) => byPlayer.has(d.playerId)), [tt.items, byPlayer]);
  const now = Date.now();

  const urgent = useMemo(() => docs.filter((d) => isUrgent(d, now)).sort((a, b) => sortUrgent(a, b, now)), [docs, now]);
  const handledCount = docs.filter((d) => d.handled && isHandled(d, now)).length;
  const targets = useMemo(
    () =>
      docs
        .filter((d) => d.windowTarget)
        .sort((a, b) => (daysSinceTouch(b, now) ?? 99) - (daysSinceTouch(a, now) ?? 99)),
    [docs, now]
  );
  const suggestions = useMemo(() => windowSuggestions(docs, 3), [docs]);

  const win = useMemo(() => {
    const w = tt.meta?.windows ?? [];
    return w.find((x) => /israel/i.test(x.country)) ?? w[0];
  }, [tt.meta]);

  const name = (id: string) => byPlayer.get(id)?.fullName ?? docs.find((d) => d.playerId === id)?.playerName ?? '—';
  const sub = (id: string) => {
    const p = byPlayer.get(id);
    return [(p?.positions ?? [])[0], p?.currentClub?.clubName].filter(Boolean).join(' · ');
  };

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
  if (tt.error && !docs.length) {
    return (
      <section className="brit-module">
        {head}
        <div className="brit-empty">
          {t('ri_error')} ({tt.error}) <button className="ri-link" onClick={() => tt.refresh()}>{t('ri_retry')}</button>
        </div>
      </section>
    );
  }

  const visibleUrgent = showAllUrgent ? urgent : urgent.slice(0, URGENT_VISIBLE);
  const open = openId ? docs.find((d) => d.playerId === openId) : undefined;

  return (
    <section className="brit-module" aria-label={t('room_roster_intel')}>
      {head}

      {/* summary */}
      <div className="pb-sum">
        <a href="#pb-urgent" className={urgent.length ? 'hot' : ''}>
          <strong>{String(urgent.length).padStart(2, '0')}</strong>
          <span>{t('pb_push_now')}</span>
        </a>
        <a href="#pb-window">
          <strong>{String(targets.length).padStart(2, '0')}</strong>
          <span>{t('pb_window_targets')}</span>
        </a>
        <div className="pb-sum-win">
          {win ? (
            <>
              <strong>{win.daysLeft}d</strong>
              <span>{tok('pb_window_closes', { c: win.country })}</span>
            </>
          ) : (
            <span>{t('pb_no_window')}</span>
          )}
        </div>
      </div>

      {/* PUSH NOW */}
      <div className="pb-h" id="pb-urgent">
        <h3>{t('pb_push_now')}</h3>
        <span>{t('pb_push_now_sub')}</span>
      </div>
      {!docs.length && <div className="brit-empty">{t('ri_empty_bg')}</div>}
      {docs.length > 0 && urgent.length === 0 && (
        <div className="pb-empty">
          <b>{t('pb_nothing_urgent')}</b>
          {t('pb_nothing_urgent_sub')}
        </div>
      )}
      {visibleUrgent.map((d) => {
        const trig = liveTriggers(d, now);
        const top = trig[0];
        const dl = daysToDeadline(d, now);
        const step = d.ai?.plan ? (he ? d.ai.plan.nextStepHe || d.ai.plan.nextStepEn : d.ai.plan.nextStepEn) : '';
        return (
          <article key={d.playerId} className={`pb-item sev${top?.severity ?? 2}`}>
            <button className="pb-item-main" onClick={() => setOpenId(d.playerId)}>
              <div className="pb-item-top">
                <h4>
                  {name(d.playerId)}
                  {d.windowTarget && <em className="pb-tag">{t('pb_tag_window')}</em>}
                </h4>
                {dl != null && <time className={dl <= 7 ? 'hot' : ''}>{dl === 0 ? t('pb_today') : `${dl}d`}</time>}
              </div>
              <small>{sub(d.playerId)}{d.ai ? ` · L${d.ai.level}` : ''}</small>
              <ul className="pb-why">
                {trig.slice(0, 2).map((x, i) => (
                  <li key={i} className={`k-${x.kind}`}>{tx(x, he)}</li>
                ))}
              </ul>
              {step && <p className="pb-step">→ {step}</p>}
            </button>
            <button
              className="pb-done"
              disabled={busy === d.playerId}
              onClick={() => run(d.playerId, () => tt.act(d.playerId, 'handled'), t('pb_done_toast'))}
              title={t('pb_done_hint')}
            >
              ✓ {t('pb_done')}
            </button>
          </article>
        );
      })}
      {urgent.length > URGENT_VISIBLE && (
        <div className="ri-more">
          <span>{tok('ri_showing', { a: visibleUrgent.length, b: urgent.length })}</span>
          <button onClick={() => setShowAllUrgent((s) => !s)}>{showAllUrgent ? t('ri_show_less') : t('ri_show_all')}</button>
        </div>
      )}
      {handledCount > 0 && <div className="pb-handled">{tok('pb_handled_count', { n: handledCount })}</div>}

      {/* WINDOW TARGETS */}
      <div className="pb-h" id="pb-window">
        <h3>{t('pb_window_targets')}</h3>
        <button className="pb-add" onClick={() => setPicker(true)}>+ {t('pb_add')}</button>
      </div>
      {targets.length === 0 && (
        <div className="pb-empty">
          <b>{t('pb_no_targets')}</b>
          {t('pb_no_targets_sub')}
        </div>
      )}
      {targets.map((d) => {
        const days = daysSinceTouch(d, now);
        const sinceMarked = Math.floor((now - (d.windowTarget?.at ?? now)) / DAY);
        const neglected = (days == null ? sinceMarked : Math.min(days, sinceMarked)) >= NEGLECT_DAYS;
        const plan = d.ai?.plan;
        const line = plan ? (he ? plan.nextStepHe || plan.whenHe || plan.nextStepEn : plan.nextStepEn || plan.whenEn) : '';
        return (
          <button key={d.playerId} className="pb-target" onClick={() => setOpenId(d.playerId)}>
            <div className="pb-item-top">
              <h4>
                {name(d.playerId)}
                {d.ai && <b className={`ri-l${d.ai.level} pb-lv`}>L{d.ai.level}</b>}
                {isUrgent(d, now) && <em className="pb-tag hot">{t('pb_push_now')}</em>}
              </h4>
              <time className={neglected ? 'hot' : ''}>{days == null ? t('pb_no_contact') : tok('pb_touched', { n: days })}</time>
            </div>
            <small>{sub(d.playerId)}</small>
            {tt.analysing.has(d.playerId) ? (
              <p className="pb-step muted">{t('pb_building_plan')}</p>
            ) : line ? (
              <p className="pb-step">→ {line}</p>
            ) : null}
            {plan && plan.targets.length > 0 && <p className="pb-clubs">{t('ri_plan_targets')}: {plan.targets.join(' · ')}</p>}
          </button>
        );
      })}

      {suggestions.length > 0 && (
        <div className="pb-sugg">
          <span className="pb-sugg-h">✦ {t('pb_ai_suggests')}</span>
          {suggestions.map((d) => (
            <div key={d.playerId} className="pb-sugg-row">
              <button className="pb-sugg-name" onClick={() => setOpenId(d.playerId)}>
                {name(d.playerId)} <em>{d.ai?.windowFit?.score}</em>
                <small>{he ? d.ai?.windowFit?.reasonHe || d.ai?.windowFit?.reasonEn : d.ai?.windowFit?.reasonEn}</small>
              </button>
              <button
                className="pb-add"
                disabled={busy === d.playerId}
                onClick={() => run(d.playerId, () => tt.act(d.playerId, 'mark'), t('pb_marked_toast'))}
              >
                + {t('pb_add_short')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ri-status">
        <span className="ri-live" />
        {tt.meta?.lastRunAt ? tok('ri_last_run', { t: ago(tt.meta.lastRunAt, he) }) : t('ri_never_run')}
      </div>

      {open && (
        <Drawer
          doc={open}
          player={byPlayer.get(open.playerId)}
          onClose={() => setOpenId(null)}
          tt={tt}
          flash={flash}
        />
      )}
      {picker && (
        <Picker
          players={players}
          docs={docs}
          onClose={() => setPicker(false)}
          onPick={(id, note) => run(id, () => tt.act(id, 'mark', note), t('pb_marked_toast')).then(() => setPicker(false))}
        />
      )}
      {toast && <div className="ri-toast" role="status">{toast}</div>}
    </section>
  );
}

/* ───────────────────────── picker ───────────────────────── */

function Picker({
  players,
  docs,
  onClose,
  onPick,
}: {
  players: RosterIntelPlayer[];
  docs: PlayerTierDoc[];
  onClose: () => void;
  onPick: (id: string, note?: string) => void;
}) {
  const { t, lang } = useLanguage();
  const he = lang === 'he';
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const byId = useMemo(() => new Map(docs.map((d) => [d.playerId, d])), [docs]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return players
      .filter((p) => !byId.get(p.id)?.windowTarget)
      .filter((p) => !s || `${p.fullName ?? ''} ${p.currentClub?.clubName ?? ''}`.toLowerCase().includes(s))
      .sort((a, b) => (byId.get(b.id)?.ai?.windowFit?.score ?? -1) - (byId.get(a.id)?.ai?.windowFit?.score ?? -1))
      .slice(0, 40);
  }, [players, byId, q]);
  return (
    <>
      <div className="ri-backdrop" onClick={onClose} />
      <div className="ri-modal pb-picker" role="dialog" aria-modal="true">
        <button className="ri-x" onClick={onClose} aria-label="Close">×</button>
        <h2>{t('pb_picker_title')}</h2>
        <p className="ri-modal-sub">{t('pb_picker_sub')}</p>
        <input className="pb-search" autoFocus placeholder={t('pb_search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="pb-search" placeholder={t('ri_dr_note')} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="pb-picker-list">
          {list.map((p) => {
            const d = byId.get(p.id);
            const fit = d?.ai?.windowFit;
            return (
              <button key={p.id} className="pb-picker-row" onClick={() => onPick(p.id, note || undefined)}>
                <span>
                  <b>{p.fullName}</b>
                  <small>{[(p.positions ?? [])[0], p.currentClub?.clubName, p.marketValue].filter(Boolean).join(' · ')}</small>
                  {fit && fit.score >= 65 && <small className="pb-fit">✦ {he ? fit.reasonHe || fit.reasonEn : fit.reasonEn}</small>}
                </span>
                <span className="pb-picker-r">
                  {d?.ai && <b className={`ri-l${d.ai.level} pb-lv`}>L{d.ai.level}</b>}
                  {fit && <em>{fit.score}</em>}
                  <i>+</i>
                </span>
              </button>
            );
          })}
          {!list.length && <div className="brit-empty">—</div>}
        </div>
      </div>
    </>
  );
}

/* ───────────────────────── drawer ───────────────────────── */

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
  const he = lang === 'he';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const ai = doc.ai;
  const now = Date.now();
  const trig = liveTriggers(doc, now);
  const urgent = isUrgent(doc, now);
  const analysing = tt.analysing.has(doc.playerId);

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
  const days = daysSinceTouch(doc, now);
  const hist = (doc.history ?? []).slice().reverse();

  return (
    <>
      <div className="ri-backdrop" onClick={onClose} />
      <aside className="ri-drawer" role="dialog" aria-modal="true">
        <div className="ri-dr-h">
          <button className="ri-x" onClick={onClose} aria-label="Close">×</button>
          <small>{[(player?.positions ?? [])[0], player?.age, player?.currentClub?.clubName, player?.marketValue].filter(Boolean).join(' · ')}</small>
          <h2>{player?.fullName ?? doc.playerName}</h2>
          <div className="ri-dr-tags">
            {ai && <span className="ri-lv"><b className={`ri-l${ai.level}`}>L{ai.level}</b></span>}
            {ai && <span className="ri-unconf">{t(`ri_lvl_${ai.level}`)}</span>}
            {urgent && <em className="pb-tag hot">{t('pb_push_now')}</em>}
            {doc.windowTarget && <em className="pb-tag">{t('pb_tag_window')}</em>}
          </div>
          <div className="pb-dr-actions">
            {doc.windowTarget ? (
              <button className="ri-btn ri-btn-dark" disabled={busy} onClick={() => act(() => tt.act(doc.playerId, 'unmark', note || undefined), t('pb_unmarked_toast'))}>
                {t('pb_unmark')}
              </button>
            ) : (
              <button className="ri-btn ri-btn-gold" disabled={busy} onClick={() => act(() => tt.act(doc.playerId, 'mark', note || undefined), t('pb_marked_toast'))}>
                ★ {t('pb_mark')}
              </button>
            )}
            {urgent && (
              <button className="ri-btn ri-btn-dark" disabled={busy} onClick={() => act(() => tt.act(doc.playerId, 'handled', note || undefined), t('pb_done_toast'))}>
                ✓ {t('pb_done')}
              </button>
            )}
            {!urgent && doc.handled && isHandled(doc, now) && (
              <button className="ri-btn ri-btn-dark" disabled={busy} onClick={() => act(() => tt.act(doc.playerId, 'reopen'), t('ri_saved'))}>
                {t('pb_reopen')}
              </button>
            )}
          </div>
        </div>

        {trig.length > 0 && (
          <div className="ri-dr-s">
            <h4><span>{t('pb_why_now')}</span></h4>
            <ul className="pb-why big">
              {trig.map((x, i) => (
                <li key={i} className={`k-${x.kind} s${x.severity}`}>
                  {tx(x, he)}
                  {x.deadline && <time>{x.deadline}</time>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!ai && <div className="ri-dr-s"><div className="ri-muted">{t('ri_empty_bg')}</div></div>}

        {ai?.plan && (
          <div className="ri-dr-s">
            <h4><span>✦ {t('ri_dr_plan')}</span><span className={`ri-timing ri-t-${ai.plan.timing}`}>{t(`ri_timing_${ai.plan.timing as PushTiming}`)}</span></h4>
            <div className="ri-plan">
              {(ai.plan.nextStepEn || ai.plan.nextStepHe) && (
                <div><b>{t('pb_next_step')}</b><p className="pb-next">{he ? ai.plan.nextStepHe || ai.plan.nextStepEn : ai.plan.nextStepEn}</p></div>
              )}
              <div><b>{t('ri_plan_how')}</b><p>{he ? ai.plan.howHe || ai.plan.howEn : ai.plan.howEn}</p></div>
              <div><b>{t('ri_plan_when')}</b><p>{he ? ai.plan.whenHe || ai.plan.whenEn : ai.plan.whenEn}{ai.plan.deadline ? ` · ${ai.plan.deadline}` : ''}</p></div>
              {ai.plan.targets.length > 0 && <div><b>{t('ri_plan_targets')}</b><p>{ai.plan.targets.join(' · ')}</p></div>}
            </div>
          </div>
        )}

        {ai && (
          <div className="ri-dr-s">
            <h4><span>✦ {t('ri_dr_ai')}</span><span>{ai.model === 'engine' ? 'ENGINE' : 'GEMINI + SEARCH'} · {ago(ai.analystAt ?? ai.computedAt, he)}</span></h4>
            <div className="ri-aibox">
              <p>{he ? ai.reasonHe || ai.reasonEn : ai.reasonEn}</p>
              {ai.windowFit && (
                <div className="ri-ev"><div>{t('pb_window_fit')} {ai.windowFit.score}/100 — {he ? ai.windowFit.reasonHe || ai.windowFit.reasonEn : ai.windowFit.reasonEn}</div></div>
              )}
              <button className="ri-link ri-link-gold" disabled={analysing} onClick={() => tt.rerunOne(doc.playerId).then(() => flash(t('ri_refreshed'))).catch((e) => flash(String(e.message)))}>
                {analysing ? t('ri_analysing') : t('ri_dr_rerun')}
              </button>
            </div>
          </div>
        )}

        {ai && (
          <div className="ri-dr-s">
            <h4><span>{t('ri_dr_news')}</span><span>{ai.newsSignal > 0 ? '▲' : ai.newsSignal < 0 ? '▼' : '●'} {t('ri_news_momentum')}</span></h4>
            {(ai.news ?? []).length === 0 && <div className="ri-muted">{t('ri_news_none')}</div>}
            {(ai.news ?? []).map((n, i) => (
              <div className={`ri-news ri-ns-${n.sentiment}`} key={i}>
                <b>{n.headline}</b>
                <p>{he ? n.impactHe || n.impactEn : n.impactEn}</p>
                <small>{[n.source, n.date].filter(Boolean).join(' · ')}</small>
              </div>
            ))}
            {(ai.sources ?? []).length > 0 && (
              <div className="ri-srcs">
                {ai.sources.slice(0, 5).map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                ))}
              </div>
            )}
          </div>
        )}

        {(ai?.risks ?? []).length > 0 && (
          <div className="ri-dr-s">
            <h4><span>{t('ri_dr_risks')}</span></h4>
            {ai!.risks.map((r, i) => <div className="ri-risk" key={i}>{he ? r.he || r.en : r.en}</div>)}
          </div>
        )}

        {ai && (
          <div className="ri-dr-s">
            <h4><span>{t('pb_level_basis')}</span><span>{t('ri_score')} {ai.score} · {t('ri_coverage')} {Math.round((ai.coverage ?? 0) * 100)}%</span></h4>
            {(ai.criteria ?? []).filter((c) => CRITERIA.includes(c.key)).map((c) => (
              <div className="ri-sig" key={c.key}>
                <span>{t(`ri_crit_${c.key}`)}<em>{c.weight}%</em></span>
                <div className="ri-sig-tr"><i style={{ width: `${c.score ?? 0}%`, opacity: c.score == null ? 0.2 : 1 }} /></div>
                <span>{c.score == null ? '—' : c.score}</span>
                {c.note && <small>{c.note}</small>}
              </div>
            ))}
            {ai.adj !== 0 && <div className="ri-adj">✦ {t('ri_ai_adj')}: L{ai.baseLevel} → L{ai.level}</div>}
          </div>
        )}

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_effort')}</span><span>{t('ri_auto')}</span></h4>
          <div className="ri-touch">
            <div><b>{doc.effort?.notes30 ?? 0}</b>{t('ri_notes')}</div>
            <div><b>{doc.effort?.tasks30 ?? 0}</b>{t('ri_tasks')}</div>
            <div><b>{days == null ? '—' : `${days}d`}</b>{t('ri_last')}</div>
          </div>
        </div>

        <div className="ri-dr-s">
          <h4><span>{t('ri_dr_note')}</span></h4>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {hist.length > 0 && (
          <div className="ri-dr-s">
            <h4><span>{t('ri_dr_history')}</span></h4>
            <div className="ri-tl">
              {hist.map((h, i) => (
                <div key={i}>
                  <b>{t(`pb_hist_${h.action}`)}</b>
                  <br />
                  {new Date(h.at).toLocaleDateString(he ? 'he-IL' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · {h.by}
                  {h.note ? <><br />“{h.note}”</> : null}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ri-dr-f">
          <Link className="ri-btn ri-btn-gold" href={`/players/${doc.playerId}`}>{t('ri_dr_profile')}</Link>
        </div>
      </aside>
    </>
  );
}
