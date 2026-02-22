'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPlayerDetails, PlayerDetails } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';

interface Player {
  id: string;
  fullName?: string;
  fullNameHe?: string;
  profileImage?: string;
  positions?: string[];
  marketValue?: string;
  currentClub?: { clubName?: string; clubLogo?: string; clubTmProfile?: string; clubCountry?: string };
  age?: string;
  height?: string;
  nationality?: string;
  nationalityFlag?: string;
  contractExpired?: string;
  tmProfile?: string;
  notes?: string;
  noteList?: { notes?: string; createBy?: string; createdAt?: number }[];
  agentInChargeName?: string;
  agentInChargeId?: string;
  haveMandate?: boolean;
  playerPhoneNumber?: string;
  agentPhoneNumber?: string;
  playerAdditionalInfoModel?: { playerNumber?: string; agentNumber?: string };
  marketValueHistory?: { value?: string; date?: number }[];
  salaryRange?: string;
  transferFee?: string;
  isOnLoan?: boolean;
  onLoanFromClub?: string;
  foot?: string;
  agency?: string;
  agencyUrl?: string;
}

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
}

interface PlayerDocument {
  id: string;
  playerTmProfile?: string;
  type?: string;
  name?: string;
  storageUrl?: string;
  uploadedAt?: number;
  expiresAt?: number;
  expired?: boolean;
  uploadedBy?: string;
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | undefined;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={`px-4 py-3 rounded-xl border ${highlight ? 'bg-mgsr-teal/10 border-mgsr-teal/30' : 'bg-mgsr-card/50 border-mgsr-border'}`}>
      <p className="text-xs text-mgsr-muted uppercase tracking-wider">{label}</p>
      <p className={`font-semibold mt-0.5 ${highlight ? 'text-mgsr-teal text-lg' : 'text-mgsr-text'}`}>
        {value}
      </p>
    </div>
  );
}

