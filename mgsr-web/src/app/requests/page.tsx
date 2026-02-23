'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, onSnapshot, doc, deleteDoc, getDoc, setDoc, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppLayout from '@/components/AppLayout';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { matchRequestToPlayers, type RosterPlayer } from '@/lib/requestMatcher';
import { findPlayersForRequest, type ScoutPlayerSuggestion } from '@/lib/scoutApi';
import { getPlayerDetails } from '@/lib/api';
import { getCurrentAccountForShortlist, useShortlistDocId, SHARED_SHORTLIST_DOC_ID } from '@/lib/accounts';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import AddRequestSheet from './AddRequestSheet';

interface Request {
  id: string;
  clubTmProfile?: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  contactId?: string;
  contactName?: string;
  contactPhoneNumber?: string;
  position?: string;
  quantity?: number;
  notes?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  salaryRange?: string;
  transferFee?: string;
  dominateFoot?: string;
  createdAt?: number;
  status?: string;
}

const CLUB_REQUESTS_COLLECTION = 'ClubRequests';

const POSITION_DISPLAY: Record<string, { en: string; he: string }> = {
  GK: { en: 'Goalkeeper', he: 'שוער' },
  CB: { en: 'Center Back', he: 'בלם' },
  RB: { en: 'Right Back', he: 'מגן ימני' },
  LB: { en: 'Left Back', he: 'מגן שמאלי' },
  DM: { en: 'Defensive Midfielder', he: 'קשר אחורי' },
  CM: { en: 'Central Midfielder', he: 'קשר מרכזי' },
  AM: { en: 'Attacking Midfielder', he: 'קשר התקפי' },
  LM: { en: 'Left Midfielder', he: 'קשר שמאלי' },
  RM: { en: 'Right Midfielder', he: 'קשר ימני' },
  LW: { en: 'Left Winger', he: 'כנף שמאל' },
  RW: { en: 'Right Winger', he: 'כנף ימין' },
  CF: { en: 'Center Forward', he: 'חלוץ מרכזי' },
  ST: { en: 'Striker', he: 'חלוץ' },
  SS: { en: 'Second Striker', he: 'חלוץ שני' },
};

function getPositionDisplayName(position: string | undefined, isHebrew: boolean): string {
  if (!position?.trim()) return position || '';
  const key = position.trim().toUpperCase();
  const entry = POSITION_DISPLAY[key];
  if (!entry) return position.trim();
  return isHebrew ? entry.he : entry.en;
}

function footLabel(foot?: string, t: (k: string) => string = (k) => k): string {
  if (!foot) return '';
  if (foot === 'left') return t('player_info_foot_left');
  if (foot === 'right') return t('player_info_foot_right');
  return t('player_info_foot_both');
}

function ageRange(r: Request): string | null {
  if (r.ageDoesntMatter !== false && !r.minAge && !r.maxAge) return null;
  if (r.minAge && r.maxAge) return `${r.minAge}–${r.maxAge}`;
  if (r.minAge) return `${r.minAge}+`;
  if (r.maxAge) return `≤${r.maxAge}`;
  return null;
}

/** Renders clubCountryFlag: if it's a URL, show as img; otherwise skip (never show raw URL as text). */
function FlagImage({ url, country, className }: { url?: string; country?: string; className?: string }) {
  if (!url?.trim()) return null;
  if (!url.startsWith('http')) return null;
  return (
    <img
      src={url}
      alt={country || ''}
      className={className ?? 'w-6 h-6 rounded-full object-cover'}
    />
  );
}

interface RequestsCache {
  requests: Request[];
  players: RosterPlayer[];
  shortlistUrls: string[];
}

