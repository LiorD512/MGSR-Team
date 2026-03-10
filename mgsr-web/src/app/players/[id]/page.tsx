'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { doc, collection, query, where, onSnapshot, updateDoc, addDoc, getDocs, setDoc, deleteDoc, deleteField } from 'firebase/firestore';
import AddPlayerTaskModal from '@/components/AddPlayerTaskModal';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { getPlayerDetails, PlayerDetails } from '@/lib/api';
import AppLayout from '@/components/AppLayout';
import Link from 'next/link';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import { createShare } from '@/lib/shareApi';
import type { HighlightVideo } from '@/lib/highlightsApi';
import { parseMarketValue } from '@/lib/releases';
import { extractSalaryRange, extractFreeTransfer, type NoteModel } from '@/lib/noteParser';
import { flattenPdf } from '@/lib/pdfFlatten';
import FmIntelligencePanel from '@/components/FmIntelligencePanel';
import SimilarPlayersPanel from '@/components/SimilarPlayersPanel';
import PlayerHighlightsPanel from '@/components/PlayerHighlightsPanel';
import MatchingRequestsSection from '@/components/MatchingRequestsSection';
import ProposalHistorySection, { type ProposalOffer } from '@/components/ProposalHistorySection';
import { matchingRequestsForPlayer, type RosterPlayer, type ClubRequest } from '@/lib/requestMatcher';
import { useEuCountries, isEuNational } from '@/hooks/useEuCountries';
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
  nationalities?: string[];
  nationalityFlags?: string[];
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
  passportDetails?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    passportNumber?: string;
    nationality?: string;
    lastUpdatedAt?: number;
  };
  pinnedHighlights?: HighlightVideo[];
}

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
  fifaLicenseId?: string;
  phone?: string;
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
    <div className={`shrink-0 min-w-[120px] lg:min-w-0 px-4 py-3 rounded-xl border ${highlight ? 'bg-mgsr-teal/10 border-mgsr-teal/30' : 'bg-mgsr-card/50 border-mgsr-border'}`}>
      <p className="text-xs text-mgsr-muted uppercase tracking-wider whitespace-nowrap">{label}</p>
      <p className={`font-semibold mt-0.5 whitespace-nowrap ${highlight ? 'text-mgsr-teal text-lg' : 'text-mgsr-text'}`}>
        {value}
      </p>
    </div>
  );
}

const SALARY_OPTIONS = ['>5', '6-10', '11-15', '16-20', '20-25', '26-30', '30+'];
const FEE_OPTIONS = ['Free/Free loan', '<200', '300-600', '700-900', '1m+'];

