'use client';

import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import type { ShareData } from './types';

/** Scout report markdown styling — teal/rose section headers */
function getScoutReportComponents(isWomen: boolean) {
  const accent = isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal';
  return {
    h2: ({ children }: { children?: React.ReactNode }) => (
      <h3 className={`text-base font-semibold mt-5 mb-2 first:mt-0 ${accent}`}>{children}</h3>
    ),
    p: ({ children }: { children?: React.ReactNode }) => (
      <p className="text-mgsr-text leading-relaxed mb-3 last:mb-0">{children}</p>
    ),
    ul: ({ children }: { children?: React.ReactNode }) => (
      <ul className="list-disc list-inside space-y-1 mb-3 text-mgsr-text">{children}</ul>
    ),
    li: ({ children }: { children?: React.ReactNode }) => (
      <li className="leading-relaxed">{children}</li>
    ),
    strong: ({ children }: { children?: React.ReactNode }) => (
      <strong className={`font-semibold ${accent}`}>{children}</strong>
    ),
  };
}

function StatCard({ label, value, isWomen }: { label: string; value?: string; isWomen?: boolean }) {
  if (!value) return null;
  return (
    <div className={`px-4 py-3 rounded-xl border bg-mgsr-card/50 ${isWomen ? 'border-[var(--women-rose)]/20 shadow-[0_0_20px_rgba(232,160,191,0.05)]' : 'border-mgsr-border'}`}>
      <p className="text-xs text-mgsr-muted uppercase tracking-wider">{label}</p>
      <p className={`font-semibold mt-0.5 ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-text'}`}>{value}</p>
    </div>
  );
}

