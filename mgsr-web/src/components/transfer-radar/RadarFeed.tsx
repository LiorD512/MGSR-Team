'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { CLUB_REQUESTS_COLLECTIONS, SHORTLISTS_COLLECTIONS } from '@/lib/platformCollections';
import { callShortlistAdd } from '@/lib/callables';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { enrichShortlistInstagram } from '@/lib/outreach';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { radarFetch, RadarApiError, type FeedItem, type FeedResponse, type SummaryResponse } from '@/lib/transferRadar/client';
import { useRadarT } from '@/lib/transferRadar/i18n';
import { DAY, SIT_COLOR, SIT_FILTER, contractNote, flagUrl, fmtDate, fmtDay, monthsLeft } from '@/lib/transferRadar/format';
import type { Situation } from '@/lib/transferRadar/situations';
import RadarFile, { prefetchFile } from './RadarFile';
import RadarPortal from './RadarPortal';
import BritFilterSheetPortal from '@/components/BritFilterSheetPortal';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { agencyInBook, isReleased, isRoster, useAgencyLinks, type AgencyLinks } from '@/lib/transferRadar/agencyLinks';
import { matchRequestToPlayers, type ClubRequest } from '@/lib/requestMatcher';
import { useEuCountries } from '@/hooks/useEuCountries';
import { RADAR_POSITIONS, feedItemMatchesRequest, positionCode } from '@/lib/transferRadar/positions';
import { getPositionDisplayName } from '@/lib/appConfig';
import RadarFiltered from './RadarFiltered';
import { Arr, Ico } from './RadarIcons';

type View = 'feed' | 'ledger';
type Sort = 'new' | 'contract' | 'value';
type Kpi = 'radar' | 'new' | 'contract' | null;
const POLL_MS = 5 * 60_000;
type OpenRequest = ClubRequest & { clubName?: string; clubLogo?: string; status?: string };
const tmIdOf = (u?: string | null) => u?.match(/spieler\/(\d+)/)?.[1] ?? null;

