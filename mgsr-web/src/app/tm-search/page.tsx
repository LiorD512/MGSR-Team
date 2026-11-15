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
  describeSearchForm,
  isEmptySearchForm,
  parseSearchText,
  requestToSearchForm,
  searchFormToQuery,
  type RequestForSearch,
  type TmSearchForm,
} from '@/lib/tmSearchFromRequest';
import type { TmSearchPlayer, TmSearchResult } from '@/lib/tmAdvancedSearch';
import MenTmSearch, { type TmActiveRequest, type TmRequestCard } from '@/components/MenTmSearch';
import BritLoader from '@/components/BritLoader';

const REGION_OPTIONS: { value: Confederation; key: string }[] = [
  { value: 'UEFA', key: 'transfer_windows_group_uefa' },
  { value: 'CONMEBOL', key: 'transfer_windows_group_conmebol' },
  { value: 'CONCACAF', key: 'transfer_windows_group_concacaf' },
  { value: 'AFC', key: 'transfer_windows_group_afc' },
  { value: 'CAF', key: 'transfer_windows_group_caf' },
  { value: 'OFC', key: 'transfer_windows_group_ofc' },
];

const SEARCH_DEBOUNCE_MS = 450;

interface ClubRequestDoc extends RequestForSearch {
  id: string;
  clubName?: string;
  clubLogo?: string;
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
  const { t } = useLanguage();
  // Search callbacks read the latest translator through a ref so a language switch does not re-run the search.
  const tRef = useRef(t);
  tRef.current = t;
  const router = useRouter();

  const [form, setFormState] = useState<TmSearchForm>(EMPTY_TM_SEARCH_FORM);
  const formRef = useRef<TmSearchForm>(EMPTY_TM_SEARCH_FORM);
  const [barText, setBarText] = useState('');
  const [requests, setRequests] = useState<ClubRequestDoc[]>([]);
  const [activeRequest, setActiveRequest] = useState<TmActiveRequest | null>(null);

