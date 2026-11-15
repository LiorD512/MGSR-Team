'use client';

/**
 * Men platform — Transfermarkt direct search ("Light Management Room" shell).
 * PRESENTATIONAL: all loading / request mapping / shortlist logic lives in
 * app/tm-search/page.tsx. Result cards reuse the .brit-cf-card look of the
 * Contract Finisher screen.
 */

import { memo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import type { Confederation } from '@/lib/api';
import type { TmSearchForm } from '@/lib/tmSearchFromRequest';
import { TM_COUNTRIES } from '@/lib/tmCountries';
import type { TmSearchPlayer } from '@/lib/tmAdvancedSearch';

export interface TmRequestOption {
  id: string;
  label: string;
}

export interface MenTmSearchProps {
  form: TmSearchForm;
  setForm: (updater: (prev: TmSearchForm) => TmSearchForm) => void;
  positions: readonly string[];
  positionLabel: (pos: string) => string;
  regionOptions: { value: Confederation; key: string }[];
  contractYears: number[];

  requestOptions: TmRequestOption[];
  selectedRequestId: string;
  onSelectRequest: (id: string) => void;
  requestNotes: string[];

  onSearch: () => void;
  onReset: () => void;
  onLoadMore: () => void;

  hasSearched: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  players: TmSearchPlayer[];
  totalHits: number;
  hasMore: boolean;

  shortlistUrls: Set<string>;
  rosterUrls: Set<string>;
  addingUrl: string | null;
  onAddToShortlist: (player: TmSearchPlayer) => void;
}

const Clock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

export default function MenTmSearch(props: MenTmSearchProps) {
  const {
    form, setForm, positions, positionLabel, regionOptions, contractYears,
    requestOptions, selectedRequestId, onSelectRequest, requestNotes,
    onSearch, onReset, onLoadMore,
    hasSearched, loading, loadingMore, error, players, totalHits, hasMore,
    shortlistUrls, rosterUrls, addingUrl, onAddToShortlist,
  } = props;
  const { t, lang, setLang, isRtl } = useLanguage();

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const set = <K extends keyof TmSearchForm>(key: K, value: TmSearchForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const numeric = (v: string) => v.replace(/[^\d]/g, '');

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); onSearch(); }
  };

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
                <p className="brit-cf-sub">{t('tm_search_sub')}</p>
              </div>
            </header>

            <section className="brit-ts-panel" aria-label={t('filters')}>
              {/* Start from a request */}
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('tm_search_from_request')}</span>
                <div className="brit-ts-field">
                  <select value={selectedRequestId} onChange={(e) => onSelectRequest(e.target.value)} aria-label={t('tm_search_from_request')}>
                    <option value="">{t('tm_search_custom')}</option>
                    {requestOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              {requestNotes.length > 0 && (
                <div className="brit-ts-notes">
                  {requestNotes.map((n) => <p key={n}>{n}</p>)}
                </div>
              )}

              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_position')}</span>
                <div className="brit-req-chipset">
                  <button className={!form.position ? 'on' : ''} onClick={() => set('position', null)}>{t('releases_all')}</button>
                  {positions.map((p) => (
                    <button key={p} className={form.position === p ? 'on' : ''} onClick={() => set('position', form.position === p ? null : p)}>
                      {positionLabel(p)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_age')}</span>
                <div className="brit-ts-inputs">
                  <label><span>{t('tm_search_age_from')}</span>
                    <input inputMode="numeric" value={form.minAge} placeholder="14" onChange={(e) => set('minAge', numeric(e.target.value).slice(0, 2))} onKeyDown={onEnter} />
                  </label>
                  <label><span>{t('tm_search_age_to')}</span>
                    <input inputMode="numeric" value={form.maxAge} placeholder="50" onChange={(e) => set('maxAge', numeric(e.target.value).slice(0, 2))} onKeyDown={onEnter} />
                  </label>
                </div>
              </div>

              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('contract_finisher_filter_label_value')}</span>
                <div className="brit-ts-inputs">
                  <label><span>{t('tm_search_value_from')}</span>
                    <input inputMode="numeric" value={form.minValue} placeholder="0" onChange={(e) => set('minValue', numeric(e.target.value).slice(0, 9))} onKeyDown={onEnter} />
                  </label>
                  <label><span>{t('tm_search_value_to')}</span>
                    <input inputMode="numeric" value={form.maxValue} placeholder="200000000" onChange={(e) => set('maxValue', numeric(e.target.value).slice(0, 9))} onKeyDown={onEnter} />
                  </label>
                </div>
              </div>

              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('contract_finisher_filter_label_region')}</span>
                <div className="brit-req-chipset">
                  <button className={!form.confederation ? 'on' : ''} onClick={() => set('confederation', null)}>{t('releases_all')}</button>
                  {regionOptions.map((r) => (
                    <button
                      key={r.value}
                      className={form.confederation === r.value ? 'on' : ''}
                      onClick={() => set('confederation', form.confederation === r.value ? null : r.value)}
                    >
                      {t(r.key)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('tm_search_country')}</span>
                <div className="brit-ts-field">
                  <select
                    value={form.countryId ?? ''}
                    onChange={(e) => set('countryId', e.target.value ? Number(e.target.value) : null)}
                    aria-label={t('tm_search_country')}
                  >
                    <option value="">{t('tm_search_any_country')}</option>
                    {TM_COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {form.countryId && form.confederation ? <small>{t('tm_search_region_note')}</small> : null}
                </div>
              </div>

              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('player_info_foot')}</span>
                <div className="brit-req-chipset">
                  <button className={!form.foot ? 'on' : ''} onClick={() => set('foot', null)}>{t('releases_all')}</button>
                  <button className={form.foot === 'left' ? 'on' : ''} onClick={() => set('foot', 'left')}>{t('player_info_foot_left')}</button>
                  <button className={form.foot === 'right' ? 'on' : ''} onClick={() => set('foot', 'right')}>{t('player_info_foot_right')}</button>
                  <button className={form.foot === 'both' ? 'on' : ''} onClick={() => set('foot', 'both')}>{t('player_info_foot_both')}</button>
                </div>
              </div>

              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('tm_search_contract')}</span>
                <div className="brit-req-chipset">
                  <button className={!form.contractYear ? 'on' : ''} onClick={() => set('contractYear', null)}>{t('tm_search_any')}</button>
                  {contractYears.map((y) => (
                    <button key={y} className={form.contractYear === y ? 'on' : ''} onClick={() => set('contractYear', form.contractYear === y ? null : y)}>{y}</button>
                  ))}
                </div>
              </div>

              <div className="brit-cf-toggle-row">
                <button className={`brit-cf-roster-toggle${form.freeAgentsOnly ? ' on' : ''}`} onClick={() => set('freeAgentsOnly', !form.freeAgentsOnly)}>
                  <span className="sw" />{t('tm_search_free_agents')}
                </button>
                <button className={`brit-cf-roster-toggle${form.excludeLoans ? ' on' : ''}`} onClick={() => set('excludeLoans', !form.excludeLoans)}>
                  <span className="sw" />{t('tm_search_exclude_loans')}
                </button>
              </div>

              <div className="brit-ts-actions">
                <button type="button" className="brit-ts-run" onClick={onSearch} disabled={loading}>
                  {loading ? t('tm_search_searching') : t('tm_search_run')}
                </button>
                <button type="button" className="brit-ts-reset" onClick={onReset} disabled={loading}>{t('tm_search_reset')}</button>
              </div>
            </section>

            {hasSearched && !loading && !error && (
              <p className="brit-result-count">
                {t('tm_search_showing').replace('{n}', String(players.length)).replace('{total}', String(totalHits))}
                {totalHits >= 250 ? <span className="brit-ts-cap"> · {t('tm_search_cap_note')}</span> : null}
              </p>
            )}

            {error ? (
              <div className="brit-empty">{error}</div>
            ) : loading ? (
              <div className="brit-empty">{t('tm_search_searching')}</div>
            ) : !hasSearched ? (
              <div className="brit-empty">{t('tm_search_idle')}</div>
            ) : players.length === 0 ? (
              <div className="brit-empty">{t('tm_search_no_results')}</div>
            ) : (
              <>
                <div className="brit-cf-feed">
                  {players.map((p) => (
                    <TmSearchCard
                      key={p.playerUrl}
                      player={p}
                      isInShortlist={shortlistUrls.has(p.playerUrl)}
                      isInRoster={rosterUrls.has(p.playerUrl)}
                      isAdding={addingUrl === p.playerUrl}
                      onAddToShortlist={onAddToShortlist}
                    />
                  ))}
                </div>
                {hasMore && (
                  <div className="brit-ts-more">
                    <button type="button" onClick={onLoadMore} disabled={loadingMore}>
                      {loadingMore ? t('tm_search_loading_more') : t('tm_search_load_more')}
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

const TmSearchCard = memo(function TmSearchCard({
  player, isInShortlist, isInRoster, isAdding, onAddToShortlist,
}: {
  player: TmSearchPlayer;
  isInShortlist: boolean;
  isInRoster: boolean;
  isAdding: boolean;
  onAddToShortlist: (p: TmSearchPlayer) => void;
}) {
  const { t, isRtl } = useLanguage();
  const [flagFailed, setFlagFailed] = useState(false);
  const flag = !flagFailed && player.playerNationalityFlag ? player.playerNationalityFlag : null;
  const nationalities = player.playerNationalities.length ? player.playerNationalities.join(' / ') : player.playerNationality;

  const open = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button')) return;
    window.open(player.playerUrl, '_blank', 'noopener,noreferrer');
  };

  const extra: ReactNode = player.contractExpires ? (
    <div className="exp">
      <span className="clock"><Clock /></span>
      <div className="txt"><label>{t('tm_search_contract_label')}</label><b>{player.contractExpires}</b></div>
    </div>
  ) : (
    <div className="exp">
      <div className="txt"><label>{t('tm_search_height')}</label><b>{player.height || '—'}</b></div>
    </div>
  );

  return (
    <article className="brit-cf-card">
      {player.contractExpires && (
        <span className="brit-cf-badge"><Clock />{(isRtl ? 'חוזה עד ' : 'Contract ') + player.contractExpires}</span>
      )}
      <div
        className="brit-cf-top"
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open(player.playerUrl, '_blank', 'noopener,noreferrer'); } }}
      >
        {flag
          ? <img className="brit-cf-flagbg" src={flag} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => setFlagFailed(true)} />
          : <div className="brit-cf-flagbg-ph" aria-hidden="true" />}
        <div className="brit-cf-portrait">
          <img src={player.playerImage || 'https://via.placeholder.com/72'} alt="" loading="lazy" decoding="async" />
        </div>
        <div className="brit-cf-who">
          <div className="nm" title={player.playerName}>{player.playerName || (isRtl ? 'לא ידוע' : 'Unknown')}</div>
          <div className="meta">
            <span className="pos">{player.playerPosition || '—'}</span>
            {player.playerAge && <span className="age">{t('players_age_display').replace('{age}', player.playerAge)}</span>}
            {nationalities && <span className="nat">{nationalities}</span>}
          </div>
        </div>
      </div>

      <div className="brit-cf-facts">
        <div className="val"><label>{t('returnee_market_value')}</label><b>{player.marketValue || '—'}</b></div>
        <div className="club"><label>{t('returnee_current_club')}</label><b>{player.clubJoinedName || t('tm_search_without_club')}</b></div>
        {extra}
      </div>

      {player.otherPositions.length > 0 && (
        <p className="brit-ts-other">{t('tm_search_other_pos')}: {player.otherPositions.join(' · ')}</p>
      )}

      <div className="brit-cf-actions">
        {isInRoster ? (
          <span className="saved">{t('tm_search_in_roster')}</span>
        ) : isInShortlist ? (
          <>
            <span className="saved"><svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" /></svg>{t('releases_saved')}</span>
            <Link className="viewsl" href="/shortlist" onClick={(e) => e.stopPropagation()}>{t('releases_view_shortlist')} {isRtl ? '←' : '→'}</Link>
          </>
        ) : (
          <button className="save" disabled={isAdding} onClick={(e) => { e.stopPropagation(); onAddToShortlist(player); }}>
            <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            {isAdding ? t('shortlist_adding') : t('releases_bookmark')}
          </button>
        )}
        <a className="save" href={player.playerUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {t('tm_search_open_tm')}
        </a>
      </div>
    </article>
  );
});
