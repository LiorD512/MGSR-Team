'use client';

import { useState, useEffect, useCallback } from 'react';
import { searchClubs, type ClubSearchResult } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { callRequestsCreate, callRequestsUpdate } from '@/lib/callables';
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

const DEFAULT_POSITION_CONFIG: PositionConfig = {
  ageDoesntMatter: true,
  minAge: '',
  maxAge: '',
  selectedFoot: 'any',
  selectedSalary: null,
  selectedFee: null,
  euOnly: false,
  notes: '',
};

interface EditRequest {
  id: string;
  clubTmProfile?: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  contactName?: string;
  contactPhoneNumber?: string;
  position?: string;
  notes?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  salaryRange?: string;
  transferFee?: string;
  dominateFoot?: string;
  euOnly?: boolean;
}

interface AddRequestSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  isWomen?: boolean;
  isYouth?: boolean;
  editRequest?: EditRequest | null;
}

export default function AddRequestSheet({ open, onClose, onSaved, isWomen = false, isYouth = false, editRequest = null }: AddRequestSheetProps) {
  const { t, isRtl, lang } = useLanguage();
  const { user } = useAuth();
  const isHebrew = lang === 'he';
  const isEditing = !!editRequest;

  // Multi-position bulk mode: Men platform + not editing
  const isBulkMode = !isWomen && !isYouth && !isEditing;

  const [step, setStep] = useState(0);
  const [clubQuery, setClubQuery] = useState('');
  const [clubResults, setClubResults] = useState<ClubSearchResult[]>([]);
  const [clubSearching, setClubSearching] = useState(false);
  const [selectedClub, setSelectedClub] = useState<ClubSearchResult | null>(null);
  // Single-position state (edit / women / youth modes)
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [ageDoesntMatter, setAgeDoesntMatter] = useState(true);
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [selectedFoot, setSelectedFoot] = useState<string>('any');
  const [selectedSalary, setSelectedSalary] = useState<string | null>(null);
  const [selectedFee, setSelectedFee] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [euOnly, setEuOnly] = useState(false);
  // Bulk mode state
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [positionConfigs, setPositionConfigs] = useState<Record<string, PositionConfig>>({});
  const [activePositionTab, setActivePositionTab] = useState<string>('');

  const [saving, setSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [manualClubName, setManualClubName] = useState('');
  const [manualClubCountry, setManualClubCountry] = useState('');

  // Populate fields when editing
  useEffect(() => {
    if (editRequest && open) {
      if (isWomen || isYouth) {
        setManualClubName(editRequest.clubName || '');
        setManualClubCountry(editRequest.clubCountry || '');
      } else {
        setSelectedClub(editRequest.clubName ? {
          clubName: editRequest.clubName,
          clubLogo: editRequest.clubLogo || '',
          clubCountry: editRequest.clubCountry || '',
          clubCountryFlag: editRequest.clubCountryFlag || '',
          clubTmProfile: editRequest.clubTmProfile || '',
        } : null);
      }
      setSelectedPosition(editRequest.position || null);
      setAgeDoesntMatter(editRequest.ageDoesntMatter !== false);
      setMinAge(editRequest.minAge ? String(editRequest.minAge) : '');
      setMaxAge(editRequest.maxAge ? String(editRequest.maxAge) : '');
      setSelectedFoot(editRequest.dominateFoot || 'any');
      setSelectedSalary(editRequest.salaryRange || null);
      setSelectedFee(editRequest.transferFee || null);
      setNotes(editRequest.notes || '');
      setEuOnly(editRequest.euOnly === true);
      setStep(0);
    }
  }, [editRequest, open, isWomen, isYouth]);

  // Bulk mode: step labels differ
  const stepLabels = isBulkMode
    ? [t('requests_step_club'), t('requests_step_positions'), t('requests_step_configure'), t('requests_step_review')]
    : [t('requests_step_club'), t('requests_step_position'), t('requests_step_requirements'), t('requests_step_notes')];

  const searchClubsDebounced = useCallback(async (q: string) => {
    if (q.length < 2) {
      setClubResults([]);
      return;
    }
    setClubSearching(true);
    try {
      const clubs = await searchClubs(q);
      setClubResults(clubs);
    } catch (err) {
      setClubResults([]);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setClubSearching(false);
    }
  }, []);

  useEffect(() => {
    if (isWomen || isYouth) return;
    const timer = setTimeout(() => searchClubsDebounced(clubQuery), 300);
    return () => clearTimeout(timer);
  }, [clubQuery, searchClubsDebounced, isWomen, isYouth]);

  const canProceedStep0 = (isWomen || isYouth) ? manualClubName.trim().length >= 2 : !!selectedClub;
  const canProceedStep1 = isBulkMode ? selectedPositions.length > 0 : !!selectedPosition;
  const canProceedStep2 = isBulkMode
    ? selectedPositions.every((pos) => {
        const cfg = positionConfigs[pos];
        return cfg && !!cfg.selectedSalary && !!cfg.selectedFee;
      })
    : isYouth ? true : (!!selectedSalary && !!selectedFee);

  // Bulk mode helpers
  const togglePosition = (pos: string) => {
    setSelectedPositions((prev) => {
      if (prev.includes(pos)) {
        const next = prev.filter((p) => p !== pos);
        // Clean up removed position config
        setPositionConfigs((cfgs) => {
          const copy = { ...cfgs };
          delete copy[pos];
          return copy;
        });
        if (activePositionTab === pos) setActivePositionTab(next[0] || '');
        return next;
      } else {
        const next = [...prev, pos];
        // Initialize config for new position (copy from last configured or use defaults)
        setPositionConfigs((cfgs) => {
          if (cfgs[pos]) return cfgs;
          const lastPos = prev[prev.length - 1];
          const base = lastPos && cfgs[lastPos] ? { ...cfgs[lastPos], notes: '' } : { ...DEFAULT_POSITION_CONFIG };
          return { ...cfgs, [pos]: base };
        });
        if (!activePositionTab) setActivePositionTab(pos);
        return next;
      }
    });
  };

  const updatePositionConfig = (pos: string, updates: Partial<PositionConfig>) => {
    setPositionConfigs((prev) => ({
      ...prev,
      [pos]: { ...(prev[pos] || DEFAULT_POSITION_CONFIG), ...updates },
    }));
  };

  const copyConfigFromPrevious = (targetPos: string) => {
    const idx = selectedPositions.indexOf(targetPos);
    if (idx <= 0) return;
    const prevPos = selectedPositions[idx - 1];
    const prevCfg = positionConfigs[prevPos];
    if (prevCfg) {
      setPositionConfigs((prev) => ({
        ...prev,
        [targetPos]: { ...prevCfg, notes: prev[targetPos]?.notes || '' },
      }));
    }
  };

  // When entering step 2 in bulk mode, set active tab to first position
  useEffect(() => {
    if (isBulkMode && step === 2 && selectedPositions.length > 0 && !activePositionTab) {
      setActivePositionTab(selectedPositions[0]);
    }
  }, [step, isBulkMode, selectedPositions, activePositionTab]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const platform = isWomen ? 'women' : isYouth ? 'youth' : 'men';
    const clubName = (isWomen || isYouth) ? manualClubName.trim() : selectedClub?.clubName || '';
    const clubCountry = (isWomen || isYouth) ? manualClubCountry.trim() : selectedClub?.clubCountry || '';

    try {
      if (isEditing && editRequest) {
        if (!clubName || !selectedPosition || (!isYouth && (!selectedSalary || !selectedFee))) return;
        await callRequestsUpdate({
          platform,
          requestId: editRequest.id,
          clubTmProfile: (isWomen || isYouth) ? '' : (selectedClub?.clubTmProfile || ''),
          clubName,
          clubLogo: (isWomen || isYouth) ? '' : (selectedClub?.clubLogo || ''),
          clubCountry,
          clubCountryFlag: (isWomen || isYouth) ? '' : (selectedClub?.clubCountryFlag || ''),
          position: selectedPosition,
          notes: notes.trim() || '',
          minAge: isYouth ? 0 : (minAge ? parseInt(minAge, 10) : 0),
          maxAge: isYouth ? 0 : (maxAge ? parseInt(maxAge, 10) : 0),
          ageDoesntMatter: isYouth ? true : ageDoesntMatter,
          salaryRange: isYouth ? 'N/A' : (selectedSalary ?? undefined),
          transferFee: isYouth ? 'N/A' : (selectedFee ?? undefined),
          dominateFoot: selectedFoot === 'any' ? '' : selectedFoot,
          euOnly: euOnly || false,
        });
        onSaved();
        onClose();
        return;
      }

      const account = user ? await getCurrentAccountForShortlist(user) : null;
      const agentName = account?.name ?? '';
      const agentHebrewName = account?.hebrewName ?? '';
      const clubFields = {
        platform,
        clubTmProfile: (isWomen || isYouth) ? '' : (selectedClub?.clubTmProfile || ''),
        clubName,
        clubLogo: (isWomen || isYouth) ? '' : (selectedClub?.clubLogo || ''),
        clubCountry,
        clubCountryFlag: (isWomen || isYouth) ? '' : (selectedClub?.clubCountryFlag || ''),
        createdByAgent: agentName,
        createdByAgentHebrew: agentHebrewName,
      };

      if (isBulkMode) {
        // Bulk create: one request per position
        const positions = selectedPositions;
        setSavingProgress({ current: 0, total: positions.length });
        const failed: string[] = [];
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          const cfg = positionConfigs[pos] || DEFAULT_POSITION_CONFIG;
          setSavingProgress({ current: i + 1, total: positions.length });
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
          } catch {
            failed.push(pos);
          }
        }
        if (failed.length > 0) {
          setError(t('requests_bulk_partial_error').replace('{count}', String(failed.length)).replace('{positions}', failed.join(', ')));
        }
        onSaved();
        if (failed.length === 0) onClose();
      } else {
        // Single create (women / youth)
        if (!clubName || !selectedPosition || (!isYouth && (!selectedSalary || !selectedFee))) return;
        await callRequestsCreate({
          ...clubFields,
          position: selectedPosition,
          notes: notes.trim() || '',
          minAge: isYouth ? 0 : (minAge ? parseInt(minAge, 10) : 0),
          maxAge: isYouth ? 0 : (maxAge ? parseInt(maxAge, 10) : 0),
          ageDoesntMatter: isYouth ? true : ageDoesntMatter,
          salaryRange: isYouth ? 'N/A' : (selectedSalary ?? undefined),
          transferFee: isYouth ? 'N/A' : (selectedFee ?? undefined),
          dominateFoot: selectedFoot === 'any' ? '' : selectedFoot,
          euOnly: euOnly || false,
        });
        onSaved();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
      setSavingProgress({ current: 0, total: 0 });
    }
  };

  const reset = () => {
    setStep(0);
    setClubQuery('');
    setClubResults([]);
    setSelectedClub(null);
    setManualClubName('');
    setManualClubCountry('');
    setSelectedPosition(null);
    setAgeDoesntMatter(true);
    setMinAge('');
    setMaxAge('');
    setSelectedFoot('any');
    setSelectedSalary(null);
    setSelectedFee(null);
    setNotes('');
    setEuOnly(false);
    setSelectedPositions([]);
    setPositionConfigs({});
    setActivePositionTab('');
    setSavingProgress({ current: 0, total: 0 });
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!open) return null;

  // ─── Render helpers for per-position config form ───
  const renderPositionConfigForm = (pos: string) => {
    const cfg = positionConfigs[pos] || DEFAULT_POSITION_CONFIG;
    const idx = selectedPositions.indexOf(pos);
    return (
      <div className="space-y-4">
        {idx > 0 && (
          <button
            type="button"
            onClick={() => copyConfigFromPrevious(pos)}
            className="text-xs text-mgsr-teal hover:underline"
          >
            {t('requests_copy_from_previous')}
          </button>
        )}

        {/* Age */}
        <div>
          <p className="text-sm text-mgsr-muted mb-2">{t('requests_label_age') || 'Age'}</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.ageDoesntMatter}
              onChange={(e) => updatePositionConfig(pos, { ageDoesntMatter: e.target.checked })}
              className="rounded border-mgsr-border"
            />
            <span className="text-mgsr-text">{t('requests_age_doesnt_matter')}</span>
          </label>
          {!cfg.ageDoesntMatter && (
            <div className="flex gap-2 mt-2">
              <input
                type="number"
                min={16}
                max={45}
                value={cfg.minAge}
                onChange={(e) => updatePositionConfig(pos, { minAge: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                placeholder={t('requests_min')}
                className="flex-1 px-3 py-2 rounded-lg bg-mgsr-dark border border-mgsr-border text-mgsr-text"
              />
              <input
                type="number"
                min={16}
                max={45}
                value={cfg.maxAge}
                onChange={(e) => updatePositionConfig(pos, { maxAge: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                placeholder={t('requests_max')}
                className="flex-1 px-3 py-2 rounded-lg bg-mgsr-dark border border-mgsr-border text-mgsr-text"
              />
            </div>
          )}
        </div>

        {/* EU Only */}
        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-mgsr-border hover:border-mgsr-teal/40 transition">
          <input
            type="checkbox"
            checked={cfg.euOnly}
            onChange={(e) => updatePositionConfig(pos, { euOnly: e.target.checked })}
            className="w-5 h-5 rounded border-mgsr-border text-mgsr-teal focus:ring-mgsr-teal/50 accent-[var(--mgsr-accent)]"
          />
          <span className="text-mgsr-text text-sm font-medium">🇪🇺 {t('requests_eu_only')}</span>
        </label>

        {/* Foot */}
        <div>
          <p className="text-sm text-mgsr-muted mb-2">{t('requests_label_foot')}</p>
          <div className="flex gap-2">
            {FOOT_OPTIONS.map(({ value, labelKey }) => (
              <button
                key={value}
                type="button"
                onClick={() => updatePositionConfig(pos, { selectedFoot: value })}
                className={`flex-1 px-3 py-2 rounded-lg text-sm border ${
                  cfg.selectedFoot === value
                    ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                    : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                }`}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Salary */}
        <div>
          <p className="text-sm text-mgsr-muted mb-2">{t('requests_label_salary')}</p>
          <div className="flex flex-wrap gap-2">
            {SALARY_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => updatePositionConfig(pos, { selectedSalary: opt })}
                className={`px-3 py-2 rounded-lg text-sm border ${
                  cfg.selectedSalary === opt
                    ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                    : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Fee */}
        <div>
          <p className="text-sm text-mgsr-muted mb-2">{t('requests_label_fee')}</p>
          <div className="flex flex-wrap gap-2">
            {FEE_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => updatePositionConfig(pos, { selectedFee: opt })}
                className={`px-3 py-2 rounded-lg text-sm border ${
                  cfg.selectedFee === opt
                    ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                    : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                }`}
              >
                {opt === 'Free/Free loan' ? t('requests_fee_free_loan') : opt}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-sm text-mgsr-muted mb-2">{t('requests_label_notes')}</p>
          <textarea
            value={cfg.notes}
            onChange={(e) => updatePositionConfig(pos, { notes: e.target.value })}
            placeholder={t('requests_notes_placeholder')}
            rows={3}
            dir={isHebrew ? 'rtl' : 'ltr'}
            className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none resize-none focus:border-mgsr-teal"
          />
        </div>
      </div>
    );
  };

  // Last step index
  const lastStep = 3;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div
        dir={isRtl ? 'rtl' : 'ltr'}
        className="relative w-full max-w-lg max-h-[90vh] overflow-hidden bg-mgsr-card border border-mgsr-border rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-mgsr-border shrink-0">
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="p-2 -m-2 text-mgsr-muted hover:text-mgsr-text"
              >
                ←
              </button>
            )}
            <h2 className="text-lg font-display font-bold text-mgsr-text">{isEditing ? t('requests_edit_title') : t('requests_add_title')}</h2>
          </div>
          <button type="button" onClick={handleClose} className="p-2 -m-2 text-mgsr-muted hover:text-mgsr-text">
            ✕
          </button>
        </div>

        <div className="flex gap-2 px-4 pb-2 shrink-0">
          {stepLabels.map((label, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full flex-1 ${i <= step ? (isYouth ? 'bg-[var(--youth-cyan)]' : isWomen ? 'bg-[var(--women-rose)]' : 'bg-mgsr-teal') : 'bg-mgsr-border'}`}
              title={label}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          {/* ───────── Step 0: Club Selection (shared across all modes) ───────── */}
          {step === 0 && (
            <>
              {isWomen ? (
                <>
                  <p className="text-sm text-mgsr-muted">{t('requests_manual_club_hint')}</p>
                  <div>
                    <label className="block text-xs text-mgsr-muted mb-1.5">{t('requests_club_name')}</label>
                    <input
                      type="text"
                      value={manualClubName}
                      onChange={(e) => setManualClubName(e.target.value)}
                      placeholder={t('requests_search_club')}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mgsr-muted mb-1.5">{t('requests_club_country')}</label>
                    <input
                      type="text"
                      value={manualClubCountry}
                      onChange={(e) => setManualClubCountry(e.target.value)}
                      placeholder={isHebrew ? 'ישראל, גרמניה...' : 'Israel, Germany...'}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]"
                    />
                  </div>
                </>
              ) : isYouth ? (
                <>
                  <p className="text-sm text-mgsr-muted">{t('requests_manual_club_hint_youth')}</p>
                  <div>
                    <label className="block text-xs text-mgsr-muted mb-1.5">{t('requests_club_name')}</label>
                    <input
                      type="text"
                      value={manualClubName}
                      onChange={(e) => setManualClubName(e.target.value)}
                      placeholder={t('requests_search_club')}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--youth-cyan)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mgsr-muted mb-1.5">{t('requests_club_country')}</label>
                    <input
                      type="text"
                      value={manualClubCountry}
                      onChange={(e) => setManualClubCountry(e.target.value)}
                      placeholder={isHebrew ? 'ישראל, גרמניה...' : 'Israel, Germany...'}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--youth-cyan)]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-mgsr-muted">{t('requests_search_for_club')}</p>
                  <input
                    type="text"
                    value={clubQuery}
                    onChange={(e) => {
                      setClubQuery(e.target.value);
                      if (selectedClub) setSelectedClub(null);
                    }}
                    placeholder={t('requests_search_club')}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal`}
                  />
                  {clubSearching && <p className="text-sm text-mgsr-muted">Searching…</p>}
                  {clubResults.length > 0 && !selectedClub && (
                    <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-mgsr-border p-2">
                      {clubResults.map((club) => (
                        <button
                          key={club.clubTmProfile || club.clubName}
                          type="button"
                          onClick={() => {
                            setSelectedClub(club);
                            setClubQuery('');
                            setClubResults([]);
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-mgsr-dark/50 text-start"
                        >
                          {club.clubLogo && (
                            <img src={club.clubLogo} alt="" className="w-10 h-10 rounded-lg object-contain shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-mgsr-text truncate">{club.clubName}</p>
                            {club.clubCountry && (
                              <p className="text-sm text-mgsr-muted">{getCountryDisplayName(club.clubCountry, isHebrew)}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedClub && (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-mgsr-teal bg-mgsr-teal/10">
                      {selectedClub.clubLogo && (
                        <img src={selectedClub.clubLogo} alt="" className="w-12 h-12 rounded-lg object-contain shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-mgsr-text">{selectedClub.clubName}</p>
                        {selectedClub.clubCountry && (
                          <p className="text-sm text-mgsr-muted">{getCountryDisplayName(selectedClub.clubCountry, isHebrew)}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedClub(null)}
                        className="text-sm hover:underline text-mgsr-teal"
                      >
                        {t('requests_change_club')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ───────── Step 1: Position Selection ───────── */}
          {step === 1 && (
            <>
              {isBulkMode ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-mgsr-muted">{t('requests_select_positions')}</p>
                    {selectedPositions.length > 0 && (
                      <span className="text-xs font-medium text-mgsr-teal bg-mgsr-teal/10 px-2 py-1 rounded-full">
                        {t('requests_positions_selected').replace('{count}', String(selectedPositions.length))}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {POSITIONS.map((pos) => {
                      const isSelected = selectedPositions.includes(pos);
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => togglePosition(pos)}
                          className={`px-4 py-3 rounded-xl text-sm font-medium border transition flex items-center justify-center gap-2 ${
                            isSelected
                              ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                              : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/30'
                          }`}
                        >
                          {isSelected && <span className="text-xs">✓</span>}
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-mgsr-muted">{t('requests_label_position')}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {POSITIONS.map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setSelectedPosition(pos)}
                        className={`px-4 py-3 rounded-xl text-sm font-medium border transition ${
                          selectedPosition === pos
                            ? isYouth
                              ? 'bg-[var(--youth-cyan)]/20 border-[var(--youth-cyan)] text-[var(--youth-cyan)]'
                              : isWomen
                              ? 'bg-[var(--women-rose)]/20 border-[var(--women-rose)] text-[var(--women-rose)]'
                              : 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                            : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/30'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ───────── Step 2: Requirements ───────── */}
          {step === 2 && (
            <>
              {isBulkMode ? (
                <>
                  {/* Position tabs */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                    {selectedPositions.map((pos) => {
                      const cfg = positionConfigs[pos];
                      const isComplete = cfg && !!cfg.selectedSalary && !!cfg.selectedFee;
                      return (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setActivePositionTab(pos)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border whitespace-nowrap flex items-center gap-1.5 transition ${
                            activePositionTab === pos
                              ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                              : isComplete
                              ? 'bg-mgsr-dark/50 border-green-600/50 text-green-400'
                              : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                          }`}
                        >
                          {isComplete && <span className="text-[10px]">✓</span>}
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                  {/* Active position form */}
                  {activePositionTab && renderPositionConfigForm(activePositionTab)}
                </>
              ) : (
                <>
                  {!isYouth && (
                  <div>
                    <p className="text-sm text-mgsr-muted mb-2">Age</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ageDoesntMatter}
                        onChange={(e) => setAgeDoesntMatter(e.target.checked)}
                        className="rounded border-mgsr-border"
                      />
                      <span className="text-mgsr-text">{t('requests_age_doesnt_matter')}</span>
                    </label>
                    {!ageDoesntMatter && (
                      <div className="flex gap-2 mt-2">
                        <input
                          type="number"
                          min={16}
                          max={45}
                          value={minAge}
                          onChange={(e) => setMinAge(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          placeholder={t('requests_min')}
                          className="flex-1 px-3 py-2 rounded-lg bg-mgsr-dark border border-mgsr-border text-mgsr-text"
                        />
                        <input
                          type="number"
                          min={16}
                          max={45}
                          value={maxAge}
                          onChange={(e) => setMaxAge(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          placeholder={t('requests_max')}
                          className="flex-1 px-3 py-2 rounded-lg bg-mgsr-dark border border-mgsr-border text-mgsr-text"
                        />
                      </div>
                    )}
                  </div>
                  )}

                  {!isWomen && !isYouth && (
                    <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-mgsr-border hover:border-mgsr-teal/40 transition">
                      <input
                        type="checkbox"
                        checked={euOnly}
                        onChange={(e) => setEuOnly(e.target.checked)}
                        className="w-5 h-5 rounded border-mgsr-border text-mgsr-teal focus:ring-mgsr-teal/50 accent-[var(--mgsr-accent)]"
                      />
                      <span className="text-mgsr-text text-sm font-medium">🇪🇺 {t('requests_eu_only')}</span>
                    </label>
                  )}

                  <div>
                    <p className="text-sm text-mgsr-muted mb-2">{t('requests_label_foot')}</p>
                    <div className="flex gap-2">
                      {FOOT_OPTIONS.map(({ value, labelKey }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSelectedFoot(value)}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm border ${
                            selectedFoot === value
                              ? isYouth ? 'bg-[var(--youth-cyan)]/20 border-[var(--youth-cyan)] text-[var(--youth-cyan)]' : isWomen ? 'bg-[var(--women-rose)]/20 border-[var(--women-rose)] text-[var(--women-rose)]' : 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                              : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                          }`}
                        >
                          {t(labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!isYouth && (
                    <div>
                      <p className="text-sm text-mgsr-muted mb-2">{t('requests_label_salary')}</p>
                      <div className="flex flex-wrap gap-2">
                        {SALARY_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSelectedSalary(opt)}
                            className={`px-3 py-2 rounded-lg text-sm border ${
                              selectedSalary === opt
                                ? isWomen ? 'bg-[var(--women-rose)]/20 border-[var(--women-rose)] text-[var(--women-rose)]' : 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                                : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isYouth && (
                    <div>
                      <p className="text-sm text-mgsr-muted mb-2">{t('requests_label_fee')}</p>
                      <div className="flex flex-wrap gap-2">
                        {FEE_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSelectedFee(opt)}
                            className={`px-3 py-2 rounded-lg text-sm border ${
                              selectedFee === opt
                                ? isWomen ? 'bg-[var(--women-rose)]/20 border-[var(--women-rose)] text-[var(--women-rose)]' : 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                                : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                            }`}
                          >
                            {opt === 'Free/Free loan' ? t('requests_fee_free_loan') : opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ───────── Step 3: Notes (legacy) / Review (bulk) ───────── */}
          {step === 3 && (
            <>
              {isBulkMode ? (
                <div className="space-y-3">
                  <p className="text-sm text-mgsr-muted">{t('requests_review_subtitle')}</p>
                  {selectedPositions.map((pos) => {
                    const cfg = positionConfigs[pos] || DEFAULT_POSITION_CONFIG;
                    return (
                      <div
                        key={pos}
                        className="p-3 rounded-xl border border-mgsr-border bg-mgsr-dark/30 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-mgsr-teal">{pos}</span>
                          <button
                            type="button"
                            onClick={() => { setActivePositionTab(pos); setStep(2); }}
                            className="text-xs text-mgsr-muted hover:text-mgsr-text hover:underline"
                          >
                            {t('requests_review_edit')}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mgsr-muted">
                          {cfg.selectedSalary && <span>{t('requests_label_salary')}: {cfg.selectedSalary}</span>}
                          {cfg.selectedFee && <span>{t('requests_label_fee')}: {cfg.selectedFee === 'Free/Free loan' ? t('requests_fee_free_loan') : cfg.selectedFee}</span>}
                          {!cfg.ageDoesntMatter && (cfg.minAge || cfg.maxAge) && (
                            <span>Age: {cfg.minAge || '?'}-{cfg.maxAge || '?'}</span>
                          )}
                          {cfg.selectedFoot !== 'any' && <span>{t('requests_label_foot')}: {cfg.selectedFoot}</span>}
                          {cfg.euOnly && <span>🇪🇺 EU</span>}
                        </div>
                        {cfg.notes && (
                          <p className="text-xs text-mgsr-muted/70 truncate">{cfg.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <>
                  <p className="text-sm text-mgsr-muted">{t('requests_label_notes')}</p>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('requests_notes_placeholder')}
                    rows={4}
                    dir={isHebrew ? 'rtl' : 'ltr'}
                    className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none resize-none ${isYouth ? 'focus:border-[var(--youth-cyan)]' : isWomen ? 'focus:border-[var(--women-rose)]' : 'focus:border-mgsr-teal'}`}
                  />
                </>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-mgsr-border shrink-0">
          {step < lastStep ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 0 && !canProceedStep0) ||
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2)
              }
              className={`w-full py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${isYouth ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.3)]' : isWomen ? 'bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)]' : 'bg-mgsr-teal text-mgsr-dark'}`}
            >
              {t('requests_next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`w-full py-3 rounded-xl font-semibold disabled:opacity-50 ${isYouth ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.3)]' : isWomen ? 'bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)]' : 'bg-mgsr-teal text-mgsr-dark'}`}
            >
              {saving
                ? (savingProgress.total > 1
                    ? t('requests_creating_progress').replace('{current}', String(savingProgress.current)).replace('{total}', String(savingProgress.total))
                    : '…')
                : (isBulkMode && selectedPositions.length > 1
                    ? t('requests_create_count').replace('{count}', String(selectedPositions.length))
                    : t('requests_save'))
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
