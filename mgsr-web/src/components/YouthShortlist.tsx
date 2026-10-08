'use client';

/**
 * Youth platform shortlist — "Light Management Room" (teal) redesign.
 *
 * Self-contained full-bleed editorial layout for the YOUTH platform. Subscribes
 * to the youth shortlist collection and renders tracked prospects in the teal
 * editorial shell, with age-group tags, a With-notes lens and age-group chips.
 * Mirrors MenShortlist's shell/classes; youth-scoped data and columns.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { CLUB_REQUESTS_COLLECTIONS, SHORTLISTS_COLLECTIONS } from '@/lib/platformCollections';
import {
  callShortlistRemove,
  callShortlistAddNote,
  callShortlistUpdateNote,
  callShortlistDeleteNote,
} from '@/lib/callables';
import { getAllAccounts, getCurrentAccountForShortlist, type AccountForShortlist } from '@/lib/accounts';
import { subscribePlayersYouth, type YouthPlayer } from '@/lib/playersYouth';
import type { ClubRequest } from '@/lib/requestMatcher';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';
import NoteTextarea, { type NoteAccount } from '@/components/NoteTextarea';
import YouthAddShortlistDrawer from '@/components/YouthAddShortlistDrawer';
import YouthAddProspectDrawer from '@/components/YouthAddProspectDrawer';
import YouthShortlistDrawer, { type YouthShortlistDrawerEntry } from '@/components/YouthShortlistDrawer';

interface ShortlistNote {
  text: string;
  createdBy?: string;
  createdByHebrewName?: string;
  createdById?: string;
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
  const { user } = useAuth();
  const { t, lang, setLang, isRtl } = useLanguage();

  const cached = getScreenCache<YouthShortlistCache>('youth-shortlist');

  const [entries, setEntries] = useState<YouthShortlistEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [search, setSearch] = useState(cached?.search ?? '');
  const [ageGroupFilter, setAgeGroupFilter] = useState<string | null>(cached?.ageGroupFilter ?? null);
  const [withNotes, setWithNotes] = useState(cached?.withNotes ?? false);

  // Target-intelligence drawer + demand/sign-to-academy wiring
  const [drawerEntry, setDrawerEntry] = useState<YouthShortlistEntry | null>(null);
  const [youthPlayers, setYouthPlayers] = useState<YouthPlayer[]>([]);
  const [clubRequests, setClubRequests] = useState<ClubRequest[]>([]);
  const [allAccounts, setAllAccounts] = useState<AccountForShortlist[]>([]);
  const [signInitialUrl, setSignInitialUrl] = useState<string | null>(null);
  const [showSignDrawer, setShowSignDrawer] = useState(false);
  const pendingRemoveRef = useRef<Set<string>>(new Set());

  // Note modal
  const [noteEntry, setNoteEntry] = useState<YouthShortlistEntry | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteMode, setNoteMode] = useState<'add' | 'edit'>('add');
  const [noteEditIndex, setNoteEditIndex] = useState(-1);
  const [noteTaggedIds, setNoteTaggedIds] = useState<string[]>([]);
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    const col = SHORTLISTS_COLLECTIONS.youth;
    const unsub = onSnapshot(
      query(collection(db, col), orderBy('addedAt', 'desc')),
      (snap) => {
        const mapped = snap.docs.map((d) => ({ tmProfileUrl: d.id, ...d.data() } as YouthShortlistEntry));
        const pending = pendingRemoveRef.current;
        const filtered = pending.size > 0 ? mapped.filter((e) => !pending.has(e.tmProfileUrl)) : mapped;
        const snapUrls = new Set(mapped.map((e) => e.tmProfileUrl));
        Array.from(pending).forEach((u) => { if (!snapUrls.has(u)) pending.delete(u); });
        setEntries(filtered);
        setReady(true);
      },
      () => setReady(true)
    );
    return () => unsub();
  }, []);

  // Roster youth players (for IFA-form lookup) + active youth club requests (for demand matching)
  useEffect(() => {
    const unsubP = subscribePlayersYouth(setYouthPlayers);
    const unsubR = onSnapshot(collection(db, CLUB_REQUESTS_COLLECTIONS.youth), (snap) => {
      const reqs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClubRequest & { status?: string }));
      setClubRequests(reqs.filter((r) => r.status !== 'closed'));
    }, () => setClubRequests([]));
    return () => { unsubP(); unsubR(); };
  }, []);

  useEffect(() => {
    getAllAccounts().then(setAllAccounts).catch(() => setAllAccounts([]));
  }, []);

  // Keep the open drawer in sync with real-time note/detail updates.
  useEffect(() => {
    if (drawerEntry) {
      const updated = entries.find((e) => e.tmProfileUrl === drawerEntry.tmProfileUrl);
      if (updated) setDrawerEntry(updated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

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
    const url = e.tmProfileUrl;
    pendingRemoveRef.current.add(url);
    setEntries((prev) => prev.filter((x) => x.tmProfileUrl !== url));
    if (drawerEntry?.tmProfileUrl === url) setDrawerEntry(null);
    setRemovingUrl(url);
    try {
      await callShortlistRemove({ platform: 'youth', tmProfileUrl: url });
    } catch {
      pendingRemoveRef.current.delete(url);
    } finally {
      setRemovingUrl(null);
    }
  };

  // Promote a shortlist target to the youth academy roster.
  const handleSignToRoster = (targetEntry: YouthShortlistDrawerEntry) => {
    setDrawerEntry(null);
    setSignInitialUrl(targetEntry.tmProfileUrl);
    setShowSignDrawer(true);
  };

  // ── Notes ──
  const openAddNote = (e: YouthShortlistEntry) => { setNoteEntry(e); setNoteMode('add'); setNoteText(''); setNoteEditIndex(-1); setNoteTaggedIds([]); };
  const openEditNote = (e: YouthShortlistEntry, idx: number, text: string) => { setNoteEntry(e); setNoteMode('edit'); setNoteText(text); setNoteEditIndex(idx); setNoteTaggedIds([]); };
  const closeNote = () => { setNoteEntry(null); setNoteText(''); setNoteEditIndex(-1); setNoteTaggedIds([]); };

  const saveNote = async () => {
    if (!noteEntry || !noteText.trim() || !user) return;
    setSavingNote(true);
    try {
      if (noteMode === 'edit' && noteEditIndex >= 0) {
        await callShortlistUpdateNote({ platform: 'youth', tmProfileUrl: noteEntry.tmProfileUrl, noteIndex: noteEditIndex, newText: noteText.trim() });
      } else {
        const account = await getCurrentAccountForShortlist(user);
        await callShortlistAddNote({
          platform: 'youth',
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

  const deleteNote = async (e: YouthShortlistEntry, idx: number) => {
    try {
      await callShortlistDeleteNote({ platform: 'youth', tmProfileUrl: e.tmProfileUrl, noteIndex: idx });
    } catch { /* ignore */ }
  };

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="shortlist"
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
                <button className="brit-mast-add" onClick={() => setShowAddDrawer(true)}>
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
                      <tr key={e.tmProfileUrl} style={{ cursor: 'pointer' }} onClick={() => setDrawerEntry(e)}>
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
                          <div className="brit-flags" onClick={(ev) => ev.stopPropagation()}>
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

      {/* Note modal (view / add / edit) */}
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
                <span>{[positionsLabel(noteEntry), clubDisplay(noteEntry)].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
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

      {/* Target Intelligence Drawer (opens on row click) */}
      <YouthShortlistDrawer
        entry={drawerEntry as YouthShortlistDrawerEntry | null}
        onClose={() => setDrawerEntry(null)}
        onSignToRoster={handleSignToRoster}
        onRemove={(e) => removeEntry(e as YouthShortlistEntry)}
        onOpenAddNote={(e) => openAddNote(e as YouthShortlistEntry)}
        youthPlayers={youthPlayers}
        clubRequests={clubRequests}
      />

      {/* Add-to-shortlist guided drawer (Find → Confirm → Done) — mirrors the roster drawer design */}
      <YouthAddShortlistDrawer open={showAddDrawer} onClose={() => setShowAddDrawer(false)} />

      {/* Sign-to-academy: promote a shortlist target to the youth roster (prefilled from IFA) */}
      <YouthAddProspectDrawer
        open={showSignDrawer}
        initialIfaUrl={signInitialUrl}
        onClose={() => { setShowSignDrawer(false); setSignInitialUrl(null); }}
        onSaved={() => { setShowSignDrawer(false); setSignInitialUrl(null); }}
      />
    </div>
  );
}
