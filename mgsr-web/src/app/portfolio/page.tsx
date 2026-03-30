'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { createShare } from '@/lib/shareApi';
import { openWhatsAppShare } from '@/lib/whatsapp';
import { callPortfolioDelete } from '@/lib/callables';
import { getPositionDisplayName } from '@/lib/appConfig';
import type { PortfolioItem } from '@/lib/portfolioApi';
import { PORTFOLIO_COLLECTIONS, PLAYERS_COLLECTIONS } from '@/lib/platformCollections';

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
  phone?: string;
}

const PORTFOLIO_COLLECTION = 'Portfolio';

/** Fetch GPS data for a player to include in share payload */
async function fetchGpsDataForShare(tmProfile: string | undefined, lang: string) {
  if (!tmProfile) return undefined;
  try {
    const gpsSnap = await getDocs(query(
      collection(db, 'GpsMatchData'),
      where('playerTmProfile', '==', tmProfile)
    ));
    if (gpsSnap.empty) return undefined;
    const matches = gpsSnap.docs.map(d => d.data());
    const n = matches.length;
    const totalMin = matches.reduce((s, m) => s + ((m.totalDuration as number) || 0), 0);
    const avgDist = Math.round(matches.reduce((s, m) => s + ((m.totalDistance as number) || 0), 0) / n);
    const avgMeterage = Math.round(matches.reduce((s, m) => s + ((m.meteragePerMinute as number) || 0), 0) / n);
    const avgHI = Math.round(matches.reduce((s, m) => s + ((m.highIntensityRuns as number) || 0), 0) / n);
    const avgSprints = Math.round(matches.reduce((s, m) => s + ((m.sprints as number) || 0), 0) / n);
    const peakVel = Math.max(...matches.map(m => (m.maxVelocity as number) || 0));
    const avgMaxVel = Math.round((matches.reduce((s, m) => s + ((m.maxVelocity as number) || 0), 0) / n) * 10) / 10;
    const totalStars = matches.reduce((sum, m) => sum + [m.isStarTotalDist, m.isStarHighMpEffsDist, m.isStarHighMpEffs, m.isStarMeteragePerMin, m.isStarAccelerations, m.isStarHighIntensityRuns, m.isStarSprints, m.isStarMaxVelocity].filter(Boolean).length, 0);
    // Fetch insights
    const safeId = tmProfile.replace(/[\/\\]/g, '_');
    const insightsSnap = await getDoc(doc(db, 'GpsPlayerInsights', safeId));
    let strengths: { title: string; description: string; value: string; benchmark?: string }[] = [];
    if (insightsSnap.exists()) {
      const insData = insightsSnap.data();
      const isHe = lang === 'he';
      strengths = ((insData.insights || []) as Array<Record<string, string>>)
        .filter(i => i.type === 'strength')
        .map(i => ({
          title: isHe ? i.titleHe : i.titleEn,
          description: isHe ? i.descriptionHe : i.descriptionEn,
          value: i.value,
          benchmark: i.benchmark,
        }));
    }
    return {
      matchCount: n, totalMinutesPlayed: totalMin, avgTotalDistance: avgDist,
      avgMeteragePerMinute: avgMeterage, avgHighIntensityRuns: avgHI, avgSprints,
      peakMaxVelocity: peakVel, avgMaxVelocity: avgMaxVel, totalStars, strengths,
    };
  } catch { return undefined; }
}

async function fetchFamilyStatus(playerId: string, playersColl: string) {
  try {
    const snap = await getDoc(doc(db, playersColl, playerId));
    if (!snap.exists()) return undefined;
    const d = snap.data();
    const isMarried = d?.isMarried as boolean | undefined;
    const kidsCount = d?.kidsCount as number | undefined;
    if (!isMarried && !(kidsCount && kidsCount > 0)) return undefined;
    return { isMarried, kidsCount };
  } catch { return undefined; }
}