/** Transfer Radar (v3): players the local press says may become available, each identified on Transfermarkt. */
export default function RadarFeed({ initialId }: { initialId?: string }) {
  const { t, lang, isRtl } = useRadarT();
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [view, setView] = useState<View>('feed');
  const [q, setQ] = useState('');
  const [sit, setSit] = useState<Situation | 'all'>('all');
  const [country, setCountry] = useState('all');
  const [position, setPosition] = useState('all');
  const [reqId, setReqId] = useState('all');
  const [requests, setRequests] = useState<OpenRequest[]>([]);
  const euCountries = useEuCountries();
  const [sort, setSort] = useState<Sort>('new');
  const [kpi, setKpi] = useState<Kpi>(null);
  const [openId, setOpenId] = useState<string | null>(initialId ?? params.get('p'));
  const [filteredOpen, setFilteredOpen] = useState(false);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [shortIds, setShortIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = Date.now();
  const cn = useCallback((c: string | null | undefined) => (c ? getCountryDisplayName(c, lang === 'he') : ''), [lang]);
  const links = useAgencyLinks();
  const isMobileSheet = useMediaQuery('(max-width: 900px)');
  const [sheetOpen, setSheetOpen] = useState(false);

  const say = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const [feed, sum] = await Promise.all([radarFetch<FeedResponse>('opportunities'), radarFetch<SummaryResponse>('summary')]);
      setItems(feed.items); setPending(feed.pending); setSummary(sum); setError(null);
      radarFetch<{ items: unknown[] }>('filtered').then((f) => setFilteredCount(f.items.length)).catch(() => undefined);
    } catch (e) {
      setError(e instanceof RadarApiError ? { code: e.code, message: e.message } : { code: 'ERROR', message: String(e) });
    }
  }, []);
  useEffect(() => { load(); const id = setInterval(load, POLL_MS); return () => clearInterval(id); }, [load]);

  // the agency's shortlist (same live source as Release alerts / Contract finishers), matched by Transfermarkt player id
  useEffect(() => onSnapshot(collection(db, SHORTLISTS_COLLECTIONS.men), (snap) => {
    setShortIds(new Set(snap.docs.map((d) => tmIdOf(d.data().tmProfileUrl as string)).filter((x): x is string => !!x)));
  }, () => undefined), []);

  // open club requests (men): lets the agency filter the Press Room by what each club is looking for
  useEffect(() => onSnapshot(collection(db, CLUB_REQUESTS_COLLECTIONS.men), (snap) => {
    setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OpenRequest, 'id'>) })).filter((r) => (r.status || 'pending') === 'pending' && !!r.position));
  }, () => undefined), []);

  // ?p=<id> keeps the open file in the URL (shareable, back button closes it)
  const openFile = (id: string) => { setOpenId(id); router.replace(`/transfer-radar?p=${encodeURIComponent(id)}`, { scroll: false }); };
  const closeFile = () => { setOpenId(null); router.replace('/transfer-radar', { scroll: false }); };

  const addShort = useCallback(async (p: { id: string; tmUrl: string | null; photo: string | null; name: string; position: string | null; age: number | null; nationalities: string[]; club: string | null; value: string | null; contractEnd: number | null }) => {
    if (!user || !p.tmUrl) return;
    setAdding(p.id);
    try {
      const account = await getCurrentAccountForShortlist(user);
      const res = await callShortlistAdd({
        platform: 'men', tmProfileUrl: p.tmUrl, playerImage: p.photo, playerName: p.name, playerPosition: p.position, playerAge: p.age != null ? String(p.age) : null,
        playerNationality: p.nationalities[0] ?? null, playerNationalities: p.nationalities, currentClub: p.club, clubJoinedName: p.club, marketValue: p.value,
        contractExpires: p.contractEnd ? fmtDay(p.contractEnd, 'en') : null, positions: p.position ? [p.position] : [],
        addedByAgentId: account.id, addedByAgentName: account.name ?? null, addedByAgentHebrewName: account.hebrewName ?? null,
      });
      if (res.status === 'added') { enrichShortlistInstagram(p.tmUrl); say(t('t_sl')); }
      else if (res.status === 'already_in_roster') say(t('t_roster'));
      else say(t('t_exists'));
    } catch { say(t('t_err')); } finally { setAdding(null); }
  }, [user, say, t]);

  const all = items ?? [];
  // one entry per club that has open requests (a club with several requests is a single chip; a player matches if he fits any of them)
  const clubs = useMemo(() => {
    const m = new Map<string, { key: string; name: string; reqs: OpenRequest[] }>();
    for (const r of requests) {
      const name = r.clubName?.trim();
      const key = r.clubTmProfile || name;
      if (!key) continue;
      const c = m.get(key) ?? { key, name: name || '-', reqs: [] };
      c.reqs.push(r); m.set(key, c);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [requests]);
  const list = useMemo(() => {
    let a = all;
    if (kpi === 'new') a = a.filter((p) => now - p.firstAt <= 7 * DAY);
    if (kpi === 'contract') a = a.filter((p) => { const m = monthsLeft(p.contractEnd, now); return m != null && m <= 6; });
    if (kpi === 'radar') a = a.filter((p) => !p.closed);
    if (sit !== 'all') a = a.filter((p) => p.situation === sit || p.situations.includes(sit));
    if (country !== 'all') a = a.filter((p) => p.country === country);
    if (position !== 'all') a = a.filter((p) => positionCode(p.position) === position);
    if (reqId !== 'all') {
      const club = clubs.find((c) => c.key === reqId);
      a = club ? a.filter((p) => club.reqs.some((r) => feedItemMatchesRequest(p, r, euCountries, matchRequestToPlayers))) : a;
    }
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      a = a.filter((p) => [p.name, p.fullName, p.club, p.league, p.country, cn(p.country), ...p.writtenAs].join(' ').toLowerCase().includes(s));
    }
    const by: Record<Sort, (x: FeedItem, y: FeedItem) => number> = {
      new: (x, y) => y.lastAt - x.lastAt,
      contract: (x, y) => (monthsLeft(x.contractEnd, now) ?? 999) - (monthsLeft(y.contractEnd, now) ?? 999) || y.lastAt - x.lastAt,
      value: (x, y) => (y.valueEur ?? -1) - (x.valueEur ?? -1),
    };
    return [...a].sort((x, y) => Number(x.closed) - Number(y.closed) || by[sort](x, y));
  }, [all, kpi, sit, country, position, reqId, clubs, euCountries, q, sort, now, cn]);

  if (error?.code === 'RADAR_NOT_CONFIGURED') return <State title={t('not_configured_title')} text={t('not_configured_text')} />;
  if (error?.code === 'RADAR_FORBIDDEN') return <State title={t('forbidden_title')} text={t('forbidden_text')} />;
  if (error && !items) return <State title={t('t_err')} text={error.message} action={<button className="brit-mast-add" onClick={load}>{t('retry')}</button>} />;

  const k = {
    radar: all.filter((p) => !p.closed).length,
    nw: all.filter((p) => now - p.firstAt <= 7 * DAY).length,
    contract: all.filter((p) => { const m = monthsLeft(p.contractEnd, now); return m != null && m <= 6; }).length,
  };
  const countries = Array.from(new Set(all.map((p) => p.country).filter((c): c is string => !!c))).sort((a, b) => cn(a).localeCompare(cn(b)));
  const positions = RADAR_POSITIONS.filter((c) => all.some((p) => positionCode(p.position) === c));
  const sits = SIT_FILTER.filter((s) => all.some((p) => p.situation === s || p.situations.includes(s)));
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastRun = summary?.lastRun?.started_at ?? null;
  const card = (p: FeedItem) => (
    <PlayerCard key={p.id} p={p} links={links} saved={!!tmIdOf(p.tmUrl) && shortIds.has(tmIdOf(p.tmUrl)!)} adding={adding === p.id} onOpen={() => openFile(p.id)} onShort={() => addShort(p)} cn={cn} />
  );

  let body: React.ReactNode;
  if (!items) body = <Skeleton />;
  else if (pending) body = <Empty title={t('pending_h')} text={t('pending_p')} />;
  else if (!list.length) body = <Empty title={all.length ? t('empty') : t('none_yet_h')} text={all.length ? '' : t('none_yet_p')} />;
  else if (view === 'ledger') body = <Ledger list={list} onOpen={openFile} cn={cn} />;
  else if (sort !== 'new') body = <div className="brit-ra-feed">{list.map(card)}</div>;
  else {
    const groups: [string, string, (p: FeedItem) => boolean][] = [
      ['48H', 'sec_48', (p) => now - p.lastAt <= 2 * DAY],
      ['7D', 'sec_7', (p) => now - p.lastAt > 2 * DAY && now - p.lastAt <= 7 * DAY],
      ['30D', 'sec_30', (p) => now - p.lastAt > 7 * DAY],
    ];
    body = groups.map(([code, key, f]) => {
      const g = list.filter(f);
      if (!g.length) return null;
      return (
        <section className="tr3-section" key={code}>
          <div className="brit-ct-country"><span className="brit-ct-flag mono">{code}</span><h2>{t(key)}</h2><span className="cnt"><b>{g.length}</b> {g.length === 1 ? t('player') : t('players')}</span></div>
          <div className="brit-ra-feed">{g.map(card)}</div>
        </section>
      );
    });
  }

  return (
    <>
      <header className="brit-masthead">
        <div>
          <p className="brit-kicker">{t('kicker')}</p>
          <h1>{t('h_a')} <span>{t('h_b')}</span></h1>
          <p className="brit-ra-sub">{t('sub')}</p>
        </div>
        <div className="tr3-mast-r">
          <div className="brit-ct-viewtoggle">
            <button className={view === 'feed' ? 'active' : ''} onClick={() => setView('feed')}>{t('view_feed')}</button>
            <button className={view === 'ledger' ? 'active' : ''} onClick={() => setView('ledger')}>{t('view_ledger')}</button>
          </div>
          {summary && (
            <div className="tr3-scan">
              <i />{t('scan', { s: summary.coverage.sources, c: summary.coverage.countries })}<br />
              {t('last')} <b>{lastRun ? fmtDate(lastRun, lang) : '-'}</b>
              {summary.nextAnalysisAt ? <> · {t('next')} <b>{fmtDate(summary.nextAnalysisAt, lang)}</b></> : <> · {t('every3')}</>}
            </div>
          )}
        </div>
      </header>

      {pending ? <Empty title={t('pending_h')} text={t('pending_p')} /> : <>
      <section className="brit-signals tr3-signals">
        <Signal on={kpi === 'radar'} onClick={() => setKpi(kpi === 'radar' ? null : 'radar')} label={t('k_radar')} value={pad(k.radar)} note={t('k_radar_s')} />
        <Signal on={kpi === 'new'} onClick={() => setKpi(kpi === 'new' ? null : 'new')} label={t('k_new')} value={pad(k.nw)} note={t('k_new_s')} />
        <Signal on={kpi === 'contract'} onClick={() => setKpi(kpi === 'contract' ? null : 'contract')} label={t('k_contract')} value={pad(k.contract)} note={t('k_contract_s')} cls="brit-red" />
        <Signal on={false} onClick={() => undefined} label={t('k_markets')} value={pad(countries.length)} note={t('k_markets_s')} />
      </section>

      {/* mobile: search + a Filters button that opens the tray as a bottom sheet (same pattern as Release alerts) */}
      <div className="brit-mfilter">
        <label className="brit-search brit-mfilter-search"><Ico name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} /></label>
        <button type="button" className="brit-mfilter-btn" onClick={() => setSheetOpen(true)} aria-expanded={sheetOpen}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18M6 12h12M10 20h4" /></svg>
          <span>{t('filters_btn')}</span>
          {(sit !== 'all' ? 1 : 0) + (country !== 'all' ? 1 : 0) + (position !== 'all' ? 1 : 0) + (reqId !== 'all' ? 1 : 0) + (sort !== 'new' ? 1 : 0) > 0 && <span className="brit-mfilter-count">{(sit !== 'all' ? 1 : 0) + (country !== 'all' ? 1 : 0) + (position !== 'all' ? 1 : 0) + (reqId !== 'all' ? 1 : 0) + (sort !== 'new' ? 1 : 0)}</span>}
        </button>
      </div>
      <BritFilterSheetPortal active={isMobileSheet} isRtl={isRtl}>
      <div className={`brit-tray-scrim${sheetOpen ? ' open' : ''}`} onClick={() => setSheetOpen(false)} aria-hidden />
      <section className="brit-tray" aria-label={t('filters_btn')} data-sheet-open={sheetOpen ? 'true' : 'false'}>
        <div className="brit-tray-sheet-head">
          <h3>{t('filters_btn')}</h3>
          <button type="button" onClick={() => setSheetOpen(false)} aria-label={t('close')}>×</button>
        </div>
        <label className="brit-search"><Ico name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} /></label>
        <div className="brit-req-filterrow">
          <span className="brit-req-flabel">{t('f_sit')}</span>
          <div className="brit-req-chipset">
            <button className={sit === 'all' ? 'on' : ''} onClick={() => setSit('all')}>{t('all')}</button>
            {sits.map((s) => <button key={s} className={sit === s ? 'on' : ''} onClick={() => setSit(s)}>{t('s_' + s)}</button>)}
          </div>
        </div>
        <div className="brit-req-filterrow">
          <span className="brit-req-flabel">{t('f_country')}</span>
          <div className="brit-req-chipset">
            <button className={country === 'all' ? 'on' : ''} onClick={() => setCountry('all')}>{t('all')}</button>
            {countries.map((c) => <button key={c} className={country === c ? 'on' : ''} onClick={() => setCountry(c)}>{cn(c)}</button>)}
          </div>
        </div>
        <div className="brit-req-filterrow">
          <span className="brit-req-flabel">{t('f_position')}</span>
          <div className="brit-req-chipset">
            <button className={position === 'all' ? 'on' : ''} onClick={() => setPosition('all')}>{t('all')}</button>
            {positions.map((c) => <button key={c} className={position === c ? 'on' : ''} onClick={() => setPosition(c)}>{getPositionDisplayName(c, lang === 'he')}</button>)}
          </div>
        </div>
        <div className="brit-req-filterrow">
          <span className="brit-req-flabel">{t('f_request')}</span>
          <div className="brit-req-chipset">
            <button className={reqId === 'all' ? 'on' : ''} onClick={() => setReqId('all')}>{t('all')}</button>
            {clubs.map((c) => <button key={c.key} className={reqId === c.key ? 'on' : ''} onClick={() => setReqId(c.key)}>{c.name} <small>({Array.from(new Set(c.reqs.map((r) => positionCode(r.position)).filter(Boolean))).join(', ')})</small></button>)}
            {!clubs.length && <span className="brit-req-flabel">{t('req_none')}</span>}
          </div>
        </div>
        <div className="brit-ra-sortrow brit-ra-sortrow-sheet">
        <span className="lbl">{t('sort')}</span>
        {(['new', 'contract', 'value'] as const).map((s) => <button key={s} className={sort === s ? 'on' : ''} onClick={() => setSort(s)}>{t('so_' + s)}</button>)}
              </div>
        <div className="brit-tray-sheet-foot">
          {(sit !== 'all' ? 1 : 0) + (country !== 'all' ? 1 : 0) + (position !== 'all' ? 1 : 0) + (reqId !== 'all' ? 1 : 0) + (sort !== 'new' ? 1 : 0) > 0 && <button type="button" className="reset" onClick={() => { setSit('all'); setCountry('all'); setPosition('all'); setReqId('all'); setSort('new'); }}>{t('f_clear_v4')}</button>}
          <button type="button" className="apply" onClick={() => setSheetOpen(false)}>{t('showing', { n: list.length, t: all.length })}</button>
        </div>
      </section>
      </BritFilterSheetPortal>
      <div className="brit-result-count tr3-count">
        <span>{t('showing', { n: list.length, t: all.length })}</span>
        {!!filteredCount && <button onClick={() => setFilteredOpen(true)}>{t('filtered', { n: filteredCount })}</button>}
      </div>
      {body}
      </>}

      <RadarPortal isRtl={isRtl}>
        {openId && (
          <RadarFile id={openId} preview={all.find((x) => x.id === openId) ?? null} onClose={closeFile} shortIds={shortIds} adding={adding === openId} onShort={addShort} say={say}
            onChanged={() => { load(); prefetchFile(openId, true).catch(() => undefined); }} />
        )}
        {filteredOpen && <RadarFiltered onClose={() => setFilteredOpen(false)} onChanged={() => { load(); }} say={say} />}
        <div className={`tr3-toast ${toast ? 'show' : ''}`} role="status">{toast}</div>
      </RadarPortal>
    </>
  );
}