export default function RequestsPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang } = useLanguage();
  const router = useRouter();
  const cached = user ? getScreenCache<RequestsCache>('requests', user.uid) : undefined;
  const [requests, setRequests] = useState<Request[]>(cached?.requests ?? []);
  const [loadingList, setLoadingList] = useState(cached === undefined);
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<Request | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [players, setPlayers] = useState<RosterPlayer[]>(cached?.players ?? []);
  const [expandedMatchingPlayers, setExpandedMatchingPlayers] = useState<Set<string>>(new Set());
  const [scoutLoadingRequestId, setScoutLoadingRequestId] = useState<string | null>(null);
  const [scoutResultsByRequestId, setScoutResultsByRequestId] = useState<Record<string, ScoutPlayerSuggestion[]>>({});
  const [scoutExpandedRequestId, setScoutExpandedRequestId] = useState<string | null>(null);
  const [addingToShortlistUrl, setAddingToShortlistUrl] = useState<string | null>(null);
  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(
    () => new Set(cached?.shortlistUrls ?? [])
  );
  const [shortlistError, setShortlistError] = useState<string | null>(null);

  const isHebrew = lang === 'he';

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const shortlistDocId = useShortlistDocId(user ?? null);
  useEffect(() => {
    if (!user || !shortlistDocId) return;
    const docRef = doc(db, 'Shortlists', shortlistDocId);
    const unsub = onSnapshot(docRef, (snap) => {
      const entries = (snap.data()?.entries as { tmProfileUrl?: string }[]) || [];
      setShortlistUrls(new Set(entries.map((e) => e.tmProfileUrl).filter((u): u is string => !!u)));
    });
    return () => unsub();
  }, [user, shortlistDocId]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, CLUB_REQUESTS_COLLECTION), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Request));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRequests(list);
      setLoadingList(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'Players'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer));
      setPlayers(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setScreenCache<RequestsCache>(
      'requests',
      {
        requests,
        players,
        shortlistUrls: Array.from(shortlistUrls),
      },
      user?.uid ?? undefined
    );
  }, [requests, players, shortlistUrls, user?.uid]);

  const byPositionCountry = useMemo(() => {
    const pending = requests.filter((r) => (r.status || 'pending') === 'pending');
    const byPos: Record<string, Record<string, Request[]>> = {};
    const posOrder = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST', 'SS'];
    for (const r of pending) {
      const pos = r.position?.trim() || 'Other';
      if (!byPos[pos]) byPos[pos] = {};
      const country = r.clubCountry?.trim() || 'Other';
      if (!byPos[pos][country]) byPos[pos][country] = [];
      byPos[pos][country].push(r);
    }
    const sorted: Record<string, Record<string, Request[]>> = {};
    const orderedPos = Object.keys(byPos).sort((a, b) => {
      const ia = posOrder.indexOf(a);
      const ib = posOrder.indexOf(b);
      return (ia >= 0 ? ia : 999) - (ib >= 0 ? ib : 999);
    });
    for (const pos of orderedPos) {
      if (!byPos[pos]) continue;
      const countries = Object.keys(byPos[pos]).sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      });
      sorted[pos] = {};
      for (const c of countries) sorted[pos][c] = byPos[pos][c];
    }
    return sorted;
  }, [requests]);

  const totalCount = requests.length;
  const positionsCount = Object.keys(byPositionCountry).length;

  const matchingPlayersByRequestId = useMemo(() => {
    const byId: Record<string, RosterPlayer[]> = {};
    for (const r of requests) {
      if (!r.id) continue;
      byId[r.id] = matchRequestToPlayers(r, players);
    }
    return byId;
  }, [requests, players]);

  const toggleMatchingPlayers = (requestId: string) => {
    setExpandedMatchingPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) next.delete(requestId);
      else next.add(requestId);
      return next;
    });
  };

  const fetchScoutPlayers = async (r: Request) => {
    if (!r.id) return;
    setScoutLoadingRequestId(r.id);
    setScoutExpandedRequestId(r.id);
    try {
      const results = await findPlayersForRequest({
        position: r.position || undefined,
        ageMin: r.minAge || undefined,
        ageMax: r.maxAge || undefined,
        foot: r.dominateFoot && r.dominateFoot !== 'any' ? r.dominateFoot : undefined,
        notes: r.notes || undefined,
        transferFee: r.transferFee || undefined,
        salaryRange: r.salaryRange || undefined,
        requestId: r.id || undefined,
        lang: lang === 'he' ? 'he' : 'en',
        clubUrl: r.clubTmProfile || undefined,
        clubName: r.clubName || undefined,
        clubCountry: r.clubCountry || undefined,
      });
      setScoutResultsByRequestId((prev) => ({ ...prev, [r.id!]: results }));
    } catch (err) {
      console.error('Scout API error:', err);
      setScoutResultsByRequestId((prev) => ({ ...prev, [r.id!]: [] }));
    } finally {
      setScoutLoadingRequestId(null);
    }
  };

  const addScoutPlayerToShortlist = useCallback(
    async (s: ScoutPlayerSuggestion, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = s.transfermarktUrl;
      if (!user || !url) return;
      setShortlistError(null);
      setAddingToShortlistUrl(url);
      try {
        const account = await getCurrentAccountForShortlist(user);
        const docRef = doc(db, 'Shortlists', SHARED_SHORTLIST_DOC_ID);
        const rosterExists = players.some((p) => p.tmProfile === url);
        if (rosterExists) {
          setShortlistError(t('shortlist_player_in_roster'));
          return;
        }
        const snap = await getDoc(docRef);
        const current = (snap.data()?.entries as Record<string, unknown>[]) || [];
        const exists = current.some((e) => e.tmProfileUrl === url);
        if (!exists) {
          const agentFields = {
            addedByAgentId: account.id,
            addedByAgentName: account.name ?? null,
            addedByAgentHebrewName: account.hebrewName ?? null,
          };
          let entry: Record<string, unknown>;
          try {
            const details = await getPlayerDetails(url);
            entry = {
              tmProfileUrl: url,
              addedAt: Date.now(),
              playerImage: details.profileImage ?? null,
              playerName: details.fullName ?? null,
              playerPosition: details.positions?.[0] ?? null,
              playerAge: details.age ?? null,
              playerNationality: details.nationality ?? null,
              playerNationalityFlag: details.nationalityFlag ?? null,
              clubJoinedName: details.currentClub?.clubName ?? null,
              marketValue: details.marketValue ?? null,
              ...agentFields,
            };
          } catch {
            entry = {
              tmProfileUrl: url,
              addedAt: Date.now(),
              playerName: s.name ?? null,
              playerPosition: s.position ?? null,
              playerAge: s.age ?? null,
              playerNationality: s.nationality ?? null,
              clubJoinedName: s.club ?? null,
              marketValue: s.marketValue ?? null,
              ...agentFields,
            };
          }
          await setDoc(docRef, { entries: [...current, entry] }, { merge: true });
          const feedEvent: Record<string, unknown> = {
            type: 'SHORTLIST_ADDED',
            playerName: entry.playerName ?? null,
            playerImage: entry.playerImage ?? null,
            playerTmProfile: url,
            timestamp: Date.now(),
            agentName: account.name ?? null,
          };
          await addDoc(collection(db, 'FeedEvents'), feedEvent);
        }
      } catch (err) {
        console.error('Add to shortlist error:', err);
        setShortlistError(err instanceof Error ? err.message : 'Failed to add');
      } finally {
        setAddingToShortlistUrl(null);
      }
    },
    [user, players, t]
  );

  const handleDelete = async (r: Request) => {
    if (!r.id) return;
    setDeleting(true);
    try {
      const agentName = user ? (await getCurrentAccountForShortlist(user)).name ?? null : null;
      const feedEvent: Record<string, unknown> = {
        type: 'REQUEST_DELETED',
        playerName: r.clubName ?? null,
        playerImage: r.clubLogo ?? null,
        playerTmProfile: r.clubTmProfile ?? null,
        newValue: r.position ?? null,
        timestamp: Date.now(),
        agentName,
      };
      await addDoc(collection(db, 'FeedEvents'), feedEvent);
      await deleteDoc(doc(db, CLUB_REQUESTS_COLLECTION, r.id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Delete request failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const togglePosition = (pos: string) => {
    setExpandedPositions((prev) => {
      const next = new Set(prev);
      if (next.has(pos)) next.delete(pos);
      else next.add(pos);
      return next;
    });
  };

  const toggleCountry = (key: string) => {
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-mgsr-text tracking-tight">
              {t('requests_title')}
            </h1>
            <p className="text-mgsr-muted mt-1 text-sm">{t('requests_subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddSheet(true)}
            className="shrink-0 px-5 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition"
          >
            {t('requests_add')}
          </button>
        </div>

        {/* Stats strip (like app) */}
        <div className="flex gap-4 mb-6 p-4 rounded-2xl bg-mgsr-card border border-mgsr-border">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-mgsr-teal" />
            <span className="text-mgsr-text font-semibold">{totalCount}</span>
            <span className="text-mgsr-muted text-sm">{t('requests_stat_total')}</span>
          </div>
          <div className="w-px bg-mgsr-border" />
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-mgsr-text font-semibold">{positionsCount}</span>
            <span className="text-mgsr-muted text-sm">{t('requests_stat_positions')}</span>
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-mgsr-muted">{t('requests_loading')}</div>
          </div>
        ) : Object.keys(byPositionCountry).length === 0 ? (
          <div className="relative overflow-hidden p-16 bg-mgsr-card/50 border border-mgsr-border rounded-2xl text-center">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(77,182,172,0.06)_0%,transparent_70%)]" />
            <p className="text-mgsr-muted text-lg relative">{t('requests_empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(byPositionCountry).map(([position, countries]) => {
              const posCount = Object.values(countries).flat().length;
              const isPosExpanded = expandedPositions.has(position);

              return (
                <div key={position} className="rounded-2xl border border-mgsr-border overflow-hidden bg-mgsr-card">
                  {/* Position header */}
                  <button
                    type="button"
                    onClick={() => togglePosition(position)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-start border-s-4 border-mgsr-teal"
                  >
                    <span className="px-2.5 py-1 rounded-lg bg-mgsr-teal/20 text-mgsr-teal text-xs font-semibold shrink-0">
                      {position}
                    </span>
                    <span className="font-semibold text-mgsr-text">
                      {getPositionDisplayName(position, isHebrew)}
                    </span>
                    <span className="text-mgsr-muted text-sm">({posCount})</span>
                    <span className="flex-1 min-w-4" aria-hidden />
                    <span
                      className={`shrink-0 inline-flex text-mgsr-muted transition-transform duration-200 ${isPosExpanded ? 'rotate-180' : ''}`}
                      aria-hidden
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </button>

                  {isPosExpanded && (
                    <div className="border-t border-mgsr-border bg-mgsr-dark/30 p-3 space-y-2">
                      {Object.entries(countries).map(([country, reqs]) => {
                        const countryKey = `${position}_${country}`;
                        const isCountryExpanded = expandedCountries.has(countryKey);
                        const flagUrl = reqs[0]?.clubCountryFlag;

                        return (
                          <div key={countryKey} className="rounded-xl border border-mgsr-border overflow-hidden bg-mgsr-card">
                            {/* Country row */}
                            <button
                              type="button"
                              onClick={() => toggleCountry(countryKey)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-start"
                            >
                              <FlagImage url={flagUrl} country={country} className="w-6 h-6 rounded-full object-cover shrink-0" />
                              <span className="font-medium text-mgsr-text">
                                {getCountryDisplayName(country, isHebrew)}
                              </span>
                              <span className="text-mgsr-muted text-sm">
                                {reqs.length === 1
                                  ? t('requests_country_club_one')
                                  : t('requests_country_clubs').replace('{count}', String(reqs.length))}
                              </span>
                              <span className="flex-1 min-w-4" aria-hidden />
                              <span
                                className={`shrink-0 inline-flex text-mgsr-muted transition-transform duration-200 ${isCountryExpanded ? 'rotate-180' : ''}`}
                                aria-hidden
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </span>
                            </button>

                            {isCountryExpanded && (
                              <div className="border-t border-mgsr-border p-3 space-y-2">
                                {reqs.map((r) => {
                                  const ageStr = ageRange(r);
                                  const footStr = r.dominateFoot ? footLabel(r.dominateFoot, t) : null;
                                  const matchingPlayers = (r.id ? matchingPlayersByRequestId[r.id] : []) ?? [];
                                  const isMatchingExpanded = r.id ? expandedMatchingPlayers.has(r.id) : false;

                                  return (
                                    <div
                                      key={r.id}
                                      className="rounded-lg bg-mgsr-dark/40 border border-mgsr-border/50 overflow-hidden"
                                    >
                                      <div className="flex items-start gap-3 p-3">
                                        {r.clubLogo && r.clubLogo.startsWith('http') ? (
                                          <img
                                            src={r.clubLogo}
                                            alt=""
                                            className="w-10 h-10 rounded-lg object-contain shrink-0"
                                          />
                                        ) : (
                                          <div className="w-10 h-10 rounded-lg bg-mgsr-border flex items-center justify-center shrink-0">
                                            <span className="text-mgsr-muted text-xs font-bold">
                                              {(r.clubName || '?').slice(0, 2).toUpperCase()}
                                            </span>
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-mgsr-text">{r.clubName || '—'}</p>
                                          {r.contactName && (
                                            <p className="text-sm text-mgsr-teal">{r.contactName}</p>
                                          )}
                                          {r.contactPhoneNumber && (
                                            <a
                                              href={toWhatsAppUrl(r.contactPhoneNumber) ?? `tel:${r.contactPhoneNumber}`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-sm text-mgsr-teal hover:underline inline-flex items-center gap-1"
                                              dir="ltr"
                                            >
                                              {r.contactPhoneNumber}
                                            </a>
                                          )}
                                          <div className="flex flex-wrap gap-2 mt-1">
                                            {r.salaryRange && (
                                              <span className="text-xs px-2 py-0.5 rounded bg-mgsr-teal/20 text-mgsr-teal">
                                                {t('requests_salary')}: {r.salaryRange}
                                              </span>
                                            )}
                                            {r.transferFee && (
                                              <span className="text-xs px-2 py-0.5 rounded bg-mgsr-teal/20 text-mgsr-teal">
                                                {t('requests_fee')}: {r.transferFee === 'Free/Free loan' ? t('requests_fee_free_loan') : r.transferFee}
                                              </span>
                                            )}
                                            {ageStr && (
                                              <span className="text-xs px-2 py-0.5 rounded bg-mgsr-teal/20 text-mgsr-teal">
                                                {t('requests_age_range')}: {ageStr}
                                              </span>
                                            )}
                                            {footStr && (
                                              <span className="text-xs px-2 py-0.5 rounded bg-mgsr-teal/20 text-mgsr-teal">
                                                {t('requests_foot')}: {footStr}
                                              </span>
                                            )}
                                            {r.notes && (
                                              <span className="text-xs px-2 py-0.5 rounded bg-mgsr-teal/20 text-mgsr-teal line-clamp-1" dir={lang === 'he' ? 'rtl' : 'ltr'}>
                                                {t('requests_notes_label')}: {r.notes.slice(0, 60)}{r.notes.length > 60 ? '…' : ''}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setDeleteConfirm(r)}
                                          className="text-mgsr-muted hover:text-red-400 text-sm shrink-0"
                                        >
                                          {t('requests_delete')}
                                        </button>
                                      </div>

                                      {/* Matching players section */}
                                      <div className="border-t border-mgsr-border/50">
                                        <button
                                          type="button"
                                          onClick={() => r.id && toggleMatchingPlayers(r.id)}
                                          className="w-full flex items-center gap-3 px-3 py-2.5 text-start hover:bg-mgsr-dark/30 transition"
                                        >
                                          <span className="text-sm text-mgsr-muted">
                                            {matchingPlayers.length === 0
                                              ? t('requests_no_match')
                                              : matchingPlayers.length === 1
                                                ? t('requests_matching_players_one').replace('{count}', '1')
                                                : t('requests_matching_players').replace('{count}', String(matchingPlayers.length))}
                                          </span>
                                          <span
                                            className={`ml-auto shrink-0 inline-flex text-mgsr-muted transition-transform duration-200 ${isMatchingExpanded ? 'rotate-180' : ''}`}
                                            aria-hidden
                                          >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                              <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                          </span>
                                        </button>
                                        {isMatchingExpanded && matchingPlayers.length > 0 && (
                                          <div className="border-t border-mgsr-border/50 p-2 space-y-1">
                                            {matchingPlayers.map((player) => (
                                              <Link
                                                key={player.id}
                                                href={`/players/${player.id}?from=/requests`}
                                                className="flex items-center gap-3 p-2 rounded-lg hover:bg-mgsr-teal/10 transition"
                                              >
                                                <img
                                                  src={player.profileImage || 'https://via.placeholder.com/40?text=?'}
                                                  alt=""
                                                  className="w-10 h-10 rounded-full object-cover shrink-0 bg-mgsr-border"
                                                  onError={(e) => {
                                                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/40?text=?';
                                                  }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                  <p className="font-medium text-mgsr-text text-sm truncate">{player.fullName || '—'}</p>
                                                  <p className="text-xs text-mgsr-muted truncate">
                                                    {player.positions?.filter(Boolean).join(', ') || '—'} • {player.age || '—'} {t('players_age')} • {player.marketValue || '—'}
                                                  </p>
                                                </div>
                                                {player.currentClub?.clubLogo && (
                                                  <img
                                                    src={player.currentClub.clubLogo}
                                                    alt=""
                                                    className="w-6 h-6 rounded-full object-cover shrink-0"
                                                  />
                                                )}
                                              </Link>
                                            ))}
                                          </div>
                                        )}
                                        {isMatchingExpanded && matchingPlayers.length === 0 && (
                                          <div className="border-t border-mgsr-border/50 px-3 py-4">
                                            <p className="text-sm text-mgsr-muted">{t('requests_no_match')}</p>
                                          </div>
                                        )}
                                      </div>

                                      {/* AI Scout section */}
                                      <div className="border-t border-mgsr-border/50">
                                        <button
                                          type="button"
                                          onClick={() => r.id && fetchScoutPlayers(r)}
                                          disabled={!!scoutLoadingRequestId}
                                          className="w-full flex items-center gap-3 px-3 py-2.5 text-start hover:bg-mgsr-dark/30 transition disabled:opacity-60"
                                        >
                                          <span className="text-sm text-mgsr-teal">{t('requests_find_players_online')}</span>
                                          {scoutLoadingRequestId === r.id && (
                                            <span className="shrink-0 w-4 h-4 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
                                          )}
                                        </button>
                                        {scoutExpandedRequestId === r.id && scoutLoadingRequestId !== r.id && (
                                          <div className="border-t border-mgsr-border/50 p-2 space-y-1" data-no-propagate>
                                            {shortlistError && (
                                              <p className="text-sm text-red-400 px-2 py-1">{shortlistError}</p>
                                            )}
                                            {scoutResultsByRequestId[r.id!]?.length === 0 ? (
                                              <p className="text-sm text-mgsr-muted px-2 py-3">{t('requests_online_players_empty')}</p>
                                            ) : (
                                              (scoutResultsByRequestId[r.id!] ?? [])
                                                .filter((s) => s.transfermarktUrl)
                                                .map((s) => {
                                                const url = s.transfermarktUrl!;
                                                const isAdding = addingToShortlistUrl === url;
                                                const isInShortlist = shortlistUrls.has(url);
                                                return (
                                                  <div
                                                    key={url}
                                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-mgsr-teal/10 transition"
                                                  >
                                                    <a
                                                      href={url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="flex-1 min-w-0 hover:underline"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      <p className="font-medium text-mgsr-text text-sm truncate">{s.name || '—'}</p>
                                                      <p className="text-xs text-mgsr-muted truncate">
                                                        {s.position || '—'} • {s.age ?? '—'} {t('players_age')} • {s.marketValue || '—'}
                                                        {s.matchPercent != null && (
                                                          <> • {t('requests_online_match_score').replace('{pct}', String(s.matchPercent))}</>
                                                        )}
                                                      </p>
                                                    </a>
                                                    {isInShortlist ? (
                                                      <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 shrink-0">
                                                        <svg className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                                          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                                                        </svg>
                                                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                                                          {t('releases_saved')}
                                                        </span>
                                                        <Link
                                                          href="/shortlist"
                                                          className="text-xs font-medium text-amber-400/90 hover:text-amber-300 underline underline-offset-2 decoration-amber-400/50 hover:decoration-amber-300 transition-colors"
                                                        >
                                                          {t('releases_view_shortlist')} {isRtl ? '←' : '→'}
                                                        </Link>
                                                      </div>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        onClick={(e) => addScoutPlayerToShortlist(s, e)}
                                                        disabled={!!addingToShortlistUrl}
                                                        className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-mgsr-border/80 bg-mgsr-dark/40 text-mgsr-muted hover:border-amber-500/40 hover:text-amber-400/90 hover:bg-amber-500/5 disabled:opacity-60 transition-all duration-200 shrink-0"
                                                      >
                                                        {isAdding ? (
                                                          <span className="w-4 h-4 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin shrink-0" />
                                                        ) : (
                                                          <svg className="w-4 h-4 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                          </svg>
                                                        )}
                                                        <span className="text-xs font-medium">
                                                          {isAdding ? t('shortlist_adding') : t('shortlist_add')}
                                                        </span>
                                                      </button>
                                                    )}
                                                  </div>
                                                );
                                              })
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Delete confirmation dialog */}
        <AddRequestSheet
          open={showAddSheet}
          onClose={() => setShowAddSheet(false)}
          onSaved={() => {}}
        />

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !deleting && setDeleteConfirm(null)}>
            <div
              className="bg-mgsr-card border border-mgsr-border rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-mgsr-text font-medium mb-4">
                {t('requests_delete_confirm')
                  .replace('{club}', deleteConfirm.clubName || '')
                  .replace('{position}', deleteConfirm.position || '')}
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
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30"
                >
                  {deleting ? '…' : t('requests_delete')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