export default function SharedPlayerContent({
  token,
  initialData,
  fromPortfolio = false,
}: {
  token: string;
  initialData: ShareData | null;
  fromPortfolio?: boolean;
}) {
  const [data, setData] = useState<ShareData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    getDoc(doc(db, 'SharedPlayers', token))
      .then((snap) => {
        if (snap.exists()) {
          setData(snap.data() as ShareData);
        } else {
          setError('Link expired or not found');
        }
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [token, initialData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
          <div className="animate-pulse text-mgsr-muted">Loading...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex flex-col items-center justify-center p-6">
        <p className="text-mgsr-muted text-lg mb-6">{error}</p>
        <Link href="/" className="text-mgsr-teal hover:underline">
          MGSR Team
        </Link>
      </div>
    );
  }

  const player = data.player;
  const useHebrew = data.lang === 'he';
  const isWomen = data.platform === 'women';

  useEffect(() => {
    document.documentElement.dir = useHebrew ? 'rtl' : 'ltr';
    document.documentElement.lang = useHebrew ? 'he' : 'en';
    document.documentElement.setAttribute('data-platform', isWomen ? 'women' : 'men');
    return () => {
      document.documentElement.dir = 'ltr';
      document.documentElement.lang = 'en';
      document.documentElement.removeAttribute('data-platform');
    };
  }, [useHebrew, isWomen]);

  const displayName =
    useHebrew ? (player.fullNameHe || player.fullName) : (player.fullName || player.fullNameHe) || '—';
  const labels = useHebrew
    ? {
        mandate: 'מנדט',
        age: 'גיל',
        height: 'גובה',
        nationality: 'לאום',
        contract: 'חוזה',
        scoutReport: 'דוח סקאוט',
        highlights: 'היילייטס',
        contact: 'איש קשר',
        contactNote: 'המספר שיוצג בשיתוף הוא מספר הטלפון של הסוכן ששיתף את המסמך.',
        playerContact: isWomen ? 'יצירת קשר עם השחקנית' : 'יצירת קשר עם השחקן',
        agencyContact: 'יצירת קשר עם הסוכנות',
        addToContacts: 'הוסף לרשימת אנשי קשר',
        openWhatsApp: 'פתח WhatsApp',
        transfermarkt: 'פרופיל Transfermarkt',
        sharedVia: isWomen ? 'שותף דרך MGSR Women' : 'שותף דרך MGSR Team',
        viewMandate: 'צפה במנדט',
        marketValue: 'שווי שוק',
      }
    : {
        mandate: 'Mandate',
        age: 'Age',
        height: 'Height',
        nationality: 'Nationality',
        contract: 'Contract',
        scoutReport: 'Scout Report',
        highlights: 'Highlights',
        contact: 'Contact',
        contactNote: 'The phone number shown when sharing is the phone number of the agent who shared the document.',
        playerContact: isWomen ? 'Athlete contact' : 'Player contact',
        agencyContact: 'Agency contact',
        addToContacts: 'Add to contacts',
        openWhatsApp: 'Open WhatsApp',
        transfermarkt: 'Transfermarkt profile',
        sharedVia: isWomen ? 'Shared via MGSR Women' : 'Shared via MGSR Team',
        viewMandate: 'View mandate',
        marketValue: 'Market value',
      };

  const playerPhone = player.playerPhoneNumber;
  const agencyPhone = player.agentPhoneNumber;

  const handleAddToContacts = useCallback((phone: string, name: string) => {
    if (!phone) return;
    // Use form POST to API - iOS Safari doesn't trigger add-to-contacts from
    // programmatic blob download; serving vCard from server works reliably.
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/share/vcard';
    form.target = '_blank';
    form.style.display = 'none';
    const phoneInput = document.createElement('input');
    phoneInput.name = 'phone';
    phoneInput.value = phone;
    const nameInput = document.createElement('input');
    nameInput.name = 'name';
    nameInput.value = name.replace(/[,;\\]/g, ' ');
    form.appendChild(phoneInput);
    form.appendChild(nameInput);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }, []);

  function ContactBlock({ phone, title, contactName }: { phone: string; title: string; contactName: string }) {
    const whatsappUrl = toWhatsAppUrl(phone);
    const btnClass = isWomen
      ? 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--women-rose)]/20 text-[var(--women-rose)] font-medium hover:bg-[var(--women-rose)]/30 transition'
      : 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-mgsr-teal/20 text-mgsr-teal font-medium hover:bg-mgsr-teal/30 transition';
    return (
      <div className={`p-5 rounded-xl bg-mgsr-card border mb-8 ${isWomen ? 'border-[var(--women-rose)]/20 shadow-[0_0_30px_rgba(232,160,191,0.05)]' : 'border-mgsr-border'}`}>
        <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
          {title}
        </h3>
        <p className="text-mgsr-text font-medium mb-3" dir="ltr">
          {phone}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleAddToContacts(phone, contactName)}
            className={btnClass}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            {labels.addToContacts}
          </button>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366]/20 text-[#25D366] font-medium hover:bg-[#25D366]/30 transition"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              {labels.openWhatsApp}
            </a>
          )}
        </div>
      </div>
    );
  }

  const accentLink = isWomen ? 'text-[var(--women-rose)] hover:underline' : 'text-mgsr-teal hover:underline';
  const scoutComponents = getScoutReportComponents(isWomen);

  return (
    <div className="min-h-screen bg-mgsr-dark" dir={useHebrew ? 'rtl' : 'ltr'}>
      <header className={`border-b px-4 py-3 flex items-center justify-between gap-4 ${isWomen ? 'border-[var(--women-rose)]/20 bg-mgsr-card/50' : 'border-mgsr-border bg-mgsr-card/50'}`}>
        <Link
          href={fromPortfolio ? (isWomen ? '/portfolio?platform=women' : '/portfolio') : '/'}
          className={`inline-flex items-center gap-2 ${accentLink}`}
        >
          {fromPortfolio && (
            <svg
              className={`w-5 h-5 shrink-0 ${useHebrew ? 'scale-x-[-1]' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          )}
          <img src="/logo.svg" alt="" className="w-8 h-8" />
          <span className="font-bold font-display">
            {fromPortfolio ? (useHebrew ? 'חזרה לפורטפוליו' : 'Back to Portfolio') : (isWomen ? 'MGSR Women' : 'MGSR Team')}
          </span>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        <div className={`relative overflow-hidden rounded-2xl mb-8 ${isWomen ? 'shadow-[0_0_40px_rgba(232,160,191,0.12)]' : ''}`}>
          <div className={`absolute inset-0 ${isWomen ? 'bg-gradient-to-br from-[var(--women-rose)]/15 via-mgsr-card to-mgsr-dark' : 'bg-gradient-to-br from-mgsr-card via-mgsr-card to-mgsr-dark'}`} />
          <div className={`absolute inset-0 ${isWomen ? 'bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,160,191,0.25)_0%,transparent_50%)]' : 'bg-[radial-gradient(ellipse_at_30%_20%,rgba(77,182,172,0.15)_0%,transparent_50%)]'}`} />
          <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-8 p-8 sm:p-10">
            <div className="relative shrink-0">
              <img
                src={player.profileImage || 'https://via.placeholder.com/160'}
                alt=""
                className={`w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover bg-mgsr-dark ring-4 shadow-2xl ${isWomen ? 'ring-[var(--women-rose)]/30' : 'ring-mgsr-border'}`}
              />
            </div>
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h1 className="text-3xl sm:text-4xl font-display font-bold text-mgsr-text tracking-tight">
                {displayName}
              </h1>
              <p className="text-mgsr-muted mt-2 text-lg">
                {player.positions?.filter(Boolean).join(' • ') || '—'}
              </p>
              <div className="flex flex-col items-center sm:items-start gap-0.5 mt-4">
                {player.currentClub?.clubName && (
                  <span className="text-mgsr-text font-medium">
                    {player.currentClub.clubName}
                  </span>
                )}
                {player.currentClub?.clubCountry && (
                  <span className="text-mgsr-muted text-sm">
                    {player.currentClub.clubCountry}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0">
              <p className={`text-2xl sm:text-3xl font-display font-bold ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                {player.marketValue || '—'}
              </p>
              <p className="text-xs text-mgsr-muted mt-0.5">{labels.marketValue}</p>
            </div>
          </div>
        </div>

        {data.mandateInfo?.hasMandate && (
          <div className={`p-5 rounded-xl bg-mgsr-card border mb-6 ${isWomen ? 'border-[var(--women-rose)]/30 shadow-[0_0_30px_rgba(232,160,191,0.05)]' : 'border-mgsr-teal/30'}`}>
            <div className="flex items-center justify-between gap-4">
              <h3 className={`text-sm font-semibold uppercase tracking-wider ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                {labels.mandate}
              </h3>
              <div className="shrink-0">
                <div className={`w-11 h-6 rounded-full flex items-center justify-end px-1 ${isWomen ? 'bg-[var(--women-rose)]' : 'bg-mgsr-teal'}`}>
                  <div className="w-4 h-4 rounded-full bg-white" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label={labels.age} value={player.age} isWomen={isWomen} />
          <StatCard label={labels.height} value={player.height} isWomen={isWomen} />
          <StatCard label={labels.nationality} value={player.nationality} isWomen={isWomen} />
          <StatCard label={labels.contract} value={player.contractExpired} isWomen={isWomen} />
        </div>

        {data.scoutReport && (
          <div className={`p-5 rounded-xl bg-mgsr-card border mb-8 ${isWomen ? 'border-[var(--women-rose)]/20 shadow-[0_0_30px_rgba(232,160,191,0.05)]' : 'border-mgsr-border'}`}>
            <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-4">
              {labels.scoutReport}
            </h3>
            <div className="scout-report-content text-mgsr-text">
              <ReactMarkdown components={scoutComponents}>
                {data.scoutReport}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {data.highlights && data.highlights.length > 0 && (
          <div className={`p-5 rounded-xl bg-mgsr-card border mb-8 ${isWomen ? 'border-[var(--women-rose)]/20 shadow-[0_0_30px_rgba(232,160,191,0.05)]' : 'border-mgsr-border'}`}>
            <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-4">
              {labels.highlights}
            </h3>
            <div className="space-y-4">
              {data.highlights.map((v) => (
                <div key={v.id} className="rounded-xl overflow-hidden border border-mgsr-border">
                  <div className="aspect-video bg-mgsr-dark">
                    <iframe
                      src={v.embedUrl}
                      title={v.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                  <div className="p-3 bg-mgsr-card/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-medium uppercase tracking-wider ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                        {v.source === 'scorebat' ? (useHebrew ? 'משחק' : 'Match') : (useHebrew ? 'יוטיוב' : 'YouTube')}
                      </span>
                      {v.channelName && (
                        <span className="text-xs text-mgsr-muted truncate">{v.channelName}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-mgsr-text line-clamp-2">{v.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {player.tmProfile && (
          <div className={`p-5 rounded-xl bg-mgsr-card border mb-8 ${isWomen ? 'border-[var(--women-rose)]/20' : 'border-mgsr-border'}`}>
            <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
              {labels.transfermarkt}
            </h3>
            <a
              href={player.tmProfile}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-2 font-medium ${accentLink}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {data.lang === 'he' ? 'צפה בפרופיל' : 'View profile'}
            </a>
          </div>
        )}

        {playerPhone && (
          <ContactBlock phone={playerPhone} title={labels.playerContact} contactName={displayName || '—'} />
        )}
        {agencyPhone && (
          <ContactBlock phone={agencyPhone} title={labels.agencyContact} contactName={`${displayName || '—'} agent`} />
        )}

        {(data.sharerPhone || data.sharerName) && (
          <div className={`p-5 rounded-xl bg-mgsr-card border ${isWomen ? 'border-[var(--women-rose)]/20 shadow-[0_0_30px_rgba(232,160,191,0.05)]' : 'border-mgsr-border'}`}>
            <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
              {labels.contact}
            </h3>
            <p className="text-xs text-mgsr-muted mb-2">
              {labels.contactNote}
            </p>
            <p className="text-mgsr-text font-medium mb-2">
              {data.sharerName || '—'}
            </p>
            {data.sharerPhone && (
              <a
                href={toWhatsAppUrl(data.sharerPhone) ?? `tel:${data.sharerPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 font-medium ${accentLink}`}
                dir="ltr"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {data.sharerPhone}
              </a>
            )}
          </div>
        )}

        <p className="text-center text-mgsr-muted text-sm mt-12">
          {labels.sharedVia}
        </p>
      </main>
    </div>
  );
}
