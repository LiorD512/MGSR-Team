'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, collection, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { COUNTRIES } from '@/lib/countries';
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
        setModalClubResults(clubs.filter((c) => c.clubCountry === modalSelectedCountry));
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
      await setDoc(doc(db, 'MandateSigningRequests', token), {
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

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  if (!player) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-12 text-center">
          <p className="text-mgsr-muted mb-4">{t('player_info_not_found')}</p>
          <Link href={`/players/${id}`} className="text-mgsr-teal hover:underline">
            {t('player_info_back_players')}
          </Link>
        </div>
      </AppLayout>
    );
  }

  if (!player.passportDetails) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-12 text-center">
          <p className="text-mgsr-muted mb-4">{t('mandate_no_passport')}</p>
          <Link href={`/players/${id}`} className="text-mgsr-teal hover:underline">
            {t('player_info_back_players')}
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div dir={dir} className="max-w-2xl mx-auto py-4 sm:py-8 px-4">
        <Link
          href={`/players/${id}`}
          className={`inline-flex items-center gap-2 text-mgsr-teal hover:underline mb-8 transition-colors ${isRtl ? 'flex-row-reverse' : ''}`}
        >
          <span className={isRtl ? 'rotate-180' : ''}>←</span>
          {t('player_info_back_players')}
        </Link>

        <h1 className="text-2xl font-display font-bold text-mgsr-text mb-1">
          {t('player_info_generate_mandate')}
        </h1>
        <p className="text-mgsr-muted text-sm mb-8">{playerName}</p>

        {/* Step indicator - dir=rtl puts step 0 on right (start), fills correctly */}
        <div dir={dir} className="flex gap-2 mb-8">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-mgsr-teal' : 'bg-mgsr-border'}`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-mgsr-red/15 border border-mgsr-red/30 text-mgsr-red text-sm">
            {error}
          </div>
        )}

        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-mgsr-text">{t('mandate_step_agent')}</h2>
            {agentsWithFifa.length === 0 ? (
              <p className="text-mgsr-muted text-sm">{t('mandate_no_agents_fifa')}</p>
            ) : (
              <div className="space-y-3">
                {agentsWithFifa.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgent(a)}
                    className={`w-full p-4 rounded-xl border-2 text-start transition-all ${
                      selectedAgent?.id === a.id
                        ? 'border-mgsr-teal bg-mgsr-teal/15 shadow-sm'
                        : 'border-mgsr-border hover:border-mgsr-teal/40 hover:bg-mgsr-card/50'
                    } ${isRtl ? 'text-right' : 'text-left'}`}
                  >
                    <p className="font-medium text-mgsr-text">
                      {isRtl ? a.hebrewName ?? a.name : a.name ?? a.hebrewName}
                    </p>
                    {a.fifaLicenseId && (
                      <p className="text-sm text-mgsr-muted mt-1">
                        {t('mandate_fifa_license')}: {a.fifaLicenseId}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Origin Agent Section */}
            <div className="border-t border-mgsr-border pt-5 mt-2">
              <label
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  withOriginAgent
                    ? 'border-mgsr-teal bg-mgsr-teal/10'
                    : 'border-mgsr-border hover:border-mgsr-teal/40'
                }`}
              >
                <div className="relative inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={withOriginAgent}
                    onChange={(e) => {
                      setWithOriginAgent(e.target.checked);
                      if (!e.target.checked) {
                        setOriginAgentName('');
                        setOriginAgentUseLicense(true);
                        setOriginAgentId('');
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-mgsr-border rounded-full peer peer-checked:bg-mgsr-teal transition-colors" />
                  <div className="absolute left-[2px] top-[2px] w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                </div>
                <div>
                  <p className={`font-semibold text-sm ${withOriginAgent ? 'text-mgsr-teal' : 'text-mgsr-text'}`}>{t('mandate_with_origin_agent')}</p>
                  <p className="text-xs text-mgsr-muted">{t('mandate_with_origin_agent_desc')}</p>
                </div>
              </label>

              {withOriginAgent && (
                <div className="mt-4 space-y-4">
                  {/* Agent name */}
                  <div>
                    <label className="block text-sm font-medium text-mgsr-muted mb-2">{t('mandate_origin_agent_name')}</label>
                    <input
                      type="text"
                      value={originAgentName}
                      onChange={(e) => setOriginAgentName(e.target.value)}
                      placeholder={t('mandate_origin_agent_name_hint')}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-card border-2 border-mgsr-border text-mgsr-text focus:border-mgsr-teal focus:outline-none transition-colors"
                    />
                  </div>

                  {/* ID type toggle */}
                  <div>
                    <label className="block text-sm font-medium text-mgsr-muted mb-2">{t('mandate_origin_agent_id_type')}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[true, false].map((isLicense) => (
                        <button
                          key={isLicense ? 'license' : 'passport'}
                          type="button"
                          onClick={() => {
                            setOriginAgentUseLicense(isLicense);
                            setOriginAgentId('');
                          }}
                          className={`p-3 rounded-xl border-2 text-center text-sm font-semibold transition-all ${
                            originAgentUseLicense === isLicense
                              ? 'border-mgsr-teal bg-mgsr-teal/15 text-mgsr-teal'
                              : 'border-mgsr-border text-mgsr-text hover:border-mgsr-teal/40'
                          }`}
                        >
                          {isLicense ? t('mandate_origin_fifa_license') : t('mandate_origin_passport')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ID number */}
                  <div>
                    <label className="block text-sm font-medium text-mgsr-muted mb-2">
                      {originAgentUseLicense ? t('mandate_origin_license_number') : t('mandate_origin_passport_number')}
                    </label>
                    <input
                      type="text"
                      value={originAgentId}
                      onChange={(e) => setOriginAgentId(e.target.value)}
                      placeholder={originAgentUseLicense ? 'XXXXXX-XXXX' : t('mandate_origin_passport_hint')}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-card border-2 border-mgsr-border text-mgsr-text focus:border-mgsr-teal focus:outline-none transition-colors font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-mgsr-text">{t('mandate_step_validity')}</h2>

            <div>
              <label className="block text-sm font-medium text-mgsr-muted mb-2">{t('mandate_expiry_date')}</label>
              <div className="relative rounded-xl bg-mgsr-card border-2 border-mgsr-border focus-within:border-mgsr-teal transition-colors overflow-hidden">
                <div
                  className={`absolute inset-y-0 flex items-center pointer-events-none z-10 ${isRtl ? 'right-4 left-auto' : 'left-4 right-auto'}`}
                  aria-hidden
                >
                  <svg className="w-5 h-5 text-mgsr-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className={`w-full py-3.5 bg-transparent text-mgsr-text focus:outline-none ${isRtl ? 'pl-4 pr-12 text-right' : 'pl-12 pr-4'}`}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-mgsr-muted mb-2">{t('mandate_valid_leagues')}</label>

              {/* WorldWide checkbox */}
              <label
                className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all mb-3 ${
                  isWorldWide
                    ? 'border-mgsr-teal bg-mgsr-teal/10'
                    : 'border-mgsr-border hover:border-mgsr-teal/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isWorldWide}
                  onChange={(e) => setIsWorldWide(e.target.checked)}
                  className="w-5 h-5 accent-[#39d2c0] rounded"
                />
                <div>
                  <p className={`font-semibold text-sm ${isWorldWide ? 'text-mgsr-teal' : 'text-mgsr-text'}`}>{t('mandate_worldwide')}</p>
                  <p className="text-xs text-mgsr-muted">{t('mandate_worldwide_desc')}</p>
                </div>
              </label>

              {!isWorldWide && (
                <>
              <button
                type="button"
                onClick={openModal}
                className={`w-full py-3 px-4 rounded-xl border-2 border-dashed border-mgsr-teal/50 text-mgsr-teal hover:border-mgsr-teal hover:bg-mgsr-teal/10 transition-all flex items-center justify-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}
              >
                <span className="text-lg">+</span>
                {t('mandate_add_country_league')}
              </button>

              {(countryOnly.length > 0 || selectedClubs.length > 0) && (
                <div className="mt-4 space-y-2">
                  {countryOnly.map((c) => (
                    <div
                      key={`country-${c}`}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl bg-mgsr-card border border-mgsr-border"
                    >
                      <span className="text-mgsr-text text-sm font-medium">{c}</span>
                      <button
                        type="button"
                        onClick={() => removeCountry(c)}
                        className="p-1.5 rounded-lg text-mgsr-muted hover:text-mgsr-red hover:bg-mgsr-red/10 transition-colors"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {selectedClubs.map((club) => (
                    <div
                      key={`club-${club.clubName}-${club.clubCountry}`}
                      className="flex items-center justify-between gap-2 p-3 rounded-xl bg-mgsr-card border border-mgsr-border"
                    >
                      <span className="text-mgsr-text text-sm">{club.clubName} — {club.clubCountry}</span>
                      <button
                        type="button"
                        onClick={() => removeClub(club)}
                        className="p-1.5 rounded-lg text-mgsr-muted hover:text-mgsr-red hover:bg-mgsr-red/10 transition-colors"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
                </>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-mgsr-text">{t('mandate_step_review')}</h2>
            <div className="p-6 rounded-2xl bg-mgsr-card border-2 border-mgsr-border space-y-5">
              <div>
                <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1">{t('mandate_review_player')}</p>
                <p className="text-mgsr-text font-medium">{playerName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1">{t('mandate_review_agent')}</p>
                <p className="text-mgsr-text font-medium">
                  {isRtl ? selectedAgent?.hebrewName ?? selectedAgent?.name : selectedAgent?.name ?? selectedAgent?.hebrewName ?? '—'}
                </p>
                {selectedAgent?.fifaLicenseId && (
                  <p className="text-sm text-mgsr-muted mt-0.5">{t('mandate_review_fifa_id')}: {selectedAgent.fifaLicenseId}</p>
                )}
              </div>
              {withOriginAgent && originAgentName.trim() && (
                <div>
                  <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1">{t('mandate_origin_agent_title')}</p>
                  <p className="text-mgsr-text font-medium">{originAgentName}</p>
                  <p className="text-sm text-mgsr-muted mt-0.5">
                    {originAgentUseLicense ? t('mandate_review_fifa_id') : t('mandate_origin_passport')}: {originAgentId}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1">{t('mandate_expiry_date')}</p>
                <p className="text-mgsr-text font-medium">{new Date(expiryDate).toLocaleDateString('en-GB')}</p>
              </div>
              {validLeagues.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1">{t('mandate_valid_leagues')}</p>
                  <p className="text-mgsr-text text-sm leading-relaxed">{validLeagues.join(', ')}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action buttons: primary on "end" (right in LTR, right in RTL via logical props) */}
        <div dir={dir} className={`flex gap-3 mt-8 ${isRtl ? 'justify-start flex-row-reverse' : 'justify-end'}`}>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-3 rounded-xl border-2 border-mgsr-border text-mgsr-muted hover:bg-mgsr-card hover:text-mgsr-text transition-colors"
            >
              {t('mandate_back')}
            </button>
          )}
          {step < 2 ? (
            <button
              onClick={() => {
                if (step === 0 && agentsWithFifa.length > 0 && !selectedAgent) return;
                if (step === 0 && withOriginAgent && (!originAgentName.trim() || !originAgentId.trim())) return;
                if (step === 1 && !expiryDate) return;
                setStep(step + 1);
              }}
              disabled={
                (step === 0 && agentsWithFifa.length > 0 && !selectedAgent) ||
                (step === 0 && withOriginAgent && (!originAgentName.trim() || !originAgentId.trim())) ||
                (step === 1 && !expiryDate)
              }
              className="px-6 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('mandate_next')}
            </button>
          ) : (
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={handleGenerate}
                disabled={generating || creatingSigning}
                className="px-6 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition disabled:opacity-50 flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-mgsr-dark border-t-transparent rounded-full animate-spin" />
                    {t('mandate_generating')}
                  </>
                ) : (
                  t('mandate_generate_pdf')
                )}
              </button>
              <button
                onClick={handleCreateSigning}
                disabled={generating || creatingSigning}
                className="px-6 py-3 rounded-xl border-2 border-mgsr-teal text-mgsr-teal font-semibold hover:bg-mgsr-teal/10 transition disabled:opacity-50 flex items-center gap-2"
              >
                {creatingSigning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
                    {t('mandate_creating_signing')}
                  </>
                ) : (
                  t('mandate_send_for_signing')
                )}
              </button>
            </div>
          )}
        </div>

        {/* Signing URL */}
        {signingUrl && (
          <div className="mt-4 p-4 rounded-xl bg-mgsr-teal/10 border border-mgsr-teal/30">
            <p className="text-mgsr-text text-sm font-medium mb-2">{t('mandate_signing_link_created')}</p>
            <p className="text-mgsr-muted text-xs mb-3">
              {t('mandate_signing_link_desc')}
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={signingUrl}
                className="flex-1 px-3 py-2 rounded-lg bg-mgsr-card border border-mgsr-border text-mgsr-text text-sm font-mono truncate"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(signingUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${copied ? 'bg-green-500 text-white' : 'bg-mgsr-teal text-mgsr-dark hover:bg-mgsr-teal/90'}`}
              >
                {copied ? '✓ ' + t('mandate_link_copied') : t('mandate_copy_link')}
              </button>
            </div>
            <div className="flex gap-2 mt-3">
              <a
                href={signingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-mgsr-teal text-sm hover:underline"
              >
                {t('mandate_open_signing_page')}
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Add country/league modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={closeModal}>
          <div
            dir={dir}
            className="bg-mgsr-dark border-2 border-mgsr-border rounded-2xl max-w-md w-full max-h-[90vh] overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-mgsr-border">
              <h3 className="text-lg font-semibold text-mgsr-text">{t('mandate_add_country_league')}</h3>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
              {!modalSelectedCountry ? (
                <>
                  <input
                    type="text"
                    placeholder={t('mandate_search_country')}
                    value={modalCountryQuery}
                    onChange={(e) => setModalCountryQuery(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-mgsr-card border-2 border-mgsr-border text-mgsr-text placeholder:text-mgsr-muted focus:border-mgsr-teal focus:outline-none"
                    autoFocus
                  />
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {filteredCountries.slice(0, 50).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setModalSelectedCountry(c);
                          setModalCountryQuery('');
                        }}
                        className={`w-full p-3 rounded-xl bg-mgsr-card border border-mgsr-border text-mgsr-text text-start hover:border-mgsr-teal/50 transition-colors ${isRtl ? 'text-right' : 'text-left'}`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-mgsr-teal/10 border border-mgsr-teal/30 flex items-center justify-between gap-2">
                    <span className="font-medium text-mgsr-text">{modalSelectedCountry}</span>
                    <button
                      type="button"
                      onClick={() => setModalSelectedCountry(null)}
                      className="text-sm text-mgsr-teal hover:underline"
                    >
                      {t('mandate_change_country')}
                    </button>
                  </div>

                  <label className={`flex items-center justify-between gap-3 cursor-pointer p-3 rounded-xl border-2 transition-colors ${
                    modalEntireCountry ? 'border-mgsr-teal bg-mgsr-teal/10' : 'border-mgsr-border'
                  }`}>
                    <span className="text-mgsr-text text-sm">{t('mandate_entire_country')}</span>
                    <input
                      type="checkbox"
                      checked={modalEntireCountry}
                      onChange={(e) => setModalEntireCountry(e.target.checked)}
                      className="rounded border-mgsr-border text-mgsr-teal focus:ring-mgsr-teal"
                    />
                  </label>

                  {!modalEntireCountry && (
                    <>
                      <input
                        type="text"
                        placeholder={t('mandate_sheet_search_clubs').replace('%s', modalSelectedCountry)}
                        value={modalClubQuery}
                        onChange={(e) => setModalClubQuery(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-mgsr-card border-2 border-mgsr-border text-mgsr-text placeholder:text-mgsr-muted focus:border-mgsr-teal focus:outline-none"
                      />
                      {modalSearchingClubs && (
                        <div className="flex justify-center py-2">
                          <div className="w-6 h-6 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {modalClubResults.length > 0 && (
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {modalClubResults.map((club) => (
                            <button
                              key={`${club.clubName}-${club.clubCountry}`}
                              type="button"
                              onClick={() => addClubToPending(club)}
                              className={`w-full p-3 rounded-xl bg-mgsr-card border border-mgsr-border flex items-center gap-3 hover:border-mgsr-teal/50 transition-colors ${isRtl ? 'flex-row-reverse' : ''}`}
                            >
                              {club.clubLogo && (
                                <img src={club.clubLogo} alt="" className="w-8 h-8 object-contain rounded" />
                              )}
                              <span className="text-mgsr-text text-sm flex-1 text-start">{club.clubName}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {modalPendingClubs.length > 0 && (
                        <div>
                          <p className="text-xs text-mgsr-muted mb-2">
                            {t('mandate_selected_clubs').replace('%d', String(modalPendingClubs.length))}
                          </p>
                          <div className="space-y-2">
                            {modalPendingClubs.map((club) => (
                              <div
                                key={`${club.clubName}-${club.clubCountry}`}
                                className={`flex items-center justify-between gap-2 p-3 rounded-xl bg-mgsr-card border border-mgsr-border ${isRtl ? 'flex-row-reverse' : ''}`}
                              >
                                {club.clubLogo && (
                                  <img src={club.clubLogo} alt="" className="w-6 h-6 object-contain rounded" />
                                )}
                                <span className="text-mgsr-text text-sm flex-1 text-start">{club.clubName}</span>
                                <button
                                  type="button"
                                  onClick={() => removeClubFromPending(club)}
                                  className="p-1.5 rounded-lg text-mgsr-muted hover:text-mgsr-red hover:bg-mgsr-red/10"
                                  aria-label="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
            <div className="p-5 border-t border-mgsr-border">
              <button
                type="button"
                onClick={confirmModalSelection}
                disabled={!canAddInModal}
                className="w-full py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-semibold hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('mandate_sheet_add_button')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
