'use client';

/**
 * Youth platform "Add prospect to academy" — guided drawer.
 *
 * Editorial Light Management Room (teal) drawer that mirrors MenAddPlayerDrawer
 * but is youth-scoped and adds a dedicated "Agent in charge" step: the person
 * registering the prospect is not necessarily the agent who will manage them.
 *
 * 4-step guided accordion:
 *   1. Find        — paste an IFA (football.org.il) URL or search by name
 *   2. Confirm     — review IFA data (age group, club, season form) + player & guardian contacts
 *   3. Agent       — choose the agent in charge from the agents list (defaults to current user)
 *   4. Done        — registered, with next-step links
 *
 * Reuses the real data layer: /api/youth-players/search, /api/youth-players/fetch-profile,
 * checkYouthPlayerExists, callPlayersCreate (platform: 'youth'). Styling reuses the
 * shared brit-add-* classes which the body[data-platform='youth'] override retints teal.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { checkYouthPlayerExists, computeAgeGroup } from '@/lib/playersYouth';
import { callPlayersCreate } from '@/lib/callables';
import { getAllAccounts, getCurrentAccountForShortlist, type AccountForShortlist } from '@/lib/accounts';

const DEBOUNCE_MS = 400;
const MIN_SEARCH_LEN = 2;

type Step = 1 | 2 | 3 | 4;

interface YouthSearchResult {
  fullName: string;
  fullNameHe?: string;
  currentClub?: string;
  age?: string;
  dateOfBirth?: string;
  nationality?: string;
  position?: string;
  profileImage?: string;
  ifaUrl?: string;
  ifaPlayerId?: string;
  source: string;
}

interface YouthProfile {
  fullName?: string;
  fullNameHe?: string;
  currentClub?: string;
  academy?: string;
  dateOfBirth?: string;
  ageGroup?: string;
  nationality?: string;
  profileImage?: string;
  ifaUrl?: string;
  ifaPlayerId?: string;
  positions?: string[];
  ifaStats?: { season?: string; matches?: number; goals?: number; assists?: number };
}

export interface YouthAddProspectDrawerProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (playerId?: string) => void;
}

const initials = (name: string | undefined) =>
  (name || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function YouthAddProspectDrawer({ open, onClose, onSaved }: YouthAddProspectDrawerProps) {
  const { user } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);

  // Find
  const [urlInput, setUrlInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouthSearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const searchReqRef = useRef<string | null>(null);

  // Selected prospect
  const [profile, setProfile] = useState<YouthProfile | null>(null);
  const [playerPhone, setPlayerPhone] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentRelationship, setParentRelationship] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');

  // Agent in charge
  const [accounts, setAccounts] = useState<AccountForShortlist[]>([]);
  const [currentAccount, setCurrentAccount] = useState<AccountForShortlist | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentQuery, setAgentQuery] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');

  const resetAll = useCallback(() => {
    setStep(1);
    setUrlInput('');
    setSearchQuery('');
    setSearchResults([]);
    setLoadingProfile(false);
    setProfile(null);
    setPlayerPhone('');
    setPlayerEmail('');
    setParentName('');
    setParentRelationship('');
    setParentPhone('');
    setParentEmail('');
    setAgentId(currentAccount?.id ?? null);
    setAgentQuery('');
    setSaving(false);
    setSavedId(undefined);
    setError('');
  }, [currentAccount]);

  // Load agents + current account when the drawer opens.
  useEffect(() => {
    if (!open) return;
    getAllAccounts().then(setAccounts).catch(() => setAccounts([]));
    if (user) {
      getCurrentAccountForShortlist(user)
        .then((acc) => {
          setCurrentAccount(acc);
          setAgentId((prev) => prev ?? acc.id);
        })
        .catch(() => { /* ignore */ });
    }
  }, [open, user]);

  useEffect(() => {
    if (open) resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounced IFA name search.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < MIN_SEARCH_LEN) {
      searchReqRef.current = null;
      setSearchResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      searchReqRef.current = q;
      setLoadingSearch(true);
      try {
        const res = await fetch(`/api/youth-players/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { results?: YouthSearchResult[] };
        if (searchReqRef.current === q) setSearchResults(data.results ?? []);
      } catch {
        if (searchReqRef.current === q) setSearchResults([]);
      } finally {
        if (searchReqRef.current === q) setLoadingSearch(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const applyProfile = (data: Record<string, unknown>, url?: string): YouthProfile => {
    const dob = data.dateOfBirth ? String(data.dateOfBirth) : undefined;
    const positions = Array.isArray(data.positions)
      ? (data.positions as unknown[]).filter((p): p is string => typeof p === 'string')
      : undefined;
    const stats = (data.ifaStats && typeof data.ifaStats === 'object') ? data.ifaStats as YouthProfile['ifaStats'] : undefined;
    return {
      fullName: String(data.fullName ?? data.fullNameHe ?? ''),
      fullNameHe: data.fullNameHe ? String(data.fullNameHe) : undefined,
      currentClub: data.currentClub ? String(data.currentClub) : undefined,
      academy: data.academy ? String(data.academy) : undefined,
      dateOfBirth: dob,
      ageGroup: dob ? (computeAgeGroup(dob) ?? undefined) : (data.ageGroup ? String(data.ageGroup) : undefined),
      nationality: data.nationality ? String(data.nationality) : undefined,
      profileImage: data.profileImage ? String(data.profileImage) : undefined,
      ifaUrl: String(data.ifaUrl ?? url ?? ''),
      ifaPlayerId: data.ifaPlayerId ? String(data.ifaPlayerId) : (url?.match(/player_id=(\d+)/)?.[1]),
      positions,
      ifaStats: stats,
    };
  };

  const loadProfile = useCallback(async (url: string, fallback?: YouthSearchResult) => {
    setError('');
    setLoadingProfile(true);
    setStep(2);
    try {
      const res = await fetch('/api/youth-players/fetch-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || 'Failed to load profile');
      }
      const data = (await res.json()) as Record<string, unknown>;
      setProfile(applyProfile(data, url));
    } catch (err) {
      // Fall back to the search-result data so the user can still proceed.
      if (fallback) {
        setProfile({
          fullName: fallback.fullName || fallback.fullNameHe || '',
          fullNameHe: fallback.fullNameHe,
          currentClub: fallback.currentClub,
          dateOfBirth: fallback.dateOfBirth,
          ageGroup: fallback.dateOfBirth ? (computeAgeGroup(fallback.dateOfBirth) ?? undefined) : undefined,
          nationality: fallback.nationality,
          profileImage: fallback.profileImage,
          ifaUrl: fallback.ifaUrl ?? url,
          ifaPlayerId: fallback.ifaPlayerId,
          positions: fallback.position ? [fallback.position] : undefined,
        });
        setError(err instanceof Error ? err.message : 'Failed to load full profile');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load player');
        setProfile(null);
        setStep(1);
      }
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const handleLoadByUrl = () => {
    const url = urlInput.trim();
    if (!url || !url.includes('football.org.il')) return;
    loadProfile(url);
  };

  const handleSelectResult = (r: YouthSearchResult) => {
    setSearchResults([]);
    setSearchQuery('');
    if (r.ifaUrl) {
      loadProfile(r.ifaUrl, r);
    } else {
      setProfile({
        fullName: r.fullName || r.fullNameHe || '',
        fullNameHe: r.fullNameHe,
        currentClub: r.currentClub,
        dateOfBirth: r.dateOfBirth,
        ageGroup: r.dateOfBirth ? (computeAgeGroup(r.dateOfBirth) ?? undefined) : undefined,
        nationality: r.nationality,
        profileImage: r.profileImage,
        positions: r.position ? [r.position] : undefined,
      });
      setStep(2);
    }
  };

  const handleSave = async () => {
    if (!profile || !user) return;
    setError('');
    setSaving(true);
    try {
      if (profile.ifaUrl?.trim()) {
        const exists = await checkYouthPlayerExists(profile.ifaUrl.trim());
        if (exists) {
          setError(t('youth_add_room_dupe'));
          setSaving(false);
          setStep(2);
          return;
        }
      }

      const chosen = accounts.find((a) => a.id === agentId) || currentAccount;
      const agentInChargeId = chosen?.id || user.uid;
      const agentInChargeName = chosen?.name || currentAccount?.name || user.displayName || user.email || '';

      const computedAgeGroup = profile.ageGroup || (profile.dateOfBirth ? computeAgeGroup(profile.dateOfBirth) : '');

      const result = await callPlayersCreate({
        platform: 'youth',
        fullName: (profile.fullName || '').trim(),
        fullNameHe: profile.fullNameHe?.trim() || undefined,
        positions: profile.positions && profile.positions.length > 0 ? profile.positions : undefined,
        currentClub: profile.currentClub?.trim() ? { clubName: profile.currentClub.trim() } : undefined,
        academy: profile.academy?.trim() || undefined,
        dateOfBirth: profile.dateOfBirth?.trim() || undefined,
        ageGroup: computedAgeGroup || undefined,
        nationality: profile.nationality?.trim() || undefined,
        profileImage: profile.profileImage?.trim() || undefined,
        ifaUrl: profile.ifaUrl?.trim() || undefined,
        ifaPlayerId: profile.ifaPlayerId?.trim() || undefined,
        ifaStats: profile.ifaStats || undefined,
        playerPhoneNumber: playerPhone.trim() || undefined,
        playerEmail: playerEmail.trim() || undefined,
        parentContact: (parentName.trim() || parentPhone.trim() || parentRelationship.trim() || parentEmail.trim())
          ? {
              ...(parentName.trim() && { parentName: parentName.trim() }),
              ...(parentRelationship.trim() && { parentRelationship: parentRelationship.trim() }),
              ...(parentPhone.trim() && { parentPhoneNumber: parentPhone.trim() }),
              ...(parentEmail.trim() && { parentEmail: parentEmail.trim() }),
            }
          : undefined,
        agentInChargeId,
        agentInChargeName,
      } as Parameters<typeof callPlayersCreate>[0]);

      if (result.status === 'already_exists') {
        setError(t('youth_add_room_dupe'));
        setSaving(false);
        setStep(2);
        return;
      }
      setSavedId(result.id);
      setStep(4);
      onSaved?.(result.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(
        msg.toLowerCase().includes('permission') || msg.includes('PERMISSION_DENIED')
          ? (isRtl ? 'חסרות הרשאות.' : 'Missing or insufficient permissions.')
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Step helpers ──
  const goStep = (s: Step) => {
    if (s === 1) setStep(1);
    else if (s === 2 && profile) setStep(2);
    else if (s === 3 && profile) setStep(3);
  };
  const stepClass = (s: Step) => (step === s ? 'open' : step > s ? 'done' : 'locked');

  const displayName = profile?.fullName || (isRtl ? 'לא ידוע' : 'Unknown');
  const agentName = (a: AccountForShortlist) => (isRtl ? (a.hebrewName || a.name) : (a.name || a.hebrewName)) || '—';
  const chosenAgent = accounts.find((a) => a.id === agentId) || currentAccount;

  const filteredAgents = agentQuery.trim()
    ? accounts.filter((a) => `${a.name ?? ''} ${a.hebrewName ?? ''}`.toLowerCase().includes(agentQuery.trim().toLowerCase()))
    : accounts;

  const s1Summary = profile
    ? `${displayName}${profile.currentClub ? ` · ${profile.currentClub}` : ''}`
    : t('youth_add_room_find_sum');
  const s2Summary = step > 2
    ? `${displayName}${profile?.ageGroup ? ` · ${profile.ageGroup}` : ''}`
    : t('youth_add_room_confirm_sum');
  const s3Summary = savedId
    ? `${displayName} · ${isRtl ? 'נשמר' : 'saved'}`
    : chosenAgent
      ? agentName(chosenAgent)
      : t('youth_add_room_agent_sum');

  const stats = profile?.ifaStats;
  const hasForm = !!stats && ((stats.matches ?? 0) + (stats.goals ?? 0) + (stats.assists ?? 0) > 0);

  return (
    <>
      <div className={`brit-scrim${open ? ' open' : ''}`} onClick={onClose} aria-hidden={!open} />
      <aside className={`brit-drawer brit-add-drawer${open ? ' open' : ''}`} dir={isRtl ? 'rtl' : 'ltr'} aria-label={t('youth_add_room_title')}>
        <div className="brit-add-head">
          <button className="close" onClick={onClose} aria-label={t('room_close')}>×</button>
          <div className="eyebrow">{t('youth_add_room_eyebrow')}</div>
          <h2>{t('youth_add_room_title')}</h2>
          <div className="brit-add-prog">
            <i className={step >= 1 ? 'on' : ''} />
            <i className={step >= 2 ? 'on' : ''} />
            <i className={step >= 3 ? 'on' : ''} />
            <i className={step >= 4 ? 'on' : ''} />
          </div>
        </div>

        <div className="brit-add-body">
          {/* STEP 1 — FIND */}
          <div className={`brit-add-step ${stepClass(1)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(1)} type="button">
              <span className="n">{step > 1 ? '' : '1'}</span>
              <div className="t"><b>{t('youth_add_room_find_title')}</b><small>{s1Summary}</small></div>
              {step > 1 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody">
              <div className="brit-add-stepinner">
                <p className="brit-add-seclabel">{t('youth_add_paste_url')}</p>
                <div className="brit-add-urlrow">
                  <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="football.org.il/players/player/?player_id=" />
                  <button className="brit-add-minibtn" onClick={handleLoadByUrl} disabled={loadingProfile || !urlInput.trim().includes('football.org.il')} type="button">
                    {loadingProfile ? t('youth_add_loading') : t('youth_add_load')}
                  </button>
                </div>

                <div className="brit-add-divider"><span className="ln" /><span>{t('common_or')}</span><span className="ln" /></div>

                <p className="brit-add-seclabel">{t('youth_add_room_search_label')}</p>
                <label className={`brit-add-search${searchFocused ? ' focus' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder={t('youth_add_search_placeholder')}
                  />
                  {loadingSearch && <span className="sp" />}
                </label>
                <p className="brit-add-hint">{t('youth_add_room_src_hint')}</p>

                {searchResults.length > 0 && (
                  <div className="brit-add-results">
                    {searchResults.map((r, i) => (
                      <button key={`${r.fullName}-${i}`} className="brit-add-result" onClick={() => handleSelectResult(r)} disabled={loadingProfile} type="button">
                        {r.profileImage
                          ? <img src={r.profileImage} alt="" />
                          : <div className="brit-add-result-ph">{initials(r.fullName)}</div>}
                        <div className="ri">
                          <b>{r.fullName || 'Unknown'}</b>
                          {r.fullNameHe && <span className="he" dir="rtl">{r.fullNameHe}</span>}
                          <span>{[r.currentClub, r.dateOfBirth, r.nationality].filter(Boolean).join(' · ') || '—'}</span>
                        </div>
                        <span className="src">IFA</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.trim().length >= MIN_SEARCH_LEN && !loadingSearch && searchResults.length === 0 && (
                  <div className="brit-add-results"><div className="brit-add-empty">{t('youth_add_no_results')}</div></div>
                )}
              </div>
            </div>
          </div>

          {/* STEP 2 — CONFIRM & CONTACTS */}
          <div className={`brit-add-step ${stepClass(2)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(2)} type="button">
              <span className="n">{step > 2 ? '' : '2'}</span>
              <div className="t"><b>{t('youth_add_room_confirm_title')}</b><small>{s2Summary}</small></div>
              {step > 2 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody">
              <div className="brit-add-stepinner">
                {loadingProfile ? (
                  <div className="brit-add-loading"><div className="sp" /><p>{t('youth_add_loading_profile')}</p></div>
                ) : profile ? (
                  <>
                    <div className="brit-add-phero">
                      {profile.profileImage
                        ? <img className="flagbg" src={profile.profileImage} alt="" aria-hidden="true" style={{ objectPosition: 'center 20%' }} />
                        : null}
                      <div className="pimg">{profile.profileImage ? <img src={profile.profileImage} alt="" /> : initials(displayName)}</div>
                      <div className="pi">
                        <div className="nm" title={displayName}>{displayName}</div>
                        <div className="sub">{(profile.positions?.filter(Boolean).join(' · ') || '')}{profile.currentClub ? ` · ${profile.currentClub}` : ''}</div>
                        {(profile.ageGroup || profile.fullNameHe) && (
                          <div className="mv">{[profile.ageGroup, profile.fullNameHe].filter(Boolean).join(' · ')}</div>
                        )}
                      </div>
                    </div>
                    <div className="brit-add-attrs">
                      <div><label>{t('youth_add_dob')}</label><b>{profile.dateOfBirth || '—'}</b></div>
                      <div><label>{t('youth_add_age_group')}</label><b>{profile.ageGroup || '—'}</b></div>
                      <div><label>{t('youth_add_club')}</label><b>{profile.currentClub || '—'}</b></div>
                      <div><label>{t('youth_add_nationality')}</label><b>{profile.nationality || '—'}</b></div>
                    </div>

                    {hasForm && (
                      <div className="brit-add-attrs" style={{ borderTop: 0 }}>
                        <div><label>{t('youth_ifa_apps')}</label><b>{stats?.matches ?? 0}</b></div>
                        <div><label>{t('youth_ifa_goals')}</label><b>{stats?.goals ?? 0}</b></div>
                        <div><label>{t('youth_ifa_assists')}</label><b>{stats?.assists ?? 0}</b></div>
                        <div><label>{t('youth_season_form')}</label><b>{stats?.season || 'IFA'}</b></div>
                      </div>
                    )}

                    <div className="brit-add-sub">{t('youth_add_player_section')}</div>
                    <div className="brit-add-field"><label>{t('youth_add_phone')}</label><input type="tel" value={playerPhone} onChange={(e) => setPlayerPhone(e.target.value)} placeholder="+972 54 123 4567" /></div>
                    <div className="brit-add-field"><label>{t('youth_add_email')}</label><input type="email" value={playerEmail} onChange={(e) => setPlayerEmail(e.target.value)} placeholder="player@example.com" /></div>

                    <div className="brit-add-sub g">{t('youth_add_parent')}</div>
                    <div className="brit-add-field"><label>{t('youth_add_parent_name')}</label><input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder={t('youth_add_parent_name')} /></div>
                    <div className="brit-add-field">
                      <label>{t('youth_add_relationship')}</label>
                      <select value={parentRelationship} onChange={(e) => setParentRelationship(e.target.value)} className="brit-add-select">
                        <option value="">{t('youth_add_select')}</option>
                        <option value="Father">{t('youth_add_relationship_father')}</option>
                        <option value="Mother">{t('youth_add_relationship_mother')}</option>
                        <option value="Guardian">{t('youth_add_relationship_guardian')}</option>
                      </select>
                    </div>
                    <div className="brit-add-field"><label>{t('youth_add_parent_phone')}</label><input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="+972 52 987 6543" /></div>
                    <div className="brit-add-field"><label>{t('youth_add_parent_email')}</label><input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="guardian@example.com" /></div>

                    {error && <div className="brit-add-steperr">{error}</div>}

                    <div className="brit-add-stepcta">
                      <button className="btn ghost" onClick={() => goStep(1)} type="button">{t('add_player_room_change')}</button>
                      <button className="btn" onClick={() => setStep(3)} disabled={!profile.fullName?.trim()} type="button">{t('youth_add_room_next_agent')}</button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* STEP 3 — AGENT IN CHARGE */}
          <div className={`brit-add-step ${stepClass(3)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(3)} type="button">
              <span className="n">{step > 3 ? '' : '3'}</span>
              <div className="t"><b>{t('youth_add_room_agent_title')}</b><small>{s3Summary}</small></div>
              {step > 3 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody">
              <div className="brit-add-stepinner">
                <p className="brit-add-hint" style={{ marginTop: 0 }}>{t('youth_add_room_agent_hint')}</p>

                <label className={`brit-add-search${searchFocused ? '' : ''}`} style={{ marginBottom: 10 }}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                  <input value={agentQuery} onChange={(e) => setAgentQuery(e.target.value)} placeholder={t('youth_add_room_agent_search')} />
                </label>

                <div className="brit-agent-list">
                  {filteredAgents.map((a) => {
                    const isMe = currentAccount?.id === a.id;
                    const on = agentId === a.id;
                    return (
                      <button key={a.id} type="button" className={`brit-agent-opt${on ? ' on' : ''}`} onClick={() => setAgentId(a.id)}>
                        <span className="ava">{initials(agentName(a))}</span>
                        <span className="nm">{agentName(a)}{isMe && <em>{t('youth_add_room_agent_you')}</em>}</span>
                        <span className="rc">{on && '✓'}</span>
                      </button>
                    );
                  })}
                  {filteredAgents.length === 0 && <div className="brit-add-empty">{t('youth_add_no_results')}</div>}
                </div>

                {error && <div className="brit-add-steperr">{error}</div>}

                <div className="brit-add-stepcta">
                  <button className="btn ghost" onClick={() => goStep(2)} type="button">{t('add_player_room_change')}</button>
                  <button className="btn" onClick={handleSave} disabled={saving || !agentId} type="button">
                    {saving ? t('youth_add_saving') : t('youth_add_room_add_to_academy')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 4 — DONE */}
          <div className={`brit-add-step ${stepClass(4)}`}>
            <button className="brit-add-stephead" type="button" style={{ cursor: 'default' }}>
              <span className="n">4</span>
              <div className="t"><b>{t('youth_add_room_done_title')}</b><small>{t('youth_add_room_done_sum')}</small></div>
            </button>
            <div className="brit-add-stepbody">
              <div className="brit-add-stepinner">
                <div className="brit-add-done">
                  <div className="seal"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></div>
                  <h3>{t('youth_add_room_done_head')}</h3>
                  <p>{t('youth_add_room_done_body')}</p>
                  <div className="cta">
                    <button className="btn g" onClick={resetAll} type="button">{t('add_player_room_add_another')}</button>
                    <button className="btn p" type="button" onClick={() => { if (savedId) router.push(`/players/youth/${savedId}?from=/players`); }}>
                      {t('add_player_room_open_profile')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
