'use client';

import { useState } from 'react';
import type { FlagAction, Opportunity, PlayerResponse, TimelineItem } from '@/lib/transferRadar/client';
import { useRadarT } from '@/lib/transferRadar/i18n';
import { ACTION_KEYS, DAY, H, ago, fmtDateTime, isEarly, placeText } from '@/lib/transferRadar/model';
import { NOT_RELEVANT_REASONS, SIGNAL_TO_SITUATION } from '@/lib/transferRadar/situations';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { openWhatsAppShare } from '@/lib/whatsapp';
import { Dots, EvBadge, Ico, Meter } from './RadarParts';

interface Props {
  o: Opportunity;
  d: PlayerResponse | null;
  loading: boolean;
  error: string | null;
  feedbackSent: boolean;
  onBack: () => void;
  onRetry: () => void;
  onFlag: (action: FlagAction, reason?: string) => void;
  onFeedback: (reportId: string, kind: 'correct' | 'incorrect' | 'outdated') => void;
}

const CORE_ROWS: [string, number][] = [['availability', 25], ['exclusion', 15], ['relationship', 15], ['contract', 10], ['independence', 10]];
const OTHER_KEYS = ['playingTime', 'financial', 'replacement', 'other'];
const INDEPENDENCE_TABLE: Record<number, number> = { 1: 0, 2: 5, 3: 8, 4: 10 };
const fmtPts = (n: number) => String(Math.round(n * 10) / 10);

