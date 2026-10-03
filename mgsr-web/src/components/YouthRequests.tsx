'use client';

/**
 * Youth platform Club Requirements — "Light Management Room" (teal) redesign.
 *
 * Self-contained editorial board for the YOUTH platform. Subscribes to the youth
 * club-requests collection and matches against youth prospects, rendering the
 * same .brit-req-* card markup as MenRequests but youth-scoped (no mandate strip,
 * links to the youth detail route). Pitch-teal accent via the data-platform CSS.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEuCountries } from '@/hooks/useEuCountries';
import { getPositionDisplayName } from '@/lib/appConfig';
import { matchRequestToPlayers, type RosterPlayer, type ClubRequest } from '@/lib/requestMatcher';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import { CLUB_REQUESTS_COLLECTIONS } from '@/lib/platformCollections';
import { subscribePlayersYouth, type YouthPlayer } from '@/lib/playersYouth';
import BritRail from '@/components/BritRail';
import BritPlatformSwitch from '@/components/BritPlatformSwitch';

interface Request {
  id: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  contactName?: string;
  position?: string;
  notes?: string;
  minAge?: number;
  maxAge?: number;
  ageGroup?: string;
  ageDoesntMatter?: boolean;
  dominateFoot?: string;
  createdAt?: number;
  status?: string;
  createdByAgent?: string;
  createdByAgentHebrew?: string;
}

const normalizePosition = (pos: string | undefined): string => {
  const p = pos?.trim().toUpperCase();
  if (p === 'ST') return 'CF';
  return pos?.trim() || '';
};
const POS_ORDER = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const posClass = (pos?: string): string => {
  const p = normalizePosition(pos).toUpperCase();
  if (p === 'GK') return 'gk';
  if (['CB', 'LB', 'RB'].includes(p)) return 'def';
  if (['DM', 'CM', 'AM', 'LM', 'RM'].includes(p)) return 'mid';
  if (['LW', 'RW', 'CF', 'SS'].includes(p)) return 'fwd';
  return 'def';
};
const ageRange = (r: Request): string | null => {
  if (r.ageGroup) return r.ageGroup;
  if (r.minAge && r.maxAge) return `${r.minAge}–${r.maxAge}`;
  if (r.minAge) return `${r.minAge}+`;
  if (r.maxAge) return `≤${r.maxAge}`;
  return null;
};
const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Youth → RosterPlayer adapter for the shared matcher. */
function youthToRosterPlayer(y: YouthPlayer): RosterPlayer {
  return {
    id: y.id,
    fullName: y.fullName,
    profileImage: y.profileImage,
    positions: y.positions,
    nationality: y.nationality,
    currentClub: y.currentClub,
    age: y.age,
  } as RosterPlayer;
}

interface YouthReqCache { search: string; positionFilter: string; }

