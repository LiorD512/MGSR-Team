'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { radarFetch, RadarApiError, timeAgo, fmtDateTime, type Opportunity, type OpportunitiesResponse, type SummaryResponse } from '@/lib/transferRadar/client';
import { useRadarT, levelKey, catKey } from '@/lib/transferRadar/i18n';
import { getCountryDisplayName } from '@/lib/countryTranslations';

type Show = 'all' | 'monitor' | 'loan' | 'transfer' | 'low' | 'closed';
type Sort = 'score' | 'new' | 'reliable' | 'urgent';
const lvCls = (l: string) => (l === 'High priority' ? 'High' : l === 'Low priority' ? 'Low' : l);

export function VerBadge({ v }: { v: string }) {
  const { tr } = useRadarT();
  return <span className={`tr-vb ${v}`}>{tr(`v_${v}`)}</span>;
}

export default function RadarDashboard() {
  const { tr, lang } = useRadarT();
  const router = useRouter();
  const [country, setCountry] = useState('All');
  const [show, setShow] = useState<Show>('all');
  const [days, setDays] = useState(30);
  const [sort, setSort] = useState<Sort>('score');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);

  const load = useCallback(async () => {
    const my = ++seq.current;
    try {
      const qs = new URLSearchParams({ country, show, days: String(days), sort, q: debounced, includeClosed: show === 'all' ? '1' : '0' });
      const [opp, sum] = await Promise.all([radarFetch<OpportunitiesResponse>(`opportunities?${qs}`), radarFetch<SummaryResponse>('summary')]);
      if (my !== seq.current) return;
      setData(opp); setSummary(sum); setError(null);
    } catch (e) {
      if (my !== seq.current) return;
      setError(e instanceof RadarApiError ? { code: e.code, message: e.message } : { code: 'ERROR', message: String(e) });
    } finally { if (my === seq.current) setLoading(false); }
  }, [country, show, days, sort, debounced]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 60_000); return () => clearInterval(id); }, [load]); // near-real-time: poll every 60 s

  if (error?.code === 'RADAR_NOT_CONFIGURED') return <State title={tr('not_configured_title')} text={tr('not_configured_text')} />;
  if (error?.code === 'RADAR_FORBIDDEN') return <State title={tr('forbidden_title')} text={tr('forbidden_text')} />;
  if (error) return <State title="Error" text={error.message} action={<button className="tr-btn pri" onClick={() => { setLoading(true); load(); }}>{tr('retry')}</button>} />;

  const k = summary?.kpi;
  const items = data?.items ?? [];
  const countryName = (c: string | null) => (c ? getCountryDisplayName(c, lang === 'he') : '-');
  const SHOW: [Show, string][] = [['all', 'f_all'], ['monitor', 'f_monitor'], ['loan', 'f_loan'], ['transfer', 'f_transfer'], ['low', 'f_low'], ['closed', 'f_closed']];
  const SORT: [Sort, string][] = [['score', 's_score'], ['new', 's_new'], ['reliable', 's_reliable'], ['urgent', 's_urgent']];
  const maxC = Math.max(1, ...(data?.countries ?? []).map((c) => c.n));

  return (
    <>
      <header className="brit-masthead">
        <div>
          <p className="brit-kicker">{tr('kicker')}</p>
          <h1>{tr('title_a')} <span>{tr('title_b')}</span></h1>
          <p className="tr-sub">{tr('subtitle')}</p>
          <div className="tr-meta">
            <span>{tr('last_run')}: <b>{summary?.lastRun ? `${timeAgo(summary.lastRun.started_at)} (${summary.lastRun.status})` : tr('never')}</b></span>
          </div>
        </div>
      </header>

      {k && (
        <div className="tr-kpis">
          <div><small>{tr('kpi_sources')}</small><b>{k.sources_active}</b>{k.sources_attention > 0 && <em>{k.sources_attention} {tr('kpi_attention')}</em>}</div>
          <div><small>{tr('kpi_articles')}</small><b>{Number(k.articles_30d).toLocaleString()}</b></div>
          <div><small>{tr('kpi_reports')}</small><b>{k.final_reports}</b></div>
          <div><small>{tr('kpi_opps')}</small><b>{k.opportunities}</b></div>
          <div><small>{tr('kpi_monitor')}</small><b>{k.monitor_plus}</b></div>
          <div><small>{tr('kpi_new')}</small><b>{k.new_7d}</b></div>
          <div><small>{tr('kpi_queue')}</small><b>{k.queued}</b></div>
        </div>
      )}

      <div className="tr-bar">
        <span className="tr-lbl">{tr('f_country')}</span>
        <div className="tr-chips">
          {['All', ...(data?.countries ?? []).map((c) => c.country).filter((c) => c && c !== '-')].map((c) => (
            <button key={c} className={`tr-chip${country === c ? ' on' : ''}`} onClick={() => setCountry(c)}>{c === 'All' ? tr('f_all') : countryName(c)}</button>
          ))}
        </div>
      </div>
      <div className="tr-bar">
        <span className="tr-lbl">{tr('f_show')}</span>
        <div className="tr-chips">{SHOW.map(([v, key]) => <button key={v} className={`tr-chip${show === v ? ' on' : ''}`} onClick={() => setShow(v)}>{tr(key)}</button>)}</div>
        <span className="tr-lbl">{tr('f_age')}</span>
        <div className="tr-chips">{[7, 14, 30].map((d) => <button key={d} className={`tr-chip${days === d ? ' on' : ''}`} onClick={() => setDays(d)}>{d}d</button>)}</div>
        <span className="tr-lbl">{tr('f_sort')}</span>
        <div className="tr-chips">{SORT.map(([v, key]) => <button key={v} className={`tr-chip${sort === v ? ' on' : ''}`} onClick={() => setSort(v)}>{tr(key)}</button>)}</div>
        <input className="tr-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('search')} />
      </div>

      {loading && !data ? (
        <div className="tr-state"><p>{tr('loading')}</p></div>
      ) : items.length === 0 ? (
        <State title={summary && (k?.final_reports ?? 0) === 0 ? tr('empty_title') : tr('none')} text={summary && (k?.final_reports ?? 0) === 0 ? tr('empty_text') : ''} />
      ) : (
        <table className="tr-table">
          <thead><tr>
            <th>{tr('c_score')}</th><th>{tr('c_player')}</th><th className="tr-hide-m">{tr('c_country')}</th><th className="tr-hide-m">{tr('c_signal')}</th>
            <th>{tr('c_what')}</th><th className="tr-hide-m">{tr('c_sources')}</th><th>{tr('c_status')}</th><th className="tr-hide-m">{tr('c_urgency')}</th>
          </tr></thead>
          <tbody>
            {items.map((p) => <Row key={p.playerId} p={p} onOpen={() => router.push(`/transfer-radar/players/${p.playerId}`)} countryName={countryName} />)}
          </tbody>
        </table>
      )}

      {summary && (
        <div className="tr-grid3">
          <div className="tr-pan">
            <h3>{tr('p_leads')} · {summary.leads.length}</h3>
            <p className="note">{tr('p_leads_note')}</p>
            {summary.leads.map((l) => (
              <div className="tr-it" key={l.id}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">{l.headline_en || l.title_orig}</a>
                <small>{l.outlet} · {l.club_raw || '-'} · {timeAgo(l.published_at)}</small>
              </div>
            ))}
          </div>
          <div className="tr-pan">
            <h3>{tr('p_countries')}</h3>
            {(data?.countries ?? []).filter((c) => c.country !== '-').map((c) => (
              <div className="tr-cbar" key={c.country}><span style={{ width: 130 }}>{countryName(c.country)}</span><i style={{ width: (c.n / maxC) * 110 }} />{c.n}</div>
            ))}
            <h3 style={{ marginTop: 18 }}>{tr('p_recent')}</h3>
            {summary.recent.map((r) => (
              <div className="tr-it" key={r.player_id}><a href={`/transfer-radar/players/${r.player_id}`}>{r.display_name}</a><small>{r.club_name || '-'} · {r.score} · {timeAgo(r.last_change_at)}</small></div>
            ))}
            {summary.newSources.length > 0 && <><h3 style={{ marginTop: 18 }}>{tr('p_new_sources')}</h3>
              {summary.newSources.map((s) => <div className="tr-it" key={s.id}>{s.name}<small>{s.country || '-'} · {s.status}</small></div>)}</>}
          </div>
          <div className="tr-pan">
            <h3>{tr('p_removed')} · {summary.removed.length}</h3>
            <p className="note">{tr('p_removed_note')}</p>
            {summary.removed.map((r) => (
              <div className="tr-it" key={r.id}>
                <a href={r.url} target="_blank" rel="noopener noreferrer">{r.player_raw ? `${r.player_raw} - ` : ''}{(r.headline_en || r.title_orig).slice(0, 80)}</a>
                <small>{r.drop_reason} · {r.outlet} · {fmtDateTime(r.published_at, lang)}</small>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Row({ p, onOpen, countryName }: { p: Opportunity; onOpen: () => void; countryName: (c: string | null) => string }) {
  const { tr } = useRadarT();
  return (
    <tr className={`tr-row${p.closed ? ' closed' : ''}`} onClick={onOpen}>
      <td>
        <div className="tr-score"><b>{p.score}</b><i><u style={{ width: `${p.score}%` }} /></i>
          {p.scoreDelta7d !== 0 && <span className={`tr-delta ${p.scoreDelta7d > 0 ? 'up' : 'down'}`}>{p.scoreDelta7d > 0 ? '+' : ''}{p.scoreDelta7d}</span>}
        </div>
        <span className={`tr-lv ${lvCls(p.level)}`}>{tr(levelKey(p.level))}</span>
      </td>
      <td className="tr-nm"><b>{p.displayName}</b><small>{p.clubName || '-'}</small></td>
      <td className="tr-hide-m">{countryName(p.country)}</td>
      <td className="tr-hide-m">
        {p.categories.map((c) => <span className="tr-tag" key={c}>{tr(catKey(c))}</span>)}
        {p.loanAvailable && <span className="tr-tag">{tr('f_loan')}</span>}
      </td>
      <td className="tr-what">{p.topHeadline}<small>{p.topOutlet} · {p.topTier ? `T${p.topTier} · ` : ''}{timeAgo(p.lastReportAt)}</small></td>
      <td className="tr-hide-m">{p.reportCount} {p.reportCount === 1 ? tr('report') : tr('reports')}<br /><span className="tr-sm">{p.independentOrigins} {p.independentOrigins === 1 ? tr('origin') : tr('origins')}</span></td>
      <td><VerBadge v={p.bestVerification} /></td>
      <td className="tr-hide-m"><span className={`tr-urg ${p.urgency}`}>{tr(`urg_${p.urgency}`)}</span></td>
    </tr>
  );
}

function State({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return <div className="tr-state"><h3>{title}</h3>{text ? <p>{text}</p> : null}{action}</div>;
}
