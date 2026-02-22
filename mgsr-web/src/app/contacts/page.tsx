'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
    const list = grouped[country].sort((a, b) =>
      (a.contactType === 'AGENCY' ? a.agencyName : a.clubName || '').localeCompare(
        b.contactType === 'AGENCY' ? b.agencyName : b.clubName || '',
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
  const router = useRouter();
  const cached = getScreenCache<ContactsCache>('contacts');
  const [contacts, setContacts] = useState<Contact[]>(cached?.contacts ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [filter, setFilter] = useState<'all' | 'club' | 'agency'>(cached?.filter ?? 'all');
  const [search, setSearch] = useState(cached?.search ?? '');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const q = collection(db, 'Contacts');
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Contact));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setContacts(list);
      setLoadingList(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setScreenCache<ContactsCache>('contacts', { contacts, filter, search });
  }, [contacts, filter, search]);

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

  const groupedByCountry = useMemo(
    () => buildContactsGroupedByCountry(filtered, isRtl),
    [filtered, isRtl]
  );

  const clubsCount = contacts.filter((c) => c.contactType === 'CLUB').length;
  const agenciesCount = contacts.filter((c) => c.contactType === 'AGENCY').length;

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight">
            {t('contacts_title')}
          </h1>
          <p className="text-mgsr-muted mt-1 text-sm">
            {contacts.length} {t('contacts')} • {clubsCount} {t('contacts_clubs')} • {agenciesCount} {t('contacts_agencies')}
          </p>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex gap-2">
            {(['all', 'club', 'agency'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                  filter === f
                    ? 'bg-mgsr-teal text-mgsr-dark'
                    : 'bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-mgsr-text hover:border-mgsr-teal/30'
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
            className="flex-1 max-w-md px-4 py-2.5 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60"
          />
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-mgsr-muted">{t('contacts_loading')}</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg relative">{t('contacts_empty')}</p>
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
                      className="group flex items-start gap-4 p-4 bg-mgsr-card border border-mgsr-border rounded-xl hover:border-mgsr-teal/30 transition-all duration-300 animate-fade-in"
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
                          <div className="w-14 h-14 rounded-full bg-mgsr-teal/20 flex items-center justify-center">
                            <span className="text-xl font-display font-bold text-mgsr-teal">
                              {(c.name || c.clubName || '?')[0]}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-mgsr-text truncate">{c.name || 'Unknown'}</p>
                        <p className="text-sm text-mgsr-muted truncate">
                          {displayOrg(c) || '—'}
                        </p>
                        {c.phoneNumber && (
                          <a
                            href={toWhatsAppUrl(c.phoneNumber) ?? `tel:${c.phoneNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-2 text-sm text-mgsr-teal hover:underline"
                            dir="ltr"
                          >
                            {c.phoneNumber}
                          </a>
                        )}
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-mgsr-teal/20 text-mgsr-teal shrink-0">
                        {c.contactType === 'AGENCY' ? t('contact_type_agency') : t('contact_type_club')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
