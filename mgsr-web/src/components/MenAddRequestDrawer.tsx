'use client';

/**
 * Men platform "Add club requirement" — guided drawer (bulk).
 *
 * Same drawer + guided-accordion pattern as MenAddPlayerDrawer, adapted for the
 * multi-position club-request flow: Club → Positions → Requirements (per
 * position) → Review → Done. Creates one ClubRequest per selected position via
 * callRequestsCreate. Men only — women/youth and men-edit keep AddRequestSheet.
 */

import { useCallback, useEffect, useState } from 'react';
import { searchClubs, type ClubSearchResult } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { callRequestsCreate } from '@/lib/callables';
import { appConfig } from '@/lib/appConfig';

const POSITIONS = appConfig.positions.filterList;
const SALARY_OPTIONS = appConfig.salaryRanges;
const FEE_OPTIONS = appConfig.transferFees;
const FOOT_OPTIONS = [
  { value: 'left', labelKey: 'requests_foot_left' },
  { value: 'right', labelKey: 'requests_foot_right' },
  { value: 'any', labelKey: 'requests_foot_any' },
];

interface PositionConfig {
  ageDoesntMatter: boolean;
  minAge: string;
  maxAge: string;
  selectedFoot: string;
  selectedSalary: string | null;
  selectedFee: string | null;
  euOnly: boolean;
  notes: string;
}
const DEFAULT_CFG: PositionConfig = {
  ageDoesntMatter: true, minAge: '', maxAge: '', selectedFoot: 'any',
  selectedSalary: null, selectedFee: null, euOnly: false, notes: '',
};

type Step = 1 | 2 | 3 | 4 | 5;

interface MenAddRequestDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function MenAddRequestDrawer({ open, onClose, onSaved }: MenAddRequestDrawerProps) {
  const { t, isRtl, lang } = useLanguage();
  const { user } = useAuth();
  const isHebrew = lang === 'he';

