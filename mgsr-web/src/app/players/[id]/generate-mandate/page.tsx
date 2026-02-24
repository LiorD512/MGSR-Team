'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { COUNTRIES } from '@/lib/countries';

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
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agentsWithFifa = accounts.filter((a) => a.fifaLicenseId?.trim());

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

  const validLeagues = [...selectedCountries].sort();

  const handleGenerate = useCallback(async () => {
    if (!player?.passportDetails || validLeagues.length === 0) return;
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
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Generation failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Mandate_${[player.passportDetails.firstName, player.passportDetails.lastName].filter(Boolean).join('_') || 'player'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      router.push(`/players/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [player, selectedAgent, expiryDate, validLeagues, currentUser, id, router]);

  const toggleCountry = (c: string) => {
    setSelectedCountries((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c].sort()
    );
  };

  const filteredCountries = COUNTRIES.filter((c) =>
    c.toLowerCase().includes(countryFilter.toLowerCase())
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
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-2xl mx-auto py-8">
        <Link
          href={`/players/${id}`}
          className="inline-flex items-center gap-2 text-mgsr-teal hover:underline mb-8"
        >
          <span className={isRtl ? 'rotate-180' : ''}>←</span>
          {t('player_info_back_players')}
        </Link>

        <h1 className="text-2xl font-display font-bold text-mgsr-text mb-2">
          {t('player_info_generate_mandate')}
        </h1>
        <p className="text-mgsr-muted mb-8">{playerName}</p>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-mgsr-teal' : 'bg-mgsr-border'}`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-mgsr-red/20 text-mgsr-red text-sm">{error}</div>
        )}

        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-mgsr-text">{t('mandate_step_agent')}</h2>
            {agentsWithFifa.length === 0 ? (
              <p className="text-mgsr-muted">{t('mandate_no_agents_fifa')}</p>
            ) : (
              <div className="space-y-2">
                {agentsWithFifa.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgent(a)}
                    className={`w-full p-4 rounded-xl border text-left transition ${
                      selectedAgent?.id === a.id
                        ? 'border-mgsr-teal bg-mgsr-teal/10'
                        : 'border-mgsr-border hover:border-mgsr-teal/50'
                    }`}
                  >
                    <p className="font-medium text-mgsr-text">
                      {isRtl ? a.hebrewName ?? a.name : a.name ?? a.hebrewName}
                    </p>
                    {a.fifaLicenseId && (
                      <p className="text-sm text-mgsr-muted mt-0.5">
                        {t('mandate_fifa_license')}: {a.fifaLicenseId}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-mgsr-text">{t('mandate_step_validity')}</h2>
            <div>
              <label className="block text-sm text-mgsr-muted mb-2">{t('mandate_expiry_date')}</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text"
              />
            </div>
            <div>
              <label className="block text-sm text-mgsr-muted mb-2">{t('mandate_valid_leagues')}</label>
              <input
                type="text"
                placeholder={t('mandate_search_country')}
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text mb-3"
              />
              <div className="max-h-48 overflow-y-auto space-y-2 border border-mgsr-border rounded-xl p-3">
                {filteredCountries.map((c) => (
                  <label key={c} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCountries.includes(c)}
                      onChange={() => toggleCountry(c)}
                      className="rounded border-mgsr-border"
                    />
                    <span className="text-mgsr-text text-sm">{c}</span>
                  </label>
                ))}
              </div>
              {selectedCountries.length > 0 && (
                <p className="text-sm text-mgsr-muted mt-2">
                  {t('mandate_selected')}: {selectedCountries.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-mgsr-text">{t('mandate_step_review')}</h2>
            <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border space-y-4">
              <div>
                <p className="text-xs text-mgsr-muted uppercase">{t('mandate_review_player')}</p>
                <p className="text-mgsr-text font-medium">{playerName}</p>
              </div>
              <div>
                <p className="text-xs text-mgsr-muted uppercase">{t('mandate_review_agent')}</p>
                <p className="text-mgsr-text font-medium">
                  {isRtl ? selectedAgent?.hebrewName ?? selectedAgent?.name : selectedAgent?.name ?? selectedAgent?.hebrewName ?? '—'}
                </p>
                {selectedAgent?.fifaLicenseId && (
                  <p className="text-sm text-mgsr-muted">{t('mandate_review_fifa_id')}: {selectedAgent.fifaLicenseId}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-mgsr-muted uppercase">{t('mandate_expiry_date')}</p>
                <p className="text-mgsr-text font-medium">{new Date(expiryDate).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-xs text-mgsr-muted uppercase">{t('mandate_valid_leagues')}</p>
                <p className="text-mgsr-text text-sm">{validLeagues.join(', ')}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-3 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-mgsr-card transition"
            >
              {t('mandate_back')}
            </button>
          )}
          <div className="flex-1" />
          {step < 2 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 0 && agentsWithFifa.length > 0 && !selectedAgent) ||
                (step === 1 && (!expiryDate || selectedCountries.length === 0))
              }
              className="px-6 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-medium hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('mandate_next')}
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={generating || validLeagues.length === 0}
              className="px-6 py-3 rounded-xl bg-mgsr-teal text-mgsr-dark font-medium hover:bg-mgsr-teal/90 transition disabled:opacity-50 flex items-center gap-2"
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
          )}
        </div>
      </div>
    </AppLayout>
  );
}