export default function PlayerInfoPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [player, setPlayer] = useState<Player | null>(null);
  const [liveData, setLiveData] = useState<PlayerDetails | null>(null);
  const [documents, setDocuments] = useState<PlayerDocument[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [playerLoading, setPlayerLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, 'Players', id)).then((snap) => {
      if (snap.exists()) {
        setPlayer({ id: snap.id, ...snap.data() } as Player);
      } else {
        setPlayer(null);
      }
      setPlayerLoading(false);
    });
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Accounts'), (snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!player?.tmProfile) return;
    getDocs(
      query(
        collection(db, 'PlayerDocuments'),
        where('playerTmProfile', '==', player.tmProfile)
      )
    ).then((snap) => {
      setDocuments(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlayerDocument))
      );
    });
  }, [player?.tmProfile]);

  const refreshFromTransfermarkt = async () => {
    if (!player?.tmProfile) return;
    setRefreshing(true);
    try {
      const details = await getPlayerDetails(player.tmProfile);
      setLiveData(details);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!player?.tmProfile) return;
    let cancelled = false;
    getPlayerDetails(player.tmProfile)
      .then((d) => !cancelled && setLiveData(d))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [player?.tmProfile]);

  const merged = {
    ...player,
    marketValue: liveData?.marketValue ?? player?.marketValue,
    currentClub: liveData?.currentClub ?? player?.currentClub,
    profileImage: player?.profileImage ?? liveData?.profileImage,
    age: player?.age ?? liveData?.age,
    height: player?.height ?? liveData?.height,
    nationality: player?.nationality ?? liveData?.nationality,
    nationalityFlag: player?.nationalityFlag ?? liveData?.nationalityFlag,
    contractExpired: player?.contractExpired ?? liveData?.contractExpires,
    positions: player?.positions ?? liveData?.positions,
    foot: player?.foot ?? liveData?.foot,
  };

  const getPhone = () =>
    player?.playerAdditionalInfoModel?.playerNumber ||
    player?.playerPhoneNumber;
  const getAgentPhone = () =>
    player?.playerAdditionalInfoModel?.agentNumber ||
    player?.agentPhoneNumber;

  const translateFoot = (foot: string | undefined): string | undefined => {
    if (!foot) return undefined;
    const lower = foot.toLowerCase();
    if (lower.startsWith('left') || lower === 'l') return t('player_info_foot_left');
    if (lower.startsWith('right') || lower === 'r') return t('player_info_foot_right');
    if (lower.startsWith('both')) return t('player_info_foot_both');
    return foot;
  };

  const resolveAgentName = (name: string | undefined, agentId?: string): string => {
    if (!name) return '—';
    if (!isRtl) return name;
    const account = accounts.find(
      (a) => a.id === agentId || a.name?.toLowerCase() === name.toLowerCase() || a.hebrewName?.toLowerCase() === name.toLowerCase()
    );
    return account?.hebrewName || name;
  };

  const displayName = isRtl && player?.fullNameHe ? player.fullNameHe : (merged.fullName || 'Unknown');

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-mgsr-teal font-display">{t('loading')}</div>
      </div>
    );
  }

  if (playerLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-mgsr-muted">{t('players_loading')}</div>
        </div>
      </AppLayout>
    );
  }

  if (!player) {
    return (
      <AppLayout>
        <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto text-center py-20">
          <p className="text-mgsr-muted text-lg mb-6">{t('player_info_not_found')}</p>
          <Link
            href="/players"
            className="inline-flex items-center gap-2 text-mgsr-teal hover:underline"
          >
            <span className={isRtl ? 'rotate-180' : ''}>←</span>
            {t('player_info_back')}
          </Link>
        </div>
      </AppLayout>
    );
  }

  const notes = player.noteList || [];
  const sortedNotes = [...notes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const valueHistory = (player.marketValueHistory || []).slice(0, 6);

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-5xl mx-auto">
        {/* Back + actions */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/players"
            className="inline-flex items-center gap-2 text-mgsr-teal hover:underline"
          >
            <span className={isRtl ? 'rotate-180' : ''}>←</span>
            {t('player_info_back')}
          </Link>
          <div className="flex items-center gap-3">
            {player.tmProfile && (
              <>
                <button
                  onClick={refreshFromTransfermarkt}
                  disabled={refreshing}
                  className="text-sm text-mgsr-muted hover:text-mgsr-teal transition disabled:opacity-50"
                >
                  {refreshing ? '...' : t('player_info_refresh')}
                </button>
                <a
                  href={player.tmProfile}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm px-3 py-1.5 rounded-lg bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 transition"
                >
                  {t('player_info_view_on_tm')}
                </a>
              </>
            )}
          </div>
        </div>

        {/* Hero - full width dramatic */}
        <div className="relative overflow-hidden rounded-2xl mb-8">
          <div className="absolute inset-0 bg-gradient-to-br from-mgsr-card via-mgsr-card to-mgsr-dark" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(77,182,172,0.15)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(77,182,172,0.08)_0%,transparent_40%)]" />
          <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-8 p-8 sm:p-10">
            <div className="relative shrink-0">
              <img
                src={merged.profileImage || 'https://via.placeholder.com/160'}
                alt=""
                className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl object-cover bg-mgsr-dark ring-4 ring-mgsr-border shadow-2xl"
              />
              {merged.nationalityFlag && (
                <img
                  src={merged.nationalityFlag}
                  alt=""
                  className="absolute -bottom-2 -right-2 w-8 h-6 rounded object-cover border-2 border-mgsr-dark shadow"
                />
              )}
            </div>
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h1 className="text-3xl sm:text-4xl font-display font-bold text-mgsr-text tracking-tight">
                {displayName}
              </h1>
              <p className="text-mgsr-muted mt-2 text-lg">
                {merged.positions?.filter(Boolean).join(' • ') || '—'}
              </p>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-4">
                {merged.currentClub?.clubName && (
                  <div className="flex items-center gap-2">
                    {merged.currentClub.clubLogo && (
                      <img
                        src={merged.currentClub.clubLogo}
                        alt=""
                        className="w-6 h-6 rounded object-cover"
                      />
                    )}
                    <span className="text-mgsr-text font-medium">
                      {merged.currentClub.clubName}
                    </span>
                    {merged.currentClub.clubCountry && (
                      <span className="text-mgsr-muted text-sm">
                        • {merged.currentClub.clubCountry}
                      </span>
                    )}
                  </div>
                )}
                {merged.isOnLoan && merged.onLoanFromClub && (
                  <span className="text-amber-400 text-sm">
                    {t('player_info_on_loan')}: {merged.onLoanFromClub}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0">
              <p className="text-2xl sm:text-3xl font-display font-bold text-mgsr-teal">
                {merged.marketValue || '—'}
              </p>
              <p className="text-xs text-mgsr-muted mt-0.5">{t('players_value')}</p>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
          <StatCard label={t('player_info_age')} value={merged.age} />
          <StatCard label={t('player_info_height')} value={merged.height} />
          <StatCard label={t('player_info_nationality')} value={merged.nationality} />
          <StatCard label={t('player_info_foot')} value={translateFoot(merged.foot)} />
          <StatCard label={t('player_info_contract')} value={merged.contractExpired} />
          <StatCard label={t('player_info_salary')} value={player.salaryRange} />
          <StatCard label={t('player_info_transfer_fee')} value={player.transferFee} />
        </div>

        {/* Two-column content */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column - Club, Contact, Mandate, Agency */}
          <div className="lg:col-span-1 space-y-6">
            {/* Club card */}
            {merged.currentClub && (
              <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
                <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
                  {t('player_info_club')}
                </h3>
                <div className="flex items-center gap-3">
                  {merged.currentClub.clubLogo && (
                    <img
                      src={merged.currentClub.clubLogo}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover bg-mgsr-dark"
                    />
                  )}
                  <div>
                    <p className="font-semibold text-mgsr-text">{merged.currentClub.clubName}</p>
                    {merged.currentClub.clubCountry && (
                      <p className="text-sm text-mgsr-muted">{merged.currentClub.clubCountry}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Added by */}
            {player.agentInChargeName && (
              <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
                <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
                  {t('player_info_added_by')}
                </h3>
                <p className="text-mgsr-text">{resolveAgentName(player.agentInChargeName, player.agentInChargeId)}</p>
              </div>
            )}

            {/* Contact - agent phone + player phone only */}
            {(getPhone() || getAgentPhone()) && (
              <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
                <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
                  {t('player_info_contact')}
                </h3>
                <div className="space-y-2">
                  {getAgentPhone() && (
                    <div>
                      <p className="text-xs text-mgsr-muted">{t('player_info_agent_phone')}</p>
                      <a
                        href={`tel:${getAgentPhone()}`}
                        className="text-mgsr-teal hover:underline inline-block"
                        dir="ltr"
                      >
                        {getAgentPhone()}
                      </a>
                    </div>
                  )}
                  {getPhone() && (
                    <div>
                      <p className="text-xs text-mgsr-muted">{t('player_info_player_phone')}</p>
                      <a
                        href={`tel:${getPhone()}`}
                        className="text-mgsr-teal hover:underline inline-block"
                        dir="ltr"
                      >
                        {getPhone()}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mandate */}
            {player.haveMandate !== undefined && (
              <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
                <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
                  {t('player_info_mandate')}
                </h3>
                <span
                  className={`inline-block px-3 py-1 rounded-lg text-sm font-medium ${
                    player.haveMandate
                      ? 'bg-mgsr-teal/20 text-mgsr-teal'
                      : 'bg-mgsr-muted/20 text-mgsr-muted'
                  }`}
                >
                  {player.haveMandate ? t('player_info_mandate_active') : t('player_info_mandate_inactive')}
                </span>
              </div>
            )}

            {/* Agency */}
            {(player.agency || player.agencyUrl) && (
              <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
                <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
                  {t('player_info_agency')}
                </h3>
                {player.agencyUrl ? (
                  <a
                    href={player.agencyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-mgsr-teal hover:underline"
                  >
                    {player.agency || player.agencyUrl}
                  </a>
                ) : (
                  <p className="text-mgsr-text">{player.agency}</p>
                )}
              </div>
            )}

            {/* Documents */}
            {documents.length > 0 && (
              <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
                <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
                  {t('player_info_documents')}
                </h3>
                <div className="space-y-2">
                  {documents.map((d) => (
                    <a
                      key={d.id}
                      href={d.storageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between py-2 border-b border-mgsr-border last:border-0 text-sm text-mgsr-teal hover:underline"
                    >
                      {d.name || d.type || 'Document'}
                      {d.expired && (
                        <span className="text-mgsr-red text-xs">{t('player_info_doc_expired')}</span>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column - Value history + Notes */}
          <div className="lg:col-span-2 space-y-8">
            {/* Value history */}
            {valueHistory.length > 0 && (
              <div>
                <h2 className="text-lg font-display font-semibold text-mgsr-text mb-4">
                  {t('player_info_value_history')}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {valueHistory.map((entry, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 rounded-lg bg-mgsr-card border border-mgsr-border text-sm"
                    >
                      <span className="text-mgsr-teal font-medium">{entry.value}</span>
                      {entry.date && (
                        <span className="text-mgsr-muted text-xs ml-2">
                          {new Date(entry.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <h2 className="text-lg font-display font-semibold text-mgsr-text mb-4">
                {t('player_info_notes')}
              </h2>
              {sortedNotes.length === 0 && !player.notes ? (
                <div className="p-8 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center text-mgsr-muted">
                  {t('player_info_no_notes')}
                </div>
              ) : (
                <div className="space-y-4">
                  {player.notes && (
                    <div className="p-5 bg-mgsr-card border border-mgsr-border rounded-xl">
                      <p className="text-mgsr-text whitespace-pre-wrap">{player.notes}</p>
                    </div>
                  )}
                  {sortedNotes.map((n, i) => (
                    <div
                      key={i}
                      className="p-5 bg-mgsr-card border border-mgsr-border rounded-xl animate-fade-in"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <p className="text-mgsr-text whitespace-pre-wrap">{n.notes}</p>
                      <div className="flex items-center gap-2 mt-3 text-xs text-mgsr-muted">
                        {n.createBy && <span>{t('note_written_by')}: {resolveAgentName(n.createBy)}</span>}
                        {n.createdAt && (
                          <span>
                            {new Date(n.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
