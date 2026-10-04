'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { callMandateSigningCreate } from '@/lib/callables';
import { db } from '@/lib/firebase';
import BritRail from '@/components/BritRail';
import Link from 'next/link';
import { COUNTRIES, matchCountry } from '@/lib/countries';
import { searchClubs, ClubSearchResult } from '@/lib/api';

interface Player {
  id: string;
  fullName?: string;
  profileImage?: string;
  tmProfile?: string;
  passportDetails?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    passportNumber?: string;
    nationality?: string;
  };
}

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
  fifaLicenseId?: string;
}

function buildValidLeagues(countryOnly: string[], clubs: { clubName: string; clubCountry: string }[]): string[] {
  const countryEntries = Array.from(new Set(countryOnly)).sort();
  const clubEntries = clubs
    .filter((c) => c.clubName && c.clubCountry)
    .sort((a, b) => (a.clubCountry !== b.clubCountry ? a.clubCountry.localeCompare(b.clubCountry) : a.clubName.localeCompare(b.clubName)))
    .map((c) => `${c.clubName} - ${c.clubCountry}`);
  return Array.from(new Set([...countryEntries, ...clubEntries]));
}

export default function GenerateMandatePage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [player, setPlayer] = useState<Player | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentUser, setCurrentUser] = useState<Account | null>(null);
  const [step, setStep] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<Account | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  });
  const [countryOnly, setCountryOnly] = useState<string[]>([]);
  const [selectedClubs, setSelectedClubs] = useState<{ clubName: string; clubCountry: string }[]>([]);
  const [isWorldWide, setIsWorldWide] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creatingSigning, setCreatingSigning] = useState(false);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Origin agent state
  const [withOriginAgent, setWithOriginAgent] = useState(false);
  const [originAgentName, setOriginAgentName] = useState('');
  const [originAgentUseLicense, setOriginAgentUseLicense] = useState(true);
  const [originAgentId, setOriginAgentId] = useState('');

  // Add country/league modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCountryQuery, setModalCountryQuery] = useState('');
  const [modalSelectedCountry, setModalSelectedCountry] = useState<string | null>(null);
  const [modalEntireCountry, setModalEntireCountry] = useState(true);
  const [modalClubQuery, setModalClubQuery] = useState('');
  const [modalClubResults, setModalClubResults] = useState<ClubSearchResult[]>([]);
  const [modalSearchingClubs, setModalSearchingClubs] = useState(false);
  const [modalPendingClubs, setModalPendingClubs] = useState<ClubSearchResult[]>([]);

  const agentsWithFifa = accounts.filter((a) => a.fifaLicenseId?.trim());
  const validLeagues = isWorldWide ? ['WorldWide'] : buildValidLeagues(countryOnly, selectedClubs);

  const dir = isRtl ? 'rtl' : 'ltr';

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'Players', id), (snap) => {
      if (snap.exists()) {
        setPlayer({ id: snap.id, ...snap.data() } as Player);
      } else {
        setPlayer(null);
      }
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Accounts'), (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.email || accounts.length === 0) return;
    const acc = accounts.find((a) => a.email?.toLowerCase() === user.email?.toLowerCase());
    setCurrentUser(acc ?? null);
    if (!selectedAgent && acc?.fifaLicenseId) setSelectedAgent(acc);
  }, [user?.email, accounts, selectedAgent]);

  // Debounced club search
  useEffect(() => {
    if (!modalSelectedCountry || !modalClubQuery.trim() || modalEntireCountry) {
      setModalClubResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setModalSearchingClubs(true);
      try {
        const clubs = await searchClubs(modalClubQuery.trim());
        setModalClubResults(clubs.filter((c) => matchCountry(c.clubCountry, modalSelectedCountry)));
      } catch {
        setModalClubResults([]);
      } finally {
        setModalSearchingClubs(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [modalClubQuery, modalSelectedCountry, modalEntireCountry]);

  const handleGenerate = useCallback(async () => {
    if (!player?.passportDetails) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/mandate/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passportDetails: player.passportDetails,
          expiryDate: new Date(expiryDate).getTime(),
          validLeagues,
          agentName: selectedAgent?.name ?? 'Lior Dahan',
          fifaLicenseId: selectedAgent?.fifaLicenseId ?? '22412-9595',
          ...(withOriginAgent && originAgentName.trim() && originAgentId.trim() ? {
            originAgentName: originAgentName.trim(),
            originAgentIdLabel: originAgentUseLicense ? 'FIFA License' : 'passport number',
            originAgentId: originAgentId.trim(),
          } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Generation failed');
      }
      const blob = await res.blob();

      // Download locally
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const pdfName = `Mandate_${[player.passportDetails.firstName, player.passportDetails.lastName].filter(Boolean).join('_') || 'player'}.pdf`;
      a.download = pdfName;
      a.click();
      URL.revokeObjectURL(url);

      router.push(`/players/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [player, selectedAgent, expiryDate, validLeagues, id, router, currentUser]);

  const handleCreateSigning = useCallback(async () => {
    if (!player?.passportDetails) return;
    setCreatingSigning(true);
    setError(null);
    setSigningUrl(null);
    try {
      // Get a unique token from the server
      const res = await fetch('/api/mandate/create-signing', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create signing token');
      const { token, signingUrl: url } = await res.json();

      // Write mandate data to Firestore client-side
      await callMandateSigningCreate({
        token,
        passportDetails: player.passportDetails,
        expiryDate: new Date(expiryDate).getTime(),
        validLeagues,
        agentName: selectedAgent?.name ?? 'Lior Dahan',
        fifaLicenseId: selectedAgent?.fifaLicenseId ?? '22412-9595',
        originAgentName: withOriginAgent && originAgentName.trim() ? originAgentName.trim() : null,
        originAgentIdLabel: withOriginAgent && originAgentId.trim() ? (originAgentUseLicense ? 'FIFA License' : 'passport number') : null,
        originAgentId: withOriginAgent && originAgentId.trim() ? originAgentId.trim() : null,
        agentAccountId: currentUser?.id || null,
        playerId: id || null,
        playerName: [player.passportDetails.firstName, player.passportDetails.lastName].filter(Boolean).join(' ') || null,
        effectiveDate: Date.now(),
        createdAt: Date.now(),
        status: 'pending',
        playerSignature: null,
        playerSignedAt: null,
        agentSignature: null,
        agentSignedAt: null,
      });

      setSigningUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create signing link');
    } finally {
      setCreatingSigning(false);
    }
  }, [player, selectedAgent, expiryDate, validLeagues, id]);

  const openModal = () => {
    setModalOpen(true);
    setModalCountryQuery('');
    setModalSelectedCountry(null);
    setModalEntireCountry(true);
    setModalClubQuery('');
    setModalClubResults([]);
    setModalPendingClubs([]);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const addClubToPending = (club: ClubSearchResult) => {
    if (!club.clubName || !club.clubCountry) return;
    if (modalPendingClubs.some((c) => c.clubName === club.clubName && c.clubCountry === club.clubCountry)) return;
    setModalPendingClubs((prev) => [...prev, club]);
    setModalClubQuery('');
  };

  const removeClubFromPending = (club: ClubSearchResult) => {
    setModalPendingClubs((prev) => prev.filter((c) => !(c.clubName === club.clubName && c.clubCountry === club.clubCountry)));
  };

  const confirmModalSelection = () => {
    if (modalEntireCountry && modalSelectedCountry) {
      setCountryOnly((prev) => (prev.includes(modalSelectedCountry) ? prev : [...prev, modalSelectedCountry].sort()));
    } else if (!modalEntireCountry && modalPendingClubs.length > 0) {
      const newClubs = modalPendingClubs
        .filter((c) => c.clubName && c.clubCountry)
        .map((c) => ({ clubName: c.clubName!, clubCountry: c.clubCountry! }));
      setSelectedClubs((prev) => {
        const seen = new Set(prev.map((x) => `${x.clubName}|${x.clubCountry}`));
        const added = newClubs.filter((n) => !seen.has(`${n.clubName}|${n.clubCountry}`));
        return [...prev, ...added];
      });
    }
    closeModal();
  };

  const removeCountry = (c: string) => {
    setCountryOnly((prev) => prev.filter((x) => x !== c));
  };

  const removeClub = (club: { clubName: string; clubCountry: string }) => {
    setSelectedClubs((prev) => prev.filter((c) => !(c.clubName === club.clubName && c.clubCountry === club.clubCountry)));
  };

  const canAddInModal = modalEntireCountry
    ? !!modalSelectedCountry
    : modalSelectedCountry && modalPendingClubs.length > 0;

  const filteredCountries = COUNTRIES.filter((c) =>
    c.toLowerCase().includes(modalCountryQuery.toLowerCase())
  );

  const playerName = [player?.passportDetails?.firstName, player?.passportDetails?.lastName]
    .filter(Boolean)
    .join(' ') || '—';

  // ── Editorial shell helper for guard states ──
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="brit-room" dir={dir} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="players" />
        <div className="brit-main">
          <div className="brit-mandate">{children}</div>
        </div>
      </div>
    </div>
  );

  if (loading || !user) {
    return (
      <div className="brit-room" dir={dir} lang={isRtl ? 'he' : 'en'}>
        <div className="brit-app">
          <BritRail active="players" />
          <div className="brit-main"><div className="brit-mandate"><div className="brit-md-empty">{t('loading')}</div></div></div>
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <Shell>
        <Link href={`/players/${id}`} className="brit-md-back">
          <span style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}>←</span> {t('player_info_back_players')}
        </Link>
        <div className="brit-md-empty">{t('player_info_not_found')}</div>
      </Shell>
    );
  }

  if (!player.passportDetails) {
    return (
      <Shell>
        <Link href={`/players/${id}`} className="brit-md-back">
          <span style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}>←</span> {t('player_info_back_players')}
        </Link>
        <div className="brit-md-empty">{t('mandate_no_passport')}</div>
      </Shell>
    );
  }


  const agentDisplay = (a: Account | null) =>
    a ? (isRtl ? (a.hebrewName ?? a.name) : (a.name ?? a.hebrewName)) ?? '—' : '—';
  const agentInitials = (a: Account | null) =>
    (agentDisplay(a) || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="brit-room" dir={dir} lang={isRtl ? 'he' : 'en'}>
      <div className="brit-app">
        <BritRail active="players" />
        <div className="brit-main">
          <header className="brit-topbar">
            <div>
              BRIT / <Link href="/players">{t('nav_players')}</Link> / <Link href={`/players/${id}`}>{playerName}</Link> / <strong>{t('player_info_generate_mandate')}</strong>
            </div>
          </header>

          <div className="brit-mandate">
            <Link href={`/players/${id}`} className="brit-md-back">
              <span style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}>←</span> {t('player_info_back_players')}
            </Link>

            {/* Masthead */}
            <header className="brit-md-mast">
              <p className="brit-md-kicker">{isRtl ? 'ייצוג / מנדט FIFA' : 'Representation / FIFA mandate'}</p>
              <h1>{t('player_info_generate_mandate')}</h1>
              <div className="brit-md-who">
                <span className="av">{(playerName || '?').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
                {playerName} · {isRtl ? 'דרכון בתיק' : 'passport on file'}
              </div>
            </header>

            {/* Stepper */}
            <div className="brit-md-stepper">
              {[
                { n: 0, b: t('mandate_step_agent'), s: isRtl ? 'אחראי' : 'In charge' },
                { n: 1, b: t('mandate_step_validity'), s: isRtl ? 'תאריכים וליגות' : 'Dates & leagues' },
                { n: 2, b: t('mandate_step_review'), s: isRtl ? 'הפקה וחתימה' : 'Generate & sign' },
              ].map((st) => (
                <div key={st.n} className={`st${step === st.n ? ' active' : step > st.n ? ' done' : ''}`}>
                  <span className="n">{st.n + 1}</span>
                  <div className="t"><b>{st.b}</b><small>{st.s}</small></div>
                </div>
              ))}
            </div>

            {error && <div className="brit-md-err">{error}</div>}

            {/* STEP 0 — AGENT */}
            {step === 0 && (
              <section>
                <p className="brit-md-seclabel">{t('mandate_step_agent')}</p>
                {agentsWithFifa.length === 0 ? (
                  <div className="brit-md-empty">{t('mandate_no_agents_fifa')}</div>
                ) : (
                  agentsWithFifa.map((a) => (
                    <button
                      key={a.id}
                      className={`brit-md-agent${selectedAgent?.id === a.id ? ' on' : ''}`}
                      onClick={() => setSelectedAgent(a)}
                    >
                      <span className="av">{agentInitials(a)}</span>
                      <div className="info">
                        <b>{agentDisplay(a)}</b>
                        {a.fifaLicenseId && <span>{t('mandate_fifa_license')} · {a.fifaLicenseId}</span>}
                      </div>
                      <span className="rc">{selectedAgent?.id === a.id ? '✓' : ''}</span>
                    </button>
                  ))
                )}

                <div className="brit-md-divider" />

                <div
                  className={`brit-md-togglecard${withOriginAgent ? ' on' : ''}`}
                  onClick={() => {
                    const next = !withOriginAgent;
                    setWithOriginAgent(next);
                    if (!next) { setOriginAgentName(''); setOriginAgentUseLicense(true); setOriginAgentId(''); }
                  }}
                >
                  <span className="sw"><i /></span>
                  <div className="tc">
                    <b>{t('mandate_with_origin_agent')}</b>
                    <span>{t('mandate_with_origin_agent_desc')}</span>
                  </div>
                </div>

                {withOriginAgent && (
                  <div className="brit-md-originfields">
                    <div className="brit-md-field">
                      <label>{t('mandate_origin_agent_name')}</label>
                      <input value={originAgentName} onChange={(e) => setOriginAgentName(e.target.value)} placeholder={t('mandate_origin_agent_name_hint')} />
                    </div>
                    <div className="brit-md-field">
                      <label>{t('mandate_origin_agent_id_type')}</label>
                      <div className="brit-md-seg">
                        <button className={originAgentUseLicense ? 'on' : ''} onClick={() => { setOriginAgentUseLicense(true); setOriginAgentId(''); }}>{t('mandate_origin_fifa_license')}</button>
                        <button className={!originAgentUseLicense ? 'on' : ''} onClick={() => { setOriginAgentUseLicense(false); setOriginAgentId(''); }}>{t('mandate_origin_passport')}</button>
                      </div>
                    </div>
                    <div className="brit-md-field">
                      <label>{originAgentUseLicense ? t('mandate_origin_license_number') : t('mandate_origin_passport_number')}</label>
                      <input className="mono" value={originAgentId} onChange={(e) => setOriginAgentId(e.target.value)} placeholder={originAgentUseLicense ? 'XXXXXX-XXXX' : t('mandate_origin_passport_hint')} />
                    </div>
                  </div>
                )}

                <div className="brit-md-actions">
                  <button
                    className="brit-md-btn primary"
                    disabled={(agentsWithFifa.length > 0 && !selectedAgent) || (withOriginAgent && (!originAgentName.trim() || !originAgentId.trim()))}
                    onClick={() => setStep(1)}
                  >
                    {t('mandate_next')} →
                  </button>
                </div>
              </section>
            )}

            {/* STEP 1 — VALIDITY */}
            {step === 1 && (
              <section>
                <p className="brit-md-seclabel">{t('mandate_expiry_date')}</p>
                <div className="brit-md-datefield">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                  <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                </div>

                <p className="brit-md-seclabel" style={{ marginTop: 24 }}>{t('mandate_valid_leagues')}</p>
                <div className={`brit-md-togglecard${isWorldWide ? ' on' : ''}`} onClick={() => setIsWorldWide((v) => !v)}>
                  <span className="sw"><i /></span>
                  <div className="tc"><b>{t('mandate_worldwide')}</b><span>{t('mandate_worldwide_desc')}</span></div>
                </div>

                {!isWorldWide && (
                  <div style={{ marginTop: 14 }}>
                    <button className="brit-md-addrow" onClick={openModal}>+ {t('mandate_add_country_league')}</button>
                    {countryOnly.map((c) => (
                      <div className="brit-md-leaguetag" key={`country-${c}`}>
                        <div className="lt-nm">{c}</div>
                        <button onClick={() => removeCountry(c)} aria-label="Remove">×</button>
                      </div>
                    ))}
                    {selectedClubs.map((club) => (
                      <div className="brit-md-leaguetag" key={`club-${club.clubName}-${club.clubCountry}`}>
                        <div className="lt-nm">{club.clubName} <small>{isRtl ? 'מועדון' : 'club'} · {club.clubCountry}</small></div>
                        <button onClick={() => removeClub(club)} aria-label="Remove">×</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="brit-md-actions">
                  <button className="brit-md-btn ghost" onClick={() => setStep(0)}>{t('mandate_back')}</button>
                  <button className="brit-md-btn primary" disabled={!expiryDate} onClick={() => setStep(2)}>{t('mandate_next')} →</button>
                </div>
              </section>
            )}

            {/* STEP 2 — REVIEW */}
            {step === 2 && (
              <section>
                <p className="brit-md-seclabel">{t('mandate_step_review')}</p>
                <div className="brit-md-review">
                  <div className="r"><label>{t('mandate_review_player')}</label><div className="v">{playerName}</div></div>
                  <div className="r">
                    <label>{t('mandate_review_agent')}</label>
                    <div className="v">{agentDisplay(selectedAgent)}{selectedAgent?.fifaLicenseId && <small>FIFA {selectedAgent.fifaLicenseId}</small>}</div>
                  </div>
                  {withOriginAgent && originAgentName.trim() && (
                    <div className="r">
                      <label>{t('mandate_origin_agent_title')}</label>
                      <div className="v">{originAgentName}<small>{originAgentUseLicense ? t('mandate_review_fifa_id') : t('mandate_origin_passport')}: {originAgentId}</small></div>
                    </div>
                  )}
                  <div className="r"><label>{t('mandate_expiry_date')}</label><div className="v">{new Date(expiryDate).toLocaleDateString('en-GB')}</div></div>
                  {validLeagues.length > 0 && (
                    <div className="r"><label>{t('mandate_valid_leagues')}</label><div className="v">{validLeagues.join(', ')}</div></div>
                  )}
                </div>

                <div className="brit-md-actions">
                  <button className="brit-md-btn ghost" onClick={() => setStep(1)}>{t('mandate_back')}</button>
                  <button className="brit-md-btn outline" disabled={generating || creatingSigning} onClick={handleCreateSigning}>
                    {creatingSigning ? '…' : `↗ ${t('mandate_send_for_signing')}`}
                  </button>
                  <button className="brit-md-btn primary" disabled={generating || creatingSigning} onClick={handleGenerate}>
                    {generating ? '…' : `◈ ${t('mandate_generate_pdf')}`}
                  </button>
                </div>

                {signingUrl && (
                  <div className="brit-md-signbox">
                    <h4>{t('mandate_signing_link_created')}</h4>
                    <p>{t('mandate_signing_link_desc')}</p>
                    <div className="copy">
                      <input readOnly value={signingUrl} />
                      <button
                        onClick={() => { navigator.clipboard.writeText(signingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      >
                        {copied ? `✓ ${t('mandate_link_copied')}` : t('mandate_copy_link')}
                      </button>
                    </div>
                    <a href={signingUrl} target="_blank" rel="noopener noreferrer" className="openlink">{t('mandate_open_signing_page')} ↗</a>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Add country/club territory modal */}
      {modalOpen && (
        <div className="brit-backdrop open" onClick={closeModal}>
          <div className="brit-modal" dir={dir} onClick={(e) => e.stopPropagation()} style={{ width: 'min(480px,100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <button type="button" className="brit-close" onClick={closeModal} aria-label={t('cancel')}>×</button>
            <p className="brit-modal-kicker">{isRtl ? 'הוסף טריטוריה' : 'Add territory'}</p>
            <h2 style={{ fontSize: 30 }}>{t('mandate_add_country_league')}</h2>

            <div style={{ overflowY: 'auto', marginTop: 18 }}>
              {!modalSelectedCountry ? (
                <>
                  <div className="brit-md-field">
                    <label>{t('mandate_search_country')}</label>
                    <input autoFocus value={modalCountryQuery} onChange={(e) => setModalCountryQuery(e.target.value)} placeholder={t('mandate_search_country')} />
                  </div>
                  <div className="brit-md-countrylist">
                    {filteredCountries.slice(0, 50).map((c) => (
                      <button key={c} className="brit-md-countryopt" onClick={() => { setModalSelectedCountry(c); setModalCountryQuery(''); }}>{c}</button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="brit-md-selcountry">
                    <span>{modalSelectedCountry}</span>
                    <button onClick={() => setModalSelectedCountry(null)}>{t('mandate_change_country')}</button>
                  </div>
                  <div className={`brit-md-togglecard${modalEntireCountry ? ' on' : ''}`} onClick={() => setModalEntireCountry((v) => !v)} style={{ marginTop: 14 }}>
                    <span className="sw"><i /></span>
                    <div className="tc"><b>{t('mandate_entire_country')}</b></div>
                  </div>

                  {!modalEntireCountry && (
                    <>
                      <div className="brit-md-field" style={{ marginTop: 14 }}>
                        <label>{t('mandate_valid_leagues')}</label>
                        <input value={modalClubQuery} onChange={(e) => setModalClubQuery(e.target.value)} placeholder={t('mandate_sheet_search_clubs').replace('%s', modalSelectedCountry)} />
                      </div>
                      {modalSearchingClubs && <div className="brit-md-empty">…</div>}
                      {modalClubResults.length > 0 && (
                        <div className="brit-md-countrylist">
                          {modalClubResults.map((club) => (
                            <button key={`${club.clubName}-${club.clubCountry}`} className="brit-md-countryopt" onClick={() => addClubToPending(club)}>
                              {club.clubLogo && <img src={club.clubLogo} alt="" style={{ width: 22, height: 22, objectFit: 'contain', marginInlineEnd: 10, verticalAlign: 'middle' }} />}
                              {club.clubName}
                            </button>
                          ))}
                        </div>
                      )}
                      {modalPendingClubs.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <p className="brit-md-seclabel">{t('mandate_selected_clubs').replace('%d', String(modalPendingClubs.length))}</p>
                          {modalPendingClubs.map((club) => (
                            <div className="brit-md-leaguetag" key={`${club.clubName}-${club.clubCountry}`}>
                              <div className="lt-nm">{club.clubName}</div>
                              <button onClick={() => removeClubFromPending(club)} aria-label="Remove">×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            <div className="brit-modal-actions" style={{ marginTop: 20 }}>
              <button className="brit-modal-action" disabled={!canAddInModal} onClick={confirmModalSelection}>{t('mandate_sheet_add_button')}</button>
              <button className="brit-modal-action brit-modal-action-secondary" onClick={closeModal}>{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
