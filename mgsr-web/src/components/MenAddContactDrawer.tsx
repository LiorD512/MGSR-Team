'use client';

/**
 * Men platform "Add contact" — guided drawer.
 *
 * Same drawer + guided-accordion pattern as the other add drawers, for the
 * contacts CRM: Type (Club/Agency) → Organisation (name, country, role) →
 * Person (name, phone) → Done. Saves via callContactsCreate. Men only —
 * women/youth and men-edit keep AddContactSheet.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { callContactsCreate } from '@/lib/callables';

type Step = 1 | 2 | 3 | 4;
type ContactType = 'CLUB' | 'AGENCY';

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

interface MenAddContactDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function MenAddContactDrawer({ open, onClose, onSaved }: MenAddContactDrawerProps) {
  const { t, isRtl } = useLanguage();

  const [step, setStep] = useState<Step>(1);
  const [contactType, setContactType] = useState<ContactType>('CLUB');
  const [orgName, setOrgName] = useState('');
  const [orgCountry, setOrgCountry] = useState('');
  const [role, setRole] = useState('UNKNOWN');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const resetAll = useCallback(() => {
    setStep(1);
    setContactType('CLUB');
    setOrgName('');
    setOrgCountry('');
    setRole('UNKNOWN');
    setName('');
    setPhone('');
    setSaving(false);
    setError('');
  }, []);

  useEffect(() => { if (open) resetAll(); }, [open, resetAll]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError(t('contacts_add_name_required')); return; }
    setSaving(true);
    setError('');
    try {
      await callContactsCreate({
        platform: 'men',
        name: trimmedName,
        phoneNumber: phone.trim() || '',
        role: role || 'UNKNOWN',
        contactType,
        clubName: contactType === 'CLUB' ? orgName.trim() : '',
        clubCountry: contactType === 'CLUB' ? orgCountry.trim() : '',
        clubLogo: '',
        clubCountryFlag: '',
        clubTmProfile: '',
        agencyName: contactType === 'AGENCY' ? orgName.trim() : '',
        agencyCountry: contactType === 'AGENCY' ? orgCountry.trim() : '',
        agencyUrl: '',
      });
      onSaved?.();
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const goStep = (s: Step) => {
    if (s === 1) setStep(1);
    else if (s === 2) setStep(2);
    else if (s === 3 && step >= 3) setStep(3);
  };
  const stepClass = (s: Step) => (step === s ? 'open' : step > s ? 'done' : 'locked');

  const roleLabel = (v: string) => t(ROLES.find((r) => r.value === v)?.labelKey || 'contact_role_other');
  const typeLabel = contactType === 'AGENCY' ? t('contact_type_agency') : t('contact_type_club');

  const s1Summary = step > 1 ? typeLabel : t('add_contact_room_type_sum');
  const s2Summary = step > 2
    ? `${orgName.trim() || (isRtl ? 'ללא ארגון' : 'No organisation')}${role !== 'UNKNOWN' ? ` · ${roleLabel(role)}` : ''}`
    : t('add_contact_room_org_sum');

  return (
    <>
      <div className={`brit-scrim${open ? ' open' : ''}`} onClick={onClose} aria-hidden={!open} />
      <aside className={`brit-drawer brit-add-drawer${open ? ' open' : ''}`} dir={isRtl ? 'rtl' : 'ltr'} aria-label={t('contacts_add_title')}>
        <div className="brit-add-head">
          <button className="close" onClick={onClose} aria-label={t('room_close')}>×</button>
          <div className="eyebrow">{t('add_contact_room_eyebrow')}</div>
          <h2>{t('add_contact_room_title')}</h2>
          <div className="brit-add-prog">
            <i className={step >= 1 ? 'on' : ''} />
            <i className={step >= 2 ? 'on' : ''} />
            <i className={step >= 3 ? 'on' : ''} />
          </div>
        </div>

        <div className="brit-add-body">
          {/* STEP 1 — TYPE */}
          <div className={`brit-add-step ${stepClass(1)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(1)} type="button">
              <span className="n">{step > 1 ? '' : '1'}</span>
              <div className="t"><b>{t('add_contact_room_type_title')}</b><small>{s1Summary}</small></div>
              {step > 1 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              <p className="brit-add-seclabel">{t('contacts_add_type')}</p>
              <div className="brit-acon-typetoggle">
                <button type="button" className={contactType === 'CLUB' ? 'on' : ''} onClick={() => setContactType('CLUB')}>
                  <svg className="ic" viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01" /></svg>
                  {t('contact_type_club')}
                </button>
                <button type="button" className={contactType === 'AGENCY' ? 'on' : ''} onClick={() => setContactType('AGENCY')}>
                  <svg className="ic" viewBox="0 0 24 24"><path d="M3 21h18M6 21V4h12v17M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-4h4v4" /></svg>
                  {t('contact_type_agency')}
                </button>
              </div>
              <div className="brit-add-stepcta" style={{ marginTop: 16 }}>
                <button className="btn" type="button" onClick={() => setStep(2)}>{t('requests_next')}</button>
              </div>
            </div></div>
          </div>

          {/* STEP 2 — ORGANISATION */}
          <div className={`brit-add-step ${stepClass(2)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(2)} type="button">
              <span className="n">{step > 2 ? '' : '2'}</span>
              <div className="t"><b>{t('add_contact_room_org_title')}</b><small>{s2Summary}</small></div>
              {step > 2 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              <div className="brit-add-field" style={{ marginTop: 0 }}>
                <label>{contactType === 'AGENCY' ? t('contacts_add_agency_name') : t('contacts_add_club_name')}</label>
                <input value={orgName} onChange={(e) => setOrgName(e.target.value)}
                  placeholder={contactType === 'AGENCY' ? t('contacts_add_agency_name_placeholder') : t('contacts_add_club_name_placeholder')} />
              </div>
              <div className="brit-add-field">
                <label>{contactType === 'AGENCY' ? t('contacts_add_agency_country') : t('contacts_add_club_country')}</label>
                <input value={orgCountry} onChange={(e) => setOrgCountry(e.target.value)}
                  placeholder={contactType === 'AGENCY' ? t('contacts_add_agency_country_placeholder') : t('contacts_add_club_country_placeholder')} />
              </div>
              <div className="brit-areq-block" style={{ marginTop: 16, marginBottom: 0 }}>
                <label>{t('contacts_add_role')}</label>
                <div className="brit-acon-rolechips">
                  {ROLES.map((r) => (
                    <button key={r.value} type="button" className={role === r.value ? 'on' : ''} onClick={() => setRole(r.value)}>{t(r.labelKey)}</button>
                  ))}
                </div>
              </div>
              <div className="brit-add-stepcta" style={{ marginTop: 16 }}>
                <button className="btn ghost" type="button" onClick={() => setStep(1)}>{t('add_player_room_change')}</button>
                <button className="btn" type="button" onClick={() => setStep(3)}>{t('requests_next')}</button>
              </div>
            </div></div>
          </div>

          {/* STEP 3 — PERSON */}
          <div className={`brit-add-step ${stepClass(3)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(3)} type="button">
              <span className="n">{step > 3 ? '' : '3'}</span>
              <div className="t"><b>{t('add_contact_room_person_title')}</b><small>{t('add_contact_room_person_sum')}</small></div>
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              <div className="brit-add-field" style={{ marginTop: 0 }}>
                <label>{t('contacts_add_name')} *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('contacts_add_name_placeholder')} />
              </div>
              <div className="brit-add-field">
                <label>{t('contacts_add_phone')}</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('contacts_add_phone_placeholder')} />
              </div>
              {error && <div className="brit-add-steperr">{error}</div>}
              <div className="brit-add-stepcta" style={{ marginTop: 14 }}>
                <button className="btn ghost" type="button" onClick={() => setStep(2)}>{t('add_player_room_change')}</button>
                <button className="btn" type="button" disabled={saving || !name.trim()} onClick={handleSave}>
                  {saving ? t('add_player_saving') : t('contacts_add_save')}
                </button>
              </div>
            </div></div>
          </div>

          {/* STEP 4 — DONE */}
          <div className={`brit-add-step ${stepClass(4)}`}>
            <button className="brit-add-stephead" type="button" style={{ cursor: 'default' }}>
              <span className="n">✓</span>
              <div className="t"><b>{t('add_contact_room_done_title')}</b><small>{t('add_contact_room_done_sum')}</small></div>
            </button>
            <div className="brit-add-stepbody"><div className="brit-add-stepinner">
              <div className="brit-add-done">
                <div className="seal"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></div>
                <h3>{t('add_contact_room_done_head')}</h3>
                <p>{t('add_contact_room_done_body').replace('{name}', name.trim())}</p>
                <div className="cta">
                  <button className="btn g" type="button" onClick={resetAll}>{t('add_contact_room_add_another')}</button>
                  <button className="btn p" type="button" onClick={onClose}>{t('add_contact_room_view_directory')}</button>
                </div>
              </div>
            </div></div>
          </div>
        </div>
      </aside>
    </>
  );
}
