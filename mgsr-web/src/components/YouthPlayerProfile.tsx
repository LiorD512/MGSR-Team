'use client';

/**
 * Youth player profile — "Light Management Room" (teal) redesign, presentational.
 *
 * Mirrors MenPlayerProfile: this component owns ONLY presentation. All data,
 * subscriptions, effects, and handlers live in the route page
 * (src/app/players/youth/[id]/page.tsx) and are passed in as props, so no youth
 * business logic (upload, mandate toggle, notes, share, portfolio, matching,
 * edit/delete, tasks) is duplicated or at risk.
 *
 * Styling reuses the shared `.brit-profile` / `bp-*` system scoped under
 * `.brit-room`, which the body[data-platform="youth"] override retints teal.
 * Youth-specific motifs: age-group replaces market value in the hero, IFA
 * season form (apps/goals/assists), a guardian contact block, IFA source link.
 * Hebrew/RTL switches type to Heebo. Ready-rendered sub-panels (highlights,
 * matching requests, tasks) are passed in as React nodes so their internals
 * stay untouched.
 */

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import type { YouthPlayer, YouthPlayerNote } from '@/lib/playersYouth';

interface YouthProfileDocument {
  id: string;
  type?: string;
  name?: string;
  storageUrl?: string;
  uploadedAt?: number;
  expired?: boolean;
  expiresAt?: number;
}

export interface YouthPlayerProfileProps {
  t: (k: string) => string;
  isRtl: boolean;
  lang: 'en' | 'he';
  setLang: (l: 'en' | 'he') => void;

  player: YouthPlayer;
  displayName: string;
  documents: YouthProfileDocument[];
  sortedNotes: YouthPlayerNote[];

  backHref: string;
  backLabel: string;

  resolveAgentName: (name: string | undefined) => string;

  // state
  mandateToggling: boolean;
  uploadingDocument: boolean;
  uploadError: string | null;
  sharing: boolean;
  addingToPortfolio: boolean;
  shareError: string | null;
  portfolioError: string | null;

  // handlers
  onEdit: () => void;
  onDelete: () => void;
  onAddTask: () => void;
  onMandateToggle: (v: boolean) => void;
  onUploadClick: () => void;
  onDeleteDoc: (d: YouthProfileDocument) => void;
  onAddNote: () => void;
  onEditNote: (n: YouthPlayerNote) => void;
  onDeleteNote: (n: YouthPlayerNote) => void;
  onShare: () => void;
  onPreparePortfolio: () => void;

  // ready-rendered nodes (existing panels / hidden file input)
  fileInput: ReactNode;
  highlightsPanel: ReactNode;
  matchingRequestsBlock: ReactNode;
  tasksBlock: ReactNode;

  mandateExpiryLabel: string | null;
  hasValidMandate: boolean;
  tasksEnabled: boolean;
}

