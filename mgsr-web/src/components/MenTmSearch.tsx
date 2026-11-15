'use client';

/**
 * Men platform — Transfermarkt direct search ("Light Management Room" shell).
 * PRESENTATIONAL: request mapping, the live search and shortlist logic live in
 * app/tm-search/page.tsx. Layout = smart bar, request strip, filter column
 * (pitch + sliders) and results (cards or table) with a detail drawer.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import BritFilterSheetPortal from '@/components/BritFilterSheetPortal';
import type { Confederation } from '@/lib/api';
import { TM_COUNTRIES } from '@/lib/tmCountries';
import { parseMarketValue } from '@/lib/releases';
import {
  TM_AGE_MAX,
  TM_AGE_MIN,
  TM_HEIGHT_MAX,
  TM_HEIGHT_MIN,
  TM_VALUE_STEPS,
  fmtEuro,
  type TmSearchForm,
} from '@/lib/tmSearchFromRequest';
import type { TmSearchPlayer } from '@/lib/tmAdvancedSearch';

export interface TmRequestCard {
  id: string;
  club: string;
  logo?: string;
  position: string;
  minAge?: number;
  maxAge?: number;
  fee?: string;
  foot?: string;
  euOnly?: boolean;
}

/** The request currently driving the search (for the "fits request" marks). */
export interface TmActiveRequest {
  id: string;
  club: string;
  fee?: string;
  euOnly?: boolean;
  minAge?: number;
  maxAge?: number;
  valueCeiling: number | null;
  minHeight?: number;
  maxHeight?: number;
}

export type TmSortKey = 'rel' | 'vd' | 'vu' | 'au' | 'ad' | 'hd' | 'hu';

export interface MenTmSearchProps {
  form: TmSearchForm;
  setForm: (updater: (prev: TmSearchForm) => TmSearchForm) => void;
  barText: string;
  onBarChange: (text: string) => void;
  onBarSubmit: () => void;
  onReset: () => void;

  requests: TmRequestCard[];
  activeRequest: TmActiveRequest | null;
  onSelectRequest: (id: string) => void;

  regionOptions: { value: Confederation; key: string }[];
  contractYears: number[];

  hasSearched: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  players: TmSearchPlayer[];
  totalHits: number;
  hasMore: boolean;
  hiddenNoHeight: number;
  resultsKey: number;
  onLoadMore: () => void;

  shortlistUrls: Set<string>;
  rosterUrls: Set<string>;
  addingUrl: string | null;
  onAddToShortlist: (player: TmSearchPlayer) => void;
  onAddMany: (players: TmSearchPlayer[]) => void;
  toast: string;
  onToast: (msg: string) => void;
  /** Initial results layout (cards by default). */
  defaultView?: 'grid' | 'table';
}

const PITCH: Record<string, [number, number]> = {
  GK: [50, 92], LB: [14, 72], CB: [50, 76], RB: [86, 72], DM: [50, 60], CM: [30, 48],
  AM: [50, 35], LW: [14, 24], RW: [86, 24], SS: [66, 22], CF: [50, 10],
};

const HINTS = [
  'rw 20-26 up to 3m left foot',
  'cb under 24 europe 500k-2m 185+',
  'gk 195+ under 28',
  'free agent cm 25+',
];

const BM = (
  <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
);
const CK = (
  <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
);
const EXT = (
  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ display: 'inline', verticalAlign: '-1px' }}><path d="M7 17L17 7M8 7h9v9" /></svg>
);

// ─── helpers ──────────────────────────────────────────────────────────────

