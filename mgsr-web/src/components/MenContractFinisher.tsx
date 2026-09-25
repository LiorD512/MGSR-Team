'use client';

/**
 * Men platform Contract Finisher — players whose contracts expire in the
 * upcoming transfer window — "Light Management Room" redesign.
 *
 * PRESENTATIONAL ONLY: all loading, filtering, foot-enrichment, shortlist and
 * teammate logic stay in contract-finisher/page.tsx; this renders the men
 * full-bleed light layout (shared BritRail + .brit-room) and calls the
 * handlers/setters passed in.
 */

import { useCallback, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import type { Confederation } from '@/lib/api';

type FootSide = 'left' | 'right' | 'both' | null;

interface RosterPlayerLike {
  id: string;
  fullName?: string;
  profileImage?: string;
  positions?: (string | undefined)[];
  age?: string;
  marketValue?: string;
  playerPhoneNumber?: string;
}
interface RosterTeammateMatchLike {
  player: RosterPlayerLike;
  matchesPlayedTogether: number;
}

export interface MenContractPlayer {
  playerUrl: string;
  playerName?: string;
  playerImage?: string;
  playerPosition?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalityFlag?: string;
  marketValue?: string;
  clubJoinedName?: string;
  transferDate?: string;   // contract-expiry date shown on the badge
  foot?: FootSide;
}

interface FilterOption { key: string; labelKey: string }

export interface MenContractFinisherProps {
  totalCount: number;
  filteredCount: number;
  shortlistedCount: number;
  freeCount: number;
  windowLabel: string; // 'Summer' | 'Winter'

  positions: string[];
  positionLabel: (pos: string) => string;

  search: string;
  setSearch: (v: string) => void;
  positionFilter: string | null;
  setPositionFilter: (v: string | null) => void;
  ageFilters: FilterOption[];
  ageFilter: string;
  setAgeFilter: (v: string) => void;
  regionOptions: { value: Confederation; key: string }[];
  regionFilter: Confederation | null;
  setRegionFilter: (v: Confederation | null) => void;
  footFilter: 'all' | 'left' | 'right';
  setFootFilter: (v: 'all' | 'left' | 'right') => void;
  valueFilters: FilterOption[];
  valueFilter: string;
  setValueFilter: (v: string) => void;
  rosterOnly: boolean;
  setRosterOnly: (v: boolean) => void;

  loadingList: boolean;
  error: string;
  players: MenContractPlayer[];
  shortlistUrls: Set<string>;
  addingUrl: string | null;
  onAddToShortlist: (player: MenContractPlayer) => void;
  onReload: () => void;

  teammatesCache: Record<string, RosterTeammateMatchLike[]>;
  loadingTeammatesUrl: string | null;
  expandedTeammatesUrl: string | null;
  onToggleTeammates: (url: string) => void;
  onFetchTeammates: (url: string) => void;
}

const NATIONALITY_TO_ISO: Record<string, string> = {
  israel: 'il', germany: 'de', brazil: 'br', argentina: 'ar', france: 'fr',
  spain: 'es', italy: 'it', portugal: 'pt', netherlands: 'nl', belgium: 'be',
  england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', 'northern ireland': 'gb-nir',
  'great britain': 'gb', 'united kingdom': 'gb', ireland: 'ie',
  croatia: 'hr', serbia: 'rs', slovenia: 'si', 'bosnia-herzegovina': 'ba',
  'bosnia and herzegovina': 'ba', montenegro: 'me', 'north macedonia': 'mk', macedonia: 'mk',
  albania: 'al', kosovo: 'xk', greece: 'gr', turkey: 'tr', türkiye: 'tr',
  switzerland: 'ch', austria: 'at', poland: 'pl', ukraine: 'ua', russia: 'ru',
  'czech republic': 'cz', czechia: 'cz', slovakia: 'sk', hungary: 'hu', romania: 'ro',
  bulgaria: 'bg', sweden: 'se', norway: 'no', denmark: 'dk', finland: 'fi', iceland: 'is',
  cyprus: 'cy', 'faroe islands': 'fo', luxembourg: 'lu', malta: 'mt', georgia: 'ge',
  armenia: 'am', azerbaijan: 'az', kazakhstan: 'kz', 'saudi arabia': 'sa',
  'united arab emirates': 'ae', qatar: 'qa', kuwait: 'kw', bahrain: 'bh', oman: 'om',
  jordan: 'jo', lebanon: 'lb', syria: 'sy', iraq: 'iq', iran: 'ir', egypt: 'eg',
  morocco: 'ma', algeria: 'dz', tunisia: 'tn', libya: 'ly', nigeria: 'ng', ghana: 'gh',
  senegal: 'sn', 'ivory coast': 'ci', "cote d'ivoire": 'ci', cameroon: 'cm', mali: 'ml',
  'burkina faso': 'bf', guinea: 'gn', 'dr congo': 'cd', 'congo dr': 'cd', congo: 'cg',
  'south africa': 'za', angola: 'ao', gabon: 'ga', zambia: 'zm', 'cape verde': 'cv',
  'united states': 'us', usa: 'us', canada: 'ca', mexico: 'mx', 'costa rica': 'cr',
  honduras: 'hn', panama: 'pa', jamaica: 'jm', colombia: 'co', uruguay: 'uy',
  chile: 'cl', peru: 'pe', ecuador: 'ec', paraguay: 'py', venezuela: 've', bolivia: 'bo',
  japan: 'jp', 'south korea': 'kr', 'korea, south': 'kr', china: 'cn', australia: 'au',
  'new zealand': 'nz', india: 'in', thailand: 'th', indonesia: 'id',
};
const flagUrlFromNationality = (nationality?: string): string | null => {
  if (!nationality) return null;
  const code = NATIONALITY_TO_ISO[nationality.trim().toLowerCase()];
  return code ? `https://flagcdn.com/w640/${code}.png` : null;
};

const WaIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z" /></svg>
);
const Clock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