export default function PortfolioPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const { platform, setPlatform } = usePlatform();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromPlayerId = searchParams.get('fromPlayer');
  const platformFromUrl = searchParams.get('platform');
  const isWomen = platform === 'women';
  const isYouth = platform === 'youth';

  useEffect(() => {
    if (platformFromUrl === 'youth' && platform !== 'youth') setPlatform('youth');
    else if (platformFromUrl === 'women' && platform !== 'women') setPlatform('women');
    else if (platformFromUrl === 'men' && platform !== 'men') setPlatform('men');
  }, [platformFromUrl, platform, setPlatform]);
  const portfolioColl = PORTFOLIO_COLLECTIONS[platform];
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState<string | null>(null);
  const [includePlayerContact, setIncludePlayerContact] = useState(false);
  const [includeAgencyContact, setIncludeAgencyContact] = useState(false);
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);
  const [showShareSetupModal, setShowShareSetupModal] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Accounts'), (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setLoadingItems(false);
      return;
    }
    setLoadingItems(true);
    const q = query(
      collection(db, portfolioColl),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as PortfolioItem[];
        setItems(list);
        setLoadingItems(false);
      },
      (err) => {
        console.error('[Portfolio] onSnapshot error:', err);
        setLoadingItems(false);
      }
    );
    return () => unsub();
  }, [user, portfolioColl]);

  const handleShare = useCallback(
    async (item: PortfolioItem, attachPlayer: boolean, attachAgency: boolean) => {
      if (sharingId || !user) return;
      setSharingId(item.id);
      const lang = item.lang ?? 'he';
      try {
        const sharerAccount = accounts.find(
          (a) =>
            a.id === user.uid ||
            a.email?.toLowerCase() === user.email?.toLowerCase()
        );
        const sharerPhone = sharerAccount?.phone ?? undefined;
        const sharerName =
          lang === 'he'
            ? (sharerAccount?.hebrewName ?? sharerAccount?.name)
            : (sharerAccount?.name ?? sharerAccount?.hebrewName);

        const gpsData = await fetchGpsDataForShare(item.player.tmProfile, lang);
        const familyStatus = await fetchFamilyStatus(
          item.playerWomenId ?? item.playerId,
          PLAYERS_COLLECTIONS[platform]
        );
        const { url } = await createShare(
          {
            playerId: item.playerWomenId ?? item.playerId,
            player: item.player,
            mandateInfo: item.mandateInfo,
            mandateUrl: item.mandateUrl,
            sharerPhone,
            sharerName,
            scoutReport: item.scoutReport,
            highlights: item.highlights,
            lang,
            includePlayerContact: attachPlayer,
            includeAgencyContact: attachAgency,
            platform: platform,
            familyStatus,
            gpsData,
          },
          () =>
            user ? auth.currentUser?.getIdToken() ?? Promise.resolve(null) : Promise.resolve(null)
        );

        const displayName =
          lang === 'he'
            ? (item.player.fullNameHe || item.player.fullName || '—')
            : (item.player.fullName || item.player.fullNameHe || '—');
        const brand = isYouth ? 'MGSR Youth' : isWomen ? 'MGSR Women' : 'MGSR';
        const rawPos = (item.player.positions ?? [])[0] || '';
        const pos = lang === 'he' ? getPositionDisplayName(rawPos, true) : rawPos;
        const height = item.player.height || '';
        const quickFacts = [height, pos].filter(Boolean).join(' ');
        const shareText =
          lang === 'he'
            ? `שחקן חדש שעשוי להתאים לכם.\n${quickFacts ? `${quickFacts}, מוכן למעבר מיידי.` : 'מוכן למעבר מיידי.'}\nאם רלוונטי \u2013 לחצו \"מעוניין\" ונשלח תנאים מלאים.\n\n🔗 ${url}`
            : `New player that could fit your needs.\n${quickFacts ? `${quickFacts} — ready for immediate move.` : 'Ready for immediate move.'}\nIf relevant, click \"Interested\" and we'll send full deal terms.\n\n🔗 ${url}`;

        if (url.includes('localhost') && typeof window !== 'undefined') {
          setPendingShareUrl(shareText);
          setShowShareSetupModal(true);
        } else {
          openWhatsAppShare(shareText);
        }
      } catch (e) {
        console.error('Portfolio share failed:', e);
      } finally {
        setSharingId(null);
        setShowShareModal(null);
      }
    },
    [sharingId, user, accounts]
  );

  const handleView = useCallback(
    async (item: PortfolioItem) => {
      if (viewingId || !user) return;
      setViewingId(item.id); // Blocks all View buttons
      try {
        const sharerAccount = accounts.find(
          (a) =>
            a.id === user.uid ||
            a.email?.toLowerCase() === user.email?.toLowerCase()
        );
        const sharerPhone = sharerAccount?.phone ?? undefined;
        const lang = item.lang ?? 'he';
        const sharerName =
          lang === 'he'
            ? (sharerAccount?.hebrewName ?? sharerAccount?.name)
            : (sharerAccount?.name ?? sharerAccount?.hebrewName);

        const gpsData = await fetchGpsDataForShare(item.player.tmProfile, lang);
        const familyStatusView = await fetchFamilyStatus(
          item.playerWomenId ?? item.playerId,
          PLAYERS_COLLECTIONS[platform]
        );
        const { token } = await createShare(
          {
            playerId: item.playerWomenId ?? item.playerId,
            player: item.player,
            mandateInfo: item.mandateInfo,
            mandateUrl: item.mandateUrl,
            sharerPhone,
            sharerName,
            scoutReport: item.scoutReport,
            highlights: item.highlights,
            lang,
            platform: platform,
            familyStatus: familyStatusView,
            gpsData,
          },
          () =>
            user ? auth.currentUser?.getIdToken() ?? Promise.resolve(null) : Promise.resolve(null)
        );

        router.push(`/p/${token}?from=portfolio${platform !== 'men' ? `&platform=${platform}` : ''}`);
      } catch (e) {
        console.error('Portfolio view failed:', e);
      } finally {
        setViewingId(null);
      }
    },
    [viewingId, user, accounts, router]
  );

  const handleRemove = useCallback(async (id: string) => {
    const msg = isRtl
      ? (isYouth ? 'להסיר שחקן זה מהפורטפוליו?' : isWomen ? 'להסיר שחקנית זו מהפורטפוליו?' : 'להסיר שחקן זה מהפורטפוליו?')
      : 'Remove this player from portfolio?';
    if (!confirm(msg)) return;
    await callPortfolioDelete({ platform, documentId: id });
  }, [isRtl, isWomen, isYouth, platform]);



  if (loading || !user) return null;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto">
        {/* Hero header */}
        <div className={`relative overflow-hidden rounded-2xl sm:rounded-3xl mb-6 sm:mb-10 ${isYouth ? 'shadow-[0_0_40px_rgba(0,212,255,0.12)]' : isWomen ? 'shadow-[0_0_40px_rgba(232,160,191,0.12)]' : ''}`}>
          <div className={`absolute inset-0 ${isYouth ? 'bg-gradient-to-br from-[var(--youth-cyan)]/15 via-mgsr-card to-mgsr-dark' : isWomen ? 'bg-gradient-to-br from-[var(--women-rose)]/15 via-mgsr-card to-mgsr-dark' : 'bg-gradient-to-br from-mgsr-teal/20 via-mgsr-card to-mgsr-dark'}`} />
          <div className={`absolute inset-0 ${isYouth ? 'bg-[radial-gradient(ellipse_at_70%_0%,rgba(0,212,255,0.25)_0%,transparent_60%)]' : isWomen ? 'bg-[radial-gradient(ellipse_at_70%_0%,rgba(232,160,191,0.25)_0%,transparent_60%)]' : 'bg-[radial-gradient(ellipse_at_70%_0%,rgba(77,182,172,0.25)_0%,transparent_60%)]'}`} />
          <div className={`absolute inset-0 ${isYouth ? 'bg-[radial-gradient(ellipse_at_20%_100%,rgba(168,85,247,0.15)_0%,transparent_50%)]' : isWomen ? 'bg-[radial-gradient(ellipse_at_20%_100%,rgba(232,160,191,0.15)_0%,transparent_50%)]' : 'bg-[radial-gradient(ellipse_at_20%_100%,rgba(77,182,172,0.15)_0%,transparent_50%)]'}`} />
          <div className="relative px-4 sm:px-8 py-8 sm:py-16">
            <h1 className="text-2xl sm:text-4xl font-display font-bold text-mgsr-text tracking-tight">
              {t('portfolio_title')}
            </h1>
            <p className="mt-2 text-mgsr-muted text-lg max-w-xl">
              {t(isWomen ? 'portfolio_subtitle_women' : 'portfolio_subtitle')}
            </p>
            {fromPlayerId && (
              <Link
                href={isYouth ? `/players/youth/${fromPlayerId}` : isWomen ? `/players/women/${fromPlayerId}` : `/players/${fromPlayerId}`}
                className={`mt-4 inline-flex items-center gap-2 font-medium transition ${isYouth ? 'text-[var(--youth-cyan)] hover:text-[var(--youth-cyan)]/80' : isWomen ? 'text-[var(--women-rose)] hover:text-[var(--women-rose)]/80' : 'text-mgsr-teal hover:text-mgsr-teal/80'}`}
              >
                <svg className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {t('portfolio_back_to_player')}
              </Link>
            )}
          </div>
        </div>

        {loadingItems ? (
          <div className="flex items-center justify-center py-24">
            <div className={`w-12 h-12 border-2 border-t-transparent rounded-full animate-spin ${isYouth ? 'border-[var(--youth-cyan)]' : isWomen ? 'border-[var(--women-rose)]' : 'border-mgsr-teal'}`} />
          </div>
        ) : items.length === 0 ? (
          <div className={`text-center py-20 px-6 rounded-2xl border bg-mgsr-card/50 ${isYouth ? 'border-[var(--youth-cyan)]/20' : isWomen ? 'border-[var(--women-rose)]/20' : 'border-mgsr-border'}`}>
            <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center ${isYouth ? 'bg-[var(--youth-cyan)]/10' : isWomen ? 'bg-[var(--women-rose)]/10' : 'bg-mgsr-teal/10'}`}>
              <svg
                className={`w-10 h-10 ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-mgsr-text mb-2">
              {t('portfolio_empty_title')}
            </h2>
            <p className="text-mgsr-muted mb-6 max-w-md mx-auto">
              {t(isWomen ? 'portfolio_empty_hint_women' : 'portfolio_empty_hint')}
            </p>
            <Link
              href="/players"
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition ${isYouth ? 'bg-[var(--youth-cyan)] text-mgsr-dark hover:opacity-90' : isWomen ? 'bg-[var(--women-rose)] text-mgsr-dark hover:opacity-90' : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'}`}
            >
              {t(isWomen ? 'portfolio_browse_players_women' : 'portfolio_browse_players')}
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const displayName =
                isRtl
                  ? (item.player.fullNameHe || item.player.fullName || '—')
                  : (item.player.fullName || item.player.fullNameHe || '—');
              const isSharing = sharingId === item.id;
              const showShareForThis = showShareModal === item.id;
              const isMine = item.agentId === user?.uid;

              return (
                <div
                  key={item.id}
                  className={`group relative rounded-2xl border bg-mgsr-card transition-all duration-300 ${
                    isYouth
                      ? 'border-[var(--youth-cyan)]/20 hover:border-[var(--youth-cyan)]/50 hover:shadow-[0_0_40px_-10px_rgba(0,212,255,0.2)]'
                      : isWomen
                        ? 'border-[var(--women-rose)]/20 hover:border-[var(--women-rose)]/50 hover:shadow-[0_0_40px_-10px_rgba(232,160,191,0.2)]'
                        : 'border-mgsr-border hover:border-mgsr-teal/40 hover:shadow-[0_0_40px_-10px_rgba(77,182,172,0.2)]'
                  }`}
                >
                  {/* Card gradient accent */}
                  <div className={`absolute top-0 inset-x-0 h-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                    isYouth ? 'bg-gradient-to-r from-[var(--youth-cyan)]/60 via-[var(--youth-violet)] to-[var(--youth-cyan)]/60' : isWomen ? 'bg-gradient-to-r from-[var(--women-rose)]/60 via-[var(--women-rose)] to-[var(--women-rose)]/60' : 'bg-gradient-to-r from-mgsr-teal/60 via-mgsr-teal to-mgsr-teal/60'
                  }`} />

                  <div className="p-5">
                    <div className="flex gap-4">
                      <div className="shrink-0">
                        <img
                          src={
                            item.player.profileImage ||
                            'https://via.placeholder.com/96'
                          }
                          alt=""
                          className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover ring-2 ring-mgsr-border"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-display font-bold text-mgsr-text text-lg truncate">
                          {displayName}
                        </h3>
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${isYouth ? 'bg-[var(--youth-cyan)]/15 text-[var(--youth-cyan)]' : isWomen ? 'bg-[var(--women-rose)]/15 text-[var(--women-rose)]' : 'bg-mgsr-teal/15 text-mgsr-teal'}`}>
                          {item.lang === 'he' ? t('portfolio_version_hebrew') : t('portfolio_version_english')}
                        </span>
                        {item.targetClubName && (
                          <span className="inline-block mt-1 ms-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-400">
                            {isRtl ? 'עבור' : 'For'} {item.targetClubName}{item.targetClubPosition ? ` — ${item.targetClubPosition}` : ''}
                          </span>
                        )}
                        <p className="text-sm text-mgsr-muted mt-0.5">
                          {item.player.positions?.filter(Boolean).join(' • ') ||
                            '—'}
                        </p>
                        {item.player.currentClub?.clubName && (
                          <p className="text-sm text-mgsr-text mt-1">
                            {item.player.currentClub.clubName}
                          </p>
                        )}
                        {item.player.marketValue && (
                          <p className={`font-semibold mt-2 ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}>
                            {item.player.marketValue}
                          </p>
                        )}
                      </div>
                    </div>

                    {item.scoutReport && (
                      <p className="mt-4 text-sm text-mgsr-muted line-clamp-3 leading-relaxed">
                        {item.scoutReport.replace(/^## .+$/gm, '').replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1').replace(/\n{2,}/g, ' ').trim()}
                      </p>
                    )}

                    <div className="mt-5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIncludePlayerContact(false);
                          setIncludeAgencyContact(false);
                          setShowShareModal(item.id);
                        }}
                        disabled={isSharing}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium disabled:opacity-50 transition ${isYouth ? 'bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] hover:bg-[var(--youth-cyan)]/30' : isWomen ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30' : 'bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30'}`}
                      >
                        {isSharing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
                            {isRtl ? 'מכין...' : 'Preparing...'}
                          </>
                        ) : (
                          <>
                            <svg
                              className="w-5 h-5"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            {t('portfolio_share')}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleView(item)}
                        disabled={!!viewingId}
                        className="px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-text font-medium hover:bg-mgsr-card/80 transition disabled:opacity-50 flex items-center gap-2"
                      >
                            {viewingId ? (
                          <>
                            <div className={`w-4 h-4 border-2 border-t-transparent rounded-full animate-spin ${isYouth ? 'border-[var(--youth-cyan)]' : isWomen ? 'border-[var(--women-rose)]' : 'border-mgsr-teal'}`} />
                            {isRtl ? 'טוען...' : 'Loading...'}
                          </>
                        ) : (
                          isRtl ? 'צפה / ערוך' : 'View / Edit'
                        )}
                      </button>
                      {isMine && (
                        <button
                          type="button"
                          onClick={() => handleRemove(item.id)}
                          className="p-2.5 rounded-xl text-mgsr-muted hover:text-red-400 hover:bg-red-500/10 transition"
                          title={isRtl ? 'הסר' : 'Remove'}
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4m1 4h.01M12 4h.01"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Share modal for this card - checkbox for attach contact */}
                  {showShareForThis && (
                    <div
                      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
                      onClick={() => setShowShareModal(null)}
                    >
                      <div className="absolute inset-0 bg-black/60" aria-hidden />
                      <div
                        dir={isRtl ? 'rtl' : 'ltr'}
                        className="relative w-full max-w-md bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-6"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <h3 className="text-lg font-display font-semibold text-mgsr-text mb-2">
                          {t('portfolio_share')}
                        </h3>
                        <div className="space-y-3 mb-4">
                          {(() => {
                            const hasPlayer = !!(
                              (item.player as { playerPhoneNumber?: string }).playerPhoneNumber
                            );
                            return hasPlayer ? (
                              <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={includePlayerContact}
                                  onChange={(e) => setIncludePlayerContact(e.target.checked)}
                                  className={`mt-1 w-4 h-4 rounded border-mgsr-border focus:ring-mgsr-teal ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}
                                />
                                <span className="text-sm text-mgsr-text">
                                  {t('portfolio_share_attach_player_contact')}
                                </span>
                              </label>
                            ) : null;
                          })()}
                          {(() => {
                            const hasAgency = !!(
                              item.player.agentPhoneNumber
                            );
                            return hasAgency ? (
                              <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={includeAgencyContact}
                                  onChange={(e) => setIncludeAgencyContact(e.target.checked)}
                                  className={`mt-1 w-4 h-4 rounded border-mgsr-border focus:ring-mgsr-teal ${isYouth ? 'text-[var(--youth-cyan)]' : isWomen ? 'text-[var(--women-rose)]' : 'text-mgsr-teal'}`}
                                />
                                <span className="text-sm text-mgsr-text">
                                  {t('portfolio_share_attach_agency_contact')}
                                </span>
                              </label>
                            ) : null;
                          })()}
                          {!(
                            (item.player as { playerPhoneNumber?: string }).playerPhoneNumber ||
                            item.player.agentPhoneNumber
                          ) && (
                            <p className="text-sm text-mgsr-muted">
                              {t('portfolio_share_no_contact')}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => setShowShareModal(null)}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-text hover:bg-mgsr-card/80"
                          >
                            {t('portfolio_share_cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleShare(item, includePlayerContact, includeAgencyContact)}
                            disabled={isSharing}
                            className={`flex-1 px-4 py-2.5 rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2 ${isYouth ? 'bg-[var(--youth-cyan)] text-mgsr-dark hover:opacity-90' : isWomen ? 'bg-[var(--women-rose)] text-mgsr-dark hover:opacity-90' : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'}`}
                          >
                            {isSharing ? (
                              <>
                                <div className="w-4 h-4 border-2 border-mgsr-dark border-t-transparent rounded-full animate-spin" />
                                {isRtl ? 'מכין...' : 'Preparing...'}
                              </>
                            ) : (
                              <>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                                {t('portfolio_share_via_whatsapp')}
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* View loading overlay - full screen while preparing share and navigating */}
        {viewingId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-mgsr-card border border-mgsr-border"
            >
              <div className={`w-10 h-10 border-2 border-t-transparent rounded-full animate-spin ${isYouth ? 'border-[var(--youth-cyan)]' : isWomen ? 'border-[var(--women-rose)]' : 'border-mgsr-teal'}`} />
              <p className="text-mgsr-text font-medium">
                {isRtl ? 'מכין דף תצוגה...' : 'Preparing preview...'}
              </p>
            </div>
          </div>
        )}

        {/* Share setup modal (localhost) */}
        {showShareSetupModal && pendingShareUrl && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => {
              setShowShareSetupModal(false);
              setPendingShareUrl(null);
            }}
          >
            <div className="absolute inset-0 bg-black/60" aria-hidden />
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="relative w-full max-w-md bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-display font-semibold text-mgsr-text mb-3">
                {isRtl ? 'לינק localhost לא יעבוד בטלפון' : 'localhost links won\'t work on phone'}
              </h3>
              <p className="text-sm text-mgsr-muted mb-4">
                {isRtl
                  ? 'הלינק לא יפתח בטלפון. פתח WhatsApp בכל זאת או העתק לינק.'
                  : 'The link won\'t open on phone. Open WhatsApp anyway or copy link.'}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openWhatsAppShare(pendingShareUrl);
                    setShowShareSetupModal(false);
                    setPendingShareUrl(null);
                  }}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-medium ${isYouth ? 'bg-[var(--youth-cyan)] text-mgsr-dark hover:opacity-90' : isWomen ? 'bg-[var(--women-rose)] text-mgsr-dark hover:opacity-90' : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'}`}
                >
                  {isRtl ? 'פתח WhatsApp בכל זאת' : 'Open WhatsApp anyway'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      pendingShareUrl.split('\n')[1] || pendingShareUrl
                    );
                    setShowShareSetupModal(false);
                    setPendingShareUrl(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-text hover:bg-mgsr-card/80"
                >
                  {isRtl ? 'העתק לינק' : 'Copy link'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
