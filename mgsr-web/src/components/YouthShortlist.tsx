'use client';

/**
 * Youth platform shortlist — "Light Management Room" (teal) redesign.
 *
 * Self-contained full-bleed editorial layout for the YOUTH platform. Subscribes
 * to the youth shortlist collection and renders tracked prospects in the teal
 * editorial shell, with age-group tags, a With-notes lens and age-group chips.
 * Mirrors MenShortlist's shell/classes; youth-scoped data and columns.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { SHORTLISTS_COLLECTIONS } from '@/lib/platformCollections';
import { callShortlistRemove } from '@/lib/callables';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';

interface ShortlistNote {
  text: string;
  createdBy?: string;
  createdAt?: number;
}
interface YouthShortlistEntry {
  tmProfileUrl: string;
  addedAt?: number;
  playerImage?: string;
  playerName?: string;
  playerNameHe?: string;
  playerPosition?: string;
  positions?: string[];
  playerAge?: string;
  ageGroup?: string;
  playerNationality?: string;
  clubJoinedName?: string;
  currentClub?: { clubName?: string };
  addedByAgentName?: string;
  addedByAgentHebrewName?: string;
  notes?: ShortlistNote[];
}

const AGE_GROUPS = ['U-15', 'U-17', 'U-19', 'U-21'] as const;

const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const positionsLabel = (e: YouthShortlistEntry) =>
  (e.positions?.filter(Boolean) ?? (e.playerPosition ? [e.playerPosition] : [])).slice(0, 3).join(' / ') || '—';

interface YouthShortlistCache {
  search: string;
  ageGroupFilter: string | null;
  withNotes: boolean;
}

export default function YouthShortlist() {
  const { t, lang, setLang, isRtl } = useLanguage();
  const router = useRouter();

  const cached = getScreenCache<YouthShortlistCache>('youth-shortlist');

  const [entries, setEntries] = useState<YouthShortlistEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [search, setSearch] = useState(cached?.search ?? '');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string | null>(cached?.ageGroupFilter ?? null);
  const [withNotes, setWithNotes] = useState(cached?.withNotes ?? false);

  useEffect(() => {
    const col = SHORTLISTS_COLLECTIONS.youth;
    const unsub = onSnapshot(
      query(collection(db, col), orderBy('addedAt', 'desc')),
      (snap) => {
        setEntries(snap.docs.map((d) => ({ tmProfileUrl: d.id, ...d.data() } as YouthShortlistEntry)));
        setReady(true);
      },
      () => setReady(true)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    setScreenCache<YouthShortlistCache>('youth-shortlist', { search, ageGroupFilter, withNotes });
  }, [search, ageGroupFilter, withNotes]);

  const list = useMemo(() => {
    let r = entries;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      r = r.filter(
        (e) =>
          e.playerName?.toLowerCase().includes(q) ||
          e.playerNameHe?.includes(q) ||
          (e.clubJoinedName ?? e.currentClub?.clubName)?.toLowerCase().includes(q) ||
          e.ageGroup?.toLowerCase().includes(q)
      );
    }
    if (ageGroupFilter) r = r.filter((e) => e.ageGroup === ageGroupFilter);
    if (withNotes) r = r.filter((e) => (e.notes?.length ?? 0) > 0);
    return r;
  }, [entries, search, ageGroupFilter, withNotes]);

  const withNotesCount = useMemo(() => entries.filter((e) => (e.notes?.length ?? 0) > 0).length, [entries]);
  const thisWeekCount = useMemo(() => {
    const wk = Date.now() - 7 * 86400000;
    return entries.filter((e) => (e.addedAt ?? 0) >= wk).length;
  }, [entries]);

  const activeFilterCount = (ageGroupFilter ? 1 : 0) + (withNotes ? 1 : 0);
  const clearFilters = () => { setAgeGroupFilter(null); setWithNotes(false); };

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const clubDisplay = (e: YouthShortlistEntry) =>
    (e.clubJoinedName ?? e.currentClub?.clubName)?.trim() || t('without_club');
  const agentName = (e: YouthShortlistEntry) =>
    (isRtl ? e.addedByAgentHebrewName || e.addedByAgentName : e.addedByAgentName || e.addedByAgentHebrewName) || '—';
  const addedAgo = (ms?: number) =>
    ms ? new Date(ms).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' }) : '—';

  const removeEntry = async (e: YouthShortlistEntry) => {
    setRemovingUrl(e.tmProfileUrl);
    try {
      await callShortlistRemove({ platform: 'youth', tmProfileUrl: e.tmProfileUrl });
    } catch {
      /* ignore — optimistic UI */
    } finally {
      setRemovingUrl(null);
    }
  };

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="shortlist"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value_youth')}</strong>
              {t('shortlist_signal_targets')}
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
                <p className="brit-kicker">{t('shortlist_room_kicker')}</p>
                <h1>
                  {t('youth_room_shortlist_a')} <span>{t('youth_room_shortlist_b')}</span>
                </h1>
              </div>
              <div className="brit-mast-actions">
                <button className="brit-mast-add" onClick={() => router.push('/players/add?shortlist=1')}>
                  + {t('youth_add_youth_player')}
                </button>
              </div>
            </header>

            <section className="brit-signals">
              <div className="brit-signal">
                <label>{t('shortlist_signal_targets')}</label>
                <strong>{String(entries.length).padStart(2, '0')}</strong>
                <small>U-13 → U-21</small>
              </div>
              <div className="brit-signal">
                <label>{t('youth_with_notes')}</label>
                <strong className="brit-gold">{String(withNotesCount).padStart(2, '0')}</strong>
                <small>{t('youth_ifa_form')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('shortlist_signal_targets_note').replace('{n}', String(thisWeekCount))}</label>
                <strong>{String(thisWeekCount).padStart(2, '0')}</strong>
                <small>&nbsp;</small>
              </div>
            </section>

            <section className="brit-tray">
              <div className="brit-tray-top">
                <label className="brit-search">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                  </svg>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search_placeholder')} />
                </label>
              </div>
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
              {activeFilterCount > 0 && (
                <div className="brit-tray-bottom">
                  <span />
                  <button className="brit-clear" onClick={clearFilters}>{t('players_clear_filters')} ×</button>
                </div>
              )}
            </section>

            <p className="brit-result-count">
              {t('shortlist_showing').replace('{n}', String(list.length)).replace('{total}', String(entries.length))}
              {activeFilterCount > 0 && <> / {t('players_filters_active').replace('{n}', String(activeFilterCount))}</>}
            </p>

            {!ready && (
              <div className="brit-players-gallery">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div className="brit-skel-card" key={i}><div className="top brit-skel" /></div>
                ))}
              </div>
            )}

            {ready && (
              <div className="brit-table-wrap">
                <table className="brit-roster brit-players-table">
                  <thead>
                    <tr>
                      <th>{t('youth_prospect')}</th>
                      <th>{t('room_th_club')}</th>
                      <th>{t('room_th_position')}</th>
                      <th>{t('players_th_agent')}</th>
                      <th>{t('youth_age_group')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((e) => (
                      <tr key={e.tmProfileUrl} style={{ cursor: 'default' }}>
                        <td>
                          <div className="brit-cell-player">
                            {e.playerImage ? (
                              <img className="brit-p-thumb" src={e.playerImage} alt="" />
                            ) : (
                              <div className="brit-p-thumb brit-p-thumb-ph">{initials(e.playerName)}</div>
                            )}
                            <div>
                              <div className="brit-p-name">{e.playerName || t('shortlist_unknown_player')}</div>
                              <div className="brit-p-meta">{e.playerNameHe || e.playerNationality || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td>{clubDisplay(e)}</td>
                        <td><div className="brit-pos-tags">{positionsLabel(e)}</div></td>
                        <td className="brit-p-agent-cell">{agentName(e)}<br /><span className="brit-p-meta">{addedAgo(e.addedAt)}</span></td>
                        <td style={{ textAlign: 'end' }}>
                          <div className="brit-flags">
                            {(e.notes?.length ?? 0) > 0 && <span className="brit-tag mandate">{t('youth_with_notes')}</span>}
                            {e.ageGroup && <span className="brit-agtag">{e.ageGroup}</span>}
                            <button className="brit-sl-rm" onClick={() => removeEntry(e)} disabled={removingUrl === e.tmProfileUrl} title={t('shortlist_remove')}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {list.length === 0 && <div className="brit-empty">{t('players_empty_filtered')}</div>}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