function SalaryTransferFeeModal({
  currentSalaryRange,
  currentTransferFee,
  onDismiss,
  onSave,
  onClear,
  t,
}: {
  currentSalaryRange: string | null;
  currentTransferFee: string | null;
  onDismiss: () => void;
  onSave: (salary: string | null, fee: string | null) => void;
  onClear: () => void;
  t: (key: string) => string;
}) {
  const [selectedSalary, setSelectedSalary] = useState(currentSalaryRange);
  const [selectedFee, setSelectedFee] = useState(currentTransferFee);
  const hasCurrent = !!(currentSalaryRange || currentTransferFee);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onDismiss}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div
        className="relative w-full sm:max-w-md bg-mgsr-card border border-mgsr-border rounded-t-2xl sm:rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-mgsr-text">{t('player_info_salary_fee_title')}</h3>
          <button
            onClick={onDismiss}
            className="text-mgsr-muted hover:text-mgsr-text transition p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="h-px bg-mgsr-border mb-5" />

        {/* Salary range */}
        <p className="text-sm text-mgsr-muted mb-2.5">{t('player_info_salary')}</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {SALARY_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSelectedSalary(selectedSalary === opt ? null : opt)}
              className={`px-3.5 py-2 rounded-full text-sm border transition-all ${
                selectedSalary === opt
                  ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal font-medium'
                  : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted hover:border-mgsr-muted/50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {/* Transfer fee */}
        <p className="text-sm text-mgsr-muted mb-2.5">{t('player_info_transfer_fee')}</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {FEE_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSelectedFee(selectedFee === opt ? null : opt)}
              className={`px-3.5 py-2 rounded-full text-sm border transition-all ${
                selectedFee === opt
                  ? 'bg-mgsr-teal/20 border-mgsr-teal text-mgsr-teal font-medium'
                  : 'bg-mgsr-dark/50 border-mgsr-border text-mgsr-muted hover:border-mgsr-muted/50'
              }`}
            >
              {opt === 'Free/Free loan' ? t('requests_fee_free_loan') : opt}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {hasCurrent && (
            <button
              onClick={onClear}
              className="px-4 py-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition text-sm"
            >
              {t('player_info_salary_fee_clear')}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="flex-1 px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-mgsr-card/80 transition text-sm"
          >
            {t('common_cancel')}
          </button>
          <button
            onClick={() => onSave(selectedSalary ?? null, selectedFee ?? null)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-mgsr-teal text-white font-medium hover:bg-mgsr-teal/90 transition text-sm"
          >
            {t('player_info_salary_fee_save')}
          </button>
        </div>
      </div>
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
  const euCountries = useEuCountries();
  const fromPath = searchParams.get('from') || '/players';
  const scrollTo = searchParams.get('scrollTo');
  const isFromDashboard = fromPath === '/dashboard';
  const backHref = isFromDashboard && scrollTo
    ? `/dashboard?scrollTo=${encodeURIComponent(scrollTo)}`
    : fromPath;
  const backLabelKey =
    fromPath === '/requests'
      ? 'player_info_back_requests'
      : fromPath === '/releases'
        ? 'player_info_back_releases'
        : fromPath === '/contract-finisher'
          ? 'player_info_back_contract_finisher'
          : fromPath === '/shadow-teams'
            ? 'player_info_back_shadow_teams'
            : fromPath === '/tasks'
              ? 'player_info_back_tasks'
              : fromPath === '/dashboard'
                ? 'player_info_back_dashboard'
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
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<PlayerDocument | null>(null);
  const [mandateToggling, setMandateToggling] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [playerTasks, setPlayerTasks] = useState<{ id: string; title?: string; notes?: string; dueDate?: number; isCompleted?: boolean; agentId?: string; agentName?: string; createdAt?: number; createdByAgentId?: string; createdByAgentName?: string; templateId?: string; linkedAgentContactId?: string; linkedAgentContactName?: string; linkedAgentContactPhone?: string }[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [showShareSetupModal, setShowShareSetupModal] = useState(false);
  const [showShareLanguageModal, setShowShareLanguageModal] = useState(false);
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);
  const [addingToPortfolio, setAddingToPortfolio] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [editingPhoneType, setEditingPhoneType] = useState<'agent' | 'player' | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);
  const [confirmDeletePhone, setConfirmDeletePhone] = useState<'agent' | 'player' | null>(null);
  const [showPortfolioLanguageModal, setShowPortfolioLanguageModal] = useState(false);
  const [showSalaryFeeModal, setShowSalaryFeeModal] = useState(false);
  const [clubRequests, setClubRequests] = useState<(ClubRequest & { status?: string; clubName?: string; clubLogo?: string; clubCountry?: string; contactPhoneNumber?: string })[]>([]);
  const [playerOffers, setPlayerOffers] = useState<{ id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string; [key: string]: unknown }[]>([]);
  const prevValidMandateCountRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!player?.tmProfile || !id) return;
    const q = query(
      collection(db, 'PlayerDocuments'),
      where('playerTmProfile', '==', player.tmProfile)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as PlayerDocument))
        .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
      setDocuments(docs);

      // Mark expired mandates (like Android PlayerInfoViewModel)
      const now = Date.now();
      const mandateDocs = docs.filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE');
      for (const m of mandateDocs) {
        const expiresAt = m.expiresAt;
        if (expiresAt != null && expiresAt < now && !m.expired) {
          try {
            await updateDoc(doc(db, 'PlayerDocuments', m.id), { expired: true });
          } catch {
            // ignore
          }
        }
      }

      // Auto-sync mandate switch: ON when valid mandate docs exist, OFF when none (like Android)
      const validMandates = mandateDocs.filter(
        (d) => !d.expired && (d.expiresAt == null || d.expiresAt >= now)
      );
      const validCount = validMandates.length;
      if (prevValidMandateCountRef.current != null && validCount !== prevValidMandateCountRef.current) {
        const hasMandate = validCount > 0;
        try {
          await updateDoc(doc(db, 'Players', id), { haveMandate: hasMandate });
          setPlayer((p) => (p ? { ...p, haveMandate: hasMandate } : null));
        } catch {
          // ignore
        }
      }
      prevValidMandateCountRef.current = validCount;
    });
    return () => unsub();
  }, [player?.tmProfile, id]);

  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, 'AgentTasks'),
      where('playerId', '==', id)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as typeof playerTasks[0]))
        .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
      setPlayerTasks(list);
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ClubRequests'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClubRequest & { status?: string; clubName?: string; clubLogo?: string; clubCountry?: string; contactPhoneNumber?: string }));
      setClubRequests(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const tmProfile = player?.tmProfile;
    if (!tmProfile?.trim()) {
      setPlayerOffers([]);
      return;
    }
    const q = query(
      collection(db, 'PlayerOffers'),
      where('playerTmProfile', '==', tmProfile)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string; [key: string]: unknown }));
      setPlayerOffers(list);
    });
    return () => unsub();
  }, [player?.tmProfile]);

  const getCurrentUserName = useCallback((): string | undefined => {
    if (!user?.email) return undefined;
    const account = accounts.find(
      (a) => a.email?.toLowerCase() === user.email?.toLowerCase()
    );
    return isRtl ? (account?.hebrewName ?? account?.name) : (account?.name ?? account?.hebrewName);
  }, [user?.email, accounts, isRtl]);

  const playerAsRoster: RosterPlayer | null = useMemo(() => {
    if (!player) return null;
    return {
      id: player.id,
      fullName: player.fullName,
      age: player.age,
      positions: player.positions ?? [],
      foot: player.foot,
      salaryRange: player.salaryRange,
      transferFee: player.transferFee,
      tmProfile: player.tmProfile,
    };
  }, [player]);

  const matchingRequests = useMemo(() => {
    if (!playerAsRoster || !player?.tmProfile) return [];
    const pending = clubRequests.filter((r) => (r.status ?? 'pending') === 'pending');
    const matching = matchingRequestsForPlayer(playerAsRoster, pending);
    const offerByRequestId = Object.fromEntries(
      playerOffers.map((o) => [o.requestId ?? '', o])
    );
    return matching.map((req) => ({
      request: req,
      offer: offerByRequestId[req.id] as { id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string; clubName?: string; clubLogo?: string; position?: string } | undefined,
    }));
  }, [playerAsRoster, player?.tmProfile, clubRequests, playerOffers]);

  const proposalHistory: ProposalOffer[] = useMemo(() => {
    const activeRequestIds = new Set(matchingRequests.map((m) => m.request.id));
    return playerOffers
      .filter((o) => !activeRequestIds.has(o.requestId ?? ''))
      .sort((a, b) => (b.offeredAt ?? 0) - (a.offeredAt ?? 0)) as ProposalOffer[];
  }, [playerOffers, matchingRequests]);

  const handleMarkAsOffered = useCallback(
    async (requestId: string, clubName?: string, clubLogo?: string, position?: string, feedback?: string) => {
      if (!player?.tmProfile || !user?.email) return;
      const agentName = accounts.find((a) => a.email?.toLowerCase() === user.email?.toLowerCase());
      const markedBy = isRtl ? (agentName?.hebrewName ?? agentName?.name) : (agentName?.name ?? agentName?.hebrewName);
      await addDoc(collection(db, 'PlayerOffers'), {
        playerTmProfile: player.tmProfile,
        playerName: player.fullName ?? '',
        playerImage: player.profileImage ?? '',
        requestId,
        clubName: clubName ?? '',
        clubLogo: clubLogo ?? '',
        position: position ?? '',
        offeredAt: Date.now(),
        clubFeedback: feedback ?? '',
        markedByAgentName: markedBy ?? '',
      });
    },
    [player, user?.email, accounts, isRtl]
  );

  const handleUpdateOfferFeedback = useCallback(async (offerId: string, feedback: string) => {
    await updateDoc(doc(db, 'PlayerOffers', offerId), { clubFeedback: feedback });
  }, []);

  const handleUploadDocument = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !player?.tmProfile || !id) return;
      e.target.value = '';
      setUploadingDocument(true);
      try {
        const tmProfile = player.tmProfile;
        const playerName = player.fullName ?? undefined;

        // 1. Call detection API
        const formData = new FormData();
        formData.append('file', file);
        if (playerName) formData.append('playerName', playerName);

        const detectRes = await fetch('/api/documents/detect', {
          method: 'POST',
          body: formData,
        });

        let docType = 'OTHER';
        let suggestedName = file.name;
        let passportInfo: { firstName: string; lastName: string; dateOfBirth?: string; passportNumber?: string; nationality?: string } | undefined;
        let mandateExpiresAt: number | undefined;

        if (detectRes.ok) {
          const detection = (await detectRes.json()) as {
            documentType?: string;
            suggestedName?: string;
            passportInfo?: { firstName: string; lastName: string; dateOfBirth?: string; passportNumber?: string; nationality?: string };
            mandateExpiresAt?: number;
          };
          docType = detection.documentType ?? 'OTHER';
          suggestedName = detection.suggestedName ?? file.name;
          passportInfo = detection.passportInfo;
          mandateExpiresAt = detection.mandateExpiresAt;
        }

        // Ensure mandate has a proper filename (player signs on PDF, may upload with generic/empty name)
        if (docType === 'MANDATE') {
          if (!suggestedName?.trim()) {
            const pName = ([player.passportDetails?.firstName, player.passportDetails?.lastName].filter(Boolean).join('_') || player.fullName?.replace(/\s+/g, '_') || 'player')
              .replace(/[<>:"/\\|?*]/g, '_')
              .slice(0, 60);
            // Use actual file extension (pdf, png, jpg) - don't force .pdf
            const ext = (file.name || '').match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
            const extFromType = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : (file.type === 'image/jpeg' || file.type === 'image/jpg') ? 'jpg' : null;
            const suffix = ext === 'pdf' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? (ext === 'jpeg' ? '.jpg' : `.${ext}`) : (extFromType ? `.${extFromType}` : '.pdf');
            suggestedName = `Mandate_${pName}${suffix}`;
          }
        } else if (!suggestedName?.trim()) {
          const ext = (file.name || '').match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
          const extFromType = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : (file.type === 'image/jpeg' || file.type === 'image/jpg') ? 'jpg' : null;
          const suffix = ext ? (ext === 'jpeg' ? '.jpg' : `.${ext}`) : (extFromType ? `.${extFromType}` : '');
          suggestedName = file.name || `Document_${Date.now()}${suffix}`;
        }

        // Block passport if player already has passport details (like Android)
        if (docType === 'PASSPORT' && player.passportDetails) {
          setUploadError('passport_already_exists');
          setUploadingDocument(false);
          setTimeout(() => setUploadError(null), 4000);
          return;
        }

        // 2. Flatten PDF before upload (like Android)
        let bytes = await file.arrayBuffer();
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          bytes = await flattenPdf(bytes);
        }

        // 3. Upload to Storage
        const safeProfile = (() => {
          let h = 0;
          for (let i = 0; i < tmProfile.length; i++) {
            h = ((h << 5) - h + tmProfile.charCodeAt(i)) | 0;
          }
          return h.toString().replace('-', 'x');
        })();
        const storageFileName = `${crypto.randomUUID()}_${suggestedName}`;
        const storageRef = ref(storage, `player_docs/${safeProfile}/${storageFileName}`);
        await uploadBytes(storageRef, bytes);
        const url = await getDownloadURL(storageRef);

        const createdBy = getCurrentUserName() ?? undefined;
        const uploadedBy = docType === 'MANDATE' ? createdBy : undefined;

        const data: Record<string, unknown> = {
          playerTmProfile: tmProfile,
          type: docType,
          name: suggestedName,
          storageUrl: url,
          uploadedAt: Date.now(),
        };
        if (mandateExpiresAt != null) data.expiresAt = mandateExpiresAt;
        if (docType === 'MANDATE' && uploadedBy) data.uploadedBy = uploadedBy;

        await addDoc(collection(db, 'PlayerDocuments'), data);

        // 4. Save passport details to player (like Android)
        if (docType === 'PASSPORT' && passportInfo) {
          const passportDetails = {
            firstName: passportInfo.firstName || undefined,
            lastName: passportInfo.lastName || undefined,
            dateOfBirth: passportInfo.dateOfBirth || undefined,
            passportNumber: passportInfo.passportNumber || undefined,
            nationality: passportInfo.nationality || undefined,
            lastUpdatedAt: Date.now(),
          };
          await updateDoc(doc(db, 'Players', id), { passportDetails });
          setPlayer((p) => (p ? { ...p, passportDetails } : null));
        }

        // 5. Feed event for mandate (exactly like Android)
        if (docType === 'MANDATE') {
          await addDoc(collection(db, 'FeedEvents'), {
            type: 'MANDATE_UPLOADED',
            playerName: player.fullName,
            playerImage: player.profileImage,
            playerTmProfile: tmProfile,
            agentName: createdBy,
            ...(mandateExpiresAt != null && { mandateExpiryAt: mandateExpiresAt }),
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'upload_failed');
        setTimeout(() => setUploadError(null), 4000);
      } finally {
        setUploadingDocument(false);
      }
    },
    [player, id, getCurrentUserName]
  );

  const handleMandateToggle = useCallback(
    async (hasMandate: boolean) => {
      if (!player || !id) return;
      setMandateToggling(true);
      try {
        await updateDoc(doc(db, 'Players', id), { haveMandate: hasMandate });
        setPlayer((p) => (p ? { ...p, haveMandate: hasMandate } : null));

        const createdBy = getCurrentUserName();
        const mandateExpiryAt =
          hasMandate && player.tmProfile
            ? (() => {
                const valid = documents.filter(
                  (d) =>
                    (d.type ?? '').toUpperCase() === 'MANDATE' &&
                    !d.expired &&
                    (d.expiresAt == null || d.expiresAt >= Date.now())
                );
                const maxExp = Math.max(0, ...valid.map((d) => d.expiresAt ?? 0));
                return maxExp > 0 ? maxExp : undefined;
              })()
            : undefined;

        await addDoc(collection(db, 'FeedEvents'), {
          type: hasMandate ? 'MANDATE_SWITCHED_ON' : 'MANDATE_SWITCHED_OFF',
          playerName: player.fullName,
          playerImage: player.profileImage,
          playerTmProfile: player.tmProfile,
          agentName: createdBy,
          ...(mandateExpiryAt != null && { mandateExpiryAt }),
          timestamp: Date.now(),
        });
      } catch {
        // revert on error
        setPlayer((p) => (p ? { ...p, haveMandate: !hasMandate } : null));
      } finally {
        setMandateToggling(false);
      }
    },
    [player, id, documents, getCurrentUserName]
  );

  const handleDeleteDocument = useCallback(
    async (d: PlayerDocument) => {
      if (!d.id || !id) return;
      const isPassport = (d.type ?? '').toUpperCase() === 'PASSPORT';
      await deleteDoc(doc(db, 'PlayerDocuments', d.id));
      if (isPassport) {
        await updateDoc(doc(db, 'Players', id), { passportDetails: deleteField() });
        setPlayer((p) => (p ? { ...p, passportDetails: undefined } : null));
      }
      setDocToDelete(null);
    },
    [id]
  );

  const refreshFromTransfermarkt = async () => {
    if (!player?.tmProfile || !id) return;
    setRefreshing(true);
    try {
      const details = await getPlayerDetails(player.tmProfile);
      setLiveData(details);
      // Persist refreshed data to Firestore
      const updates: Record<string, unknown> = {};
      if (details.nationality) updates.nationality = details.nationality;
      if (details.nationalities?.length) updates.nationalities = details.nationalities;
      if (details.nationalityFlag) updates.nationalityFlag = details.nationalityFlag;
      if (details.nationalityFlags?.length) updates.nationalityFlags = details.nationalityFlags;
      if (details.marketValue) updates.marketValue = details.marketValue;
      if (details.age) updates.age = details.age;
      if (details.height) updates.height = details.height;
      if (details.contractExpires) updates.contractExpired = details.contractExpires;
      if (details.positions?.length) updates.positions = details.positions;
      if (details.profileImage) updates.profileImage = details.profileImage;
      if (details.foot) updates.foot = details.foot;
      if (details.currentClub) updates.currentClub = details.currentClub;
      if (details.isOnLoan !== undefined) updates.isOnLoan = details.isOnLoan;
      if (details.onLoanFromClub) updates.onLoanFromClub = details.onLoanFromClub;
      updates.lastRefreshedAt = Date.now();
      if (Object.keys(updates).length > 1) {
        await updateDoc(doc(db, 'Players', id), updates);
      }
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
    nationalities: player?.nationalities ?? liveData?.nationalities,
    nationalityFlag: player?.nationalityFlag ?? liveData?.nationalityFlag,
    nationalityFlags: (player as any)?.nationalityFlags ?? liveData?.nationalityFlags,
    contractExpired: player?.contractExpired ?? liveData?.contractExpires,
    positions: player?.positions ?? liveData?.positions,
    foot: player?.foot ?? liveData?.foot,
  };

  const isEuPlayer = isEuNational(merged.nationality, euCountries, merged.nationalities);

  const getPhone = () =>
    player?.playerAdditionalInfoModel?.playerNumber ||
    player?.playerPhoneNumber;
  const getAgentPhone = () =>
    player?.playerAdditionalInfoModel?.agentNumber ||
    player?.agentPhoneNumber;

  const savePhone = useCallback(async (type: 'agent' | 'player', value: string) => {
    if (!id) return;
    setSavingPhone(true);
    try {
      const trimmed = value.trim();
      if (type === 'agent') {
        const updates: Record<string, unknown> = { agentPhoneNumber: trimmed || null };
        if (player?.playerAdditionalInfoModel) {
          updates['playerAdditionalInfoModel.agentNumber'] = trimmed || null;
        }
        await updateDoc(doc(db, 'Players', id), updates);
      } else {
        const updates: Record<string, unknown> = { playerPhoneNumber: trimmed || null };
        if (player?.playerAdditionalInfoModel) {
          updates['playerAdditionalInfoModel.playerNumber'] = trimmed || null;
        }
        await updateDoc(doc(db, 'Players', id), updates);
      }
      setEditingPhoneType(null);
      setEditingPhoneValue('');
    } catch (err) {
      console.error('Failed to save phone:', err);
    } finally {
      setSavingPhone(false);
    }
  }, [id, player]);

  const deletePhone = useCallback(async (type: 'agent' | 'player') => {
    if (!id) return;
    setSavingPhone(true);
    try {
      if (type === 'agent') {
        const updates: Record<string, unknown> = { agentPhoneNumber: deleteField() };
        if (player?.playerAdditionalInfoModel) {
          updates['playerAdditionalInfoModel.agentNumber'] = deleteField();
        }
        await updateDoc(doc(db, 'Players', id), updates);
      } else {
        const updates: Record<string, unknown> = { playerPhoneNumber: deleteField() };
        if (player?.playerAdditionalInfoModel) {
          updates['playerAdditionalInfoModel.playerNumber'] = deleteField();
        }
        await updateDoc(doc(db, 'Players', id), updates);
      }
      setConfirmDeletePhone(null);
    } catch (err) {
      console.error('Failed to delete phone:', err);
    } finally {
      setSavingPhone(false);
    }
  }, [id, player]);

  const saveSalaryFee = useCallback(async (salaryRange: string | null, transferFee: string | null) => {
    if (!id) return;
    try {
      const updates: Record<string, unknown> = {};
      if (salaryRange !== undefined) updates.salaryRange = salaryRange;
      if (transferFee !== undefined) updates.transferFee = transferFee;
      await updateDoc(doc(db, 'Players', id), updates);
      setShowSalaryFeeModal(false);
    } catch (err) {
      console.error('Failed to save salary/fee:', err);
    }
  }, [id]);

  const clearSalaryFee = useCallback(async () => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'Players', id), { salaryRange: deleteField(), transferFee: deleteField() });
      setShowSalaryFeeModal(false);
    } catch (err) {
      console.error('Failed to clear salary/fee:', err);
    }
  }, [id]);

  const translateFoot = (foot: string | undefined): string | undefined => {
    if (!foot) return undefined;
    const lower = foot.toLowerCase();
    if (lower.startsWith('left') || lower === 'l') return t('player_info_foot_left');
    if (lower.startsWith('right') || lower === 'r') return t('player_info_foot_right');
    if (lower.startsWith('both')) return t('player_info_foot_both');
    return foot;
  };

  const handleShare = useCallback(
    async (lang: 'he' | 'en') => {
      if (!player || !id || sharing) return;
      setSharing(true);
      setShareError(null);
      try {
        const hasValidMandate = documents.some(
          (d) =>
            (d.type ?? '').toUpperCase() === 'MANDATE' &&
            !d.expired &&
            (d.expiresAt == null || d.expiresAt >= Date.now())
        );
        const mandateExpiry = documents
          .filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE' && d.expiresAt)
          .map((d) => d.expiresAt!)
          .filter((e) => e >= Date.now())
          .sort((a, b) => a - b)[0];
        const validMandate = documents.find(
          (d) =>
            (d.type ?? '').toUpperCase() === 'MANDATE' &&
            !d.expired &&
            (d.expiresAt == null || d.expiresAt >= Date.now())
        );
        const mandateUrl = validMandate?.storageUrl ?? undefined;

        const sharerAccount = user
          ? accounts.find(
              (a) =>
                a.id === user.uid ||
                a.email?.toLowerCase() === user.email?.toLowerCase()
            )
          : null;
        const sharerPhone = sharerAccount?.phone ?? undefined;
        const sharerName =
          lang === 'he'
            ? (sharerAccount?.hebrewName ?? sharerAccount?.name)
            : (sharerAccount?.name ?? sharerAccount?.hebrewName);

        const playerPayload = {
          fullName: player.fullName,
          fullNameHe: player.fullNameHe,
          profileImage: merged.profileImage || player.profileImage,
          positions: player.positions,
          marketValue: merged.marketValue || player.marketValue,
          marketValueHistory: player.marketValueHistory,
          currentClub: merged.currentClub || player.currentClub,
          age: merged.age || player.age,
          height: merged.height || player.height,
          nationality: merged.nationality || player.nationality,
          contractExpired: merged.contractExpired || player.contractExpired,
          foot: merged.foot || player.foot,
          isOnLoan: player.isOnLoan ?? merged.isOnLoan,
          onLoanFromClub: player.onLoanFromClub ?? merged.onLoanFromClub,
          agency: player.agency,
          tmProfile: merged.tmProfile || player.tmProfile,
          // Never include agent/player contact - only Accounts phone when sharing
        };

        let scoutReport = '';
        try {
          const res = await fetch('/api/share/generate-scout-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player: playerPayload, lang }),
          });
          const json = (await res.json()) as { scoutReport?: string };
          scoutReport = json.scoutReport?.trim() || '';
        } catch {
          // Fall back to buildScoutSummary in createShare
        }

        const pinnedHighlights = (player?.pinnedHighlights ?? []) as HighlightVideo[];
        const highlightsPayload = pinnedHighlights.length > 0
          ? pinnedHighlights.map((v) => ({
              id: v.id,
              source: v.source,
              title: v.title,
              thumbnailUrl: v.thumbnailUrl,
              embedUrl: v.embedUrl,
              channelName: v.channelName,
              viewCount: v.viewCount,
            }))
          : undefined;

        const { url } = await createShare(
          {
            playerId: id,
            player: playerPayload,
            mandateInfo: {
              hasMandate: hasValidMandate,
              expiresAt: mandateExpiry,
            },
            mandateUrl,
            sharerPhone,
            sharerName,
            scoutReport: scoutReport || undefined,
            highlights: highlightsPayload,
            lang,
          },
          () =>
            user ? auth.currentUser?.getIdToken() ?? Promise.resolve(null) : Promise.resolve(null)
        );

        const displayName =
          lang === 'he'
            ? (merged.fullNameHe || merged.fullName || player.fullNameHe || player.fullName || '—')
            : (merged.fullName || merged.fullNameHe || player.fullName || player.fullNameHe || '—');
        const shareText =
          lang === 'he'
            ? `פרופיל חדש נשלח אלייך מ - MGSR.\n${displayName}\n${url}`
            : `A new profile sent to you by MGSR.\n${displayName}\n${url}`;

        if (url.includes('localhost') && typeof window !== 'undefined') {
          setPendingShareUrl(shareText);
          setShowShareSetupModal(true);
          setShareError(null);
        } else {
          const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
          window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
        }
      } catch (e) {
        console.error('Share failed:', e);
        let msg = e instanceof Error ? e.message : 'Share failed';
        if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
          msg = isRtl
            ? 'חסרות הרשאות Firestore. הוסף את כללי SharedPlayers (ראה docs/SHARE_PLAYER_SETUP.md)'
            : 'Firestore permission denied. Add SharedPlayers rules (see docs/SHARE_PLAYER_SETUP.md)';
        }
        setShareError(msg);
      } finally {
        setSharing(false);
      }
    },
    [player, id, documents, merged, user, accounts, sharing, isRtl]
  );

  const handleAddToPortfolio = useCallback(
    async (lang: 'he' | 'en') => {
      if (!player || !id || !user || addingToPortfolio) return;
      setAddingToPortfolio(true);
      setPortfolioError(null);
      try {
        const hasValidMandate = documents.some(
          (d) =>
            (d.type ?? '').toUpperCase() === 'MANDATE' &&
            !d.expired &&
            (d.expiresAt == null || d.expiresAt >= Date.now())
        );
        const mandateExpiry = documents
          .filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE' && d.expiresAt)
          .map((d) => d.expiresAt!)
          .filter((e) => e >= Date.now())
          .sort((a, b) => a - b)[0];
        const validMandate = documents.find(
          (d) =>
            (d.type ?? '').toUpperCase() === 'MANDATE' &&
            !d.expired &&
            (d.expiresAt == null || d.expiresAt >= Date.now())
        );
        const mandateUrl = validMandate?.storageUrl ?? undefined;

        const agentPhone = getAgentPhone();
        const playerPhone = getPhone();
        const playerPayload = {
          fullName: player.fullName,
          fullNameHe: player.fullNameHe,
          profileImage: merged.profileImage || player.profileImage,
          positions: player.positions,
          marketValue: merged.marketValue || player.marketValue,
          marketValueHistory: player.marketValueHistory,
          currentClub: merged.currentClub || player.currentClub,
          age: merged.age || player.age,
          height: merged.height || player.height,
          nationality: merged.nationality || player.nationality,
          contractExpired: merged.contractExpired || player.contractExpired,
          foot: merged.foot || player.foot,
          isOnLoan: player.isOnLoan ?? merged.isOnLoan,
          onLoanFromClub: player.onLoanFromClub ?? merged.onLoanFromClub,
          agency: player.agency,
          tmProfile: merged.tmProfile || player.tmProfile,
          ...(agentPhone ? { agentPhoneNumber: agentPhone } : {}),
          ...(playerPhone ? { playerPhoneNumber: playerPhone } : {}),
          ...(player.playerAdditionalInfoModel ? { playerAdditionalInfoModel: player.playerAdditionalInfoModel } : {}),
        };

        let scoutReport = '';
        const res = await fetch('/api/share/generate-scout-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player: playerPayload, lang }),
        });
        const json = (await res.json()) as { scoutReport?: string };
        scoutReport = json.scoutReport?.trim() || '';

        if (!scoutReport) {
          setPortfolioError(t('player_info_portfolio_scout_failed'));
          return;
        }

        const pinnedHighlights = (player?.pinnedHighlights ?? []) as HighlightVideo[];
        const highlightsPayload = pinnedHighlights.length > 0
          ? pinnedHighlights.map((v) => ({
              id: v.id,
              source: v.source,
              title: v.title,
              thumbnailUrl: v.thumbnailUrl,
              embedUrl: v.embedUrl,
              channelName: v.channelName,
              viewCount: v.viewCount,
            }))
          : undefined;

        /** Firestore rejects undefined - remove undefined values recursively */
        const stripUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
          const result: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(obj)) {
            if (v === undefined) continue;
            if (Array.isArray(v)) {
              result[k] = v
                .filter((x) => x !== undefined)
                .map((x) =>
                  x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype
                    ? stripUndefined(x as Record<string, unknown>)
                    : x
                );
            } else if (
              v !== null &&
              typeof v === 'object' &&
              !(v instanceof Date) &&
              Object.getPrototypeOf(v) === Object.prototype
            ) {
              result[k] = stripUndefined(v as Record<string, unknown>);
            } else {
              result[k] = v;
            }
          }
          return result;
        };

        const portfolioDoc = stripUndefined({
          agentId: user.uid,
          playerId: id,
          player: playerPayload as Record<string, unknown>,
          mandateInfo: {
            hasMandate: hasValidMandate,
            expiresAt: mandateExpiry,
          },
          mandateUrl: mandateUrl ?? null,
          scoutReport,
          highlights: highlightsPayload ?? null,
          lang,
          createdAt: Date.now(),
        });

        const existingQ = query(
          collection(db, 'Portfolio'),
          where('agentId', '==', user.uid),
          where('playerId', '==', id),
          where('lang', '==', lang)
        );
        const existingSnap = await getDocs(existingQ);
        if (!existingSnap.empty) {
          const existingId = existingSnap.docs[0].id;
          await setDoc(doc(db, 'Portfolio', existingId), portfolioDoc);
        } else {
          await addDoc(collection(db, 'Portfolio'), portfolioDoc);
        }

        router.push(`/portfolio?fromPlayer=${id}`);
      } catch (e) {
        console.error('Add to portfolio failed:', e);
        setPortfolioError(e instanceof Error ? e.message : t('player_info_portfolio_scout_failed'));
      } finally {
        setAddingToPortfolio(false);
      }
    },
    [player, id, documents, merged, user, addingToPortfolio, t, router]
  );

  const resolveAgentName = (name: string | undefined, agentId?: string): string => {
    if (!name) return '—';
    if (!isRtl) return name;
    const account = accounts.find(
      (a) => a.id === agentId || a.name?.toLowerCase() === name.toLowerCase() || a.hebrewName?.toLowerCase() === name.toLowerCase()
    );
    return account?.hebrewName || name;
  };

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
            href={backHref}
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
            href={backHref}
            className="hidden lg:inline-flex items-center gap-2 text-mgsr-teal hover:underline"
          >
            <span className={isRtl ? 'rotate-180' : ''}>←</span>
            {t(backLabelKey)}
          </Link>
          <div className="flex items-center gap-2 lg:gap-3 flex-wrap">
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
          <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-8 p-5 sm:p-10">
            <div className="relative shrink-0">
              <img
                src={merged.profileImage || 'https://via.placeholder.com/160'}
                alt=""
                className="w-24 h-24 sm:w-40 sm:h-40 rounded-2xl object-cover bg-mgsr-dark ring-4 ring-mgsr-border shadow-2xl"
              />
              {/* Nationality flags — overlapping flag-in-flag for dual citizenship */}
              {(() => {
                const flags = merged.nationalityFlags?.filter(Boolean);
                const primaryFlag = merged.nationalityFlag;
                if (flags && flags.length > 1) {
                  return (
                    <div className="absolute -bottom-3 -right-4 w-9 h-8 sm:w-10 sm:h-9">
                      {/* Two overlapping rectangle flags */}
                      <img src={flags[1]} alt="" className="absolute bottom-0 right-0 w-7 h-5 sm:w-8 sm:h-6 rounded object-cover border-2 border-mgsr-dark shadow" />
                      <img src={flags[0]} alt="" className="absolute top-0 left-0 w-7 h-5 sm:w-8 sm:h-6 rounded object-cover border-2 border-mgsr-dark shadow-lg" />
                    </div>
                  );
                }
                if (primaryFlag) {
                  return <img src={primaryFlag} alt="" className="absolute -bottom-2 -right-2 w-8 h-6 rounded object-cover border-2 border-mgsr-dark shadow" />;
                }
                return null;
              })()}
            </div>
            <div className="flex-1 text-center sm:text-left min-w-0">
              <h1 className="text-2xl sm:text-4xl font-display font-bold text-mgsr-text tracking-tight">
                {displayName}
              </h1>
              <p className="text-mgsr-muted mt-1 sm:mt-2 text-base sm:text-lg">
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
                {isEuPlayer && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    🇪🇺 {t('eu_nat_tag')}
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

        {/* Stats grid — horizontal scroll on phone, grid on larger */}
        <div className="mb-8 -mx-4 px-4 lg:mx-0 lg:px-0">
          <div className="flex lg:grid lg:grid-cols-6 gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0" style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          <StatCard label={t('player_info_age')} value={merged.age} />
          <StatCard label={t('player_info_height')} value={merged.height} />
          {/* Nationality card — show all citizenships with flags */}
          {(() => {
            const allNat = merged.nationalities?.filter(Boolean) || [];
            const allFlags = merged.nationalityFlags?.filter(Boolean) || [];
            const primary = merged.nationality;
            if (allNat.length > 1) {
              return (
                <div className="shrink-0 min-w-[120px] lg:min-w-0 px-4 py-3 rounded-xl border bg-mgsr-card/50 border-mgsr-border">
                  <p className="text-xs text-mgsr-muted uppercase tracking-wider whitespace-nowrap">{t('player_info_nationality')}</p>
                  <div className="mt-1.5 flex items-center gap-3">
                    {/* Overlapping rectangle flags */}
                    <div className="relative w-9 h-7 shrink-0">
                      <img src={allFlags[1]} alt="" className="absolute bottom-0 right-0 w-7 h-5 rounded object-cover border border-mgsr-border shadow" />
                      <img src={allFlags[0]} alt="" className="absolute top-0 left-0 w-7 h-5 rounded object-cover border border-mgsr-border shadow-lg" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {allNat.map((nat: string, i: number) => (
                        <span key={i} className="font-semibold text-mgsr-text text-sm leading-tight whitespace-nowrap">{nat}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }
            return <StatCard label={t('player_info_nationality')} value={primary} />;
          })()}
          <StatCard label={t('player_info_foot')} value={translateFoot(merged.foot)} />
          <StatCard label={t('player_info_contract')} value={merged.contractExpired} />
          {/* Salary & Transfer Fee — clickable card */}
          <button
            type="button"
            onClick={() => setShowSalaryFeeModal(true)}
            className="shrink-0 min-w-[120px] lg:min-w-0 px-4 py-3 rounded-xl border bg-mgsr-card/50 border-mgsr-border hover:border-mgsr-teal/50 transition-colors text-start group cursor-pointer"
          >
            <p className="text-xs text-mgsr-muted uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
              {t('player_info_salary')}
              <svg className="w-3 h-3 text-mgsr-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </p>
            <p className={`font-semibold mt-0.5 whitespace-nowrap ${player.salaryRange ? 'text-mgsr-text' : 'text-mgsr-muted/40'}`}>
              {player.salaryRange || '—'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setShowSalaryFeeModal(true)}
            className="shrink-0 min-w-[120px] lg:min-w-0 px-4 py-3 rounded-xl border bg-mgsr-card/50 border-mgsr-border hover:border-mgsr-teal/50 transition-colors text-start group cursor-pointer"
          >
            <p className="text-xs text-mgsr-muted uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
              {t('player_info_transfer_fee')}
              <svg className="w-3 h-3 text-mgsr-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            </p>
            <p className={`font-semibold mt-0.5 whitespace-nowrap ${player.transferFee ? 'text-mgsr-text' : 'text-mgsr-muted/40'}`}>
              {player.transferFee?.toLowerCase() === 'free/free loan' ? t('requests_fee_free_loan') : player.transferFee || '—'}
            </p>
          </button>
          </div>
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

            {/* Contact - agent phone + player phone — editable */}
            <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider">
                  {t('player_info_contact')}
                </h3>
                {!getAgentPhone() && !getPhone() && !editingPhoneType && (
                  <button
                    type="button"
                    onClick={() => { setEditingPhoneType('agent'); setEditingPhoneValue(''); }}
                    className="text-xs text-mgsr-teal hover:underline"
                  >
                    + {t('contact_add_phone')}
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {/* Agent phone */}
                {editingPhoneType === 'agent' ? (
                  <div>
                    <p className="text-xs text-mgsr-muted mb-1">{t('player_info_agent_phone')}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        dir="ltr"
                        value={editingPhoneValue}
                        onChange={(e) => setEditingPhoneValue(e.target.value)}
                        placeholder="+972..."
                        className="flex-1 px-3 py-2 rounded-lg bg-mgsr-dark border border-mgsr-border text-mgsr-text text-sm focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') savePhone('agent', editingPhoneValue); if (e.key === 'Escape') { setEditingPhoneType(null); setEditingPhoneValue(''); } }}
                      />
                      <button
                        type="button"
                        disabled={savingPhone}
                        onClick={() => savePhone('agent', editingPhoneValue)}
                        className="px-3 py-2 rounded-lg bg-mgsr-teal text-mgsr-dark text-sm font-semibold hover:bg-mgsr-teal/90 disabled:opacity-50 transition"
                      >
                        {t('save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingPhoneType(null); setEditingPhoneValue(''); }}
                        className="px-3 py-2 rounded-lg border border-mgsr-border text-mgsr-muted text-sm hover:text-mgsr-text transition"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : getAgentPhone() ? (
                  <div>
                    <p className="text-xs text-mgsr-muted mb-1">{t('player_info_agent_phone')}</p>
                    <div className="flex items-center gap-2">
                      <a
                        href={toWhatsAppUrl(getAgentPhone()) ?? `tel:${getAgentPhone()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center h-8 text-mgsr-teal hover:underline text-base"
                        dir="ltr"
                      >
                        {getAgentPhone()}
                      </a>
                      <button
                        type="button"
                        onClick={() => { setEditingPhoneType('agent'); setEditingPhoneValue(getAgentPhone() || ''); }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-mgsr-border/40 text-mgsr-muted hover:text-mgsr-teal transition"
                        title={t('contact_edit_phone')}
                      >
                        <svg style={{width: '18px', height: '18px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      {confirmDeletePhone === 'agent' ? (
                        <span className="flex items-center gap-1 text-xs">
                          <button
                            type="button"
                            disabled={savingPhone}
                            onClick={() => deletePhone('agent')}
                            className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition font-medium"
                          >
                            {t('contact_confirm_delete')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePhone(null)}
                            className="px-2 py-1 rounded text-mgsr-muted hover:text-mgsr-text transition"
                          >
                            {t('cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePhone('agent')}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-red-500/15 text-mgsr-muted hover:text-red-400 transition"
                          title={t('contact_delete_phone')}
                        >
                          <svg style={{width: '18px', height: '18px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Player phone */}
                {editingPhoneType === 'player' ? (
                  <div>
                    <p className="text-xs text-mgsr-muted mb-1">{t('player_info_player_phone')}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        dir="ltr"
                        value={editingPhoneValue}
                        onChange={(e) => setEditingPhoneValue(e.target.value)}
                        placeholder="+972..."
                        className="flex-1 px-3 py-2 rounded-lg bg-mgsr-dark border border-mgsr-border text-mgsr-text text-sm focus:outline-none focus:ring-2 focus:ring-mgsr-teal/50"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') savePhone('player', editingPhoneValue); if (e.key === 'Escape') { setEditingPhoneType(null); setEditingPhoneValue(''); } }}
                      />
                      <button
                        type="button"
                        disabled={savingPhone}
                        onClick={() => savePhone('player', editingPhoneValue)}
                        className="px-3 py-2 rounded-lg bg-mgsr-teal text-mgsr-dark text-sm font-semibold hover:bg-mgsr-teal/90 disabled:opacity-50 transition"
                      >
                        {t('save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingPhoneType(null); setEditingPhoneValue(''); }}
                        className="px-3 py-2 rounded-lg border border-mgsr-border text-mgsr-muted text-sm hover:text-mgsr-text transition"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : getPhone() ? (
                  <div>
                    <p className="text-xs text-mgsr-muted mb-1">{t('player_info_player_phone')}</p>
                    <div className="flex items-center gap-2">
                      <a
                        href={toWhatsAppUrl(getPhone()) ?? `tel:${getPhone()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center h-8 text-mgsr-teal hover:underline text-base"
                        dir="ltr"
                      >
                        {getPhone()}
                      </a>
                      <button
                        type="button"
                        onClick={() => { setEditingPhoneType('player'); setEditingPhoneValue(getPhone() || ''); }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-mgsr-border/40 text-mgsr-muted hover:text-mgsr-teal transition"
                        title={t('contact_edit_phone')}
                      >
                        <svg style={{width: '18px', height: '18px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      {confirmDeletePhone === 'player' ? (
                        <span className="flex items-center gap-1 text-xs">
                          <button
                            type="button"
                            disabled={savingPhone}
                            onClick={() => deletePhone('player')}
                            className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition font-medium"
                          >
                            {t('contact_confirm_delete')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePhone(null)}
                            className="px-2 py-1 rounded text-mgsr-muted hover:text-mgsr-text transition"
                          >
                            {t('cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePhone('player')}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-red-500/15 text-mgsr-muted hover:text-red-400 transition"
                          title={t('contact_delete_phone')}
                        >
                          <svg style={{width: '18px', height: '18px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Add phone buttons — show for each missing phone when not editing */}
                {!editingPhoneType && (!getAgentPhone() || !getPhone()) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {!getAgentPhone() && (
                      <button
                        type="button"
                        onClick={() => { setEditingPhoneType('agent'); setEditingPhoneValue(''); }}
                        className="text-xs text-mgsr-teal/70 hover:text-mgsr-teal transition"
                      >
                        + {t('contact_add_agent_phone')}
                      </button>
                    )}
                    {!getPhone() && (
                      <button
                        type="button"
                        onClick={() => { setEditingPhoneType('player'); setEditingPhoneValue(''); }}
                        className="text-xs text-mgsr-teal/70 hover:text-mgsr-teal transition"
                      >
                        + {t('contact_add_player_phone')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Matching Requests */}
            {player?.tmProfile && (
              <MatchingRequestsSection
                matchingRequests={matchingRequests}
                playerProfileUrl={player.tmProfile}
                accounts={accounts}
                currentUserEmail={user?.email}
                onMarkAsOffered={handleMarkAsOffered}
                onUpdateFeedback={handleUpdateOfferFeedback}
                isWomen={false}
              />
            )}

            {/* Proposal History (persists after request deletion) */}
            {proposalHistory.length > 0 && (
              <ProposalHistorySection
                offers={proposalHistory}
                accounts={accounts}
              />
            )}

            {/* Mandate switch (like Android) */}
            <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-1">
                    {t('player_info_mandate')}
                  </h3>
                  {player.haveMandate && (() => {
                    const valid = documents.filter(
                      (d) =>
                        (d.type ?? '').toUpperCase() === 'MANDATE' &&
                        !d.expired &&
                        (d.expiresAt == null || d.expiresAt >= Date.now())
                    );
                    const maxExp = Math.max(0, ...valid.map((d) => d.expiresAt ?? 0));
                    if (maxExp <= 0) return null;
                    const d = new Date(maxExp);
                    const str = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
                    return (
                      <p className="text-xs text-mgsr-muted mt-0.5" dir="ltr">
                        {t('player_info_mandate_expires').replace('%s', str)}
                      </p>
                    );
                  })()}
                </div>
                <div className="shrink-0 overflow-hidden rounded-full">
                  <button
                    role="switch"
                    aria-checked={player.haveMandate ?? false}
                    disabled={mandateToggling}
                    onClick={() => handleMandateToggle(!(player.haveMandate ?? false))}
                    className={`relative flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-0 px-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-mgsr-teal focus:ring-offset-2 focus:ring-offset-mgsr-dark disabled:opacity-50 disabled:cursor-not-allowed ${
                      player.haveMandate ? 'bg-mgsr-teal justify-end' : 'bg-mgsr-muted/50 justify-start'
                    }`}
                  >
                    <span className="pointer-events-none block h-5 w-5 shrink-0 rounded-full bg-white shadow" />
                  </button>
                </div>
              </div>
            </div>

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
            <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border">
              <h3 className="text-sm font-semibold text-mgsr-muted uppercase tracking-wider mb-3">
                {t('player_info_documents')}
              </h3>
              {uploadError && (
                <div className="py-2 px-3 rounded-lg bg-mgsr-red/20 text-mgsr-red text-sm mb-2">
                  {uploadError === 'passport_already_exists' ? t('passport_already_exists') : uploadError === 'upload_failed' ? t('upload_failed') : uploadError}
                </div>
              )}
              {uploadingDocument && (
                <div className="flex items-center gap-3 py-3 text-sm text-mgsr-muted">
                  <div className="w-5 h-5 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
                  {t('player_info_uploading')}
                </div>
              )}
              {documents.length === 0 && !uploadingDocument ? (
                <div className="py-6 text-center">
                  <svg className="w-12 h-12 mx-auto text-mgsr-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-mgsr-text font-medium mb-1">{t('player_info_no_documents')}</p>
                  <p className="text-sm text-mgsr-muted mb-4">{t('player_info_documents_empty_subtitle')}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,image/*,application/pdf"
                    className="hidden"
                    onChange={handleUploadDocument}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-mgsr-teal text-white font-medium text-sm hover:bg-mgsr-teal/90 transition"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('player_info_add_document')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between py-2 border-b border-mgsr-border last:border-0 text-sm text-mgsr-text"
                    >
                      <a
                        href={d.storageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 truncate text-mgsr-teal hover:underline"
                      >
                        {d.name || d.type || 'Document'}
                      </a>
                      <div className="flex items-center gap-1 shrink-0">
                        {d.expired && (
                          <span className="text-mgsr-red text-xs">{t('player_info_doc_expired')}</span>
                        )}
                        <a
                          href={d.storageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-mgsr-teal hover:bg-mgsr-teal/10 rounded-lg transition"
                          title={t('player_info_cd_open_link')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                        <button
                          onClick={() => setDocToDelete(d)}
                          className="p-2 text-mgsr-muted hover:text-mgsr-red hover:bg-mgsr-red/10 rounded-lg transition"
                          title={t('player_info_cd_delete_document')}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,image/*,application/pdf"
                    className="hidden"
                    onChange={handleUploadDocument}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingDocument}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 transition font-medium text-sm disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('player_info_add_document')}
                  </button>
                </div>
              )}
            </div>

            {/* Delete document confirmation */}
            {docToDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setDocToDelete(null)}>
                <div
                  className="bg-mgsr-card border border-mgsr-border rounded-xl p-6 max-w-sm w-full shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-mgsr-text font-medium mb-4">
                    {t('player_info_delete_doc_confirm')} &quot;{docToDelete.name || docToDelete.type || 'document'}&quot;?
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setDocToDelete(null)}
                      className="px-4 py-2 rounded-lg text-mgsr-muted hover:bg-mgsr-muted/20 transition"
                    >
                      {t('player_info_note_cancel')}
                    </button>
                    <button
                      onClick={() => handleDeleteDocument(docToDelete)}
                      className="px-4 py-2 rounded-lg bg-mgsr-red/20 text-mgsr-red hover:bg-mgsr-red/30 transition font-medium"
                    >
                      {t('tasks_delete')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right column - Value history + Notes */}
          <div className="lg:col-span-2 space-y-8">
            {/* FM Intelligence Panel */}
            {(merged.fullName || player?.fullName) && (
              <FmIntelligencePanel
                playerName={merged.fullName || player?.fullName || ''}
                club={merged.currentClub?.clubName || player?.currentClub?.clubName || ''}
                age={String(merged.age || player?.age || '')}
                isRtl={isRtl}
              />
            )}

            {/* Similar Players Panel */}
            {(merged.tmProfile || player?.tmProfile) && (
              <SimilarPlayersPanel
                playerUrl={merged.tmProfile || player?.tmProfile || ''}
                isRtl={isRtl}
                playerName={merged.fullName || player?.fullName}
                playerClub={merged.currentClub?.clubName || player?.currentClub?.clubName}
                playerPosition={merged.positions?.[0] || player?.positions?.[0]}
                playerAge={merged.age || player?.age}
                playerFoot={merged.foot || player?.foot}
                playerHeight={merged.height || player?.height}
                playerNationality={merged.nationality || player?.nationality}
                playerMarketValue={merged.marketValue || player?.marketValue}
              />
            )}

            {/* Player Highlights Panel */}
            {(merged.fullName || player?.fullName) && (
              <PlayerHighlightsPanel
                playerId={id}
                pinnedHighlights={(player?.pinnedHighlights ?? []) as HighlightVideo[]}
                playerName={merged.fullName || player?.fullName || ''}
                teamName={merged.currentClub?.clubName || player?.currentClub?.clubName || ''}
                position={merged.positions?.[0] || player?.positions?.[0] || ''}
                parentClub={merged.isOnLoan ? (merged.onLoanFromClub || player?.onLoanFromClub) : undefined}
                nationality={merged.nationality || player?.nationality}
                fullNameHe={merged.fullNameHe || player?.fullNameHe}
                clubCountry={merged.currentClub?.clubCountry || player?.currentClub?.clubCountry}
                isRtl={isRtl}
              />
            )}

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

            {/* Player-related tasks */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h2 className="text-lg font-display font-semibold text-mgsr-text">
                  {t('player_tasks_section')}
                </h2>
                <button
                  onClick={() => setShowAddTaskModal(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-mgsr-teal/20 text-mgsr-teal hover:bg-mgsr-teal/30 transition font-medium text-sm shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('player_tasks_add')}
                </button>
              </div>
              {playerTasks.length === 0 ? (
                <div
                  onClick={() => setShowAddTaskModal(true)}
                  className="p-8 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center text-mgsr-muted cursor-pointer hover:border-mgsr-teal/30 hover:bg-mgsr-card/70 transition"
                >
                  {t('player_tasks_empty')}
                </div>
              ) : (
                <div className="space-y-3">
                  {playerTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-4 p-4 bg-mgsr-card border border-mgsr-border rounded-xl hover:border-mgsr-teal/30 transition group"
                    >
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await updateDoc(doc(db, 'AgentTasks', task.id), {
                              isCompleted: !task.isCompleted,
                              completedAt: task.isCompleted ? 0 : Date.now(),
                            });
                          } catch {
                            // ignore
                          }
                        }}
                        className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition ${
                          task.isCompleted ? 'border-mgsr-teal bg-mgsr-teal' : 'border-mgsr-muted group-hover:border-mgsr-teal cursor-pointer'
                        }`}
                      >
                        {task.isCompleted && <span className="text-mgsr-dark text-xs font-bold">✓</span>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${task.isCompleted ? 'line-through text-mgsr-muted' : 'text-mgsr-text'}`}>
                          {task.title || '—'}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                          {task.createdByAgentName && (
                            <p className="text-xs text-mgsr-muted">
                              {t('tasks_opened_by')} <span className="text-mgsr-teal">{task.createdByAgentName}</span>
                            </p>
                          )}
                          {task.agentName && (
                            <p className="text-xs text-mgsr-muted">
                              {t('tasks_assigned_to_label')} <span className="text-mgsr-text">{task.agentName}</span>
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {task.createdAt && (
                            <span className="text-xs text-mgsr-muted">
                              {t('tasks_created_on')} {new Date(task.createdAt).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                          {task.createdAt && task.dueDate ? <span className="text-xs text-mgsr-muted">·</span> : null}
                          {task.dueDate && (
                            <span className={`text-xs ${task.dueDate < Date.now() && !task.isCompleted ? 'text-red-400 font-medium' : 'text-mgsr-muted'}`}>
                              {t('tasks_due_label')} {new Date(task.dueDate).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                        </div>
                        {task.linkedAgentContactName && (
                          <p className="text-xs text-mgsr-muted mt-0.5">
                            {t('tasks_linked_agent')}: <span className="text-mgsr-text">{task.linkedAgentContactName}</span>
                            {task.linkedAgentContactPhone && (
                              <a href={`tel:${task.linkedAgentContactPhone}`} className="ms-1.5 text-mgsr-teal hover:underline">{task.linkedAgentContactPhone}</a>
                            )}
                          </p>
                        )}
                      </div>
                      <Link
                        href="/tasks"
                        className="shrink-0 p-2 rounded-lg text-mgsr-muted hover:text-mgsr-teal hover:bg-mgsr-teal/10 transition"
                        title={t('tasks_title')}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

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

        {/* Bottom bar - Generate mandate + Share */}
        {(() => {
          const hasPassportDetails = !!player?.passportDetails;
          const hasValidMandate = documents.some(
            (d) =>
              (d.type ?? '').toUpperCase() === 'MANDATE' &&
              !d.expired &&
              (d.expiresAt == null || d.expiresAt >= Date.now())
          );
          return (
            <div className="sticky bottom-0 left-0 right-0 mt-8 rounded-t-2xl border border-t border-mgsr-border bg-mgsr-card p-4">
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center gap-8">
                  {hasPassportDetails && (
                    <Link
                      href={hasValidMandate ? '#' : `/players/${id}/generate-mandate`}
                      className={`flex items-center gap-2 ${hasValidMandate ? 'cursor-default opacity-50' : 'text-mgsr-teal hover:underline'}`}
                      onClick={(e) => hasValidMandate && e.preventDefault()}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span className="font-medium text-sm">{t('player_info_generate_mandate')}</span>
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowShareLanguageModal(true);
                    }}
                    disabled={sharing}
                    className="flex items-center gap-2 text-mgsr-teal hover:underline disabled:opacity-50"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    <span className="font-medium text-sm">{t('player_info_share')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPortfolioLanguageModal(true);
                    }}
                    disabled={addingToPortfolio}
                    className="flex items-center gap-2 text-mgsr-teal hover:underline disabled:opacity-50"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="font-medium text-sm">{t('player_info_prepare_portfolio')}</span>
                  </button>
                </div>
                {(shareError || portfolioError) && (
                  <p className="text-sm text-red-400 text-center">{shareError || portfolioError}</p>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Portfolio preparation loader */}
      {addingToPortfolio && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-mgsr-card border border-mgsr-border"
          >
            <div className="w-10 h-10 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
            <p className="text-mgsr-text font-medium">
              {isRtl ? 'מכין דוח סקאוט ומוסיף לפורטפוליו...' : 'Preparing scout report and adding to portfolio...'}
            </p>
          </div>
        </div>
      )}

      {/* Share preparation loader - shown while creating share doc and opening WhatsApp */}
      {sharing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-mgsr-card border border-mgsr-border"
          >
            <div className="w-10 h-10 border-2 border-mgsr-teal border-t-transparent rounded-full animate-spin" />
            <p className="text-mgsr-text font-medium">
              {isRtl ? 'המסמך לשיתוף בהכנה...' : 'Preparing document for share...'}
            </p>
          </div>
        </div>
      )}

      {/* Portfolio language choice modal */}
      {showPortfolioLanguageModal && !addingToPortfolio && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowPortfolioLanguageModal(false)}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="relative w-full max-w-md bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-display font-semibold text-mgsr-text mb-2">
              {isRtl ? 'הכן לפורטפוליו ב' : 'Prepare for portfolio in'}
            </h3>
            <p className="text-sm text-mgsr-muted mb-4">
              {isRtl
                ? 'בחר את שפת דוח הסקאוט'
                : 'Choose the language for the scout report'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPortfolioLanguageModal(false);
                  handleAddToPortfolio('he');
                }}
                disabled={addingToPortfolio}
                className="flex-1 px-4 py-3 rounded-xl bg-mgsr-teal/20 text-mgsr-teal font-medium hover:bg-mgsr-teal/30 disabled:opacity-50"
              >
                עברית
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPortfolioLanguageModal(false);
                  handleAddToPortfolio('en');
                }}
                disabled={addingToPortfolio}
                className="flex-1 px-4 py-3 rounded-xl bg-mgsr-teal/20 text-mgsr-teal font-medium hover:bg-mgsr-teal/30 disabled:opacity-50"
              >
                English
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share language choice modal */}
      {showShareLanguageModal && !sharing && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowShareLanguageModal(false)}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="relative w-full max-w-md bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-display font-semibold text-mgsr-text mb-2">
              {isRtl ? 'שתף ב' : 'Share in'}
            </h3>
            <p className="text-sm text-mgsr-muted mb-4">
              {isRtl ? 'בחר את שפת הדף המשותף' : 'Choose the language for the shared page'}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowShareLanguageModal(false);
                  handleShare('he');
                }}
                disabled={sharing}
                className="flex-1 px-4 py-3 rounded-xl bg-mgsr-teal/20 text-mgsr-teal font-medium hover:bg-mgsr-teal/30 disabled:opacity-50"
              >
                עברית
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowShareLanguageModal(false);
                  handleShare('en');
                }}
                disabled={sharing}
                className="flex-1 px-4 py-3 rounded-xl bg-mgsr-teal/20 text-mgsr-teal font-medium hover:bg-mgsr-teal/30 disabled:opacity-50"
              >
                English
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share setup modal - when on localhost */}
      {showShareSetupModal && pendingShareUrl && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowShareSetupModal(false)}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            dir={isRtl ? 'rtl' : 'ltr'}
            className="relative w-full max-w-md bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-display font-semibold text-mgsr-text mb-3">
              {isRtl ? 'לינק localhost לא יעבוד בטלפון' : 'localhost links won\'t work on phone'}
            </h3>
            <p className="text-sm text-mgsr-muted mb-4">
              {isRtl
                ? 'הלינק לא יפתח בטלפון ולא יציג תמונה ב-WhatsApp. כדי שזה יעבוד:'
                : 'The link won\'t open on phone and won\'t show image in WhatsApp. To fix:'}
            </p>
            <ol className="text-sm text-mgsr-text list-decimal list-inside space-y-2 mb-4">
              <li>
                {isRtl ? 'העלה ל-Vercel (חינם): ' : 'Deploy to Vercel (free): '}
                <a
                  href="https://vercel.com/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mgsr-teal hover:underline"
                >
                  vercel.com/new
                </a>
              </li>
              <li>
                {isRtl
                  ? 'או הרץ "npx ngrok http 3006" והוסף NEXT_PUBLIC_APP_URL ל-.env.local'
                  : 'Or run "npx ngrok http 3006" and add NEXT_PUBLIC_APP_URL to .env.local'}
              </li>
            </ol>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(pendingShareUrl)}`;
                  window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
                  setShowShareSetupModal(false);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-mgsr-teal text-mgsr-dark font-medium hover:bg-mgsr-teal/90"
              >
                {isRtl ? 'פתח WhatsApp בכל זאת' : 'Open WhatsApp anyway'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(pendingShareUrl.split('\n')[1] || pendingShareUrl);
                  setShowShareSetupModal(false);
                }}
                className="flex-1 px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-text hover:bg-mgsr-card/80"
              >
                {isRtl ? 'העתק לינק' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={() => setShowShareSetupModal(false)}
                className="px-4 py-2.5 rounded-xl text-mgsr-muted hover:text-mgsr-text"
              >
                {isRtl ? 'סגור' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Add Player Task Modal */}
      <AddPlayerTaskModal
        open={showAddTaskModal}
        onClose={() => setShowAddTaskModal(false)}
        playerContext={
          player
            ? {
                playerId: id,
                playerName: isRtl ? (player.fullNameHe || player.fullName) || '—' : (player.fullName || player.fullNameHe) || '—',
                playerTmProfile: player.tmProfile,
                playerImage: merged.profileImage,
                playerClub: merged.currentClub?.clubName,
                playerPosition: merged.positions?.filter(Boolean).join(' • '),
                playerAgency: player.agency,
                playerAgencyUrl: player.agencyUrl,
              }
            : undefined
        }
        accounts={accounts}
        currentUserId={user?.uid || ''}
        currentUserEmail={user?.email || ''}
        getDisplayName={(a, rtl) => (rtl ? a.hebrewName || a.name || a.email || '—' : a.name || a.hebrewName || a.email || '—')}
      />

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

      {/* Salary & Transfer Fee Modal */}
      {showSalaryFeeModal && (
        <SalaryTransferFeeModal
          currentSalaryRange={player?.salaryRange ?? null}
          currentTransferFee={player?.transferFee ?? null}
          onDismiss={() => setShowSalaryFeeModal(false)}
          onSave={saveSalaryFee}
          onClear={clearSalaryFee}
          t={t}
        />
      )}
    </AppLayout>
  );
}
