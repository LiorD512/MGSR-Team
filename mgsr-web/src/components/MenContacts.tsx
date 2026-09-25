'use client';

/**
 * Men platform Contacts — "Light Management Room" redesign.
 *
 * Self-contained full-bleed light layout (shared BritRail + .brit-room), men only.
 * Owns its Firestore subscription and reproduces the real filters / actions.
 * Women & youth keep the standard contacts screen. Add/Edit reuse the existing
 * platform-aware AddContactSheet; Delete uses callContactsDelete.
 *
 * Two views: Directory (cards grouped by country) and Ledger (compact table).
 */

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { CONTACTS_COLLECTIONS } from '@/lib/platformCollections';
import { callContactsDelete } from '@/lib/callables';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import BritRail from '@/components/BritRail';
import AddContactSheet, { type Contact as AddContactSheetContact } from '@/app/contacts/AddContactSheet';
import MenAddContactDrawer from '@/components/MenAddContactDrawer';

interface Contact {
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

const OTHER_LABEL = 'Other';

/** Roles considered "key decision makers" → gold chip. */
const KEY_ROLES = new Set([
  'SPORT_DIRECTOR',
  'CEO',
  'PRESIDENT',
  'BOARD_MEMBER',
  'AGENCY_DIRECTOR',
]);

const ROLE_KEY_MAP: Record<string, string> = {
  UNKNOWN: 'contact_role_other',
  COACH: 'contact_role_coach',
  ASSISTANT_COACH: 'contact_role_asst_coach',
  SPORT_DIRECTOR: 'contact_role_sport_dir',
  CEO: 'contact_role_ceo',
  BOARD_MEMBER: 'contact_role_board',
  PRESIDENT: 'contact_role_president',
  SCOUT: 'contact_role_scout',
  AGENT: 'contact_role_agent',
  INTERMEDIARY: 'contact_role_intermediary',
  AGENCY_DIRECTOR: 'contact_role_agency_dir',
};

const normalizeRole = (role?: string) => (role ?? '').trim().toUpperCase().replace(/\s+/g, '_');

/**
 * International dialing code → English country name (matching the strings stored
 * in clubCountry/agencyCountry and understood by getCountryDisplayName).
 * Longest-prefix match wins so overlapping codes (e.g. +1 vs +1-xxx, +97 vs +972)
 * resolve to the most specific country. Only the markets BRIT operates in plus
 * common football territories are covered; unknown codes fall back to "Other".
 */
const DIALING_CODES: Record<string, string> = {
  '972': 'Israel',
  '966': 'Saudi Arabia',
  '971': 'United Arab Emirates',
  '974': 'Qatar',
  '965': 'Kuwait',
  '973': 'Bahrain',
  '968': 'Oman',
  '31': 'Netherlands',
  '32': 'Belgium',
  '351': 'Portugal',
  '34': 'Spain',
  '39': 'Italy',
  '33': 'France',
  '49': 'Germany',
  '44': 'United Kingdom',
  '353': 'Ireland',
  '41': 'Switzerland',
  '43': 'Austria',
  '30': 'Greece',
  '90': 'Turkey',
  '380': 'Ukraine',
  '48': 'Poland',
  '385': 'Croatia',
  '381': 'Serbia',
  '386': 'Slovenia',
  '420': 'Czech Republic',
  '421': 'Slovakia',
  '36': 'Hungary',
  '40': 'Romania',
  '359': 'Bulgaria',
  '46': 'Sweden',
  '47': 'Norway',
  '45': 'Denmark',
  '358': 'Finland',
  '55': 'Brazil',
  '54': 'Argentina',
  '57': 'Colombia',
  '52': 'Mexico',
  '1': 'United States',
  '20': 'Egypt',
  '212': 'Morocco',
  '216': 'Tunisia',
  '213': 'Algeria',
  '234': 'Nigeria',
  '221': 'Senegal',
  '225': 'Ivory Coast',
  '233': 'Ghana',
  '27': 'South Africa',
  '81': 'Japan',
  '82': 'South Korea',
  '61': 'Australia',
};

// Precompute prefixes sorted longest-first for greedy matching.
const SORTED_DIALING_PREFIXES = Object.keys(DIALING_CODES).sort((a, b) => b.length - a.length);

/** Infer the country from an international phone number's dialing code. */
const countryFromPhone = (phone?: string): string | null => {
  if (!phone) return null;
  // Keep a leading + only if present, then reduce to digits.
  const hasPlus = phone.trim().startsWith('+') || phone.trim().startsWith('00');
  const digits = phone.replace(/[^\d]/g, '').replace(/^00/, '');
  if (!digits) return null;
  // Only trust the dialing code when the number is written in international form.
  if (!hasPlus) return null;
  for (const prefix of SORTED_DIALING_PREFIXES) {
    if (digits.startsWith(prefix)) return DIALING_CODES[prefix]!;
  }
  return null;
};

const orgName = (c: Contact) => (c.contactType === 'AGENCY' ? c.agencyName : c.clubName) || '';

/**
 * Country bucket for grouping. Clubs use their stored country. Agencies use
 * their stored country when present, otherwise the country inferred from the
 * phone number's international dialing code, otherwise "Other".
 */
const countryOf = (c: Contact): string => {
  if (c.contactType === 'AGENCY') {
    const stored = c.agencyCountry?.trim();
    if (stored) return stored;
    return countryFromPhone(c.phoneNumber) || OTHER_LABEL;
  }
  return c.clubCountry?.trim() || OTHER_LABEL;
};

const agencyInitials = (c: Contact) =>
  orgName(c).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '··';

interface ContactsFilterCache {
  search: string;
  typeFilter: 'all' | 'club' | 'agency';
  view: 'cards' | 'table';
}

// WhatsApp glyph (inline, matches the mock)
const WaGlyph = () => (
  <span className="wa">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35z" />
    </svg>
  </span>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M6 6l1 14h10l1-14" />
  </svg>
);

export default function MenContacts() {
  const { t, lang, setLang, isRtl } = useLanguage();
  const platform = 'men';
  const contactsCollection = CONTACTS_COLLECTIONS[platform];

  const cacheKey = 'men-contacts-filters';
  const cached = getScreenCache<ContactsFilterCache>(cacheKey);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState(cached?.search ?? '');
  const [typeFilter, setTypeFilter] = useState<'all' | 'club' | 'agency'>(cached?.typeFilter ?? 'all');
  const [view, setView] = useState<'cards' | 'table'>(cached?.view ?? 'cards');

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, contactsCollection),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setContacts(list);
        setReady(true);
      },
      (err) => { console.error('Contacts snapshot error:', err); setReady(true); }
    );
    return () => unsub();
  }, [contactsCollection]);

  useEffect(() => {
    setScreenCache<ContactsFilterCache>(cacheKey, { search, typeFilter, view });
  }, [search, typeFilter, view]);

  const clubsCount = useMemo(() => contacts.filter((c) => c.contactType === 'CLUB').length, [contacts]);
  const agenciesCount = useMemo(() => contacts.filter((c) => c.contactType === 'AGENCY').length, [contacts]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (typeFilter === 'club') list = list.filter((c) => c.contactType === 'CLUB');
    if (typeFilter === 'agency') list = list.filter((c) => c.contactType === 'AGENCY');
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.clubName?.toLowerCase().includes(q) ||
          c.agencyName?.toLowerCase().includes(q) ||
          c.phoneNumber?.includes(search.trim())
      );
    }
    return list;
  }, [contacts, typeFilter, search]);

  const countriesCount = useMemo(
    () => new Set(filtered.map(countryOf)).size,
    [filtered]
  );

  const grouped = useMemo(() => {
    const acc: Record<string, Contact[]> = {};
    for (const c of filtered) {
      const key = countryOf(c);
      (acc[key] ??= []).push(c);
    }
    const orderedCountries = Object.keys(acc).sort((a, b) =>
      a === OTHER_LABEL ? 1 : b === OTHER_LABEL ? -1 : a.localeCompare(b, isRtl ? 'he' : 'en')
    );
    return orderedCountries.map((country) => {
      const list = (acc[country] ?? []).sort((a, b) =>
        orgName(a).localeCompare(orgName(b), isRtl ? 'he' : 'en')
      );
      const flagUrl = list.find((c) => c.clubCountryFlag?.startsWith('http'))?.clubCountryFlag;
      const rawCode = country === OTHER_LABEL ? '··' : country.slice(0, 2).toUpperCase();
      const label =
        country === OTHER_LABEL
          ? (isRtl ? 'אחר' : OTHER_LABEL)
          : getCountryDisplayName(country, isRtl);
      return { country, label, flagUrl, code: rawCode, contacts: list };
    });
  }, [filtered, isRtl]);

  const roleLabel = (role?: string): string => {
    const norm = normalizeRole(role);
    const key = ROLE_KEY_MAP[norm];
    if (key) return t(key);
    return '';
  };
  const roleOrType = (c: Contact): string => {
    const rl = roleLabel(c.role);
    if (rl) return rl;
    return c.contactType === 'AGENCY' ? t('contact_type_agency') : t('contact_type_club');
  };

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const handleDelete = async (c: Contact) => {
    if (!c.id) return;
    setDeleting(true);
    try {
      await callContactsDelete({ platform, contactId: c.id });
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Delete contact failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const renderCrest = (c: Contact) => {
    if (c.contactType === 'AGENCY') {
      return <div className="brit-ct-crest agency">{agencyInitials(c)}</div>;
    }
    if (c.clubLogo && c.clubLogo.startsWith('http')) {
      return <div className="brit-ct-crest"><img src={c.clubLogo} alt="" /></div>;
    }
    return <div className="brit-ct-crest initial">{(c.name || orgName(c) || '?')[0]}</div>;
  };

  const renderMiniCrest = (c: Contact) => {
    if (c.contactType === 'CLUB' && c.clubLogo && c.clubLogo.startsWith('http')) {
      return <div className="mini"><img src={c.clubLogo} alt="" /></div>;
    }
    return <div className="mini ini">{(c.name || orgName(c) || '?')[0]}</div>;
  };

  /** Agency name links to its Transfermarkt page when an agencyUrl is stored. */
  const agencyTmUrl = (c: Contact): string | null => {
    if (c.contactType !== 'AGENCY') return null;
    const url = c.agencyUrl?.trim();
    return url && url.startsWith('http') ? url : null;
  };

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="contacts"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('contacts_room_network')}
              <strong>{contacts.length}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_contacts')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('contacts_room_kicker')}</p>
                <h1>{t('contacts_room_head_a')} <span>{t('contacts_room_head_b')}</span></h1>
              </div>
              <div className="brit-ct-mast-actions">
                <div className="brit-ct-viewtoggle">
                  <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>{t('contacts_room_view_directory')}</button>
                  <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>{t('contacts_room_view_ledger')}</button>
                </div>
                <button className="primary" onClick={() => setShowAddDrawer(true)}>+ {t('contacts_add')}</button>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals brit-signals-3">
              <div className="brit-signal">
                <label>{t('contacts_room_network')}</label>
                <strong>{String(contacts.length).padStart(2, '0')}</strong>
                <small>{t('contacts_room_network_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('contacts_clubs')}</label>
                <strong>{String(clubsCount).padStart(2, '0')}</strong>
                <small>{t('contacts_room_clubs_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('contacts_agencies')}</label>
                <strong>{String(agenciesCount).padStart(2, '0')}</strong>
                <small>{t('contacts_room_agencies_note')}</small>
              </div>
            </section>

            {/* Filter tray */}
            <section className="brit-tray">
              <label className="brit-search">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('contacts_room_search_placeholder')} />
              </label>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('contacts_room_filter_type')}</span>
                <div className="brit-req-chipset">
                  <button className={typeFilter === 'all' ? 'on' : ''} onClick={() => setTypeFilter('all')}>{t('contacts_all')}</button>
                  <button className={typeFilter === 'club' ? 'on' : ''} onClick={() => setTypeFilter('club')}>{t('contacts_clubs')}</button>
                  <button className={typeFilter === 'agency' ? 'on' : ''} onClick={() => setTypeFilter('agency')}>{t('contacts_agencies')}</button>
                </div>
              </div>
            </section>

            <p className="brit-result-count">
              {t('contacts_room_showing')
                .replace('{n}', String(filtered.length))
                .replace('{total}', String(contacts.length))
                .replace('{markets}', String(countriesCount))}
            </p>

            {!ready ? (
              <div className="brit-ct-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div className="brit-skel-card" key={i}>
                    <div className="body">
                      <div className="brit-skel l1" /><div className="brit-skel l2" /><div className="brit-skel l3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="brit-empty">{contacts.length === 0 ? t('contacts_empty') : t('contacts_room_no_results')}</div>
            ) : view === 'cards' ? (
              /* ── Directory (cards grouped by country) ── */
              <div className="brit-ct-ledger">
                {grouped.map((group) => (
                  <section key={group.country}>
                    <div className="brit-ct-country">
                      {group.flagUrl ? (
                        <img className="brit-ct-flag" src={group.flagUrl} alt="" />
                      ) : (
                        <span className="brit-ct-flag mono">{group.code}</span>
                      )}
                      <h2>{group.label}</h2>
                      <span className="cnt"><b>{group.contacts.length}</b> {t('contacts_room_contacts_lc')}</span>
                    </div>
                    <div className="brit-ct-grid">
                      {group.contacts.map((c) => {
                        const isKey = KEY_ROLES.has(normalizeRole(c.role));
                        const isAgency = c.contactType === 'AGENCY';
                        const waHref = c.phoneNumber ? (toWhatsAppUrl(c.phoneNumber) ?? `tel:${c.phoneNumber}`) : null;
                        return (
                          <article className="brit-ct-card" key={c.id}>
                            <span className={`brit-ct-typetag${isAgency ? ' agency' : ''}`}>
                              {isAgency ? t('contact_type_agency') : t('contact_type_club')}
                            </span>
                            <div className="brit-ct-row1">
                              {renderCrest(c)}
                              <div className="brit-ct-who">
                                <div className="nm" title={c.name || ''}>{c.name || (isRtl ? 'ללא שם' : 'Unknown')}</div>
                                <div className="org" title={orgName(c)}>
                                  {orgName(c) ? (
                                    <>
                                      {isRtl ? 'ב־' : 'at '}
                                      {agencyTmUrl(c) ? (
                                        <a
                                          className="brit-ct-orglink"
                                          href={agencyTmUrl(c)!}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title={isRtl ? 'פתח בטרנספרמרקט' : 'Open on Transfermarkt'}
                                        >
                                          {orgName(c)}
                                        </a>
                                      ) : (
                                        <b>{orgName(c)}</b>
                                      )}
                                    </>
                                  ) : '—'}
                                </div>
                              </div>
                            </div>
                            <div className="brit-ct-rolebar">
                              <span className={`brit-ct-role${isKey ? ' key' : ''}`}>{roleOrType(c)}</span>
                            </div>
                            <div className="brit-ct-row2">
                              {waHref ? (
                                <a className="brit-ct-phone" href={waHref} target="_blank" rel="noopener noreferrer" dir="ltr">
                                  <WaGlyph /><span>{c.phoneNumber}</span>
                                </a>
                              ) : (
                                <div className="brit-ct-phone empty">
                                  <WaGlyph /><span>{isRtl ? 'אין מספר' : 'No number'}</span>
                                </div>
                              )}
                              <div className="brit-ct-ops">
                                <button title={t('contacts_edit')} onClick={() => { setEditContact(c); setShowAddSheet(false); }}><EditIcon /></button>
                                <button className="del" title={t('contacts_delete')} onClick={() => setDeleteConfirm(c)}><DeleteIcon /></button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              /* ── Ledger (table) ── */
              <div className="brit-ct-table">
                <div className="brit-ct-thead">
                  <div>{t('contacts_room_th_name')}</div>
                  <div>{t('contacts_room_th_org')}</div>
                  <div>{t('contacts_room_th_role')}</div>
                  <div className="h-phone">{t('contacts_room_th_phone')}</div>
                  <div />
                </div>
                {filtered.map((c) => {
                  const waHref = c.phoneNumber ? (toWhatsAppUrl(c.phoneNumber) ?? `tel:${c.phoneNumber}`) : null;
                  return (
                    <div className="brit-ct-trow" key={c.id}>
                      <div className="brit-ct-tp-name">
                        {renderMiniCrest(c)}
                        <b title={c.name || ''}>{c.name || (isRtl ? 'ללא שם' : 'Unknown')}</b>
                      </div>
                      <div className="brit-ct-tp-org" title={orgName(c)}>
                        {orgName(c) ? (
                          agencyTmUrl(c) ? (
                            <a
                              className="brit-ct-orglink"
                              href={agencyTmUrl(c)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={isRtl ? 'פתח בטרנספרמרקט' : 'Open on Transfermarkt'}
                            >
                              {orgName(c)}
                            </a>
                          ) : orgName(c)
                        ) : '—'}
                      </div>
                      <div className="brit-ct-tp-role">{roleOrType(c)}</div>
                      {waHref ? (
                        <a className="brit-ct-tp-phone" href={waHref} target="_blank" rel="noopener noreferrer" dir="ltr">{c.phoneNumber}</a>
                      ) : (
                        <div className="brit-ct-tp-phone empty">—</div>
                      )}
                      <div className="brit-ct-tp-ops">
                        <button title={t('contacts_edit')} onClick={() => { setEditContact(c); setShowAddSheet(false); }}><EditIcon /></button>
                        <button className="del" title={t('contacts_delete')} onClick={() => setDeleteConfirm(c)}><DeleteIcon /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Add: guided drawer. Edit: existing sheet (prefilled). */}
      <MenAddContactDrawer open={showAddDrawer} onClose={() => setShowAddDrawer(false)} />
      {/* Edit sheet (reuses the existing platform-aware sheet) */}
      <AddContactSheet
        open={showAddSheet || !!editContact}
        onClose={() => { setShowAddSheet(false); setEditContact(null); }}
        onSaved={() => { setShowAddSheet(false); setEditContact(null); }}
        contactsCollection={contactsCollection}
        platform={platform}
        isWomen={false}
        isYouth={false}
        initialContact={editContact as AddContactSheetContact | null}
      />

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="brit-sl-modal-scrim" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="brit-sl-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="brit-sl-modal-head">
              <h3>{t('contacts_delete')}</h3>
              <button onClick={() => setDeleteConfirm(null)}>×</button>
            </div>
            <p style={{ margin: '0 0 18px', font: '12px/1.5 var(--p-body)' }}>
              {t('contacts_delete_confirm').replace('{name}', deleteConfirm.name || '—')}
            </p>
            <div className="brit-sl-modal-actions">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting}>{t('tasks_cancel')}</button>
              <button className="primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: 'var(--paper)' }} onClick={() => handleDelete(deleteConfirm)} disabled={deleting}>
                {deleting ? '…' : t('contacts_delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