export default function MenContractFinisher(props: MenContractFinisherProps) {
  const {
    totalCount, filteredCount, shortlistedCount, freeCount, windowLabel,
    positions, positionLabel,
    search, setSearch, positionFilter, setPositionFilter,
    ageFilters, ageFilter, setAgeFilter, regionOptions, regionFilter, setRegionFilter,
    footFilter, setFootFilter, valueFilters, valueFilter, setValueFilter, rosterOnly, setRosterOnly,
    loadingList, error, players, shortlistUrls, addingUrl, onAddToShortlist, onReload,
    teammatesCache, loadingTeammatesUrl, expandedTeammatesUrl, onToggleTeammates, onFetchTeammates,
  } = props;

  const { t, lang, setLang, isRtl } = useLanguage();

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const windowText = windowLabel === 'Summer' ? t('contract_finisher_subtitle_summer') : t('contract_finisher_subtitle_winter');

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="contract-finisher"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('contract_finisher_room_expiring')}
              <strong>{totalCount}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_contract_finisher')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('contract_finisher_room_kicker')}</p>
                <h1>{t('contract_finisher_room_head_a')} <span>{t('contract_finisher_room_head_b')}</span></h1>
                <p className="brit-cf-sub">{windowText}</p>
              </div>
              <div className="brit-cf-mast">
                <div className="brit-cf-window">
                  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                  <span>{windowText}</span>
                </div>
                <button className={`brit-cf-reload${loadingList ? ' spin' : ''}`} onClick={onReload} disabled={loadingList}>
                  <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
                  <span>{t('contract_finisher_retry')}</span>
                </button>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals brit-signals-3">
              <div className="brit-signal">
                <label>{t('contract_finisher_room_expiring')}</label>
                <strong>{String(totalCount).padStart(2, '0')}</strong>
                <small>{t('contract_finisher_room_expiring_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('contract_finisher_stats_shortlisted')}</label>
                <strong className="brit-cf-saved-num">{String(shortlistedCount).padStart(2, '0')}</strong>
                <small>{t('contract_finisher_room_shortlisted_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('contract_finisher_room_free')}</label>
                <strong>{String(freeCount).padStart(2, '0')}</strong>
                <small>{t('contract_finisher_room_free_note')}</small>
              </div>
            </section>

            {/* Filters */}
            <section className="brit-tray">
              <label className="brit-search">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('contract_finisher_search')} />
              </label>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_position')}</span>
                <div className="brit-req-chipset">
                  <button className={!positionFilter ? 'on' : ''} onClick={() => setPositionFilter(null)}>{t('releases_all')}</button>
                  {positions.map((p) => (
                    <button key={p} className={positionFilter === p ? 'on' : ''} onClick={() => setPositionFilter(positionFilter === p ? null : p)}>
                      {positionLabel(p)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_age')}</span>
                <div className="brit-req-chipset">
                  {ageFilters.map((a) => (
                    <button key={a.key} className={ageFilter === a.key ? 'on' : ''} onClick={() => setAgeFilter(ageFilter === a.key ? 'all' : a.key)}>
                      {t(a.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('contract_finisher_filter_label_region')}</span>
                <div className="brit-req-chipset">
                  <button className={!regionFilter ? 'on' : ''} onClick={() => setRegionFilter(null)}>{t('releases_all')}</button>
                  {regionOptions.map((r) => (
                    <button key={r.value} className={regionFilter === r.value ? 'on' : ''} onClick={() => setRegionFilter(regionFilter === r.value ? null : r.value)}>
                      {t(r.key)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('player_info_foot')}</span>
                <div className="brit-req-chipset">
                  <button className={footFilter === 'all' ? 'on' : ''} onClick={() => setFootFilter('all')}>{t('releases_all')}</button>
                  <button className={footFilter === 'left' ? 'on' : ''} onClick={() => setFootFilter('left')}>{t('player_info_foot_left')}</button>
                  <button className={footFilter === 'right' ? 'on' : ''} onClick={() => setFootFilter('right')}>{t('player_info_foot_right')}</button>
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('contract_finisher_filter_label_value')}</span>
                <div className="brit-req-chipset">
                  {valueFilters.map((v) => (
                    <button key={v.key} className={valueFilter === v.key ? 'on' : ''} onClick={() => setValueFilter(v.key)}>
                      {t(v.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brit-cf-toggle-row">
                <button className={`brit-cf-roster-toggle${rosterOnly ? ' on' : ''}`} onClick={() => setRosterOnly(!rosterOnly)}>
                  <span className="sw" />{t('contract_finisher_room_roster_only')}
                </button>
                <span className="brit-cf-foot-note">{t('contract_finisher_room_foot_note')}</span>
              </div>
            </section>

            <p className="brit-result-count">
              {t('contract_finisher_room_showing').replace('{n}', String(filteredCount)).replace('{total}', String(totalCount))}
            </p>

            {/* Feed */}
            {error ? (
              <div className="brit-empty">{error}</div>
            ) : players.length === 0 && loadingList ? (
              <div className="brit-empty">{t('contract_finisher_loading')}</div>
            ) : players.length === 0 ? (
              <div className="brit-empty">{totalCount === 0 ? t('contract_finisher_no_found') : t('contract_finisher_no_match_filters')}</div>
            ) : (
              <div className="brit-cf-feed">
                {players.map((p) => (
                  <MenContractCard
                    key={p.playerUrl}
                    player={p}
                    isInShortlist={!!p.playerUrl && shortlistUrls.has(p.playerUrl)}
                    isAdding={addingUrl === p.playerUrl}
                    onAddToShortlist={onAddToShortlist}
                    teammates={teammatesCache[p.playerUrl]}
                    isLoadingTeammates={loadingTeammatesUrl === p.playerUrl}
                    isExpanded={expandedTeammatesUrl === p.playerUrl}
                    onToggleTeammates={onToggleTeammates}
                    onFetchTeammates={onFetchTeammates}
                  />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
function MenContractCard({
  player,
  isInShortlist,
  isAdding,
  onAddToShortlist,
  teammates,
  isLoadingTeammates,
  isExpanded,
  onToggleTeammates,
  onFetchTeammates,
}: {
  player: MenContractPlayer;
  isInShortlist: boolean;
  isAdding: boolean;
  onAddToShortlist: (player: MenContractPlayer) => void;
  teammates?: RosterTeammateMatchLike[];
  isLoadingTeammates: boolean;
  isExpanded: boolean;
  onToggleTeammates: (url: string) => void;
  onFetchTeammates: (url: string) => void;
}) {
  const { t, isRtl } = useLanguage();
  const playerUrl = player.playerUrl;

  const flagCandidates = [flagUrlFromNationality(player.playerNationality), player.playerNationalityFlag].filter((u): u is string => !!u);
  const [flagIdx, setFlagIdx] = useState(0);
  const flagBg = flagCandidates[flagIdx] ?? null;

  const footLabel = player.foot === 'left'
    ? t('player_info_foot_left')
    : player.foot === 'right'
      ? t('player_info_foot_right')
      : null;

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button')) return;
    if (playerUrl) window.open(playerUrl, '_blank', 'noopener,noreferrer');
  }, [playerUrl]);

  const handleMatesClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playerUrl) return;
    onToggleTeammates(playerUrl);
    if (teammates == null && !isLoadingTeammates) onFetchTeammates(playerUrl);
  }, [playerUrl, teammates, isLoadingTeammates, onToggleTeammates, onFetchTeammates]);

  const matesLabel: ReactNode = isLoadingTeammates
    ? t('releases_roster_teammates_loading')
    : teammates != null
      ? t('releases_roster_teammates').replace('{count}', String(teammates.length))
      : t('releases_roster_teammates_tap');

  return (
    <article className={`brit-cf-card${isExpanded ? ' open' : ''}`}>
      <span className="brit-cf-badge">
        <Clock />
        {(isRtl ? 'סיום חוזה' : 'Expires')}{player.transferDate ? ` ${player.transferDate}` : ''}
      </span>

      <div className="brit-cf-top" role="button" tabIndex={0} onClick={handleCardClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(e as unknown as React.MouseEvent); } }}>
        {flagBg
          ? <img className="brit-cf-flagbg" src={flagBg} alt="" aria-hidden="true" onError={() => setFlagIdx((i) => i + 1)} />
          : <div className="brit-cf-flagbg-ph" aria-hidden="true" />}
        <div className="brit-cf-portrait">
          <img src={player.playerImage || 'https://via.placeholder.com/72'} alt="" />
        </div>
        <div className="brit-cf-who">
          <div className="nm" title={player.playerName || ''}>{player.playerName || (isRtl ? 'לא ידוע' : 'Unknown')}</div>
          <div className="meta">
            <span className="pos">{player.playerPosition || '—'}</span>
            {player.playerAge && <span className="age">{t('players_age_display').replace('{age}', player.playerAge)}</span>}
            {footLabel ? <span className="ft">{footLabel}</span> : (player.playerNationality && <span className="nat">{player.playerNationality}</span>)}
          </div>
        </div>
      </div>

      <div className="brit-cf-facts">
        <div className="val"><label>{t('returnee_market_value')}</label><b>{player.marketValue || '—'}</b></div>
        <div className="club"><label>{t('returnee_current_club')}</label><b>{player.clubJoinedName || '—'}</b></div>
        <div className="exp">
          <span className="clock"><Clock /></span>
          <div className="txt">
            <label>{t('contract_finisher_room_expires_label')}</label>
            <b>{player.transferDate || '—'}</b>
          </div>
        </div>
      </div>

      <div className="brit-cf-actions">
        {isInShortlist ? (
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
        <a className="save" href={playerUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {isRtl ? 'טרנספרמרקט ↗' : 'Transfermarkt ↗'}
        </a>
      </div>

      <div className="brit-cf-mates">
        <button className="brit-cf-mates-btn" onClick={handleMatesClick}>
          <svg className="ico" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.4-1.9M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.9M7 20H2v-2a3 3 0 015.4-1.9M7 20v-2c0-.7.1-1.3.4-1.9m0 0a5 5 0 019.3 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span className="lbl">{matesLabel}</span>
          <svg className="chev" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
        </button>
        {isExpanded && (
          <div className="brit-cf-mates-list">
            {isLoadingTeammates ? (
              <div className="brit-cf-mates-load"><span className="sp" /></div>
            ) : teammates?.length === 0 ? (
              <p className="brit-cf-mates-empty">{t('releases_no_roster_teammates')}</p>
            ) : (
              teammates?.map((m) => {
                const firstName = (m.player.fullName || '').split(' ')[0] || '';
                const waText = `Hey ${firstName},\nHope everything is well at your side.\nI need your help with something.\nAny chance you have ${player.playerName || ''} contact number?\nThank you!`;
                const waHref = m.player.playerPhoneNumber
                  ? `https://wa.me/${m.player.playerPhoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waText)}`
                  : null;
                return (
                  <div className="brit-cf-mate" key={m.player.id}>
                    <Link href={`/players/${m.player.id}?from=/contract-finisher`} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
                      <img src={m.player.profileImage || 'https://via.placeholder.com/40'} alt="" />
                      <div className="mi">
                        <b>{m.player.fullName || (isRtl ? 'לא ידוע' : 'Unknown')}</b>
                        <span>{(m.player.positions?.filter(Boolean).join(', ') || '—')} · {m.player.age ? t('players_age_display').replace('{age}', m.player.age) : '—'} · {m.player.marketValue || '—'}</span>
                      </div>
                    </Link>
                    <span className="together">{t('releases_games_together').replace('{n}', String(m.matchesPlayedTogether))}</span>
                    {waHref && (
                      <a className="wa" href={waHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`WhatsApp ${m.player.fullName || ''}`}>
                        <WaIcon />
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </article>
  );
}
