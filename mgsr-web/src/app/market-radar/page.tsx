'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePlatform } from '@/contexts/PlatformContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { callShortlistAdd } from '@/lib/callables';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { SHORTLISTS_COLLECTIONS, CLUB_REQUESTS_COLLECTIONS } from '@/lib/platformCollections';
import AppLayout from '@/components/AppLayout';
import { getMarketRadar } from '@/lib/api';
import { type MarketRadarItem, type MarketRegion, type MarketSignalType } from '@/lib/marketRadar';
import { openWhatsAppShare } from '@/lib/whatsapp';

interface ClubRequestData {
  id: string;
  clubName?: string;
  position?: string;
  notes?: string;
}

const REGION_OPTIONS: { id: MarketRegion; labelKey: string; flag: string }[] = [
  { id: 'all', labelKey: 'radar_region_all', flag: '🌍' },
  { id: 'israel_greece', labelKey: 'radar_region_israel_greece', flag: '🇮🇱' },
  { id: 'eastern_eu', labelKey: 'radar_region_eastern_eu', flag: '🇷🇴' },
  { id: 'turkey_balkans', labelKey: 'radar_region_turkey_balkans', flag: '🇹🇷' },
  { id: 'nordics', labelKey: 'radar_region_nordics', flag: '🇸🇪' },
  { id: 'mid_tier_west', labelKey: 'radar_region_mid_tier_west', flag: '🇧🇪' },
  { id: 'south_america_gulf', labelKey: 'radar_region_south_america_gulf', flag: '🇧🇷' },
  { id: 'social', labelKey: 'radar_region_social', flag: '📱' },
];

