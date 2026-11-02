'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { openWhatsAppShare } from '@/lib/whatsapp';
import { postFlag, radarFetch, RadarApiError, type FeedItem, type IdentityCheck, type PlayerFile } from '@/lib/transferRadar/client';
import { useRadarT } from '@/lib/transferRadar/i18n';
import { SITUATION_PRIORITY } from '@/lib/transferRadar/situations';
import { SIT_COLOR, contractNote, countryCode, flagUrl, fmtDate, fmtDay, langName } from '@/lib/transferRadar/format';
import { Arr, Ico } from './RadarIcons';

type ShortPayload = { id: string; tmUrl: string | null; photo: string | null; name: string; position: string | null; age: number | null; nationalities: string[]; club: string | null; value: string | null; contractEnd: number | null };
interface Props {
  id: string; preview?: FeedItem | null; onClose: () => void; shortIds: Set<string>; adding: boolean; onShort: (p: ShortPayload) => void; say: (m: string) => void; onChanged: () => void;
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const tmIdOf = (u?: string | null) => u?.match(/spieler\/(\d+)/)?.[1] ?? null;
const TIER_BARS: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };

/** Player files are cached for the session and prefetched on card hover, so opening a file is usually instant. */
const fileCache = new Map<string, Promise<PlayerFile>>();
export function prefetchFile(id: string, force = false): Promise<PlayerFile> {
  const hit = fileCache.get(id);
  if (hit && !force) return hit;
  const p = radarFetch<PlayerFile>(`players/${encodeURIComponent(id)}`);
  fileCache.set(id, p);
  p.catch(() => fileCache.delete(id));
  return p;
}

