'use client';

/**
 * Men platform Club Requirements — "Light Management Room" redesign (Board view).
 *
 * Self-contained full-bleed light layout (shared BritRail + .brit-room), men only.
 * Owns its Firestore subscriptions and reproduces the real matching / actions.
 * Women & youth keep the standard requests screen. Add/Edit reuse the existing
 * platform-aware AddRequestSheet; Delete uses callRequestsDelete; Share posts to
 * /api/shared-requests/create like the original.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEuCountries } from '@/hooks/useEuCountries';
import { getAllAccounts, getCurrentAccountForShortlist } from '@/lib/accounts';
import { callRequestsDelete } from '@/lib/callables';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import { getPositionDisplayName } from '@/lib/appConfig';
import { getCountryDisplayName } from '@/lib/countryTranslations';
import { matchRequestToPlayers, type RosterPlayer, type ClubRequest } from '@/lib/requestMatcher';
import { getScreenCache, setScreenCache } from '@/lib/screenCache';
import BritRail from '@/components/BritRail';
import AddRequestSheet from '@/app/requests/AddRequestSheet';
import MenAddRequestDrawer from '@/components/MenAddRequestDrawer';

interface Request {
  id: string;
  clubTmProfile?: string;
  clubName?: string;
  clubLogo?: string;
  clubCountry?: string;
  clubCountryFlag?: string;
  contactName?: string;
  contactPhoneNumber?: string;
  position?: string;
  notes?: string;
  minAge?: number;
  maxAge?: number;
  ageDoesntMatter?: boolean;
  salaryRange?: string;
  transferFee?: string;
  dominateFoot?: string;
  createdAt?: number;
  status?: string;
  euOnly?: boolean;
  createdByAgent?: string;
  createdByAgentHebrew?: string;
}

const normalizePosition = (pos: string | undefined): string => {
  const p = pos?.trim().toUpperCase();
  if (p === 'ST') return 'CF';
  return pos?.trim() || '';
};

const POS_ORDER = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LM', 'RM', 'LW', 'RW', 'CF', 'SS'];

const ageRange = (r: Request): string | null => {
  if (r.ageDoesntMatter !== false && !r.minAge && !r.maxAge) return null;
  if (r.minAge && r.maxAge) return `${r.minAge}–${r.maxAge}`;
  if (r.minAge) return `${r.minAge}+`;
  if (r.maxAge) return `≤${r.maxAge}`;
  return null;
};

const posClass = (pos?: string): string => {
  const p = normalizePosition(pos).toUpperCase();
  if (p === 'GK') return 'gk';
  if (['CB', 'LB', 'RB'].includes(p)) return 'def';
  if (['DM', 'CM', 'AM', 'LM', 'RM'].includes(p)) return 'mid';
  if (['LW', 'RW', 'CF', 'SS'].includes(p)) return 'fwd';
  return 'def';
};

const parseMarketValueToEuros = (value?: string): number => {
  if (!value?.trim()) return 0;
  const cleaned = value.replace(/[€,\s]/g, '').toLowerCase();
  const num = parseFloat(cleaned.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return 0;
  if (cleaned.includes('m')) return num * 1_000_000;
  if (cleaned.includes('k')) return num * 1_000;
  return num;
};

const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const normalizeClub = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,'\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const clubNamesMatch = (a: string, b: string) => a === b || a.includes(b) || b.includes(a);

interface RequestsFilterCache {
  search: string;
  positionFilter: string;
  countryFilter: string;
  view: 'board' | 'ledger';
}

export default function MenRequests() {
  const { user } = useAuth();
  const { t, lang, setLang, isRtl } = useLanguage();
  const isHebrew = lang === 'he';
  const euCountries = useEuCountries();

  const cacheKey = 'men-requests-filters';
  const cached = getScreenCache<RequestsFilterCache>(cacheKey);

  const [requests, setRequests] = useState<Request[]>([]);
  const [ready, setReady] = useState(false);
  const [players, setPlayers] = useState<RosterPlayer[]>([]);
  const [precomputed, setPrecomputed] = useState<Record<string, string[]>>({});
  const [mandateLeaguesByPlayer, setMandateLeaguesByPlayer] = useState<Record<string, string[]>>({});
  const [agentHebrewMap, setAgentHebrewMap] = useState<Record<string, string>>({});

  const [search, setSearch] = useState(cached?.search ?? '');
  const [positionFilter, setPositionFilter] = useState<string>(cached?.positionFilter ?? 'all');
  const [countryFilter, setCountryFilter] = useState<string>(cached?.countryFilter ?? 'all');

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [editingRequest, setEditingRequest] = useState<Request | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Request | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Share
  const [showShare, setShowShare] = useState(false);
  const [shareCreating, setShareCreating] = useState(false);
  const [shareRecipient, setShareRecipient] = useState('');

  // ── Subscriptions ──
  useEffect(() => {
    getAllAccounts().then((accounts) => {
      const map: Record<string, string> = {};
      for (const a of accounts) if (a.name && a.hebrewName) map[a.name] = a.hebrewName;
      setAgentHebrewMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ClubRequests'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Request));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRequests(list);
      setReady(true);
    }, () => setReady(true));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'Players'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RosterPlayer))));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'RequestMatchResults'), (snap) => {
      const results: Record<string, string[]> = {};
      for (const d of snap.docs) results[d.id] = (d.data().matchingPlayerIds as string[]) ?? [];
      setPrecomputed(results);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'PlayerDocuments'), where('type', '==', 'MANDATE'));
    const unsub = onSnapshot(q, (snap) => {
      const now = Date.now();
      const byPlayer: Record<string, string[]> = {};
      for (const d of snap.docs) {
        const data = d.data();
        const profile = data.playerTmProfile as string | undefined;
        if (!profile || data.expired === true) continue;
        const expiresAt = data.expiresAt as number | undefined;
        if (!expiresAt || expiresAt < now) continue;
        (byPlayer[profile] ??= []).push(...((data.validLeagues as string[] | undefined) ?? []));
      }
      for (const k of Object.keys(byPlayer)) byPlayer[k] = Array.from(new Set(byPlayer[k]));
      setMandateLeaguesByPlayer(byPlayer);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    setScreenCache<RequestsFilterCache>(cacheKey, { search, positionFilter, countryFilter, view: 'board' });
  }, [search, positionFilter, countryFilter]);

  const pending = useMemo(() => requests.filter((r) => (r.status || 'pending') === 'pending'), [requests]);

  // Roster matches per request (local + precomputed, merged, sorted by value)
  const matchesByRequest = useMemo(() => {
    const playerById: Record<string, RosterPlayer> = {};
    for (const p of players) if (p.id) playerById[p.id] = p;
    const byId: Record<string, RosterPlayer[]> = {};
    for (const r of pending) {
      const ids = precomputed[r.id] ?? [];
      const local = matchRequestToPlayers(r as ClubRequest, players, euCountries);
      const merged = new Map<string, RosterPlayer>();
      for (const p of local) if (p.id) merged.set(p.id, p);
      for (const id of ids) { const p = playerById[id]; if (p?.id) merged.set(p.id, p); }
      byId[r.id] = Array.from(merged.values()).sort((a, b) => parseMarketValueToEuros(b.marketValue) - parseMarketValueToEuros(a.marketValue));
    }
    return byId;
  }, [pending, players, precomputed, euCountries]);

  // Mandate player count per request
  const mandateCountByRequest = useMemo(() => {
    const byId: Record<string, number> = {};
    if (Object.keys(mandateLeaguesByPlayer).length === 0) return byId;
    const withMandate = players.filter((p) => (p.tmProfile || p.id) && mandateLeaguesByPlayer[p.tmProfile || p.id!]);
    if (withMandate.length === 0) return byId;
    for (const r of pending) {
      if (!r.position) continue;
      const clubNorm = r.clubName ? normalizeClub(r.clubName) : undefined;
      const countryNorm = r.clubCountry ? normalizeClub(r.clubCountry) : undefined;
      const reqPos = normalizePosition(r.position).toUpperCase();
      const n = withMandate.filter((p) => {
        const positions = (p.positions ?? []).filter(Boolean).map((pos) => normalizePosition(pos as string).toUpperCase());
        if (!positions.includes(reqPos)) return false;
        const leagues = (mandateLeaguesByPlayer[p.tmProfile || p.id!] ?? []).map(normalizeClub);
        if (leagues.some((l) => l === 'worldwide')) return true;
        if (countryNorm && leagues.some((l) => l === countryNorm)) return true;
        if (clubNorm) for (const l of leagues) { const part = l.includes(' - ') ? l.split(' - ')[0]! : l; if (clubNamesMatch(clubNorm, part)) return true; }
        return false;
      }).length;
      if (n > 0) byId[r.id] = n;
    }
    return byId;
  }, [pending, players, mandateLeaguesByPlayer]);

  const activePositions = useMemo(() => {
    const set = new Set(pending.map((r) => normalizePosition(r.position) || 'Other'));
    return POS_ORDER.filter((p) => set.has(p)).concat(set.has('Other') ? ['Other'] : []);
  }, [pending]);

  const activeCountries = useMemo(() => {
    const set = new Set<string>();
    for (const r of pending) { const c = r.clubCountry?.trim(); if (c) set.add(c); }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [pending]);

  const filtered = useMemo(() => {
    let list = pending;
    if (positionFilter !== 'all') list = list.filter((r) => (normalizePosition(r.position) || 'Other') === positionFilter);
    if (countryFilter !== 'all') list = list.filter((r) => (r.clubCountry?.trim() || '') === countryFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) =>
      (r.clubName || '').toLowerCase().includes(q) ||
      (r.clubCountry || '').toLowerCase().includes(q) ||
      (r.contactName || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q) ||
      (r.position || '').toLowerCase().includes(q) ||
      (r.createdByAgent || '').toLowerCase().includes(q)
    );
    return list;
  }, [pending, positionFilter, countryFilter, search]);

  const countriesCount = useMemo(() => new Set(pending.map((r) => r.clubCountry?.trim()).filter(Boolean)).size, [pending]);
  const newToday = useMemo(() => { const cut = Date.now() - 86400000; return pending.filter((r) => r.createdAt && r.createdAt > cut).length; }, [pending]);

  const dateStr = new Date().toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date().toLocaleTimeString(isRtl ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  const agentName = (r: Request) =>
    isHebrew ? (r.createdByAgentHebrew || (r.createdByAgent && agentHebrewMap[r.createdByAgent]) || r.createdByAgent || '—') : (r.createdByAgent || '—');

  const feeLabel = (fee?: string) => {
    if (!fee || fee === 'N/A') return null;
    if (fee.toLowerCase() === 'free/free loan') return isRtl ? 'חינם' : 'Free';
    if (fee === '1m+') return '€1M+';
    return `€${fee}K`;
  };

  const handleDelete = async (r: Request) => {
    setDeleting(true);
    try {
      const an = user ? (await getCurrentAccountForShortlist(user)).name ?? undefined : undefined;
      await callRequestsDelete({ platform: 'men', requestId: r.id, agentName: an });
      setDeleteConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const createShareLink = async (showClubs: boolean) => {
    if (!user) return;
    setShareCreating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/shared-requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform: 'men', showClubs, recipientLabel: shareRecipient.trim() || undefined, allowedCountries: [] }),
      });
      if (!res.ok) throw new Error('Failed');
      const { token: shareToken } = await res.json();
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '')) || (typeof window !== 'undefined' ? window.location.origin : '');
      const shareUrl = `${baseUrl}/shared/requests/${shareToken}`;
      setShowShare(false);
      window.open(`https://wa.me/?text=${encodeURIComponent(`View full recruitment brief:\n\n${shareUrl}`)}`, '_blank');
    } catch (e) {
      console.error('Share create failed:', e);
    } finally {
      setShareCreating(false);
    }
  };

  return (
    <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail
          active="requests"
          footer={
            <div className="brit-rail-footer">
              {t('room_footer_platform_label')}
              <strong>{t('room_footer_platform_value')}</strong>
              {t('requests_room_open')}
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
              <button onClick={() => setLang(lang === 'en' ? 'he' : 'en')}>{lang === 'en' ? 'HE / EN' : 'EN / HE'}</button>
              <span>TLV {timeStr}</span>
            </div>
          </header>

          <main className="brit-canvas">
            <header className="brit-masthead">
              <div>
                <p className="brit-kicker">{t('requests_room_kicker')}</p>
                <h1>{t('requests_room_head_a')} <span>{t('requests_room_head_b')}</span></h1>
              </div>
              <div className="brit-req-mast-actions">
                {pending.length > 0 && (
                  <button onClick={() => { setShareRecipient(''); setShowShare(true); }}>↗ {t('requests_share')}</button>
                )}
                <button className="primary" onClick={() => setShowAddDrawer(true)}>+ {t('requests_add')}</button>
              </div>
            </header>

            {/* Signals */}
            <section className="brit-signals">
              <div className="brit-signal">
                <label>{t('requests_room_open')}</label>
                <strong>{String(pending.length).padStart(2, '0')}</strong>
                <small>{t('requests_room_open_note').replace('{n}', String(newToday))}</small>
              </div>
              <div className="brit-signal">
                <label>{t('requests_stat_positions')}</label>
                <strong>{String(activePositions.length).padStart(2, '0')}</strong>
                <small>{t('requests_room_positions_note')}</small>
              </div>
              <div className="brit-signal">
                <label>{t('requests_stat_countries')}</label>
                <strong>{String(countriesCount).padStart(2, '0')}</strong>
                <small>{t('requests_room_countries_note')}</small>
              </div>
            </section>

            {/* Filter tray */}
            <section className="brit-tray">
              <label className="brit-search">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('requests_search_placeholder')} />
              </label>
              <div className="brit-req-filterrow">
                <span className="brit-req-flabel">{t('room_th_position')}</span>
                <div className="brit-req-chipset">
                  <button className={positionFilter === 'all' ? 'on' : ''} onClick={() => setPositionFilter('all')}>{t('releases_all')}</button>
                  {activePositions.map((p) => (
                    <button key={p} className={positionFilter === p ? 'on' : ''} onClick={() => setPositionFilter(positionFilter === p ? 'all' : p)}>
                      {getPositionDisplayName(p, isHebrew) || p}
                    </button>
                  ))}
                </div>
              </div>
              {activeCountries.length > 1 && (
                <div className="brit-req-filterrow">
                  <span className="brit-req-flabel">{t('requests_filter_country')}</span>
                  <div className="brit-req-chipset">
                    <button className={countryFilter === 'all' ? 'on' : ''} onClick={() => setCountryFilter('all')}>{t('releases_all')}</button>
                    {activeCountries.map((c) => (
                      <button key={c} className={countryFilter === c ? 'on' : ''} onClick={() => setCountryFilter(countryFilter === c ? 'all' : c)}>
                        {getCountryDisplayName(c, isHebrew)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <p className="brit-result-count">
              {t('requests_room_showing').replace('{n}', String(filtered.length)).replace('{total}', String(pending.length))}
            </p>

            {/* Board */}
            {!ready ? (
              <div className="brit-req-board">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div className="brit-skel-card" key={i}>
                    <div className="top brit-skel" />
                    <div className="body">
                      <div className="brit-skel l1" /><div className="brit-skel l2" /><div className="brit-skel l3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length > 0 ? (
              <div className="brit-req-board">
                {filtered.map((r) => {
                  const matches = matchesByRequest[r.id] ?? [];
                  const mandateN = mandateCountByRequest[r.id] ?? 0;
                  const age = ageRange(r);
                  const fee = feeLabel(r.transferFee);
                  const isNew = r.createdAt && Date.now() - r.createdAt < 86400000;
                  return (
                    <article className="brit-req-card" key={r.id}>
                      <div className="brit-req-hero">
                        {r.clubLogo && r.clubLogo.startsWith('http') ? (
                          <img className="brit-req-hero-bg" src={r.clubLogo} alt="" />
                        ) : (
                          <div className="brit-req-hero-bg brit-req-hero-ph" />
                        )}
                        <span className={`brit-req-pos ${posClass(r.position)}`}>{getPositionDisplayName(r.position, isHebrew) || r.position || '—'}</span>
                        <span className="brit-req-flags">
                          {r.euOnly && <b>🇪🇺 EU</b>}
                          {isNew && <b>{isRtl ? 'חדש' : 'New'}</b>}
                        </span>
                        <div className="brit-req-clubline">
                          {r.clubLogo && r.clubLogo.startsWith('http') ? (
                            <img className="logo" src={r.clubLogo} alt="" />
                          ) : (
                            <div className="logo brit-req-logo-ph">{(r.clubName || '?').slice(0, 2).toUpperCase()}</div>
                          )}
                          <div>
                            <div className="cn">
                              {r.clubTmProfile ? (
                                <a href={r.clubTmProfile} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{r.clubName || '—'}</a>
                              ) : (r.clubName || '—')}
                            </div>
                            <div className="cc">
                              {getCountryDisplayName(r.clubCountry || '', isHebrew)}
                              {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString(isHebrew ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' })}` : ''}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="brit-req-body">
                        <div className="brit-req-spec">
                          <div><label>{t('requests_label_salary')}</label><b className="money">{r.salaryRange && r.salaryRange !== 'N/A' ? `€${r.salaryRange}${isHebrew ? '' : 'K'}` : '—'}</b></div>
                          <div><label>{t('requests_label_fee')}</label><b>{fee || '—'}</b></div>
                          <div><label>{t('player_info_age')}</label><b>{age || '—'}</b></div>
                        </div>

                        {r.notes && <p className="brit-req-note" dir={isHebrew ? 'rtl' : 'ltr'}>{r.notes}</p>}

                        <div className="brit-req-matchstrip">
                          <div className="mleft">
                            {matches.length > 0 && (
                              <div className="brit-req-avatars">
                                {matches.slice(0, 4).map((p) => (
                                  p.profileImage
                                    ? <img key={p.id} src={p.profileImage} alt="" title={p.fullName} />
                                    : <span key={p.id} className="ph" title={p.fullName}>{initials(p.fullName)}</span>
                                ))}
                              </div>
                            )}
                            <span className="mcount">
                              {matches.length > 0
                                ? <><b>{matches.length}</b> {t('requests_room_matches')}</>
                                : <><b className="none">0</b> {t('requests_room_no_match')}</>}
                            </span>
                          </div>
                          {mandateN > 0 && <span className="brit-req-mand">✍ {mandateN} {isRtl ? 'מנדט' : 'Mandate'}</span>}
                        </div>

                        {/* Matched player quick links */}
                        {matches.length > 0 && (
                          <div className="brit-req-matchlinks">
                            {matches.slice(0, 3).map((p) => (
                              <Link key={p.id} href={`/players/${p.id}?from=/requests`} className="brit-req-mlink">
                                {p.fullName || '—'}
                              </Link>
                            ))}
                            {matches.length > 3 && <span className="brit-req-more">+{matches.length - 3}</span>}
                          </div>
                        )}

                        <div className="brit-req-foot">
                          <span className="by">
                            {r.contactName ? (
                              <span className="contact">
                                {r.contactName}
                                {r.contactPhoneNumber && (
                                  <a href={toWhatsAppUrl(r.contactPhoneNumber) ?? `tel:${r.contactPhoneNumber}`} target="_blank" rel="noopener noreferrer" className="wa" title="WhatsApp">✆</a>
                                )}
                              </span>
                            ) : (
                              <span className="contact muted">{isRtl ? 'קשר ישיר' : 'Direct'}</span>
                            )}
                            <br />
                            {isRtl ? 'נפתח ע"י' : 'Opened by'} <b>{agentName(r)}</b>
                          </span>
                          <span className="ops">
                            <button title={t('requests_edit')} onClick={() => { setEditingRequest(r); setShowAddSheet(true); }}>✎</button>
                            <button className="del" title={t('requests_delete')} onClick={() => setDeleteConfirm(r)}>🗑</button>
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="brit-empty">{pending.length === 0 ? t('requests_empty') : t('requests_no_results_filtered')}</div>
            )}
          </main>
        </div>
      </div>

      {/* Add: guided drawer (bulk). Edit: existing platform-aware wizard. */}
      <MenAddRequestDrawer open={showAddDrawer} onClose={() => setShowAddDrawer(false)} />
      <AddRequestSheet
        open={showAddSheet}
        onClose={() => { setShowAddSheet(false); setEditingRequest(null); }}
        onSaved={() => setEditingRequest(null)}
        isWomen={false}
        isYouth={false}
        editRequest={editingRequest}
      />

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="brit-sl-modal-scrim" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="brit-sl-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="brit-sl-modal-head">
              <h3>{t('requests_delete')}</h3>
              <button onClick={() => setDeleteConfirm(null)}>×</button>
            </div>
            <p style={{ margin: '0 0 18px', font: '12px/1.5 var(--p-body)' }}>
              {t('requests_delete_confirm').replace('{club}', deleteConfirm.clubName || '').replace('{position}', deleteConfirm.position || '')}
            </p>
            <div className="brit-sl-modal-actions">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting}>{t('tasks_cancel')}</button>
              <button className="primary" style={{ background: 'var(--red)', borderColor: 'var(--red)', color: 'var(--paper)' }} onClick={() => handleDelete(deleteConfirm)} disabled={deleting}>
                {deleting ? '…' : t('requests_delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share dialog (compact) */}
      {showShare && (
        <div className="brit-sl-modal-scrim" onClick={() => !shareCreating && setShowShare(false)}>
          <div className="brit-sl-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()} dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="brit-sl-modal-head">
              <h3>{isRtl ? 'שתף בקשות' : 'Share Requests'}</h3>
              <button onClick={() => setShowShare(false)}>×</button>
            </div>
            <p style={{ margin: '0 0 14px', color: 'var(--muted)', font: '10px/1.5 var(--p-mono)', textTransform: 'uppercase' }}>
              {isRtl ? 'כל שיתוף יוצר קישור ייחודי.' : 'Each share creates a unique link.'}
            </p>
            <input
              className="brit-sl-textarea"
              style={{ marginBottom: 14 }}
              placeholder={isRtl ? 'שם הנמען (אופציונלי)' : 'Recipient name (optional)'}
              value={shareRecipient}
              onChange={(e) => setShareRecipient(e.target.value)}
              dir={isRtl ? 'rtl' : 'ltr'}
            />
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="brit-req-sharebtn" disabled={shareCreating} onClick={() => createShareLink(true)}>
                {shareCreating ? (isRtl ? 'יוצר...' : 'Creating...') : (isRtl ? 'שתף עם שמות מועדונים' : 'Share with club names')}
              </button>
              <button className="brit-req-sharebtn ghost" disabled={shareCreating} onClick={() => createShareLink(false)}>
                {shareCreating ? (isRtl ? 'יוצר...' : 'Creating...') : (isRtl ? 'שתף עם הסתרת מועדונים' : 'Share with hidden clubs')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
