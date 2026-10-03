/**
 * Youth platform players screen — "Light Management Room" (teal) redesign.
 *
 * Self-contained full-bleed editorial layout for the YOUTH platform, mirroring
 * MenPlayers but scoped to youth: IFA-sourced prospects, age-group as the
 * organizing axis (replaces market value), IFA season form (apps/goals/assists),
 * and a cooler pitch-teal accent (via the body[data-platform="youth"] .brit-room
 * override in globals.css). Links to the youth detail route.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import YouthAddProspectDrawer from '@/components/YouthAddProspectDrawer';
import { subscribePlayersYouth, type YouthPlayer } from '@/lib/playersYouth';

type SortOption = 'default' | 'ageGroup' | 'goals' | 'name';

const POSITION_GROUPS = ['GK', 'DEF', 'MID', 'FWD'] as const;
const POSITION_CODES: Record<string, Set<string>> = {
  GK: new Set(['GK']),
  DEF: new Set(['CB', 'RB', 'LB']),
  MID: new Set(['CM', 'DM', 'AM']),
  FWD: new Set(['ST', 'CF', 'LW', 'RW', 'SS']),
};
const AGE_GROUPS = ['U-13', 'U-14', 'U-15', 'U-17', 'U-19', 'U-21'] as const;

const positionsLabel = (p: YouthPlayer) => p.positions?.filter(Boolean).join(' / ') || '—';
const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const ageGroupNum = (ag: string | undefined) => {
  const m = (ag || '').match(/(\d+)/);
  return m ? parseInt(m[1]!, 10) : 999;
};

interface YouthFilterCache {
  search: string;
  positionFilter: string | null;
  ageGroupFilter: string | null;
  withNotes: boolean;
  sortOption: SortOption;
  view: 'table' | 'gallery';
}

export default function YouthPlayers() {
  const { t, lang, setLang, isRtl } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const cached = getScreenCache<YouthFilterCache>('youth-players');

  const [players, setPlayers] = useState<YouthPlayer[]>([]);
  const [ready, setReady] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);

  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string | null>(cached?.positionFilter ?? null);
  const [ageGroupFilter, setAgeGroupFilter] = useState<string | null>(cached?.ageGroupFilter ?? null);
  const [withNotes, setWithNotes] = useState(cached?.withNotes ?? false);
  const [sortOption, setSortOption] = useState<SortOption>(cached?.sortOption ?? 'default');
  const [view, setView] = useState<'table' | 'gallery'>(cached?.view ?? 'gallery');

  useEffect(() => {
    const unsub = subscribePlayersYouth((list) => {
      setPlayers(list);
      setReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setScreenCache<YouthFilterCache>('youth-players', {
      search, positionFilter, ageGroupFilter, withNotes, sortOption, view,
    });
  }, [search, positionFilter, ageGroupFilter, withNotes, sortOption, view]);

  // Highlight-on-navigate (dashboard global search → youth roster)
  const highlightParam = searchParams.get('highlight');
  useEffect(() => {
    if (!highlightParam || !ready || players.length === 0) return;
    const id = decodeURIComponent(highlightParam);
    if (!players.some((p) => p.id === id)) return;
    setHighlightedId(id);
    const el = document.getElementById(`brit-pl-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const clearUrl = setTimeout(() => router.replace('/players', { scroll: false }), 500);
    const clearHl = setTimeout(() => setHighlightedId(null), 2600);
    return () => { clearTimeout(clearUrl); clearTimeout(clearHl); };
  }, [highlightParam, ready, players, router]);

  const filtered = useMemo(() => {
    let result = players;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.fullName?.toLowerCase().includes(q) ||
          p.fullNameHe?.includes(q) ||
          p.positions?.some((pos) => pos?.toLowerCase().includes(q)) ||
          p.currentClub?.clubName?.toLowerCase().includes(q) ||
          p.ageGroup?.toLowerCase().includes(q) ||
          p.academy?.toLowerCase().includes(q)
      );
    }
    if (positionFilter && POSITION_CODES[positionFilter]) {
      const codes = POSITION_CODES[positionFilter]!;
      result = result.filter((p) => p.positions?.some((pos) => pos && codes.has(pos.toUpperCase())));
    }
    if (ageGroupFilter) {
      result = result.filter((p) => p.ageGroup === ageGroupFilter);
    }
    if (withNotes) {
      result = result.filter(
        (p) => (p.notes && p.notes.trim().length > 0) || (p.noteList && p.noteList.length > 0)
      );
    }
    return result;
  }, [players, search, positionFilter, ageGroupFilter, withNotes]);

  const displayList = useMemo(() => {
    if (sortOption === 'default') return filtered;
    const sorted = [...filtered];
    if (sortOption === 'ageGroup') {
      sorted.sort((a, b) => ageGroupNum(b.ageGroup) - ageGroupNum(a.ageGroup));
    } else if (sortOption === 'goals') {
      sorted.sort((a, b) => (b.ifaStats?.goals ?? 0) - (a.ifaStats?.goals ?? 0));
    } else if (sortOption === 'name') {
      sorted.sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''));
    }
    return sorted;
  }, [filtered, sortOption]);

  // ── Signals ──
  const callupCount = useMemo(
    () => players.filter((p) => (p.notes || '').toLowerCase().includes('national') || (p.noteList ?? []).some((n) => (n.notes || '').toLowerCase().includes('national'))).length,
    [players]
  );
  const mandateCount = useMemo(() => players.filter((p) => p.haveMandate).length, [players]);
  const peakGroup = useMemo(() => {
    const counts = new Map<string, number>();
    players.forEach((p) => { if (p.ageGroup) counts.set(p.ageGroup, (counts.get(p.ageGroup) ?? 0) + 1); });
    let best = '—'; let bestN = 0;
    counts.forEach((n, ag) => { if (n > bestN) { bestN = n; best = ag; } });
    return { group: best, n: bestN };
  }, [players]);

  const activeFilterCount =
    (positionFilter ? 1 : 0) + (ageGroupFilter ? 1 : 0) + (withNotes ? 1 : 0);

  const clearFilters = () => {
    setPositionFilter(null);
    setAgeGroupFilter(null);
    setWithNotes(false);
  };

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const goToPlayer = (id: string) => router.push(`/players/youth/${id}?from=/players`);

  const sortOptions: { key: SortOption; label: string }[] = [
    { key: 'default', label: t('players_sort_default') },
    { key: 'ageGroup', label: t('youth_age_group') },
    { key: 'goals', label: t('youth_ifa_goals') },
    { key: 'name', label: t('players_sort_name') },
  ];

  const clubDisplay = (p: YouthPlayer) => p.currentClub?.clubName || t('no_club');
  const ifaForm = (p: YouthPlayer) => {
    const s = p.ifaStats ?? {};
    return { apps: s.matches ?? 0, goals: s.goals ?? 0, assists: s.assists ?? 0 };
  };
  const hasNotes = (p: YouthPlayer) =>
    (p.notes && p.notes.trim().length > 0) || (p.noteList && p.noteList.length > 0);

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="players"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value_youth')}</strong>
              {t('youth_sig_prospects')}
              <strong>{players.length}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_players_youth')}</strong> / {dateStr}
            </div>
            <div className="brit-actions">
              <BritPlatformSwitch />
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>
                {lang === 'en' ? 'HE / EN' : 'EN / HE'}
              </button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('youth_room_kicker')}</p>
                <h1>
                  {t('youth_room_prospects_a')} <span>{t('youth_room_prospects_b')}</span>
                </h1>
                <p className="brit-mast-note">{t('youth_room_source')}</p>
              </div>
              <div className="brit-mast-actions">
                <div className="brit-view-toggle" role="tablist" aria-label="View mode">
                  <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>
                    {t('players_view_ledger')}
                  </button>
                  <button className={view === 'gallery' ? 'active' : ''} onClick={() => setView('gallery')}>
                    {t('players_view_gallery')}
                  </button>
                </div>
                <button className="brit-mast-add" onClick={() => setShowAddDrawer(true)}>
                  + {t('youth_add_prospect')}
                </button>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals">
              <div className="brit-signal">
                <label>{t('youth_sig_prospects')}</label>
                <strong>{String(players.length).padStart(2, '0')}</strong>
                <small>U-13 → U-21</small>
              </div>
              <div className="brit-signal">
                <label>{t('youth_sig_callups')}</label>
                <strong className="brit-gold">{String(callupCount).padStart(2, '0')}</strong>
                <small>{t('youth_ifa_form')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('youth_sig_mandates')}</label>
                <strong>{String(mandateCount).padStart(2, '0')}</strong>
                <small>{players.length - mandateCount} —</small>
              </div>
              <div className="brit-signal">
                <label>{t('youth_sig_peak')}</label>
                <strong className="brit-gold">{peakGroup.group}</strong>
                <small>{peakGroup.n} {t('youth_sig_prospects')}</small>
              </div>
            </section>

            {/* Filter tray */}
            <section className="brit-tray">
              <div className="brit-tray-top">
                <label className="brit-search">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                  </svg>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search_placeholder')} />
                </label>
                <div className="brit-segment" role="group">
                  <button className={!positionFilter ? 'active' : ''} onClick={() => setPositionFilter(null)}>
                    {t('releases_all')}
                  </button>
                  {POSITION_GROUPS.map((pos) => (
                    <button key={pos} className={positionFilter === pos ? 'active' : ''} onClick={() => setPositionFilter((v) => (v === pos ? null : pos))}>
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age-group row (youth motif) */}
              <div className="brit-region-row">
                <span className="brit-region-label">{t('youth_age_group')}</span>
                <div className="brit-region-chips">
                  <button className={`brit-region-chip${!ageGroupFilter ? ' on' : ''}`} onClick={() => setAgeGroupFilter(null)}>
                    {t('releases_all')}
                  </button>
                  {AGE_GROUPS.map((ag) => (
                    <button key={ag} className={`brit-region-chip${ageGroupFilter === ag ? ' on' : ''}`} onClick={() => setAgeGroupFilter((v) => (v === ag ? null : ag))}>
                      {ag}
                    </button>
                  ))}
                </div>
              </div>

              <div className="brit-chips">
                <button className={`brit-chip${withNotes ? ' on' : ''}`} onClick={() => setWithNotes((v) => !v)}>
                  <span className="brit-dot" />{t('youth_with_notes')}
                </button>
              </div>

              <div className="brit-tray-bottom">
                <div className="brit-sort">
                  <span>{t('players_sort_label')}</span>
                  {sortOptions.map((o) => (
                    <button key={o.key} className={sortOption === o.key ? 'active' : ''} onClick={() => setSortOption(o.key)}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {activeFilterCount > 0 && (
                  <button className="brit-clear" onClick={clearFilters}>{t('players_clear_filters')} ×</button>
                )}
              </div>
            </section>

            <p className="brit-result-count">
              {t('players_showing').replace('{n}', String(displayList.length)).replace('{total}', String(players.length))}
              {activeFilterCount > 0 && (<> / {t('players_filters_active').replace('{n}', String(activeFilterCount))}</>)}
            </p>

            {!ready && (
              <div className="brit-players-gallery">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div className="brit-skel-card brit-skel-tall" key={i}><div className="top brit-skel" /></div>
                ))}
              </div>
            )}

            {/* Table view */}
            {ready && view === 'table' && (
              <div className="brit-table-wrap">
                <table className="brit-roster brit-players-table">
                  <thead>
                    <tr>
                      <th>{t('youth_prospect')}</th>
                      <th>{t('room_th_club')}</th>
                      <th>{t('room_th_position')}</th>
                      <th>{t('youth_ifa_form')}</th>
                      <th>{t('youth_age_group')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayList.map((p) => {
                      const f = ifaForm(p);
                      return (
                        <tr key={p.id} id={`brit-pl-${p.id}`} className={highlightedId === p.id ? 'brit-row-highlight' : ''} onClick={() => goToPlayer(p.id)} style={{ cursor: 'pointer' }}>
                          <td>
                            <div className="brit-cell-player">
                              {p.profileImage ? (
                                <img className="brit-p-thumb" src={p.profileImage} alt="" />
                              ) : (
                                <div className="brit-p-thumb brit-p-thumb-ph">{initials(p.fullName)}</div>
                              )}
                              <div>
                                <div className="brit-p-name">{p.fullName || '—'}</div>
                                <div className="brit-p-meta">{p.fullNameHe || p.nationality || '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td>{clubDisplay(p)}</td>
                          <td>
                            <div className="brit-pos-tags">
                              {(p.positions?.filter(Boolean) ?? []).slice(0, 3).map((pos, idx) => (<b key={idx}>{pos}</b>))}
                              {(!p.positions || p.positions.filter(Boolean).length === 0) && '—'}
                            </div>
                          </td>
                          <td>
                            <div className="brit-ifa-form">
                              <span><b>{f.apps}</b> {t('youth_ifa_apps')}</span>
                              <span><b>{f.goals}</b> {t('youth_ifa_goals')}</span>
                              <span><b>{f.assists}</b> {t('youth_ifa_assists')}</span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'end' }}>
                            {p.ageGroup ? <span className="brit-agtag">{p.ageGroup}</span> : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {displayList.length === 0 && <div className="brit-empty">{t('players_empty_filtered')}</div>}
              </div>
            )}

            {/* Gallery view */}
            {ready && view === 'gallery' && (
              <div className="brit-players-gallery">
                {displayList.map((p, i) => {
                  const f = ifaForm(p);
                  return (
                    <article key={p.id} id={`brit-pl-${p.id}`} className={`brit-player-card${highlightedId === p.id ? ' brit-row-highlight' : ''}`} onClick={() => goToPlayer(p.id)}>
                      {p.profileImage ? (<img src={p.profileImage} alt={p.fullName || ''} />) : (<div className="brit-player-card-ph" />)}
                      <div className="brit-player-card-top">
                        <span className="brit-num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="brit-ct-flags">
                          {p.ageGroup && <b>{p.ageGroup}</b>}
                          {hasNotes(p) && <b>{t('youth_with_notes')}</b>}
                        </span>
                      </div>
                      <div className="brit-player-card-copy">
                        <small>{clubDisplay(p)} / {positionsLabel(p)}</small>
                        <h3>{p.fullName || '—'}</h3>
                        <div className="brit-cval">
                          {f.apps} {t('youth_ifa_apps')} · {f.goals} {t('youth_ifa_goals')} · {f.assists} {t('youth_ifa_assists')}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {displayList.length === 0 && <div className="brit-empty">{t('players_empty_filtered')}</div>}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Add-prospect guided drawer (Find → Confirm → Agent in charge → Done) */}
      <YouthAddProspectDrawer open={showAddDrawer} onClose={() => setShowAddDrawer(false)} />
    </div>
  );
}
