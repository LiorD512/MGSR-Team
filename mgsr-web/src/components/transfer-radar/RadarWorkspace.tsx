'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import {
  postFlag, radarFetch, RadarApiError,
  type FlagAction, type Flags, type Opportunity, type OpportunitiesResponse, type PlayerResponse, type SummaryResponse,
} from '@/lib/transferRadar/client';
import { useRadarT } from '@/lib/transferRadar/i18n';
import { DAY, FILTER_SITUATIONS, SITUATION_COLOR, TIER_ORDER, ago, isEarly, isHidden, isStale, levelOf, placeText, rejectText } from '@/lib/transferRadar/model';
import type { Situation } from '@/lib/transferRadar/situations';
import RadarDetail from './RadarDetail';
import RadarHelp from './RadarHelp';
import { Dots, EvBadge, Ico, Ring } from './RadarParts';

type Tab = 'active' | 'new' | 'loan' | 'moved' | 'leads' | 'hidden';
type SortKey = 'score' | 'new' | 'rel' | 'urg';
const TABS: Tab[] = ['active', 'new', 'loan', 'moved', 'leads', 'hidden'];
const POLL_MS = 60_000;

interface Err { code: string; message: string }
const toErr = (e: unknown): Err => (e instanceof RadarApiError ? { code: e.code, message: e.message } : { code: 'ERROR', message: String(e) });

function applyFlag(f: Flags, action: FlagAction, email: string | null, reason?: string): Flags {
  const n = { ...f };
  const info = { by: email, at: Date.now(), reason: reason ?? null };
  if (action === 'watch') n.watch = info;
  else if (action === 'unwatch') delete n.watch;
  else if (action === 'contacted') n.contacted = info;
  else if (action === 'uncontacted') delete n.contacted;
  else if (action === 'hide') n.hidden = info;
  else if (action === 'restore') delete n.hidden;
  return n;
}