const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function YouthPlayerProfile(props: YouthPlayerProfileProps) {
  const {
    t, isRtl, lang, setLang, player, displayName, documents, sortedNotes,
    backHref, backLabel, resolveAgentName, mandateToggling, uploadingDocument,
    uploadError, sharing, addingToPortfolio, shareError, portfolioError,
    onEdit, onDelete, onAddTask, onMandateToggle, onUploadClick, onDeleteDoc,
    onAddNote, onEditNote, onDeleteNote, onShare, onPreparePortfolio, fileInput,
    highlightsPanel, matchingRequestsBlock, tasksBlock, mandateExpiryLabel,
    hasValidMandate, tasksEnabled,
  } = props;

  const [tab, setTab] = useState<'overview' | 'documents' | 'notes'>('overview');

  const positionsLabel = player.positions?.filter(Boolean).join(' · ') || '—';
  const clubName = player.currentClub?.clubName;
  const nonGpsDocs = documents.filter((d) => d.type !== 'GPS_DATA');

  const ifa = player.ifaStats ?? {};
  const apps = ifa.matches ?? 0;
  const goals = ifa.goals ?? 0;
  const assists = ifa.assists ?? 0;
  const hasIfaForm = (ifa.matches ?? 0) + (ifa.goals ?? 0) + (ifa.assists ?? 0) > 0;

  const parent = player.parentContact;
  const hasPlayerContact = !!(player.playerPhoneNumber || player.playerEmail);
  const hasParentContact = !!(parent && (parent.parentName || parent.parentPhoneNumber || parent.parentEmail));

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const localDate = (ts?: number) =>
    ts ? new Date(ts).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const relationshipLabel = parent?.parentRelationship || t('youth_detail_parent');

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="players" />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <Link href="/players">{t('nav_players_youth')}</Link> / <strong>{displayName}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>
                {lang === 'en' ? 'HE / EN' : 'EN / HE'}
              </button>
            </div>
          </header>

          <div className="brit-profile" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
            {fileInput}

            {/* Back + tools */}
            <div className="bp-actionbar">
              <Link href={backHref} scroll={false} className="bp-back">
                <span style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}>←</span>
                {backLabel}
              </Link>
              <div className="bp-tools">
                {player.ifaUrl && (
                  <a className="bp-toolbtn" href={player.ifaUrl} target="_blank" rel="noopener noreferrer">
                    {t('youth_detail_ifa_profile')} ↗
                  </a>
                )}
                {tasksEnabled && (
                  <button className="bp-toolbtn" onClick={onAddTask}>
                    {t('youth_detail_task_btn')}
                  </button>
                )}
                <button className="bp-toolbtn" onClick={onEdit}>
                  {t('youth_detail_edit')}
                </button>
                <button className="bp-toolbtn primary" onClick={onShare} disabled={sharing}>
                  {sharing ? '…' : `↗ ${t('player_info_share')}`}
                </button>
                <button className="bp-toolbtn danger" onClick={onDelete}>
                  {t('youth_detail_delete')}
                </button>
              </div>
            </div>

            {/* Hero */}
            <section className="bp-hero">
              <div className="bp-hero-flagbg-ph" aria-hidden="true" />
              <div className="bp-hero-inner">
                {player.profileImage ? (
                  <img className="bp-hero-portrait" src={player.profileImage} alt="" />
                ) : (
                  <div className="bp-hero-portrait ph">{initials(displayName)}</div>
                )}
                <div className="bp-hero-copy">
                  <p className="bp-hero-kicker">{t('youth_detail_kicker')}</p>
                  <h1>{displayName}</h1>
                  {player.fullNameHe && displayName !== player.fullNameHe && (
                    <p className="bp-hero-he" dir="rtl">{player.fullNameHe}</p>
                  )}
                  <div className="bp-hero-sub">
                    <span>{positionsLabel}</span>
                    {clubName && <span className="club">{clubName}</span>}
                    {player.academy && <span className="tag">{player.academy}</span>}
                    {player.nationality && <span className="tag">{player.nationality}</span>}
                    {player.haveMandate && <span className="tag">{t('player_info_mandate')}</span>}
                  </div>
                </div>
                <div className="bp-hero-value">
                  <div className="v">{player.ageGroup || '—'}</div>
                  <div className="l">{t('youth_age_group')}</div>
                </div>
              </div>
            </section>

            {/* Signals / facts strip */}
            <section className="bp-signals">
              <div className="bp-sig">
                <label>{t('youth_age_group')}</label>
                <strong>{player.ageGroup || <span className="empty">—</span>}</strong>
              </div>
              <div className="bp-sig">
                <label>{t('room_th_position')}</label>
                <strong>{positionsLabel !== '—' ? positionsLabel : <span className="empty">—</span>}</strong>
              </div>
              <div className="bp-sig">
                <label>{t('youth_ifa_apps')}</label>
                <strong>{hasIfaForm ? String(apps).padStart(2, '0') : <span className="empty">—</span>}</strong>
              </div>
              <div className="bp-sig">
                <label>{t('youth_ifa_goals')}</label>
                <strong>{hasIfaForm ? String(goals).padStart(2, '0') : <span className="empty">—</span>}</strong>
              </div>
              <div className="bp-sig">
                <label>{t('youth_ifa_assists')}</label>
                <strong>{hasIfaForm ? String(assists).padStart(2, '0') : <span className="empty">—</span>}</strong>
              </div>
              <div className="bp-sig">
                <label>{t('player_info_mandate')}</label>
                <strong>{player.haveMandate ? t('youth_detail_active') : <span className="empty">—</span>}</strong>
              </div>
            </section>

            {/* Tabs */}
            <div className="bp-tabs" role="tablist">
              <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
                {t('player_tab_overview')}
              </button>
              <button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}>
                {t('youth_detail_documents')}
                {nonGpsDocs.length > 0 && <span className="c">{nonGpsDocs.length}</span>}
              </button>
              <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
                {t('youth_detail_notes')}
                {sortedNotes.length > 0 && <span className="c">{sortedNotes.length}</span>}
              </button>
            </div>

            {/* ═══ OVERVIEW ═══ */}
            <div className={`bp-pane${tab === 'overview' ? ' show' : ''}`}>
              <div className="bp-grid">
                <div>
                  {/* Season form */}
                  <section className="bp-module">
                    <div className="bp-mod-head">
                      <h2>{t('youth_season_form')}</h2>
                      <span className="act">{ifa.season || 'IFA'}</span>
                    </div>
                    {hasIfaForm ? (
                      <div className="brit-ifa-form" style={{ padding: '4px 0' }}>
                        <span><b>{apps}</b> {t('youth_ifa_apps')}</span>
                        <span><b>{goals}</b> {t('youth_ifa_goals')}</span>
                        <span><b>{assists}</b> {t('youth_ifa_assists')}</span>
                        {ifa.yellowCards != null && <span><b>{ifa.yellowCards}</b> {t('youth_detail_yellow')}</span>}
                        {ifa.redCards != null && <span><b>{ifa.redCards}</b> {t('youth_detail_red')}</span>}
                      </div>
                    ) : (
                      <div className="bp-empty">{t('youth_detail_no_ifa_stats')}</div>
                    )}
                    {player.ifaUrl && (
                      <a className="bp-ifa-src" href={player.ifaUrl} target="_blank" rel="noopener noreferrer"
                         style={{ display: 'inline-block', marginTop: 10, color: 'var(--gold)', fontFamily: 'var(--p-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('youth_room_source')} ↗
                      </a>
                    )}
                  </section>

                  {/* Highlights (passed-in panel) */}
                  {highlightsPanel && (
                    <section className="bp-module">
                      <div className="bp-mod-head"><h2>{t('youth_detail_highlights')}</h2></div>
                      {highlightsPanel}
                    </section>
                  )}

                  {/* Tasks (passed-in block) */}
                  {tasksEnabled && tasksBlock && (
                    <section className="bp-module">
                      <div className="bp-mod-head">
                        <h2>{t('youth_detail_tasks')}</h2>
                        <button className="act" onClick={onAddTask}>+ {t('youth_detail_add')}</button>
                      </div>
                      {tasksBlock}
                    </section>
                  )}
                </div>

                {/* Right column */}
                <aside>
                  {/* Mandate */}
                  <div className="bp-kv">
                    <h3>{t('youth_detail_mandate')}</h3>
                    <div className="bp-switchrow">
                      <div>
                        <div className="lbl">{player.haveMandate ? t('youth_detail_active') : t('youth_detail_inactive')}</div>
                        {player.haveMandate && mandateExpiryLabel && (
                          <div className="sub" dir="ltr">{t('youth_detail_expires')} {mandateExpiryLabel}</div>
                        )}
                      </div>
                      <label className="bp-sw">
                        <input
                          type="checkbox"
                          checked={player.haveMandate ?? false}
                          disabled={mandateToggling}
                          onChange={() => onMandateToggle(!(player.haveMandate ?? false))}
                        />
                        <span className="track" />
                      </label>
                    </div>
                  </div>

                  {/* Player contact */}
                  {hasPlayerContact && (
                    <div className="bp-kv">
                      <h3>{t('youth_detail_player_section')}</h3>
                      {player.playerPhoneNumber && (
                        <div className="bp-contactrow">
                          <span className="ic">☎</span>
                          <a href={toWhatsAppUrl(player.playerPhoneNumber) ?? `tel:${player.playerPhoneNumber}`} target="_blank" rel="noopener noreferrer" dir="ltr">
                            {player.playerPhoneNumber}
                          </a>
                        </div>
                      )}
                      {player.playerEmail && (
                        <div className="bp-contactrow">
                          <span className="ic">✉</span>
                          <a href={`mailto:${player.playerEmail}`}>{player.playerEmail}</a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Guardian contact */}
                  {hasParentContact && (
                    <div className="brit-guardian">
                      <div className="gh">
                        <div className="gi">{initials(parent?.parentName)}</div>
                        <div>
                          <b>{parent?.parentName || t('youth_detail_parent')}</b>
                          <span>{relationshipLabel}</span>
                        </div>
                      </div>
                      {parent?.parentPhoneNumber && (
                        <div className="bp-contactrow">
                          <span className="ic">☎</span>
                          <a href={toWhatsAppUrl(parent.parentPhoneNumber) ?? `tel:${parent.parentPhoneNumber}`} target="_blank" rel="noopener noreferrer" dir="ltr">
                            {parent.parentPhoneNumber}
                          </a>
                        </div>
                      )}
                      {parent?.parentEmail && (
                        <div className="bp-contactrow">
                          <span className="ic">✉</span>
                          <a href={`mailto:${parent.parentEmail}`}>{parent.parentEmail}</a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Club & details */}
                  <div className="bp-kv">
                    <h3>{t('youth_detail_club_details')}</h3>
                    <div className="bp-facts">
                      <div className="row">
                        <label>{t('room_th_club')}</label>
                        <span className="v">{clubName || <span className="empty">—</span>}</span>
                      </div>
                      {player.academy && (
                        <div className="row">
                          <label>{t('youth_detail_academy')}</label>
                          <span className="v">{player.academy}</span>
                        </div>
                      )}
                      <div className="row">
                        <label>{t('youth_detail_nationality')}</label>
                        <span className="v">{player.nationality || <span className="empty">—</span>}</span>
                      </div>
                      {player.dateOfBirth && (
                        <div className="row">
                          <label>{t('youth_add_dob')}</label>
                          <span className="v mono" dir="ltr">{player.dateOfBirth}</span>
                        </div>
                      )}
                      {player.foot && (
                        <div className="row">
                          <label>{t('player_info_foot')}</label>
                          <span className="v">{player.foot}</span>
                        </div>
                      )}
                      {player.agentInChargeName && (
                        <div className="row">
                          <label>{t('youth_detail_agent_in_charge')}</label>
                          <span className="v">{resolveAgentName(player.agentInChargeName)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Matching requests (passed-in block) */}
                  {matchingRequestsBlock && (
                    <div className="bp-kv">
                      <h3>{t('youth_matching_requests')}</h3>
                      {matchingRequestsBlock}
                    </div>
                  )}
                </aside>
              </div>
            </div>

            {/* ═══ DOCUMENTS ═══ */}
            <div className={`bp-pane${tab === 'documents' ? ' show' : ''}`}>
              <section className="bp-module" style={{ maxWidth: 760 }}>
                <div className="bp-mod-head">
                  <h2>{t('youth_detail_documents')}</h2>
                  {nonGpsDocs.length > 0 && <span className="act">{nonGpsDocs.length}</span>}
                </div>
                {uploadError && <div className="bp-err">{uploadError}</div>}
                {uploadingDocument && <div className="bp-empty">{t('youth_detail_uploading')}</div>}
                {nonGpsDocs.length === 0 && !uploadingDocument ? (
                  <div className="bp-empty">{t('youth_detail_no_documents')}</div>
                ) : (
                  nonGpsDocs.map((d) => (
                    <div className="bp-doc" key={d.id}>
                      <div className="nm">
                        <span className="ic">📄</span>
                        <div>
                          <div className="t">{d.name || d.type || t('youth_detail_document')}</div>
                          <div className="meta">{(d.type || 'Doc')}{d.uploadedAt ? ` · ${localDate(d.uploadedAt)}` : ''}</div>
                        </div>
                      </div>
                      <div className="ops">
                        {(d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (
                          <span className="bp-doc-badge">{t('youth_detail_valid')}</span>
                        )}
                        {d.expired && <span className="bp-doc-badge exp">{t('youth_detail_expired')}</span>}
                        <a href={d.storageUrl} target="_blank" rel="noopener noreferrer">↗</a>
                        <button className="del" onClick={() => onDeleteDoc(d)}>🗑</button>
                      </div>
                    </div>
                  ))
                )}
                <button className="bp-addbtn" onClick={onUploadClick} disabled={uploadingDocument}>
                  + {t('youth_detail_upload')}
                </button>
              </section>
            </div>

            {/* ═══ NOTES ═══ */}
            <div className={`bp-pane${tab === 'notes' ? ' show' : ''}`}>
              <section className="bp-module" style={{ maxWidth: 760 }}>
                <div className="bp-mod-head">
                  <h2>{t('youth_detail_notes')}</h2>
                  <button className="act" onClick={onAddNote}>+ {t('youth_detail_add_note')}</button>
                </div>
                {sortedNotes.length === 0 ? (
                  <div className="bp-empty">{t('youth_detail_no_notes')}</div>
                ) : (
                  sortedNotes.map((n, i) => (
                    <div className="bp-note" key={i}>
                      <div className="ops">
                        <button title={t('youth_detail_edit')} onClick={() => onEditNote(n)}>✎</button>
                        <button className="del" title={t('youth_detail_delete')} onClick={() => onDeleteNote(n)}>🗑</button>
                      </div>
                      <p>{n.notes}</p>
                      <div className="nm">
                        {n.createBy && <span className="by">{resolveAgentName(n.createBy)}</span>}
                        {n.createdAt && <span>{new Date(n.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>}
                      </div>
                    </div>
                  ))
                )}
              </section>
            </div>

            {/* Sticky actions — share + portfolio */}
            <div className="bp-sticky">
              <button style={{ width: '100%' }} onClick={onPreparePortfolio} disabled={addingToPortfolio}>
                {addingToPortfolio ? '…' : `◈ ${t('player_info_prepare_portfolio')}`}
              </button>
            </div>
            {(shareError || portfolioError) && <p className="bp-err">{shareError || portfolioError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
