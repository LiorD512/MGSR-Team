'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, collection, query, where, getDocs, onSnapshot, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getPlayerDetails, PlayerDetails } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import { parseMarketValue } from '@/lib/releases';
import { extractSalaryRange, extractFreeTransfer, type NoteModel } from '@/lib/noteParser';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

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
  const searchParams = useSearchParams();
  const id = params.id as string;
  const fromPath = searchParams.get('from') || '/players';
  const backLabelKey =
    fromPath === '/requests'
      ? 'player_info_back_requests'
      : fromPath === '/releases'
        ? 'player_info_back_releases'
        : fromPath === '/contract-finisher'
          ? 'player_info_back_contract_finisher'
          : 'player_info_back_players';
  const [player, setPlayer] = useState<Player | null>(null);
  const [liveData, setLiveData] = useState<PlayerDetails | null>(null);
  const [documents, setDocuments] = useState<PlayerDocument[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [playerLoading, setPlayerLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState<'add' | 'edit' | null>(null);
  const [editingNote, setEditingNote] = useState<NoteModel | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [deleteConfirmNote, setDeleteConfirmNote] = useState<NoteModel | null>(null);

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
      setPlayerLoading(false);
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

  const getCurrentUserName = useCallback((): string | undefined => {
    if (!user?.email) return undefined;
    const account = accounts.find(
      (a) => a.email?.toLowerCase() === user.email?.toLowerCase()
    );
    return isRtl ? (account?.hebrewName ?? account?.name) : (account?.name ?? account?.hebrewName);
  }, [user?.email, accounts, isRtl]);

  const applyNoteListUpdate = useCallback(
    async (newNoteList: NoteModel[]) => {
      if (!player || !id) return;
      const salaryRange = extractSalaryRange(newNoteList) ?? player.salaryRange;
      const isFree = extractFreeTransfer(newNoteList);
      const transferFee = isFree ? 'Free/Free loan' : player.transferFee;
      const playerRef = doc(db, 'Players', id);
      const updateData: Record<string, unknown> = { noteList: newNoteList };
      if (salaryRange !== undefined) updateData.salaryRange = salaryRange;
      if (transferFee !== undefined) updateData.transferFee = transferFee;
      await updateDoc(playerRef, updateData);
    },
    [player, id]
  );

  const handleAddNote = useCallback(
    async (text: string) => {
      if (!text.trim() || !player) return;
      setNoteSaving(true);
      try {
        const createdBy = getCurrentUserName() ?? '';
        const currentNotes = player.noteList ?? [];
        const newNote: NoteModel = {
          notes: text.trim(),
          createBy: createdBy,
          createdAt: Date.now(),
        };
        const newNoteList = [...currentNotes, newNote];
        await applyNoteListUpdate(newNoteList);
        const notePreview = text.trim().slice(0, 120) + (text.length > 120 ? '…' : '');
        await addDoc(collection(db, 'FeedEvents'), {
          type: 'NOTE_ADDED',
          playerName: player.fullName,
          playerImage: player.profileImage,
          playerTmProfile: player.tmProfile,
          agentName: createdBy,
          extraInfo: notePreview,
          timestamp: Date.now(),
        });
        setNoteModalOpen(null);
        setNoteDraft('');
      } finally {
        setNoteSaving(false);
      }
    },
    [player, getCurrentUserName, applyNoteListUpdate]
  );

  const handleEditNote = useCallback(
    async (text: string) => {
      if (!text.trim() || !player || !editingNote) return;
      setNoteSaving(true);
      try {
        const currentNotes = player.noteList ?? [];
        const idx = currentNotes.findIndex(
          (n) =>
            n.notes === editingNote.notes &&
            n.createBy === editingNote.createBy &&
            n.createdAt === editingNote.createdAt
        );
        if (idx < 0) return;
        const newNoteList = [...currentNotes];
        newNoteList[idx] = { ...editingNote, notes: text.trim() };
        await applyNoteListUpdate(newNoteList);
        setNoteModalOpen(null);
        setEditingNote(null);
        setNoteDraft('');
      } finally {
        setNoteSaving(false);
      }
    },
    [player, editingNote, applyNoteListUpdate]
  );

  const handleDeleteNote = useCallback(
    async (note: NoteModel) => {
      if (!player) return;
      setNoteSaving(true);
      try {
        const deletedBy = getCurrentUserName() ?? '';
        const currentNotes = player.noteList ?? [];
        const newNoteList = currentNotes.filter(
          (n) =>
            !(n.notes === note.notes && n.createBy === note.createBy && n.createdAt === note.createdAt)
        );
        await applyNoteListUpdate(newNoteList);
        const notePreview = (note.notes ?? '').slice(0, 120) + ((note.notes?.length ?? 0) > 120 ? '…' : '');
        await addDoc(collection(db, 'FeedEvents'), {
          type: 'NOTE_DELETED',
          playerName: player.fullName,
          playerImage: player.profileImage,
          playerTmProfile: player.tmProfile,
          agentName: deletedBy,
          extraInfo: notePreview,
          timestamp: Date.now(),
        });
        setDeleteConfirmNote(null);
      } finally {
        setNoteSaving(false);
      }
    },
    [player, getCurrentUserName, applyNoteListUpdate]
  );

  const displayName = isRtl && player?.fullNameHe ? player.fullNameHe : (merged.fullName || 'Unknown');

  const valueChartData = useMemo(() => {
    const raw = player?.marketValueHistory || [];
    const locale = isRtl ? 'he-IL' : 'en-US';
    let points = raw
      .filter((e) => e.value && e.date)
      .map((e) => ({
        date: e.date!,
        dateLabel: new Date(e.date!).toLocaleDateString(locale, {
          month: 'short',
          year: '2-digit',
          day: 'numeric',
        }),
        value: e.value!,
        valueNum: parseMarketValue(e.value),
      }))
      .sort((a, b) => a.date - b.date);
    const currentValue = merged.marketValue || player?.marketValue;
    if (currentValue && points.length > 0) {
      const lastPoint = points[points.length - 1];
      if (lastPoint.value !== currentValue) {
        points = [...points, {
          date: Date.now(),
          dateLabel: new Date().toLocaleDateString(locale, { month: 'short', year: '2-digit', day: 'numeric' }),
          value: currentValue,
          valueNum: parseMarketValue(currentValue),
        }];
      }
    } else if (currentValue && points.length === 0) {
      points = [{
        date: Date.now(),
        dateLabel: new Date().toLocaleDateString(locale, { month: 'short', year: '2-digit', day: 'numeric' }),
        value: currentValue,
        valueNum: parseMarketValue(currentValue),
      }];
    }
    return points;
  }, [player?.marketValueHistory, player?.marketValue, merged.marketValue, isRtl]);

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
            href={fromPath}
            className="inline-flex items-center gap-2 text-mgsr-teal hover:underline"
          >
            <span className={isRtl ? 'rotate-180' : ''}>←</span>
            {t(backLabelKey)}
          </Link>
        </div>
      </AppLayout>
    );
  }

  const notes = player.noteList || [];
  const sortedNotes = [...notes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-5xl mx-auto">
        {/* Back + actions */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href={fromPath}
            className="inline-flex items-center gap-2 text-mgsr-teal hover:underline"
          >
            <span className={isRtl ? 'rotate-180' : ''}>←</span>
            {t(backLabelKey)}
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
          <StatCard
            label={t('player_info_transfer_fee')}
            value={
              player.transferFee?.toLowerCase() === 'free/free loan'
                ? t('requests_fee_free_loan')
                : player.transferFee
            }
          />
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
                        href={toWhatsAppUrl(getAgentPhone()) ?? `tel:${getAgentPhone()}`}
                        target="_blank"
                        rel="noopener noreferrer"
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
                        href={toWhatsAppUrl(getPhone()) ?? `tel:${getPhone()}`}
                        target="_blank"
                        rel="noopener noreferrer"
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
            {/* Market value trend */}
            {valueChartData.length > 0 && (
              <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
                <h2 className="text-lg font-display font-semibold text-mgsr-text mb-4">
                  {t('player_info_value_history')}
                </h2>
                <div className="h-48 md:h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={valueChartData} margin={{ left: 8, right: 8, top: 8, bottom: 24 }}>
                      <defs>
                        <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4DB6AC" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#4DB6AC" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#253545" vertical={false} />
                      <XAxis
                        dataKey="dateLabel"
                        stroke="#8C999B"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#E8EAED' }}
                      />
                      <YAxis
                        stroke="#8C999B"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => {
                          if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}m`;
                          if (v >= 1_000) return `€${(v / 1_000).toFixed(0)}k`;
                          return `€${v}`;
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1A2736',
                          border: '1px solid #253545',
                          borderRadius: '12px',
                          padding: '10px 14px',
                        }}
                        formatter={(value: number | undefined, _name: unknown, props: unknown) => {
                          const payload = (props as { payload?: { value?: string } })?.payload;
                          const display = payload?.value ?? (value != null
                            ? (value >= 1_000_000 ? `€${(value / 1_000_000).toFixed(1)}m` : value >= 1_000 ? `€${(value / 1_000).toFixed(0)}k` : `€${value}`)
                            : '—');
                          return [display, t('players_value')];
                        }}
                        labelFormatter={(label) => label}
                      />
                      <Area
                        type="monotone"
                        dataKey="valueNum"
                        stroke="#4DB6AC"
                        strokeWidth={2}
                        fill="url(#valueGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h2 className="text-lg font-display font-semibold text-mgsr-text">
                  {t('player_info_notes')}
                </h2>
                <button
                  onClick={() => {
                    setEditingNote(null);
                    setNoteDraft('');
                    setNoteModalOpen('add');
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 transition font-medium text-sm shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('player_info_add_note')}
                </button>
              </div>
              {sortedNotes.length === 0 && !player.notes ? (
                <div
                  onClick={() => {
                    setEditingNote(null);
                    setNoteDraft('');
                    setNoteModalOpen('add');
                  }}
                  className="p-8 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center text-mgsr-muted cursor-pointer hover:border-mgsr-teal/30 hover:bg-mgsr-card/70 transition"
                >
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
                      className="group flex flex-col sm:flex-row sm:items-start gap-3 p-5 bg-mgsr-card border border-mgsr-border rounded-xl animate-fade-in"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-mgsr-text whitespace-pre-wrap">{n.notes}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-mgsr-muted">
                          {n.createBy && (
                            <span>{t('note_written_by')}: {resolveAgentName(n.createBy)}</span>
                          )}
                          {n.createdAt && (
                            <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setEditingNote(n);
                            setNoteDraft(n.notes ?? '');
                            setNoteModalOpen('edit');
                          }}
                          className="p-2 rounded-lg text-mgsr-muted hover:text-mgsr-teal hover:bg-mgsr-teal/10 transition"
                          title={t('player_info_edit_note')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteConfirmNote(n)}
                          className="p-2 rounded-lg text-mgsr-muted hover:text-red-400 hover:bg-red-400/10 transition"
                          title={t('player_info_delete_note')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Note Add/Edit Modal */}
      {noteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => !noteSaving && setNoteModalOpen(null)}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="relative w-full sm:max-w-lg bg-mgsr-card border border-mgsr-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-display font-semibold text-mgsr-text mb-4">
              {noteModalOpen === 'add' ? t('player_info_add_note') : t('player_info_edit_note')}
            </h3>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder={t('player_info_note_placeholder')}
              rows={5}
              className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-mgsr-teal/60 resize-none"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => {
                  setNoteModalOpen(null);
                  setEditingNote(null);
                  setNoteDraft('');
                }}
                disabled={noteSaving}
                className="flex-1 px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-mgsr-card/80 transition disabled:opacity-50"
              >
                {t('player_info_note_cancel')}
              </button>
              <button
                onClick={() =>
                  noteModalOpen === 'add'
                    ? handleAddNote(noteDraft)
                    : handleEditNote(noteDraft)
                }
                disabled={noteSaving || !noteDraft.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-medium hover:bg-mgsr-teal/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {noteSaving ? '...' : t('player_info_note_save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Note Confirmation */}
      {deleteConfirmNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => !noteSaving && setDeleteConfirmNote(null)}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="relative w-full max-w-sm bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-mgsr-text mb-6">{t('player_info_delete_note_confirm')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmNote(null)}
                disabled={noteSaving}
                className="flex-1 px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-mgsr-card/80 transition disabled:opacity-50"
              >
                {t('player_info_note_cancel')}
              </button>
              <button
                onClick={() => handleDeleteNote(deleteConfirmNote)}
                disabled={noteSaving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition disabled:opacity-50"
              >
                {noteSaving ? '...' : t('player_info_delete_note')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