/** The Transfer Radar workspace: tabs + filters + player list on one side, the full story of the selected player on the other. */
export default function RadarWorkspace({ initialId }: { initialId?: string }) {
  const { t, lang } = useRadarT();
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<Err | null>(null);
  const [tab, setTab] = useState<Tab>('active');
  const [country, setCountry] = useState('all');
  const [sits, setSits] = useState<Set<Situation>>(new Set());
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState<SortKey>('score');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(initialId ?? null);
  const [mobileOpen, setMobileOpen] = useState(!!initialId);
  const [help, setHelp] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, PlayerResponse>>({});
  const [detailErr, setDetailErr] = useState<Record<string, string>>({});
  const [fbSent, setFbSent] = useState<Set<string>>(new Set());
  const seq = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLElement | null>(null);
  const email = useRef<string | null>(null);
  const now = Date.now();

  const countryLabel = useCallback((c: string | null) => (c ? getCountryDisplayName(c, lang === 'he') : ''), [lang]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const [opp, sum] = await Promise.all([radarFetch<OpportunitiesResponse>('opportunities?limit=400'), radarFetch<SummaryResponse>('summary')]);
      if (my !== seq.current) return;
      setItems(opp.items); setSummary(sum); setError(null);
    } catch (e) { if (my === seq.current) setError(toErr(e)); }
  }, []);
  useEffect(() => { load(); const id = setInterval(load, POLL_MS); return () => clearInterval(id); }, [load]);
  useEffect(() => { import('@/lib/firebase').then((m) => { email.current = m.auth.currentUser?.email ?? null; }).catch(() => undefined); }, []);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await radarFetch<PlayerResponse>(`players/${encodeURIComponent(id)}`);
      setDetails((m) => ({ ...m, [id]: d }));
      setDetailErr((m) => { const n = { ...m }; delete n[id]; return n; });
    } catch (e) { setDetailErr((m) => ({ ...m, [id]: toErr(e).message })); }
  }, []);
  useEffect(() => { if (sel && !details[sel] && !detailErr[sel]) loadDetail(sel); }, [sel, details, detailErr, loadDetail]);

  /* ---- derived sets ---- */
  const all = items ?? [];
  const baseSet = useCallback((tb: Tab): Opportunity[] => {
    const visible = all.filter((o) => !isHidden(o));
    switch (tb) {
      case 'active': return visible.filter((o) => !o.closed);
      case 'new': return visible.filter((o) => !o.closed && now - o.firstSeenAt <= DAY);
      case 'loan': return visible.filter((o) => !o.closed && (o.loanAvailable || o.situations.includes('loan')));
      case 'moved': return visible.filter((o) => o.closed);
      case 'hidden': return all.filter(isHidden);
      default: return [];
    }
  }, [all, now]);

  const rows = useMemo(() => {
    let a = baseSet(tab === 'leads' ? 'active' : tab);
    if (country !== 'all') a = a.filter((o) => o.country === country);
    if (sits.size) a = a.filter((o) => Array.from(sits).some((k) => o.situations.includes(k)));
    if (tab !== 'moved' && tab !== 'hidden') a = a.filter((o) => now - o.lastReportAt <= days * DAY);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      a = a.filter((o) => `${o.displayName} ${o.clubName ?? ''} ${o.country ?? ''} ${countryLabel(o.country)} ${o.writtenAs ?? ''}`.toLowerCase().includes(s));
    }
    const cmp: Record<SortKey, (x: Opportunity, y: Opportunity) => number> = {
      score: (x, y) => y.score - x.score || y.lastReportAt - x.lastReportAt,
      new: (x, y) => y.lastReportAt - x.lastReportAt,
      rel: (x, y) => TIER_ORDER[x.bestTier] - TIER_ORDER[y.bestTier] || y.independentOrigins - x.independentOrigins || y.score - x.score,
      urg: (x, y) => y.lastReportAt - x.lastReportAt,
    };
    return [...a].sort(cmp[sort]);
  }, [baseSet, tab, country, sits, days, q, sort, now, countryLabel]);

  const filterBase = baseSet(tab === 'leads' ? 'active' : tab);
  const countryCounts = useMemo(() => {
    const m = new Map<string, number>();
    filterBase.forEach((o) => { if (o.country) m.set(o.country, (m.get(o.country) ?? 0) + 1); });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filterBase]);
  const sitCounts = useMemo(() => {
    const m = new Map<Situation, number>();
    filterBase.forEach((o) => o.situations.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1)));
    return m;
  }, [filterBase]);

  const leads = summary?.leads ?? [];
  const removed = summary?.removed ?? [];
  const tabCount = (tb: Tab) => (tb === 'leads' ? leads.length : tb === 'hidden' ? baseSet('hidden').length + removed.length : baseSet(tb).length);
  const filtersActive = country !== 'all' || sits.size > 0 || days !== 30 || !!q.trim();
  const clearFilters = () => { setCountry('all'); setSits(new Set()); setDays(30); setQ(''); };

  /* ---- actions ---- */
  const select = (id: string) => { setSel(id); setMobileOpen(true); };
  const selected = sel ? all.find((o) => o.playerId === sel) ?? null : null;

  const onFlag = async (o: Opportunity, action: FlagAction, reason?: string) => {
    const before = items;
    setItems((cur) => (cur ?? []).map((x) => (x.playerId === o.playerId ? { ...x, flags: applyFlag(x.flags, action, email.current, reason) } : x)));
    const msg: Record<FlagAction, string> = { watch: 't_watch', unwatch: 't_unwatch', contacted: 't_contact', uncontacted: 't_uncontact', hide: 't_hidden', restore: 't_restored' };
    say(t(msg[action]));
    try { await postFlag(o.playerId, action, reason); }
    catch (e) { setItems(before); say(toErr(e).message); }
  };

  const onFeedback = async (reportId: string, kind: 'correct' | 'incorrect' | 'outdated') => {
    setFbSent((s) => new Set(s).add(reportId));
    try { await radarFetch('feedback', { method: 'POST', body: JSON.stringify({ reportId, kind }) }); }
    catch (e) { setFbSent((s) => { const n = new Set(s); n.delete(reportId); return n; }); say(toErr(e).message); }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if ((e.target as HTMLElement).closest('input,select,textarea')) return;
    e.preventDefault();
    const i = rows.findIndex((o) => o.playerId === sel);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) { setSel(next.playerId); listRef.current?.querySelector(`[data-id="${CSS.escape(next.playerId)}"]`)?.scrollIntoView({ block: 'nearest' }); }
  };

  /* ---- full-page states ---- */
  if (error?.code === 'RADAR_NOT_CONFIGURED') return <StateBox title={t('not_configured_title')} text={t('not_configured_text')} />;
  if (error?.code === 'RADAR_FORBIDDEN') return <StateBox title={t('forbidden_title')} text={t('forbidden_text')} />;
  if (error && !items) return <StateBox title={t('retry')} text={error.message} action={<button className="rx-btn pri" onClick={load}>{t('retry')}</button>} />;
  if (!items || !summary) return <div className="tr-root"><div className="rx-ws"><div className="rx-statebox"><p className="rx-loading">{t('loading')}</p></div></div></div>;

  const noData = items.length === 0 && leads.length === 0 && removed.length === 0 && !summary.lastRun;
  const nextRun = summary.nextAnalysisAt
    ? new Date(summary.nextAnalysisAt).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    : t('st_next_none');

  const renderItem = (o: Opportunity) => {
    const color = SITUATION_COLOR[o.mainSituation];
    return (
      <button key={o.playerId} data-id={o.playerId} className={`rx-item ${color} ${sel === o.playerId ? 'sel' : ''} ${o.closed ? 'closed' : ''}`} onClick={() => select(o.playerId)}>
        <div className="rx-irow">
          <div>
            <div><span className="rx-sit"><i />{t('sit_' + o.mainSituation)}</span><span className="rx-when">{ago(t, o.lastReportAt, now)}</span></div>
            <div className="rx-nm">{o.displayName}</div>
            <div className="rx-cl">{placeText(t, o, countryLabel)}</div>
          </div>
          <div className="rx-ringwrap">
            <Ring score={o.score} closed={o.closed} />
            {(o.score >= 30 || o.closed) && <small>{t('lv_' + levelOf(o.score, o.closed)).split(' (')[0]}</small>}
          </div>
        </div>
        <div className="rx-hl">{o.topHeadline}</div>
        <div className="rx-meta">
          <EvBadge v={o.bestVerification} />
          <span className="rx-src"><Dots tier={o.bestTier} /> {o.independentOrigins === 1 ? t('g_ev_s1', { n: 1 }) : t('g_ev_sn', { n: o.independentOrigins })}</span>
          {isEarly(o, now) && <span className="rx-early"><Ico name="bolt" />{t('early')}</span>}
          {isStale(o, now) && <span className="rx-old">{t('older')}</span>}
          {o.flags.watch && <span className="rx-tag gold">{t('b_watch_done')}</span>}
          {o.flags.contacted && <span className="rx-tag">{t('b_contacted')}</span>}
        </div>
      </button>
    );
  };

  const simple = (key: string, title: string, meta: React.ReactNode, url: string) => (
    <div className="rx-simple" key={key}>
      <div className="rx-t">{title}</div>
      <div className="rx-row"><span className="rx-m">{meta}</span><a className="rx-lnk" style={{ margin: 0 }} href={url} target="_blank" rel="noopener noreferrer">{t('open')} <Ico name="ext" /></a></div>
    </div>
  );

  let listBody: React.ReactNode;
  if (tab === 'leads') {
    listBody = (
      <>
        <div className="rx-zone"><b>{t('leads_h')}</b><small>{t('leads_p')}</small></div>
        {leads.length ? leads.map((l) => simple(l.id, l.headline_en || l.title_orig, <>{l.outlet} · {l.club_raw || '-'} · {ago(t, l.published_at, now)}</>, l.url)) : <div className="rx-empty">{t('leads_none')}</div>}
      </>
    );
  } else {
    const count = <div className="rx-count">{rows.length === 1 ? t('n_player') : t('n_players', { n: rows.length })}</div>;
    let body: React.ReactNode;
    if (tab === 'active' && sort === 'score') {
      const w = rows.filter((o) => o.score >= 30), e = rows.filter((o) => o.score < 30);
      body = (
        <>
          {w.length > 0 && <><div className="rx-zone"><b>{t('zone_watch')} · {w.length}</b><small>{t('zone_watch_s')}</small></div>{w.map(renderItem)}</>}
          {e.length > 0 && <><div className="rx-zone"><b>{t('zone_early')} · {e.length}</b><small>{t('zone_early_s')}</small></div>{e.map(renderItem)}</>}
        </>
      );
    } else body = rows.map(renderItem);
    listBody = (
      <>
        {count}
        {body}
        {rows.length === 0 && tab !== 'hidden' && (noData
          ? <div className="rx-empty"><b>{t('empty_all_h')}</b>{t('empty_all_p')}</div>
          : <div className="rx-empty"><b>{t('empty_h')}</b>{t('empty_p')}</div>)}
        {tab === 'hidden' && (
          <>
            <div className="rx-zone"><b>{t('rej_h')} · {removed.length}</b><small>{t('rej_s')}</small></div>
            {removed.map((r) => simple(r.id, `${r.player_raw ? r.player_raw + ' - ' : ''}${r.headline_en || r.title_orig}`, <>{r.outlet} · {ago(t, r.published_at, now)} · <b>{rejectText(t, r.drop_reason)}</b></>, r.url))}
          </>
        )}
      </>
    );
  }

  return (
    <div className="tr-root">
      <div className={`rx-ws ${mobileOpen && selected && tab !== 'leads' ? 'open' : ''}`}>
        <div className="rx-phead">
          <div>
            <p className="rx-kick">{t('kicker')}</p>
            <h1 className="rx-title">{t('title_a')} <span>{t('title_b')}</span></h1>
          </div>
          <div className="rx-status">
            <div>{t('st_updated')}<b>{summary.lastRun ? ago(t, summary.lastRun.started_at, now) : '-'}</b></div>
            <div>{t('st_next')}<b>{nextRun}</b></div>
            <div>{t('st_cov')}<b>{t('cov', { s: summary.coverage.sources, c: summary.coverage.countries })}</b></div>
            <div>{t('st_queue')}<b>{t('queue_v', { n: Number(summary.kpi.queued ?? 0).toLocaleString() })}</b></div>
            <button className="rx-btn rx-help-link" onClick={() => setHelp(true)}><Ico name="help" /> {t('help')}</button>
          </div>
        </div>

        <div className="rx-tabrow">
          <nav className="rx-tabs" role="tablist">
            {TABS.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={`rx-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
                {t('tab_' + k)}<span className="rx-n">{tabCount(k)}</span>
              </button>
            ))}
          </nav>
          <label className="rx-search"><Ico name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} autoComplete="off" /></label>
        </div>

        {tab !== 'leads' && (
          <div className="rx-filters">
            <div className="rx-frow">
              <div className="rx-fl"><span>{t('f_country')}</span>
                <select className="rx-sel" value={country} onChange={(e) => setCountry(e.target.value)}>
                  <option value="all">{t('f_all')} ({filterBase.length})</option>
                  {countryCounts.map(([c, n]) => <option key={c} value={c}>{countryLabel(c)} ({n})</option>)}
                </select>
              </div>
              <div className="rx-fl"><span>{t('f_period')}</span>
                <div className="rx-seg">{[7, 14, 30].map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{t('d' + d)}</button>)}</div>
              </div>
              <div className="rx-fl"><span>{t('f_sort')}</span>
                <select className="rx-sel" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  {(['score', 'new', 'rel', 'urg'] as const).map((k) => <option key={k} value={k}>{t('so_' + k)}</option>)}
                </select>
              </div>
              {filtersActive && <button className="rx-clear" onClick={clearFilters}>{t('f_clear')}</button>}
            </div>
            <div className="rx-frow">
              <div className="rx-fl"><span>{t('f_sit')}</span>
                <div className="rx-chips">
                  {FILTER_SITUATIONS.filter((k) => sitCounts.get(k)).map((k) => (
                    <button key={k} className={`rx-chip ${sits.has(k) ? 'on' : ''}`} onClick={() => setSits((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}>
                      {t('sit_' + k)} <em>{sitCounts.get(k)}</em>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rx-split">
          <section className="rx-list" ref={listRef} onKeyDown={onListKey} aria-label={t('tab_' + tab)}>{listBody}</section>
          <section className="rx-detail" aria-live="polite">
            {tab === 'leads' ? (
              <div className="rx-help-card"><h3>{t('leads_h')}</h3><p>{t('leads_p')}</p></div>
            ) : selected ? (
              <RadarDetail
                key={selected.playerId}
                o={selected}
                d={details[selected.playerId] ?? null}
                loading={!details[selected.playerId] && !detailErr[selected.playerId]}
                error={detailErr[selected.playerId] ?? null}
                feedbackSent={(details[selected.playerId]?.timeline ?? []).some((e) => fbSent.has(e.reportId))}
                onBack={() => setMobileOpen(false)}
                onRetry={() => { setDetailErr((m) => { const n = { ...m }; delete n[selected.playerId]; return n; }); }}
                onFlag={(a, r) => onFlag(selected, a, r)}
                onFeedback={onFeedback}
              />
            ) : (
              <div className="rx-help-card"><h3>{t('help_tab_h')}</h3><p>{t('help_tab_p')}</p></div>
            )}
          </section>
        </div>
      </div>
      {help && <RadarHelp onClose={() => setHelp(false)} />}
      <div className={`rx-toast ${toast ? 'show' : ''}`} role="status">{toast}</div>
    </div>
  );
}

function StateBox({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return <div className="tr-root"><div className="rx-ws"><div className="rx-statebox"><h3>{title}</h3>{text ? <p>{text}</p> : null}{action}</div></div></div>;
}