  const [players, setPlayers] = useState<TmSearchPlayer[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [hiddenNoHeight, setHiddenNoHeight] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [resultsKey, setResultsKey] = useState(0);

  const [shortlistUrls, setShortlistUrls] = useState<Set<string>>(new Set());
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set());
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  // Filters used for the results currently on screen: "Load more" must continue THAT search,
  // not whatever has been typed since.
  const activeFormRef = useRef<TmSearchForm>(EMPTY_TM_SEARCH_FORM);
  const searchSeq = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstAuto = useRef(true);

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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  // ── search ──
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
      setHiddenNoHeight(data.hiddenNoHeight ?? 0);
      setHasSearched(true);
      setResultsKey((k) => k + 1);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      console.error('TM search failed:', err);
      setPlayers([]);
      setTotalHits(0);
      setHasMore(false);
      setHiddenNoHeight(0);
      setHasSearched(true);
      setError(tRef.current('tm_search_error'));
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

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
      setHasMore(data.hasMore);
      setHiddenNoHeight((n) => n + (data.hiddenNoHeight ?? 0));
    } catch (err) {
      if (seq !== searchSeq.current) return;
      console.error('TM load more failed:', err);
      setError(tRef.current('tm_search_error'));
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  // Live search: every filter change searches after a short pause (no Search button).
  useEffect(() => {
    if (skipFirstAuto.current) { skipFirstAuto.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (isEmptySearchForm(form)) {
      searchSeq.current++;
      setPlayers([]);
      setTotalHits(0);
      setHasMore(false);
      setHiddenNoHeight(0);
      setHasSearched(false);
      setSearching(false);
      setError('');
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => { void runSearch(form); }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form, runSearch]);

  // ── filter edits (all of them detach the loaded request) ──
  const applyForm = useCallback((next: TmSearchForm) => {
    formRef.current = next;
    setFormState(next);
  }, []);

  const setForm = useCallback((updater: (prev: TmSearchForm) => TmSearchForm) => {
    const next = updater(formRef.current);
    applyForm(next);
    setBarText(describeSearchForm(next));
    setActiveRequest(null);
  }, [applyForm]);

  const onBarChange = useCallback((text: string) => {
    setBarText(text);
    setActiveRequest(null);
    if (!text.trim()) { applyForm(EMPTY_TM_SEARCH_FORM); return; }
    const { form: parsed, hits } = parseSearchText(text);
    if (hits > 0) applyForm(parsed);
  }, [applyForm]);

  const onBarSubmit = useCallback(() => {
    if (isEmptySearchForm(form)) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runSearch(form);
  }, [form, runSearch]);

  const onReset = useCallback(() => {
    applyForm(EMPTY_TM_SEARCH_FORM);
    setBarText('');
    setActiveRequest(null);
  }, [applyForm]);

  const requestCards: TmRequestCard[] = useMemo(
    () =>
      requests
        .filter((r) => !!r.position)
        .map((r) => ({
          id: r.id,
          club: r.clubName || '—',
          logo: r.clubLogo,
          position: (r.position || '').toUpperCase(),
          minAge: r.ageDoesntMatter ? undefined : r.minAge,
          maxAge: r.ageDoesntMatter ? undefined : r.maxAge,
          fee: r.transferFee,
          foot: r.dominateFoot && r.dominateFoot !== 'any' ? r.dominateFoot : undefined,
          euOnly: r.euOnly,
        })),
    [requests]
  );

  const onSelectRequest = useCallback((id: string) => {
    if (activeRequest?.id === id) {
      // Tapping the loaded request again unloads it.
      onReset();
      return;
    }
    const req = requests.find((r) => r.id === id);
    if (!req) return;
    const { form: next, feeCeiling } = requestToSearchForm(req);
    applyForm(next);
    setBarText(describeSearchForm(next));
    setActiveRequest({
      id: req.id,
      club: req.clubName || '—',
      fee: req.transferFee,
      euOnly: req.euOnly,
      minAge: req.ageDoesntMatter ? undefined : req.minAge,
      maxAge: req.ageDoesntMatter ? undefined : req.maxAge,
      valueCeiling: feeCeiling ? feeCeiling * 2 : null,
      minHeight: req.minHeight,
      maxHeight: req.maxHeight,
    });
  }, [activeRequest, requests, onReset, applyForm]);

  // ── shortlist ──
  const addOne = useCallback(async (player: TmSearchPlayer): Promise<'added' | 'exists' | 'error'> => {
    if (!user) return 'error';
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
    if (result.status === 'added') {
      enrichShortlistInstagram(player.playerUrl);
      return 'added';
    }
    return 'exists';
  }, [user]);

  const addToShortlist = useCallback(async (player: TmSearchPlayer) => {
    if (!player.playerUrl) return;
    setAddingUrl(player.playerUrl);
    try {
      const r = await addOne(player);
      showToast(r === 'added' ? t('tm_search_toast_added') : t('releases_saved'));
    } catch (err) {
      console.error('Add to shortlist failed:', err);
      showToast(t('tm_search_error'));
    } finally {
      setAddingUrl(null);
    }
  }, [addOne, showToast, t]);

  const addMany = useCallback(async (list: TmSearchPlayer[]) => {
    let added = 0;
    for (const p of list) {
      const id = extractPlayerIdFromUrl(p.playerUrl);
      if (id && rosterIds.has(id)) continue;
      try {
        if ((await addOne(p)) === 'added') added++;
      } catch (err) {
        console.error('Add to shortlist failed:', err);
      }
    }
    showToast(t('tm_search_toast_added_n').replace('{n}', String(added)));
  }, [addOne, rosterIds, showToast, t]);

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

  if (loading || !user) return <BritLoader fullPage={true} />;

  return (
    <MenTmSearch
      form={form}
      setForm={setForm}
      barText={barText}
      onBarChange={onBarChange}
      onBarSubmit={onBarSubmit}
      onReset={onReset}
      requests={requestCards}
      activeRequest={activeRequest}
      onSelectRequest={onSelectRequest}
      regionOptions={REGION_OPTIONS}
      contractYears={contractYears}
      hasSearched={hasSearched}
      loading={searching}
      loadingMore={loadingMore}
      error={error}
      players={players}
      totalHits={totalHits}
      hasMore={hasMore}
      hiddenNoHeight={hiddenNoHeight}
      resultsKey={resultsKey}
      onLoadMore={() => void loadMore()}
      shortlistUrls={shortlistedResultUrls}
      rosterUrls={rosterResultUrls}
      addingUrl={addingUrl}
      onAddToShortlist={addToShortlist}
      onAddMany={addMany}
      toast={toast}
      onToast={showToast}
    />
  );
}
