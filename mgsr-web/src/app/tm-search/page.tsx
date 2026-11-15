'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { callShortlistAdd } from '@/lib/callables';
import { extractPlayerIdFromUrl, type Confederation } from '@/lib/api';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { enrichShortlistInstagram } from '@/lib/outreach';
import {
  EMPTY_TM_SEARCH_FORM,
  TM_SEARCH_POSITIONS,
  requestToSearchForm,
  searchFormToQuery,
  type RequestForSearch,
  type TmSearchForm,
} from '@/lib/tmSearchFromRequest';
import type { TmSearchPlayer, TmSearchResult } from '@/lib/tmAdvancedSearch';
import MenTmSearch, { type TmRequestOption } from '@/components/MenTmSearch';
import BritLoader from '@/components/BritLoader';

const REGION_OPTIONS: { value: Confederation; key: string }[] = [
  { value: 'UEFA', key: 'transfer_windows_group_uefa' },
  { value: 'CONMEBOL', key: 'transfer_windows_group_conmebol' },
  { value: 'CONCACAF', key: 'transfer_windows_group_concacaf' },
  { value: 'AFC', key: 'transfer_windows_group_afc' },
  { value: 'CAF', key: 'transfer_windows_group_caf' },
  { value: 'OFC', key: 'transfer_windows_group_ofc' },
];

const POSITION_HEBREW: Record<string, string> = { SS: 'חלוץ שני' };

interface ClubRequestDoc extends RequestForSearch {
  id: string;
  clubName?: string;
  createdAt?: number;
}

