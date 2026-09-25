'use client';

/**
 * Men platform Release Alerts — "Light Management Room" redesign.
 *
 * PRESENTATIONAL ONLY. All data, subscriptions, enrichment, shortlist and
 * teammate logic stay in release-notifications/page.tsx; this component renders
 * the men full-bleed light layout (shared BritRail + .brit-room) and calls the
 * handlers/setters passed in via props. Women & youth keep the standard screen.
 */

import { useCallback, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';
import type { Confederation } from '@/lib/api';

// ── Structural types (mirror the page; kept local to avoid cross-imports) ──
type AgeFilter = 'all' | 'u23' | '23-30' | '30+';
type SortBy = 'value' | 'date' | 'age';

interface FeedEventLike {
  id: string;
  type?: string;
  playerName?: string;
  playerImage?: string;
  playerTmProfile?: string;
  timestamp?: unknown;
}

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

export interface MenReleaseNotificationPlayer {
  event: FeedEventLike;
  playerUrl: string;
  rosterPlayer?: RosterPlayerLike;
  isRosterPlayer: boolean;
  playerPosition?: string;
  marketValue?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalityFlag?: string;
  transferDate?: string;
}

interface ManualRefreshProgressLike {
  stage: 'idle' | 'fetching' | 'preparing' | 'enriching' | 'completed' | 'failed';
  currentPlayerName?: string;
  fetchInfo?: string;
  lastError?: string;
  succeeded: number;
  failed: number;
}

interface ManualRefreshUiLike {
  total: number;
  completed: number;
  remaining: number;
  elapsedMs: number;
  etaMs: number | null;
  progressPercent: number;
}

export interface MenReleaseAlertsProps {
  // counts
  resolvedCount: number;
  filteredCount: number;
  rosterCount: number;
  newTodayCount: number;

  // filter state + setters
  search: string;
  setSearch: (v: string) => void;
  positions: string[];
  positionFilter: string | null;
  setPositionFilter: (v: string | null) => void;
  ageFilter: AgeFilter;
  setAgeFilter: (v: AgeFilter) => void;
  regionFilter: Confederation | null;
  setRegionFilter: (v: Confederation | null) => void;
  rosterOnly: boolean;
  setRosterOnly: (v: boolean) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  preset: number;
  setPreset: (v: number) => void;
  firestorePositions: { name?: string; hebrewName?: string }[];

  // manual refresh
  isManualRefreshing: boolean;
  manualRefreshProgress: ManualRefreshProgressLike;
  manualRefreshUi: ManualRefreshUiLike;
  onManualRefresh: () => void;

  // list + per-card state/handlers
  loadingList: boolean;
  hasActiveFilters: boolean;
  players: MenReleaseNotificationPlayer[];
  shortlistUrls: Set<string>;
  addingUrl: string | null;
  enrichingUrls: Set<string>;
  onAddToShortlist: (event: FeedEventLike) => void;
  teammatesCache: Record<string, RosterTeammateMatchLike[]>;
  loadingTeammatesUrl: string | null;
  expandedTeammatesUrl: string | null;
  onToggleTeammates: (url: string) => void;
  onFetchTeammates: (url: string) => void;

  // helpers (from page, single source of truth)
  formatTimestamp: (ts: unknown, isRtl: boolean) => string;
  formatDurationMs: (ms: number) => string;
}

// ── Presentation-only option lists (labels only) ──
const VALUE_PRESETS = [
  { label: 'All', labelHe: 'הכל', isAll: true },
  { label: '0-500K', labelHe: '0-500K', isAll: false },
  { label: '500K-1M', labelHe: '500K-1M', isAll: false },
  { label: '1M-5M', labelHe: '1M-5M', isAll: false },
  { label: '5M+', labelHe: '5M+', isAll: false },
];
const AGE_FILTERS: { value: AgeFilter; labelKey: string }[] = [
  { value: 'all', labelKey: 'releases_age_all' },
  { value: 'u23', labelKey: 'releases_age_u23' },
  { value: '23-30', labelKey: 'releases_age_23_30' },
  { value: '30+', labelKey: 'releases_age_30plus' },
];
const REGION_OPTIONS: { value: Confederation; key: string }[] = [
  { value: 'UEFA', key: 'transfer_windows_group_uefa' },
  { value: 'CONMEBOL', key: 'transfer_windows_group_conmebol' },
  { value: 'CONCACAF', key: 'transfer_windows_group_concacaf' },
  { value: 'AFC', key: 'transfer_windows_group_afc' },
  { value: 'CAF', key: 'transfer_windows_group_caf' },
  { value: 'OFC', key: 'transfer_windows_group_ofc' },
];
const SORT_OPTIONS: { value: SortBy; labelKey: string }[] = [
  { value: 'value', labelKey: 'releases_sort_value' },
  { value: 'date', labelKey: 'releases_sort_date' },
  { value: 'age', labelKey: 'releases_sort_age' },
];
const POSITION_HEBREW: Record<string, string> = { SS: 'חלוץ שני' };

const firstMeaningful = (...vals: (string | undefined)[]) => vals.find((v) => v && v.trim()) || '';

/**
 * Nationality name → ISO 3166-1 alpha-2 code (flagcdn.com codes).
 * Covers common football nations; England/Scotland/Wales/NI use flagcdn's
 * GB subdivisions. Falls back to the scraped Transfermarkt flag if unmapped.
 */
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

/** Resolve a crisp, high-res flag URL from the nationality name (flagcdn). */
const flagUrlFromNationality = (nationality?: string): string | null => {
  if (!nationality) return null;
  const code = NATIONALITY_TO_ISO[nationality.trim().toLowerCase()];
  return code ? `https://flagcdn.com/w640/${code}.png` : null;
};

// Inline icons
const WaIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z" /></svg>
);

