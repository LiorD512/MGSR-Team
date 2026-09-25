'use client';

/**
 * Men platform Club Change Alerts — "Light Management Room" redesign.
 *
 * PRESENTATIONAL ONLY. All data + filtering stay in
 * club-change-notifications/page.tsx; this renders the men full-bleed light
 * layout (shared BritRail + .brit-room) and calls the setters passed in.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';

type SortMode = 'date_desc' | 'date_asc' | 'value_desc' | 'value_asc';

interface RosterPlayerLike {
  id: string;
}

export interface MenClubChangeItem {
  playerUrl: string;
  rosterPlayer?: RosterPlayerLike;
  displayName: string;
  displayImage?: string;
  displayPosition?: string;
  displayAge?: string;
  displayMarketValue?: string;
  oldClub: string;
  newClub: string;
  newClubLogo?: string;
  timestamp?: number;
  playerNationality?: string;
}

export interface MenClubChangesProps {
  totalCount: number;
  filteredCount: number;
  rosterCount: number;
  newTodayCount: number;

  search: string;
  setSearch: (v: string) => void;
  positions: string[];
  positionFilter: string | null;
  setPositionFilter: (v: string | null) => void;
  sortMode: SortMode;
  setSortMode: (v: SortMode) => void;

  loadingList: boolean;
  hasActiveFilters: boolean;
  items: MenClubChangeItem[];

  renderPosition: (position?: string) => string;
  formatTimestamp: (ts: number | undefined, isRtl: boolean) => string;
}

const SORT_OPTIONS: { value: SortMode; labelKey: string }[] = [
  { value: 'date_desc', labelKey: 'club_change_notifications_sort_date_newest' },
  { value: 'date_asc', labelKey: 'club_change_notifications_sort_date_oldest' },
  { value: 'value_desc', labelKey: 'club_change_notifications_sort_value_high' },
  { value: 'value_asc', labelKey: 'club_change_notifications_sort_value_low' },
];

/** Nationality name → ISO 3166-1 alpha-2 code (flagcdn). */
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

