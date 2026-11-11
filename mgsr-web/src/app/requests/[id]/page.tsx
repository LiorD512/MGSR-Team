'use client';

/**
 * Club request -> roster matches (men). Opened from "View all" on a Club Requirements card.
 * Same matching as the board: local matcher + precomputed RequestMatchResults, merged and sorted by market value.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEuCountries } from '@/hooks/useEuCountries';
import { CLUB_REQUESTS_COLLECTIONS, PLAYERS_COLLECTIONS, REQUEST_MATCH_RESULTS_COLLECTIONS } from '@/lib/platformCollections';
import { getPositionDisplayName } from '@/lib/appConfig';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { matchRequestToPlayers, type ClubRequest, type RosterPlayer } from '@/lib/requestMatcher';
import { parseMarketValueToEuros } from '@/lib/shortlistIntelligence';
import BritLoader from '@/components/BritLoader';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';

type Req = ClubRequest & { clubName?: string; clubLogo?: string; clubCountry?: string; salaryRange?: string; status?: string };

const initials = (name?: string) => (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function RequestMatchesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { platform } = usePlatform();
  const { lang, setLang, isRtl, t } = useLanguage();
  const isHebrew = lang === 'he';
  const euCountries = useEuCountries();

  const [req, setReq] = useState<Req | null | undefined>(undefined);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [precomputed, setPrecomputed] = useState<string[]>([]);

  useEffect(() => { if (!loading && !user) router.replace('/login'); }, [loading, user, router]);
  // the matches page is men-only (women / youth keep the standard requests screen)
  useEffect(() => { if (platform === 'women' || platform === 'youth') router.replace('/requests'); }, [platform, router]);

  useEffect(() => {
    if (!user || !id) return;
    return onSnapshot(doc(db, CLUB_REQUESTS_COLLECTIONS.men, id), (d) => setReq(d.exists() ? ({ id: d.id, ...d.data() } as Req) : null), () => setReq(null));
  }, [user, id]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, PLAYERS_COLLECTIONS.men), orderBy('createdAt', 'desc')), (snap) => setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer))));
  }, [user]);
  useEffect(() => {
    if (!user || !id) return;
    return onSnapshot(doc(db, REQUEST_MATCH_RESULTS_COLLECTIONS.men, id), (d) => setPrecomputed((d.data()?.matchingPlayerIds as string[]) ?? []), () => undefined);
  }, [user, id]);

  const matches = useMemo(() => {
    if (!req) return [];
    const byId = new Map<string, RosterPlayer>();
    for (const p of matchRequestToPlayers(req, players, euCountries)) byId.set(p.id, p);
    for (const pid of precomputed) { const p = players.find((x) => x.id === pid); if (p) byId.set(p.id, p); }
    return Array.from(byId.values()).sort((a, b) => parseMarketValueToEuros(b.marketValue ?? '') - parseMarketValueToEuros(a.marketValue ?? ''));
  }, [req, players, precomputed, euCountries]);

  if (loading || !user || platform !== 'men') return <BritLoader fullPage />;

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const age = req && !req.ageDoesntMatter && (req.minAge || req.maxAge) ? `${req.minAge || ''}–${req.maxAge || ''}` : null;
  const back = <Link href="/requests" className="brit-reqm-back">← {t('nav_requests')}</Link>;

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="requests" />
        <div className="brit-main">
          <header className="brit-topbar">
            <div>BRIT / <strong>{t('nav_requests')}</strong> / {dateStr}</div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
            </div>
          </header>
          <main className="brit-canvas">
            {req === undefined ? <BritLoader /> : req === null ? (
              <>{back}<div className="tr3-emptybox"><h3>{isRtl ? 'הדרישה לא נמצאה' : 'Request not found'}</h3></div></>
            ) : (
              <>
                {back}
                <header className="brit-masthead">
                  <div>
                    <p className="brit-kicker">{isRtl ? 'התאמות מהסגל' : 'Roster matches'}</p>
                    <div className="brit-reqm-club">
                      {req.clubLogo?.startsWith('http') && <img src={req.clubLogo} alt="" />}
                      <h1>{req.clubName || '—'} <span>{getPositionDisplayName(req.position, isHebrew) || req.position}</span></h1>
                    </div>
                    <div className="brit-reqm-spec">
                      {req.clubCountry && <span>{getCountryDisplayName(req.clubCountry, isHebrew)}</span>}
                      {age && <span>{t('player_info_age')} <b>{age}</b></span>}
                      {req.euOnly && <span><b>EU</b></span>}
                    </div>
                  </div>
                </header>
                <p className="brit-result-count">{matches.length} {t('requests_room_matches')}</p>
                {matches.length === 0 ? (
                  <div className="tr3-emptybox"><h3>{t('requests_room_no_match')}</h3></div>
                ) : (
                  <div className="brit-reqm-grid">
                    {matches.map((p) => (
                      <Link key={p.id} href={`/players/${p.id}?from=/requests/${id}`} className="brit-reqm-card">
                        {p.profileImage ? <img className="brit-reqm-photo" src={p.profileImage} alt="" /> : <div className="brit-reqm-photo ph">{initials(p.fullName)}</div>}
                        <div className="brit-reqm-info">
                          <div className="nm">{p.fullName || '—'}</div>
                          <div className="sub">{(p.positions ?? []).filter(Boolean).join(' · ')}{p.age ? ` · ${p.age}` : ''}</div>
                          {p.currentClub?.clubName && <div className="sub">{p.currentClub.clubName}</div>}
                          {p.marketValue && <div className="val">{p.marketValue}</div>}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