/** Player file (side panel): who he is on Transfermarkt + why we are sure, what happened, and every original source. */
export default function RadarFile({ id, preview, onClose, shortIds, adding, onShort, say, onChanged }: Props) {
  const { t, lang } = useRadarT();
  const [d, setD] = useState<PlayerFile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fb, setFb] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const cn = (c: string | null | undefined) => (c ? getCountryDisplayName(c, lang === 'he') : '');

  const panel = useRef<HTMLElement | null>(null);
  const load = useCallback((force = false) => {
    setErr(null);
    prefetchFile(id, force).then(setD).catch((e) => setErr(e instanceof RadarApiError ? e.message : String(e)));
  }, [id]);
  useEffect(() => { setD(null); setWrong(false); setFb(false); load(); if (panel.current) panel.current.scrollTop = 0; }, [load]);
  // the page behind the drawer does not scroll while it is open
  useEffect(() => {
    const room = document.querySelector<HTMLElement>('.brit-room.tr-root');
    if (!room) return;
    const prev = room.style.overflow; room.style.overflow = 'hidden';
    return () => { room.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  // header renders immediately from the feed card; identity checks / timeline / sources fill in when the file arrives
  const p: PlayerFile['player'] | undefined = d?.player ?? (preview ? {
    id: preview.id, name: preview.name, fullName: preview.fullName, writtenAs: preview.writtenAs, tmUrl: preview.tmUrl, photo: preview.photo, position: preview.position, age: preview.age,
    dob: preview.dob, nationalities: preview.nationalities, foot: null, height: null, club: preview.club, crest: preview.crest, league: preview.league, country: preview.country,
    contractEnd: preview.contractEnd, loanFrom: preview.loanFrom, value: preview.value, valueEur: preview.valueEur, identity: preview.identity, excludedReason: null, checks: [], candidates: [], inRoster: preview.inRoster,
  } : undefined);
  const closed = d ? d.closed : !!preview?.closed;
  const nat = p?.nationalities[0];
  const bg = flagUrl(nat) || flagUrl(p?.country);
  const note = contractNote(t, p?.contractEnd);
  const saved = !!p && !!tmIdOf(p.tmUrl) && shortIds.has(tmIdOf(p.tmUrl)!);
  // same rule as the feed card: highest-priority live situation across all sources (moved only when the move is confirmed)
  const situation = !d ? (preview?.situation ?? 'other') : d.closed ? 'moved' : (SITUATION_PRIORITY.find((k) => k !== 'moved' && k !== 'other' && d.sources.some((s) => s.situation === k)) ?? 'other');
  const srcById = new Map((d?.sources ?? []).map((s, i) => [s.id, { s, i }]));

  const checkHtml = (c: IdentityCheck): string => {
    const w = esc(c.w), n = esc(c.n);
    switch (c.k) {
      case 'name': return t('c_name', { w, n });
      case 'exact': return t('c_exact', { w, n });
      case 'translit': {
        const src = d?.sources.find((s) => s.writtenAs === c.w);
        return t('c_translit', { w, n, l: esc(langName(src?.lang, lang) ?? t('lang_unknown')) });
      }
      case 'inflect': return t('c_inflect', { w, n });
      case 'fuzzy': return t('c_fuzzy', { w, n });
      case 'squad': return t('c_squad', { c: esc(c.c) });
      case 'club': return t('c_club', { c: esc(c.c) });
      case 'left': return t('c_left', { c: esc(c.c), d: c.d ? esc(fmtDay(Date.parse(String(c.d)), lang)) : '' });
      case 'joined': return t('c_joined', { c: esc(c.c), d: c.d ? esc(fmtDay(Date.parse(String(c.d)), lang)) : '' });
      case 'unique': return esc(t('c_unique'));
      case 'only_one': return esc(t('c_only'));
      case 'no_club': return esc(t('c_noclub'));
      case 'ai': return esc(t('c_ai', { why: String(c.why ?? '') }));
      case 'human': return esc(t('c_human', { who: String(c.who ?? '') }));
      default: return '';
    }
  };

  const hide = async () => {
    setBusy(true);
    try { await postFlag(id, 'hide', 'other'); say(t('t_hide')); onChanged(); onClose(); }
    catch { say(t('t_err')); } finally { setBusy(false); }
  };
  const pickOther = async (tmUrl: string, name: string) => {
    setBusy(true);
    try { await radarFetch('identify', { method: 'POST', body: JSON.stringify({ playerId: id, tmUrl }) }); say(t('t_wrong', { n: name })); onChanged(); load(true); setWrong(false); }
    catch { say(t('t_err')); } finally { setBusy(false); }
  };
  const feedback = async (kind: 'correct' | 'incorrect' | 'outdated') => {
    const last = d?.sources[d.sources.length - 1];
    if (!last) return;
    setFb(true);
    try { await radarFetch('feedback', { method: 'POST', body: JSON.stringify({ reportId: last.id, kind }) }); say(t('t_fb')); } catch { setFb(false); say(t('t_err')); }
  };
  const share = () => {
    if (!p) return;
    const last = d?.sources[d.sources.length - 1];
    openWhatsAppShare([`${p.name}${p.club ? ` (${p.club})` : ''}`, last?.en || last?.orig || '', last?.url || '', p.tmUrl || ''].filter(Boolean).join('\n'));
  };
  const jump = (sid: string) => {
    const el = document.getElementById(`tr3-src-${sid}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  };
  const others = (p?.candidates ?? []).filter((c) => c.tmId !== tmIdOf(p?.tmUrl));

  return (
    <>
      <div className="tr3-scrim open" onClick={onClose} />
      <aside ref={panel} className="tr3-file open" role="dialog" aria-busy={!d} aria-modal="true" aria-label={t('file')}>
        {!p ? (
          <div className="tr3-fhead"><div className="tr3-fbar"><span className="crumb">{t('nav_radar')} / {t('file')}</span><button onClick={onClose}><Arr name="x" /> {t('back')}</button></div></div>
        ) : (
          <>
            <div className="tr3-fhead">
              {bg && <img className="bg" src={bg} alt="" aria-hidden="true" />}
              <div className="tr3-fbar"><span className="crumb">{t('nav_radar')} / {t('file')}</span><button onClick={onClose}><Arr name="x" /> {t('back')}</button></div>
              <div className="tr3-fwho">
                {p.photo ? <img className="pt" src={p.photo} alt="" /> : <div className="pt tr3-ph" style={{ width: 112, height: 140 }}>{p.name.charAt(0)}</div>}
                <div style={{ minWidth: 0 }}>
                  <span className={`tr3-pill tag s-${SIT_COLOR[situation]}`}>{t('s_' + situation)}</span>
                  <h2>{p.name}</h2>
                  {p.fullName && p.fullName !== p.name && <div className="full">{p.fullName}</div>}
                  {p.writtenAs.length > 0 && <div className="wr">{t('written')} {p.writtenAs.map((w, i) => <span key={w}>{i ? ', ' : ''}<b>{w}</b></span>)}</div>}
                </div>
              </div>
              <div className="tr3-facts6">
                <div><label>{t('f_club')}</label><b>{p.crest && <img src={p.crest} alt="" onError={(e) => e.currentTarget.remove()} />}{p.club ?? '-'}</b>{p.loanFrom && <small>{t('on_loan', { c: p.loanFrom })}</small>}</div>
                <div><label>{t('f_league')}</label><b>{p.league ?? '-'}</b>{p.country && <small>{cn(p.country)}</small>}</div>
                <div><label>{t('f_pos')}</label><b>{p.position ?? '-'}</b>{(p.foot || p.height) && <small>{[p.foot, p.height].filter(Boolean).join(' · ')}</small>}</div>
                <div><label>{t('f_age')}</label><b>{p.age ?? '-'}</b>{p.dob && <small>{t('born', { d: p.dob })}</small>}</div>
                <div><label>{t('f_value')}</label><b>{p.value ?? '-'}</b>{p.nationalities.length > 0 && <small>{p.nationalities.map(cn).join(' / ')}</small>}</div>
                <div><label>{t('f_contract')}</label><b className={note ? 'soon' : ''}>{p.contractEnd ? fmtDay(p.contractEnd, lang) : t('no_contract')}</b>{note && <small className="soon">{note}</small>}</div>
              </div>
              <div className="tr3-factions">
                {!closed && p.tmUrl && (
                  <button className={`gold ${saved ? 'done' : ''}`} disabled={saved || adding} onClick={() => onShort({ id: p.id, tmUrl: p.tmUrl, photo: p.photo, name: p.name, position: p.position, age: p.age, nationalities: p.nationalities, club: p.club, value: p.value, contractEnd: p.contractEnd })}>
                    <Ico name="save" />{saved ? t('in_sl') : t('add_sl')}
                  </button>
                )}
                {p.tmUrl && <a href={p.tmUrl} target="_blank" rel="noopener noreferrer">{t('tm')} <Ico name="ext" /></a>}
                <button onClick={share}>{t('wa')}</button>
                <button onClick={hide} disabled={busy}>{t('hide')}</button>
              </div>
            </div>

            {!d ? <FileSkeleton err={err} onRetry={() => load(true)} /> : (
            <div className="tr3-fbody">
              <div className="tr3-fsec">
                <h3>{t('how_h')} <small>{t('m_auto')}</small></h3>
                <p className="lead">{t('how_l')}</p>
                <ul className="tr3-checks">
                  {p.checks.map((c, i) => {
                    const html = checkHtml(c);
                    if (!html) return null;
                    const warn = c.k === 'no_club';
                    return <li key={i} className={warn ? 'warn' : ''}><Ico name={warn ? 'warn' : 'ok'} /><span dangerouslySetInnerHTML={{ __html: html }} /></li>;
                  })}
                </ul>
                <button className="tr3-wrong" onClick={() => setWrong((v) => !v)}>{t('wrong')}</button>
                {wrong && (
                  <div className="tr3-cands">
                    <h5 style={{ margin: '8px 0', font: '8px/1 var(--mono)', textTransform: 'uppercase', color: 'var(--muted)' }}>{t('wrong_h')}</h5>
                    {others.length ? others.map((c) => (
                      <div className="tr3-cand" key={c.tmId}>
                        {c.photo ? <img className="im" src={c.photo} alt="" /> : <span className="ini">{c.name.charAt(0)}</span>}
                        <div>
                          <div className="n">{c.name}</div>
                          <div className="d">{[c.position, c.age != null ? `${t('f_age')} ${c.age}` : null, c.club, c.value].filter(Boolean).join(' · ')}</div>
                          <a href={c.tmUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--muted)', font: '8px/1 var(--mono)', textTransform: 'uppercase', textDecoration: 'underline' }}>{t('tm')} <Arr name="ext" /></a>
                        </div>
                        <button disabled={busy} onClick={() => pickOther(c.tmUrl, c.name)}>{t('this_one')}</button>
                      </div>
                    )) : <div className="d" style={{ padding: '10px 0', color: 'var(--muted)', font: '9px/1 var(--mono)', textTransform: 'uppercase' }}>{t('wrong_none')}</div>}
                  </div>
                )}
              </div>

              <div className="tr3-fsec">
                <h3>{t('tl_h')} <small>{d.sources.length === 1 ? t('one_src') : t('n_src', { n: d.sources.length })}</small></h3>
                <p className="lead">{t('tl_l')}</p>
                <div className="tr3-tl">
                  {d.events.map((e, i) => (
                    <div key={i} className={`tr3-ev s-${SIT_COLOR[e.situation]}`}>
                      <div className="d">{fmtDate(e.at, lang)} · {t('s_' + e.situation)}</div>
                      <div className="t">{e.title}</div>
                      <div className="s">{e.sources.map((sid) => { const x = srcById.get(sid); return x ? <button key={sid} onClick={() => jump(sid)}>{x.s.outlet} <Arr name="down" /></button> : null; })}</div>
                    </div>
                  ))}
                </div>
                {d.closed && <p className="lead" style={{ color: 'var(--red)' }}>{t('moved_note')}</p>}
              </div>

              <div className="tr3-fsec">
                <h3>{t('src_h')}</h3>
                <p className="lead">{t('src_l')}</p>
                {d.sources.map((s) => {
                  const ln = langName(s.lang, lang) ?? t('lang_unknown');
                  return (
                    <article className="tr3-src" id={`tr3-src-${s.id}`} key={s.id}>
                      <div className="tr3-src-h">
                        <span className="brit-ct-flag mono">{countryCode(s.country)}</span>
                        <span><span className="o">{s.outlet}</span><br /><span className="m">{[cn(s.country), ln, fmtDate(s.at, lang)].filter(Boolean).join(' · ')}</span></span>
                        <span className="rel">{t('rel_' + (s.tier in TIER_BARS ? s.tier : 'C'))} {[1, 2, 3, 4].map((i) => <i key={i} className={i <= (TIER_BARS[s.tier] ?? 2) ? 'on' : ''} />)}</span>
                      </div>
                      <div className="tr3-src-b">
                        <p className="tr3-orig" dir="auto"><small>{t('as_pub', { l: ln })}</small>{s.orig}</p>
                        {s.en && s.en !== s.orig && <p className="tr3-tr"><small>{t('en_tr')}</small>{s.en}</p>}
                        {s.quote && s.quote !== s.orig && <p className="tr3-quote" dir="auto">&ldquo;{s.quote}&rdquo;</p>}
                      </div>
                      <div className="tr3-src-f">
                        <span className="u">{s.viaGoogle ? `${s.outlet} · ${t('via_gn')}` : s.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                        <a href={s.url} target="_blank" rel="noopener noreferrer">{t('read')} <Ico name="ext" /></a>
                      </div>
                    </article>
                  );
                })}
                <div className="tr3-fb">
                  {fb ? t('fb_t') : (<>{t('fb_q')} <button onClick={() => feedback('correct')}>{t('fb_y')}</button><button onClick={() => feedback('incorrect')}>{t('fb_n')}</button><button onClick={() => feedback('outdated')}>{t('fb_o')}</button></>)}
                </div>
              </div>
            </div>
            )}
          </>
        )}
        {!p && <FileSkeleton err={err} onRetry={() => load(true)} />}
      </aside>
    </>
  );
}

/** Loading state of the file body: section titles + shimmer blocks in the same layout as the real content. */
function FileSkeleton({ err, onRetry }: { err: string | null; onRetry: () => void }) {
  const { t } = useRadarT();
  if (err) return <div className="tr3-fbody"><div className="tr3-emptybox" style={{ marginTop: 24 }}><h3>{t('t_err')}</h3><p>{err}</p><button className="brit-mast-add" onClick={onRetry}>{t('retry')}</button></div></div>;
  return (
    <div className="tr3-fbody tr3-fskel" aria-label={t('loading')}>
      {[['how_h', 3], ['tl_h', 2], ['src_h', 2]].map(([k, n]) => (
        <div className="tr3-fsec" key={k as string}>
          <h3>{t(k as string)}</h3>
          <div className="brit-skel l2" style={{ width: '46%', marginBottom: 14 }} />
          {Array.from({ length: n as number }).map((_, i) => <div key={i} className="brit-skel tr3-skrow" />)}
        </div>
      ))}
    </div>
  );
}
