'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  doc,
  collection,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  deleteField,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/lib/firebase';
import { callOffersCreate, callOffersUpdateFeedback, callTasksToggleComplete, callPlayersUpdate, callPlayersToggleMandate, callPlayersAddNote, callPlayersDeleteNote, callPlayersDelete, callPlayerDocumentsCreate, callPlayerDocumentsDelete, callPlayerDocumentsMarkExpired, callPortfolioUpsert } from '@/lib/callables';
import {
  PLAYERS_YOUTH_COLLECTION,
  type YouthPlayer,
  type YouthPlayerNote,
  computeAgeGroup,
} from '@/lib/playersYouth';
import { flattenPdf } from '@/lib/pdfFlatten';
import AddPlayerTaskModal from '@/components/AddPlayerTaskModal';
import BritRail from '@/components/BritRail';
import MatchingRequestsSection from '@/components/MatchingRequestsSection';
import YouthHighlightsPanel from '@/components/YouthHighlightsPanel';
import YouthPlayerProfile from '@/components/YouthPlayerProfile';
import YouthAddProspectDrawer from '@/components/YouthAddProspectDrawer';
import { type RosterPlayer, type ClubRequest } from '@/lib/requestMatcher';
import { usePlayerMatchResults } from '@/hooks/useMatchResults';
import { CLUB_REQUESTS_COLLECTIONS } from '@/lib/platformCollections';
import { toWhatsAppUrl, openWhatsAppShare } from '@/lib/whatsapp';
import { createShare } from '@/lib/shareApi';
import type { HighlightVideo } from '@/lib/highlightsApi';
import { getPositionDisplayName } from '@/lib/appConfig';
import NoteTextarea from '@/components/NoteTextarea';
import Link from 'next/link';
import { WEB_TASKS_ENABLED } from '@/lib/featureFlags';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];
const AGE_GROUPS = ['U-14', 'U-15', 'U-16', 'U-17', 'U-18', 'U-19', 'U-21'];

interface PlayerDocument {
  id: string;
  playerTmProfile?: string;
  playerYouthId?: string;
  type?: string;
  name?: string;
  storageUrl?: string;
  uploadedAt?: number;
  expiresAt?: number;
  expired?: boolean;
  uploadedBy?: string;
}

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
  phone?: string;
}