const clubInitials = (name: string) =>
  (name || '?').replace(/^[—-]$/, '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '··';

export default function MenClubChanges(props: MenClubChangesProps) {
  const {
    totalCount, filteredCount, rosterCount, newTodayCount,
    search, setSearch, positions, positionFilter, setPositionFilter, sortMode, setSortMode,
    loadingList, hasActiveFilters, items, renderPosition, formatTimestamp,
  } = props;

  const { t, lang, setLang, isRtl } = useLanguage();

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="club-change"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('club_change_notifications_room_moves')}
              <strong>{totalCount}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_club_change_notifications')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('club_change_notifications_room_kicker')}</p>
                <h1>{t('club_change_notifications_room_head_a')} <span>{t('club_change_notifications_room_head_b')}</span></h1>
                <p className="brit-cc-sub">{t('club_change_notifications_subtitle')}</p>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals brit-signals-3">
              <div className="brit-signal">
                <label>{t('club_change_notifications_room_moves')}</label>
                <strong>{String(totalCount).padStart(2, '0')}</strong>
                <small>{t('club_change_notifications_room_moves_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('release_notifications_room_from_roster')}</label>
                <strong className="brit-cc-roster-num">{String(rosterCount).padStart(2, '0')}</strong>
                <small>{t('club_change_notifications_room_roster_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('release_notifications_room_new_today')}</label>
                <strong>{String(newTodayCount).padStart(2, '0')}</strong>
                <small>{t('club_change_notifications_room_new_note')}</small>
              </div>
            </section>

            {/* Filters */}
            <section className="brit-tray">
              <label className="brit-search">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('club_change_notifications_search')} />
              </label>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_position')}</span>
                <div className="brit-req-chipset">
                  <button className={!positionFilter ? 'on' : ''} onClick={() => setPositionFilter(null)}>{t('releases_all')}</button>
                  {positions.map((p) => (
                    <button key={p} className={positionFilter === p ? 'on' : ''} onClick={() => setPositionFilter(positionFilter === p ? null : p)}>
                      {renderPosition(p)}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Sort row */}
            <div className="brit-cc-sortrow">
              <span className="lbl">{t('club_change_notifications_sort')}</span>
              {SORT_OPTIONS.map((o) => (
                <button key={o.value} className={sortMode === o.value ? 'on' : ''} onClick={() => setSortMode(o.value)}>{t(o.labelKey)}</button>
              ))}
            </div>

            <p className="brit-result-count">
              {t('club_change_notifications_room_showing').replace('{n}', String(filteredCount)).replace('{total}', String(totalCount))}
            </p>

            {/* Feed */}
            {loadingList ? (
              <div className="brit-empty">{t('club_change_notifications_loading')}</div>
            ) : items.length === 0 ? (
              <div className="brit-empty">{hasActiveFilters ? t('search_no_results') : t('club_change_notifications_empty')}</div>
            ) : (
              <div className="brit-cc-feed">
                {items.map((item) => (
                  <MenMoveCard key={item.playerUrl} item={item} renderPosition={renderPosition} formatTimestamp={formatTimestamp} />
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
function ClubCell({ name, kind, logo }: { name: string; kind: 'from' | 'to'; logo?: string }) {
  const { t, isRtl } = useLanguage();
  const [logoOk, setLogoOk] = useState(!!logo && logo.startsWith('http'));
  return (
    <div className={`brit-cc-club ${kind}`}>
      <label>{kind === 'from' ? t('club_change_notifications_from') : t('club_change_notifications_to')}</label>
      <div className="cn">
        {logoOk && logo
          ? <img className="logo" src={logo} alt="" onError={() => setLogoOk(false)} />
          : <div className="logo ph">{clubInitials(name)}</div>}
        <span className="cnm" title={name} dir={isRtl ? 'rtl' : 'ltr'}>{name}</span>
      </div>
    </div>
  );
}

function MenMoveCard({
  item,
  renderPosition,
  formatTimestamp,
}: {
  item: MenClubChangeItem;
  renderPosition: (position?: string) => string;
  formatTimestamp: (ts: number | undefined, isRtl: boolean) => string;
}) {
  const { t, isRtl } = useLanguage();
  const isRoster = !!item.rosterPlayer?.id;

  const flagCandidates = [flagUrlFromNationality(item.playerNationality)].filter((u): u is string => !!u);
  const [flagIdx, setFlagIdx] = useState(0);
  const flagBg = flagCandidates[flagIdx] ?? null;

  return (
    <article className={`brit-cc-card${isRoster ? ' roster' : ''}`}>
      <span className={`brit-cc-badge${isRoster ? ' roster' : ''}`}>
        {isRoster ? t('release_notifications_roster_badge') : t('club_change_notifications_badge')}
      </span>

      <div className="brit-cc-top">
        {flagBg
          ? <img className="brit-cc-flagbg" src={flagBg} alt="" aria-hidden="true" onError={() => setFlagIdx((i) => i + 1)} />
          : <div className="brit-cc-flagbg-ph" aria-hidden="true" />}
        <div className="brit-cc-portrait">
          <img src={item.displayImage || 'https://via.placeholder.com/72'} alt="" />
        </div>
        <div className="brit-cc-who">
          <div className="nm" title={item.displayName}>{item.displayName}</div>
          <div className="meta">
            <span className="pos">{renderPosition(item.displayPosition)}</span>
            {item.displayAge && <span className="age">{t('players_age_display').replace('{age}', item.displayAge)}</span>}
            {item.displayMarketValue && <span className="val">{item.displayMarketValue}</span>}
          </div>
          <div className="when">{isRtl ? 'עבר' : 'Moved'} · {formatTimestamp(item.timestamp, isRtl)}</div>
        </div>
      </div>

      <div className="brit-cc-transfer">
        <ClubCell name={item.oldClub} kind="from" />
        <div className="brit-cc-arrow">
          <span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7" /></svg></span>
        </div>
        <ClubCell name={item.newClub} kind="to" logo={item.newClubLogo} />
      </div>

      <div className="brit-cc-foot">
        {isRoster && (
          <Link className="open" href={`/players/${item.rosterPlayer!.id}?from=/club-change-notifications`}>
            {t('club_change_notifications_open_player')}
          </Link>
        )}
        <a className="tm" href={item.playerUrl} target="_blank" rel="noopener noreferrer">
          {t('club_change_notifications_open_tm')}
        </a>
      </div>
    </article>
  );
}
