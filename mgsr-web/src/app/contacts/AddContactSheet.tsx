'use client';

import { useState, useEffect } from 'react';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';

export interface Contact {
  id: string;
  name?: string;
  phoneNumber?: string;
  role?: string;
  clubName?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  clubLogo?: string;
  clubTmProfile?: string;
  contactType?: string;
  agencyName?: string;
  agencyCountry?: string;
  agencyUrl?: string;
}

const CONTACT_TYPES = [
  { value: 'CLUB', labelKey: 'contact_type_club' },
  { value: 'AGENCY', labelKey: 'contact_type_agency' },
];

const ROLES = [
  { value: 'COACH', labelKey: 'contact_role_coach' },
  { value: 'ASSISTANT_COACH', labelKey: 'contact_role_asst_coach' },
  { value: 'SPORT_DIRECTOR', labelKey: 'contact_role_sport_dir' },
  { value: 'CEO', labelKey: 'contact_role_ceo' },
  { value: 'BOARD_MEMBER', labelKey: 'contact_role_board' },
  { value: 'PRESIDENT', labelKey: 'contact_role_president' },
  { value: 'SCOUT', labelKey: 'contact_role_scout' },
  { value: 'AGENT', labelKey: 'contact_role_agent' },
  { value: 'INTERMEDIARY', labelKey: 'contact_role_intermediary' },
  { value: 'AGENCY_DIRECTOR', labelKey: 'contact_role_agency_dir' },
  { value: 'UNKNOWN', labelKey: 'contact_role_other' },
];

interface AddContactSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  contactsCollection: string;
  isWomen?: boolean;
  isYouth?: boolean;
  /** When set, sheet opens in edit mode */
  initialContact?: Contact | null;
}

export default function AddContactSheet({
  open,
  onClose,
  onSaved,
  contactsCollection,
  isWomen = false,
  isYouth = false,
  initialContact = null,
}: AddContactSheetProps) {
  const { t, isRtl } = useLanguage();
  const focusBorder = isYouth ? 'focus:border-[var(--youth-cyan)]' : isWomen ? 'focus:border-[var(--women-rose)]' : 'focus:border-mgsr-teal';
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [contactType, setContactType] = useState<'CLUB' | 'AGENCY'>('CLUB');
  const [role, setRole] = useState('UNKNOWN');
  const [clubName, setClubName] = useState('');
  const [clubCountry, setClubCountry] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [agencyCountry, setAgencyCountry] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initialContact?.id;

  const reset = () => {
    setName('');
    setPhoneNumber('');
    setContactType('CLUB');
    setRole('UNKNOWN');
    setClubName('');
    setClubCountry('');
    setAgencyName('');
    setAgencyCountry('');
    setError(null);
  };

  useEffect(() => {
    if (open && initialContact) {
      setName(initialContact.name ?? '');
      setPhoneNumber(initialContact.phoneNumber ?? '');
      setContactType((initialContact.contactType as 'CLUB' | 'AGENCY') || 'CLUB');
      setRole(initialContact.role ?? 'UNKNOWN');
      setClubName(initialContact.clubName ?? '');
      setClubCountry(initialContact.clubCountry ?? '');
      setAgencyName(initialContact.agencyName ?? '');
      setAgencyCountry(initialContact.agencyCountry ?? '');
    } else if (open && !initialContact) {
      reset();
    }
  }, [open, initialContact]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('contacts_add_name_required'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const data: Record<string, string> = {
        name: trimmedName,
        phoneNumber: phoneNumber.trim() || '',
        role: role || 'UNKNOWN',
        contactType,
        clubName: contactType === 'CLUB' ? clubName.trim() : '',
        clubCountry: contactType === 'CLUB' ? clubCountry.trim() : '',
        clubLogo: initialContact?.clubLogo ?? '',
        clubCountryFlag: initialContact?.clubCountryFlag ?? '',
        clubTmProfile: initialContact?.clubTmProfile ?? '',
        agencyName: contactType === 'AGENCY' ? agencyName.trim() : '',
        agencyCountry: contactType === 'AGENCY' ? agencyCountry.trim() : '',
        agencyUrl: initialContact?.agencyUrl ?? '',
      };
      if (isEdit && initialContact?.id) {
        await updateDoc(doc(db, contactsCollection, initialContact.id), data);
      } else {
        await addDoc(collection(db, contactsCollection), data);
      }
      onSaved();
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
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
          <h2 className="text-lg font-display font-bold text-mgsr-text">{isEdit ? t('contacts_edit_title') : t('contacts_add_title')}</h2>
          <button type="button" onClick={handleClose} className="p-2 -m-2 text-mgsr-muted hover:text-mgsr-text">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          <div>
            <label className="block text-sm text-mgsr-muted mb-1">{t('contacts_add_name')} *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('contacts_add_name_placeholder')}
              className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none ${focusBorder}`}
            />
          </div>

          <div>
            <label className="block text-sm text-mgsr-muted mb-1">{t('contacts_add_phone')}</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={t('contacts_add_phone_placeholder')}
              className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none ${focusBorder}`}
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm text-mgsr-muted mb-1">{t('contacts_add_type')}</label>
            <div className="flex gap-2">
              {(isYouth ? CONTACT_TYPES.filter(ct => ct.value === 'CLUB') : CONTACT_TYPES).map(({ value, labelKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setContactType(value as 'CLUB' | 'AGENCY')}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                    contactType === value
                      ? isYouth
                        ? 'bg-[var(--youth-cyan)]/20 border-[var(--youth-cyan)] text-[var(--youth-cyan)]'
                        : isWomen
                          ? 'bg-[var(--women-rose)]/20 border-[var(--women-rose)] text-[var(--women-rose)]'
                          : 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal'
                      : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted'
                  }`}
                >
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>

          {contactType === 'CLUB' && (
            <>
              <div>
                <label className="block text-sm text-mgsr-muted mb-1">{t('contacts_add_club_name')}</label>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder={t('contacts_add_club_name_placeholder')}
                  className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none ${focusBorder}`}
                />
              </div>
              <div>
                <label className="block text-sm text-mgsr-muted mb-1">{t('contacts_add_club_country')}</label>
                <input
                  type="text"
                  value={clubCountry}
                  onChange={(e) => setClubCountry(e.target.value)}
                  placeholder={t('contacts_add_club_country_placeholder')}
                  className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none ${focusBorder}`}
                />
              </div>
            </>
          )}

          {contactType === 'AGENCY' && (
            <>
              <div>
                <label className="block text-sm text-mgsr-muted mb-1">{t('contacts_add_agency_name')}</label>
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder={t('contacts_add_agency_name_placeholder')}
                  className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none ${focusBorder}`}
                />
              </div>
              <div>
                <label className="block text-sm text-mgsr-muted mb-1">{t('contacts_add_agency_country')}</label>
                <input
                  type="text"
                  value={agencyCountry}
                  onChange={(e) => setAgencyCountry(e.target.value)}
                  placeholder={t('contacts_add_agency_country_placeholder')}
                  className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none ${focusBorder}`}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-mgsr-muted mb-1">{t('contacts_add_role')}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={`w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none ${focusBorder}`}
            >
              {ROLES.map(({ value: v, labelKey }) => (
                <option key={v} value={v}>
                  {t(labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-4 border-t border-mgsr-border shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
              isYouth
                ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.2)] hover:opacity-90'
                : isWomen
                  ? 'bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)] hover:opacity-90'
                  : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'
            }`}
          >
            {saving ? '…' : (isEdit ? t('contacts_edit_save') : t('contacts_add_save'))}
          </button>
        </div>
      </div>
    </div>
  );
}