export default function MenReleaseAlerts(props: MenReleaseAlertsProps) {
  const {
    resolvedCount, filteredCount, rosterCount, newTodayCount,
    search, setSearch, positions, positionFilter, setPositionFilter,
    ageFilter, setAgeFilter, regionFilter, setRegionFilter, rosterOnly, setRosterOnly,
    sortBy, setSortBy, preset, setPreset, firestorePositions,
    isManualRefreshing, manualRefreshProgress, manualRefreshUi, onManualRefresh,
    loadingList, hasActiveFilters, players, shortlistUrls, addingUrl, enrichingUrls,
    onAddToShortlist, teammatesCache, loadingTeammatesUrl, expandedTeammatesUrl,
    onToggleTeammates, onFetchTeammates, formatTimestamp, formatDurationMs,
  } = props;

  const { t, lang, setLang, isRtl } = useLanguage();

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const posLabel = (position: string) => {
    const fs = firestorePositions.find((p) => p.name?.toLowerCase() === position.toLowerCase());
    return isRtl ? (fs?.hebrewName || POSITION_HEBREW[position] || position) : position;
  };

  const showTicker =
    isManualRefreshing ||
    manualRefreshProgress.stage === 'completed' ||
    manualRefreshProgress.stage === 'failed';

  const stageLabel = (() => {
    switch (manualRefreshProgress.stage) {
      case 'fetching': return t('release_notifications_progress_stage_fetching');
      case 'preparing': return t('release_notifications_progress_stage_preparing');
      case 'enriching': return t('release_notifications_progress_stage_enriching');
      case 'completed': return t('release_notifications_progress_stage_completed');
      case 'failed': return t('release_notifications_progress_stage_failed');
      default: return '';
    }
  })();

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="release"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('release_notifications_visible')}
              <strong>{filteredCount}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_release_notifications')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('release_notifications_room_kicker')}</p>
                <h1>{t('release_notifications_room_head_a')} <span>{t('release_notifications_room_head_b')}</span></h1>
                <p className="brit-ra-sub">{t('release_notifications_subtitle')}</p>
              </div>
              <div className="brit-ra-mast">
                <button className={`brit-ra-refresh${isManualRefreshing ? ' live' : ''}`} onClick={onManualRefresh} disabled={isManualRefreshing}>
                  <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
                  <span>{isManualRefreshing ? t('release_notifications_manual_refreshing') : t('release_notifications_manual_refresh')}</span>
                </button>
                {/* value presets */}
                <div className="brit-ra-sortrow" style={{ margin: 0, justifyContent: 'flex-end' }}>
                  {VALUE_PRESETS.map((vp, i) => (
                    <button key={i} className={preset === i ? 'on' : ''} onClick={() => setPreset(i)}>
                      {vp.isAll ? t('releases_all') : (isRtl ? vp.labelHe : vp.label)}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {/* Enrichment ticker */}
            {showTicker && (
              <section className="brit-ra-ticker">
                <div className="brit-ra-ticker-head">
                  <div className="st">
                    {isManualRefreshing && <span className="dot" />}
                    {t('release_notifications_progress_title')}
                  </div>
                  <span className="stage">{stageLabel}</span>
                </div>
                {manualRefreshProgress.fetchInfo && (
                  <div className="brit-ra-ticker-current">{manualRefreshProgress.fetchInfo}</div>
                )}
                {manualRefreshUi.total > 0 && (
                  <>
                    <div className="brit-ra-bar"><span style={{ width: `${manualRefreshUi.progressPercent}%` }} /></div>
                    <div className="brit-ra-ticker-stats">
                      <div>{t('release_notifications_progress_processed').replace('{done}', String(manualRefreshUi.completed)).replace('{total}', String(manualRefreshUi.total))}</div>
                      <div>{t('release_notifications_progress_success').replace('{count}', String(manualRefreshProgress.succeeded))}</div>
                      <div>{t('release_notifications_progress_failed').replace('{count}', String(manualRefreshProgress.failed))}</div>
                      <div>
                        {manualRefreshUi.etaMs != null
                          ? t('release_notifications_progress_eta').replace('{time}', formatDurationMs(manualRefreshUi.etaMs))
                          : t('release_notifications_progress_eta_unknown')}
                      </div>
                    </div>
                  </>
                )}
                {manualRefreshProgress.currentPlayerName && (
                  <div className="brit-ra-ticker-current">
                    {t('release_notifications_progress_current').replace('{name}', manualRefreshProgress.currentPlayerName)}
                  </div>
                )}
                {manualRefreshProgress.lastError && (
                  <div className="brit-ra-ticker-err">{manualRefreshProgress.lastError}</div>
                )}
              </section>
            )}

            {/* Signals */}
            <section className="brit-signals brit-signals-3">
              <div className="brit-signal">
                <label>{t('release_notifications_total')}</label>
                <strong>{String(resolvedCount).padStart(2, '0')}</strong>
                <small>{t('release_notifications_room_total_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('release_notifications_room_from_roster')}</label>
                <strong className="brit-ra-roster-num">{String(rosterCount).padStart(2, '0')}</strong>
                <small>{t('release_notifications_room_from_roster_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('release_notifications_room_new_today')}</label>
                <strong>{String(newTodayCount).padStart(2, '0')}</strong>
                <small>{t('release_notifications_room_new_today_note')}</small>
              </div>
            </section>

            {/* Filters */}
            <section className="brit-tray">
              <label className="brit-search">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('release_notifications_search')} />
              </label>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_position')}</span>
                <div className="brit-req-chipset">
                  <button className={!positionFilter ? 'on' : ''} onClick={() => setPositionFilter(null)}>{t('releases_all')}</button>
                  {positions.map((p) => (
                    <button key={p} className={positionFilter === p ? 'on' : ''} onClick={() => setPositionFilter(positionFilter === p ? null : p)}>
                      {posLabel(p)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_age')}</span>
                <div className="brit-req-chipset">
                  {AGE_FILTERS.map(({ value, labelKey }) => (
                    <button key={value} className={ageFilter === value ? 'on' : ''} onClick={() => setAgeFilter(ageFilter === value ? 'all' : value)}>
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_region')}</span>
                <div className="brit-req-chipset">
                  <button className={!regionFilter ? 'on' : ''} onClick={() => setRegionFilter(null)}>{t('releases_all')}</button>
                  {REGION_OPTIONS.map((r) => (
                    <button key={r.value} className={regionFilter === r.value ? 'on' : ''} onClick={() => setRegionFilter(regionFilter === r.value ? null : r.value)}>
                      {t(r.key)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('release_notifications_source')}</span>
                <div className="brit-req-chipset">
                  <button className={!rosterOnly ? 'on' : ''} onClick={() => setRosterOnly(false)}>{t('releases_all')}</button>
                  <button className={rosterOnly ? 'on' : ''} onClick={() => setRosterOnly(!rosterOnly)}>{t('release_notifications_filter_roster')}</button>
                </div>
              </div>
            </section>

            {/* Sort row */}
            <div className="brit-ra-sortrow">
              <span className="lbl">{t('releases_sort')}</span>
              {SORT_OPTIONS.map((o) => (
                <button key={o.value} className={sortBy === o.value ? 'on' : ''} onClick={() => setSortBy(o.value)}>{t(o.labelKey)}</button>
              ))}
            </div>

            <p className="brit-result-count">
              {t('release_notifications_room_showing').replace('{n}', String(filteredCount)).replace('{total}', String(resolvedCount))}
            </p>

            {/* Feed */}
            {loadingList ? (
              <div className="brit-empty">{t('release_notifications_loading')}</div>
            ) : players.length === 0 ? (
              <div className="brit-empty">{hasActiveFilters ? t('search_no_results') : t('release_notifications_empty')}</div>
            ) : (
              <div className="brit-ra-feed">
                {players.map((p) => (
                  <MenReleaseCard
                    key={`${p.playerUrl}-${p.event.id}`}
                    player={p}
                    isInShortlist={shortlistUrls.has(p.playerUrl)}
                    isAdding={addingUrl === p.playerUrl}
                    isEnriching={enrichingUrls.has(p.playerUrl)}
                    onAddToShortlist={onAddToShortlist}
                    teammates={teammatesCache[p.playerUrl]}
                    isLoadingTeammates={loadingTeammatesUrl === p.playerUrl}
                    isExpanded={expandedTeammatesUrl === p.playerUrl}
                    onToggleTeammates={onToggleTeammates}
                    onFetchTeammates={onFetchTeammates}
                    formatTimestamp={formatTimestamp}
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
// Men alert card
// ─────────────────────────────────────────────────────────────────────────
function MenReleaseCard({
  player,
  isInShortlist,
  isAdding,
  isEnriching,
  onAddToShortlist,
  teammates,
  isLoadingTeammates,
  isExpanded,
  onToggleTeammates,
  onFetchTeammates,
  formatTimestamp,
}: {
  player: MenReleaseNotificationPlayer;
  isInShortlist: boolean;
  isAdding: boolean;
  isEnriching: boolean;
  onAddToShortlist: (event: FeedEventLike) => void;
  teammates?: RosterTeammateMatchLike[];
  isLoadingTeammates: boolean;
  isExpanded: boolean;
  onToggleTeammates: (url: string) => void;
  onFetchTeammates: (url: string) => void;
  formatTimestamp: (ts: unknown, isRtl: boolean) => string;
}) {
  const { t, isRtl } = useLanguage();
  const { event, playerUrl, rosterPlayer, isRosterPlayer } = player;
  const displayName = firstMeaningful(event.playerName, rosterPlayer?.fullName) || (isRtl ? 'לא ידוע' : 'Unknown');
  const displayImage = firstMeaningful(event.playerImage, rosterPlayer?.profileImage) || 'https://via.placeholder.com/72';
  const position = player.playerPosition || '—';
  // Flag candidates in priority order: high-res CDN → scraped TM flag.
  // An onError chain walks these so any working source wins, and a missing
  // name-mapping never leaves the box empty when a TM flag exists.
  const flagCandidates = [
    flagUrlFromNationality(player.playerNationality),
    player.playerNationalityFlag,
  ].filter((u): u is string => !!u);
  const [flagIdx, setFlagIdx] = useState(0);
  const flagBg = flagCandidates[flagIdx] ?? null;
  const marketValue = player.marketValue || '—';

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button')) return;
    if (rosterPlayer?.id) {
      window.location.href = `/players/${rosterPlayer.id}?from=/release-notifications`;
      return;
    }
    if (playerUrl) window.open(playerUrl, '_blank', 'noopener,noreferrer');
  }, [playerUrl, rosterPlayer?.id]);

  const handleMatesClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playerUrl) return;
    onToggleTeammates(playerUrl);
    // Fetch once when not yet cached and not already loading.
    if (teammates == null && !isLoadingTeammates) {
      onFetchTeammates(playerUrl);
    }
  }, [playerUrl, teammates, isLoadingTeammates, onToggleTeammates, onFetchTeammates]);

  const matesLabel: ReactNode = isLoadingTeammates
    ? t('releases_roster_teammates_loading')
    : teammates != null
      ? t('releases_roster_teammates').replace('{count}', String(teammates.length))
      : t('releases_roster_teammates_tap');

  return (
    <article className={`brit-ra-alert${isRosterPlayer ? ' roster' : ''}${isExpanded ? ' open' : ''}`}>
      <span className={`brit-ra-badge${isRosterPlayer ? ' roster' : ''}`}>
        {isRosterPlayer ? t('release_notifications_roster_badge') : t('release_notifications_badge')}
      </span>
      {isEnriching && (
        <span className="brit-ra-enrich"><span className="sp" /></span>
      )}

      <div className="brit-ra-top brit-ra-clickable" role="button" tabIndex={0} onClick={handleCardClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(e as unknown as React.MouseEvent); } }}>
        {flagBg
          ? <img className="brit-ra-flagbg" src={flagBg} alt="" aria-hidden="true" onError={() => setFlagIdx((i) => i + 1)} />
          : <div className="brit-ra-flagbg-ph" aria-hidden="true" />}
        <div className="brit-ra-portrait">
          <img className="p" src={displayImage} alt="" />
        </div>
        <div className="brit-ra-who">
          <div className="nm" title={displayName}>{displayName}</div>
          <div className="meta">
            <span className="pos">{position}</span>
            {player.playerAge && <span className="age">{t('players_age_display').replace('{age}', player.playerAge)}</span>}
            {player.playerNationality && <span className="nat">{player.playerNationality}</span>}
          </div>
          <div className="released">
            {isRtl ? 'שוחרר' : 'Released'} · <b>{formatTimestamp(event.timestamp, isRtl)}</b>
          </div>
        </div>
      </div>

      <div className="brit-ra-value">
        <div className="brit-ra-mv">
          <label>{isRtl ? 'שווי שוק' : 'Market value'}</label>
          <b>{marketValue}</b>
        </div>
        <div className="brit-ra-acts">
          {rosterPlayer?.id && (
            <Link className="open" href={`/players/${rosterPlayer.id}?from=/release-notifications`} onClick={(e) => e.stopPropagation()}>
              {t('release_notifications_open_player')}
            </Link>
          )}
          {isInShortlist ? (
            <>
              <span className="saved"><svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" /></svg>{t('releases_saved')}</span>
              <Link className="viewsl" href="/shortlist" onClick={(e) => e.stopPropagation()}>{t('releases_view_shortlist')} {isRtl ? '←' : '→'}</Link>
            </>
          ) : (
            <button className="save" disabled={isAdding} onClick={(e) => { e.stopPropagation(); onAddToShortlist(event); }}>
              <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
              {isAdding ? t('shortlist_adding') : t('releases_bookmark')}
            </button>
          )}
        </div>
      </div>

      <div className="brit-ra-mates">
        <button className="brit-ra-mates-btn" onClick={handleMatesClick}>
          <svg className="ico" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.4-1.9M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.9M7 20H2v-2a3 3 0 015.4-1.9M7 20v-2c0-.7.1-1.3.4-1.9m0 0a5 5 0 019.3 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span className="lbl">{matesLabel}</span>
          <svg className="chev" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
        </button>
        {isExpanded && (
          <div className="brit-ra-mates-list">
            {isLoadingTeammates ? (
              <div className="brit-ra-mates-load"><span className="sp" /></div>
            ) : teammates?.length === 0 ? (
              <p className="brit-ra-mates-empty">{t('releases_no_roster_teammates')}</p>
            ) : (
              teammates?.map((m) => {
                const firstName = (m.player.fullName || '').split(' ')[0] || '';
                const waText = `Hey ${firstName},\nHope everything is well at your side.\nI need your help with something.\nAny chance you have ${event.playerName || ''} contact number?\nThank you!`;
                const waHref = m.player.playerPhoneNumber
                  ? `https://wa.me/${m.player.playerPhoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waText)}`
                  : null;
                return (
                  <div className="brit-ra-mate" key={m.player.id}>
                    <Link href={`/players/${m.player.id}?from=/release-notifications`} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
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
