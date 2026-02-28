'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import Link from 'next/link';
import type { ShareData } from './types';

function StatCard({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="px-4 py-3 rounded-xl border bg-mgsr-card/50 border-mgsr-border">
      <p className="text-xs text-mgsr-muted uppercase tracking-wider">{label}</p>
      <p className="font-semibold mt-0.5 text-mgsr-text">{value}</p>
    </div>
  );
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
        <div className="animate-pulse text-mgsr-teal">Loading...</div>
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
  const useHebrew = data.lang === 'he' || (typeof navigator !== 'undefined' && navigator.language?.startsWith('he'));
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
        transfermarkt: 'פרופיל Transfermarkt',
        sharedVia: 'שותף דרך MGSR Team',
        viewMandate: 'צפה במנדט',
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
        transfermarkt: 'Transfermarkt profile',
        sharedVia: 'Shared via MGSR Team',
        viewMandate: 'View mandate',
      };

  return (
    <div className="min-h-screen bg-mgsr-dark" dir={useHebrew ? 'rtl' : 'ltr'}>
      <header className="border-b border-mgsr-border bg-mgsr-card/50 px-4 py-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-mgsr-teal hover:underline"
        >
          <img src="/logo.svg" alt="" className="w-8 h-8" />
          <span className="font-bold font-display">MGSR Team</span>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        <div className="relative overflow-hidden rounded-2xl mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-mgsr-card via-mgsr-card to-mgsr-dark" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(77,182,172,0.15)_0%,transparent_50%)]" />
          <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-8 p-8 sm:p-10">
            <div className="relative shrink-0">
              <img
                src={player.profileImage || 'https://via.placeholder.com/160'}
                alt=""
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover bg-mgsr-dark ring-4 ring-mgsr-border shadow-2xl"
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
              <p className="text-2xl sm:text-3xl font-display font-bold text-mgsr-teal">
                {player.marketValue || '—'}
              </p>
              <p className="text-xs text-mgsr-muted mt-0.5">Market value</p>
            </div>
          </div>
        </div>

        {data.mandateInfo?.hasMandate && (
          <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-teal/30 mb-6">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-mgsr-teal uppercase tracking-wider">
                {labels.mandate}
              </h3>
              <div className="shrink-0">
                <div className="w-11 h-6 rounded-full bg-mgsr-teal flex items-center justify-end px-1">
                  <div className="w-4 h-4 rounded-full bg-white" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label={labels.age} value={player.age} />
          <StatCard label={labels.height} value={player.height} />
          <StatCard label={labels.nationality} value={player.nationality} />
          <StatCard label={labels.contract} value={player.contractExpired} />
        </div>

        {data.scoutReport && (
          <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border mb-8">
            <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
              {labels.scoutReport}
            </h3>
            <p className="text-mgsr-text leading-relaxed whitespace-pre-line">
              {data.scoutReport}
            </p>
          </div>
        )}

        {data.highlights && data.highlights.length > 0 && (
          <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border mb-8">
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
                      <span className="text-[10px] font-medium uppercase tracking-wider text-mgsr-teal">
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
          <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border mb-8">
            <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
              {labels.transfermarkt}
            </h3>
            <a
              href={player.tmProfile}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-mgsr-teal hover:underline font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {data.lang === 'he' ? 'צפה בפרופיל' : 'View profile'}
            </a>
          </div>
        )}

        {(data.sharerPhone || data.sharerName) && (
          <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
            <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
              {labels.contact}
            </h3>
            <p className="text-mgsr-text font-medium mb-2">
              {data.sharerName || '—'}
            </p>
            {data.sharerPhone && (
              <a
                href={toWhatsAppUrl(data.sharerPhone) ?? `tel:${data.sharerPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-mgsr-teal hover:underline font-medium"
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
