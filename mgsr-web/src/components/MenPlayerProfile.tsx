'use client';

/**
 * Men player profile — "Light Management Room" redesign (presentational).
 *
 * This component owns ONLY the presentation. All data, subscriptions, effects,
 * and handlers live in the page (src/app/players/[id]/page.tsx) and are passed
 * in as props, so no business logic is duplicated or at risk. Styling is scoped
 * under `.brit-profile` in globals.css. Hebrew/RTL switches type to Heebo.
 *
 * The existing analysis sub-panels (stats, FM, GPS, similar, highlights,
 * matching requests, proposal history) and the AgentTransfer block are passed
 * in as ready-rendered React nodes so their internals stay untouched.
 */

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { formatMarketValue } from '@/lib/releases';
import type { NoteModel } from '@/lib/noteParser';
import BritRail from '@/components/BritRail';
import { getCountryDisplayName } from '@/lib/countryTranslations';

interface MergedPlayer {
  fullName?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string; clubCountry?: string };
  age?: string;
  height?: string;
  nationality?: string;
  nationalities?: string[];
  nationalityFlag?: string;
  nationalityFlags?: string[];
  contractExpired?: string;
  foot?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  tmProfile?: string;
}

interface ProfilePlayer {
  id: string;
  fullName?: string;
  tmProfile?: string;
  createdAt?: number;
  salaryRange?: string;
  transferFee?: string;
  agency?: string;
  agencyUrl?: string;
  haveMandate?: boolean;
  interestedInIsrael?: boolean;
  isMarried?: boolean;
  kidsCount?: number;
  englishLevel?: string;
  notes?: string;
  originalAgentName?: string;
  originalAgentId?: string;
  agentInChargeName?: string;
  agentInChargeId?: string;
  agentTransferredAt?: number;
  passportDetails?: unknown;
  nationality?: string;
  nationalities?: string[];
}

interface ProfileDocument {
  id: string;
  type?: string;
  name?: string;
  storageUrl?: string;
  uploadedAt?: number;
  expired?: boolean;
  expiresAt?: number;
  validLeagues?: string[];
}

interface ChartPoint {
  date: number;
  dateLabel: string;
  value: string;
  valueNum: number;
}
interface ChartStats {
  peak: ChartPoint;
  low: ChartPoint;
  change: number;
  changePct: number;
  isUp: boolean;
  current: ChartPoint;
}

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
  'democratic republic of the congo': 'cd', 'democratic republic of congo': 'cd',
  'congo, democratic republic of the': 'cd', 'congo, dr': 'cd',
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

export interface MenPlayerProfileProps {
  t: (k: string) => string;
  isRtl: boolean;
  player: ProfilePlayer;
  merged: MergedPlayer;
  displayName: string;
  isEuPlayer: boolean;
  documents: ProfileDocument[];
  sortedNotes: NoteModel[];
  valueChartData: ChartPoint[];
  valueChartStats: ChartStats | null;

  backHref: string;
  backLabelKey: string;

  translateFoot: (foot: string | undefined) => string | undefined;
  resolveAgentName: (name: string | undefined, agentId?: string) => string;

  // toggles + state
  refreshing: boolean;
  mandateToggling: boolean;
  interestedInIsraelToggling: boolean;
  marriedToggling: boolean;
  kidsCountSaving: boolean;
  englishLevelSaving: boolean;
  uploadingDocument: boolean;
  uploadError: string | null;
  deletingDocId: string | null;
  sharing: boolean;
  addingToPortfolio: boolean;
  shareError: string | null;
  portfolioError: string | null;

  // handlers
  onRefresh: () => void;
  onDelete: () => void;
  onMandateToggle: (v: boolean) => void;
  onIsraelToggle: (v: boolean) => void;
  onMarriedToggle: (v: boolean) => void;
  onKidsUpdate: (n: number) => void;
  onEnglishUpdate: (level: string | null) => void;
  onEditSalaryFee: () => void;
  onEditAgency?: () => void;
  onUploadClick: () => void;
  onDeleteDoc: (d: ProfileDocument) => void;
  onAddNote: () => void;
  onEditNote: (n: NoteModel) => void;
  onDeleteNote: (n: NoteModel) => void;
  onShare: () => void;
  onPreparePortfolio: () => void;

