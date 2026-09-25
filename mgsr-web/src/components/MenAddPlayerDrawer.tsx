'use client';

/**
 * Men platform "Add player to roster" — guided drawer.
 *
 * Opens as a right-side drawer (same shell as the roster quick-view drawer) with
 * a 3-step guided accordion: Find → Confirm & contacts → Added. Reuses the exact
 * data layer as the old /players/add page (searchPlayers, getPlayerDetails,
 * callPlayersCreate). Men only — women/youth keep the /players/add route.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { searchPlayers, getPlayerDetails, type SearchPlayer, type PlayerDetails } from '@/lib/api';
import { callPlayersCreate, callShortlistAdd } from '@/lib/callables';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import { enrichShortlistInstagram } from '@/lib/outreach';

const DEBOUNCE_MS = 350;
const MIN_SEARCH_LEN = 2;

type Step = 1 | 2 | 3;

const NATIONALITY_TO_ISO: Record<string, string> = {
  israel: 'il', germany: 'de', brazil: 'br', argentina: 'ar', france: 'fr',
  spain: 'es', italy: 'it', portugal: 'pt', netherlands: 'nl', belgium: 'be',
  england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls', 'northern ireland': 'gb-nir',
  'great britain': 'gb', 'united kingdom': 'gb', ireland: 'ie',
  croatia: 'hr', serbia: 'rs', slovenia: 'si', 'bosnia-herzegovina': 'ba',
  'bosnia and herzegovina': 'ba', montenegro: 'me', 'north macedonia': 'mk', macedonia: 'mk',
  albania: 'al', kosovo: 'xk', greece: 'gr', turkey: 'tr', türkiye: 'tr',
  switzerland: 'ch', austria: 'at', poland: 'pl', ukraine: 'ua', russia: 'ru',
  'czech republic': 'cz', czechia: 'cz', slovakia: 'sk', hungary: 'hu', romania: 'ro',
  bulgaria: 'bg', sweden: 'se', norway: 'no', denmark: 'dk', finland: 'fi', iceland: 'is',
  cyprus: 'cy', luxembourg: 'lu', malta: 'mt', georgia: 'ge', armenia: 'am', azerbaijan: 'az',
  kazakhstan: 'kz', 'saudi arabia': 'sa', 'united arab emirates': 'ae', qatar: 'qa',
  kuwait: 'kw', bahrain: 'bh', oman: 'om', jordan: 'jo', lebanon: 'lb', egypt: 'eg',
  morocco: 'ma', algeria: 'dz', tunisia: 'tn', nigeria: 'ng', ghana: 'gh', senegal: 'sn',
  'ivory coast': 'ci', "cote d'ivoire": 'ci', cameroon: 'cm', mali: 'ml', 'south africa': 'za',
  'united states': 'us', usa: 'us', canada: 'ca', mexico: 'mx', colombia: 'co', uruguay: 'uy',
  chile: 'cl', peru: 'pe', ecuador: 'ec', paraguay: 'py', venezuela: 've',
  japan: 'jp', 'south korea': 'kr', china: 'cn', australia: 'au',
};
const flagUrlFromNationality = (nationality?: string): string | null => {
  if (!nationality) return null;
  const code = NATIONALITY_TO_ISO[nationality.trim().toLowerCase()];
  return code ? `https://flagcdn.com/w640/${code}.png` : null;
};

interface MenAddPlayerDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 'roster' (default) adds to the squad with contacts; 'shortlist' adds to the shortlist (no contacts). */
  mode?: 'roster' | 'shortlist';
  /** Called after a successful save (e.g. to surface a toast); optional. */
  onSaved?: (playerId?: string) => void;
}