// Always same-origin: this route only exists in the Next.js app. The standalone
// mgsr-backend (NEXT_PUBLIC_BACKEND_URL) does not implement it.
async function fetchSearch(query: string): Promise<TmSearchResult> {
  const res = await fetch(`/api/transfermarkt/advanced-search?${query}`);
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json())?.error || ''; } catch { /* ignore */ }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function TmSearchPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();

  const [form, setFormState] = useState<TmSearchForm>(EMPTY_TM_SEARCH_FORM);
  const [requests, setRequests] = useState<ClubRequestDoc[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [requestNotes, setRequestNotes] = useState<string[]>([]);

  const [players, setPlayers] = useState<TmSearchPlayer[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);

  // Filters used for the results currently on screen ("Load more" must continue THAT search,
  // not whatever the user has typed since).
  const activeFormRef = useRef<TmSearchForm>(EMPTY_TM_SEARCH_FORM);
  const searchSeq = useRef(0);

  const contractYears = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y + 1, y + 2, y + 3, y + 4];
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'ClubRequests'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClubRequestDoc));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRequests(list);
    }, () => {});
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      setShortlistUrls(new Set(snap.docs.map((d) => d.data().tmProfileUrl as string).filter((u): u is string => !!u)));
    }, () => {});
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'Players'), (snap) => {
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const id = extractPlayerIdFromUrl(d.data().tmProfile as string | undefined);
        if (id) ids.add(id);
      });
      setRosterIds(ids);
    }, () => {});
    return () => unsub();
  }, [user]);

  const runSearch = useCallback(async (f: TmSearchForm) => {
    const seq = ++searchSeq.current;
    activeFormRef.current = f;
    setSearching(true);
    setError('');
    try {
      const data = await fetchSearch(searchFormToQuery(f, 1));
      if (seq !== searchSeq.current) return;
      setPlayers(data.players);
      setTotalHits(data.totalHits);
      setPage(1);
      setHasMore(data.hasMore);
      setHasSearched(true);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      console.error('TM search failed:', err);
      setPlayers([]);
      setTotalHits(0);
      setHasMore(false);
      setHasSearched(true);
      setError(t('tm_search_error'));
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, [t]);

  const loadMore = useCallback(async () => {
    const seq = searchSeq.current;
    const next = page + 1;
    setLoadingMore(true);
    try {
      const data = await fetchSearch(searchFormToQuery(activeFormRef.current, next));
      if (seq !== searchSeq.current) return;
      setPlayers((prev) => {
        const seen = new Set(prev.map((p) => p.playerUrl));
        return [...prev, ...data.players.filter((p) => !seen.has(p.playerUrl))];
      });
      setPage(next);
      setHasMore(data.hasMore && data.players.length > 0);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      console.error('TM load more failed:', err);
      setError(t('tm_search_error'));
    } finally {
      setLoadingMore(false);
    }
  }, [page, t]);

  const setForm = useCallback((updater: (prev: TmSearchForm) => TmSearchForm) => {
    setFormState(updater);
    // Editing a filter turns it back into a custom search.
    setSelectedRequestId('');
    setRequestNotes([]);
  }, []);

  const onSelectRequest = useCallback((id: string) => {
    setSelectedRequestId(id);
    if (!id) {
      setRequestNotes([]);
      return;
    }
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    const { form: next, feeCeiling } = requestToSearchForm(req);
    const notes = [t('tm_search_request_note')];
    if (req.euOnly) notes.push(t('tm_search_request_eu_note'));
    if (feeCeiling && req.transferFee) notes.push(t('tm_search_request_fee_note').replace('{fee}', req.transferFee));
    setFormState(next);
    setRequestNotes(notes);
    void runSearch(next);
  }, [requests, runSearch, t]);

  const onReset = useCallback(() => {
    searchSeq.current++;
    setFormState(EMPTY_TM_SEARCH_FORM);
    setSelectedRequestId('');
    setRequestNotes([]);
    setPlayers([]);
    setTotalHits(0);
    setHasMore(false);
    setHasSearched(false);
    setSearching(false);
    setError('');
  }, []);

  const addToShortlist = useCallback(async (player: TmSearchPlayer) => {
    if (!user || !player.playerUrl) return;
    setAddingUrl(player.playerUrl);
    try {
      const account = await getCurrentAccountForShortlist(user);
      const result = await callShortlistAdd({
        platform: 'men',
        tmProfileUrl: player.playerUrl,
        playerImage: player.playerImage || null,
        playerName: player.playerName || null,
        playerPosition: player.playerPosition || null,
        playerAge: player.playerAge || null,
        playerNationality: player.playerNationality || null,
        playerNationalityFlag: player.playerNationalityFlag || null,
        clubJoinedName: player.clubJoinedName ?? null,
        marketValue: player.marketValue || null,
        addedByAgentId: account.id,
        addedByAgentName: account.name ?? null,
        addedByAgentHebrewName: account.hebrewName ?? null,
      });
      if (result.status === 'added') enrichShortlistInstagram(player.playerUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tm_search_error'));
    } finally {
      setAddingUrl(null);
    }
  }, [user, t]);

  const requestOptions: TmRequestOption[] = useMemo(
    () =>
      requests
        .filter((r) => !!r.position)
        .map((r) => ({
          id: r.id,
          label: t('tm_search_request_option')
            .replace('{club}', r.clubName || '—')
            .replace('{position}', r.position || '—'),
        })),
    [requests, t]
  );

  // Match shortlist / roster by Transfermarkt player id (URL slugs can differ).
  const shortlistIds = useMemo(
    () => new Set(Array.from(shortlistUrls).map((u) => extractPlayerIdFromUrl(u)).filter((x): x is string => !!x)),
    [shortlistUrls]
  );
  const shortlistedResultUrls = useMemo(
    () => new Set(players.filter((p) => { const id = extractPlayerIdFromUrl(p.playerUrl); return !!id && shortlistIds.has(id); }).map((p) => p.playerUrl)),
    [players, shortlistIds]
  );
  const rosterResultUrls = useMemo(
    () => new Set(players.filter((p) => { const id = extractPlayerIdFromUrl(p.playerUrl); return !!id && rosterIds.has(id); }).map((p) => p.playerUrl)),
    [players, rosterIds]
  );

  const positionLabel = useCallback(
    (pos: string) => (isRtl ? POSITION_HEBREW[pos] || pos : pos),
    [isRtl]
  );

  if (loading || !user) return <BritLoader fullPage={true} />;

  return (
    <MenTmSearch
      form={form}
      setForm={setForm}
      positions={TM_SEARCH_POSITIONS}
      positionLabel={positionLabel}
      regionOptions={REGION_OPTIONS}
      contractYears={contractYears}
      requestOptions={requestOptions}
      selectedRequestId={selectedRequestId}
      onSelectRequest={onSelectRequest}
      requestNotes={requestNotes}
      onSearch={() => void runSearch(form)}
      onReset={onReset}
      onLoadMore={() => void loadMore()}
      hasSearched={hasSearched}
      loading={searching}
      loadingMore={loadingMore}
      error={error}
      players={players}
      totalHits={totalHits}
      hasMore={hasMore}
      shortlistUrls={shortlistedResultUrls}
      rosterUrls={rosterResultUrls}
      addingUrl={addingUrl}
      onAddToShortlist={addToShortlist}
    />
  );
}
