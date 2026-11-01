'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { radarFetch, RadarApiError, fmtDateTime, type PlayerResponse, type TimelineItem } from '@/lib/transferRadar/client';
import { useRadarT, levelKey, catKey } from '@/lib/transferRadar/i18n';
import { VerBadge } from './RadarDashboard';
import { openWhatsAppShare } from '@/lib/whatsapp';
import { getCountryDisplayName } from '@/lib/countryTranslations';

const lvCls = (l: string) => (l === 'High priority' ? 'High' : l === 'Low priority' ? 'Low' : l);

export default function RadarProfile({ id }: { id: string }) {
  const { tr, lang } = useRadarT();
  const [d, setD] = useState<PlayerResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [thanks, setThanks] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try { setD(await radarFetch<PlayerResponse>(`players/${encodeURIComponent(id)}`)); setErr(null); }
    catch (e) { setErr(e instanceof RadarApiError ? (e.status === 404 ? 'Not found' : e.message) : String(e)); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const sendFb = async (reportId: string, kind: 'correct' | 'incorrect' | 'outdated') => {
    setThanks((t) => ({ ...t, [reportId]: true }));
    try { await radarFetch('feedback', { method: 'POST', body: JSON.stringify({ reportId, kind }) }); } catch { /* ignore */ }
  };

  if (err) return <div className="tr-state"><h3>{err}</h3><Link href="/transfer-radar" className="tr-btn">{tr('btn_back_list')}</Link></div>;
  if (!d) return <div className="tr-state"><p>{tr('loading')}</p></div>;

  const { player: p, opportunity: o, timeline, history } = d;
  const comps = o?.explanation.components ?? [];
  const confirmed = timeline.filter((t) => t.verification === 'CONFIRMED' && t.kind === 'REPORT');
  const reported = timeline.filter((t) => t.verification === 'REPORTED' && t.kind === 'REPORT');
  const rumors = timeline.filter((t) => t.verification === 'RUMOR' && t.kind === 'REPORT');
  const names = (k: string) => tr(`comp_${k}`);
  const aiText = o ? (o.closed ? tr('ai_text_closed') : [
    o.categories.length > 1 ? tr('ai_text_multi') : '',
    o.independentOrigins > 1 ? `${o.independentOrigins} ${tr('ai_text_origins')}` : tr('ai_text_single'),
    confirmed.length ? '' : tr('ai_text_unconfirmed'),
    p.contractExpires ? '' : tr('ai_text_contract'),
  ].filter(Boolean).join(' ')) : '';
  const maxH = Math.max(1, ...history.map((h) => h.score));

  return (
    <>
      <Link href="/transfer-radar" className="tr-back">&lt; {tr('back')}</Link>
      <div className="tr-ph">
        <div>
          <p className="brit-kicker">{p.country ? getCountryDisplayName(p.country, lang === 'he') + ' · ' : ''}{tr('profile_kicker')}</p>
          <h1>{p.displayName}</h1>
          <p className="tr-sub">{p.clubName || <span className="tr-unk">{tr('unknown')}</span>}{p.league ? ` · ${p.league}` : ''}</p>
          {o && (
            <div style={{ marginTop: 12 }}>
              <VerBadge v={o.bestVerification} />{' '}
              <span className="tr-tag">{o.reportCount} {o.reportCount === 1 ? tr('report') : tr('reports')}</span>
              <span className="tr-tag">{o.independentOrigins} {o.independentOrigins === 1 ? tr('origin') : tr('origins')}</span>
              <span className="tr-tag">{tr('c_urgency')}: {tr(`urg_${o.urgency}`)}</span>
              {o.categories.map((c) => <span className="tr-tag" key={c}>{tr(catKey(c))}</span>)}
              {o.closed && <span className="tr-tag" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>{tr('status_change')}</span>}
            </div>
          )}
        </div>
        {o && (
          <div className="tr-big"><b>{o.score}</b><small>/ 100 · <span className={`tr-lv ${lvCls(o.level)}`}>{tr(levelKey(o.level))}</span></small>
            {history.length > 1 && <div className="tr-spark" title="score history">{history.slice(-30).map((h, i) => <i key={i} style={{ height: `${Math.max(6, (h.score / maxH) * 100)}%` }} />)}</div>}
          </div>
        )}
      </div>

      <div className="tr-cols">
        <div>
          {o && (
            <div className="tr-sec">
              <h3>{tr('why_score')}</h3>
              {comps.map((c) => (
                <div className="tr-comp" key={c.key}>
                  <div>{names(c.key)}</div>
                  <div className="bb"><u style={{ width: `${(c.points / Math.max(1, c.max)) * 100}%` }} /></div>
                  <div className="n">{c.points}/{c.max}</div>
                  <small>{c.signal ? `${c.signal} · ${c.outlet ?? ''} (T${c.tier}, ${c.verification}) · ${tr('conf')} ${c.confidence} × ${tr('rec')} ${c.recency}` : c.note}</small>
                </div>
              ))}
              {(o.explanation.caps ?? []).map((c, i) => <div className="tr-cap" key={i}>! {c}</div>)}
              {(o.explanation.modifiers ?? []).map((c, i) => <div className="tr-cap" key={`m${i}`}>~ {c}</div>)}
            </div>
          )}

          <div className="tr-sec">
            <h3>{tr('timeline')}</h3>
            <div className="tr-tl">
              {timeline.map((t) => <Event key={t.id} t={t} lang={lang} thanks={!!thanks[t.reportId]} onFb={sendFb} />)}
            </div>
          </div>
        </div>

        <div>
          {o?.action && (
            <div className="tr-act">
              <small>{tr('next_action')}</small>{o.action}
              <div className="tr-btns">
                <button className="tr-btn" onClick={() => openWhatsAppShare(`${p.displayName}${p.clubName ? ` (${p.clubName})` : ''}\n${timeline[0]?.headlineEn ?? ''}\n${timeline[0]?.url ?? ''}`)}>{tr('share_whatsapp')}</button>
              </div>
            </div>
          )}
          <div className="tr-sec" style={{ marginTop: 16 }}>
            <h3>{tr('facts')}</h3>
            <div className="tr-kv">
              <span>{tr('confirmed')}</span><div>{confirmed.length ? confirmed.map((c) => <div key={c.id}>{c.headlineEn}</div>) : <span className="tr-unk">{tr('nothing_confirmed')}</span>}</div>
              <span>{tr('age_dob')}</span><div className="tr-unk">{p.dob || tr('unknown')}</div>
              <span>{tr('nationality')}</span><div className={p.nationalities.length ? '' : 'tr-unk'}>{p.nationalities.join(', ') || tr('unknown')}</div>
              <span>{tr('position')}</span><div className={p.position ? '' : 'tr-unk'}>{p.position || tr('unknown')}</div>
              <span>{tr('contract')}</span><div className={p.contractExpires ? '' : 'tr-unk'}>{p.contractExpires ? `${new Date(p.contractExpires).toISOString().slice(0, 10)}${p.contractVerified ? '' : ' *'}` : tr('unknown_unverified')}</div>
              <span>{tr('minutes')}</span><div className="tr-unk">{tr('unknown')}</div>
            </div>
          </div>
          <div className="tr-sec">
            <h3>{tr('reported_rumor')}</h3>
            <div className="tr-kv">
              <span>{tr('reported')}</span><div>{reported.length ? reported.slice(0, 4).map((c) => <div key={c.id} style={{ marginBottom: 8 }}>{c.headlineEn}</div>) : <span className="tr-unk">-</span>}</div>
              <span>{tr('rumor')}</span><div>{rumors.length ? rumors.slice(0, 4).map((c) => <div key={c.id} style={{ marginBottom: 8 }}>{c.headlineEn}</div>) : <span className="tr-unk">-</span>}</div>
            </div>
          </div>
          {aiText && <div className="tr-ai"><small><span className="tr-vb AI">{tr('ai_label')}</span> {tr('ai_assessment')}</small>{aiText}</div>}
        </div>
      </div>
    </>
  );
}

function Event({ t, lang, thanks, onFb }: { t: TimelineItem; lang: 'en' | 'he'; thanks: boolean; onFb: (id: string, k: 'correct' | 'incorrect' | 'outdated') => void }) {
  const { tr } = useRadarT();
  const change = t.kind === 'STATUS_CHANGE';
  return (
    <div className={`tr-ev${change ? ' chg' : ''}`}>
      <div className="d"><b>{fmtDateTime(t.at, lang)}</b> · {t.outlet} · T{t.tier} · <VerBadge v={t.verification} />{change && <span style={{ color: 'var(--red)' }}> · {tr('status_change')}</span>}{t.headlineOnly && <span> · {tr('headline_only')}</span>}</div>
      <h4>{t.headlineEn || t.titleOrig}</h4>
      <div className="o">{tr('original')}: {t.titleOrig}</div>
      {t.quote && <q>“{t.quote}”</q>}
      <div className="d">{t.signals.join(' · ')}{t.claim ? ` · ${tr('claim')}: ${t.claim}` : ''} <a className="src" href={t.url} target="_blank" rel="noopener noreferrer" style={{ marginInlineStart: 8 }}>{tr('open_source')} ↗</a>
        <span className="tr-fb">{thanks ? tr('fb_thanks') : (<>
          <button onClick={() => onFb(t.reportId, 'correct')}>{tr('fb_correct')}</button>
          <button onClick={() => onFb(t.reportId, 'incorrect')}>{tr('fb_incorrect')}</button>
          <button onClick={() => onFb(t.reportId, 'outdated')}>{tr('fb_outdated')}</button></>)}</span>
      </div>
    </div>
  );
}