  // ready-rendered nodes (existing panels / sections / hidden file input)
  fileInput: ReactNode;
  contactBlock: ReactNode;
  agentTransferBlock: ReactNode;
  resolvedTransferBanner: ReactNode;
  /** Market tab removed (barely used); these remain optional so the page can
      still pass them harmlessly without a type error. */
  matchingRequestsBlock?: ReactNode;
  proposalHistoryBlock?: ReactNode;
  statsPanel: ReactNode;
  fmPanel: ReactNode;
  gpsPanel: ReactNode;
  similarPanel: ReactNode;
  highlightsPanel: ReactNode;

  mandateExpiryLabel: string | null;
  mandateLeagues: string[];
  hasValidMandate: boolean;
}

const ENGLISH_LEVELS = ['none', 'medium', 'good', 'native'] as const;

// (rail navigation lives in the shared BritRail component)

export default function MenPlayerProfile(props: MenPlayerProfileProps) {
  const {
    t, isRtl, player, merged, displayName, isEuPlayer, documents, sortedNotes,
    valueChartData, valueChartStats, backHref, backLabelKey, translateFoot,
    resolveAgentName, refreshing, mandateToggling,
    interestedInIsraelToggling, marriedToggling, kidsCountSaving, englishLevelSaving,
    uploadingDocument, uploadError, deletingDocId, sharing, addingToPortfolio,
    shareError, portfolioError, onRefresh, onDelete, onMandateToggle, onIsraelToggle,
    onMarriedToggle, onKidsUpdate, onEnglishUpdate, onEditSalaryFee, onEditAgency,
    onUploadClick, onDeleteDoc, onAddNote, onEditNote, onDeleteNote, onShare,
    onPreparePortfolio, fileInput, contactBlock, agentTransferBlock,
    resolvedTransferBanner, statsPanel,
    fmPanel, gpsPanel, similarPanel, highlightsPanel, mandateExpiryLabel, mandateLeagues,
    hasValidMandate,
  } = props;

  const [tab, setTab] = useState<'overview' | 'performance' | 'documents' | 'notes'>('overview');

  const positionsLabel = merged.positions?.filter(Boolean).join(' · ') || '—';
  const clubName = merged.currentClub?.clubName;
  const nonGpsDocs = documents.filter((d) => d.type !== 'GPS_DATA');
  const gpsDocs = documents.filter((d) => d.type === 'GPS_DATA');

  const primaryNationality = merged.nationality || player.nationality;
  const allNationalities = (
    merged.nationalities?.filter(Boolean)?.length
      ? merged.nationalities.filter(Boolean)
      : player.nationalities?.filter(Boolean)?.length
      ? player.nationalities.filter(Boolean)
      : primaryNationality ? [primaryNationality] : []
  ) as string[];

  const flagCandidates = [
    flagUrlFromNationality(primaryNationality),
    ...allNationalities.map(flagUrlFromNationality),
    merged.nationalityFlags?.filter(Boolean)?.[0],
    merged.nationalityFlag,
  ].filter((u): u is string => !!u);

  const [flagIdx, setFlagIdx] = useState(0);

  useEffect(() => {
    setFlagIdx(0);
  }, [player.id, primaryNationality]);

  const flagBg = flagCandidates[flagIdx] ?? null;

  const heroFlag =
    merged.nationalityFlags?.filter(Boolean)?.[0] ||
    merged.nationalityFlag ||
    flagUrlFromNationality(primaryNationality);

  const nationalityDisplay = (
    allNationalities.length
      ? allNationalities.map((n) => getCountryDisplayName(n, isRtl)).join(' / ')
      : getCountryDisplayName(primaryNationality, isRtl)
  ) || (isRtl ? 'לא ידוע' : 'Unknown');

  const engLabel: Record<string, { en: string; he: string }> = {
    none: { en: 'None', he: 'ללא' },
    medium: { en: 'Medium', he: 'בינוני' },
    good: { en: 'Good', he: 'טוב' },
    native: { en: 'Native', he: 'שפת אם' },
  };

  const localDate = (ts?: number) =>
    ts ? new Date(ts).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  // Render note text with @mentions highlighted (gold), per the mock. A mention
  // is "@" followed by name tokens; we stop at common punctuation so the rest
  // of the sentence stays normal.
  const renderNoteText = (text: string | undefined): ReactNode => {
    if (!text) return null;
    const parts = text.split(/(@[^\s@]+(?:\s[^\s@.,;:!?]+)*)/g);
    return parts.map((part, i) =>
      part.startsWith('@')
        ? <span key={i} className="bp-mention">{part}</span>
        : <span key={i}>{part}</span>
    );
  };

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        {/* Rail */}
        <BritRail active="players" />

        {/* Main */}
        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <Link href="/players">{t('nav_players')}</Link> / <strong>{displayName}</strong>
            </div>
          </header>

          <div className="brit-profile" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      {fileInput}

      {/* Back + tools */}
      <div className="bp-actionbar">
        <Link href={backHref} scroll={false} className="bp-back">
          <span style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}>←</span>
          {t(backLabelKey)}
        </Link>
        <div className="bp-tools">
          {merged.tmProfile && (
            <>
              <button className="bp-toolbtn" onClick={onRefresh} disabled={refreshing}>
                {refreshing ? '…' : t('player_info_refresh')}
              </button>
              <a className="bp-toolbtn" href={merged.tmProfile} target="_blank" rel="noopener noreferrer">
                {t('player_info_view_on_tm')} ↗
              </a>
            </>
          )}
          <button className="bp-toolbtn primary" onClick={onShare} disabled={sharing}>
            {sharing ? '…' : `↗ ${t('player_info_share')}`}
          </button>
          <button className="bp-toolbtn danger" onClick={onDelete}>
            {isRtl ? 'מחק' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="bp-hero">
        {flagBg ? (
          <img
            className="bp-hero-flagbg"
            src={flagBg}
            alt=""
            aria-hidden="true"
            onError={() => setFlagIdx((i) => i + 1)}
          />
        ) : (
          <div className="bp-hero-flagbg-ph" aria-hidden="true" />
        )}
        <div className="bp-hero-inner">
          {merged.profileImage ? (
            <img className="bp-hero-portrait" src={merged.profileImage} alt="" />
          ) : (
            <div className="bp-hero-portrait ph">{(displayName || '?').charAt(0).toUpperCase()}</div>
          )}
          <div className="bp-hero-copy">
            <p className="bp-hero-kicker">
              {heroFlag && <img className="flag" src={heroFlag} alt="" />}
              {nationalityDisplay}
            </p>
            <h1>{displayName}</h1>
            <div className="bp-hero-sub">
              <span>{positionsLabel}</span>
              {clubName && (
                <span className="club">
                  {merged.currentClub?.clubLogo && <img src={merged.currentClub.clubLogo} alt="" />}
                  {clubName}
                  {merged.currentClub?.clubCountry ? ` · ${merged.currentClub.clubCountry}` : ''}
                </span>
              )}
              {merged.isOnLoan && merged.onLoanFromClub && (
                <span className="tag">{t('player_info_on_loan')}: {merged.onLoanFromClub}</span>
              )}
              {isEuPlayer && <span className="tag">🇪🇺 {t('eu_nat_tag')}</span>}
              {player.haveMandate && <span className="tag">{isRtl ? 'מנדט' : 'Mandate'}</span>}
            </div>
          </div>
          <div className="bp-hero-value">
            <div className="v">{merged.marketValue || '—'}</div>
            <div className="l">{t('players_value')}</div>
            {valueChartStats && valueChartData.length > 1 && (
              <div className={`delta ${valueChartStats.isUp ? 'up' : 'down'}`}>
                {valueChartStats.isUp ? '▲' : '▼'} {Math.abs(valueChartStats.changePct).toFixed(1)}%
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Signals */}
      <section className="bp-signals">
        <div className="bp-sig">
          <label>{t('player_info_age')}</label>
          <strong>{merged.age || <span className="empty">—</span>}</strong>
        </div>
        <div className="bp-sig">
          <label>{t('player_info_height')}</label>
          <strong>{merged.height || <span className="empty">—</span>}</strong>
        </div>
        <div className="bp-sig">
          <label>{t('player_info_foot')}</label>
          <strong>{translateFoot(merged.foot) || <span className="empty">—</span>}</strong>
        </div>
        <div className="bp-sig">
          <label>{t('player_info_contract')}</label>
          <strong>{merged.contractExpired || <span className="empty">—</span>}</strong>
        </div>
        <button className="bp-sig edit bp-sig-costs" onClick={onEditSalaryFee}>
          <span className="pen">✎</span>
          <label>{t('player_info_costs')}</label>
          <div className="bp-costline">
            <div className="c">
              <span className="v">{player.salaryRange || <span className="empty">—</span>}</span>
              <small>{t('player_info_salary')}</small>
            </div>
            <span className="sep" />
            <div className="c">
              <span className="v">
                {player.transferFee
                  ? (player.transferFee.toLowerCase() === 'free/free loan' ? t('requests_fee_free_loan') : player.transferFee)
                  : <span className="empty">—</span>}
              </span>
              <small>{t('player_info_transfer_fee')}</small>
            </div>
          </div>
        </button>
      </section>

      {/* Tabs */}
      <div className="bp-tabs" role="tablist">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          {t('player_tab_overview')}
        </button>
        <button className={tab === 'performance' ? 'active' : ''} onClick={() => setTab('performance')}>
          {t('player_tab_performance')}
        </button>
        <button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}>
          {t('player_info_documents')}
          {nonGpsDocs.length > 0 && <span className="c">{nonGpsDocs.length}</span>}
        </button>
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
          {t('player_info_notes')}
          {sortedNotes.length > 0 && <span className="c">{sortedNotes.length}</span>}
        </button>
      </div>

      {/* ═══ OVERVIEW ═══ */}
      <div className={`bp-pane${tab === 'overview' ? ' show' : ''}`}>
        <div className="bp-grid">
          <div>
            {/* Value history */}
            {valueChartData.length > 0 && valueChartStats && (
              <section className="bp-module">
                <div className="bp-mod-head">
                  <h2>{t('player_info_value_history')}</h2>
                  <span className="act">{valueChartData.length} {t('player_info_value_points')}</span>
                </div>
                <div className="bp-chart">
                  <div className="bp-chart-top">
                    <div>
                      <div className="cur">{valueChartStats.current.value}</div>
                      <div className="curlab">{t('current') || 'Current'}</div>
                    </div>
                    <div className="peak">
                      {t('player_info_value_peak')}
                      <b>{valueChartStats.peak.value}</b>
                      {valueChartStats.peak.dateLabel}
                    </div>
                  </div>
                  <div className="bp-chart-wrap" style={{ height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={valueChartData} margin={{ left: 4, right: 8, top: 10, bottom: 16 }}>
                        <defs>
                          <linearGradient id="bpMv" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a47d43" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="#a47d43" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(22,22,19,0.10)" vertical={false} />
                        {valueChartData.length > 1 && (
                          <ReferenceLine y={valueChartStats.peak.valueNum} stroke="#c9a66b" strokeDasharray="5 4" strokeOpacity={0.5} />
                        )}
                        <XAxis dataKey="dateLabel" stroke="#77736a" fontSize={9} tickLine={false} axisLine={false} dy={6} />
                        <YAxis
                          stroke="#77736a"
                          fontSize={9}
                          tickLine={false}
                          axisLine={false}
                          width={48}
                          tickFormatter={(v) => (v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(1)}m` : v >= 1_000 ? `€${(v / 1_000).toFixed(0)}k` : `€${v}`)}
                        />
                        <Tooltip
                          contentStyle={{ background: '#11110f', border: '1px solid #a47d43', borderRadius: 2, padding: '8px 12px' }}
                          labelStyle={{ color: '#c9a66b', fontSize: 10 }}
                          itemStyle={{ color: '#f3f0e8', fontSize: 11 }}
                          formatter={(value: number | undefined, _n: unknown, p: unknown) => {
                            const payload = (p as { payload?: { value?: string } })?.payload;
                            return [payload?.value ?? (value != null ? formatMarketValue(value) : '—'), t('players_value')];
                          }}
                        />
                        <Area type="monotone" dataKey="valueNum" stroke="#a47d43" strokeWidth={2.5} fill="url(#bpMv)" dot={false} activeDot={{ r: 5, fill: '#11110f', stroke: '#a47d43', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  {valueChartData.length > 1 && (
                    <div className="bp-chart-foot">
                      <div>
                        <label>{t('player_info_value_low')}</label>
                        <b>{valueChartStats.low.value}</b>
                      </div>
                      <div>
                        <label>{t('player_info_value_peak')}</label>
                        <b>{valueChartStats.peak.value}</b>
                      </div>
                      <div>
                        <label>{t('player_info_value_change')}</label>
                        <b className={valueChartStats.isUp ? 'up' : 'down'}>
                          {valueChartStats.isUp ? '+' : '-'}{formatMarketValue(Math.abs(valueChartStats.change))}
                        </b>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Details */}
            <section className="bp-module">
              <div className="bp-mod-head"><h2>{t('player_info_club')}</h2></div>
              <div className="bp-facts">
                <div className="row">
                  <label>{t('player_info_club')}</label>
                  <span className="v">{clubName || <span className="empty">—</span>}</span>
                </div>
                <div className="row">
                  <label>{t('player_info_nationality')}</label>
                  <span className="v">
                    {(merged.nationalities?.filter(Boolean)?.length ? merged.nationalities!.filter(Boolean).join(', ') : merged.nationality) || <span className="empty">—</span>}
                  </span>
                </div>
                {merged.isOnLoan && merged.onLoanFromClub && (
                  <div className="row">
                    <label>{t('player_info_on_loan')}</label>
                    <span className="v">{merged.onLoanFromClub}</span>
                  </div>
                )}
                {onEditAgency ? (
                  <button className="row editable" onClick={onEditAgency} style={{ width: '100%', textAlign: 'inherit' }}>
                    <label>{t('player_info_agency')}</label>
                    <span className="v">{player.agency || <span className="empty">—</span>}<span className="pen">✎</span></span>
                  </button>
                ) : (
                  <div className="row">
                    <label>{t('player_info_agency')}</label>
                    <span className="v">
                      {player.agencyUrl ? (
                        <a href={player.agencyUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>
                          {player.agency || player.agencyUrl}
                        </a>
                      ) : (player.agency || <span className="empty">—</span>)}
                    </span>
                  </div>
                )}
                {player.createdAt && (
                  <div className="row">
                    <label>{isRtl ? 'נוסף' : 'Added'}</label>
                    <span className="v mono">{localDate(player.createdAt)}</span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Right column */}
          <aside>
            {/* Agent in charge */}
            {(player.originalAgentName || player.agentInChargeName) && (
              <div className="bp-kv">
                <h3>{t('player_info_added_by')}</h3>
                {player.agentTransferredAt && player.originalAgentName ? (
                  <>
                    <div className="bp-agentline">
                      <span className="dot">{(resolveAgentName(player.agentInChargeName, player.agentInChargeId) || '?').charAt(0).toUpperCase()}</span>
                      <div>
                        <div className="nm">{resolveAgentName(player.agentInChargeName, player.agentInChargeId)}</div>
                        <div className="rl">{t('player_info_assigned_to')}</div>
                      </div>
                    </div>
                    <div className="bp-divider" />
                    <div className="bp-agentline">
                      <span className="dot orig">{(resolveAgentName(player.originalAgentName, player.originalAgentId) || '?').charAt(0).toUpperCase()}</span>
                      <div>
                        <div className="nm dim">{resolveAgentName(player.originalAgentName, player.originalAgentId)}</div>
                        <div className="rl">{isRtl ? 'סוכן מקורי' : 'Original agent'}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bp-agentline">
                    <span className="dot">{(resolveAgentName(player.originalAgentName || player.agentInChargeName, player.originalAgentId || player.agentInChargeId) || '?').charAt(0).toUpperCase()}</span>
                    <div>
                      <div className="nm">{resolveAgentName(player.originalAgentName || player.agentInChargeName, player.originalAgentId || player.agentInChargeId)}</div>
                      <div className="rl">{t('player_info_assigned_to')}</div>
                    </div>
                  </div>
                )}
                {agentTransferBlock}
                {resolvedTransferBanner}
              </div>
            )}

            {/* Contact — passed through (keeps its editable phone logic) */}
            {contactBlock}

            {/* Status switches */}
            <div className="bp-kv">
              <h3>{isRtl ? 'סטטוס' : 'Status'}</h3>
              <div className="bp-switchrow">
                <div>
                  <div className="lbl">{t('player_info_mandate')}</div>
                  {player.haveMandate && (mandateExpiryLabel || mandateLeagues.length > 0) && (
                    <div className="sub" dir="ltr">
                      {mandateExpiryLabel ? t('player_info_mandate_expires').replace('%s', mandateExpiryLabel) : ''}
                      {mandateLeagues.length > 0 ? ` · ${mandateLeagues.join(', ')}` : ''}
                    </div>
                  )}
                </div>
                <label className="bp-sw">
                  <input type="checkbox" checked={player.haveMandate ?? false} disabled={mandateToggling} onChange={() => onMandateToggle(!(player.haveMandate ?? false))} />
                  <span className="track" />
                </label>
              </div>
              <div className="bp-switchrow">
                <div className="lbl">🇮🇱 {t('player_info_interested_in_israel')}</div>
                <label className="bp-sw">
                  <input type="checkbox" checked={player.interestedInIsrael ?? false} disabled={interestedInIsraelToggling} onChange={() => onIsraelToggle(!(player.interestedInIsrael ?? false))} />
                  <span className="track" />
                </label>
              </div>
              <div className="bp-switchrow">
                <div className="lbl">💍 {t('player_info_married')}</div>
                <label className="bp-sw">
                  <input type="checkbox" checked={player.isMarried ?? false} disabled={marriedToggling} onChange={() => onMarriedToggle(!(player.isMarried ?? false))} />
                  <span className="track" />
                </label>
              </div>
              <div className="bp-switchrow">
                <div className="lbl">👶 {t('player_info_kids')}</div>
                <div className="bp-counter">
                  <button disabled={kidsCountSaving || (player.kidsCount ?? 0) <= 0} onClick={() => onKidsUpdate(Math.max(0, (player.kidsCount ?? 0) - 1))}>−</button>
                  <b>{player.kidsCount ?? 0}</b>
                  <button disabled={kidsCountSaving} onClick={() => onKidsUpdate((player.kidsCount ?? 0) + 1)}>+</button>
                </div>
              </div>
            </div>

            {/* English level */}
            <div className="bp-kv">
              <h3>{t('player_info_english_level')}</h3>
              <div className="bp-chips4">
                {ENGLISH_LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    className={player.englishLevel === lvl ? 'on' : ''}
                    disabled={englishLevelSaving}
                    onClick={() => onEnglishUpdate(player.englishLevel === lvl ? null : lvl)}
                  >
                    {engLabel[lvl][isRtl ? 'he' : 'en']}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ═══ PERFORMANCE ═══ */}
      <div className={`bp-pane${tab === 'performance' ? ' show' : ''}`}>
        {/* Season stats + key metrics run full width (the panel owns both modules) */}
        {statsPanel && <div className="bp-panel">{statsPanel}</div>}
        {/* Two independent columns so each panel flows tight to the one above it
            (no dead space when one column is shorter than the other):
            left = FM attributes + Similar players, right = GPS data + Highlights. */}
        {(fmPanel || gpsPanel || similarPanel || highlightsPanel) && (
          <div className="bp-perf-cols">
            <div className="bp-perf-col">
              {fmPanel && <div className="bp-panel">{fmPanel}</div>}
              {similarPanel && <div className="bp-panel">{similarPanel}</div>}
            </div>
            <div className="bp-perf-col">
              {gpsPanel && <div className="bp-panel">{gpsPanel}</div>}
              {highlightsPanel && <div className="bp-panel">{highlightsPanel}</div>}
            </div>
          </div>
        )}
        {!statsPanel && !fmPanel && !gpsPanel && !similarPanel && !highlightsPanel && (
          <div className="bp-empty">{t('player_info_no_documents') /* generic empty */}</div>
        )}
      </div>

      {/* ═══ DOCUMENTS ═══ */}
      <div className={`bp-pane${tab === 'documents' ? ' show' : ''}`}>
        <section className="bp-module" style={{ maxWidth: 760 }}>
          <div className="bp-mod-head">
            <h2>{t('player_info_documents')}</h2>
            {nonGpsDocs.length > 0 && <span className="act">{nonGpsDocs.length}</span>}
          </div>
          {uploadError && (
            <div className="bp-err">{uploadError === 'passport_already_exists' ? t('passport_already_exists') : uploadError === 'upload_failed' ? t('upload_failed') : uploadError}</div>
          )}
          {uploadingDocument && <div className="bp-empty">{t('player_info_uploading')}</div>}
          {nonGpsDocs.length === 0 && !uploadingDocument ? (
            <div className="bp-empty">{t('player_info_no_documents')}</div>
          ) : (
            nonGpsDocs.map((d) => (
              <div className="bp-doc" key={d.id} style={deletingDocId === d.id ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
                <div className="nm">
                  <span className="ic">▦</span>
                  <div>
                    <div className="t">{d.name || d.type || 'Document'}</div>
                    <div className="meta">
                      {(d.type || 'Doc')}{d.uploadedAt ? ` · ${localDate(d.uploadedAt)}` : ''}
                    </div>
                  </div>
                </div>
                <div className="ops">
                  {(d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired ? (
                    <span className="bp-doc-badge">{isRtl ? 'תקף' : 'Valid'}</span>
                  ) : d.expired ? (
                    <span className="bp-doc-badge exp">{t('player_info_doc_expired')}</span>
                  ) : (
                    <span className="bp-doc-badge muted">{isRtl ? 'שמור' : 'Stored'}</span>
                  )}
                  <a href={d.storageUrl} target="_blank" rel="noopener noreferrer" title={t('player_info_cd_open_link')}>↗</a>
                  <button className="del" title={t('player_info_cd_delete_document')} onClick={() => onDeleteDoc(d)}>🗑</button>
                </div>
              </div>
            ))
          )}
          <button className="bp-addbtn" onClick={onUploadClick} disabled={uploadingDocument}>
            + {t('player_info_add_document')}
          </button>

          {gpsDocs.length > 0 && (
            <details style={{ marginTop: 18, border: '1px solid var(--line)' }}>
              <summary style={{ padding: '12px 14px', cursor: 'pointer', fontFamily: 'var(--p-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('gps_data')} · {gpsDocs.length}
              </summary>
              <div style={{ padding: '0 14px 12px' }}>
                {gpsDocs.map((d) => (
                  <div className="bp-doc" key={d.id} style={deletingDocId === d.id ? { opacity: 0.4, pointerEvents: 'none' } : undefined}>
                    <div className="nm"><span className="ic">📊</span><div className="t">{d.name || t('gps_report')}</div></div>
                    <div className="ops">
                      <a href={d.storageUrl} target="_blank" rel="noopener noreferrer">↗</a>
                      <button className="del" onClick={() => onDeleteDoc(d)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Generate-mandate CTA — editorial black block (per mock). Shown only
              when a passport is on file; disabled when a valid mandate exists. */}
          {!!player.passportDetails && (
            <div className={`bp-mandate-cta${hasValidMandate ? ' done' : ''}`}>
              <div className="mi">
                <h4>{t('player_info_generate_mandate')}</h4>
                <p>
                  {hasValidMandate
                    ? (mandateExpiryLabel
                        ? t('player_info_mandate_expires').replace('%s', mandateExpiryLabel)
                        : (isRtl ? 'מנדט בתוקף קיים' : 'Valid mandate on file'))
                    : (isRtl ? 'דרכון בתיק · מוכן להפקה' : 'Passport on file · ready to prepare')}
                </p>
              </div>
              {hasValidMandate ? (
                <span className="cta-done">{isRtl ? '✓ בתוקף' : '✓ Valid'}</span>
              ) : (
                <Link href={`/players/${player.id}/generate-mandate`}>
                  ◈ {t('player_info_generate_mandate')} ↗
                </Link>
              )}
            </div>
          )}
        </section>
      </div>

      {/* ═══ NOTES ═══ */}
      <div className={`bp-pane${tab === 'notes' ? ' show' : ''}`}>
        <section className="bp-module" style={{ maxWidth: 760 }}>
          <div className="bp-mod-head">
            <h2>{t('player_info_notes')}</h2>
            <button className="act" onClick={onAddNote}>+ {t('player_info_add_note')}</button>
          </div>
          <button className="bp-noteadd" onClick={onAddNote}>+ {t('player_info_add_note')}</button>
          {sortedNotes.length === 0 && !player.notes ? (
            <div className="bp-empty">{t('player_info_no_notes')}</div>
          ) : (
            <>
              {player.notes && (
                <div className="bp-note"><p>{renderNoteText(player.notes)}</p></div>
              )}
              {sortedNotes.map((n, i) => (
                <div className="bp-note" key={i}>
                  <div className="ops">
                    <button title={t('player_info_edit_note')} onClick={() => onEditNote(n)}>✎</button>
                    <button className="del" title={t('player_info_delete_note')} onClick={() => onDeleteNote(n)}>🗑</button>
                  </div>
                  <p>{renderNoteText(n.notes)}</p>
                  <div className="nm">
                    {n.createBy && <span className="by">{isRtl ? (n.createByHe ?? resolveAgentName(n.createBy)) : n.createBy}</span>}
                    {n.createdAt && <span>{new Date(n.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      </div>

      {shareError && <p className="bp-err">{shareError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