function Signal({ on, onClick, label, value, note, cls }: { on: boolean; onClick: () => void; label: string; value: string; note: string; cls?: string }) {
  return <div className={`brit-signal ${on ? 'on' : ''}`} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}><label>{label}</label><strong className={cls}>{value}</strong><small>{note}</small></div>;
}

function PlayerCard({ p, links, saved, adding, onOpen, onShort, cn }: { p: FeedItem; links: AgencyLinks; saved: boolean; adding: boolean; onOpen: () => void; onShort: () => void; cn: (c: string | null) => string }) {
  const { t, lang } = useRadarT();
  const nat = p.nationalities[0];
  const bg = flagUrl(nat) || flagUrl(p.country);
  const note = contractNote(t, p.contractEnd);
  const lt = p.latest;
  // what the agency already knows about him (roster, release alerts, agent in the Black Book) - from the site's own data
  const roster = isRoster(links, p.tmUrl), released = isReleased(links, p.tmUrl), book = agencyInBook(links, p.agent, p.agentUrl) > 0;
  const free = /without club/i.test(p.club ?? '');
  return (
    <article className={`brit-ra-alert tr3-card${p.closed ? ' moved' : ''}${roster ? ' roster' : ''}`} onMouseEnter={() => { prefetchFile(p.id).catch(() => undefined); }} onFocus={() => { prefetchFile(p.id).catch(() => undefined); }}>
      <span className={`brit-ra-badge s-${SIT_COLOR[p.situation]}`}>{t('s_' + p.situation)}</span>
      <div className="brit-ra-top" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
        {bg ? <img className="brit-ra-flagbg" src={bg} alt="" aria-hidden="true" /> : <div className="brit-ra-flagbg-ph" aria-hidden="true" />}
        <div className="brit-ra-portrait">{p.photo ? <img className="p" src={p.photo} alt="" /> : <div className="tr3-ph">{p.name.charAt(0)}</div>}</div>
        <div className="brit-ra-who">
          <div className="nm" title={p.name}>{p.name}</div>
          <div className="meta">
            {p.position && <span className="pos">{p.position}</span>}
            {p.age != null && <span className="age">{t('f_age')} {p.age}</span>}
            {nat && <span className="nat">{cn(nat)}</span>}
          </div>
          <div className="tr3-clubrow">{p.crest && <img src={p.crest} alt="" onError={(e) => e.currentTarget.remove()} />}<b>{p.club ?? '-'}</b>{p.league ? `· ${p.league}` : ''}</div>
          {(roster || released || free || book) && (
            <div className="tr3-badges">
              {roster && <span className="g">{t('b_roster')}</span>}
              {released && <span className="r">{t('b_released')}</span>}
              {free && !released && <span className="r">{t('b_free')}</span>}
              {book && <span className="o">{t('b_book')}</span>}
            </div>
          )}
        </div>
      </div>
      {lt && (
        <div className="tr3-story" onClick={onOpen}>
          <div className="when"><b>{fmtDate(lt.at, lang)}</b>·<span>{lt.outlet}</span>{lt.country && <>·<span>{cn(lt.country)}</span></>}</div>
          <p className="hl">{lt.en}</p>
          {p.sources > 1 && <div className="more"><b>{t('more_src', { n: p.sources - 1 })}</b></div>}
        </div>
      )}
      <div className="tr3-facts f3">
        <div><label>{t('value')}</label><b>{p.value || '-'}</b></div>
        <div><label>{t('f_agent')}</label><b className="txt" title={p.agent ?? ''}>{p.agent ? (/^relatives$/i.test(p.agent) ? t('relatives') : p.agent) : t('no_agent')}</b></div>
        <div>
          <label>{t('contract')}</label>
          <b className={note ? 'soon' : ''}>{p.contractEnd ? fmtDay(p.contractEnd, lang) : t('no_contract')}</b>
          {note ? <small className="soon">{note}</small> : p.loanFrom ? <small>{t('on_loan', { c: p.loanFrom })}</small> : null}
        </div>
      </div>
      <div className="brit-ra-value">
        <div className={`tr3-idline ${p.identity === 'PROBABLE' ? 'prob' : ''}`} style={{ border: 0, padding: 0 }}>
          <Ico name={p.identity === 'PROBABLE' ? 'warn' : 'ok'} />{p.identity === 'PROBABLE' ? t('id_prob') : t('id_ok')}
        </div>
        <div className="brit-ra-acts">
          {!p.closed && (saved
            ? <span className="saved"><Ico name="save" />{t('saved')}</span>
            : <button className="save" disabled={adding || !p.tmUrl} onClick={onShort}><Ico name="save" />{t('shortlist')}</button>)}
          <button className="open" onClick={onOpen}>{t('open_file')} <Arr name="fwd" /></button>
        </div>
      </div>
    </article>
  );
}

