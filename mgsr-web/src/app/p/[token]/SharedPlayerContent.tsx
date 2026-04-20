'use client';

import { useEffect, useState, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import { getPositionDisplayName } from '@/lib/appConfig';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import type { ShareData, PortfolioEnrichment } from './types';
import {
  UrgencyBadgesStrip,
  WhyThisPlayerPitch,
  HighlightsGrid,
  InterestHeaderCTA,
  MiniPitchPosition,
  ContractCountdown,
  HookLine,
  ClubSummarySection,
  KeyTraitsGrid,
  TacticalFitSection,
  BottomCTASection,
  PlayerRadarChart,
} from './PortfolioEnrichments';
import { GpsPerformanceShowcase } from './GpsPerformanceShowcase';
import { PlayerStatsShowcase } from './PlayerStatsShowcase';

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
      <span className="font-semibold text-mgsr-text">{children}</span>
    ),
  };
}

/** Strip ** and ## markdown from text for clean plain-text display */
function cleanMarkdown(text: string): string {
  return text
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/^#+\s*/gm, '')
    .trim();
}

/** Strip only ** bold markers, keep ## headers for ReactMarkdown */
function stripBold(text: string): string {
  return text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
}

/** Remove "Comparable Players" / "שחקנים דומים" section from stored scout reports */
function stripComparablePlayers(text: string): string {
  return text.replace(/## (?:Comparable Players|שחקנים דומים)\s*\n[\s\S]*?(?=\n## |$)/gi, '').replace(/\n{3,}/g, '\n\n').trim();
}

export default function SharedPlayerContent({
  token,
  initialData,
}: {
  token: string;
  initialData: ShareData | null;
}) {
  const [data, setData] = useState<ShareData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const platformParam = searchParams.get('platform');
  const fromPortfolio = searchParams.get('from') === 'portfolio';

  // Scout report editor state (only used when fromPortfolio)
  const [editedReport, setEditedReport] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Portfolio enrichment state
  const [enrichment, setEnrichment] = useState<PortfolioEnrichment | null>(initialData?.enrichment ?? null);

  // Initialize edited report when data loads
  useEffect(() => {
    if (fromPortfolio && data?.scoutReport && editedReport === null) {
      setEditedReport(stripComparablePlayers(data.scoutReport));
    }
  }, [fromPortfolio, data, editedReport]);

  const splitSections = useCallback((report: string): { title: string; body: string }[] => {
    const sections: { title: string; body: string }[] = [];
    const parts = report.split(/^(## .+)$/gm);
    if (parts[0]?.trim()) sections.push({ title: '', body: parts[0].trim() });
    for (let i = 1; i < parts.length; i += 2) {
      sections.push({ title: parts[i]?.replace(/^## /, '').trim() || '', body: parts[i + 1]?.trim() || '' });
    }
    return sections;
  }, []);

  const removeSection = useCallback((idx: number) => {
    if (!editedReport) return;
    const sections = splitSections(editedReport);
    const updated = sections.filter((_, i) => i !== idx)
      .map((s) => (s.title ? `## ${s.title}\n\n${s.body}` : s.body))
      .join('\n\n');
    setEditedReport(updated);
  }, [editedReport, splitSections]);

  const handleRegenerate = useCallback(async () => {
    if (regenerating || !data) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/share/generate-scout-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player: data.player,
          lang: data.lang ?? 'he',
          platform: platformParam || data.platform || 'men',
        }),
      });
      if (res.ok) {
        const { scoutReport } = await res.json();
        if (scoutReport) setEditedReport(stripComparablePlayers(scoutReport));
      }
    } catch (e) {
      console.error('Regenerate failed:', e);
    } finally {
      setRegenerating(false);
    }
  }, [regenerating, data, platformParam]);

  const handleShareEdited = useCallback(async () => {
    if (sharing || !data || !editedReport) return;
    setSharing(true);
    try {
      const { createShare } = await import('@/lib/shareApi');
      const { auth } = await import('@/lib/firebase');
      const { openWhatsAppShare } = await import('@/lib/whatsapp');
      const getIdToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve(null);
      const { url } = await createShare(
        {
          playerId: data.playerId,
          player: data.player,
          mandateInfo: data.mandateInfo,
          mandateUrl: data.mandateUrl,
          sharerPhone: data.sharerPhone,
          sharerName: data.sharerName,
          scoutReport: editedReport,
          highlights: data.highlights,
          lang: data.lang,
          platform: (platformParam || data.platform || 'men') as 'men' | 'women' | 'youth',
        },
        getIdToken
      );
      const useHeb = data.lang === 'he';
      const displayName = useHeb
        ? (data.player.fullNameHe || data.player.fullName || '—')
        : (data.player.fullName || data.player.fullNameHe || '—');
      const isWom = data.platform === 'women';
      const brand = isWom ? 'MGSR Women' : 'MGSR';
      const rawPos = (data.player.positions ?? [])[0] || '';
      const pos = useHeb ? getPositionDisplayName(rawPos, true) : rawPos;
      const height = data.player.height || '';
      const quickFacts = [height, pos].filter(Boolean).join(' ');
      const shareText = useHeb
        ? `שחקן חדש שעשוי להתאים לכם.\n${quickFacts ? `${quickFacts}, מוכן למעבר מיידי.` : 'מוכן למעבר מיידי.'}\nאם רלוונטי \u2013 לחצו "מעוניין" ונשלח תנאים מלאים.\n\n${url}`
        : `New player that could fit your needs.\n${quickFacts ? `${quickFacts} — ready for immediate move.` : 'Ready for immediate move.'}\nIf relevant, click "Interested" and we'll send full deal terms.\n\n${url}`;
      if (url.includes('localhost') && typeof window !== 'undefined') {
        await navigator.clipboard.writeText(url);
        alert(useHeb ? 'לינק הועתק!' : 'Link copied!');
      } else {
        openWhatsAppShare(shareText);
      }
    } catch (e) {
      console.error('Share edited failed:', e);
    } finally {
      setSharing(false);
    }
  }, [sharing, data, editedReport, platformParam]);

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

  // Enrichment is pre-computed at share-creation time and stored in Firestore.
  // No client-side fetch fallback — if enrichment wasn't generated, we skip those sections.
  // This ensures the page loads instantly with no loading spinners.
  useEffect(() => {
    if (!enrichment && data) setEnrichment({});
  }, [data, enrichment]);

  // "Show more" expandable state
  const [showMore, setShowMore] = useState(false);

  // "I'm Interested" handler — opens WhatsApp to the sharer
  const handleInterested = useCallback(() => {
    if (!data) return;
    const useHeb = data.lang === 'he';
    const name = useHeb
      ? (data.player.fullNameHe || data.player.fullName || '')
      : (data.player.fullName || data.player.fullNameHe || '');
    const isWom = data.platform === 'women';
    const brand = isWom ? 'MGSR Women' : 'MGSR';
    if (data.sharerPhone) {
      const msg = useHeb
        ? `היי, ראיתי את הפרופיל של ${name} דרך ${brand} ואני מעוניין לשמוע עוד.`
        : `Hi, I saw the profile of ${name} via ${brand} and I'm interested in learning more.`;
      import('@/lib/whatsapp').then(({ openWhatsAppWithMessage }) => {
        openWhatsAppWithMessage(data.sharerPhone!, msg);
      });
    } else if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      alert(useHeb ? 'הלינק הועתק!' : 'Link copied!');
    }
  }, [data]);

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
        <span className="text-mgsr-teal">
          MGSR Team
        </span>
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
        scoutReport: 'הצגה',
        highlights: 'היילייטס',
        contact: 'איש קשר',
        playerContact: isWomen ? 'יצירת קשר עם השחקנית' : 'יצירת קשר עם השחקן',
        agencyContact: 'יצירת קשר עם הסוכנות',
        addToContacts: 'הוסף לרשימת אנשי קשר',
        openWhatsApp: 'פתח WhatsApp',
        transfermarkt: 'פרופיל Transfermarkt',
        sharedVia: isWomen ? 'שותף דרך MGSR Women' : 'שותף דרך MGSR Team',
        viewMandate: 'צפה במנדט',
        marketValue: 'שווי שוק',
        interested: 'מעוניין',
        poweredBy: 'מופעל על ידי בינה מלאכותית',
      }
    : {
        mandate: 'Mandate',
        age: 'Age',
        height: 'Height',
        nationality: 'Nationality',
        contract: 'Contract',
        scoutReport: 'Introduction',
        highlights: 'Highlights',
        contact: 'Contact',
        playerContact: isWomen ? 'Athlete contact' : 'Player contact',
        agencyContact: 'Agency contact',
        addToContacts: 'Add to contacts',
        openWhatsApp: 'Open WhatsApp',
        transfermarkt: 'Transfermarkt profile',
        sharedVia: isWomen ? 'Shared via MGSR Women' : 'Shared via MGSR Team',
        viewMandate: 'View mandate',
        marketValue: 'Market value',
        interested: "I'm Interested",
        poweredBy: 'Powered by AI scouting intelligence',
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
    <div className="min-h-screen bg-mgsr-dark pitch-lines-bg" dir={useHebrew ? 'rtl' : 'ltr'}>
      <header className={`relative z-20 border-b px-4 py-3 flex items-center justify-between gap-4 backdrop-blur-md ${isWomen ? 'border-[var(--women-rose)]/20 bg-mgsr-card/70' : 'border-mgsr-border bg-mgsr-card/70'}`}>
        {fromPortfolio ? (
          <Link
            href={isWomen ? '/portfolio?platform=women' : '/portfolio'}
            className={`inline-flex items-center gap-2 ${accentLink}`}
          >
            <svg
              className={`w-5 h-5 shrink-0 ${useHebrew ? 'scale-x-[-1]' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <img src="/logo.svg" alt="" className="w-8 h-8" />
            <span className="font-bold font-display">
              {useHebrew ? 'חזרה לפורטפוליו' : 'Back to Portfolio'}
            </span>
          </Link>
        ) : (
          <div className="inline-flex items-center gap-2">
            <img src="/logo.svg" alt="" className="w-8 h-8" />
            <span className={`font-bold font-display ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
              {isWomen ? 'MGSR Women' : 'MGSR Team'}
            </span>
          </div>
        )}
        {/* Interest CTA for external scouts (non-portfolio view) */}
        {!fromPortfolio && (
          <InterestHeaderCTA
            isWomen={isWomen}
            useHebrew={useHebrew}
            onInterested={handleInterested}
          />
        )}
      </header>

      {/* Cinematic background layers */}
      <div className="portfolio-grid-overlay" />
      <div className="portfolio-sweep-lines" />
      <div className="portfolio-orb portfolio-orb-1" />
      <div className="portfolio-orb portfolio-orb-2" />
      <div className="portfolio-orb portfolio-orb-3" />
      <div className="portfolio-vignette" />

      <main className="relative z-10 max-w-2xl mx-auto p-6">
        {/* ═══ HERO — Player identity + hook + availability ═══ */}
        <div className={`relative overflow-hidden rounded-2xl mb-6 hero-holo ${isWomen ? 'shadow-[0_0_40px_rgba(232,160,191,0.12)]' : ''}`}>
          <div className={`absolute inset-0 ${isWomen ? 'bg-gradient-to-br from-[var(--women-rose)]/15 via-mgsr-card to-mgsr-dark' : 'bg-gradient-to-br from-mgsr-card via-mgsr-card to-mgsr-dark'}`} />
          <div className={`absolute inset-0 ${isWomen ? 'bg-[radial-gradient(ellipse_at_30%_20%,rgba(232,160,191,0.25)_0%,transparent_50%)]' : 'bg-[radial-gradient(ellipse_at_30%_20%,rgba(77,182,172,0.15)_0%,transparent_50%)]'}`} />
          <img
            src="/mgsr-white.png"
            alt=""
            className="absolute -right-8 -bottom-6 w-[280px] sm:w-[340px] opacity-[0.03] pointer-events-none select-none"
            draggable={false}
          />
          <div className="relative p-8 sm:p-10">
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-8">
              <div className="relative shrink-0">
                <img
                  src={player.profileImage || 'https://via.placeholder.com/160'}
                  alt=""
                  className={`w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover bg-mgsr-dark ring-4 shadow-2xl hero-image-float ${isWomen ? 'ring-[var(--women-rose)]/30' : 'ring-mgsr-border'}`}
                />
              </div>
              <div className="flex-1 text-center sm:text-left min-w-0">
                <h1 className="text-3xl sm:text-4xl font-display font-bold text-mgsr-text tracking-tight">
                  {displayName}
                </h1>
                <p className="text-mgsr-muted mt-1.5 text-lg">
                  {player.positions?.filter(Boolean).join(' • ') || '—'}
                </p>
                {/* Quick stats row */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 mt-3 text-sm text-mgsr-muted">
                  {player.age && <span>{useHebrew ? 'גיל' : 'Age'}: {player.age}</span>}
                  {player.height && <><span className="opacity-30">|</span><span>{player.height}</span></>}
                  {player.nationality && <><span className="opacity-30">|</span><span>{player.nationality}</span></>}
                  {player.contractExpired?.trim() && player.contractExpired !== '-' && <><span className="opacity-30">|</span><span>{useHebrew ? 'חוזה' : 'Contract'}: {player.contractExpired}</span></>}
                </div>
                {/* Club */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3">
                  {player.currentClub?.clubName && (
                    <span className="text-mgsr-text font-medium text-sm">
                      {player.currentClub.clubName}{player.currentClub.clubCountry ? ` · ${player.currentClub.clubCountry}` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Hook line — 3-second pitch */}
            <HookLine hookLine={enrichment?.hookLine} hookLineHe={enrichment?.hookLineHe} isWomen={isWomen} useHebrew={useHebrew} />
          </div>
        </div>

        {/* Urgency badges */}
        <UrgencyBadgesStrip data={data} useHebrew={useHebrew} />

        {/* ═══ TRANSFERMARKT PROFILE — prominent, redesigned ═══ */}
        {!isWomen && player.tmProfile && (
          <a
            href={player.tmProfile}
            target="_blank"
            rel="noopener noreferrer"
            className={`group flex items-center justify-between gap-4 p-4 rounded-xl mb-8 border transition-all duration-300 ${
              isWomen
                ? 'border-[var(--women-rose)]/30 bg-[var(--women-rose)]/5 hover:bg-[var(--women-rose)]/10 hover:border-[var(--women-rose)]/50'
                : 'border-mgsr-teal/30 bg-mgsr-teal/5 hover:bg-mgsr-teal/10 hover:border-mgsr-teal/50'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isWomen ? 'bg-[var(--women-rose)]/15' : 'bg-mgsr-teal/15'}`}>
                <svg className={`w-5 h-5 ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className={`text-xs font-semibold uppercase tracking-wider ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                  Transfermarkt
                </div>
                <div className="text-sm text-mgsr-muted truncate">
                  {useHebrew ? 'צפה בפרופיל המלא' : 'View full player profile'}
                </div>
              </div>
            </div>
            <svg className={`w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1 ${useHebrew ? 'rotate-180 group-hover:-translate-x-1' : ''} ${isWomen ? 'text-[var(--women-rose)]/60' : 'text-mgsr-teal/60'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        )}

        {/* ═══ INTRODUCTION ═══ */}
        {data.scoutReport && (
          <div className={`p-5 rounded-xl bg-mgsr-card border mb-8 ${isWomen ? 'border-[var(--women-rose)]/20 shadow-[0_0_30px_rgba(232,160,191,0.05)]' : 'border-mgsr-border'}`}>
            {/* Header with edit controls when from portfolio */}
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-sm font-semibold uppercase tracking-wider ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                {labels.scoutReport}
              </h3>
              {fromPortfolio && editedReport !== null && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                      isEditing
                        ? (isWomen ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)]' : 'bg-mgsr-teal/20 text-mgsr-teal')
                        : 'bg-mgsr-border/50 text-mgsr-muted hover:text-mgsr-text'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {useHebrew ? (isEditing ? 'סיום עריכה' : 'ערוך') : (isEditing ? 'Done' : 'Edit')}
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-border/50 text-mgsr-muted hover:text-mgsr-text transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {regenerating ? (
                      <div className={`w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin ${isWomen ? 'border-[var(--women-rose)]' : 'border-mgsr-teal'}`} />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    {useHebrew ? 'חדש' : 'Regenerate'}
                  </button>
                  {editedReport !== data.scoutReport && (
                    <button
                      type="button"
                      onClick={() => { setEditedReport(data.scoutReport ?? null); setIsEditing(false); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-mgsr-border/50 text-mgsr-muted hover:text-mgsr-text transition flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      {useHebrew ? 'איפוס' : 'Reset'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Content: editor or read-only */}
            {fromPortfolio && editedReport !== null ? (
              isEditing ? (
                <textarea
                  value={editedReport}
                  onChange={(e) => setEditedReport(e.target.value)}
                  className="w-full h-64 p-4 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text text-sm leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-mgsr-teal"
                  dir={useHebrew ? 'rtl' : 'ltr'}
                />
              ) : (
                <div className="space-y-2">
                  {splitSections(editedReport).map((section, idx) => (
                    <div
                      key={idx}
                      className="group/section relative rounded-xl bg-mgsr-dark/50 border border-mgsr-border/50 p-3 hover:border-mgsr-border transition"
                    >
                      <button
                        type="button"
                        onClick={() => removeSection(idx)}
                        className={`absolute ${useHebrew ? 'left-2' : 'right-2'} top-2 p-1 rounded-lg opacity-0 group-hover/section:opacity-100 text-mgsr-muted hover:text-red-400 hover:bg-red-500/10 transition-all`}
                        title={useHebrew ? 'הסר קטע' : 'Remove section'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      {section.title && (
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                          {section.title}
                        </p>
                      )}
                      <p className="text-sm text-mgsr-text/80 leading-relaxed whitespace-pre-line">
                        {cleanMarkdown(section.body)}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="scout-report-content text-mgsr-text">
                <ReactMarkdown components={scoutComponents}>
                  {stripBold(stripComparablePlayers(data.scoutReport))}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* ═══ HIGHLIGHTS — right after intro ═══ */}
        {data.highlights && data.highlights.length > 0 && (
          <HighlightsGrid highlights={data.highlights} isWomen={isWomen} useHebrew={useHebrew} />
        )}

        {/* ═══ GPS PERFORMANCE ═══ */}
        {data.gpsData && data.gpsData.matchCount > 0 && (
          <div className="mb-8">
            <GpsPerformanceShowcase gpsData={data.gpsData} isWomen={isWomen} useHebrew={useHebrew} />
          </div>
        )}

        {/* ═══ SHOW MORE — expandable section for deeper data ═══ */}
        {(() => {
          const hasTraits = enrichment?.keyTraits && enrichment.keyTraits.length > 0;
          const hasTactical = !!enrichment?.tacticalFit;
          const hasPositions = player.positions && player.positions.length > 0;
          const hasStats = data.playerStats && data.playerStats.stats.length > 0;
          const hasFamilyStatus = data.familyStatus && (data.familyStatus.isMarried || (data.familyStatus.kidsCount ?? 0) > 0);
          const hasContractCountdown = (() => {
            if (!player.contractExpired?.trim() || player.contractExpired === '-') return false;
            const ce = player.contractExpired;
            let expiryDate: Date | null = null;
            const ddmmyyyy = ce.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (ddmmyyyy) expiryDate = new Date(+ddmmyyyy[3], +ddmmyyyy[2] - 1, +ddmmyyyy[1]);
            else { const yyyy = ce.match(/(\d{4})/); if (yyyy) expiryDate = new Date(+yyyy[1], 5, 30); }
            if (!expiryDate) return false;
            const daysUntil = Math.floor((expiryDate.getTime() - Date.now()) / 86400000);
            return daysUntil > 0 && daysUntil <= 180;
          })();
          const hasRadar = enrichment?.radarAttributes && enrichment.radarAttributes.length >= 3;
          const hasSellingPoints = !!enrichment?.sellingPoints;
          const hasAnythingToExpand = hasRadar || hasSellingPoints || hasTraits || hasTactical || hasPositions || hasStats || hasFamilyStatus || hasContractCountdown || playerPhone || agencyPhone;

          if (!hasAnythingToExpand) return null;
          return (
            <div className="mb-8">
              {/* Toggle button */}
              <button
                type="button"
                onClick={() => setShowMore(!showMore)}
                className={`w-full group flex items-center justify-center gap-3 py-4 px-6 rounded-2xl border transition-all duration-300 ${
                  showMore
                    ? (isWomen
                        ? 'border-[var(--women-rose)]/30 bg-[var(--women-rose)]/5'
                        : 'border-mgsr-teal/30 bg-mgsr-teal/5')
                    : `border-mgsr-border bg-mgsr-card hover:border-mgsr-border/80 ${isWomen ? 'hover:bg-[var(--women-rose)]/5' : 'hover:bg-mgsr-teal/5'}`
                }`}
              >
                <span className={`text-sm font-semibold tracking-wide ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                  {showMore
                    ? (useHebrew ? 'הסתר פרטים' : 'Show Less')
                    : (useHebrew ? 'פרטים נוספים על השחקן' : 'More Player Details')
                  }
                </span>
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${showMore ? 'rotate-180' : ''} ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expandable content */}
              <div
                className={`overflow-hidden transition-all duration-500 ease-in-out ${showMore ? 'max-h-[5000px] opacity-100 mt-6' : 'max-h-0 opacity-0 mt-0'}`}
              >
                <div>
                  {/* Player Radar Chart (FM data) */}
                  {enrichment?.radarAttributes && enrichment.radarAttributes.length >= 3 && (
                    <PlayerRadarChart attributes={enrichment.radarAttributes} isWomen={isWomen} useHebrew={useHebrew} />
                  )}

                  {/* Why This Player */}
                  {enrichment?.sellingPoints && (
                    <WhyThisPlayerPitch points={enrichment.sellingPoints} isWomen={isWomen} useHebrew={useHebrew} />
                  )}

                  {/* Key Traits */}
                  <KeyTraitsGrid traits={enrichment?.keyTraits} traitsHe={enrichment?.keyTraitsHe} isWomen={isWomen} useHebrew={useHebrew} />

                  {/* Tactical Fit */}
                  <TacticalFitSection fit={enrichment?.tacticalFit} isWomen={isWomen} useHebrew={useHebrew} />

                  {/* Position Map */}
                  {player.positions && player.positions.length > 0 && (
                    <MiniPitchPosition positions={player.positions} isWomen={isWomen} useHebrew={useHebrew} />
                  )}

                  {/* Contract Countdown */}
                  {hasContractCountdown && (
                    <ContractCountdown contractExpiry={player.contractExpired!} isWomen={isWomen} useHebrew={useHebrew} />
                  )}

                  {/* Season Statistics */}
                  {data.playerStats && data.playerStats.stats.length > 0 && (
                    <div className="mb-8">
                      <PlayerStatsShowcase stats={data.playerStats} isWomen={isWomen} useHebrew={useHebrew} />
                    </div>
                  )}

                  {/* Family Status */}
                  {data.familyStatus && (data.familyStatus.isMarried || (data.familyStatus.kidsCount ?? 0) > 0) && (
                    <div className={`p-5 rounded-xl bg-mgsr-card border mb-8 ${isWomen ? 'border-[var(--women-rose)]/20' : 'border-mgsr-border'}`}>
                      <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-muted'}`}>
                        {useHebrew ? 'מצב משפחתי' : 'Family Status'}
                      </h3>
                      <div className="flex items-center gap-6 flex-wrap">
                        {data.familyStatus.isMarried && (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">💍</span>
                            <span className={`text-sm font-medium ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                              {useHebrew ? 'נשוי' : 'Married'}
                            </span>
                          </div>
                        )}
                        {(data.familyStatus.kidsCount ?? 0) > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">👶</span>
                            <span className={`text-sm font-medium ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                              {data.familyStatus.kidsCount} {useHebrew ? 'ילדים' : (data.familyStatus.kidsCount === 1 ? 'Kid' : 'Kids')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* English Level */}
                  {data.englishLevel && (
                    <div className={`p-5 rounded-xl bg-mgsr-card border mb-8 ${isWomen ? 'border-[var(--women-rose)]/20' : 'border-mgsr-border'}`}>
                      <h3 className={`text-sm font-semibold uppercase tracking-wider mb-4 ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-muted'}`}>
                        {useHebrew ? 'רמת אנגלית' : 'English Level'}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🇬🇧</span>
                        <span className={`text-sm font-medium ${isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                          {{
                            none: useHebrew ? 'ללא' : 'No English',
                            medium: useHebrew ? 'בינוני' : 'Medium',
                            good: useHebrew ? 'טוב' : 'Good',
                            native: useHebrew ? 'שפת אם' : 'Native',
                          }[data.englishLevel] ?? data.englishLevel}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Contact blocks */}
                  {playerPhone && (
                    <ContactBlock phone={playerPhone} title={labels.playerContact} contactName={displayName || '—'} />
                  )}
                  {agencyPhone && (
                    <ContactBlock phone={agencyPhone} title={labels.agencyContact} contactName={`${displayName || '—'} agent`} />
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ═══ BOTTOM CTA — strong close (external scout view only) ═══ */}
        {!fromPortfolio && (
          <BottomCTASection
            playerName={displayName || '—'}
            isWomen={isWomen}
            useHebrew={useHebrew}
            onInterested={handleInterested}
          />
        )}

        {/* Premium MGSR branded footer */}
        <div className="relative mt-16 mb-28 py-10 flex flex-col items-center">
          {/* Divider line with glow */}
          <div className={`w-24 h-[2px] mb-8 rounded-full ${isWomen ? 'bg-[var(--women-rose)]/40 shadow-[0_0_12px_rgba(232,160,191,0.3)]' : 'bg-mgsr-teal/40 shadow-[0_0_12px_rgba(77,182,172,0.3)]'}`} />
          {/* MGSR logo with landing-page style glow */}
          <img
            src="/mgsr-white.png"
            alt="MGSR"
            className="w-48 sm:w-56 mb-5 mgsr-footer-logo"
            style={{
              filter: isWomen
                ? 'drop-shadow(0 0 24px rgba(232,160,191,0.25)) drop-shadow(0 0 48px rgba(232,160,191,0.1))'
                : 'drop-shadow(0 0 24px rgba(77,182,172,0.25)) drop-shadow(0 0 48px rgba(57,209,100,0.1))'
            }}
          />
          <p className={`text-sm font-medium tracking-wide ${isWomen ? 'text-[var(--women-rose)]/60' : 'text-mgsr-teal/60'}`}>
            {labels.sharedVia}
          </p>
          <p className="text-mgsr-muted/40 text-[11px] mt-2 tracking-wider uppercase">
            {labels.poweredBy}
          </p>
        </div>
      </main>



      {/* Floating share bar when editing from portfolio */}
      {fromPortfolio && editedReport !== null && (
        <div className={`fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-xl ${isWomen ? 'border-[var(--women-rose)]/20 bg-mgsr-card/90' : 'border-mgsr-border bg-mgsr-card/90'}`}>
          <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4" dir={useHebrew ? 'rtl' : 'ltr'}>
            <div className="text-sm text-mgsr-muted">
              {editedReport !== data.scoutReport
                ? (useHebrew ? '✏️ הדוח שונה — שתף גרסה ערוכה' : '✏️ Report modified — share edited version')
                : (useHebrew ? 'שתף דוח זה' : 'Share this report')
              }
            </div>
            <button
              type="button"
              onClick={handleShareEdited}
              disabled={sharing}
              className={`px-5 py-2.5 rounded-xl font-medium disabled:opacity-50 flex items-center gap-2 transition ${isWomen ? 'bg-[var(--women-rose)] text-mgsr-dark hover:opacity-90' : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'}`}
            >
              {sharing ? (
                <>
                  <div className="w-4 h-4 border-2 border-mgsr-dark border-t-transparent rounded-full animate-spin" />
                  {useHebrew ? 'מכין...' : 'Preparing...'}
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  {useHebrew ? 'שתף ב-WhatsApp' : 'Share via WhatsApp'}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
