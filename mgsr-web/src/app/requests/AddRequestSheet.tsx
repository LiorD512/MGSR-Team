'use client';

import { useState, useEffect, useCallback } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { searchClubs, type ClubSearchResult } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCountryDisplayName } from '@/lib/countryTranslations';

const CLUB_REQUESTS_COLLECTION = 'ClubRequests';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST', 'SS'];
const SALARY_OPTIONS = ['>5', '6-10', '11-15', '16-20', '20-25', '26-30', '30+'];
const FEE_OPTIONS = ['Free/Free loan', '<200', '300-600', '700-900', '1m+'];
const FOOT_OPTIONS = [
  { value: 'left', labelKey: 'requests_foot_left' },
  { value: 'right', labelKey: 'requests_foot_right' },
  { value: 'any', labelKey: 'requests_foot_any' },
];

interface AddRequestSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddRequestSheet({ open, onClose, onSaved }: AddRequestSheetProps) {
  const { t, isRtl, lang } = useLanguage();
  const isHebrew = lang === 'he';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const timer = setTimeout(() => searchClubsDebounced(clubQuery), 300);
    return () => clearTimeout(timer);
  }, [clubQuery, searchClubsDebounced]);

  const canProceedStep0 = !!selectedClub;
  const canProceedStep1 = !!selectedPosition;
  const canProceedStep2 = !!selectedSalary && !!selectedFee;

  const handleSave = async () => {
    if (!selectedClub || !selectedPosition || !selectedSalary || !selectedFee) return;
    setSaving(true);
    setError(null);
    try {
      await addDoc(collection(db, CLUB_REQUESTS_COLLECTION), {
        clubTmProfile: selectedClub.clubTmProfile || '',
        clubName: selectedClub.clubName || '',
        clubLogo: selectedClub.clubLogo || '',
        clubCountry: selectedClub.clubCountry || '',
        clubCountryFlag: selectedClub.clubCountryFlag || '',
        contactId: '',
        contactName: '',
        contactPhoneNumber: '',
        position: selectedPosition,
        quantity: 1,
        notes: notes.trim() || '',
        minAge: minAge ? parseInt(minAge, 10) : 0,
        maxAge: maxAge ? parseInt(maxAge, 10) : 0,
        ageDoesntMatter,
        salaryRange: selectedSalary,
        transferFee: selectedFee,
        dominateFoot: selectedFoot === 'any' ? '' : selectedFoot,
        createdAt: Date.now(),
        status: 'pending',
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
    setSelectedPosition(null);
    setAgeDoesntMatter(true);
    setMinAge('');
    setMaxAge('');
    setSelectedFoot('any');
    setSelectedSalary(null);
    setSelectedFee(null);
    setNotes('');
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
            <h2 className="text-lg font-display font-bold text-mgsr-text">{t('requests_add_title')}</h2>
          </div>
          <button type="button" onClick={handleClose} className="p-2 -m-2 text-mgsr-muted hover:text-mgsr-text">
            ✕
          </button>
        </div>

        <div className="flex gap-2 px-4 pb-2 shrink-0">
          {stepLabels.map((label, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full flex-1 ${i <= step ? 'bg-mgsr-teal' : 'bg-mgsr-border'}`}
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
              <p className="text-sm text-mgsr-muted">{t('requests_search_for_club')}</p>
              <input
                type="text"
                value={clubQuery}
                onChange={(e) => {
                  setClubQuery(e.target.value);
                  if (selectedClub) setSelectedClub(null);
                }}
                placeholder={t('requests_search_club')}
                className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal"
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
                    className="text-sm text-mgsr-teal hover:underline"
                  >
                    {t('requests_change_club')}
                  </button>
                </div>
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
                        ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
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
                          ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                          : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                      }`}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>
              </div>

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
                          ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                          : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

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
                          ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                          : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                      }`}
                    >
                      {opt === 'Free/Free loan' ? t('requests_fee_free_loan') : opt}
                    </button>
                  ))}
                </div>
              </div>
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
                className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal resize-none"
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
              className="w-full py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('requests_next')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold disabled:opacity-50"
            >
              {saving ? '…' : t('requests_save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