export default function RadarDetail({ o, d, loading, error, feedbackSent, onBack, onRetry, onFlag, onFeedback }: Props) {
  const { t, lang } = useRadarT();
  const [menu, setMenu] = useState(false);
  const now = Date.now();
  const cLabel = (c: string | null) => (c ? getCountryDisplayName(c, lang === 'he') : '');
  const timeline: TimelineItem[] = d?.timeline ?? [];
  const latest = o.closed ? timeline[0] : timeline.find((e) => e.kind === 'REPORT') ?? timeline[0];
  const hiddenInfo = o.flags.hidden;
  const hrs = (now - o.lastReportAt) / H;
  const urg = o.closed ? 'closed' : hrs <= 48 ? 'high' : hrs <= 168 ? 'med' : 'low';
  const actKey = o.action ? ACTION_KEYS[o.action] : undefined;
  const actText = actKey ? t(actKey) : o.action ?? '';
  const stale = now - o.lastReportAt > 14 * DAY;
  const whyNow = o.closed ? t('why_closed') : stale ? t('why_old', { d: Math.round((now - o.lastReportAt) / DAY) }) : o.independentOrigins < 2 ? t('why_early') : t('why_known', { n: o.independentOrigins });
  const watched = !!o.flags.watch, contacted = !!o.flags.contacted;
  const sitName = (k: string) => t('sit_' + k);

  const comps = d?.opportunity?.explanation.components ?? [];
  const caps = d?.opportunity?.explanation.caps ?? [];
  const sumRows = Math.round(comps.reduce((a, c) => a + (c.points || 0), 0));
  const otherFound = comps.filter((c) => OTHER_KEYS.includes(c.key));
  const otherPts = otherFound.reduce((a, c) => a + c.points, 0);

  const raise: string[] = [];
  if (!o.closed) {
    const n = Math.min(o.independentOrigins, 4);
    const nextPts = n < 4 ? (INDEPENDENCE_TABLE[n + 1] ?? 10) - (INDEPENDENCE_TABLE[n] ?? 0) : 0;
    if (nextPts > 0) raise.push(o.independentOrigins < 2 ? t('raise_src', { n: 2, p: nextPts }) : t('raise_src3', { p: nextPts }));
    raise.push(t('raise_contract'));
    if (o.bestVerification !== 'CONFIRMED') raise.push(t('raise_official'));
  }

  const groups = new Map<string, TimelineItem[]>();
  for (const e of timeline) { const k = e.originKey || e.outlet; const g = groups.get(k) ?? []; g.push(e); groups.set(k, g); }

  const hidReason = hiddenInfo?.reason ? t('nr_' + hiddenInfo.reason) : t('nr_other');
  const share = () => openWhatsAppShare(`${o.displayName}${o.clubName ? ` (${o.clubName})` : ''}\n${latest?.headlineEn ?? o.topHeadline ?? ''}\n${latest?.url ?? ''}`.trim());

  return (
    <>
      <div className="rx-dhead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <button className="rx-back" onClick={onBack}><Ico name="back" /> {t('back')}</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className={`rx-tag ${o.closed ? 'red' : 'gold'}`}>{sitName(o.mainSituation)}</span>
            {o.situations.filter((k) => k !== o.mainSituation).slice(0, 2).map((k) => <span key={k} className="rx-tag">{sitName(k)}</span>)}
            {isEarly(o, now) && <span className="rx-early"><Ico name="bolt" />{t('early')}</span>}
          </div>
          <h2 className="rx-dname">{o.displayName}</h2>
          <div className="rx-dsub">{placeText(t, o, cLabel)}{o.writtenAs ? <small> · {t('written')} {o.writtenAs}</small> : null}</div>
        </div>
        <div className="rx-scorebox">
          <div className="rx-big"><b>{o.score}</b><span><bdi dir="ltr">{t('score_of')}</bdi></span></div>
          <Meter score={o.score} closed={o.closed} />
        </div>
      </div>

      <div className="rx-glance">
        <div><small>{t('g_sit')}</small><b>{sitName(o.mainSituation)}</b><span>{o.situations.filter((k) => k !== o.mainSituation).map(sitName).join(' · ') || '\u00a0'}</span></div>
        <div><small>{t('g_ev')}</small><b><EvBadge v={o.bestVerification} /></b><span>{o.independentOrigins === 1 ? t('g_ev_s1', { n: 1 }) : t('g_ev_sn', { n: o.independentOrigins })} · <Dots tier={o.bestTier} /></span></div>
        <div><small>{t('g_when')}</small><b>{ago(t, o.lastReportAt, now)}</b><span>{t('g_when_s', { t: ago(t, o.firstSeenAt, now) })}</span></div>
        <div><small>{t('g_time')}</small><b>{t('time_' + urg)}</b><span>{t('time_' + urg + '_s')}</span></div>
      </div>

      {hiddenInfo ? (
        <div className="rx-next" style={{ borderColor: 'var(--rx-muted)', background: 'var(--rx-paper2)' }}>
          <h4 style={{ color: 'var(--rx-ink2)' }}><Ico name="ban" /> {t('hid_why')}</h4>
          <p className="rx-act">{hidReason}</p>
          {hiddenInfo.by && <p className="rx-why">{t('by_who', { who: hiddenInfo.by })} · {ago(t, hiddenInfo.at, now)}</p>}
          <div className="rx-btns"><button className="rx-btn pri" onClick={() => onFlag('restore')}><Ico name="undo" /> {t('b_restore')}</button></div>
        </div>
      ) : (
        <div className={`rx-next ${o.closed ? 'closed' : ''}`}>
          <h4><Ico name={o.closed ? 'flag' : 'bolt'} /> {o.closed ? t('next_closed_h') : t('next_h')}</h4>
          <p className="rx-act">{actText}</p>
          <p className="rx-why">{whyNow}</p>
          <div className="rx-btns">
            {!o.closed && (
              <button className={`rx-btn pri ${watched ? 'done' : ''}`} title={t('wl_hint')} onClick={() => onFlag(watched ? 'unwatch' : 'watch')}>
                <Ico name={watched ? 'check' : 'star'} /> {watched ? t('b_watch_done') : t('b_watch')}
              </button>
            )}
            <button className="rx-btn" onClick={share}><Ico name="share" /> {t('b_wa')}</button>
            {!o.closed && (
              <button className={`rx-btn ${contacted ? 'done' : ''}`} onClick={() => onFlag(contacted ? 'uncontacted' : 'contacted')}>
                <Ico name={contacted ? 'check' : 'phone'} /> {contacted ? t('b_contacted') : t('b_contact')}
              </button>
            )}
            <button className="rx-btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu}><Ico name="ban" /> {t('b_nr')} <Ico name="chev" /></button>
            {menu && (
              <div className="rx-menu" role="menu">
                {NOT_RELEVANT_REASONS.map((k) => <button key={k} role="menuitem" onClick={() => { setMenu(false); onFlag('hide', k); }}>{t('nr_' + k)}</button>)}
              </div>
            )}
          </div>
          {(watched || contacted) && (
            <p className="rx-why" style={{ marginTop: 10 }}>
              {watched && o.flags.watch && <>{t('b_watch_done')} · {t('by_who', { who: o.flags.watch.by ?? '-' })} · {ago(t, o.flags.watch.at, now)}</>}
              {watched && contacted ? '  |  ' : ''}
              {contacted && o.flags.contacted && <>{t('b_contacted')} · {t('by_who', { who: o.flags.contacted.by ?? '-' })} · {ago(t, o.flags.contacted.at, now)}</>}
            </p>
          )}
        </div>
      )}

      {error ? (
        <div className="rx-sec"><div className="rx-note">{error}</div><div className="rx-btns"><button className="rx-btn" onClick={onRetry}>{t('retry')}</button></div></div>
      ) : loading || !d ? (
        <div className="rx-sec"><p className="rx-lead">{t('loading')}</p></div>
      ) : (
        <>
          {latest && (
            <div className="rx-sec">
              <h3>{t('s_happened')} <span className="rx-by">{t('by_source')}</span></h3>
              <p className="rx-lead">{t('s_happened_l')}</p>
              <div className="rx-happened">
                <div className="rx-m"><b style={{ color: 'var(--rx-ink)' }}>{latest.outlet}</b> <Dots tier={latest.tier} /> <span>{t('rel_' + latest.tier)}</span> · {fmtDateTime(latest.at, lang)}</div>
                <div className="rx-t">{latest.headlineEn || latest.titleOrig}</div>
                <div className="rx-o"><b>{t('original')}:</b> {latest.titleOrig}</div>
                <a className="rx-lnk" href={latest.url} target="_blank" rel="noopener noreferrer">{t('open')} <Ico name="ext" /></a>
              </div>
            </div>
          )}

          <div className="rx-sec">
            <h3>{t('s_why', { n: o.score })} <span className="rx-by">{t('by_rule')}</span></h3>
            <p className="rx-lead">{t('s_why_l')}</p>
            {CORE_ROWS.map(([k, def]) => {
              const c = comps.find((x) => x.key === k);
              const pts = c?.points ?? 0, max = c?.max ?? def;
              let sub = t('c_' + k + '_d');
              const sit = c?.signal ? SIGNAL_TO_SITUATION[c.signal] : undefined;
              if (sit) sub = `${sitName(sit)} · ${c?.outlet ?? ''} (${t('ev_' + String(c?.verification ?? 'reported').toLowerCase())})`;
              if (k === 'independence') sub = `${o.independentOrigins === 1 ? t('g_ev_s1', { n: 1 }) : t('g_ev_sn', { n: o.independentOrigins })} · ${t('c_independence_d')}`;
              return (
                <div key={k} className={`rx-why-row ${pts > 0 ? '' : 'zero'}`}>
                  <span className="rx-ck">{pts > 0 ? <Ico name="check" /> : '—'}</span>
                  <div><b>{t('c_' + k)}</b><small>{sub}</small></div>
                  <div className="rx-pbar"><u style={{ width: `${max ? (pts / max) * 100 : 0}%` }} /></div>
                  <div className="rx-pts">{fmtPts(pts)}<small> / {max}</small></div>
                </div>
              );
            })}
            <div className={`rx-why-row ${otherPts > 0 ? '' : 'zero'}`}>
              <span className="rx-ck">{otherPts > 0 ? <Ico name="check" /> : '—'}</span>
              <div><b>{t('c_other')}</b><small>{otherFound.length ? otherFound.map((c) => c.signal && SIGNAL_TO_SITUATION[c.signal] ? sitName(SIGNAL_TO_SITUATION[c.signal]) : c.key).join(' · ') : t('c_other_d')}</small></div>
              <div className="rx-pbar"><u style={{ width: `${(otherPts / 25) * 100}%` }} /></div>
              <div className="rx-pts">{fmtPts(otherPts)}<small> / 25</small></div>
            </div>
            <div className="rx-total"><span>{t('total')}</span><span><bdi dir="ltr">{sumRows} / 100</bdi></span></div>
            {o.closed && sumRows !== o.score && <div className="rx-total adj"><span>{t('adjusted')}</span><span><bdi dir="ltr">{o.score} / 100</bdi></span></div>}
            {o.closed && <div className="rx-note">{t('closed_note', { s: o.score })}</div>}
            {!o.closed && caps.map((c, i) => <div className="rx-note" key={i}>{c}</div>)}
            {raise.length > 0 && <div className="rx-raise"><b>{t('raise_h')}</b><ul>{raise.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
          </div>

          <div className="rx-sec">
            <h3>{t('s_who')} <span className="rx-by">{t('by_source')}</span></h3>
            <p className="rx-lead">{t('s_who_l')}</p>
            {Array.from(groups.values()).map((g) => {
              const e = g[0];
              return (
                <div className="rx-scard" key={e.id}>
                  <div className="rx-top2">
                    <div><span className="rx-on">{e.outlet}</span><span className="rx-rl"><Dots tier={e.tier} /> {t('rel_' + e.tier)}</span></div>
                    <EvBadge v={e.verification} />
                  </div>
                  <div className="rx-t">{e.headlineEn || e.titleOrig} <span className="rx-aitag">AI</span></div>
                  <div className="rx-o">{t('original')}: {e.titleOrig}</div>
                  {e.quote && <blockquote><small>{t('quote_l')}</small>“{e.quote}”</blockquote>}
                  <div className="rx-meta" style={{ marginTop: 9 }}>
                    <span className="rx-old" style={{ fontWeight: 500 }}>{fmtDateTime(e.at, lang)}{e.claim ? ` · ${t('claim')} ${t('cl_' + e.claim)}` : ''}{e.headlineOnly ? ` · ${t('headline_only')}` : ''}</span>
                    <a className="rx-lnk" style={{ margin: 0 }} href={e.url} target="_blank" rel="noopener noreferrer">{t('open')} <Ico name="ext" /></a>
                  </div>
                  {g.length > 1 && <div className="rx-same">{t('same', { n: g.length })}</div>}
                </div>
              );
            })}
          </div>

          <div className="rx-sec">
            <h3>{t('s_time')}</h3>
            <p className="rx-lead">{t('s_time_l')}</p>
            <div className="rx-tl">
              {timeline.map((e) => {
                const k = e.signals.map((s) => SIGNAL_TO_SITUATION[s]).find(Boolean) ?? 'other';
                const chg = e.kind === 'STATUS_CHANGE';
                return (
                  <div key={e.id} className={`rx-tle ${chg ? 'red' : ''}`}>
                    <div className="rx-d">{fmtDateTime(e.at, lang)} · {e.outlet}</div>
                    <b>{sitName(k)}</b> {chg && <span className="rx-tag red">{t('status_change')}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {latest && (
            <div className="rx-sec">
              <div className="rx-fb">
                {feedbackSent ? <span>{t('fb_thanks')}</span> : (
                  <>
                    <span>{t('fb_q')}</span>
                    <button onClick={() => onFeedback(latest.reportId, 'correct')}>{t('fb_yes')}</button>
                    <button onClick={() => onFeedback(latest.reportId, 'incorrect')}>{t('fb_no')}</button>
                    <button onClick={() => onFeedback(latest.reportId, 'outdated')}>{t('fb_old')}</button>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="rx-missing"><Ico name="info" /><span>{t('miss')}</span></div>
          <div style={{ height: 22 }} />
        </>
      )}
    </>
  );
}