export default function YouthRequests() {
  const { t, lang, setLang, isRtl } = useLanguage();
  const isHebrew = lang === 'he';
  const euCountries = useEuCountries();

  const cached = getScreenCache<YouthReqCache>('youth-requests-filters');

  const [requests, setRequests] = useState<Request[]>([]);
  const [ready, setReady] = useState(false);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string>(cached?.positionFilter ?? 'all');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, CLUB_REQUESTS_COLLECTIONS.youth),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Request));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setRequests(list);
        setReady(true);
      },
      () => setReady(true)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = subscribePlayersYouth((list) => setPlayers(list.map(youthToRosterPlayer)));
    return () => unsub();
  }, []);

  useEffect(() => {
    setScreenCache<YouthReqCache>('youth-requests-filters', { search, positionFilter });
  }, [search, positionFilter]);

  const pending = useMemo(() => requests.filter((r) => (r.status || 'pending') === 'pending'), [requests]);

  const matchesByRequest = useMemo(() => {
    const byId: Record<string, RosterPlayer[]> = {};
    for (const r of pending) {
      byId[r.id] = matchRequestToPlayers(r as ClubRequest, players, euCountries);
    }
    return byId;
  }, [pending, players, euCountries]);

  const matchCount = useMemo(
    () => Object.values(matchesByRequest).reduce((s, arr) => s + arr.length, 0),
    [matchesByRequest]
  );
  const newThisWeek = useMemo(() => {
    const wk = Date.now() - 7 * 86400000;
    return pending.filter((r) => (r.createdAt ?? 0) >= wk).length;
  }, [pending]);

  const activePositions = useMemo(() => {
    const set = new Set(pending.map((r) => normalizePosition(r.position) || 'Other'));
    return POS_ORDER.filter((p) => set.has(p)).concat(set.has('Other') ? ['Other'] : []);
  }, [pending]);

  const filtered = useMemo(() => {
    let list = pending;
    if (positionFilter !== 'all') list = list.filter((r) => (normalizePosition(r.position) || 'Other') === positionFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) =>
      (r.clubName || '').toLowerCase().includes(q) ||
      (r.clubCountry || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q) ||
      (r.position || '').toLowerCase().includes(q)
    );
    return list;
  }, [pending, positionFilter, search]);

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="requests"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value_youth')}</strong>
              {t('nav_requests')}
              <strong>{pending.length}</strong>
            </div>
          }
        />

        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <strong>{t('nav_requests')}</strong> / {dateStr}
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
                <p className="brit-kicker">{t('requests_room_kicker')}</p>
                <h1>{t('youth_room_requests_a')} <span>{t('youth_room_requests_b')}</span></h1>
              </div>
            </header>

            <section className="brit-signals">
              <div className="brit-signal">
                <label>{t('requests_room_open')}</label>
                <strong>{String(pending.length).padStart(2, '0')}</strong>
                <small>&nbsp;</small>
              </div>
              <div className="brit-signal">
                <label>{t('youth_matching_requests')}</label>
                <strong className="brit-gold">{String(matchCount).padStart(2, '0')}</strong>
                <small>&nbsp;</small>
              </div>
              <div className="brit-signal">
                <label>{t('youth_sig_callups')}</label>
                <strong>{String(newThisWeek).padStart(2, '0')}</strong>
                <small>&nbsp;</small>
              </div>
            </section>

            <section className="brit-tray">
              <div className="brit-tray-top">
                <label className="brit-search">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
                  </svg>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('requests_search_placeholder')} />
                </label>
                <div className="brit-req-filterrow">
                  <span className="brit-req-flabel">{t('room_th_position')}</span>
                  <div className="brit-req-chipset">
                    <button className={positionFilter === 'all' ? 'on' : ''} onClick={() => setPositionFilter('all')}>{t('releases_all')}</button>
                    {activePositions.map((p) => (
                      <button key={p} className={positionFilter === p ? 'on' : ''} onClick={() => setPositionFilter(p)}>{p}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <p className="brit-result-count">
              {t('requests_room_showing').replace('{n}', String(filtered.length)).replace('{total}', String(pending.length))}
            </p>

            {!ready ? (
              <div className="brit-req-board">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div className="brit-skel-card" key={i}><div className="top brit-skel" /></div>
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <div className="brit-req-board">
                {filtered.map((r) => {
                  const matches = matchesByRequest[r.id] ?? [];
                  const isNew = r.createdAt && Date.now() - r.createdAt < 7 * 86400000;
                  const age = ageRange(r);
                  return (
                    <article className="brit-req-card" key={r.id}>
                      <div className="brit-req-hero">
                        <div className="brit-req-hero-bg brit-req-hero-ph" />
                        <span className={`brit-req-pos ${posClass(r.position)}`}>{getPositionDisplayName(r.position, isHebrew) || r.position || '—'}</span>
                        <span className="brit-req-flags">
                          {age && <b>{age}</b>}
                          {isNew && <b>{isRtl ? 'חדש' : 'New'}</b>}
                        </span>
                        <div className="brit-req-clubline">
                          <div className="logo brit-req-logo-ph">{(r.clubName || '?').slice(0, 2).toUpperCase()}</div>
                          <div>
                            <strong>{r.clubName || '—'}</strong>
                            <small>{r.clubCountry || 'Israel'}</small>
                          </div>
                        </div>
                      </div>

                      <div className="brit-req-body">
                        <div className="brit-req-spec">
                          <div><label>{t('youth_age_group')}</label><b>{age || '—'}</b></div>
                          <div><label>{t('room_th_position')}</label><b>{getPositionDisplayName(r.position, isHebrew) || r.position || '—'}</b></div>
                          <div><label>{isRtl ? 'רגל' : 'Foot'}</label><b>{r.dominateFoot || '—'}</b></div>
                        </div>

                        {r.notes && <p className="brit-req-note" dir={isHebrew ? 'rtl' : 'ltr'}>{r.notes}</p>}

                        <div className="brit-req-matchstrip">
                          <div className="mleft">
                            {matches.length > 0 && (
                              <div className="brit-req-avatars">
                                {matches.slice(0, 4).map((p) =>
                                  p.profileImage ? (
                                    <img key={p.id} src={p.profileImage} alt="" />
                                  ) : (
                                    <span key={p.id} className="ph">{initials(p.fullName)}</span>
                                  )
                                )}
                              </div>
                            )}
                            <span>
                              {matches.length} {t('youth_matching_requests')}
                            </span>
                          </div>
                        </div>

                        {matches.length > 0 && (
                          <div className="brit-req-matchlinks">
                            {matches.slice(0, 3).map((p) => (
                              <Link key={p.id} href={`/players/youth/${p.id}?from=/requests`} className="brit-req-mlink">
                                {p.fullName || '—'}
                              </Link>
                            ))}
                            {matches.length > 3 && <span className="brit-req-more">+{matches.length - 3}</span>}
                          </div>
                        )}

                        <div className="brit-req-foot">
                          <span className="by">{r.contactName || (isRtl ? r.createdByAgentHebrew : r.createdByAgent) || '—'}</span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="brit-empty">{t('players_empty_filtered')}</div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
