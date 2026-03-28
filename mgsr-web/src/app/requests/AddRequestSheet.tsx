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

  const [step, setStep] = useState(0);
  const [clubQuery, setClubQuery] = useState('');
  const [clubResults, setClubResults] = useState<ClubSearchResult[]>([]);
  const [clubSearching, setClubSearching] = useState(false);
  const [selectedClub, setSelectedClub] = useState<ClubSearchResult | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [ageDoesntMatter, setAgeDoesntMatter] = useState(true);
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [selectedFoot, setSelectedFoot] = useState<string>('any');
  const [selectedSalary, setSelectedSalary] = useState<string | null>(null);
  const [selectedFee, setSelectedFee] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [euOnly, setEuOnly] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const stepLabels = [t('requests_step_club'), t('requests_step_position'), t('requests_step_requirements'), t('requests_step_notes')];

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
  const canProceedStep1 = !!selectedPosition;
  const canProceedStep2 = isYouth ? true : (!!selectedSalary && !!selectedFee);

  const handleSave = async () => {
    const clubName = (isWomen || isYouth) ? manualClubName.trim() : selectedClub?.clubName || '';
    const clubCountry = (isWomen || isYouth) ? manualClubCountry.trim() : selectedClub?.clubCountry || '';
    if (!clubName || !selectedPosition || (!isYouth && (!selectedSalary || !selectedFee))) return;
    setSaving(true);
    setError(null);
    const platform = isWomen ? 'women' : isYouth ? 'youth' : 'men';
    try {
      if (isEditing && editRequest) {
        // Update existing request via callable
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
      // Create via callable — FeedEvent is written server-side
      await callRequestsCreate({
        platform,
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
        createdByAgent: agentName,
        createdByAgentHebrew: agentHebrewName,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
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
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!open) return null;

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

          {step === 1 && (
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

          {step === 2 && (
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

          {step === 3 && (
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
        </div>

        <div className="p-4 border-t border-mgsr-border shrink-0">
          {step < 3 ? (
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
              {saving ? '…' : t('requests_save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
