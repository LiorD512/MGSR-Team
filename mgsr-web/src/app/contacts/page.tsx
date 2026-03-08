'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { collection, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import AddContactSheet, { type Contact as AddContactSheetContact } from './AddContactSheet';
import { db } from '@/lib/firebase';
import { CONTACTS_COLLECTIONS } from '@/lib/platformCollections';
import AppLayout from '@/components/AppLayout';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { toWhatsAppUrl } from '@/lib/whatsapp';

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

interface ContactsCache {
  contacts: Contact[];
  filter: 'all' | 'club' | 'agency';
  search: string;
}

const OTHER_LABEL = 'Other';

function buildContactsGroupedByCountry(
  contacts: Contact[],
  isRtl: boolean
): { country: string; flagUrl?: string; contacts: Contact[] }[] {
  const grouped = contacts.reduce<Record<string, Contact[]>>((acc, c) => {
    const country = (c.contactType === 'AGENCY' ? c.agencyCountry : c.clubCountry)?.trim() || OTHER_LABEL;
    if (!acc[country]) acc[country] = [];
    acc[country].push(c);
    return acc;
  }, {});
  const sortedCountries = Object.keys(grouped).sort((a, b) =>
    a === OTHER_LABEL ? 1 : b === OTHER_LABEL ? -1 : a.localeCompare(b, isRtl ? 'he' : 'en')
  );
  return sortedCountries.map((country) => {
    const list = (grouped[country] ?? []).sort((a, b) =>
      (a.contactType === 'AGENCY' ? (a.agencyName ?? '') : (a.clubName ?? '')).localeCompare(
        b.contactType === 'AGENCY' ? (b.agencyName ?? '') : (b.clubName ?? ''),
        isRtl ? 'he' : 'en'
      )
    );
    const flagUrl = list.find((c) => c.clubCountryFlag?.startsWith('http'))?.clubCountryFlag;
    return {
      country: country === OTHER_LABEL ? (isRtl ? 'אחר' : OTHER_LABEL) : getCountryDisplayName(country, isRtl),
      flagUrl,
      contacts: list,
    };
  });
}