export default function YouthPlayerPage() {
  const { user, loading } = useAuth();
  const { t, isRtl, lang, setLang } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const precomputedMatchRequestIds = usePlayerMatchResults(id);
  const tasksEnabled = WEB_TASKS_ENABLED;
  const fromPath = searchParams.get('from') || '/players';
  const scrollTo = searchParams.get('scrollTo');
  const isFromDashboard = fromPath === '/dashboard';
  const backHref = isFromDashboard && scrollTo
    ? `/dashboard?scrollTo=${encodeURIComponent(scrollTo)}`
    : fromPath;
  const backLabel = isFromDashboard ? t('player_info_back_dashboard') : t('youth_detail_back_to_players');

  const [player, setPlayer] = useState<YouthPlayer | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(true);
  const [documents, setDocuments] = useState<PlayerDocument[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // Notes state
  const [noteModalOpen, setNoteModalOpen] = useState<'add' | 'edit' | null>(null);
  const [editingNote, setEditingNote] = useState<YouthPlayerNote | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteTaggedAgentIds, setNoteTaggedAgentIds] = useState<string[]>([]);
  const [deleteConfirmNote, setDeleteConfirmNote] = useState<YouthPlayerNote | null>(null);

  // Document state
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<PlayerDocument | null>(null);

  // Mandate
  const [mandateToggling, setMandateToggling] = useState(false);
  const prevValidMandateCountRef = useRef<number | null>(null);

  // Tasks
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [playerTasks, setPlayerTasks] = useState<{ id: string; title?: string; notes?: string; dueDate?: number; isCompleted?: boolean; agentId?: string; agentName?: string; createdAt?: number; createdByAgentId?: string; createdByAgentName?: string; templateId?: string; linkedAgentContactId?: string; linkedAgentContactName?: string; linkedAgentContactPhone?: string }[]>([]);

  // Share
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [showShareLanguageModal, setShowShareLanguageModal] = useState(false);
  const [showShareSetupModal, setShowShareSetupModal] = useState(false);
  const [pendingShareUrl, setPendingShareUrl] = useState<string | null>(null);
  const [includePlayerContact, setIncludePlayerContact] = useState(false);
  const [includeAgencyContact, setIncludeAgencyContact] = useState(false);

  // Portfolio
  const [addingToPortfolio, setAddingToPortfolio] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [showPortfolioLanguageModal, setShowPortfolioLanguageModal] = useState(false);

  // Club requests
  const [clubRequests, setClubRequests] = useState<(ClubRequest & { status?: string; clubName?: string; clubLogo?: string; clubCountry?: string; contactPhoneNumber?: string })[]>([]);
  const [playerOffers, setPlayerOffers] = useState<{ id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string; [key: string]: unknown }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [fullName, setFullName] = useState('');
  const [fullNameHe, setFullNameHe] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [currentClub, setCurrentClub] = useState('');
  const [academy, setAcademy] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [nationality, setNationality] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [ifaUrl, setIfaUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentRelationship, setParentRelationship] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');

  // ── Subscriptions ──
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, PLAYERS_YOUTH_COLLECTION, id), (snap) => {
      if (snap.exists()) {
        setPlayer({ id: snap.id, ...snap.data() } as YouthPlayer);
      } else {
        setPlayer(null);
      }
      setLoadingPlayer(false);
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
    if (!id) return;
    const q = query(collection(db, 'PlayerDocuments'), where('playerYouthId', '==', id));
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as PlayerDocument))
        .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
      setDocuments(docs);

      // Auto-expire mandates
      const now = Date.now();
      const mandateDocs = docs.filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE');
      for (const m of mandateDocs) {
        if (m.expiresAt != null && m.expiresAt < now && !m.expired) {
          try { await callPlayerDocumentsMarkExpired({ documentId: m.id }); } catch { /* */ }
        }
      }
      const validMandates = mandateDocs.filter((d) => !d.expired && (d.expiresAt == null || d.expiresAt >= now));
      const validCount = validMandates.length;
      if (prevValidMandateCountRef.current != null && validCount !== prevValidMandateCountRef.current) {
        const hasMandate = validCount > 0;
        try {
          await callPlayersUpdate({ platform: 'youth', playerId: id, haveMandate: hasMandate });
          setPlayer((p) => (p ? { ...p, haveMandate: hasMandate } : null));
        } catch { /* */ }
      }
      prevValidMandateCountRef.current = validCount;
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!tasksEnabled || !id) return;
    const q = query(collection(db, 'AgentTasksYouth'), where('playerId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as typeof playerTasks[0]))
        .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
      setPlayerTasks(list);
    });
    return () => unsub();
  }, [id, tasksEnabled]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, CLUB_REQUESTS_COLLECTIONS.youth), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as typeof clubRequests[0]));
      setClubRequests(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!id) { setPlayerOffers([]); return; }
    const youthProfile = `youth-${id}`;
    const q = query(collection(db, 'PlayerOffers'), where('playerTmProfile', '==', youthProfile));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as typeof playerOffers[0]));
      setPlayerOffers(list);
    });
    return () => unsub();
  }, [id]);

  // ── Helpers ──
  const getCurrentUserName = useCallback((): string | undefined => {
    if (!user?.email) return undefined;
    const account = accounts.find((a) => a.email?.toLowerCase() === user.email?.toLowerCase());
    return isRtl ? (account?.hebrewName ?? account?.name) : (account?.name ?? account?.hebrewName);
  }, [user?.email, accounts, isRtl]);

  const resolveAgentName = (name: string | undefined): string => {
    if (!name) return '—';
    if (!isRtl) return name;
    const account = accounts.find((a) => a.name?.toLowerCase() === name.toLowerCase() || a.hebrewName?.toLowerCase() === name.toLowerCase());
    return account?.hebrewName || name;
  };

  const playerAsRoster: RosterPlayer | null = useMemo(() => {
    if (!player) return null;
    return { id: player.id, fullName: player.fullName, age: player.ageGroup || undefined, positions: player.positions ?? [], foot: undefined, salaryRange: undefined, transferFee: undefined, tmProfile: undefined };
  }, [player]);

  const matchingRequests = useMemo(() => {
    if (!playerAsRoster || !id) return [];
    const requestById = Object.fromEntries(clubRequests.map((r) => [r.id, r]));
    const matching = precomputedMatchRequestIds.map((rid) => requestById[rid]).filter((r): r is ClubRequest & { status?: string; clubName?: string; clubLogo?: string; clubCountry?: string; contactPhoneNumber?: string } => !!r);
    const offerByRequestId = Object.fromEntries(playerOffers.map((o) => [o.requestId ?? '', o]));
    return matching.map((req) => ({
      request: req,
      offer: offerByRequestId[req.id] as { id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string } | undefined,
    }));
  }, [playerAsRoster, id, clubRequests, playerOffers, precomputedMatchRequestIds]);

  const handleMarkAsOffered = useCallback(
    async (requestId: string, clubName?: string, clubLogo?: string, position?: string, feedback?: string) => {
      if (!player || !id || !user?.email) return;
      const youthProfile = `youth-${id}`;
      const agentName = accounts.find((a) => a.email?.toLowerCase() === user.email?.toLowerCase());
      const markedBy = isRtl ? (agentName?.hebrewName ?? agentName?.name) : (agentName?.name ?? agentName?.hebrewName);
      await callOffersCreate({
        platform: 'youth',
        playerTmProfile: youthProfile, playerName: player.fullName ?? '', playerImage: player.profileImage ?? '',
        requestId: requestId ?? '', clubName: clubName ?? '', clubLogo: clubLogo ?? '', position: position ?? '',
        clubFeedback: feedback ?? '', markedByAgentName: markedBy ?? '',
      });
    },
    [player, id, user?.email, accounts, isRtl]
  );

  const handleUpdateOfferFeedback = useCallback(async (offerId: string, feedback: string) => {
    await callOffersUpdateFeedback({ offerId, clubFeedback: feedback });
  }, []);

  // ── Documents ──
  const handleUploadDocument = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !id || !player) return;
      e.target.value = '';
      setUploadingDocument(true);
      setUploadError(null);
      try {
        const playerName = player.fullName ?? undefined;
        const formData = new FormData();
        formData.append('file', file);
        if (playerName) formData.append('playerName', playerName);

        const detectRes = await fetch('/api/documents/detect', { method: 'POST', body: formData });
        let docType = 'OTHER';
        let suggestedName = file.name;
        let passportInfo: { firstName: string; lastName: string; dateOfBirth?: string; passportNumber?: string; nationality?: string } | undefined;
        let mandateExpiresAt: number | undefined;

        if (detectRes.ok) {
          const detection = (await detectRes.json()) as { documentType?: string; suggestedName?: string; passportInfo?: typeof passportInfo; mandateExpiresAt?: number };
          docType = detection.documentType ?? 'OTHER';
          suggestedName = detection.suggestedName ?? file.name;
          passportInfo = detection.passportInfo;
          mandateExpiresAt = detection.mandateExpiresAt;
        }

        if (docType === 'PASSPORT' && player.passportDetails) {
          setUploadError('Passport already exists');
          setUploadingDocument(false);
          setTimeout(() => setUploadError(null), 4000);
          return;
        }

        let bytes = await file.arrayBuffer();
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) bytes = await flattenPdf(bytes);

        const storageFolder = `youth_${id}`;
        const storageFileName = `${crypto.randomUUID()}_${suggestedName}`;
        const storageRef = ref(storage, `player_docs/${storageFolder}/${storageFileName}`);
        await uploadBytes(storageRef, bytes);
        const url = await getDownloadURL(storageRef);

        const createdBy = getCurrentUserName() ?? undefined;
        const data: Record<string, unknown> = { playerYouthId: id, type: docType, name: suggestedName, storageUrl: url, uploadedAt: Date.now() };
        if (mandateExpiresAt != null) data.expiresAt = mandateExpiresAt;
        if (docType === 'MANDATE' && createdBy) data.uploadedBy = createdBy;

        await callPlayerDocumentsCreate({
          platform: 'youth',
          playerRefId: id,
          type: docType,
          name: suggestedName,
          storageUrl: url,
          ...(mandateExpiresAt != null && { expiresAt: mandateExpiresAt }),
          ...(docType === 'MANDATE' && createdBy && { uploadedBy: createdBy }),
          playerName: player.fullName,
          playerImage: player.profileImage,
          agentName: createdBy,
        });

        if (docType === 'PASSPORT' && passportInfo) {
          const passportDetails = { firstName: passportInfo.firstName, lastName: passportInfo.lastName, dateOfBirth: passportInfo.dateOfBirth, passportNumber: passportInfo.passportNumber, nationality: passportInfo.nationality, lastUpdatedAt: Date.now() };
          await callPlayersUpdate({ platform: 'youth', playerId: id, passportDetails });
          setPlayer((p) => (p ? { ...p, passportDetails } : null));
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
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
        setPlayer((p) => (p ? { ...p, haveMandate: hasMandate } : null));
        const createdBy = getCurrentUserName();
        await callPlayersToggleMandate({
          platform: 'youth',
          playerId: id,
          hasMandate,
          playerRefId: id,
          playerName: player.fullName,
          playerImage: player.profileImage,
          agentName: createdBy,
        });
      } catch {
        setPlayer((p) => (p ? { ...p, haveMandate: !hasMandate } : null));
      } finally {
        setMandateToggling(false);
      }
    },
    [player, id, getCurrentUserName]
  );

  const handleDeleteDocument = useCallback(
    async (d: PlayerDocument) => {
      if (!d.id || !id) return;
      const isPassport = (d.type ?? '').toUpperCase() === 'PASSPORT';
      await callPlayerDocumentsDelete({
        platform: 'youth',
        documentId: d.id,
        clearPassport: isPassport,
        playerId: id,
      });
      if (isPassport) {
        setPlayer((p) => (p ? { ...p, passportDetails: undefined } : null));
      }
      setDocToDelete(null);
    },
    [id]
  );

  // ── Notes ──
  const applyNoteListUpdate = useCallback(
    async (newNoteList: YouthPlayerNote[]) => {
      if (!player || !id) return;
      await callPlayersUpdate({ platform: 'youth', playerId: id, noteList: newNoteList });
    },
    [player, id]
  );

  const handleAddNote = useCallback(
    async (text: string) => {
      if (!text.trim() || !player) return;
      setNoteSaving(true);
      try {
        const createdBy = getCurrentUserName() ?? '';
        await callPlayersAddNote({
          platform: 'youth',
          playerId: id!,
          playerRefId: id!,
          noteText: text.trim(),
          createdBy,
          playerName: player.fullName,
          playerImage: player.profileImage,
          agentName: createdBy,
          taggedAgentIds: noteTaggedAgentIds.length > 0 ? noteTaggedAgentIds : undefined,
        });
        setNoteModalOpen(null);
        setNoteDraft('');
        setNoteTaggedAgentIds([]);
      } finally {
        setNoteSaving(false);
      }
    },
    [player, id, getCurrentUserName, noteTaggedAgentIds]
  );

  const handleEditNote = useCallback(
    async (text: string) => {
      if (!text.trim() || !player || !editingNote) return;
      setNoteSaving(true);
      try {
        const currentNotes = player.noteList ?? [];
        const idx = currentNotes.findIndex((n) => n.notes === editingNote.notes && n.createBy === editingNote.createBy && n.createdAt === editingNote.createdAt);
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
    async (note: YouthPlayerNote) => {
      if (!player) return;
      setNoteSaving(true);
      try {
        const deletedBy = getCurrentUserName() ?? '';
        const currentNotes = player.noteList ?? [];
        const noteIndex = currentNotes.findIndex((n) => n.notes === note.notes && n.createBy === note.createBy && n.createdAt === note.createdAt);
        await callPlayersDeleteNote({
          platform: 'youth',
          playerId: id!,
          playerRefId: id!,
          noteIndex,
          noteText: note.notes,
          noteCreatedAt: note.createdAt,
          playerName: player.fullName,
          playerImage: player.profileImage,
          agentName: deletedBy,
        });
        setDeleteConfirmNote(null);
      } finally {
        setNoteSaving(false);
      }
    },
    [player, id, getCurrentUserName]
  );

  // ── Share ──
  const handleShare = useCallback(
    async (lang: 'he' | 'en') => {
      if (!player || !id || sharing) return;
      setSharing(true);
      setShareError(null);
      try {
        // Determine mandate info
        const hasValidMandate = documents.some(
          (d) => (d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (d.expiresAt == null || d.expiresAt >= Date.now())
        );
        const mandateExpiry = documents
          .filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE' && d.expiresAt)
          .map((d) => d.expiresAt!)
          .filter((e) => e >= Date.now())
          .sort((a, b) => a - b)[0];
        const validMandate = documents.find(
          (d) => (d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (d.expiresAt == null || d.expiresAt >= Date.now())
        );
        const mandateUrl = validMandate?.storageUrl ?? undefined;

        // Get sharer info
        const sharerAccount = user
          ? accounts.find(
              (a) => a.id === user.uid || a.email?.toLowerCase() === user.email?.toLowerCase()
            )
          : null;
        const sharerPhone = sharerAccount?.phone;
        const sharerName =
          lang === 'he'
            ? (sharerAccount?.hebrewName ?? sharerAccount?.name)
            : (sharerAccount?.name ?? sharerAccount?.hebrewName);

        // Build player payload
        const playerPayload = {
          fullName: player.fullName,
          fullNameHe: player.fullNameHe,
          profileImage: player.profileImage,
          positions: player.positions,
          currentClub: player.currentClub,
          ageGroup: player.ageGroup,
          dateOfBirth: player.dateOfBirth,
          nationality: player.nationality,
          agency: player.agentInChargeName,
          ifaUrl: player.ifaUrl,
          ifaStats: player.ifaStats,
          ...(player.playerPhoneNumber ? { playerPhoneNumber: player.playerPhoneNumber } : {}),
        };

        // Try to generate AI scout report
        let scoutReport = '';
        try {
          const res = await fetch('/api/share/generate-scout-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player: playerPayload, lang, platform: 'youth' }),
          });
          const json = (await res.json()) as { scoutReport?: string };
          scoutReport = json.scoutReport?.trim() || '';
        } catch {
          // Fall back to buildScoutSummary in createShare
        }

        // Build highlights payload
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

        // Create share document
        const { url } = await createShare(
          {
            playerId: id,
            player: playerPayload,
            mandateInfo: { hasMandate: hasValidMandate, expiresAt: mandateExpiry },
            mandateUrl,
            sharerPhone,
            sharerName,
            scoutReport: scoutReport || undefined,
            highlights: highlightsPayload,
            lang,
            includePlayerContact,
            includeAgencyContact,
            platform: 'youth',
          },
          () => user ? auth.currentUser?.getIdToken() ?? Promise.resolve(null) : Promise.resolve(null)
        );

        // Build WhatsApp share text
        const rawPos = (player.positions ?? [])[0] || '';
        const pos = lang === 'he' ? getPositionDisplayName(rawPos, true) : rawPos;
        const ageGroup = player.ageGroup || '';
        const quickFacts = [ageGroup, pos].filter(Boolean).join(' ');
        const shareText =
          lang === 'he'
            ? `שחקן צעיר חדש שעשוי להתאים לכם.\n${quickFacts ? `${quickFacts}, מוכן למעבר.` : 'מוכן למעבר.'}\nאם רלוונטי \u2013 לחצו ״מעוניין״ ונשלח פרטים מלאים.\n\n${url}`
            : `New youth player that could fit your needs.\n${quickFacts ? `${quickFacts} — available for transfer.` : 'Available for transfer.'}\nIf relevant, click "Interested" and we'll send full details.\n\n${url}`;

        if (url.includes('localhost') && typeof window !== 'undefined') {
          setPendingShareUrl(shareText);
          setShowShareSetupModal(true);
          setShareError(null);
        } else {
          openWhatsAppShare(shareText);
        }
      } catch (e) {
        console.error('Share failed:', e);
        let msg = e instanceof Error ? e.message : 'Share failed';
        if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
          msg = isRtl
            ? 'חסרות הרשאות Firestore. הוסף את כללי SharedPlayers'
            : 'Firestore permission denied. Add SharedPlayers rules';
        }
        setShareError(msg);
      } finally {
        setSharing(false);
      }
    },
    [player, id, documents, user, accounts, sharing, isRtl, includePlayerContact, includeAgencyContact]
  );

  // ── Portfolio ──
  const handleAddToPortfolio = useCallback(
    async (lang: 'he' | 'en') => {
      if (!player || !id || !user || addingToPortfolio) return;
      setAddingToPortfolio(true);
      setPortfolioError(null);
      try {
        const hasValidMandate = documents.some(
          (d) => (d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (d.expiresAt == null || d.expiresAt >= Date.now())
        );
        const mandateExpiry = documents
          .filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE' && d.expiresAt)
          .map((d) => d.expiresAt!)
          .filter((e) => e >= Date.now())
          .sort((a, b) => a - b)[0];
        const validMandate = documents.find(
          (d) => (d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (d.expiresAt == null || d.expiresAt >= Date.now())
        );
        const mandateUrl = validMandate?.storageUrl ?? undefined;

        const playerPayload = {
          fullName: player.fullName,
          fullNameHe: player.fullNameHe,
          profileImage: player.profileImage,
          positions: player.positions,
          currentClub: player.currentClub,
          ageGroup: player.ageGroup,
          dateOfBirth: player.dateOfBirth,
          nationality: player.nationality,
          agency: player.agentInChargeName,
          ifaUrl: player.ifaUrl,
          ifaStats: player.ifaStats,
          ...(player.playerPhoneNumber ? { playerPhoneNumber: player.playerPhoneNumber } : {}),
        };

        let scoutReport = '';
        const res = await fetch('/api/share/generate-scout-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ player: playerPayload, lang, platform: 'youth' }),
        });
        const json = (await res.json()) as { scoutReport?: string };
        scoutReport = json.scoutReport?.trim() || '';

        if (!scoutReport) {
          setPortfolioError(t('player_info_portfolio_scout_failed'));
          return;
        }

        const stripUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
          const result: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(obj)) {
            if (v === undefined) continue;
            if (Array.isArray(v)) {
              result[k] = v.filter((x) => x !== undefined).map((x) =>
                x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype
                  ? stripUndefined(x as Record<string, unknown>) : x
              );
            } else if (v !== null && typeof v === 'object' && !(v instanceof Date) && Object.getPrototypeOf(v) === Object.prototype) {
              result[k] = stripUndefined(v as Record<string, unknown>);
            } else {
              result[k] = v;
            }
          }
          return result;
        };

        const portfolioDoc = stripUndefined({
          agentId: user.uid,
          playerYouthId: id,
          player: playerPayload as Record<string, unknown>,
          mandateInfo: { hasMandate: hasValidMandate, expiresAt: mandateExpiry },
          mandateUrl: mandateUrl ?? null,
          scoutReport,
          lang,
          createdAt: Date.now(),
        });

        await callPortfolioUpsert({
          platform: 'youth',
          ...portfolioDoc as Record<string, unknown>,
        });

        router.push(`/portfolio?fromPlayer=${id}&platform=youth`);
      } catch (e) {
        console.error('Add to portfolio failed:', e);
        setPortfolioError(e instanceof Error ? e.message : t('player_info_portfolio_scout_failed'));
      } finally {
        setAddingToPortfolio(false);
      }
    },
    [player, id, documents, user, addingToPortfolio, t, router]
  );

  // ── Edit & Delete ──
  const openEdit = () => {
    if (!player) return;
    setFullName(player.fullName ?? '');
    setFullNameHe(player.fullNameHe ?? '');
    setPositions(player.positions ?? []);
    setCurrentClub(player.currentClub?.clubName ?? '');
    setAcademy(player.academy ?? '');
    setDateOfBirth(player.dateOfBirth ?? '');
    setAgeGroup(player.ageGroup ?? '');
    setNationality(player.nationality ?? '');
    setProfileImage(player.profileImage ?? '');
    setIfaUrl(player.ifaUrl ?? '');
    setNotes(player.notes ?? '');
    setPlayerPhone(player.playerPhoneNumber ?? '');
    setPlayerEmail(player.playerEmail ?? '');
    setParentName(player.parentContact?.parentName ?? '');
    setParentRelationship(player.parentContact?.parentRelationship ?? '');
    setParentPhone(player.parentContact?.parentPhoneNumber ?? '');
    setParentEmail(player.parentContact?.parentEmail ?? '');
    setError('');
    setEditOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !fullName.trim()) return;
    setError('');
    setSaving(true);
    try {
      const computedAgeGroup = ageGroup || (dateOfBirth ? computeAgeGroup(dateOfBirth) : '');
      const deleteFields: string[] = [];
      const updateData: Record<string, unknown> = {
        platform: 'youth',
        playerId: id,
        fullName: fullName.trim(),
      };
      if (fullNameHe.trim()) updateData.fullNameHe = fullNameHe.trim(); else deleteFields.push('fullNameHe');
      if (positions.length > 0) updateData.positions = positions; else deleteFields.push('positions');
      if (currentClub.trim()) updateData.currentClub = { clubName: currentClub.trim() }; else deleteFields.push('currentClub');
      if (academy.trim()) updateData.academy = academy.trim(); else deleteFields.push('academy');
      if (dateOfBirth.trim()) updateData.dateOfBirth = dateOfBirth.trim(); else deleteFields.push('dateOfBirth');
      if (computedAgeGroup) updateData.ageGroup = computedAgeGroup; else deleteFields.push('ageGroup');
      if (nationality.trim()) updateData.nationality = nationality.trim(); else deleteFields.push('nationality');
      if (profileImage.trim()) updateData.profileImage = profileImage.trim(); else deleteFields.push('profileImage');
      if (ifaUrl.trim()) updateData.ifaUrl = ifaUrl.trim(); else deleteFields.push('ifaUrl');
      if (notes.trim()) updateData.notes = notes.trim(); else deleteFields.push('notes');
      if (playerPhone.trim()) updateData.playerPhoneNumber = playerPhone.trim(); else deleteFields.push('playerPhoneNumber');
      if (playerEmail.trim()) updateData.playerEmail = playerEmail.trim(); else deleteFields.push('playerEmail');
      if (parentName.trim() || parentPhone.trim()) {
        updateData.parentContact = {
          parentName: parentName.trim() || null,
          parentRelationship: parentRelationship.trim() || null,
          parentPhoneNumber: parentPhone.trim() || null,
          parentEmail: parentEmail.trim() || null,
        };
      } else {
        deleteFields.push('parentContact');
      }
      if (deleteFields.length > 0) updateData._deleteFields = deleteFields;
      await callPlayersUpdate(updateData as Parameters<typeof callPlayersUpdate>[0]);
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !player) return;
    setDeleting(true);
    setError('');
    try {
      const agentName = getCurrentUserName() ?? undefined;
      await callPlayersDelete({
        platform: 'youth',
        playerId: id,
        playerRefId: id,
        playerName: player.fullName,
        playerImage: player.profileImage,
        agentName,
      });
      router.push('/players');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const togglePosition = (pos: string) => {
    setPositions((prev) => prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]);
  };

  // ── Derived ──
  const notesList = player?.noteList ?? [];
  const sortedNotes = [...notesList].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const hasValidMandate = documents.some((d) => (d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (d.expiresAt == null || d.expiresAt >= Date.now()));

  // Glassmorphism helpers
  const glassCard = 'youth-glass-card rounded-2xl';
  const glassInputSm = 'w-full px-4 py-3 rounded-2xl youth-glass-input text-mgsr-text placeholder-mgsr-muted/60 focus:outline-none transition text-sm';
  const glassLabel = 'block text-xs font-medium text-[var(--youth-cyan)]/70 uppercase tracking-wider mb-2';

  // ── Loading / Not found ── (editorial Light Management Room shell)
  if (loading || !user || loadingPlayer) {
    return (
      <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
        <div className="brit-app">
          <BritRail active="players" />
          <div className="brit-main">
            <div className="brit-profile" style={{ padding: '60px 43px' }}>
              <div className="bp-empty">{t('loading')}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="brit-room" dir={isRtl ? 'rtl' : 'ltr'} lang={isRtl ? 'he' : 'en'}>
        <div className="brit-app">
          <BritRail active="players" />
          <div className="brit-main">
            <div className="brit-profile" style={{ padding: '60px 43px' }}>
              <div className="bp-actionbar">
                <Link href={backHref} scroll={false} className="bp-back">
                  <span style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}>←</span>
                  {backLabel}
                </Link>
              </div>
              <div className="bp-empty">{t('youth_detail_not_found')}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <YouthPlayerProfile
        t={t}
        isRtl={isRtl}
        lang={lang}
        setLang={setLang}
        player={player}
        displayName={isRtl ? (player.fullNameHe || player.fullName) : player.fullName}
        documents={documents}
        sortedNotes={sortedNotes}
        backHref={backHref}
        backLabel={backLabel}
        resolveAgentName={resolveAgentName}
        mandateToggling={mandateToggling}
        uploadingDocument={uploadingDocument}
        uploadError={uploadError}
        sharing={sharing}
        addingToPortfolio={addingToPortfolio}
        shareError={shareError}
        portfolioError={portfolioError}
        tasksEnabled={tasksEnabled}
        hasValidMandate={hasValidMandate}
        mandateExpiryLabel={(() => {
          const valid = documents.filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (d.expiresAt == null || d.expiresAt >= Date.now()));
          const maxExp = Math.max(0, ...valid.map((d) => d.expiresAt ?? 0));
          return maxExp > 0 ? new Date(maxExp).toLocaleDateString() : null;
        })()}
        onEdit={() => setShowEditDrawer(true)}
        onDelete={() => setDeleteOpen(true)}
        onAddTask={() => setShowAddTaskModal(true)}
        onMandateToggle={handleMandateToggle}
        onUploadClick={() => fileInputRef.current?.click()}
        onDeleteDoc={(d) => setDocToDelete(d as PlayerDocument)}
        onAddNote={() => { setNoteModalOpen('add'); setNoteDraft(''); }}
        onEditNote={(n) => { setEditingNote(n); setNoteDraft(n.notes ?? ''); setNoteModalOpen('edit'); }}
        onDeleteNote={(n) => setDeleteConfirmNote(n)}
        onShare={() => { setIncludePlayerContact(false); setIncludeAgencyContact(false); setShowShareLanguageModal(true); }}
        onPreparePortfolio={() => setShowPortfolioLanguageModal(true)}
        fileInput={
          <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,image/*,application/pdf" className="hidden" onChange={handleUploadDocument} />
        }
        editDrawer={
          <YouthAddProspectDrawer
            open={showEditDrawer}
            onClose={() => setShowEditDrawer(false)}
            editPlayer={player}
            onSaved={() => setShowEditDrawer(false)}
          />
        }
        highlightsPanel={
          player && id ? (
            <YouthHighlightsPanel
              playerId={id}
              pinnedHighlights={player.pinnedHighlights as any}
              isRtl={isRtl}
            />
          ) : null
        }
        matchingRequestsBlock={
          player && id ? (
            <MatchingRequestsSection
              matchingRequests={matchingRequests}
              playerProfileUrl={typeof window !== 'undefined' ? `${window.location.origin}/players/youth/${id}` : ''}
              accounts={accounts}
              currentUserEmail={user?.email}
              onMarkAsOffered={handleMarkAsOffered}
              onUpdateFeedback={handleUpdateOfferFeedback}
            />
          ) : null
        }
        tasksBlock={
          tasksEnabled ? (
            playerTasks.length === 0 ? (
              <p className="brit-empty-note" style={{ color: 'var(--muted)', fontSize: 13, padding: '10px 0' }}>{t('youth_detail_no_tasks')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {playerTasks.map((task) => (
                  <li key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <input
                      type="checkbox"
                      checked={task.isCompleted ?? false}
                      onChange={async () => { await callTasksToggleComplete({ platform: 'youth', taskId: task.id, isCompleted: !task.isCompleted }); }}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, textDecoration: task.isCompleted ? 'line-through' : 'none', color: task.isCompleted ? 'var(--muted)' : 'var(--ink)' }}>{task.title}</p>
                      <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11 }}>
                        {task.agentName && <span>{t('tasks_assigned_to_label')} {task.agentName}</span>}
                        {task.dueDate && (
                          <span style={{ marginInlineStart: 8, color: task.dueDate < Date.now() && !task.isCompleted ? 'var(--red)' : 'var(--muted)' }}>
                            {t('tasks_due_label')} {new Date(task.dueDate).toLocaleDateString(isRtl ? 'he-IL' : 'en-US', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null
        }
      />

      {/* Modals + overlays (kept from the original route; rendered as siblings) */}
      <div dir={isRtl ? 'rtl' : 'ltr'} style={{ display: 'contents' }}>
        {/* Portfolio preparation loader */}
        {addingToPortfolio && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
            <div dir={isRtl ? 'rtl' : 'ltr'} className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-mgsr-card border border-mgsr-border shadow-[0_0_30px_rgba(0,212,255,0.08)]">
              <div className="w-10 h-10 border-2 border-[var(--youth-cyan)] border-t-transparent rounded-full animate-spin" />
              <p className="text-mgsr-text font-medium">{t('player_info_portfolio_adding')}</p>
            </div>
          </div>
        )}

        {/* Portfolio language choice modal */}
        {showPortfolioLanguageModal && !addingToPortfolio && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={() => setShowPortfolioLanguageModal(false)}>
            <div dir={isRtl ? 'rtl' : 'ltr'} className={`${glassCard} p-6 w-full max-w-md`} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-display font-semibold text-mgsr-text mb-2">
                {isRtl ? 'הכן לפורטפוליו ב' : 'Prepare for portfolio in'}
              </h3>
              <p className="text-sm text-mgsr-muted mb-4">
                {isRtl ? 'בחר את שפת דוח הסקאוט' : 'Choose the language for the scout report'}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowPortfolioLanguageModal(false); handleAddToPortfolio('he'); }}
                  disabled={addingToPortfolio}
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] font-medium hover:bg-[var(--youth-cyan)]/30 disabled:opacity-50"
                >
                  עברית
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPortfolioLanguageModal(false); handleAddToPortfolio('en'); }}
                  disabled={addingToPortfolio}
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] font-medium hover:bg-[var(--youth-cyan)]/30 disabled:opacity-50"
                >
                  English
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Share preparation loader */}
        {sharing && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
            <div dir={isRtl ? 'rtl' : 'ltr'} className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-mgsr-card border border-mgsr-border shadow-[0_0_30px_rgba(0,212,255,0.08)]">
              <div className="w-10 h-10 border-2 border-[var(--youth-cyan)] border-t-transparent rounded-full animate-spin" />
              <p className="text-mgsr-text font-medium">
                {isRtl ? 'המסמך לשיתוף בהכנה...' : 'Preparing document for share...'}
              </p>
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
              className={`${glassCard} relative p-6 w-full max-w-md`}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-display font-semibold text-mgsr-text mb-2">
                {isRtl ? 'שתף ב' : 'Share in'}
              </h3>
              <p className="text-sm text-mgsr-muted mb-4">
                {isRtl ? 'בחר את שפת הדף המשותף' : 'Choose the language for the shared page'}
              </p>

              {/* Contact inclusion checkboxes */}
              {(() => {
                const hasPlayerPhone = !!player?.playerPhoneNumber;
                const hasParentPhone = !!player?.parentContact?.parentPhoneNumber;
                if (!hasPlayerPhone && !hasParentPhone) return null;
                return (
                  <div className="space-y-3 mb-4">
                    {hasPlayerPhone && (
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includePlayerContact}
                          onChange={(e) => setIncludePlayerContact(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-mgsr-border text-[var(--youth-cyan)] focus:ring-[var(--youth-cyan)]"
                        />
                        <span className="text-sm text-mgsr-text">
                          {isRtl ? 'צרף טלפון שחקן' : 'Attach player contact'}
                        </span>
                      </label>
                    )}
                    {hasParentPhone && (
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={includeAgencyContact}
                          onChange={(e) => setIncludeAgencyContact(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-mgsr-border text-[var(--youth-cyan)] focus:ring-[var(--youth-cyan)]"
                        />
                        <span className="text-sm text-mgsr-text">
                          {isRtl ? 'צרף טלפון הורה/אפוטרופוס' : 'Attach parent/guardian contact'}
                        </span>
                      </label>
                    )}
                  </div>
                );
              })()}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowShareLanguageModal(false); handleShare('he'); }}
                  disabled={sharing}
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] font-medium hover:bg-[var(--youth-cyan)]/30 disabled:opacity-50"
                >
                  עברית
                </button>
                <button
                  type="button"
                  onClick={() => { setShowShareLanguageModal(false); handleShare('en'); }}
                  disabled={sharing}
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] font-medium hover:bg-[var(--youth-cyan)]/30 disabled:opacity-50"
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
              className={`${glassCard} relative p-6 w-full max-w-md`}
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
                  <a href="https://vercel.com/new" target="_blank" rel="noopener noreferrer" className="text-[var(--youth-cyan)] hover:underline">vercel.com/new</a>
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
                  onClick={() => { openWhatsAppShare(pendingShareUrl); setShowShareSetupModal(false); }}
                  className="flex-1 px-4 py-2.5 rounded-xl text-mgsr-dark font-medium hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, var(--youth-cyan), var(--youth-violet))' }}
                >
                  {isRtl ? 'פתח WhatsApp בכל זאת' : 'Open WhatsApp anyway'}
                </button>
                <button
                  type="button"
                  onClick={async () => { await navigator.clipboard.writeText(pendingShareUrl.split('\n')[1] || pendingShareUrl); setShowShareSetupModal(false); }}
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

        {/* ────── MODALS ────── */}

        {/* Note Modal */}
        {noteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className={`${glassCard} p-6 w-full max-w-lg`}>
              <h2 className="text-lg font-display font-bold youth-gradient-text mb-4">
                {noteModalOpen === 'add' ? t('youth_detail_add_note_title') : t('youth_detail_edit_note_title')}
              </h2>
              <NoteTextarea
                value={noteDraft}
                onChange={setNoteDraft}
                accounts={accounts}
                isRtl={isRtl}
                placeholder={t('youth_detail_note_placeholder')}
                rows={4}
                className={`${glassInputSm} resize-none mb-4`}
                autoFocus
                onTaggedAgentsChange={setNoteTaggedAgentIds}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setNoteModalOpen(null); setEditingNote(null); setNoteDraft(''); setNoteTaggedAgentIds([]); }} className="px-4 py-2 text-sm text-mgsr-muted hover:text-mgsr-text transition">
                  {t('youth_detail_cancel')}
                </button>
                <button
                  type="button"
                  disabled={noteSaving || !noteDraft.trim()}
                  onClick={() => noteModalOpen === 'add' ? handleAddNote(noteDraft) : handleEditNote(noteDraft)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition"
                  style={{ background: 'linear-gradient(135deg, var(--youth-cyan), var(--youth-violet))' }}
                >
                  {noteSaving ? t('youth_detail_saving') : t('youth_detail_save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Note Confirm */}
        {deleteConfirmNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className={`${glassCard} p-6 w-full max-w-sm`}>
              <h2 className="text-lg font-bold text-mgsr-text mb-2">{t('youth_detail_delete_note_confirm')}</h2>
              <p className="text-sm text-mgsr-muted mb-4">{t('youth_detail_cannot_undo')}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDeleteConfirmNote(null)} className="px-4 py-2 text-sm text-mgsr-muted hover:text-mgsr-text transition">{t('youth_detail_cancel')}</button>
                <button type="button" disabled={noteSaving} onClick={() => handleDeleteNote(deleteConfirmNote)} className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition disabled:opacity-50">
                  {t('youth_detail_delete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Document Confirm */}
        {docToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className={`${glassCard} p-6 w-full max-w-sm`}>
              <h2 className="text-lg font-bold text-mgsr-text mb-2">{t('youth_detail_delete_doc_confirm')}</h2>
              <p className="text-sm text-mgsr-muted mb-4">{docToDelete.name || t('youth_detail_document')} {t('youth_detail_will_be_removed')}</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDocToDelete(null)} className="px-4 py-2 text-sm text-mgsr-muted hover:text-mgsr-text transition">{t('youth_detail_cancel')}</button>
                <button type="button" onClick={() => handleDeleteDocument(docToDelete)} className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition">
                  {t('youth_detail_delete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Player Confirm */}
        {deleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className={`${glassCard} p-6 w-full max-w-sm`}>
              <h2 className="text-lg font-bold text-mgsr-text mb-2">{t('youth_detail_delete_player_confirm')}</h2>
              <p className="text-sm text-mgsr-muted mb-4">
                <strong className="text-mgsr-text">{player.fullName}</strong> {t('youth_detail_permanently_removed')}
              </p>
              {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDeleteOpen(false)} className="px-4 py-2 text-sm text-mgsr-muted hover:text-mgsr-text transition">{t('youth_detail_cancel')}</button>
                <button type="button" disabled={deleting} onClick={handleDelete} className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition disabled:opacity-50">
                  {deleting ? t('youth_detail_deleting') : t('youth_detail_delete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Player Modal */}
        {editOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm px-4 pt-8 pb-8 overflow-y-auto">
            <div className={`${glassCard} p-6 w-full max-w-2xl`}>
              <h2 className="text-lg font-display font-bold youth-gradient-text mb-6">{t('youth_detail_edit_title')}</h2>
              {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
              <form onSubmit={handleSave} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={glassLabel}>{t('youth_add_name_en')}</label>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className={glassInputSm} />
                  </div>
                  <div>
                    <label className={glassLabel}>שם מלא (עברית)</label>
                    <input type="text" value={fullNameHe} onChange={(e) => setFullNameHe(e.target.value)} dir="rtl" className={glassInputSm} />
                  </div>
                </div>

                <div>
                  <label className={glassLabel}>{t('youth_add_positions')}</label>
                  <div className="flex flex-wrap gap-2">
                    {POSITIONS.map((pos) => (
                      <button key={pos} type="button" onClick={() => togglePosition(pos)} className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-all border ${positions.includes(pos) ? 'bg-[var(--youth-cyan)]/20 text-[var(--youth-cyan)] border-[var(--youth-cyan)]/40' : 'bg-white/5 border-white/10 text-mgsr-muted hover:text-mgsr-text'}`}>
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={glassLabel}>{t('youth_add_club')}</label>
                  <input type="text" value={currentClub} onChange={(e) => setCurrentClub(e.target.value)} className={glassInputSm} />
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className={glassLabel}>{t('youth_add_dob')}</label>
                    <input type="text" value={dateOfBirth} onChange={(e) => { setDateOfBirth(e.target.value); if (e.target.value) setAgeGroup(computeAgeGroup(e.target.value) ?? ''); }} placeholder="DD/MM/YYYY" className={glassInputSm} />
                  </div>
                  <div>
                    <label className={glassLabel}>{t('youth_add_age_group')}</label>
                    <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} className={`${glassInputSm} appearance-none`}>
                      <option value="" className="bg-[#0A0F1C]">{t('youth_add_select')}</option>
                      {AGE_GROUPS.map((ag) => <option key={ag} value={ag} className="bg-[#0A0F1C]">{ag}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={glassLabel}>{t('youth_add_nationality')}</label>
                    <input type="text" value={nationality} onChange={(e) => setNationality(e.target.value)} className={glassInputSm} />
                  </div>
                </div>

                <div>
                  <label className={glassLabel}>{t('youth_add_ifa_url')}</label>
                  <input type="url" value={ifaUrl} onChange={(e) => setIfaUrl(e.target.value)} className={glassInputSm} />
                </div>

                <div>
                  <label className={glassLabel}>{t('youth_detail_profile_image')}</label>
                  <input type="url" value={profileImage} onChange={(e) => setProfileImage(e.target.value)} className={glassInputSm} />
                </div>

                {/* Contact section */}
                <div className="pt-4 border-t border-[var(--youth-cyan)]/10 space-y-4">
                  <h4 className="text-xs font-semibold youth-gradient-text uppercase tracking-wider">{t('youth_detail_contact')}</h4>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={glassLabel}>{t('youth_detail_player_phone')}</label>
                      <input type="tel" value={playerPhone} onChange={(e) => setPlayerPhone(e.target.value)} className={glassInputSm} />
                    </div>
                    <div>
                      <label className={glassLabel}>{t('youth_detail_player_email')}</label>
                      <input type="email" value={playerEmail} onChange={(e) => setPlayerEmail(e.target.value)} className={glassInputSm} />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={glassLabel}>{t('youth_add_parent_name')}</label>
                      <input type="text" value={parentName} onChange={(e) => setParentName(e.target.value)} className={glassInputSm} />
                    </div>
                    <div>
                      <label className={glassLabel}>{t('youth_add_relationship')}</label>
                      <select value={parentRelationship} onChange={(e) => setParentRelationship(e.target.value)} className={`${glassInputSm} appearance-none`}>
                        <option value="" className="bg-[#0A0F1C]">{t('youth_add_select')}</option>
                        <option value="Father" className="bg-[#0A0F1C]">{t('youth_add_relationship_father')}</option>
                        <option value="Mother" className="bg-[#0A0F1C]">{t('youth_add_relationship_mother')}</option>
                        <option value="Guardian" className="bg-[#0A0F1C]">{t('youth_add_relationship_guardian')}</option>
                        <option value="Agent" className="bg-[#0A0F1C]">{t('youth_add_relationship_agent')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={glassLabel}>{t('youth_add_parent_phone')}</label>
                      <input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className={glassInputSm} />
                    </div>
                    <div>
                      <label className={glassLabel}>{t('youth_add_parent_email')}</label>
                      <input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} className={glassInputSm} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={glassLabel}>{t('youth_add_notes')}</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${glassInputSm} resize-none`} />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2.5 text-sm text-mgsr-muted hover:text-mgsr-text transition">
                    {t('youth_detail_cancel')}
                  </button>
                  <button type="submit" disabled={saving || !fullName.trim()} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition" style={{ background: 'linear-gradient(135deg, var(--youth-cyan), var(--youth-violet))' }}>
                    {saving ? t('youth_detail_saving') : t('youth_detail_save_changes')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add Task Modal */}
        {tasksEnabled && showAddTaskModal && player && id && (
          <AddPlayerTaskModal
            open={showAddTaskModal}
            onClose={() => setShowAddTaskModal(false)}
            playerContext={
              player
                ? {
                    playerId: id,
                    playerName: player.fullName ?? '',
                    playerImage: player.profileImage,
                    playerClub: player.currentClub?.clubName,
                    playerPosition: player.positions?.filter(Boolean).join(' • '),
                  }
                : undefined
            }
            accounts={accounts}
            currentUserId={user?.uid || ''}
            currentUserEmail={user?.email || ''}
            getDisplayName={(a, rtl) => (rtl ? a.hebrewName || a.name || '—' : a.name || a.hebrewName || '—')}
            taskCollection="AgentTasksYouth"
          />
        )}
      </div>
    </>
  );
}