function Ledger({ list, onOpen, cn }: { list: FeedItem[]; onOpen: (id: string) => void; cn: (c: string | null) => string }) {
  const { t, lang } = useRadarT();
  return (
    <div className="tr3-ledger">
      <div className="tr3-lrow tr3-lhead">
        {['l_player', 'l_sit', 'l_club', 'l_age', 'l_value', 'l_contract', 'l_latest', 'l_id'].map((k) => <div key={k}>{t(k)}</div>)}
      </div>
      {list.map((p) => {
        const note = contractNote(t, p.contractEnd);
        return (
          <div className="tr3-lrow" key={p.id} onMouseEnter={() => { prefetchFile(p.id).catch(() => undefined); }} onClick={() => onOpen(p.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(p.id); }}>
            <div className="tr3-lp">{p.photo ? <img src={p.photo} alt="" /> : <span className="ini">{p.name.charAt(0)}</span>}<div style={{ minWidth: 0 }}><b>{p.name}</b><small>{p.nationalities.map(cn).join(' / ')}</small></div></div>
            <div><span className={`tr3-pill s-${SIT_COLOR[p.situation]}`}>{t('s_' + p.situation)}</span></div>
            <div>{p.club ?? '-'}<span className="tr3-sub">{[p.league, cn(p.country)].filter(Boolean).join(' · ')}</span>{p.agent && <span className="tr3-sub">{t('l_agent')}: {/^relatives$/i.test(p.agent) ? t('relatives') : p.agent}</span>}</div>
            <div>{p.position ?? '-'}<span className="tr3-sub">{p.age != null ? `${t('f_age')} ${p.age}` : ''}</span></div>
            <div className="tr3-mono">{p.value || '-'}</div>
            <div className={`tr3-mono ${note ? 'soon' : ''}`}>{p.contractEnd ? fmtDay(p.contractEnd, lang) : t('no_contract')}{note && <span className="tr3-sub" style={{ color: 'var(--red)' }}>{note}</span>}</div>
            <div>{p.latest?.outlet ?? '-'}<span className="tr3-sub">{p.latest ? fmtDate(p.latest.at, lang) : ''} · {p.sources === 1 ? t('one_src') : t('n_src', { n: p.sources })}</span></div>
            <div>{p.identity === 'PROBABLE' ? <span className="tr3-warn">{t('id_prob')}</span> : <span className="tr3-ok"><Ico name="ok" /> {t('i_ok')}</span>}</div>
          </div>
        );
      })}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="brit-ra-feed">
      {Array.from({ length: 6 }).map((_, i) => (
        <div className="brit-skel-card" key={i}><div className="top brit-skel" /><div className="body"><div className="brit-skel l1" /><div className="brit-skel l2" /><div className="brit-skel l3" /></div></div>
      ))}
    </div>
  );
}
function Empty({ title, text }: { title: string; text?: string }) {
  return <div className="tr3-emptybox"><h3>{title}</h3>{text ? <p>{text}</p> : null}</div>;
}
function State({ title, text, action }: { title: string; text?: string; action?: React.ReactNode }) {
  return <div className="tr3-emptybox" style={{ marginTop: 40 }}><h3>{title}</h3>{text ? <p>{text}</p> : null}{action}</div>;
}