  const [step, setStep] = useState<Step>(1);
  const [clubQuery, setClubQuery] = useState('');
  const [clubResults, setClubResults] = useState<ClubSearchResult[]>([]);
  const [clubSearching, setClubSearching] = useState(false);
  const [selectedClub, setSelectedClub] = useState<ClubSearchResult | null>(null);
  const [clubFocused, setClubFocused] = useState(false);

  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [positionConfigs, setPositionConfigs] = useState<Record<string, PositionConfig>>({});
  const [activeTab, setActiveTab] = useState('');

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [createdCount, setCreatedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const resetAll = useCallback(() => {
    setStep(1);
    setClubQuery(''); setClubResults([]); setClubSearching(false); setSelectedClub(null);
    setSelectedPositions([]); setPositionConfigs({}); setActiveTab('');
    setSaving(false); setProgress({ current: 0, total: 0 }); setCreatedCount(0); setError(null);
  }, []);

  useEffect(() => { if (open) resetAll(); }, [open, resetAll]);

  // Debounced club search.
  useEffect(() => {
    if (!open) return;
    const q = clubQuery.trim();
    if (q.length < 2) { setClubResults([]); setClubSearching(false); return; }
    setClubSearching(true);
    const timer = setTimeout(async () => {
      try {
        const clubs = await searchClubs(q);
        setClubResults(clubs);
      } catch (err) {
        setClubResults([]);
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setClubSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [clubQuery, open]);

  const togglePosition = (pos: string) => {
    setSelectedPositions((prev) => {
      if (prev.includes(pos)) {
        const next = prev.filter((p) => p !== pos);
        setPositionConfigs((cfgs) => { const c = { ...cfgs }; delete c[pos]; return c; });
        if (activeTab === pos) setActiveTab(next[0] || '');
        return next;
      }
      const next = [...prev, pos];
      setPositionConfigs((cfgs) => {
        if (cfgs[pos]) return cfgs;
        const last = prev[prev.length - 1];
        const base = last && cfgs[last] ? { ...cfgs[last], notes: '' } : { ...DEFAULT_CFG };
        return { ...cfgs, [pos]: base };
      });
      if (!activeTab) setActiveTab(pos);
      return next;
    });
  };
  const updateCfg = (pos: string, updates: Partial<PositionConfig>) =>
    setPositionConfigs((prev) => ({ ...prev, [pos]: { ...(prev[pos] || DEFAULT_CFG), ...updates } }));
  const copyFromPrev = (pos: string) => {
    const idx = selectedPositions.indexOf(pos);
    if (idx <= 0) return;
    const prevCfg = positionConfigs[selectedPositions[idx - 1]];
    if (prevCfg) updateCfg(pos, { ...prevCfg, notes: positionConfigs[pos]?.notes || '' });
  };

  const posComplete = (pos: string) => {
    const c = positionConfigs[pos];
    return !!c && !!c.selectedSalary && !!c.selectedFee;
  };
  const allConfigured = selectedPositions.length > 0 && selectedPositions.every(posComplete);

  const selectClub = (club: ClubSearchResult) => {
    setSelectedClub(club);
    setClubQuery('');
    setClubResults([]);
    setStep(2);
  };

  const handleCreate = async () => {
    if (!selectedClub || selectedPositions.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const account = user ? await getCurrentAccountForShortlist(user) : null;
      const clubFields = {
        platform: 'men',
        clubTmProfile: selectedClub.clubTmProfile || '',
        clubName: selectedClub.clubName || '',
        clubLogo: selectedClub.clubLogo || '',
        clubCountry: selectedClub.clubCountry || '',
        clubCountryFlag: selectedClub.clubCountryFlag || '',
        createdByAgent: account?.name ?? '',
        createdByAgentHebrew: account?.hebrewName ?? '',
      };
      setProgress({ current: 0, total: selectedPositions.length });
      const failed: string[] = [];
      let ok = 0;
      for (let i = 0; i < selectedPositions.length; i++) {
        const pos = selectedPositions[i];
        const cfg = positionConfigs[pos] || DEFAULT_CFG;
        setProgress({ current: i + 1, total: selectedPositions.length });
        try {
          await callRequestsCreate({
            ...clubFields,
            position: pos,
            notes: cfg.notes.trim() || '',
            minAge: cfg.minAge ? parseInt(cfg.minAge, 10) : 0,
            maxAge: cfg.maxAge ? parseInt(cfg.maxAge, 10) : 0,
            ageDoesntMatter: cfg.ageDoesntMatter,
            salaryRange: cfg.selectedSalary ?? undefined,
            transferFee: cfg.selectedFee ?? undefined,
            dominateFoot: cfg.selectedFoot === 'any' ? '' : cfg.selectedFoot,
            euOnly: cfg.euOnly || false,
          });
          ok++;
        } catch {
          failed.push(pos);
        }
      }
      onSaved?.();
      if (failed.length > 0) {
        setError(t('requests_bulk_partial_error').replace('{count}', String(failed.length)).replace('{positions}', failed.join(', ')));
        setSaving(false);
        return;
      }
      setCreatedCount(ok);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  // Step nav (only allow visiting completed/current steps)
  const goStep = (s: Step) => {
    if (s === 1) setStep(1);
    else if (s === 2 && selectedClub) setStep(2);
    else if (s === 3 && selectedClub && selectedPositions.length > 0) setStep(3);
    else if (s === 4 && allConfigured) setStep(4);
  };
  const stepClass = (s: Step) => (step === s ? 'open' : step > s ? 'done' : 'locked');

  const clubName = selectedClub?.clubName || '';
  const s1Summary = selectedClub
    ? `${clubName}${selectedClub.clubCountry ? ` · ${getCountryDisplayName(selectedClub.clubCountry, isHebrew)}` : ''}`
    : t('add_request_room_club_sum');
  const s2Summary = selectedPositions.length > 0
    ? selectedPositions.join(' · ')
    : t('add_request_room_positions_sum');
  const s3Summary = allConfigured
    ? t('add_request_room_configured').replace('{n}', String(selectedPositions.length))
    : t('add_request_room_requirements_sum');

  const footLabel = (v: string) => t(FOOT_OPTIONS.find((f) => f.value === v)?.labelKey || 'requests_foot_any');

  const renderConfigForm = (pos: string) => {
    const cfg = positionConfigs[pos] || DEFAULT_CFG;
    const idx = selectedPositions.indexOf(pos);
    return (
      <>
        {idx > 0 && (
          <button type="button" className="brit-areq-copyprev" onClick={() => copyFromPrev(pos)}>
            {t('requests_copy_from_previous')}
          </button>
        )}
        {/* Age */}
        <div className="brit-areq-block">
          <label>{t('requests_age_range')}</label>
          <label className="brit-areq-check">
            <input type="checkbox" checked={cfg.ageDoesntMatter} onChange={(e) => updateCfg(pos, { ageDoesntMatter: e.target.checked })} />
            {t('requests_age_doesnt_matter')}
          </label>
          {!cfg.ageDoesntMatter && (
            <div className="brit-areq-agerow">
              <input type="number" min={16} max={45} value={cfg.minAge} placeholder={t('requests_min')}
                onChange={(e) => updateCfg(pos, { minAge: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
              <input type="number" min={16} max={45} value={cfg.maxAge} placeholder={t('requests_max')}
                onChange={(e) => updateCfg(pos, { maxAge: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
            </div>
          )}
        </div>
        {/* EU only */}
        <div className="brit-areq-block">
          <button type="button" className={`brit-areq-euchip${cfg.euOnly ? ' on' : ''}`} onClick={() => updateCfg(pos, { euOnly: !cfg.euOnly })}>
            <span className="box">{cfg.euOnly ? '✓' : ''}</span>🇪🇺 {t('requests_eu_only')}
          </button>
        </div>
        {/* Foot */}
        <div className="brit-areq-block">
          <label>{t('requests_label_foot')}</label>
          <div className="brit-areq-chips">
            {FOOT_OPTIONS.map(({ value, labelKey }) => (
              <button key={value} type="button" className={cfg.selectedFoot === value ? 'on' : ''} onClick={() => updateCfg(pos, { selectedFoot: value })}>{t(labelKey)}</button>
            ))}
          </div>
        </div>
        {/* Salary */}
        <div className="brit-areq-block">
          <label>{t('requests_label_salary')}</label>
          <div className="brit-areq-chips">
            {SALARY_OPTIONS.map((opt) => (
              <button key={opt} type="button" className={cfg.selectedSalary === opt ? 'on' : ''} onClick={() => updateCfg(pos, { selectedSalary: opt })}>{opt}</button>
            ))}
          </div>
        </div>
        {/* Fee */}
        <div className="brit-areq-block">
          <label>{t('requests_label_fee')}</label>
          <div className="brit-areq-chips">
            {FEE_OPTIONS.map((opt) => (
              <button key={opt} type="button" className={cfg.selectedFee === opt ? 'on' : ''} onClick={() => updateCfg(pos, { selectedFee: opt })}>
                {opt === 'Free/Free loan' ? t('requests_fee_free_loan') : opt}
              </button>
            ))}
          </div>
        </div>
        {/* Notes */}
        <div className="brit-areq-block" style={{ marginBottom: 0 }}>
          <label>{t('requests_label_notes')}</label>
          <textarea className="brit-areq-notes" rows={3} value={cfg.notes} dir={isHebrew ? 'rtl' : 'ltr'}
            placeholder={t('requests_notes_placeholder')} onChange={(e) => updateCfg(pos, { notes: e.target.value })} />
        </div>
      </>
    );
  };

  return (
    <>
      <div className={`brit-scrim${open ? ' open' : ''}`} onClick={onClose} aria-hidden={!open} />
      <aside className={`brit-drawer brit-add-drawer${open ? ' open' : ''}`} dir={isRtl ? 'rtl' : 'ltr'} aria-label={t('requests_add_title')}>
        <div className="brit-add-head">
          <button className="close" onClick={onClose} aria-label={t('room_close')}>×</button>
          <div className="eyebrow">{t('add_request_room_eyebrow')}</div>
          <h2>{t('add_request_room_title')}</h2>
          <div className="brit-add-prog">
            <i className={step >= 1 ? 'on' : ''} />
            <i className={step >= 2 ? 'on' : ''} />
            <i className={step >= 3 ? 'on' : ''} />
            <i className={step >= 4 ? 'on' : ''} />
          </div>
        </div>

        <div className="brit-add-body">
          {/* STEP 1 — CLUB */}
          <div className={`brit-add-step ${stepClass(1)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(1)} type="button">
              <span className="n">{step > 1 ? '' : '1'}</span>
              <div className="t"><b>{t('add_request_room_club_title')}</b><small>{s1Summary}</small></div>
              {step > 1 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              {selectedClub ? (
                <div className="brit-areq-club-selected">
                  {selectedClub.clubLogo && <img src={selectedClub.clubLogo} alt="" />}
                  <div className="ci">
                    <b>{selectedClub.clubName}</b>
                    {selectedClub.clubCountry && <span>{getCountryDisplayName(selectedClub.clubCountry, isHebrew)}</span>}
                  </div>
                  <button className="chg" type="button" onClick={() => setSelectedClub(null)}>{t('requests_change_club')}</button>
                </div>
              ) : (
                <>
                  <label className={`brit-add-search${clubFocused ? ' focus' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                    <input value={clubQuery} onChange={(e) => setClubQuery(e.target.value)} placeholder={t('requests_search_club')}
                      onFocus={() => setClubFocused(true)} onBlur={() => setClubFocused(false)} />
                    {clubSearching && <span className="sp" />}
                  </label>
                  {clubResults.length > 0 && (
                    <div className="brit-add-results">
                      {clubResults.map((club) => (
                        <button key={club.clubTmProfile || club.clubName} className="brit-add-result brit-areq-clubresult" type="button" onClick={() => selectClub(club)}>
                          {club.clubLogo ? <img src={club.clubLogo} alt="" /> : null}
                          <div className="ci">
                            <b>{club.clubName}</b>
                            {club.clubCountry && <span>{getCountryDisplayName(club.clubCountry, isHebrew)}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div></div>
          </div>

          {/* STEP 2 — POSITIONS */}
          <div className={`brit-add-step ${stepClass(2)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(2)} type="button">
              <span className="n">{step > 2 ? '' : '2'}</span>
              <div className="t"><b>{t('add_request_room_positions_title')}</b><small>{s2Summary}</small></div>
              {step > 2 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              <p className="brit-add-seclabel">{t('requests_select_positions')}</p>
              <div className="brit-areq-posgrid">
                {POSITIONS.map((pos) => (
                  <button key={pos} type="button" className={`brit-areq-poschip${selectedPositions.includes(pos) ? ' on' : ''}`} onClick={() => togglePosition(pos)}>{pos}</button>
                ))}
              </div>
              {selectedPositions.length > 0 && (
                <p className="brit-areq-poscount"><b>{selectedPositions.length}</b> {t('requests_positions_selected').replace('{count}', '').trim()}</p>
              )}
              <div className="brit-add-stepcta" style={{ marginTop: 16 }}>
                <button className="btn" type="button" disabled={selectedPositions.length === 0} onClick={() => { setActiveTab(selectedPositions[0] || ''); setStep(3); }}>
                  {t('requests_next')}
                </button>
              </div>
            </div></div>
          </div>

          {/* STEP 3 — REQUIREMENTS (per position) */}
          <div className={`brit-add-step ${stepClass(3)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(3)} type="button">
              <span className="n">{step > 3 ? '' : '3'}</span>
              <div className="t"><b>{t('add_request_room_requirements_title')}</b><small>{s3Summary}</small></div>
              {step > 3 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              {selectedPositions.length > 1 && (
                <div className="brit-areq-tabs">
                  {selectedPositions.map((pos) => (
                    <button key={pos} type="button" className={`brit-areq-tab${activeTab === pos ? ' on' : ''}${posComplete(pos) ? ' complete' : ''}`} onClick={() => setActiveTab(pos)}>
                      {posComplete(pos) && '✓ '}{pos}
                    </button>
                  ))}
                </div>
              )}
              {activeTab && renderConfigForm(activeTab)}
              <div className="brit-add-stepcta" style={{ marginTop: 16 }}>
                <button className="btn ghost" type="button" onClick={() => setStep(2)}>{t('add_player_room_change')}</button>
                <button className="btn" type="button" disabled={!allConfigured} onClick={() => setStep(4)}>{t('requests_next')}</button>
              </div>
            </div></div>
          </div>

          {/* STEP 4 — REVIEW */}
          <div className={`brit-add-step ${stepClass(4)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(4)} type="button">
              <span className="n">{step > 4 ? '' : '4'}</span>
              <div className="t"><b>{t('add_request_room_review_title')}</b><small>{t('add_request_room_review_sum')}</small></div>
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              <p className="brit-areq-reviewsub">{clubName} · {selectedPositions.length} {t('add_request_room_briefs')}</p>
              {selectedPositions.map((pos) => {
                const cfg = positionConfigs[pos] || DEFAULT_CFG;
                return (
                  <div className="brit-areq-rcard" key={pos}>
                    <div className="rh">
                      <b>{pos}</b>
                      <button type="button" onClick={() => { setActiveTab(pos); setStep(3); }}>{t('add_player_room_edit')}</button>
                    </div>
                    <div className="rmeta">
                      {cfg.selectedSalary && <span>{t('requests_label_salary')}: <b>{cfg.selectedSalary}</b></span>}
                      {cfg.selectedFee && <span>{t('requests_label_fee')}: <b>{cfg.selectedFee === 'Free/Free loan' ? t('requests_fee_free_loan') : cfg.selectedFee}</b></span>}
                      {!cfg.ageDoesntMatter && (cfg.minAge || cfg.maxAge) && <span>{t('requests_age_range')}: <b>{cfg.minAge || '?'}-{cfg.maxAge || '?'}</b></span>}
                      {cfg.selectedFoot !== 'any' && <span>{t('requests_label_foot')}: <b>{footLabel(cfg.selectedFoot)}</b></span>}
                      {cfg.euOnly && <span><b>🇪🇺 EU</b></span>}
                    </div>
                    {cfg.notes && <p className="rnote">{cfg.notes}</p>}
                  </div>
                );
              })}
              {error && <div className="brit-add-steperr">{error}</div>}
              <div className="brit-add-stepcta" style={{ marginTop: 14 }}>
                <button className="btn ghost" type="button" onClick={() => setStep(3)}>{t('add_player_room_change')}</button>
                <button className="btn" type="button" disabled={saving} onClick={handleCreate}>
                  {saving
                    ? (progress.total > 1 ? t('requests_creating_progress').replace('{current}', String(progress.current)).replace('{total}', String(progress.total)) : '…')
                    : (selectedPositions.length > 1 ? t('requests_create_count').replace('{count}', String(selectedPositions.length)) : t('requests_save'))}
                </button>
              </div>
            </div></div>
          </div>

          {/* STEP 5 — DONE */}
          <div className={`brit-add-step ${stepClass(5)}`}>
            <button className="brit-add-stephead" type="button" style={{ cursor: 'default' }}>
              <span className="n">✓</span>
              <div className="t"><b>{t('add_request_room_done_title')}</b><small>{t('add_request_room_done_sum')}</small></div>
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              <div className="brit-add-done">
                <div className="seal"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></div>
                <h3>{t('add_request_room_done_head')}</h3>
                <p>{t('add_request_room_done_body').replace('{n}', String(createdCount)).replace('{club}', clubName)}</p>
                <div className="cta">
                  <button className="btn g" type="button" onClick={resetAll}>{t('add_request_room_add_another')}</button>
                  <button className="btn p" type="button" onClick={onClose}>{t('add_request_room_view_board')}</button>
                </div>
              </div>
            </div></div>
          </div>
        </div>
      </aside>
    </>
  );
}