const SIGNAL_TABS: { id: MarketSignalType | 'all'; labelKey: string; icon: string; badgeClass: string }[] = [
  { id: 'all', labelKey: 'radar_signal_all', icon: '⚡', badgeClass: 'bg-mgsr-gold/15 text-mgsr-gold border-mgsr-gold/30' },
  { id: 'DISPUTE_CLAIM', labelKey: 'radar_signal_dispute', icon: '⚖️', badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { id: 'OUT_OF_PLANS', labelKey: 'radar_signal_out_of_plans', icon: '🔴', badgeClass: 'bg-rose-500/15 text-rose-400 border-rose-500/30' },
  { id: 'FOREIGN_QUOTA', labelKey: 'radar_signal_quota', icon: '🚫', badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  { id: 'COLLAPSED_DEAL', labelKey: 'radar_signal_collapsed', icon: '⚠️', badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  { id: 'CONTRACT_STANDOFF', labelKey: 'radar_signal_contract', icon: '⏳', badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  { id: 'TRANSFER_LISTED', labelKey: 'radar_signal_listed', icon: '🟢', badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
];

export default function MarketRadarPage() {
  const { user } = useAuth();
  const { t, isRtl } = useLanguage();
  const { platform } = usePlatform();

  const [items, setItems] = useState<MarketRadarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<MarketRegion>('all');
  const [selectedSignal, setSelectedSignal] = useState<MarketSignalType | 'all'>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});

  // Shortlist tracking
  const [shortlistNames, setShortlistNames] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);

  // Active Club Requests for matching
  const [clubRequests, setClubRequests] = useState<ClubRequestData[]>([]);

  // Pitch Modal state
  const [pitchItem, setPitchItem] = useState<MarketRadarItem | null>(null);
  const [pitchClubName, setPitchClubName] = useState('');
  const [pitchCopied, setPitchCopied] = useState(false);

  // Subscribe to Shortlists
  useEffect(() => {
    if (!user) return;
    const colName = SHORTLISTS_COLLECTIONS[platform] ?? 'Shortlists';
    const unsub = onSnapshot(collection(db, colName), (snap) => {
      const names = new Set<string>();
      snap.docs.forEach((d) => {
        const name = d.data().playerName as string | undefined;
        if (name) names.add(name.toLowerCase().trim());
      });
      setShortlistNames(names);
    });
    return () => unsub();
  }, [user, platform]);

  // Subscribe to Club Requests
  useEffect(() => {
    if (!user) return;
    const reqCol = CLUB_REQUESTS_COLLECTIONS[platform] ?? 'ClubRequests';
    const unsub = onSnapshot(collection(db, reqCol), (snap) => {
      const reqs: ClubRequestData[] = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.clubName) {
          reqs.push({
            id: d.id,
            clubName: data.clubName,
            position: data.position,
            notes: data.notes,
          });
        }
      });
      setClubRequests(reqs);
    });
    return () => unsub();
  }, [user, platform]);

  // Fetch Radar Feed
  const fetchFeed = useCallback(async (force = false) => {
    try {
      if (force) setRefreshing(true);
      else setLoading(true);
      setError('');

      const data = await getMarketRadar({
        region: selectedRegion === 'all' ? undefined : selectedRegion,
        signal: selectedSignal === 'all' ? undefined : selectedSignal,
        refresh: force,
      });

      setItems(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load Market Radar:', err);
      setError(err instanceof Error ? err.message : 'Error loading secret market feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedRegion, selectedSignal]);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchFeed();
  }, [fetchFeed]);

  const handleRegionChange = (reg: MarketRegion) => {
    setSelectedRegion(reg);
    setLoading(true);
    getMarketRadar({
      region: reg === 'all' ? undefined : reg,
      signal: selectedSignal === 'all' ? undefined : selectedSignal,
    }).then(d => {
      setItems(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const filteredItems = useMemo(() => {
    let result = items;

    if (selectedSignal !== 'all') {
      result = result.filter(it => it.signalType === selectedSignal);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(it =>
        it.headline.toLowerCase().includes(q) ||
        (it.originalHeadline && it.originalHeadline.toLowerCase().includes(q)) ||
        (it.summary && it.summary.toLowerCase().includes(q)) ||
        (it.agentTakeaway && it.agentTakeaway.toLowerCase().includes(q)) ||
        it.leagueName.toLowerCase().includes(q) ||
        it.country.toLowerCase().includes(q) ||
        it.sourceName.toLowerCase().includes(q) ||
        (it.detectedPlayer?.name && it.detectedPlayer.name.toLowerCase().includes(q)) ||
        (it.detectedPlayer?.club && it.detectedPlayer.club.toLowerCase().includes(q)) ||
        (it.detectedPlayer?.position && it.detectedPlayer.position.toLowerCase().includes(q)) ||
        it.matchedKeywords.some(k => k.toLowerCase().includes(q))
      );
    }

    return result;
  }, [items, selectedSignal, search]);

  const immediateCount = useMemo(() => {
    return items.filter(it => it.signalType === 'DISPUTE_CLAIM' || it.signalType === 'OUT_OF_PLANS' || it.signalType === 'FOREIGN_QUOTA').length;
  }, [items]);

  const handleAddToShortlist = async (item: MarketRadarItem) => {
    if (!user || !item.detectedPlayer?.name) return;
    setAddingId(item.id);
    try {
      const account = await getCurrentAccountForShortlist(user);
      await callShortlistAdd({
        platform,
        playerName: item.detectedPlayer.name,
        playerPosition: item.detectedPlayer.position || null,
        playerAge: item.detectedPlayer.age ? Number(item.detectedPlayer.age) : null,
        clubJoinedName: item.detectedPlayer.club || null,
        marketValue: item.detectedPlayer.marketValue || null,
        playerNationality: item.detectedPlayer.nationality || null,
        tmProfileUrl: item.detectedPlayer.tmSearchUrl || `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(item.detectedPlayer.name)}`,
        notes: `Secret Radar: ${item.summary || item.signalReason} (${item.sourceName} · ${item.leagueName})`,
        addedByAgentId: account.id,
        addedByAgentName: account.name ?? null,
        addedByAgentHebrewName: account.hebrewName ?? null,
      });
    } catch (err) {
      console.error('Failed to add to shortlist:', err);
    } finally {
      setAddingId(null);
    }
  };

  const toggleOriginal = (id: string) => {
    setShowOriginalMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getMatchingRequests = (item: MarketRadarItem) => {
    const text = `${item.headline} ${item.summary || ''} ${item.detectedPlayer?.name || ''} ${item.detectedPlayer?.position || ''}`.toLowerCase();
    return clubRequests.filter(req => {
      if (req.position && text.includes(req.position.toLowerCase())) return true;
      if (req.clubName && text.includes(req.clubName.toLowerCase())) return true;
      return false;
    });
  };

  const generatePitchText = (item: MarketRadarItem, targetClub = '') => {
    const playerName = item.detectedPlayer?.name || 'the player';
    const playerClub = item.detectedPlayer?.club ? ` (${item.detectedPlayer.club})` : '';
    const pos = item.detectedPlayer?.position ? ` [${item.detectedPlayer.position}]` : '';
    const league = item.leagueName;
    const club = targetClub || (isRtl ? 'המועדון' : 'the club');

    if (isRtl) {
      if (item.signalType === 'DISPUTE_CLAIM') {
        return `שלום, מעדכן במידע סודי: ${playerName}${pos}${playerClub} מ-${league} הגיש תביעת בוררות רשמית להתרת חוזה מיידית עקב הלנת שכר ויהיה שחקן חופשי ללא דמי העברה בימים הקרובים. פרופיל מעולה לחיזוק ${club}. תרצו שנפתח מולו במגעים ראשוניים?`;
      }
      if (item.signalType === 'OUT_OF_PLANS') {
        return `שלום, רציתי לעדכן שקיבלנו מודיעין לפיו ${playerName}${pos}${playerClub} מ-${league} נודה מהסגל ומתאמן בנפרד (B-Kern / Kadro Dışı). המועדון פתוח להשאלה מיידית עם השתתפות משמעותית בשכר. האם רלוונטי לחיזוק ${club}?`;
      }
      if (item.signalType === 'FOREIGN_QUOTA') {
        return `שלום, ${playerName}${pos}${playerClub} מ-${league} הוקפא/נגרע מרישום הליגה עקב חריגת מכסת זרים. השחקן בכושר מלא וחייב לצאת בהשאלה מיידית. מתאים מאוד לסגל של ${club}.`;
      }
      if (item.signalType === 'COLLAPSED_DEAL') {
        return `שלום, מעדכן שהמעבר של ${playerName}${pos}${playerClub} מ-${league} נפל ברגע האחרון עקב תנאי תשלום בין המועדונים. השחקן בכושר משחק מלא ומוכן לסגור יעד חדש מיידית. מתאים מאוד לסגל של ${club}.`;
      }
      return `שלום, לגבי ${playerName}${pos}${playerClub} מ-${league} - בעקבות שינוי במעמדו בקבוצה הוא פנוי וזמין להצטרפות בתנאים מעולים. מתאים מאוד לפרופיל של ${club}. מעוניינים בפרטים נוספים?`;
    }

    if (item.signalType === 'DISPUTE_CLAIM') {
      return `Hi, confidential market alert: ${playerName}${pos}${playerClub} from ${league} has officially filed an arbitration dispute for contract dissolution and is becoming a direct free agent with zero transfer fee. High-value profile for ${club}. Would you like us to initiate terms with his representation?`;
    }
    if (item.signalType === 'OUT_OF_PLANS') {
      return `Hi, I wanted to reach out regarding ${playerName}${pos}${playerClub} from ${league}. He has been formally demoted to train separately and the club is actively seeking an immediate loan with wage subsidy. Exceptional fit for ${club}.`;
    }
    if (item.signalType === 'FOREIGN_QUOTA') {
      return `Hi, ${playerName}${pos}${playerClub} from ${league} has been deregistered from his club roster due to foreign quota limits. He is match-fit and available immediately. Would ${club} be open to exploring his mandate?`;
    }
    if (item.signalType === 'COLLAPSED_DEAL') {
      return `Hi, quick update on ${playerName}${pos}${playerClub} from ${league} - his recent transfer collapsed on deadline day over club payment structure. The player is fully fit and looking for an immediate move. Would ${club} be interested?`;
    }
    return `Hi, regarding ${playerName}${pos}${playerClub} from ${league}, he is currently available under favourable terms due to recent club changes. He matches the exact requirements for ${club}. Let me know if you want his dossier.`;
  };

  return (
    <AppLayout>
      <div className={`min-h-screen pb-16 ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>
        
        {/* ── Top Header ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-mgsr-gold/15 text-mgsr-gold border border-mgsr-gold/30 uppercase tracking-widest animate-pulse">
                ⚡ {t('radar_under_2_weeks')}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30 uppercase tracking-widest">
                SECRET WIRES & ARBITRATION
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
              📡 {t('radar_title')}
            </h1>
            <p className="text-sm text-white/60 mt-1 max-w-2xl">
              {t('radar_subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-white/40 hidden md:inline font-mono">
                {t('news_updated_ago')} {Math.round((Date.now() - lastUpdated.getTime()) / 60000)}m
              </span>
            )}
            <button
              onClick={() => fetchFeed(true)}
              disabled={loading || refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-mgsr-card border border-mgsr-border text-white/90 hover:text-mgsr-gold hover:border-mgsr-gold/50 transition text-sm font-semibold shadow-sm active:scale-95 disabled:opacity-50"
            >
              <span className={refreshing ? 'animate-spin' : ''}>🔄</span>
              <span>{refreshing ? t('news_loading') : t('news_refresh')}</span>
            </button>
          </div>
        </div>

        {/* ── Stats Overview ────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-gradient-to-br from-mgsr-card to-mgsr-card/60 backdrop-blur-md border border-mgsr-border rounded-2xl p-4 text-center shadow-lg relative overflow-hidden">
            <div className="text-2xl sm:text-3xl font-black text-mgsr-gold">
              {loading ? <span className="inline-block w-4 h-4 border-2 border-mgsr-gold border-t-transparent rounded-full animate-spin" /> : items.length}
            </div>
            <div className="text-[11px] text-white/60 font-medium uppercase tracking-wider mt-1">{t('radar_stat_total')}</div>
          </div>

          <div className="bg-gradient-to-br from-mgsr-card to-mgsr-card/60 backdrop-blur-md border border-mgsr-border rounded-2xl p-4 text-center shadow-lg relative overflow-hidden">
            <div className="text-2xl sm:text-3xl font-black text-red-400">
              {loading ? <span className="inline-block w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : immediateCount}
            </div>
            <div className="text-[11px] text-white/60 font-medium uppercase tracking-wider mt-1">{t('radar_stat_critical')}</div>
          </div>

          <div className="bg-gradient-to-br from-mgsr-card to-mgsr-card/60 backdrop-blur-md border border-mgsr-border rounded-2xl p-4 text-center shadow-lg relative overflow-hidden">
            <div className="text-2xl sm:text-3xl font-black text-blue-400">25+</div>
            <div className="text-[11px] text-white/60 font-medium uppercase tracking-wider mt-1">{t('radar_stat_regions')}</div>
          </div>

          <div className="bg-gradient-to-br from-mgsr-card to-mgsr-card/60 backdrop-blur-md border border-mgsr-border rounded-2xl p-4 text-center shadow-lg relative overflow-hidden">
            <div className="text-2xl sm:text-3xl font-black text-emerald-400">14d</div>
            <div className="text-[11px] text-white/60 font-medium uppercase tracking-wider mt-1">{t('radar_stat_timeframe')}</div>
          </div>
        </div>

        {/* ── Target Market Regions Filter Bar ──────────────────────── */}
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
            {REGION_OPTIONS.map(reg => (
              <button
                key={reg.id}
                onClick={() => handleRegionChange(reg.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition flex items-center gap-1.5 min-h-[36px] ${
                  selectedRegion === reg.id
                    ? 'bg-mgsr-gold text-black border-mgsr-gold shadow-md shadow-mgsr-gold/20'
                    : 'bg-mgsr-card border-mgsr-border text-white/70 hover:border-mgsr-gold/40 hover:text-white'
                }`}
              >
                <span>{reg.flag}</span>
                <span>{t(reg.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Signal Tabs & Search ──────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none" style={{ WebkitOverflowScrolling: 'touch' }}>
            {SIGNAL_TABS.map(tab => {
              const count = tab.id === 'all'
                ? items.length
                : items.filter(it => it.signalType === tab.id).length;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedSignal(tab.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 min-h-[38px] ${
                    selectedSignal === tab.id
                      ? 'bg-white/15 border-white/40 text-white shadow-sm'
                      : 'bg-mgsr-card/60 border-mgsr-border text-white/60 hover:text-white hover:border-white/20'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{t(tab.labelKey)}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    selectedSignal === tab.id ? 'bg-black/40 text-white' : 'bg-white/5 text-white/50'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 bg-mgsr-card border border-mgsr-border rounded-xl px-3.5 py-2 w-full lg:w-80 shadow-sm focus-within:border-mgsr-gold transition">
            <span className="text-white/40 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('radar_search_placeholder')}
              className="bg-transparent border-none outline-none text-white text-sm w-full placeholder:text-white/30"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-white/40 hover:text-white text-xs">
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── Error Banner ──────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4 mb-6 text-sm flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => fetchFeed(true)} className="underline hover:text-white text-xs">
              {t('news_refresh')}
            </button>
          </div>
        )}

        {/* ── Loading Skeleton ──────────────────────────────────────── */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-mgsr-card border border-mgsr-border rounded-2xl p-5 animate-pulse space-y-4">
                <div className="flex justify-between items-center">
                  <div className="h-6 bg-white/10 rounded-full w-48" />
                  <div className="h-4 bg-white/10 rounded w-24" />
                </div>
                <div className="h-16 bg-white/5 rounded-xl w-full" />
                <div className="h-5 bg-white/10 rounded w-3/4" />
                <div className="h-4 bg-white/5 rounded w-5/6" />
                <div className="flex gap-2 pt-2">
                  <div className="h-9 bg-white/10 rounded-xl w-32" />
                  <div className="h-9 bg-white/10 rounded-xl w-32" />
                </div>
              </div>
            ))}
            <p className="text-center text-white/40 text-sm pt-2">{t('news_loading')}</p>
          </div>
        )}

        {/* ── Empty State ───────────────────────────────────────────── */}
        {!loading && filteredItems.length === 0 && (
          <div className="text-center py-20 bg-mgsr-card/50 border border-mgsr-border rounded-2xl p-6">
            <div className="text-5xl mb-3">📡</div>
            <h3 className="text-lg font-bold text-white mb-1">{t('radar_empty_title')}</h3>
            <p className="text-sm text-white/50 max-w-md mx-auto mb-4">{t('radar_empty_desc')}</p>
            <button
              onClick={() => { setSelectedRegion('all'); setSelectedSignal('all'); setSearch(''); fetchFeed(true); }}
              className="px-4 py-2 rounded-xl bg-mgsr-gold text-black font-semibold text-xs hover:bg-mgsr-gold/90 transition shadow-md"
            >
              🔄 {t('news_refresh')}
            </button>
          </div>
        )}

        {/* ── Opportunity Dossier Cards Feed ────────────────────────── */}
        {!loading && filteredItems.length > 0 && (
          <div className="space-y-4">
            {filteredItems.map(item => {
              const showOriginal = !!showOriginalMap[item.id];
              const displayHeadline = showOriginal ? (item.originalHeadline || item.headline) : item.headline;
              const matchingReqs = getMatchingRequests(item);
              const isAddedToShortlist = item.detectedPlayer?.name
                ? shortlistNames.has(item.detectedPlayer.name.toLowerCase().trim())
                : false;

              const badgeConfig = SIGNAL_TABS.find(t => t.id === item.signalType) || SIGNAL_TABS[0];
              const signalLabel = t(badgeConfig.labelKey);

              return (
                <div
                  key={item.id}
                  onClick={() => window.open(item.url, '_blank')}
                  className="bg-gradient-to-br from-mgsr-card via-mgsr-card/95 to-mgsr-card/80 border border-mgsr-border hover:border-mgsr-gold/70 hover:shadow-2xl hover:shadow-mgsr-gold/5 rounded-2xl p-5 sm:p-6 transition-all shadow-md group relative overflow-hidden cursor-pointer"
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      window.open(item.url, '_blank');
                    }
                  }}
                >
                  {/* Top Metadata Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 pb-3 border-b border-white/5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${badgeConfig.badgeClass}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                        <span>{badgeConfig.icon}</span>
                        <span>{signalLabel}</span>
                      </span>

                      {item.isSocial && (
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-pink-500/15 text-pink-400 border border-pink-500/30 flex items-center gap-1">
                          <span>📷</span>
                          <span>{t('radar_source_social')}</span>
                        </span>
                      )}

                      <span className="text-xs text-white/50 flex items-center gap-1.5 font-medium">
                        <span>{item.countryFlag}</span>
                        <span>{item.leagueName}</span>
                        <span>·</span>
                        <span className="text-white/80 font-semibold">{item.sourceName}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-white/40">
                      <span className="font-mono">{item.timeAgo || item.dateFormatted}</span>
                      {item.originalLang !== 'en' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleOriginal(item.id);
                          }}
                          className="px-2.5 py-0.5 rounded border border-white/10 text-[10px] text-white/60 hover:text-mgsr-gold hover:border-mgsr-gold/40 transition z-10"
                        >
                          {showOriginal ? `🇺🇸 ${t('radar_toggle_translated')}` : `🌐 ${t('radar_toggle_original')} (${item.originalLang.toUpperCase()})`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Player Opportunity Dossier Banner ── */}
                  {item.detectedPlayer?.name && (
                    <div className="mb-4 p-3.5 sm:p-4 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-mgsr-gold/20 to-mgsr-gold/5 border border-mgsr-gold/40 flex items-center justify-center text-lg font-black text-mgsr-gold shadow-inner flex-shrink-0">
                          👤
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base sm:text-lg font-black text-white group-hover:text-mgsr-gold transition">
                              {item.detectedPlayer.name}
                            </span>
                            {item.detectedPlayer.position && (
                              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[11px] border border-blue-500/30">
                                {item.detectedPlayer.position}
                              </span>
                            )}
                            {item.detectedPlayer.age && (
                              <span className="text-xs text-white/50 bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">
                                {item.detectedPlayer.age}y
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-white/60 mt-1 flex-wrap">
                            {item.detectedPlayer.club && (
                              <span className="font-medium text-white/80">
                                {item.countryFlag} {item.detectedPlayer.club}
                              </span>
                            )}
                            {item.detectedPlayer.marketValue && (
                              <span className="font-semibold text-emerald-400">
                                💰 {item.detectedPlayer.marketValue}
                              </span>
                            )}
                            {item.detectedPlayer.nationality && (
                              <span className="text-white/50">
                                🌍 {item.detectedPlayer.nationality}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {item.detectedPlayer.tmSearchUrl && (
                        <a
                          href={item.detectedPlayer.tmSearchUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 hover:bg-mgsr-gold/20 text-mgsr-gold border border-mgsr-gold/30 transition flex items-center gap-1 z-10 shadow-sm"
                        >
                          <span>🌐 {t('radar_btn_tm')}</span>
                          <span className="text-[10px]">↗</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Headline (Crystal Clear English) */}
                  <h3 className="text-base sm:text-lg font-bold text-white mb-2.5 leading-snug group-hover:text-mgsr-gold transition">
                    {displayHeadline}
                  </h3>

                  {/* Situation Brief */}
                  {item.summary && (
                    <div className="text-sm text-white/80 leading-relaxed mb-3.5 bg-black/20 p-3 rounded-xl border border-white/5">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white/40 block mb-1 font-mono">
                        📋 {t('radar_summary')}
                      </span>
                      {item.summary}
                    </div>
                  )}

                  {/* Agent Opportunity Takeaway Callout */}
                  {item.agentTakeaway && (
                    <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-start gap-2.5 shadow-sm">
                      <span className="text-base leading-none">💡</span>
                      <div>
                        <strong className="font-bold text-amber-200 uppercase tracking-wide block text-[11px] mb-0.5">
                          {t('radar_agent_takeaway')}:
                        </strong>
                        <span className="leading-relaxed text-amber-100">{item.agentTakeaway}</span>
                      </div>
                    </div>
                  )}

                  {/* Matching Club Request Notification */}
                  {matchingReqs.length > 0 && (
                    <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2 shadow-sm">
                      <span className="text-base">🎯</span>
                      <span>
                        {t('radar_match_request')}: {matchingReqs.map(r => r.clubName).filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5 flex-wrap">
                    <div className="flex items-center gap-2">
                      {/* Shortlist Action */}
                      {item.detectedPlayer?.name && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToShortlist(item);
                          }}
                          disabled={isAddedToShortlist || addingId === item.id}
                          className={`text-xs px-3.5 py-1.5 rounded-lg border transition font-semibold min-h-[36px] flex items-center gap-1.5 z-10 shadow-sm ${
                            isAddedToShortlist
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 cursor-default'
                              : 'border-mgsr-gold/50 text-mgsr-gold hover:bg-mgsr-gold/15 active:scale-95'
                          }`}
                        >
                          <span>⭐</span>
                          <span>{isAddedToShortlist ? t('news_tag_shortlist') : (addingId === item.id ? '...' : t('radar_btn_shortlist'))}</span>
                        </button>
                      )}

                      {/* Pitch Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPitchItem(item);
                          setPitchClubName(matchingReqs[0]?.clubName || '');
                          setPitchCopied(false);
                        }}
                        className="text-xs px-3.5 py-1.5 rounded-lg border border-blue-400/40 text-blue-400 hover:bg-blue-400/15 transition font-semibold min-h-[36px] flex items-center gap-1.5 active:scale-95 z-10 shadow-sm"
                      >
                        <span>📋</span>
                        <span>{t('radar_btn_pitch')}</span>
                      </button>
                    </div>

                    {/* Source Article Link Indicator */}
                    <span className="text-xs text-white/50 group-hover:text-mgsr-gold flex items-center gap-1 transition min-h-[36px] px-2 py-1 font-medium">
                      <span>{t('radar_btn_source')}</span>
                      <span>↗</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Draft Pitch Modal / Drawer ────────────────────────────── */}
        {pitchItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
            <div className="bg-mgsr-card border border-mgsr-border rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    📋 {t('radar_pitch_modal_title')}
                  </h3>
                  <p className="text-xs text-white/50">{t('radar_pitch_modal_desc')}</p>
                </div>
                <button
                  onClick={() => setPitchItem(null)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Target Club Input */}
              <div>
                <label className="text-xs text-white/60 block mb-1 font-medium">Target Club Name:</label>
                <input
                  type="text"
                  value={pitchClubName}
                  onChange={e => setPitchClubName(e.target.value)}
                  placeholder="e.g. Maccabi Tel Aviv, Panathinaikos, Genk, CFR Cluj..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-mgsr-gold outline-none"
                />
              </div>

              {/* Generated Text Area */}
              <div>
                <label className="text-xs text-white/60 block mb-1 font-medium">Pitch Preview:</label>
                <textarea
                  readOnly
                  rows={5}
                  value={generatePitchText(pitchItem, pitchClubName)}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm text-white/90 font-mono resize-none outline-none leading-relaxed"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatePitchText(pitchItem, pitchClubName));
                    setPitchCopied(true);
                    setTimeout(() => setPitchCopied(false), 2500);
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                >
                  {pitchCopied ? `✓ ${t('radar_pitch_copied')}` : `📋 ${t('radar_pitch_copy')}`}
                </button>

                <button
                  onClick={() => {
                    openWhatsAppShare(generatePitchText(pitchItem, pitchClubName));
                  }}
                  className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md active:scale-95"
                >
                  <span>💬</span>
                  <span>{t('radar_pitch_send_whatsapp')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  );
}
