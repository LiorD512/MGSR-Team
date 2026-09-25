'use client';

/**
 * Men platform shortlist — "Light Management Room" redesign.
 *
 * Self-contained full-bleed light layout (shared BritRail + .brit-room), for the
 * men platform only. Owns its Firestore subscription and reproduces the real
 * filter/sort/actions of the shortlist screen. Women & youth keep the standard
 * shortlist screen. No market-value graph (per product request) — value change
 * is shown as a compact ▲/▼ % badge.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEuCountries, isEuNational } from '@/hooks/useEuCountries';
import { getCurrentAccountForShortlist, getAllAccounts, type AccountForShortlist } from '@/lib/accounts';
import {
  callShortlistRemove,
  callShortlistAddNote,
  callShortlistUpdateNote,
  callShortlistDeleteNote,
} from '@/lib/callables';
import { openWhatsAppShare } from '@/lib/whatsapp';
import {
  isFreeAgent,
  parseMarketValueToEuros,
  computeValueChangePercent,
  monthsUntilContractExpiry,
} from '@/lib/shortlistIntelligence';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import NoteTextarea, { type NoteAccount } from '@/components/NoteTextarea';
import BritRail from '@/components/BritRail';
import MenAddPlayerDrawer from '@/components/MenAddPlayerDrawer';

interface ShortlistNote {
  text: string;
  createdBy?: string;
  createdByHebrewName?: string;
  createdById?: string;
  createdAt?: number;
}
interface ShortlistEntry {
  tmProfileUrl: string;
  addedAt?: number;
  playerImage?: string;
  playerName?: string;
  playerPosition?: string;
  playerAge?: string;
  playerNationality?: string;
  playerNationalities?: string[];
  clubJoinedName?: string;
  marketValue?: string;
  marketValueHistory?: { value?: string; date?: number }[];
  contractExpires?: string;
  positions?: string[];
  addedByAgentId?: string;
  addedByAgentName?: string;
  addedByAgentHebrewName?: string;
  notes?: ShortlistNote[];
  currentClub?: { clubName?: string; clubLogo?: string };
}

type SortOption = 'added' | 'market_value' | 'name' | 'age';
type FilterOption = 'all' | 'free_agent' | 'contract_expiring' | 'my_players';

const POSITION_GROUPS = ['GK', 'DEF', 'MID', 'FWD'] as const;
const POSITION_CODES: Record<string, Set<string>> = {
  GK: new Set(['GK', 'GOALKEEPER']),
  DEF: new Set(['CB', 'RB', 'LB', 'CENTRE-BACK', 'LEFT-BACK', 'RIGHT-BACK', 'BACK']),
  MID: new Set(['CM', 'DM', 'AM', 'MIDFIELD', 'DEFENSIVE MIDFIELD', 'CENTRAL MIDFIELD', 'ATTACKING MIDFIELD', 'LEFT MIDFIELD', 'RIGHT MIDFIELD']),
  FWD: new Set(['ST', 'CF', 'LW', 'RW', 'SS', 'FORWARD', 'CENTRE-FORWARD', 'LEFT WINGER', 'RIGHT WINGER', 'SECOND STRIKER', 'WINGER', 'STRIKER']),
};

const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const clubDisplay = (e: ShortlistEntry, t: (k: string) => string) => {
  const c = (e.clubJoinedName ?? e.currentClub?.clubName)?.trim();
  if (!c) return t('without_club');
  if (c.toLowerCase() === 'vereinslos' || c === 'Without Club') return t('without_club');
  return c;
};
const positionsLabel = (e: ShortlistEntry) =>
  (e.positions?.filter(Boolean) ?? (e.playerPosition ? [e.playerPosition] : [])).slice(0, 3).join(' / ') || '—';

interface ShortlistFilterCache {
  search: string;
  positionFilter: string | null;
  filterBy: FilterOption;
  sortOption: SortOption;
  view: 'board' | 'ledger';
}

export default function MenShortlist() {
  const { user } = useAuth();
  const { t, lang, setLang, isRtl } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const euCountries = useEuCountries();

  const cacheKey = user ? `men-shortlist-filters` : undefined;
  const cached = cacheKey ? getScreenCache<ShortlistFilterCache>(cacheKey) : undefined;

  const [entries, setEntries] = useState<ShortlistEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [currentAccountId, setCurrentAccountId] = useState<string | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountForShortlist[]>([]);
  const pendingRemoveRef = useRef<Set<string>>(new Set());

  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string | null>(cached?.positionFilter ?? null);
  const [filterBy, setFilterBy] = useState<FilterOption>(cached?.filterBy ?? 'all');
  const [sortOption, setSortOption] = useState<SortOption>(cached?.sortOption ?? 'added');
  const [view, setView] = useState<'board' | 'ledger'>(cached?.view ?? 'board');
  const [withNotesOnly, setWithNotesOnly] = useState(false);
  const [euOnly, setEuOnly] = useState(false);

  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [highlightedUrl, setHighlightedUrl] = useState<string | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);

  // Note modal
  const [noteEntry, setNoteEntry] = useState<ShortlistEntry | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteMode, setNoteMode] = useState<'add' | 'edit'>('add');
  const [noteEditIndex, setNoteEditIndex] = useState(-1);
  const [noteTaggedIds, setNoteTaggedIds] = useState<string[]>([]);
  const [savingNote, setSavingNote] = useState(false);

  // ── Subscriptions ──
  useEffect(() => {
    if (!user) return;
    getCurrentAccountForShortlist(user).then((acc) => setCurrentAccountId(acc.id));
    getAllAccounts().then(setAllAccounts);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'Shortlists'), (snap) => {
      const seen = new Set<string>();
      const mapped = snap.docs
        .map((d) => {
          const e = d.data();
          const url = (e.tmProfileUrl as string) ?? '';
          if (!url || seen.has(url)) return null;
          seen.add(url);
          const currentClub = e.currentClub && typeof e.currentClub === 'object' ? (e.currentClub as { clubName?: string; clubLogo?: string }) : undefined;
          return {
            tmProfileUrl: url,
            addedAt: e.addedAt as number,
            playerImage: (e.playerImage as string) ?? undefined,
            playerName: (e.playerName ?? e.fullName) as string | undefined,
            playerPosition: (e.playerPosition as string) ?? undefined,
            playerAge: (e.playerAge as string) ?? undefined,
            playerNationality: (e.playerNationality as string) ?? undefined,
            playerNationalities: Array.isArray(e.playerNationalities) ? (e.playerNationalities as string[]) : undefined,
            clubJoinedName: (e.clubJoinedName as string) ?? currentClub?.clubName ?? undefined,
            marketValue: (e.marketValue as string) ?? undefined,
            marketValueHistory: Array.isArray(e.marketValueHistory) ? (e.marketValueHistory as { value?: string; date?: number }[]) : undefined,
            contractExpires: (e.contractExpires as string) ?? undefined,
            positions: Array.isArray(e.positions) ? (e.positions as string[]) : (e.playerPosition ? [e.playerPosition as string] : undefined),
            addedByAgentId: (e.addedByAgentId as string) ?? undefined,
            addedByAgentName: (e.addedByAgentName as string) ?? undefined,
            addedByAgentHebrewName: (e.addedByAgentHebrewName as string) ?? undefined,
            notes: Array.isArray(e.notes)
              ? (e.notes as Record<string, unknown>[]).map((n) => ({
                  text: (n.text as string) ?? '',
                  createdBy: (n.createdBy as string) ?? undefined,
                  createdByHebrewName: (n.createdByHebrewName as string) ?? undefined,
                  createdById: (n.createdById as string) ?? undefined,
                  createdAt: (n.createdAt as number) ?? undefined,
                }))
              : [],
            currentClub,
          } as ShortlistEntry;
        })
        .filter((x): x is ShortlistEntry => x !== null);
      const pending = pendingRemoveRef.current;
      const filtered = pending.size > 0 ? mapped.filter((e) => !pending.has(e.tmProfileUrl)) : mapped;
      const snapUrls = new Set(mapped.map((e) => e.tmProfileUrl));
      Array.from(pending).forEach((u) => { if (!snapUrls.has(u)) pending.delete(u); });
      setEntries(filtered);
      setReady(true);
    }, () => setReady(true));
    return () => unsub();
  }, [user]);

  // Persist filters
  useEffect(() => {
    if (!cacheKey) return;
    setScreenCache<ShortlistFilterCache>(cacheKey, { search, positionFilter, filterBy, sortOption, view });
  }, [cacheKey, search, positionFilter, filterBy, sortOption, view]);

  // Highlight scroll (?highlight=url)
  const highlightParam = searchParams.get('highlight');
  useEffect(() => {
    if (!highlightParam || entries.length === 0) return;
    const decoded = decodeURIComponent(highlightParam);
    setHighlightedUrl(decoded);
    const el = document.getElementById(`brit-sl-${encodeURIComponent(decoded)}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t1 = setTimeout(() => router.replace('/shortlist', { scroll: false }), 500);
    const t2 = setTimeout(() => setHighlightedUrl(null), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [highlightParam, entries.length, router]);

  // ── Derived list ──
  const list = useMemo(() => {
    let out = [...entries];
    if (filterBy === 'free_agent') out = out.filter((e) => isFreeAgent(e.currentClub?.clubName ?? e.clubJoinedName));
    if (filterBy === 'contract_expiring') out = out.filter((e) => { const m = monthsUntilContractExpiry(e.contractExpires); return m != null && m > 0 && m <= 6; });
    if (filterBy === 'my_players' && currentAccountId) out = out.filter((e) => e.addedByAgentId === currentAccountId);
    if (euOnly && euCountries.size > 0) out = out.filter((e) => isEuNational(e.playerNationality, euCountries, e.playerNationalities));
    if (withNotesOnly) out = out.filter((e) => (e.notes?.length ?? 0) > 0);
    if (positionFilter && POSITION_CODES[positionFilter]) {
      const codes = POSITION_CODES[positionFilter];
      out = out.filter((e) => {
        const positions = e.positions ?? (e.playerPosition ? [e.playerPosition] : []);
        return positions.some((p) => { const up = p.toUpperCase().trim(); return Array.from(codes).some((c) => up === c || up.includes(c)); });
      });
    }
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((e) => e.playerName?.toLowerCase().includes(q) || (e.clubJoinedName ?? e.currentClub?.clubName)?.toLowerCase().includes(q));

    if (sortOption === 'added') out.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    else if (sortOption === 'market_value') out.sort((a, b) => parseMarketValueToEuros(b.marketValue) - parseMarketValueToEuros(a.marketValue));
    else if (sortOption === 'name') out.sort((a, b) => (a.playerName ?? '').localeCompare(b.playerName ?? ''));
    else if (sortOption === 'age') out.sort((a, b) => (parseInt(a.playerAge ?? '99') || 99) - (parseInt(b.playerAge ?? '99') || 99));
    return out;
  }, [entries, filterBy, currentAccountId, euOnly, euCountries, withNotesOnly, positionFilter, search, sortOption]);

  // ── Signals ──
  const totalValue = useMemo(() => entries.reduce((s, e) => s + parseMarketValueToEuros(e.marketValue), 0), [entries]);
  const valuedCount = useMemo(() => entries.filter((e) => parseMarketValueToEuros(e.marketValue) > 0).length, [entries]);
  const freeCount = useMemo(() => entries.filter((e) => isFreeAgent(e.currentClub?.clubName ?? e.clubJoinedName)).length, [entries]);
  const monthAdds = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return entries.filter((e) => (e.addedAt ?? 0) >= cutoff).length;
  }, [entries]);

  const activeFilterCount =
    (positionFilter ? 1 : 0) + (filterBy !== 'all' ? 1 : 0) + (euOnly ? 1 : 0) + (withNotesOnly ? 1 : 0);

  const clearFilters = () => {
    setPositionFilter(null);
    setFilterBy('all');
    setEuOnly(false);
    setWithNotesOnly(false);
  };

  const fmtValue = (v: number) =>
    v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M` : v > 0 ? `€${Math.round(v / 1000)}K` : '€0';

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const agentName = (e: ShortlistEntry) => isRtl ? (e.addedByAgentHebrewName || e.addedByAgentName || '—') : (e.addedByAgentName || e.addedByAgentHebrewName || '—');
  const addPlayerHref = (e: ShortlistEntry) =>
    `/players/add?url=${encodeURIComponent(e.tmProfileUrl)}&from=shortlist${e.playerName ? `&name=${encodeURIComponent(e.playerName)}` : ''}`;

  const valueChange = (e: ShortlistEntry): number | null => {
    const hist = e.marketValueHistory;
    const prev = hist && hist.length >= 2 ? hist[1]?.value : undefined;
    return computeValueChangePercent(prev, e.marketValue);
  };

  const addedAgo = (ts?: number) => {
    if (!ts) return '';
    const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
    if (days <= 0) return t('shortlist_date_today');
    if (days === 1) return t('shortlist_date_yesterday');
    if (days < 7) return t('shortlist_date_days_ago').replace('{n}', String(days));
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return t('shortlist_date_weeks_ago').replace('{n}', String(weeks));
    return t('shortlist_date_months_ago').replace('{n}', String(Math.floor(days / 30)));
  };

  // ── Actions ──
  const removeEntry = async (e: ShortlistEntry) => {
    if (!user) return;
    const url = e.tmProfileUrl;
    pendingRemoveRef.current.add(url);
    setEntries((prev) => prev.filter((x) => x.tmProfileUrl !== url));
    setRemovingUrl(url);
    try {
      const account = await getCurrentAccountForShortlist(user);
      await callShortlistRemove({ platform: 'men', tmProfileUrl: url, playerName: e.playerName, playerImage: e.playerImage, agentName: account.name ?? undefined });
    } catch {
      pendingRemoveRef.current.delete(url);
    } finally {
      setRemovingUrl(null);
    }
  };

  const shareToTeam = (e: ShortlistEntry) => {
    if (!e.tmProfileUrl.includes('transfermarkt')) return;
    openWhatsAppShare(`${e.tmProfileUrl}\n\n${isRtl ? 'הוספתי אותו לרשימת מעקב, תבדקו אם יש לנו איך להגיע אליו.' : 'Added to the shortlist — check if we can reach him.'}`);
  };

  const openAddNote = (e: ShortlistEntry) => { setNoteEntry(e); setNoteMode('add'); setNoteText(''); setNoteEditIndex(-1); setNoteTaggedIds([]); };
  const openEditNote = (e: ShortlistEntry, idx: number, text: string) => { setNoteEntry(e); setNoteMode('edit'); setNoteText(text); setNoteEditIndex(idx); setNoteTaggedIds([]); };
  const closeNote = () => { setNoteEntry(null); setNoteText(''); setNoteEditIndex(-1); setNoteTaggedIds([]); };

  const saveNote = async () => {
    if (!noteEntry || !noteText.trim() || !user) return;
    setSavingNote(true);
    try {
      if (noteMode === 'edit' && noteEditIndex >= 0) {
        await callShortlistUpdateNote({ platform: 'men', tmProfileUrl: noteEntry.tmProfileUrl, noteIndex: noteEditIndex, newText: noteText.trim() });
      } else {
        const account = await getCurrentAccountForShortlist(user);
        await callShortlistAddNote({
          platform: 'men',
          tmProfileUrl: noteEntry.tmProfileUrl,
          noteText: noteText.trim(),
          createdBy: account.name ?? 'Unknown',
          createdByHebrewName: account.hebrewName ?? undefined,
          createdById: account.id,
          taggedAgentIds: noteTaggedIds.length ? noteTaggedIds : undefined,
          agentName: account.name ?? undefined,
          playerName: noteEntry.playerName ?? undefined,
          playerImage: noteEntry.playerImage ?? undefined,
        });
      }
      closeNote();
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (e: ShortlistEntry, idx: number) => {
    if (!user) return;
    try {
      await callShortlistDeleteNote({ platform: 'men', tmProfileUrl: e.tmProfileUrl, noteIndex: idx });
    } catch { /* ignore */ }
  };

  const entryTags = (e: ShortlistEntry) => {
    const out: { cls: string; label: string }[] = [];
    if (isEuNational(e.playerNationality, euCountries, e.playerNationalities)) out.push({ cls: 'eu', label: t('eu_nat_tag') });
    if (isFreeAgent(e.currentClub?.clubName ?? e.clubJoinedName)) out.push({ cls: 'free', label: isRtl ? 'חופשי' : 'Free' });
    const m = monthsUntilContractExpiry(e.contractExpires);
    if (m != null && m > 0 && m <= 6) out.push({ cls: 'exp', label: isRtl ? 'מסתיים' : 'Exp' });
    return out;
  };

  const filterChips: { key: string; label: string; active: boolean; toggle: () => void; disabled?: boolean }[] = [
    { key: 'mine', label: t('shortlist_filter_my_players'), active: filterBy === 'my_players', toggle: () => setFilterBy((v) => (v === 'my_players' ? 'all' : 'my_players')), disabled: !currentAccountId },
    { key: 'eu', label: `🇪🇺 ${t('players_filter_eu_national')}`, active: euOnly, toggle: () => setEuOnly((v) => !v) },
    { key: 'free', label: t('shortlist_filter_free_agent'), active: filterBy === 'free_agent', toggle: () => setFilterBy((v) => (v === 'free_agent' ? 'all' : 'free_agent')) },
    { key: 'exp', label: t('shortlist_filter_contract_expiring'), active: filterBy === 'contract_expiring', toggle: () => setFilterBy((v) => (v === 'contract_expiring' ? 'all' : 'contract_expiring')) },
    { key: 'notes', label: t('shortlist_filter_with_notes'), active: withNotesOnly, toggle: () => setWithNotesOnly((v) => !v) },
  ];

  const sortOptions: { key: SortOption; label: string }[] = [
    { key: 'added', label: t('shortlist_sort_added') },
    { key: 'market_value', label: t('shortlist_sort_market_value') },
    { key: 'name', label: t('shortlist_sort_name') },
    { key: 'age', label: t('shortlist_sort_age') },
  ];

  const chgBadge = (pct: number | null) =>
    pct == null || pct === 0 ? null : (
      <span className={`brit-sl-chg ${pct > 0 ? 'up' : 'down'}`}>{pct > 0 ? '▲ +' : '▼ '}{Math.abs(pct)}%</span>
    );

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="shortlist"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('shortlist_watching')}
              <strong>{entries.length}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_shortlist')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('shortlist_room_kicker')}</p>
                <h1>{t('shortlist_room_head_a')} <span>{t('shortlist_room_head_b')}</span></h1>
              </div>
              <div className="brit-mast-actions">
                <div className="brit-view-toggle" role="tablist">
                  <button className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>{t('shortlist_view_board')}</button>
                  <button className={view === 'ledger' ? 'active' : ''} onClick={() => setView('ledger')}>{t('players_view_ledger')}</button>
                </div>
                <button className="brit-mast-add" onClick={() => setShowAddDrawer(true)}>+ {t('shortlist_add_from_tm')}</button>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals" aria-label={t('shortlist_signals')}>
              <div className="brit-signal">
                <label>{t('shortlist_signal_targets')}</label>
                <strong>{String(entries.length).padStart(2, '0')}</strong>
                <small>{t('shortlist_signal_targets_note').replace('{n}', String(monthAdds))}</small>
              </div>
              <div className="brit-signal">
                <label>{t('shortlist_signal_value')}</label>
                <strong className="brit-gold">{fmtValue(totalValue)}</strong>
                <small>{t('players_signal_value_note').replace('{n}', String(valuedCount))}</small>
              </div>
              <div className="brit-signal">
                <label>{t('shortlist_signal_free')}</label>
                <strong className={freeCount > 0 ? 'brit-gold' : ''}>{String(freeCount).padStart(2, '0')}</strong>
                <small>{t('players_signal_free_note')}</small>
              </div>
            </section>

            {/* Filter tray */}
            <section className="brit-tray" aria-label={t('filters')}>
              <div className="brit-tray-top">
                <label className="brit-search">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search_placeholder')} aria-label={t('search_placeholder')} />
                </label>
                <div className="brit-segment" role="group">
                  <button className={!positionFilter ? 'active' : ''} onClick={() => setPositionFilter(null)}>{t('releases_all')}</button>
                  {POSITION_GROUPS.map((p) => (
                    <button key={p} className={positionFilter === p ? 'active' : ''} onClick={() => setPositionFilter((v) => (v === p ? null : p))}>{p}</button>
                  ))}
                </div>
              </div>
              <div className="brit-chips">
                {filterChips.map((c) => (
                  <button key={c.key} className={`brit-chip${c.active ? ' on' : ''}`} onClick={c.toggle} disabled={c.disabled} style={c.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
                    <span className="brit-dot" />{c.label}
                  </button>
                ))}
              </div>
              <div className="brit-tray-bottom">
                <div className="brit-sort">
                  <span>{t('players_sort_label')}</span>
                  {sortOptions.map((o) => (
                    <button key={o.key} className={sortOption === o.key ? 'active' : ''} onClick={() => setSortOption(o.key)}>{o.label}</button>
                  ))}
                </div>
                {activeFilterCount > 0 && <button className="brit-clear" onClick={clearFilters}>{t('players_clear_filters')} ×</button>}
              </div>
            </section>

            <p className="brit-result-count">
              {t('shortlist_showing').replace('{n}', String(list.length)).replace('{total}', String(entries.length))}
              {activeFilterCount > 0 && <> / {t('players_filters_active').replace('{n}', String(activeFilterCount))}</>}
            </p>

            {/* First-load skeleton (avoids a false "empty" flash) */}
            {!ready && (
              <div className="brit-sl-board">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div className="brit-skel-card" key={i}>
                    <div className="top brit-skel" />
                    <div className="body">
                      <div className="brit-skel l1" /><div className="brit-skel l2" /><div className="brit-skel l3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Board view */}
            {ready && view === 'board' && (
              <div className="brit-sl-board">
                {list.map((e, i) => {
                  const tags = entryTags(e);
                  const pct = valueChange(e);
                  return (
                    <article
                      key={e.tmProfileUrl}
                      id={`brit-sl-${encodeURIComponent(e.tmProfileUrl)}`}
                      className={`brit-sl-card${highlightedUrl === e.tmProfileUrl ? ' hl' : ''}`}
                    >
                      <Link href={addPlayerHref(e)} className="brit-sl-media">
                        {e.playerImage ? <img src={e.playerImage} alt="" /> : <div className="ph" />}
                        <span className="brit-sl-num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="brit-sl-cardflags">
                          {tags.filter((tg) => tg.cls !== 'exp').map((tg, idx) => <b key={idx}>{tg.label}</b>)}
                        </span>
                        <div className="brit-sl-copy">
                          <small>{clubDisplay(e, t)} / {positionsLabel(e)}</small>
                          <h3>{e.playerName || '—'}</h3>
                        </div>
                      </Link>
                      <div className="brit-sl-body">
                        <div className="brit-sl-vrow">
                          <span className="v">{e.marketValue || '—'}</span>
                          {chgBadge(pct)}
                        </div>
                        <div className="brit-sl-foot">
                          <span className="watcher"><span className="wd">{(agentName(e) || '?').charAt(0).toUpperCase()}</span>{agentName(e)} · {addedAgo(e.addedAt)}</span>
                        </div>
                        <div className="brit-sl-actions">
                          <button onClick={() => openAddNote(e)}>+ {t('shortlist_notes_add')}{(e.notes?.length ?? 0) > 0 ? ` (${e.notes!.length})` : ''}</button>
                          {e.tmProfileUrl.includes('transfermarkt') && (
                            <>
                              <a href={e.tmProfileUrl} target="_blank" rel="noopener noreferrer">TM ↗</a>
                              <button onClick={() => shareToTeam(e)} title={t('shortlist_share_brit_team_whatsapp')}>WA</button>
                            </>
                          )}
                          <button className="rm" onClick={() => removeEntry(e)} disabled={removingUrl === e.tmProfileUrl}>{t('shortlist_remove')} ✕</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {list.length === 0 && <div className="brit-empty">{t('shortlist_empty')}</div>}
              </div>
            )}

            {/* Ledger view */}
            {ready && view === 'ledger' && (
              <div className="brit-table-wrap">
                <table className="brit-roster brit-players-table">
                  <thead>
                    <tr>
                      <th>{t('shortlist_th_target')}</th>
                      <th>{t('room_th_club')}</th>
                      <th>{t('room_th_position')}</th>
                      <th>{t('room_th_value')}</th>
                      <th>{t('shortlist_th_change')}</th>
                      <th>{t('shortlist_th_scout')}</th>
                      <th>{t('room_th_action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e) => {
                      const pct = valueChange(e);
                      const tags = entryTags(e);
                      return (
                        <tr key={e.tmProfileUrl} id={`brit-sl-${encodeURIComponent(e.tmProfileUrl)}`}>
                          <td>
                            <Link href={addPlayerHref(e)} className="brit-cell-player">
                              {e.playerImage ? <img className="brit-p-thumb" src={e.playerImage} alt="" /> : <div className="brit-p-thumb brit-p-thumb-ph">{initials(e.playerName)}</div>}
                              <div>
                                <div className="brit-p-name">{e.playerName || '—'}</div>
                                <div className="brit-p-meta">{e.playerNationality || '—'}{e.playerAge ? ` · ${e.playerAge}` : ''}</div>
                              </div>
                            </Link>
                          </td>
                          <td>{clubDisplay(e, t)}</td>
                          <td>{positionsLabel(e)}</td>
                          <td className="brit-val">{e.marketValue || '—'}</td>
                          <td>{chgBadge(pct) || <span className="brit-p-meta">—</span>}</td>
                          <td className="brit-p-agent-cell">{agentName(e)} · {addedAgo(e.addedAt)}</td>
                          <td>
                            <div className="brit-flags">
                              {tags.map((tg, idx) => <span key={idx} className={`brit-tag ${tg.cls}`}>{tg.label}</span>)}
                              <button className="brit-sl-rm" onClick={() => removeEntry(e)} disabled={removingUrl === e.tmProfileUrl} title={t('shortlist_remove')}>✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {list.length === 0 && <div className="brit-empty">{t('shortlist_empty')}</div>}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Note modal */}
      {noteEntry && (
        <div className="brit-sl-modal-scrim" onClick={closeNote}>
          <div className="brit-sl-modal" onClick={(ev) => ev.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="brit-sl-modal-head">
              <h3>{noteMode === 'edit' ? t('shortlist_notes_edit_title') : t('shortlist_notes_add_title')}</h3>
              <button onClick={closeNote}>×</button>
            </div>
            <div className="brit-sl-modal-player">
              {noteEntry.playerImage ? <img src={noteEntry.playerImage} alt="" /> : <div className="brit-p-thumb brit-p-thumb-ph" style={{ width: 40, height: 40 }}>{initials(noteEntry.playerName)}</div>}
              <div>
                <strong>{noteEntry.playerName || '—'}</strong>
                <span>{[positionsLabel(noteEntry), clubDisplay(noteEntry, t)].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
            {/* Existing notes */}
            {noteMode === 'add' && (noteEntry.notes?.length ?? 0) > 0 && (
              <div className="brit-sl-notelist">
                {noteEntry.notes!.map((n, ni) => (
                  <div className="brit-sl-noteitem" key={ni}>
                    <p>{n.text}</p>
                    <div className="meta">
                      <span>{(isRtl ? n.createdByHebrewName || n.createdBy : n.createdBy) || '—'}</span>
                      <span className="ops">
                        <button onClick={() => openEditNote(noteEntry, ni, n.text)}>✎</button>
                        <button className="del" onClick={() => deleteNote(noteEntry, ni)}>🗑</button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <NoteTextarea
              value={noteText}
              onChange={setNoteText}
              accounts={allAccounts.map((a) => ({ id: a.id, name: a.name ?? undefined, hebrewName: a.hebrewName ?? undefined })) as NoteAccount[]}
              isRtl={isRtl}
              placeholder={t('shortlist_notes_placeholder')}
              rows={4}
              autoFocus
              className="brit-sl-textarea"
              onTaggedAgentsChange={setNoteTaggedIds}
            />
            <div className="brit-sl-modal-actions">
              <button onClick={closeNote}>{t('common_cancel')}</button>
              <button className="primary" onClick={saveNote} disabled={!noteText.trim() || savingNote}>
                {savingNote ? '…' : t('shortlist_notes_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-to-shortlist guided drawer */}
      <MenAddPlayerDrawer mode="shortlist" open={showAddDrawer} onClose={() => setShowAddDrawer(false)} />
    </div>
  );
}