export default function MenAddPlayerDrawer({ open, onClose, mode = 'roster', onSaved }: MenAddPlayerDrawerProps) {
  const isShortlist = mode === 'shortlist';
  const { user } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [searchResults, setSearchResults] = useState<SearchPlayer[]>([]);
  const [selected, setSelected] = useState<PlayerDetails | null>(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [error, setError] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [playerPhone, setPlayerPhone] = useState('');
  const [agentPhone, setAgentPhone] = useState('');

  const resetAll = useCallback(() => {
    setStep(1);
    setSearchQuery('');
    setUrlInput('');
    setSearchResults([]);
    setSelected(null);
    setLoadingSearch(false);
    setLoadingDetails(false);
    setSaving(false);
    setSavedId(undefined);
    setError('');
    setPlayerPhone('');
    setAgentPhone('');
  }, []);

  // Reset whenever the drawer is (re)opened.
  useEffect(() => {
    if (open) resetAll();
  }, [open, resetAll]);

  // Debounced auto-search.
  useEffect(() => {
    if (!open) return;
    const q = searchQuery.trim();
    if (q.length < MIN_SEARCH_LEN) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }
    setLoadingSearch(true);
    const timer = setTimeout(async () => {
      try {
        const players = await searchPlayers(q);
        setSearchResults(players);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, open]);

  const loadDetails = useCallback(async (url: string) => {
    setError('');
    setLoadingDetails(true);
    setStep(2);
    try {
      const details = await getPlayerDetails(url);
      setSelected(details);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load player');
      setSelected(null);
      setStep(1);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const handleSelectFromSearch = (p: SearchPlayer) => {
    setSearchResults([]);
    setSearchQuery('');
    loadDetails(p.tmProfile);
  };

  const handleLoadByUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    loadDetails(url);
  };

  const handleSave = async () => {
    if (!selected || !user) return;
    setError('');
    setSaving(true);

    // ── Shortlist mode: no contacts, uses the shortlist callable ──
    if (isShortlist) {
      try {
        const account = await getCurrentAccountForShortlist(user);
        const result = await callShortlistAdd({
          platform: 'men',
          tmProfileUrl: selected.tmProfile,
          playerImage: selected.profileImage ?? null,
          playerName: selected.fullName ?? null,
          playerPosition: selected.positions?.[0] ?? null,
          playerAge: selected.age ?? null,
          playerNationality: selected.nationality ?? null,
          playerNationalityFlag: selected.nationalityFlag ?? null,
          clubJoinedName: selected.currentClub?.clubName ?? null,
          marketValue: selected.marketValue ?? null,
          addedByAgentId: account.id,
          addedByAgentName: account.name ?? null,
          addedByAgentHebrewName: account.hebrewName ?? null,
          instagramHandle: selected.instagramHandle ?? null,
          instagramUrl: selected.instagramUrl ?? null,
        });
        if (result.status === 'already_in_roster') {
          setError(t('add_player_already_in_roster'));
          setSaving(false);
          return;
        }
        if (result.status === 'already_exists') {
          setError(t('add_player_already_in_shortlist'));
          setSaving(false);
          return;
        }
        if (result.status === 'added') enrichShortlistInstagram(selected.tmProfile);
        setSavedId(result.id);
        setStep(3);
        onSaved?.(result.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save';
        setError(
          msg.toLowerCase().includes('permission') || msg.includes('PERMISSION_DENIED')
            ? 'Missing or insufficient permissions.'
            : msg
        );
      } finally {
        setSaving(false);
      }
      return;
    }

    // ── Roster mode: full player create with optional contacts ──
    try {
      const playersRef = collection(db, 'Players');
      const existing = await getDocs(query(playersRef, where('tmProfile', '==', selected.tmProfile)));
      if (!existing.empty) {
        setError(t('add_player_already_in_roster'));
        setSaving(false);
        return;
      }

      const accountsSnap = await getDocs(collection(db, 'Accounts'));
      let agentName = user.displayName || user.email || '';
      accountsSnap.forEach((d) => {
        const data = d.data();
        if (data.email?.toLowerCase() === user.email?.toLowerCase()) {
          agentName = data.name || agentName;
        }
      });

      const playerToSave: Record<string, unknown> = {
        platform: 'men',
        tmProfile: selected.tmProfile,
        fullName: selected.fullName,
        height: selected.height,
        age: selected.age,
        positions: selected.positions,
        profileImage: selected.profileImage,
        nationality: selected.nationality,
        nationalityFlag: selected.nationalityFlag,
        contractExpired: selected.contractExpires,
        marketValue: selected.marketValue,
        currentClub: selected.currentClub,
        createdAt: Date.now(),
        agentInChargeId: user.uid,
        agentInChargeName: agentName,
        isOnLoan: selected.isOnLoan || false,
        onLoanFromClub: selected.onLoanFromClub,
        foot: selected.foot,
      };
      const pPhone = playerPhone.trim();
      const aPhone = agentPhone.trim();
      if (pPhone) playerToSave.playerPhoneNumber = pPhone;
      if (aPhone) playerToSave.agentPhoneNumber = aPhone;

      const sanitized = Object.fromEntries(
        Object.entries(playerToSave).filter(([, v]) => v !== undefined)
      );

      const result = await callPlayersCreate(sanitized as Parameters<typeof callPlayersCreate>[0]);
      if (result.status === 'already_exists') {
        setError(t('add_player_already_in_roster'));
        setSaving(false);
        return;
      }
      setSavedId(result.id);
      setStep(3);
      onSaved?.(result.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(
        msg.toLowerCase().includes('permission') || msg.includes('PERMISSION_DENIED')
          ? 'Missing or insufficient permissions.'
          : msg
      );
    } finally {
      setSaving(false);
    }
  };

  // ── Step helpers ──
  const goStep = (s: Step) => {
    // only allow revisiting completed/current steps
    if (s === 1) setStep(1);
    else if (s === 2 && selected) setStep(2);
  };
  const stepClass = (s: Step) =>
    step === s ? 'open' : step > s ? 'done' : 'locked';

  const flagBg = flagUrlFromNationality(selected?.nationality);
  const displayName = selected?.fullName || (isRtl ? 'לא ידוע' : 'Unknown');
  const footLabel = selected?.foot
    ? (selected.foot.toLowerCase().includes('left') || selected.foot.includes('שמאל')
        ? t('player_info_foot_left')
        : selected.foot.toLowerCase().includes('right') || selected.foot.includes('ימין')
          ? t('player_info_foot_right')
          : selected.foot)
    : '—';

  const s1Summary = selected
    ? `${displayName}${selected.currentClub?.clubName ? ` · ${selected.currentClub.clubName}` : ''}`
    : t('add_player_room_find_sum');
  const s2Summary = savedId
    ? `${displayName} · ${isRtl ? 'נשמר' : 'saved'}`
    : isShortlist
      ? t('add_player_room_confirm_sum_sl')
      : t('add_player_room_confirm_sum');

  return (
    <>
      <div
        className={`brit-scrim${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`brit-drawer brit-add-drawer${open ? ' open' : ''}`} dir={isRtl ? 'rtl' : 'ltr'} aria-label={t('add_player_title')}>
        <div className="brit-add-head">
          <button className="close" onClick={onClose} aria-label={t('room_close')}>×</button>
          <div className="eyebrow">{isShortlist ? t('add_player_room_eyebrow_sl') : t('add_player_room_eyebrow')}</div>
          <h2>{isShortlist ? t('add_player_room_title_sl') : t('add_player_room_title')}</h2>
          <div className="brit-add-prog">
            <i className={step >= 1 ? 'on' : ''} />
            <i className={step >= 2 ? 'on' : ''} />
            <i className={step >= 3 ? 'on' : ''} />
          </div>
        </div>

        <div className="brit-add-body">
          {/* STEP 1 — FIND */}
          <div className={`brit-add-step ${stepClass(1)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(1)} type="button">
              <span className="n">{step > 1 ? '' : '1'}</span>
              <div className="t">
                <b>{t('add_player_room_find_title')}</b>
                <small>{s1Summary}</small>
              </div>
              {step > 1 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody">
              <div className="brit-add-stepinner">
                <p className="brit-add-seclabel">{t('add_player_paste_url')}</p>
                <div className="brit-add-urlrow">
                  <input
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder={t('add_player_placeholder_url')}
                  />
                  <button className="brit-add-minibtn" onClick={handleLoadByUrl} disabled={loadingDetails || !urlInput.trim()} type="button">
                    {loadingDetails ? t('add_player_loading') : t('add_player_load')}
                  </button>
                </div>

                <div className="brit-add-divider"><span className="ln" /><span>{t('common_or')}</span><span className="ln" /></div>

                <p className="brit-add-seclabel">{t('add_player_search')}</p>
                <label className={`brit-add-search${searchFocused ? ' focus' : ''}`}>
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder={t('add_player_placeholder_search')}
                  />
                  {loadingSearch && <span className="sp" />}
                </label>
                <p className="brit-add-hint">{t('add_player_auto_search_hint')}</p>

                {searchResults.length > 0 && (
                  <div className="brit-add-results">
                    {searchResults.map((p) => (
                      <button
                        key={p.tmProfile}
                        className="brit-add-result"
                        onClick={() => handleSelectFromSearch(p)}
                        disabled={loadingDetails}
                        type="button"
                      >
                        <img src={p.playerImage || 'https://via.placeholder.com/56'} alt="" />
                        <div className="ri">
                          <b>{p.playerName || 'Unknown'}</b>
                          <span>
                            {p.playerPosition}
                            {p.playerPosition && p.currentClub ? ' · ' : ''}
                            {p.currentClub}
                            {p.playerValue ? <> · <span className="v">{p.playerValue}</span></> : null}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {searchQuery.trim().length >= MIN_SEARCH_LEN && !loadingSearch && searchResults.length === 0 && (
                  <div className="brit-add-results"><div className="brit-add-empty">{t('add_player_no_results')}</div></div>
                )}
              </div>
            </div>
          </div>

          {/* STEP 2 — CONFIRM & CONTACTS */}
          <div className={`brit-add-step ${stepClass(2)}`}>
            <button className="brit-add-stephead" onClick={() => goStep(2)} type="button">
              <span className="n">{step > 2 ? '' : '2'}</span>
              <div className="t">
                <b>{isShortlist ? t('add_player_room_confirm_title_sl') : t('add_player_room_confirm_title')}</b>
                <small>{s2Summary}</small>
              </div>
              {step > 2 && <span className="edit">{t('add_player_room_edit')}</span>}
            </button>
            <div className="brit-add-stepbody">
              <div className="brit-add-stepinner">
                {loadingDetails ? (
                  <div className="brit-add-loading"><div className="sp" /><p>{t('add_player_loading')}</p></div>
                ) : selected ? (
                  <>
                    <div className="brit-add-phero">
                      {flagBg
                        ? <img className="flagbg" src={flagBg} alt="" aria-hidden="true" />
                        : null}
                      <div className="pimg"><img src={selected.profileImage || 'https://via.placeholder.com/120'} alt="" /></div>
                      <div className="pi">
                        <div className="nm" title={displayName}>{displayName}</div>
                        <div className="sub">{selected.positions?.filter(Boolean).join(' · ')}{selected.currentClub?.clubName ? ` · ${selected.currentClub.clubName}` : ''}</div>
                        {selected.marketValue && <div className="mv">{selected.marketValue}</div>}
                      </div>
                    </div>
                    <div className="brit-add-attrs">
                      <div><label>{t('player_info_age')}</label><b>{selected.age || '—'}</b></div>
                      <div><label>{t('player_info_height')}</label><b>{selected.height || '—'}</b></div>
                      <div><label>{t('player_info_foot')}</label><b>{footLabel}</b></div>
                      <div><label>{t('player_info_contract')}</label><b>{selected.contractExpires || '—'}</b></div>
                    </div>
                    {selected.isOnLoan && selected.onLoanFromClub && (
                      <div className="brit-add-loanline">
                        <svg viewBox="0 0 24 24"><path d="M3 12h18M3 12l4-4M3 12l4 4" /></svg>
                        {t('player_info_on_loan')} {selected.onLoanFromClub}
                      </div>
                    )}

                    {!isShortlist && (
                      <>
                        <div className="brit-add-field">
                          <label>{t('player_info_player_phone')}</label>
                          <input type="tel" value={playerPhone} onChange={(e) => setPlayerPhone(e.target.value)} placeholder="+972 50 123 4567" />
                        </div>
                        <div className="brit-add-field">
                          <label>{t('player_info_agent_phone')}</label>
                          <input type="tel" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} placeholder="+972 50 987 6543" />
                        </div>
                      </>
                    )}

                    {error && <div className="brit-add-steperr">{error}</div>}

                    <div className="brit-add-stepcta" style={isShortlist ? { marginTop: 16 } : undefined}>
                      <button className="btn ghost" onClick={() => goStep(1)} type="button">{t('add_player_room_change')}</button>
                      <button className="btn" onClick={handleSave} disabled={saving} type="button">
                        {saving ? t('add_player_saving') : isShortlist ? t('add_player_room_add_to_shortlist') : t('add_player_to_roster')}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* STEP 3 — DONE */}
          <div className={`brit-add-step ${stepClass(3)}`}>
            <button className="brit-add-stephead" type="button" style={{ cursor: 'default' }}>
              <span className="n">3</span>
              <div className="t">
                <b>{isShortlist ? t('add_player_room_done_title_sl') : t('add_player_room_done_title')}</b>
                <small>{isShortlist ? t('add_player_room_done_sum_sl') : t('add_player_room_done_sum')}</small>
              </div>
            </button>
            <div className="brit-add-stepbody">
              <div className="brit-add-stepinner">
                <div className="brit-add-done">
                  <div className="seal"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg></div>
                  <h3>{isShortlist ? t('add_player_room_done_head_sl') : t('add_player_room_done_head')}</h3>
                  <p>{isShortlist ? t('add_player_room_done_body_sl') : t('add_player_room_done_body')}</p>
                  <div className="cta">
                    <button className="btn g" onClick={resetAll} type="button">{t('add_player_room_add_another')}</button>
                    <button
                      className="btn p"
                      type="button"
                      onClick={() => {
                        if (isShortlist) { router.push('/shortlist'); return; }
                        if (savedId) router.push(`/players/${savedId}?from=/players`);
                      }}
                    >
                      {isShortlist ? t('add_player_room_view_shortlist') : t('add_player_room_open_profile')}
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
