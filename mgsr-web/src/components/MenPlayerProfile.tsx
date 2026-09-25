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

import { useState, type ReactNode } from 'react';
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
  matchingRequestsBlock: ReactNode;
  proposalHistoryBlock: ReactNode;
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
    resolvedTransferBanner, matchingRequestsBlock, proposalHistoryBlock, statsPanel,
    fmPanel, gpsPanel, similarPanel, highlightsPanel, mandateExpiryLabel, mandateLeagues,
    hasValidMandate,
  } = props;

  const [tab, setTab] = useState<'overview' | 'performance' | 'documents' | 'market' | 'notes'>('overview');

  const positionsLabel = merged.positions?.filter(Boolean).join(' · ') || '—';
  const clubName = merged.currentClub?.clubName;
  const nonGpsDocs = documents.filter((d) => d.type !== 'GPS_DATA');
  const gpsDocs = documents.filter((d) => d.type === 'GPS_DATA');
  const heroFlag = merged.nationalityFlags?.filter(Boolean)?.[0] || merged.nationalityFlag;
  const engLabel: Record<string, { en: string; he: string }> = {
    none: { en: 'None', he: 'ללא' },
    medium: { en: 'Medium', he: 'בינוני' },
    good: { en: 'Good', he: 'טוב' },
    native: { en: 'Native', he: 'שפת אם' },
  };

  const localDate = (ts?: number) =>
    ts ? new Date(ts).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

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
          <button className="bp-toolbtn danger" onClick={onDelete}>
            {isRtl ? 'מחק' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="bp-hero">
        {merged.profileImage && (
          <div className="bp-hero-media">
            <img src={merged.profileImage} alt="" />
          </div>
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
              {t('room_confidential_dossier')}
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
        <button className="bp-sig edit" onClick={onEditSalaryFee}>
          <span className="pen">✎</span>
          <label>{t('player_info_salary')}</label>
          <strong>{player.salaryRange || <span className="empty">—</span>}</strong>
        </button>
        <button className="bp-sig edit" onClick={onEditSalaryFee}>
          <span className="pen">✎</span>
          <label>{t('player_info_transfer_fee')}</label>
          <strong>
            {player.transferFee
              ? (player.transferFee.toLowerCase() === 'free/free loan' ? t('requests_fee_free_loan') : player.transferFee)
              : <span className="empty">—</span>}
          </strong>
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
        <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>
          {t('player_tab_market')}
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
        {statsPanel && <div className="bp-panel">{statsPanel}</div>}
        {fmPanel && <div className="bp-panel">{fmPanel}</div>}
        {gpsPanel && <div className="bp-panel">{gpsPanel}</div>}
        {similarPanel && <div className="bp-panel">{similarPanel}</div>}
        {highlightsPanel && <div className="bp-panel">{highlightsPanel}</div>}
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
                  <span className="ic">📄</span>
                  <div>
                    <div className="t">{d.name || d.type || 'Document'}</div>
                    <div className="meta">
                      {(d.type || 'Doc')}{d.uploadedAt ? ` · ${localDate(d.uploadedAt)}` : ''}
                    </div>
                  </div>
                </div>
                <div className="ops">
                  {(d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (
                    <span className="bp-doc-badge">{isRtl ? 'תקף' : 'Valid'}</span>
                  )}
                  {d.expired && <span className="bp-doc-badge exp">{t('player_info_doc_expired')}</span>}
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
        </section>
      </div>

      {/* ═══ REQUESTS & OFFERS ═══ */}
      <div className={`bp-pane${tab === 'market' ? ' show' : ''}`}>
        {matchingRequestsBlock}
        {proposalHistoryBlock}
        {!matchingRequestsBlock && !proposalHistoryBlock && (
          <div className="bp-empty">{t('room_requests_empty')}</div>
        )}
      </div>

      {/* ═══ NOTES ═══ */}
      <div className={`bp-pane${tab === 'notes' ? ' show' : ''}`}>
        <section className="bp-module" style={{ maxWidth: 760 }}>
          <div className="bp-mod-head">
            <h2>{t('player_info_notes')}</h2>
            <button className="act" onClick={onAddNote}>+ {t('player_info_add_note')}</button>
          </div>
          {sortedNotes.length === 0 && !player.notes ? (
            <div className="bp-empty">{t('player_info_no_notes')}</div>
          ) : (
            <>
              {player.notes && (
                <div className="bp-note"><p>{player.notes}</p></div>
              )}
              {sortedNotes.map((n, i) => (
                <div className="bp-note" key={i}>
                  <div className="ops">
                    <button title={t('player_info_edit_note')} onClick={() => onEditNote(n)}>✎</button>
                    <button className="del" title={t('player_info_delete_note')} onClick={() => onDeleteNote(n)}>🗑</button>
                  </div>
                  <p>{n.notes}</p>
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

      {/* Sticky actions */}
      <div className="bp-sticky">
        {!!player.passportDetails && (
          <Link
            href={hasValidMandate ? '#' : `/players/${player.id}/generate-mandate`}
            onClick={(e) => hasValidMandate && e.preventDefault()}
            style={hasValidMandate ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
          >
            <button style={{ width: '100%' }}>◈ {t('player_info_generate_mandate')}</button>
          </Link>
        )}
        <button className="primary" onClick={onShare} disabled={sharing}>↗ {t('player_info_share')}</button>
        <button onClick={onPreparePortfolio} disabled={addingToPortfolio}>▤ {t('player_info_prepare_portfolio')}</button>
      </div>
      {(shareError || portfolioError) && <p className="bp-err">{shareError || portfolioError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