export default function ContactsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const { platform } = usePlatform();
  const router = useRouter();
  const contactsCollection = CONTACTS_COLLECTIONS[platform];
  const cacheKey = `contacts_${platform}`;
  const isWomen = platform === 'women';
  const isYouth = platform === 'youth';
  const cached = getScreenCache<ContactsCache>(cacheKey);
  const [contacts, setContacts] = useState<Contact[]>(cached?.contacts ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [filter, setFilter] = useState<'all' | 'club' | 'agency'>(isYouth ? 'club' : cached?.filter ?? 'all');
  const [search, setSearch] = useState(cached?.search ?? '');
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const q = collection(db, contactsCollection);
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Contact));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setContacts(list);
        setLoadingList(false);
      },
      (err) => {
        console.error('Contacts snapshot error:', err);
        setLoadingList(false);
      }
    );
    return () => unsub();
  }, [contactsCollection]);

  useEffect(() => {
    setScreenCache<ContactsCache>(cacheKey, { contacts, filter, search });
  }, [contacts, filter, search, cacheKey]);

  const filtered = useMemo(() => {
    let list = contacts;
    if (filter === 'club') list = list.filter((c) => c.contactType === 'CLUB');
    if (filter === 'agency') list = list.filter((c) => c.contactType === 'AGENCY');
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name?.toLowerCase().includes(q) ||
          c.clubName?.toLowerCase().includes(q) ||
          c.agencyName?.toLowerCase().includes(q) ||
          c.phoneNumber?.includes(search)
      );
    }
    return list;
  }, [contacts, filter, search]);

  const displayOrg = (c: Contact) =>
    c.contactType === 'AGENCY' ? c.agencyName : c.clubName;

  const getRoleDisplayLabel = (role: string | undefined): string | null => {
    if (!role?.trim()) return null;
    const normalized = role.trim().toUpperCase().replace(/\s+/g, '_');
    const keyMap: Record<string, string> = {
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
    const key = keyMap[normalized];
    return key ? t(key) : null;
  };

  const getContactRoleOrType = (c: Contact): string => {
    const roleLabel = getRoleDisplayLabel(c.role);
    if (roleLabel) return roleLabel;
    return c.contactType === 'AGENCY' ? t('contact_type_agency') : t('contact_type_club');
  };

  const groupedByCountry = useMemo(
    () => buildContactsGroupedByCountry(filtered, isRtl),
    [filtered, isRtl]
  );

  const clubsCount = contacts.filter((c) => c.contactType === 'CLUB').length;
  const agenciesCount = contacts.filter((c) => c.contactType === 'AGENCY').length;

  const handleDelete = async () => {
    const c = deleteConfirm;
    if (!c?.id) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, contactsCollection, c.id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Delete contact failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className={`animate-pulse font-display ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {isWomen ? t('contacts_title_women') : t('contacts_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">
              {contacts.length} {t('contacts')} • {clubsCount} {t('contacts_clubs')}{!isYouth ? ` • ${agenciesCount} ${t('contacts_agencies')}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddSheet(true)}
            className={`shrink-0 px-5 py-2.5 rounded-xl font-semibold transition ${
              isYouth
                ? 'bg-gradient-to-r from-[var(--youth-cyan)] to-[var(--youth-violet)] text-white shadow-[0_0_20px_rgba(0,212,255,0.2)] hover:opacity-90'
                : isWomen
                  ? 'bg-[var(--women-gradient)] text-white shadow-[var(--women-glow)] hover:opacity-90'
                  : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'
            }`}
          >
            {t('contacts_add')}
          </button>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex gap-2">
            {(isYouth ? ['all', 'club'] as const : ['all', 'club', 'agency'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  filter === f
                    ? isYouth
                      ? 'bg-[var(--youth-cyan)] text-mgsr-dark'
                      : isWomen
                        ? 'bg-[var(--women-rose)] text-mgsr-dark'
                        : 'bg-mgsr-teal text-mgsr-dark'
                    : `bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text ${isYouth ? 'hover:border-[var(--youth-cyan)]/30' : isWomen ? 'hover:border-[var(--women-rose)]/30' : 'hover:border-mgsr-teal/30'}`
                }`}
              >
                {f === 'all' ? t('contacts_all') : f === 'club' ? t('contacts_clubs') : t('contacts_agencies')}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className={`flex-1 max-w-md px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none ${isYouth ? 'focus:border-[var(--youth-cyan)]/50' : isWomen ? 'focus:border-[var(--women-rose)]/50' : 'focus:border-mgsr-teal/60'}`}
          />
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <div className={`flex items-center gap-3 ${isYouth ? 'text-[var(--youth-cyan)]/70' : isWomen ? 'text-[var(--women-rose)]/70' : 'text-mgsr-muted'}`}>
              <div className={`w-3 h-3 rounded-full animate-pulse ${isYouth ? 'bg-[var(--youth-cyan)]/50' : isWomen ? 'bg-[var(--women-rose)]/50' : 'bg-mgsr-teal/50'}`} />
              {isWomen ? t('contacts_loading_women') : t('contacts_loading')}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className={`relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center ${isYouth ? 'shadow-[0_0_30px_rgba(0,212,255,0.06)]' : isWomen ? 'shadow-[0_0_30px_rgba(232,160,191,0.06)]' : ''}`}>
            <div className={`absolute inset-0 ${isYouth ? 'bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.08)_0%,transparent_70%)]' : isWomen ? 'bg-[radial-gradient(ellipse_at_center,rgba(232,160,191,0.08)_0%,transparent_70%)]' : 'bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]'}`} />
            <p className="text-mgsr-muted text-lg relative">{isWomen ? t('contacts_empty_women') : t('contacts_empty')}</p>
            <button
              type="button"
              onClick={() => setShowAddSheet(true)}
              className={`relative mt-6 px-6 py-3 rounded-xl font-semibold transition ${
                isYouth
                  ? 'bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] hover:bg-[var(--youth-cyan)]/30'
                  : isWomen
                    ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30'
                    : 'bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30'
              }`}
            >
              {t('contacts_add')}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedByCountry.map((group) => (
              <div key={group.country}>
                <div className="flex items-center gap-2 mb-3">
                  {group.flagUrl && (
                    <img
                      src={group.flagUrl}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  )}
                  <h2 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider">
                    {group.country}
                  </h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.contacts.map((c, i) => (
                    <div
                      key={c.id}
                      className={`group flex items-start gap-4 p-4 bg-mgsr-card border border-mgsr-border rounded-xl transition-all duration-300 animate-fade-in ${isYouth ? 'hover:border-[var(--youth-cyan)]/30' : isWomen ? 'hover:border-[var(--women-rose)]/30' : 'hover:border-mgsr-teal/30'}`}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <div className="shrink-0">
                        {c.clubLogo ? (
                          <img
                            src={c.clubLogo}
                            alt=""
                            className="w-14 h-14 rounded-full object-cover bg-mgsr-dark ring-2 ring-mgsr-border"
                          />
                        ) : (
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isYouth ? 'bg-[var(--youth-cyan)]/20' : isWomen ? 'bg-[var(--women-rose)]/20' : 'bg-mgsr-teal/20'}`}>
                            <span className={`text-xl font-display font-bold ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                              {(c.name || c.clubName || '?')[0]}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 gap-y-1">
                          <p className="font-semibold text-mgsr-text truncate">{c.name || 'Unknown'}</p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-md shrink-0 ${
                              c.contactType === 'AGENCY'
                                ? 'bg-blue-500/20 text-blue-400'
                                : isYouth
                                  ? 'bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)]'
                                  : isWomen
                                    ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)]'
                                    : 'bg-mgsr-teal/20 text-mgsr-teal'
                            }`}
                          >
                            {getContactRoleOrType(c)}
                          </span>
                        </div>
                        <p className="text-sm text-mgsr-muted truncate mt-0.5">
                          {displayOrg(c) || '—'}
                        </p>
                        {c.phoneNumber && (
                          <a
                            href={toWhatsAppUrl(c.phoneNumber) ?? `tel:${c.phoneNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-block mt-2 text-sm hover:underline ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}
                            dir="ltr"
                          >
                            {c.phoneNumber}
                          </a>
                        )}
                        <div className="flex gap-2 mt-3">
                          <button
                            type="button"
                            onClick={() => setEditContact(c)}
                            className={`text-xs font-medium px-2.5 py-1 rounded-lg transition ${
                              isYouth
                                ? 'text-[var(--youth-cyan)] hover:bg-[var(--youth-cyan)]/20'
                                : isWomen
                                  ? 'text-[var(--women-rose)] hover:bg-[var(--women-rose)]/20'
                                  : 'text-mgsr-teal hover:bg-mgsr-teal/20'
                            }`}
                          >
                            {t('contacts_edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(c)}
                            className="text-xs font-medium px-2.5 py-1 rounded-lg text-mgsr-red hover:bg-mgsr-red/20 transition"
                          >
                            {t('contacts_delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddContactSheet
        open={showAddSheet || !!editContact}
        onClose={() => {
          setShowAddSheet(false);
          setEditContact(null);
        }}
        onSaved={() => {
          setShowAddSheet(false);
          setEditContact(null);
        }}
        contactsCollection={contactsCollection}
        isWomen={isWomen}
        isYouth={isYouth}
        initialContact={editContact as AddContactSheetContact | null}
      />

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !deleting && setDeleteConfirm(null)}
        >
          <div
            className="bg-mgsr-card border border-mgsr-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-mgsr-text font-medium mb-4">
              {t('contacts_delete_confirm').replace('{name}', deleteConfirm.name || '—')}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-mgsr-dark/50"
              >
                {t('tasks_cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={`px-4 py-2 rounded-xl font-semibold disabled:opacity-50 ${
                  isYouth
                    ? 'bg-mgsr-red/20 text-mgsr-red hover:bg-mgsr-red/30'
                    : isWomen
                      ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30'
                      : 'bg-mgsr-red/20 text-mgsr-red hover:bg-mgsr-red/30'
                }`}
              >
                {deleting ? '…' : t('contacts_delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