const valueOf = (p: TmSearchPlayer) => parseMarketValue(p.marketValue);
const ageOf = (p: TmSearchPlayer) => parseInt(p.playerAge, 10) || 0;
/** "1,85 m" -> 185 */
const heightCm = (p: TmSearchPlayer): number => {
  const m = p.height.match(/(\d)[,.](\d{2})/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
};
const initials = (n: string) => n.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function sortPlayers(list: TmSearchPlayer[], key: TmSortKey): TmSearchPlayer[] {
  if (key === 'rel') return list;
  const by: Record<Exclude<TmSortKey, 'rel'>, (a: TmSearchPlayer, b: TmSearchPlayer) => number> = {
    vd: (a, b) => valueOf(b) - valueOf(a),
    vu: (a, b) => valueOf(a) - valueOf(b),
    au: (a, b) => ageOf(a) - ageOf(b),
    ad: (a, b) => ageOf(b) - ageOf(a),
    hd: (a, b) => heightCm(b) - heightCm(a),
    hu: (a, b) => (heightCm(a) || 999) - (heightCm(b) || 999),
  };
  return [...list].sort(by[key]);
}

function fitsRequest(p: TmSearchPlayer, r: TmActiveRequest | null): boolean | null {
  if (!r) return null;
  const age = ageOf(p);
  const h = heightCm(p);
  const v = valueOf(p);
  if (r.valueCeiling && v > r.valueCeiling) return false;
  if (r.minAge && age && age < r.minAge) return false;
  if (r.maxAge && age && age > r.maxAge) return false;
  if (r.minHeight && h && h < r.minHeight) return false;
  if (r.maxHeight && h && h > r.maxHeight) return false;
  return true;
}

function idxFloor(v: number): number {
  let i = 0;
  TM_VALUE_STEPS.forEach((x, k) => { if (x <= v) i = k; });
  return i;
}
function idxCeil(v: number): number {
  for (let k = 0; k < TM_VALUE_STEPS.length; k++) if (TM_VALUE_STEPS[k] >= v) return k;
  return TM_VALUE_STEPS.length - 1;
}

// ─── sliders ──────────────────────────────────────────────────────────────

function DualRange({
  min, max, a, b, onChange, label,
}: { min: number; max: number; a: number; b: number; onChange: (a: number, b: number) => void; label: string }) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="ts-range" role="group" aria-label={label}>
      <div className="track" />
      <div className="fill" style={{ left: `${pct(a)}%`, right: `${100 - pct(b)}%` }} />
      <input type="range" min={min} max={max} value={a} aria-label={`${label} min`}
        onChange={(e) => onChange(Math.min(Number(e.target.value), b - 1), b)} />
      <input type="range" min={min} max={max} value={b} aria-label={`${label} max`}
        onChange={(e) => onChange(a, Math.max(Number(e.target.value), a + 1))} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────

export default function MenTmSearch(props: MenTmSearchProps) {
  const {
    form, setForm, barText, onBarChange, onBarSubmit, onReset,
    requests, activeRequest, onSelectRequest, regionOptions, contractYears,
    hasSearched, loading, loadingMore, error, players, totalHits, hasMore, hiddenNoHeight, resultsKey, onLoadMore,
    shortlistUrls, rosterUrls, addingUrl, onAddToShortlist, onAddMany, toast, onToast,
  } = props;
  const { t, lang, setLang, isRtl } = useLanguage();

  const [view, setView] = useState<'grid' | 'table'>(props.defaultView ?? 'grid');
  const [sort, setSort] = useState<TmSortKey>('rel');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerUrl, setDrawerUrl] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobileSheet = useMediaQuery('(max-width: 900px)');
  const barRef = useRef<HTMLInputElement>(null);

  // A new search starts a new selection.
  useEffect(() => { setSelected(new Set()); }, [resultsKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        barRef.current?.focus();
      }
      if (e.key === 'Escape') { setDrawerUrl(null); setSheetOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const set = <K extends keyof TmSearchForm>(patch: Pick<TmSearchForm, K>) => setForm((prev) => ({ ...prev, ...patch }));

  // ── slider <-> form conversions ──
  const ageA = form.minAge ? Math.max(TM_AGE_MIN, Number(form.minAge)) : TM_AGE_MIN;
  const ageB = form.maxAge ? Math.min(TM_AGE_MAX, Number(form.maxAge)) : TM_AGE_MAX;
  const valA = form.minValue ? idxFloor(Number(form.minValue)) : 0;
  const valB = form.maxValue ? idxCeil(Number(form.maxValue)) : TM_VALUE_STEPS.length - 1;
  const hA = form.minHeight ? Math.max(TM_HEIGHT_MIN, Number(form.minHeight)) : TM_HEIGHT_MIN;
  const hB = form.maxHeight ? Math.min(TM_HEIGHT_MAX, Number(form.maxHeight)) : TM_HEIGHT_MAX;
  const lastVal = TM_VALUE_STEPS.length - 1;

  const ageLabel = !form.minAge && !form.maxAge ? t('tm_search_any') : `${ageA} – ${ageB >= TM_AGE_MAX ? `${TM_AGE_MAX}+` : ageB}`;
  const valLabel = !form.minValue && !form.maxValue ? t('tm_search_any')
    : valA === 0 ? `${t('tm_search_up_to')} ${fmtEuro(TM_VALUE_STEPS[valB])}`
      : valB >= lastVal ? `${t('tm_search_from')} ${fmtEuro(TM_VALUE_STEPS[valA])}`
        : `${fmtEuro(TM_VALUE_STEPS[valA])} – ${fmtEuro(TM_VALUE_STEPS[valB])}`;
  const unit = t('tm_search_height_unit');
  const hLabel = !form.minHeight && !form.maxHeight ? t('tm_search_any')
    : !form.minHeight ? `${t('tm_search_up_to')} ${hB} ${unit}`
      : !form.maxHeight ? `${t('tm_search_from')} ${hA} ${unit}`
        : `${hA} – ${hB} ${unit}`;

  const countryName = form.countryId ? TM_COUNTRIES.find((c) => c.id === form.countryId)?.name : undefined;

  // ── active filter chips ──
  const chips = useMemo(() => {
    const c: { label: string; value: string; clear: () => void }[] = [];
    if (form.position) c.push({ label: t('releases_position'), value: form.position, clear: () => set({ position: null }) });
    if (form.minAge || form.maxAge) c.push({ label: t('releases_age'), value: ageLabel, clear: () => set({ minAge: '', maxAge: '' }) });
    if (form.minValue || form.maxValue) c.push({ label: t('tm_search_value'), value: valLabel, clear: () => set({ minValue: '', maxValue: '' }) });
    if (form.minHeight || form.maxHeight) c.push({ label: t('tm_search_height'), value: hLabel, clear: () => set({ minHeight: '', maxHeight: '' }) });
    if (form.countryId) c.push({ label: t('tm_search_country'), value: countryName || '', clear: () => set({ countryId: null }) });
    else if (form.confederation) c.push({ label: t('contract_finisher_filter_label_region'), value: form.confederation, clear: () => set({ confederation: null }) });
    if (form.foot) c.push({ label: t('player_info_foot'), value: t(`player_info_foot_${form.foot}`), clear: () => set({ foot: null }) });
    if (form.contractYear) c.push({ label: t('tm_search_contract_label'), value: String(form.contractYear), clear: () => set({ contractYear: null }) });
    if (form.freeAgentsOnly) c.push({ label: '', value: t('tm_search_free_agents'), clear: () => set({ freeAgentsOnly: false }) });
    if (form.excludeLoans) c.push({ label: '', value: t('tm_search_exclude_loans'), clear: () => set({ excludeLoans: false }) });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, ageLabel, valLabel, hLabel, countryName, t]);

  const sorted = useMemo(() => sortPlayers(players, sort), [players, sort]);
  const drawerPlayer = drawerUrl ? players.find((p) => p.playerUrl === drawerUrl) ?? null : null;

  const toggleSel = (url: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(url)) n.delete(url); else n.add(url); return n; });

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const removeLastFilter = () => { if (chips.length) chips[chips.length - 1].clear(); };

  const copyLinks = async () => {
    const urls = sorted.filter((p) => selected.has(p.playerUrl)).map((p) => p.playerUrl).join('\n');
    try { await navigator.clipboard.writeText(urls); } catch { /* clipboard blocked: toast anyway */ }
    onToast(t('tm_search_toast_copied').replace('{n}', String(selected.size)));
  };

  const filtersPanel = (
    <>
      <div className={`ts-scrim${sheetOpen ? ' show' : ''}`} onClick={() => setSheetOpen(false)} aria-hidden />
      <aside className={`ts-filters${sheetOpen ? ' open' : ''}`} aria-label={t('filters')}>
        <div className="ts-fhead">
          <h3>{t('tm_search_refine')} {chips.length > 0 && <em>· {chips.length}</em>}</h3>
          <div className="acts">
            <button type="button" onClick={onReset}>{t('tm_search_reset_all')}</button>
            <button type="button" className="ts-close" onClick={() => setSheetOpen(false)} aria-label="Close">×</button>
          </div>
        </div>

        <div className="ts-grp">
          <div className="ts-lab"><span>{t('tm_search_pos_tap')}</span><span className="val">{form.position || t('tm_search_any')}</span></div>
          <div className="ts-pitch">
            <svg className="lines" viewBox="0 0 100 105" preserveAspectRatio="none" aria-hidden>
              <rect x="2" y="2" width="96" height="101" /><line x1="2" y1="52" x2="98" y2="52" /><circle cx="50" cy="52" r="10" />
              <rect x="26" y="2" width="48" height="17" /><rect x="38" y="2" width="24" height="7" />
              <rect x="26" y="86" width="48" height="17" /><rect x="38" y="96" width="24" height="7" />
            </svg>
            {Object.entries(PITCH).map(([k, [x, y]]) => (
              <button key={k} type="button" className={`ts-dot${form.position === k ? ' on' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => set({ position: form.position === k ? null : k })}>{k}</button>
            ))}
          </div>
        </div>

        <div className="ts-grp">
          <div className="ts-lab"><span>{t('releases_age')}</span><span className="val">{ageLabel}</span></div>
          <DualRange min={TM_AGE_MIN} max={TM_AGE_MAX} a={ageA} b={ageB} label={t('releases_age')}
            onChange={(a, b) => set({ minAge: a <= TM_AGE_MIN ? '' : String(a), maxAge: b >= TM_AGE_MAX ? '' : String(b) })} />
          <div className="ts-presets">
            {([['U21', 14, 21], ['U23', 14, 23], ['22–27', 22, 27], ['28+', 28, 45]] as const).map(([label, a, b]) => {
              const on = ageA === a && ageB === b && (!!form.minAge || !!form.maxAge);
              return (
                <button key={label} type="button" className={`ts-chip${on ? ' on' : ''}`}
                  onClick={() => (on ? set({ minAge: '', maxAge: '' }) : set({ minAge: a <= TM_AGE_MIN ? '' : String(a), maxAge: b >= TM_AGE_MAX ? '' : String(b) }))}>{label}</button>
              );
            })}
          </div>
        </div>

        <div className="ts-grp">
          <div className="ts-lab"><span>{t('tm_search_value')}</span><span className="val">{valLabel}</span></div>
          <DualRange min={0} max={lastVal} a={valA} b={valB} label={t('tm_search_value')}
            onChange={(a, b) => set({ minValue: a <= 0 ? '' : String(TM_VALUE_STEPS[a]), maxValue: b >= lastVal ? '' : String(TM_VALUE_STEPS[b]) })} />
          <div className="ts-presets">
            {([['<€500k', 0, 7], ['€500k–1M', 7, 9], ['€1–3M', 9, 12], ['€3–10M', 12, 15], ['€10M+', 15, lastVal]] as const).map(([label, a, b]) => {
              const on = valA === a && valB === b && (!!form.minValue || !!form.maxValue);
              return (
                <button key={label} type="button" className={`ts-chip${on ? ' on' : ''}`}
                  onClick={() => (on ? set({ minValue: '', maxValue: '' }) : set({ minValue: a <= 0 ? '' : String(TM_VALUE_STEPS[a]), maxValue: b >= lastVal ? '' : String(TM_VALUE_STEPS[b]) }))}>{label}</button>
              );
            })}
          </div>
        </div>

        <div className="ts-grp">
          <div className="ts-lab"><span>{t('tm_search_height')}</span><span className="val">{hLabel}</span></div>
          <DualRange min={TM_HEIGHT_MIN} max={TM_HEIGHT_MAX} a={hA} b={hB} label={t('tm_search_height')}
            onChange={(a, b) => set({ minHeight: a <= TM_HEIGHT_MIN ? '' : String(a), maxHeight: b >= TM_HEIGHT_MAX ? '' : String(b) })} />
          <div className="ts-presets">
            {([['<175', TM_HEIGHT_MIN, 175], ['175–185', 175, 185], ['185–195', 185, 195], ['195+', 195, TM_HEIGHT_MAX]] as const).map(([label, a, b]) => {
              const on = hA === a && hB === b && (!!form.minHeight || !!form.maxHeight);
              return (
                <button key={label} type="button" className={`ts-chip${on ? ' on' : ''}`}
                  onClick={() => (on ? set({ minHeight: '', maxHeight: '' }) : set({ minHeight: a <= TM_HEIGHT_MIN ? '' : String(a), maxHeight: b >= TM_HEIGHT_MAX ? '' : String(b) }))}>{label}</button>
              );
            })}
          </div>
        </div>

        <div className="ts-grp">
          <div className="ts-lab"><span>{t('contract_finisher_filter_label_region')}</span></div>
          <div className="ts-chips">
            {regionOptions.map((r) => (
              <button key={r.value} type="button" className={`ts-chip${form.confederation === r.value && !form.countryId ? ' on' : ''}`}
                onClick={() => set({ countryId: null, confederation: form.confederation === r.value ? null : r.value })}>{t(r.key)}</button>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <select className="ts-sel" value={form.countryId ?? ''} aria-label={t('tm_search_country')}
              onChange={(e) => set({ countryId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">{t('tm_search_any_country')}</option>
              {TM_COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="ts-grp">
          <div className="ts-lab"><span>{t('player_info_foot')}</span></div>
          <div className="ts-seg">
            <button type="button" className={!form.foot ? 'on' : ''} onClick={() => set({ foot: null })}>{t('tm_search_any')}</button>
            <button type="button" className={form.foot === 'left' ? 'on' : ''} onClick={() => set({ foot: 'left' })}>{t('player_info_foot_left')}</button>
            <button type="button" className={form.foot === 'right' ? 'on' : ''} onClick={() => set({ foot: 'right' })}>{t('player_info_foot_right')}</button>
            <button type="button" className={form.foot === 'both' ? 'on' : ''} onClick={() => set({ foot: 'both' })}>{t('player_info_foot_both')}</button>
          </div>
        </div>

        <div className="ts-grp">
          <div className="ts-lab"><span>{t('tm_search_contract')}</span></div>
          <div className="ts-chips">
            {contractYears.map((y) => (
              <button key={y} type="button" className={`ts-chip${form.contractYear === y ? ' on' : ''}`}
                onClick={() => set({ contractYear: form.contractYear === y ? null : y })}>{y}</button>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <button type="button" className={`ts-tog${form.freeAgentsOnly ? ' on' : ''}`} onClick={() => set({ freeAgentsOnly: !form.freeAgentsOnly })}><span className="sw" />{t('tm_search_free_agents')}</button>
            <button type="button" className={`ts-tog${form.excludeLoans ? ' on' : ''}`} onClick={() => set({ excludeLoans: !form.excludeLoans })}><span className="sw" />{t('tm_search_exclude_loans')}</button>
          </div>
        </div>

        <div className="ts-apply">
          <button type="button" className="ts-btn dark" onClick={() => setSheetOpen(false)}>
            {t('tm_search_show_n').replace('{n}', String(totalHits))}
          </button>
        </div>
      </aside>
    </>
  );

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="tm-search" />
        <div className="brit-main">
          <header className="brit-topbar">
            <div>BRIT / <strong>{t('nav_tm_search')}</strong> / {dateStr}</div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('tm_search_kicker')}</p>
                <h1>{t('tm_search_head_a')} <span>{t('tm_search_head_b')}</span></h1>
              </div>
            </header>

            {/* Smart bar */}
            <div className="ts-smart">
              <svg viewBox="0 0 24 24" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                ref={barRef}
                value={barText}
                autoComplete="off"
                spellCheck={false}
                dir="ltr"
                placeholder={t('tm_search_bar_placeholder')}
                onChange={(e) => onBarChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onBarSubmit(); }}
                aria-label={t('tm_search_bar_placeholder')}
              />
              {barText ? <button type="button" className="clear" onClick={() => onBarChange('')} aria-label={t('tm_search_clear')}>×</button> : <kbd>/</kbd>}
            </div>
            <div className="ts-hints" dir="ltr">
              <span>{t('tm_search_try')}</span>
              {HINTS.map((h) => <button key={h} type="button" onClick={() => onBarChange(h)}>{h}</button>)}
            </div>

            {/* Requests */}
            {requests.length > 0 && (
              <>
                <div className="ts-sect">
                  <span><b>{t('tm_search_requests_title')}</b> &nbsp;{t('tm_search_requests_hint')}</span>
                  <span>{t('tm_search_requests_count').replace('{n}', String(requests.length))}</span>
                </div>
                <div className="ts-reqs">
                  {requests.map((r) => (
                    <button key={r.id} type="button" className={`ts-req${activeRequest?.id === r.id ? ' on' : ''}`}
                      data-tag={t('tm_search_loaded_tag')} onClick={() => onSelectRequest(r.id)}>
                      <div className="club">
                        <div className="ts-crest">{r.logo ? <img src={r.logo} alt="" /> : initials(r.club)}</div>
                        <div className="nm">{r.club}</div>
                      </div>
                      <div className="row">
                        <span className="ts-tag pos">{r.position}</span>
                        {(r.minAge || r.maxAge) ? <span className="ts-tag">{t('players_age_display').replace('{age}', `${r.minAge ?? ''}–${r.maxAge ?? ''}`)}</span> : null}
                        {r.fee ? <span className="ts-tag">{r.fee}</span> : null}
                        {r.foot ? <span className="ts-tag">{r.foot}</span> : null}
                        {r.euOnly ? <span className="ts-tag">EU</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="ts-work">
              <BritFilterSheetPortal active={isMobileSheet} isRtl={isRtl}>{filtersPanel}</BritFilterSheetPortal>

              <section className={`ts-res${loading ? ' loading' : ''}`}>
                <div className="ts-toolbar">
                  <div className="ts-count">
                    <strong>{hasSearched && !error ? totalHits : '–'}</strong>
                    <span>{loading ? t('tm_search_searching') : t('tm_search_hits_label')}</span>
                  </div>
                  <div className="ts-tools">
                    <button type="button" className="ts-btn ts-mfilter" onClick={() => setSheetOpen(true)}>
                      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18M6 12h12M10 20h4" /></svg>
                      {t('filters')}{chips.length > 0 ? ` (${chips.length})` : ''}
                    </button>
                    <select className="ts-sort" value={sort} onChange={(e) => setSort(e.target.value as TmSortKey)} aria-label={t('tm_search_sort_label')} title={t('tm_search_sort_label')}>
                      <option value="rel">{t('tm_search_sort_tm')}</option>
                      <option value="vd">{t('tm_search_sort_vd')}</option>
                      <option value="vu">{t('tm_search_sort_vu')}</option>
                      <option value="hd">{t('tm_search_sort_hd')}</option>
                      <option value="hu">{t('tm_search_sort_hu')}</option>
                      <option value="au">{t('tm_search_sort_au')}</option>
                      <option value="ad">{t('tm_search_sort_ad')}</option>
                    </select>
                    <div className="ts-viewtog">
                      <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="Cards"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg></button>
                      <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setView('table')} aria-label="Table"><svg viewBox="0 0 24 24" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg></button>
                    </div>
                  </div>
                </div>

                {chips.length > 0 && (
                  <div className="ts-active">
                    {chips.map((c, i) => (
                      <span key={`${c.label}-${i}`} className="ts-ach">{c.label ? <>{c.label} <b>{c.value}</b></> : <b>{c.value}</b>}
                        <button type="button" onClick={c.clear} aria-label="Remove">×</button>
                      </span>
                    ))}
                  </div>
                )}

                {activeRequest && (
                  <>
                    <p className="ts-note">
                      <b>{t('tm_search_ctx_loaded').replace('{club}', activeRequest.club).replace('{fee}', activeRequest.fee || '—')}</b>
                      {activeRequest.euOnly ? <> {t('tm_search_ctx_eu')}</> : null}
                    </p>
                    {!activeRequest.minHeight && !activeRequest.maxHeight && !form.minHeight && !form.maxHeight && (
                      <p className="ts-note soft">{t('tm_search_ctx_height')}</p>
                    )}
                  </>
                )}
                {hiddenNoHeight > 0 && <p className="ts-note soft">{t('tm_search_hidden_no_height').replace('{n}', String(hiddenNoHeight))}</p>}

                {error ? (
                  <div className="ts-empty"><h4>{error}</h4></div>
                ) : !hasSearched && !loading ? (
                  <div className="ts-empty"><p style={{ margin: 0 }}>{t('tm_search_idle')}</p></div>
                ) : loading && players.length === 0 ? (
                  <div className="ts-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="ts-skel" />)}</div>
                ) : players.length === 0 ? (
                  <div className="ts-empty">
                    <h4>{t('tm_search_no_results')}</h4>
                    <p>{t('tm_search_no_results_hint')}</p>
                    {chips.length > 0 && <button type="button" className="ts-btn dark" onClick={removeLastFilter}>{t('tm_search_remove_last')}</button>}
                  </div>
                ) : (
                  <>
                    {view === 'grid' ? (
                      <div className="ts-grid">
                        {sorted.map((p, i) => (
                          <ResultCard key={p.playerUrl} p={p} i={i} req={activeRequest}
                            sel={selected.has(p.playerUrl)} saved={shortlistUrls.has(p.playerUrl)} inRoster={rosterUrls.has(p.playerUrl)}
                            adding={addingUrl === p.playerUrl} onSel={toggleSel} onSave={onAddToShortlist} onOpen={setDrawerUrl} />
                        ))}
                      </div>
                    ) : (
                      <div className="ts-table">
                        <div className="ts-tr head">
                          <span /><span>{t('tm_search_col_player')}</span><span>{t('tm_search_col_pos')}</span><span className="t-hide">{t('releases_age')}</span>
                          <span className="c-hide t-hide">{t('returnee_current_club')}</span><span>{t('tm_search_value')}</span>
                          <span className="t-hide">{t('tm_search_height')}</span><span className="h-hide t-hide">{t('tm_search_contract_label')}</span>
                          <span />
                        </div>
                        {sorted.map((p, i) => (
                          <ResultRow key={p.playerUrl} p={p} i={i}
                            sel={selected.has(p.playerUrl)} saved={shortlistUrls.has(p.playerUrl)} inRoster={rosterUrls.has(p.playerUrl)}
                            onSel={toggleSel} onSave={onAddToShortlist} onOpen={setDrawerUrl} />
                        ))}
                      </div>
                    )}
                    <div className="ts-more">
                      {hasMore && (
                        <button type="button" className="ts-btn" onClick={onLoadMore} disabled={loadingMore}>
                          {loadingMore ? t('tm_search_loading_more') : t('tm_search_load_more')}
                        </button>
                      )}
                    </div>
                    <p className="ts-cap">{t('tm_search_showing').replace('{n}', String(players.length)).replace('{total}', String(totalHits))}{totalHits >= 250 ? ` · ${t('tm_search_cap_note')}` : ''}</p>
                  </>
                )}
              </section>
            </div>
          </main>
        </div>
      </div>

      {/* Bulk bar + toast + drawer */}
      <div className={`ts-bulk${selected.size > 0 ? ' show' : ''}`}>
        <strong>{selected.size}</strong><span>{t('tm_search_selected')}</span>
        <button type="button" className="ts-btn gold" onClick={() => onAddMany(sorted.filter((p) => selected.has(p.playerUrl)))}>{t('tm_search_add_selected')}</button>
        <button type="button" className="ts-btn" onClick={copyLinks}>{t('tm_search_copy_links')}</button>
        <button type="button" className="ts-btn" onClick={() => setSelected(new Set())}>{t('tm_search_clear')}</button>
      </div>
      <div className={`ts-toast${toast ? ' show' : ''}`} role="status">{toast}</div>
      <div className={`ts-scrim${drawerPlayer ? ' show' : ''}`} onClick={() => setDrawerUrl(null)} aria-hidden />
      <aside className={`ts-drawer${drawerPlayer ? ' show' : ''}`} aria-hidden={!drawerPlayer}>
        {drawerPlayer && (
          <PlayerDrawer p={drawerPlayer} saved={shortlistUrls.has(drawerPlayer.playerUrl)} inRoster={rosterUrls.has(drawerPlayer.playerUrl)}
            adding={addingUrl === drawerPlayer.playerUrl} onClose={() => setDrawerUrl(null)} onSave={onAddToShortlist} />
        )}
      </aside>
    </div>
  );
}

// ─── result pieces ────────────────────────────────────────────────────────

function Avatar({ p }: { p: TmSearchPlayer }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [flagFailed, setFlagFailed] = useState(false);
  return (
    <div className="ts-av">
      {initials(p.playerName)}
      {p.playerImage && !imgFailed && <img className="ph" src={p.playerImage} alt="" loading="lazy" decoding="async" onError={() => setImgFailed(true)} />}
      {p.playerNationalityFlag && !flagFailed && (
        <span className="fl"><img src={p.playerNationalityFlag} alt="" onError={() => setFlagFailed(true)} /></span>
      )}
    </div>
  );
}

interface PieceProps {
  p: TmSearchPlayer;
  i: number;
  sel: boolean;
  saved: boolean;
  inRoster: boolean;
  onSel: (url: string) => void;
  onSave: (p: TmSearchPlayer) => void;
  onOpen: (url: string) => void;
}

const ResultCard = memo(function ResultCard({
  p, i, req, sel, saved, inRoster, adding, onSel, onSave, onOpen,
}: PieceProps & { req: TmActiveRequest | null; adding: boolean }) {
  const { t, isRtl } = useLanguage();
  const fit = fitsRequest(p, req);
  const nat = p.playerNationalities.length ? p.playerNationalities.join(' / ') : p.playerNationality;
  const badge = !p.clubJoinedName ? (
    <span className="ts-badge free">{t('tm_search_without_club')}</span>
  ) : p.contractExpires ? (
    <span className="ts-badge">{t('tm_search_contract_badge').replace('{year}', p.contractExpires)}</span>
  ) : null;

  return (
    <article className={`ts-card${sel ? ' sel' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
      onClick={(e) => { if ((e.target as HTMLElement).closest('a,button')) return; onOpen(p.playerUrl); }}>
      {badge}
      <button type="button" className="ts-check" onClick={() => onSel(p.playerUrl)} aria-label="Select" aria-pressed={sel}>{CK}</button>
      {fit !== null && (
        <span className={`ts-fit${fit ? '' : ' no'}`}>{fit ? <>{CK_SMALL} {t('tm_search_fits')}</> : t('tm_search_over')}</span>
      )}
      <div className="ts-ctop">
        <Avatar p={p} />
        <div className="ts-who">
          <div className="ts-nm" title={p.playerName}>{p.playerName || (isRtl ? 'לא ידוע' : 'Unknown')}</div>
          <div className="ts-meta">
            <span className="ts-pill">{p.playerPosition || '—'}</span>
            {p.playerAge && <span className="ts-pill l">{t('players_age_display').replace('{age}', p.playerAge)}</span>}
            {nat && <span className="ts-pill l">{nat}</span>}
          </div>
        </div>
      </div>
      <div className="ts-facts">
        <div className="v"><label>{t('returnee_market_value')}</label><b>{p.marketValue || '—'}</b></div>
        <div><label>{t('returnee_current_club')}</label><b>{p.clubJoinedName || t('tm_search_without_club')}</b></div>
        <div><label>{t('tm_search_height')}</label><b>{p.height && /\d/.test(p.height) ? p.height : '—'}</b></div>
      </div>
      <div className="ts-cact">
        {inRoster ? (
          <span className="saved-tag">{t('tm_search_in_roster')}</span>
        ) : saved ? (
          <>
            <span className="ts-ico saved" aria-label={t('releases_saved')}>{BM}</span>
            <Link className="tm" href="/shortlist">{t('releases_view_shortlist')} {isRtl ? '←' : '→'}</Link>
          </>
        ) : (
          <button type="button" className="ts-ico" disabled={adding} onClick={() => onSave(p)} title={t('releases_bookmark')} aria-label={t('releases_bookmark')}>{BM}</button>
        )}
        <span className="sp" />
        <a className="tm" href={p.playerUrl} target="_blank" rel="noopener noreferrer">{t('tm_search_open_tm')} {EXT}</a>
      </div>
    </article>
  );
});

const CK_SMALL = (
  <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg>
);

const ResultRow = memo(function ResultRow({ p, i, sel, saved, inRoster, onSel, onSave, onOpen }: PieceProps) {
  const { t } = useLanguage();
  return (
    <div className={`ts-tr${sel ? ' sel' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
      onClick={(e) => { if ((e.target as HTMLElement).closest('a,button')) return; onOpen(p.playerUrl); }}>
      <button type="button" className="cb" onClick={() => onSel(p.playerUrl)} aria-label="Select" aria-pressed={sel}>{CK}</button>
      <div className="mini"><Avatar p={p} /><div style={{ minWidth: 0 }}><div className="nm">{p.playerName}</div><div className="sub">{p.playerNationality}<span className="mob-age"> · {p.playerAge}</span></div></div></div>
      <span className="ts-pill">{p.playerPosition || '—'}</span>
      <span className="m t-hide">{p.playerAge || '—'}</span>
      <span className="m c-hide t-hide" style={{ color: 'var(--ink)' }}>{p.clubJoinedName || t('tm_search_without_club')}</span>
      <span className="gold">{p.marketValue || '—'}</span>
      <span className="m t-hide">{p.height && /\d/.test(p.height) ? p.height : '—'}</span>
      <span className="m h-hide t-hide">{p.contractExpires || (p.clubJoinedName ? '—' : t('tm_search_without_club'))}</span>
      <span className="acts">
        {inRoster ? <span className="ts-ico saved" title={t('tm_search_in_roster')} aria-label={t('tm_search_in_roster')}>{CK}</span> : (
          <button type="button" className={`ts-ico${saved ? ' saved' : ''}`} disabled={saved} onClick={() => onSave(p)} aria-label={t('releases_bookmark')}>{BM}</button>
        )}
      </span>
    </div>
  );
});

function PlayerDrawer({
  p, saved, inRoster, adding, onClose, onSave,
}: { p: TmSearchPlayer; saved: boolean; inRoster: boolean; adding: boolean; onClose: () => void; onSave: (p: TmSearchPlayer) => void }) {
  const { t } = useLanguage();
  const nat = p.playerNationalities.length ? p.playerNationalities.join(' / ') : p.playerNationality;
  return (
    <>
      <div className="ts-dhero">
        <button type="button" className="ts-dx" onClick={onClose} aria-label="Close">×</button>
        <Avatar p={p} />
        <h2>{p.playerName}</h2>
        <div className="ts-meta">
          <span className="ts-pill">{p.playerPosition}</span>
          {p.otherPositions.map((o) => <span key={o} className="ts-pill l">{o}</span>)}
          {nat && <span className="ts-pill l">{nat}</span>}
        </div>
      </div>
      <div className="ts-dval"><b>{p.marketValue || '—'}</b><span>{t('returnee_market_value')}</span></div>
      <div className="ts-dgrid">
        <div><label>{t('releases_age')}</label><b>{p.playerAge ? t('players_age_display').replace('{age}', p.playerAge) : '—'}</b></div>
        <div><label>{t('returnee_current_club')}</label><b>{p.clubJoinedName || t('tm_search_without_club')}</b></div>
        <div><label>{t('tm_search_height')}</label><b>{p.height && /\d/.test(p.height) ? p.height : '—'}</b></div>
        <div><label>{t('tm_search_contract_label')}</label><b>{p.contractExpires || '—'}</b></div>
        <div><label>{t('tm_search_dob')}</label><b>{p.dateOfBirth || '—'}</b></div>
        <div><label>{t('tm_search_other_pos')}</label><b>{p.otherPositions.join(', ') || '—'}</b></div>
      </div>
      <div className="ts-dact">
        {inRoster ? (
          <span className="ts-btn" style={{ justifyContent: 'center' }}>{t('tm_search_in_roster')}</span>
        ) : (
          <button type="button" className="ts-btn dark" disabled={saved || adding} onClick={() => onSave(p)}>
            {saved ? t('releases_saved') : adding ? t('shortlist_adding') : t('tm_search_add_selected')}
          </button>
        )}
        <a className="ts-btn" href={p.playerUrl} target="_blank" rel="noopener noreferrer">{t('tm_search_open_tm')} {EXT}</a>
      </div>
      <p className="ts-dnote">{t('tm_search_drawer_note')}</p>
    </>
  );
}
