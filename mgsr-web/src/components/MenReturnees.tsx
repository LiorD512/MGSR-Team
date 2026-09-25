'use client';

/**
 * Men platform "On Loan" — players currently out on loan — "Light Management
 * Room" redesign. PRESENTATIONAL ONLY: all loading, filtering, shortlist and
 * teammate logic stay in returnees/page.tsx; this renders the men full-bleed
 * light layout (shared BritRail + .brit-room) and calls the handlers passed in.
 *
 * Semantics: a player is CURRENTLY on loan. onLoanFromClub = parent/owner club;
 * clubJoinedName/Logo = the club they are on loan AT (highlighted). loanEndDate
 * = when the loan ends.
 */

import { useCallback, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import BritRail from '@/components/BritRail';

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

export interface MenLoanPlayer {
  playerUrl: string;
  playerName?: string;
  playerImage?: string;
  playerPosition?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalityFlag?: string;
  marketValue?: string;
  loanEndDate?: string;
  onLoanFromClub?: string;      // parent / owner club
  clubJoinedName?: string;      // club they are on loan AT
  clubJoinedLogo?: string;
}

interface PositionGroupOption { value: string; count: number }
interface ValueFilterOption { key: string; count: number }

export interface MenReturneesProps {
  totalCount: number;
  filteredCount: number;
  shortlistedCount: number;
  loadedLeagues: number;
  totalLeagues: number;

  positionGroups: PositionGroupOption[];
  positionFilter: string | null;
  setPositionFilter: (v: string | null) => void;
  valueFilters: ValueFilterOption[];
  valueFilter: string;
  setValueFilter: (v: string) => void;

  loadingList: boolean;
  error: string | null;
  players: MenLoanPlayer[];
  shortlistUrls: Set<string>;
  addingUrl: string | null;
  onAddToShortlist: (player: MenLoanPlayer) => void;
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

const POSITION_GROUPS = ['GK', 'DEF', 'MID', 'FWD'];
const VALUE_FILTER_LABELS: Record<string, string> = {
  all: 'contract_finisher_filter_value_all',
  '150k_500k': 'contract_finisher_filter_value_150k_500k',
  '500k_1m': 'contract_finisher_filter_value_500k_1m',
  '1m_2m': 'contract_finisher_filter_value_1m_2m',
  '2m_3m': 'contract_finisher_filter_value_2m_3m',
  '3m_4m': 'contract_finisher_filter_value_3m_4m',
  '4m_6m': 'contract_finisher_filter_value_4m_6m',
};

const clubInitials = (name?: string) =>
  (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '··';

const WaIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z" /></svg>
);

export default function MenReturnees(props: MenReturneesProps) {
  const {
    totalCount, filteredCount, shortlistedCount, loadedLeagues, totalLeagues,
    positionGroups, positionFilter, setPositionFilter, valueFilters, valueFilter, setValueFilter,
    loadingList, error, players, shortlistUrls, addingUrl, onAddToShortlist, onReload,
    teammatesCache, loadingTeammatesUrl, expandedTeammatesUrl, onToggleTeammates, onFetchTeammates,
  } = props;

  const { t, lang, setLang, isRtl } = useLanguage();

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const leaguePct = totalLeagues > 0 ? Math.min(100, Math.round((loadedLeagues / totalLeagues) * 100)) : 0;

  const posCount = (g: string) => positionGroups.find((p) => p.value === g)?.count ?? 0;
  const valCount = (k: string) => valueFilters.find((v) => v.key === k)?.count ?? 0;

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="returnees"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('returnee_room_on_loan')}
              <strong>{totalCount}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_returnee')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('returnee_room_kicker')}</p>
                <h1>{t('returnee_room_head_a')} <span>{t('returnee_room_head_b')}</span></h1>
                <p className="brit-ln-sub">{t('returnee_room_subtitle')}</p>
              </div>
              <div className="brit-ln-mast">
                <div className="brit-ln-loadbar">
                  <div className="lb-top"><span>{t('returnee_room_leagues_scanned')}</span><b>{loadedLeagues} / {totalLeagues}</b></div>
                  <div className="track"><span style={{ width: `${leaguePct}%` }} /></div>
                </div>
                <button className={`brit-ln-reload${loadingList ? ' spin' : ''}`} onClick={onReload} disabled={loadingList}>
                  <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>
                  <span>{t('releases_reload')}</span>
                </button>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals brit-signals-3">
              <div className="brit-signal">
                <label>{t('returnee_room_on_loan')}</label>
                <strong>{String(totalCount).padStart(2, '0')}</strong>
                <small>{t('returnee_room_on_loan_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('releases_stat_shortlisted')}</label>
                <strong className="brit-ln-saved-num">{String(shortlistedCount).padStart(2, '0')}</strong>
                <small>{t('returnee_room_shortlisted_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('returnee_stat_leagues')}</label>
                <strong>{loadedLeagues}<span style={{ color: 'var(--muted)' }}>/{totalLeagues}</span></strong>
                <small>{t('returnee_room_leagues_note')}</small>
              </div>
            </section>

            {/* Filters */}
            <section className="brit-tray">
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('releases_position')}</span>
                <div className="brit-req-chipset">
                  <button className={!positionFilter ? 'on' : ''} onClick={() => setPositionFilter(null)}>
                    <span className="brit-ln-chip">{t('releases_all')} <span className="c">{totalCount}</span></span>
                  </button>
                  {POSITION_GROUPS.map((g) => {
                    const c = posCount(g);
                    return (
                      <button key={g} className={positionFilter === g ? 'on' : ''} disabled={c === 0}
                        onClick={() => setPositionFilter(positionFilter === g ? null : g)}>
                        <span className="brit-ln-chip">{g}{c > 0 ? <span className="c">{c}</span> : null}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('returnee_room_value')}</span>
                <div className="brit-req-chipset">
                  {valueFilters.map((v) => (
                    <button key={v.key} className={valueFilter === v.key ? 'on' : ''} disabled={v.key !== 'all' && v.count === 0}
                      onClick={() => setValueFilter(valueFilter === v.key ? 'all' : v.key)}>
                      <span className="brit-ln-chip">
                        {t(VALUE_FILTER_LABELS[v.key] ?? v.key)}
                        {v.key !== 'all' && v.count > 0 ? <span className="c">{v.count}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <p className="brit-result-count">
              {t('returnee_room_showing').replace('{n}', String(filteredCount)).replace('{total}', String(totalCount))}
            </p>

            {/* Feed */}
            {error ? (
              <div className="brit-empty">{error}</div>
            ) : players.length === 0 && loadingList ? (
              <div className="brit-empty">{t('returnee_loading').replace('{loaded}', String(loadedLeagues)).replace('{total}', String(totalLeagues))}</div>
            ) : players.length === 0 ? (
              <div className="brit-empty">{totalCount === 0 ? t('returnee_no_found') : t('search_no_results')}</div>
            ) : (
              <div className="brit-ln-feed">
                {players.map((p) => (
                  <MenLoanCard
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
function LoanClubCell({ name, kind, logo }: { name: string; kind: 'from' | 'at'; logo?: string }) {
  const { t, isRtl } = useLanguage();
  const [logoOk, setLogoOk] = useState(!!logo && logo.startsWith('http'));
  return (
    <div className={`brit-ln-club ${kind}`}>
      <label>{kind === 'from' ? t('returnee_room_owned_by') : t('returnee_room_on_loan_at')}</label>
      <div className="cn">
        {logoOk && logo
          ? <img className="logo" src={logo} alt="" onError={() => setLogoOk(false)} />
          : <div className="logo ph">{clubInitials(name)}</div>}
        <span className="cnm" title={name} dir={isRtl ? 'rtl' : 'ltr'}>{name}</span>
      </div>
    </div>
  );
}

function MenLoanCard({
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
  player: MenLoanPlayer;
  isInShortlist: boolean;
  isAdding: boolean;
  onAddToShortlist: (player: MenLoanPlayer) => void;
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

  const ownerClub = player.onLoanFromClub;
  const loanClub = player.clubJoinedName;

  return (
    <article className={`brit-ln-card${isExpanded ? ' open' : ''}`}>
      <span className="brit-ln-badge">
        {player.loanEndDate
          ? t('returnee_room_loan_ends').replace('{date}', player.loanEndDate)
          : t('returnee_room_badge_on_loan')}
      </span>

      <div className="brit-ln-top" role="button" tabIndex={0} onClick={handleCardClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(e as unknown as React.MouseEvent); } }}>
        {flagBg
          ? <img className="brit-ln-flagbg" src={flagBg} alt="" aria-hidden="true" onError={() => setFlagIdx((i) => i + 1)} />
          : <div className="brit-ln-flagbg-ph" aria-hidden="true" />}
        <div className="brit-ln-portrait">
          <img src={player.playerImage || 'https://via.placeholder.com/72'} alt="" />
        </div>
        <div className="brit-ln-who">
          <div className="nm" title={player.playerName || ''}>{player.playerName || (isRtl ? 'לא ידוע' : 'Unknown')}</div>
          <div className="meta">
            <span className="pos">{player.playerPosition || '—'}</span>
            {player.playerAge && <span className="age">{t('players_age_display').replace('{age}', player.playerAge)}</span>}
            {player.playerNationality && <span className="nat">{player.playerNationality}</span>}
          </div>
        </div>
      </div>

      <div className="brit-ln-facts">
        <div className="val"><label>{t('returnee_market_value')}</label><b>{player.marketValue || '—'}</b></div>
        <div className="ends"><label>{t('returnee_room_loan_ends_label')}</label><b>{player.loanEndDate || '—'}</b></div>
      </div>

      {(ownerClub || loanClub) && (
        <div className="brit-ln-lane">
          <LoanClubCell name={ownerClub || '—'} kind="from" />
          <div className="brit-ln-arrow"><span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7" /></svg></span></div>
          <LoanClubCell name={loanClub || '—'} kind="at" logo={player.clubJoinedLogo} />
        </div>
      )}

      <div className="brit-ln-actions">
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

      <div className="brit-ln-mates">
        <button className="brit-ln-mates-btn" onClick={handleMatesClick}>
          <svg className="ico" viewBox="0 0 24 24"><path d="M17 20h5v-2a3 3 0 00-5.4-1.9M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.9M7 20H2v-2a3 3 0 015.4-1.9M7 20v-2c0-.7.1-1.3.4-1.9m0 0a5 5 0 019.3 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span className="lbl">{matesLabel}</span>
          <svg className="chev" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
        </button>
        {isExpanded && (
          <div className="brit-ln-mates-list">
            {isLoadingTeammates ? (
              <div className="brit-ln-mates-load"><span className="sp" /></div>
            ) : teammates?.length === 0 ? (
              <p className="brit-ln-mates-empty">{t('releases_no_roster_teammates')}</p>
            ) : (
              teammates?.map((m) => {
                const firstName = (m.player.fullName || '').split(' ')[0] || '';
                const waText = `Hey ${firstName},\nHope everything is well at your side.\nI need your help with something.\nAny chance you have ${player.playerName || ''} contact number?\nThank you!`;
                const waHref = m.player.playerPhoneNumber
                  ? `https://wa.me/${m.player.playerPhoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waText)}`
                  : null;
                return (
                  <div className="brit-ln-mate" key={m.player.id}>
                    <Link href={`/players/${m.player.id}?from=/returnees`} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
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
