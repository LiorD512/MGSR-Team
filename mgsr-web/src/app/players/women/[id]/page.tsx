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
  addDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  getDocs,
  setDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import {
  PLAYERS_WOMEN_COLLECTION,
  type WomanPlayer,
  type WomanPlayerNote,
  updateWomanPlayer,
  deleteWomanPlayer,
} from '@/lib/playersWomen';
import { flattenPdf } from '@/lib/pdfFlatten';
import type { HighlightVideo } from '@/lib/highlightsApi';
import PlayerHighlightsPanel from '@/components/PlayerHighlightsPanel';
import AddPlayerTaskModal from '@/components/AddPlayerTaskModal';
import FmInsideWomenPanel from '@/components/FmInsideWomenPanel';
import PlaymakerStatsWomenPanel from '@/components/PlaymakerStatsWomenPanel';
import AppLayout from '@/components/AppLayout';
import MatchingRequestsSection from '@/components/MatchingRequestsSection';
import { matchingRequestsForPlayer, type RosterPlayer, type ClubRequest } from '@/lib/requestMatcher';
import { CLUB_REQUESTS_COLLECTIONS } from '@/lib/platformCollections';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import Link from 'next/link';

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'CF', 'SS'];

interface PlayerDocument {
  id: string;
  playerTmProfile?: string;
  playerWomenId?: string;
  type?: string;
  name?: string;
  storageUrl?: string;
  uploadedAt?: number;
  expiresAt?: number;
  expired?: boolean;
  uploadedBy?: string;
  validLeagues?: string[];
}

interface Account {
  id: string;
  name?: string;
  hebrewName?: string;
  email?: string;
}

export default function WomanPlayerPage() {
  const { user, loading } = useAuth();
  const { t, isRtl } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const fromPath = searchParams.get('from') || '/players';
  const scrollTo = searchParams.get('scrollTo');
  const isFromDashboard = fromPath === '/dashboard';
  const backHref = isFromDashboard && scrollTo
    ? `/dashboard?scrollTo=${encodeURIComponent(scrollTo)}`
    : fromPath;
  const backLabel = isFromDashboard ? t('nav_dashboard') : t('players_women');
  const [player, setPlayer] = useState<WomanPlayer | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(true);
  const [documents, setDocuments] = useState<PlayerDocument[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [noteModalOpen, setNoteModalOpen] = useState<'add' | 'edit' | null>(null);
  const [editingNote, setEditingNote] = useState<WomanPlayerNote | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [deleteConfirmNote, setDeleteConfirmNote] = useState<WomanPlayerNote | null>(null);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [docToDelete, setDocToDelete] = useState<PlayerDocument | null>(null);
  const [mandateToggling, setMandateToggling] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [playerTasks, setPlayerTasks] = useState<{ id: string; title?: string; notes?: string; dueDate?: number; isCompleted?: boolean; agentId?: string; agentName?: string; createdAt?: number; createdByAgentId?: string; createdByAgentName?: string; templateId?: string; linkedAgentContactId?: string; linkedAgentContactName?: string; linkedAgentContactPhone?: string }[]>([]);
  const [addingToPortfolio, setAddingToPortfolio] = useState(false);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [showPortfolioLanguageModal, setShowPortfolioLanguageModal] = useState(false);
  const [clubRequests, setClubRequests] = useState<(ClubRequest & { status?: string; clubName?: string; clubLogo?: string; clubCountry?: string; contactPhoneNumber?: string })[]>([]);
  const [playerOffers, setPlayerOffers] = useState<{ id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string; [key: string]: unknown }[]>([]);
  const prevValidMandateCountRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [fullName, setFullName] = useState('');
  const [positions, setPositions] = useState<string[]>([]);
  const [currentClub, setCurrentClub] = useState('');
  const [age, setAge] = useState('');
  const [nationality, setNationality] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [soccerDonnaUrl, setSoccerDonnaUrl] = useState('');
  const [fmInsideUrl, setFmInsideUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [agentPhone, setAgentPhone] = useState('');

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, PLAYERS_WOMEN_COLLECTION, id), (snap) => {
      if (snap.exists()) {
        setPlayer({ id: snap.id, ...snap.data() } as WomanPlayer);
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
    const q = query(
      collection(db, 'PlayerDocuments'),
      where('playerWomenId', '==', id)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as PlayerDocument))
        .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
      setDocuments(docs);

      const now = Date.now();
      const mandateDocs = docs.filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE');
      for (const m of mandateDocs) {
        const expiresAt = m.expiresAt;
        if (expiresAt != null && expiresAt < now && !m.expired) {
          try {
            await updateDoc(doc(db, 'PlayerDocuments', m.id), { expired: true });
          } catch {
            /* ignore */
          }
        }
      }

      const validMandates = mandateDocs.filter(
        (d) => !d.expired && (d.expiresAt == null || d.expiresAt >= now)
      );
      const validCount = validMandates.length;
      if (prevValidMandateCountRef.current != null && validCount !== prevValidMandateCountRef.current) {
        const hasMandate = validCount > 0;
        try {
          await updateDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id), { haveMandate: hasMandate });
          setPlayer((p) => (p ? { ...p, haveMandate: hasMandate } : null));
        } catch {
          /* ignore */
        }
      }
      prevValidMandateCountRef.current = validCount;
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(
      collection(db, 'AgentTasksWomen'),
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
    const unsub = onSnapshot(collection(db, CLUB_REQUESTS_COLLECTIONS.women), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClubRequest & { status?: string; clubName?: string; clubLogo?: string; clubCountry?: string; contactPhoneNumber?: string }));
      setClubRequests(list);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!id) {
      setPlayerOffers([]);
      return;
    }
    const womenProfile = `women-${id}`;
    const q = query(
      collection(db, 'PlayerOffers'),
      where('playerTmProfile', '==', womenProfile)
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string; [key: string]: unknown }));
      setPlayerOffers(list);
    });
    return () => unsub();
  }, [id]);

  const getCurrentUserName = useCallback((): string | undefined => {
    if (!user?.email) return undefined;
    const account = accounts.find(
      (a) => a.email?.toLowerCase() === user.email?.toLowerCase()
    );
    return isRtl ? (account?.hebrewName ?? account?.name) : (account?.name ?? account?.hebrewName);
  }, [user?.email, accounts, isRtl]);

  const resolveAgentName = (name: string | undefined): string => {
    if (!name) return '—';
    if (!isRtl) return name;
    const account = accounts.find(
      (a) => a.name?.toLowerCase() === name.toLowerCase() || a.hebrewName?.toLowerCase() === name.toLowerCase()
    );
    return account?.hebrewName || name;
  };

  const playerAsRoster: RosterPlayer | null = useMemo(() => {
    if (!player) return null;
    return {
      id: player.id,
      fullName: player.fullName,
      age: player.age,
      positions: player.positions ?? [],
      foot: player.foot,
      salaryRange: undefined,
      transferFee: undefined,
      tmProfile: undefined,
    };
  }, [player]);

  const matchingRequests = useMemo(() => {
    if (!playerAsRoster || !id) return [];
    const pending = clubRequests.filter((r) => (r.status ?? 'pending') === 'pending');
    const matching = matchingRequestsForPlayer(playerAsRoster, pending);
    const offerByRequestId = Object.fromEntries(
      playerOffers.map((o) => [o.requestId ?? '', o])
    );
    return matching.map((req) => ({
      request: req,
      offer: offerByRequestId[req.id] as { id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string; clubName?: string; clubLogo?: string; position?: string } | undefined,
    }));
  }, [playerAsRoster, id, clubRequests, playerOffers]);

  const handleMarkAsOffered = useCallback(
    async (requestId: string, clubName?: string, clubLogo?: string, position?: string, feedback?: string) => {
      if (!player || !id || !user?.email) return;
      const womenProfile = `women-${id}`;
      const agentName = accounts.find((a) => a.email?.toLowerCase() === user.email?.toLowerCase());
      const markedBy = isRtl ? (agentName?.hebrewName ?? agentName?.name) : (agentName?.name ?? agentName?.hebrewName);
      await addDoc(collection(db, 'PlayerOffers'), {
        playerTmProfile: womenProfile,
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
    [player, id, user?.email, accounts, isRtl]
  );

  const handleUpdateOfferFeedback = useCallback(async (offerId: string, feedback: string) => {
    await updateDoc(doc(db, 'PlayerOffers', offerId), { clubFeedback: feedback });
  }, []);

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

        const detectRes = await fetch('/api/documents/detect', {
          method: 'POST',
          body: formData,
        });

        let docType = 'OTHER';
        let suggestedName = file.name;
        let passportInfo: { firstName: string; lastName: string; dateOfBirth?: string; passportNumber?: string; nationality?: string } | undefined;
        let mandateExpiresAt: number | undefined;
        let validLeagues: string[] | undefined;

        if (detectRes.ok) {
          const detection = (await detectRes.json()) as {
            documentType?: string;
            suggestedName?: string;
            passportInfo?: { firstName: string; lastName: string; dateOfBirth?: string; passportNumber?: string; nationality?: string };
            mandateExpiresAt?: number;
            validLeagues?: string[];
          };
          docType = detection.documentType ?? 'OTHER';
          suggestedName = detection.suggestedName ?? file.name;
          passportInfo = detection.passportInfo;
          mandateExpiresAt = detection.mandateExpiresAt;
          validLeagues = detection.validLeagues;
        }

        if (docType === 'MANDATE' && !suggestedName?.trim()) {
          const pName = ([player.passportDetails?.firstName, player.passportDetails?.lastName].filter(Boolean).join('_') || player.fullName?.replace(/\s+/g, '_') || 'player')
            .replace(/[<>:"/\\|?*]/g, '_')
            .slice(0, 60);
          const ext = (file.name || '').match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
          const extFromType = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : (file.type === 'image/jpeg' || file.type === 'image/jpg') ? 'jpg' : null;
          const suffix = ext === 'pdf' || ext === 'png' || ext === 'jpg' || ext === 'jpeg' ? (ext === 'jpeg' ? '.jpg' : `.${ext}`) : (extFromType ? `.${extFromType}` : '.pdf');
          suggestedName = `Mandate_${pName}${suffix}`;
        } else if (!suggestedName?.trim()) {
          const ext = (file.name || '').match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
          const extFromType = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : (file.type === 'image/jpeg' || file.type === 'image/jpg') ? 'jpg' : null;
          const suffix = ext ? (ext === 'jpeg' ? '.jpg' : `.${ext}`) : (extFromType ? `.${extFromType}` : '');
          suggestedName = file.name || `Document_${Date.now()}${suffix}`;
        }

        if (docType === 'PASSPORT' && player.passportDetails) {
          setUploadError('passport_already_exists');
          setUploadingDocument(false);
          setTimeout(() => setUploadError(null), 4000);
          return;
        }

        let bytes = await file.arrayBuffer();
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          bytes = await flattenPdf(bytes);
        }

        const storageFolder = `women_${id}`;
        const storageFileName = `${crypto.randomUUID()}_${suggestedName}`;
        const storageRef = ref(storage, `player_docs/${storageFolder}/${storageFileName}`);
        await uploadBytes(storageRef, bytes);
        const url = await getDownloadURL(storageRef);

        const createdBy = getCurrentUserName() ?? undefined;
        const uploadedBy = docType === 'MANDATE' ? createdBy : undefined;

        const data: Record<string, unknown> = {
          playerWomenId: id,
          type: docType,
          name: suggestedName,
          storageUrl: url,
          uploadedAt: Date.now(),
        };
        if (mandateExpiresAt != null) data.expiresAt = mandateExpiresAt;
        if (validLeagues?.length) data.validLeagues = validLeagues;
        if (docType === 'MANDATE' && uploadedBy) data.uploadedBy = uploadedBy;

        await addDoc(collection(db, 'PlayerDocuments'), data);

        if (docType === 'PASSPORT' && passportInfo) {
          const passportDetails = {
            firstName: passportInfo.firstName || undefined,
            lastName: passportInfo.lastName || undefined,
            dateOfBirth: passportInfo.dateOfBirth || undefined,
            passportNumber: passportInfo.passportNumber || undefined,
            nationality: passportInfo.nationality || undefined,
            lastUpdatedAt: Date.now(),
          };
          await updateDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id), { passportDetails });
          setPlayer((p) => (p ? { ...p, passportDetails } : null));
        }

        if (docType === 'MANDATE') {
        await addDoc(collection(db, 'FeedEventsWomen'), {
          type: 'MANDATE_UPLOADED',
          playerName: player.fullName,
          playerImage: player.profileImage,
          playerWomenId: id,
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
        await updateDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id), { haveMandate: hasMandate });
        setPlayer((p) => (p ? { ...p, haveMandate: hasMandate } : null));

        const createdBy = getCurrentUserName();
        const mandateExpiryAt =
          hasMandate
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

        await addDoc(collection(db, 'FeedEventsWomen'), {
          type: hasMandate ? 'MANDATE_SWITCHED_ON' : 'MANDATE_SWITCHED_OFF',
          playerName: player.fullName,
          playerImage: player.profileImage,
          playerWomenId: id,
          agentName: createdBy,
          ...(mandateExpiryAt != null && { mandateExpiryAt }),
          timestamp: Date.now(),
        });
      } catch {
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
        await updateDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id), { passportDetails: deleteField() });
        setPlayer((p) => (p ? { ...p, passportDetails: undefined } : null));
      }
      setDocToDelete(null);
    },
    [id]
  );

  const applyNoteListUpdate = useCallback(
    async (newNoteList: WomanPlayerNote[]) => {
      if (!player || !id) return;
      await updateDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id), { noteList: newNoteList });
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
        const newNote: WomanPlayerNote = {
          notes: text.trim(),
          createBy: createdBy,
          createdAt: Date.now(),
        };
        const newNoteList = [...currentNotes, newNote];
        await applyNoteListUpdate(newNoteList);
        const notePreview = text.trim().slice(0, 120) + (text.length > 120 ? '…' : '');
        await addDoc(collection(db, 'FeedEventsWomen'), {
          type: 'NOTE_ADDED',
          playerName: player.fullName,
          playerImage: player.profileImage,
          playerWomenId: id,
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
    [player, id, getCurrentUserName, applyNoteListUpdate]
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
    async (note: WomanPlayerNote) => {
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
        await addDoc(collection(db, 'FeedEventsWomen'), {
          type: 'NOTE_DELETED',
          playerName: player.fullName,
          playerImage: player.profileImage,
          playerWomenId: id,
          agentName: deletedBy,
          extraInfo: notePreview,
          timestamp: Date.now(),
        });
        setDeleteConfirmNote(null);
      } finally {
        setNoteSaving(false);
      }
    },
    [player, id, getCurrentUserName, applyNoteListUpdate]
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

        const playerPayload = {
          fullName: player.fullName,
          profileImage: player.profileImage,
          positions: player.positions,
          marketValue: player.marketValue,
          currentClub: player.currentClub,
          age: player.age,
          height: player.height,
          nationality: player.nationality,
          foot: player.foot,
          agency: player.agentInChargeName,
          ...(player.playerPhoneNumber ? { playerPhoneNumber: player.playerPhoneNumber } : {}),
          ...(player.agentPhoneNumber ? { agentPhoneNumber: player.agentPhoneNumber } : {}),
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
          playerWomenId: id,
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
          collection(db, 'PortfolioWomen'),
          where('agentId', '==', user.uid),
          where('playerWomenId', '==', id),
          where('lang', '==', lang)
        );
        const existingSnap = await getDocs(existingQ);
        if (!existingSnap.empty) {
          const existingId = existingSnap.docs[0].id;
          await setDoc(doc(db, 'PortfolioWomen', existingId), portfolioDoc);
        } else {
          await addDoc(collection(db, 'PortfolioWomen'), portfolioDoc);
        }

        router.push(`/portfolio?fromPlayer=${id}&platform=women`);
      } catch (e) {
        console.error('Add to portfolio failed:', e);
        setPortfolioError(e instanceof Error ? e.message : t('player_info_portfolio_scout_failed'));
      } finally {
        setAddingToPortfolio(false);
      }
    },
    [player, id, documents, user, addingToPortfolio, t, router]
  );

  const getPhone = () => player?.playerPhoneNumber;
  const getAgentPhone = () => player?.agentPhoneNumber;

  const openEdit = () => {
    if (!player) return;
    setFullName(player.fullName);
    setPositions(player.positions ?? []);
    setCurrentClub(player.currentClub?.clubName ?? '');
    setAge(player.age ?? '');
    setNationality(player.nationality ?? '');
    setMarketValue(player.marketValue ?? '');
    setProfileImage(player.profileImage ?? '');
    setSoccerDonnaUrl(player.soccerDonnaUrl ?? '');
    setFmInsideUrl(player.fmInsideUrl ?? '');
    setNotes(player.notes ?? '');
    setPlayerPhone(player.playerPhoneNumber ?? '');
    setAgentPhone(player.agentPhoneNumber ?? '');
    setError('');
    setEditOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !fullName.trim()) return;
    setError('');
    setSaving(true);
    try {
      const pPhone = playerPhone.trim();
      const aPhone = agentPhone.trim();

      const updateData: Record<string, unknown> = {
        fullName: fullName.trim(),
        positions: positions.length > 0 ? positions : undefined,
        currentClub: currentClub.trim() ? { clubName: currentClub.trim() } : undefined,
        age: age.trim() || undefined,
        nationality: nationality.trim() || undefined,
        marketValue: marketValue.trim() || undefined,
        profileImage: profileImage.trim() || undefined,
        soccerDonnaUrl: soccerDonnaUrl.trim() || undefined,
        fmInsideUrl: fmInsideUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        playerPhoneNumber: pPhone || deleteField(),
        agentPhoneNumber: aPhone || deleteField(),
      };
      const sanitized = Object.fromEntries(
        Object.entries(updateData).filter(([, v]) => v !== undefined)
      );
      await updateDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id), sanitized);
      setPlayer((prev) =>
        prev
          ? {
              ...prev,
              fullName: fullName.trim(),
              positions: positions.length > 0 ? positions : undefined,
              currentClub: currentClub.trim() ? { clubName: currentClub.trim() } : undefined,
              age: age.trim() || undefined,
              nationality: nationality.trim() || undefined,
              marketValue: marketValue.trim() || undefined,
              profileImage: profileImage.trim() || undefined,
              soccerDonnaUrl: soccerDonnaUrl.trim() || undefined,
              fmInsideUrl: fmInsideUrl.trim() || undefined,
              notes: notes.trim() || undefined,
              playerPhoneNumber: pPhone || undefined,
              agentPhoneNumber: aPhone || undefined,
            }
          : null
      );
      setEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    setError('');
    try {
      await deleteWomanPlayer(id);
      router.push('/players');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const togglePosition = (pos: string) => {
    setPositions((prev) =>
      prev.includes(pos) ? prev.filter((p) => p !== pos) : [...prev, pos]
    );
  };

  const formatClub = (c: string | undefined) => {
    if (!c) return '—';
    if (c.toLowerCase() === 'vereinslos' || c === 'Without Club') return t('without_club');
    return c;
  };

  const notesList = player?.noteList ?? [];
  const sortedNotes = [...notesList].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const hasValidMandate = documents.some(
    (d) =>
      (d.type ?? '').toUpperCase() === 'MANDATE' &&
      !d.expired &&
      (d.expiresAt == null || d.expiresAt >= Date.now())
  );

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse text-[var(--women-rose)] font-display">
          {t('loading')}
        </div>
      </div>
    );
  }

  if (loadingPlayer) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-12">
          <div className="animate-pulse text-mgsr-muted">{t('loading')}</div>
        </div>
      </AppLayout>
    );
  }

  if (!player) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-12">
          <p className="text-mgsr-muted mb-6">Player not found</p>
          <Link
            href={backHref}
            scroll={false}
            className="text-[var(--women-rose)] hover:underline"
          >
            ← {t('add_player_back')} {backLabel}
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <Link
            href={backHref}
            scroll={false}
            className="hidden lg:inline-flex items-center gap-2 text-mgsr-muted hover:text-[var(--women-rose)] transition-colors group"
          >
            <span className={`transition-transform group-hover:-translate-x-1 ${isRtl ? 'rotate-180' : ''}`}>←</span>
            <span className="text-sm font-medium">{backLabel}</span>
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={openEdit}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-[var(--women-rose)] hover:border-[var(--women-rose)]/50 transition"
            >
              {t('woman_player_edit')}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-mgsr-card border border-mgsr-border text-mgsr-muted hover:text-red-400 hover:border-red-400/50 transition"
            >
              {t('woman_player_delete')}
            </button>
          </div>
        </div>

        {/* Hero card */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6 bg-mgsr-card border border-mgsr-border rounded-2xl shadow-[0_0_30px_rgba(232,160,191,0.08)] mb-8">
          <img
            src={player.profileImage || 'https://placehold.co/120x120/1A2736/E8A0BF?text=?'}
            alt=""
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover bg-mgsr-dark shrink-0 self-center sm:self-start"
          />
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-xl sm:text-2xl text-mgsr-text">{player.fullName}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {player.positions?.map((pos) => (
                <span
                  key={pos}
                  className="px-2.5 py-0.5 rounded-xl bg-[var(--women-rose)]/15 text-[var(--women-rose)] text-xs font-semibold"
                >
                  {pos}
                </span>
              ))}
            </div>
            <p className="text-mgsr-muted text-sm mt-2">
              {formatClub(player.currentClub?.clubName)}
              {player.age && ` • ${t('players_age_display_women').replace('{age}', player.age)}`}
              {player.nationality && ` • ${player.nationality}`}
            </p>
            {player.marketValue && (
              <p className="text-[var(--women-rose)] font-semibold mt-2">{player.marketValue}</p>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid lg:grid-cols-3 gap-5 sm:gap-8">
          {/* Left column - Mandate + Documents */}
          <div className="lg:col-span-1 space-y-6">
            {/* Mandate switch */}
            <div className="p-4 sm:p-5 rounded-xl bg-mgsr-card border border-mgsr-border shadow-[0_0_30px_rgba(232,160,191,0.08)]">
              <div className="flex items-center justify-between gap-4">
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
                    const leagues = Array.from(new Set(valid.flatMap((d) => d.validLeagues ?? [])));
                    if (maxExp <= 0 && leagues.length === 0) return null;
                    const d = maxExp > 0 ? new Date(maxExp) : null;
                    const str = d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
                    return (
                      <>
                        {str && (
                          <p className="text-xs text-mgsr-muted mt-0.5" dir="ltr">
                            {t('player_info_mandate_expires').replace('%s', str)}
                          </p>
                        )}
                        {leagues.length > 0 && (
                          <p className="text-xs text-[var(--women-rose)]/70 mt-0.5" dir="ltr">
                            {leagues.join(', ')}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
                  <label className="mgsr-switch">
                    <input
                      type="checkbox"
                      checked={player.haveMandate ?? false}
                      disabled={mandateToggling}
                      onChange={() => handleMandateToggle(!(player.haveMandate ?? false))}
                    />
                    <span className="mgsr-slider" />
                  </label>
              </div>
            </div>

            {/* Contact - agent phone + player phone */}
            {(getPhone() || getAgentPhone()) && (
              <div className="p-4 sm:p-5 rounded-xl bg-mgsr-card border border-mgsr-border shadow-[0_0_30px_rgba(232,160,191,0.08)]">
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
                        className="text-[var(--women-rose)] hover:underline inline-block"
                        dir="ltr"
                      >
                        {getAgentPhone()}
                      </a>
                    </div>
                  )}
                  {getPhone() && (
                    <div>
                      <p className="text-xs text-mgsr-muted">{t('player_info_player_phone_women')}</p>
                      <a
                        href={toWhatsAppUrl(getPhone()) ?? `tel:${getPhone()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--women-rose)] hover:underline inline-block"
                        dir="ltr"
                      >
                        {getPhone()}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Matching Requests */}
            {player && id && (
              <MatchingRequestsSection
                matchingRequests={matchingRequests}
                playerProfileUrl={player.fmInsideUrl ?? (typeof window !== 'undefined' ? `${window.location.origin}/players/women/${id}` : '')}
                accounts={accounts}
                currentUserEmail={user?.email}
                onMarkAsOffered={handleMarkAsOffered}
                onUpdateFeedback={handleUpdateOfferFeedback}
                isWomen
              />
            )}

            {/* Documents */}
            <div className="p-5 rounded-xl bg-mgsr-card border border-mgsr-border shadow-[0_0_30px_rgba(232,160,191,0.08)]">
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
                  <div className="w-5 h-5 border-2 border-[var(--women-rose)] border-t-transparent rounded-full animate-spin" />
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
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--women-rose)]/20 text-[var(--women-rose)] font-medium text-sm hover:bg-[var(--women-rose)]/30 transition"
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
                        className="flex-1 min-w-0 truncate text-[var(--women-rose)] hover:underline"
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
                          className="p-2 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/10 rounded-lg transition"
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
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30 transition font-medium text-sm disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    {t('player_info_add_document')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right column - FM Intelligence + Highlights + Notes (like MGSR Team) */}
          <div className="lg:col-span-2 space-y-8">
            {/* FMInside Women - direct fetch, same layout as men's FmIntelligencePanel */}
            {player.fullName && (
              <FmInsideWomenPanel
                playerName={player.fullName}
                positions={player.positions}
                nationality={player.nationality}
                age={player.age}
                club={player.currentClub?.clubName}
                fmInsideId={player.fmInsideId}
                fmInsideUrl={player.fmInsideUrl}
                onFmUrlFound={
                  id
                    ? (url) => {
                        updateDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id), { fmInsideUrl: url });
                        setPlayer((p) => (p ? { ...p, fmInsideUrl: url } : null));
                      }
                    : undefined
                }
                isRtl={isRtl}
              />
            )}

            {/* PlaymakerStats Women Panel */}
            {player.fullName && (
              <PlaymakerStatsWomenPanel
                playerName={player.fullName}
                age={player.age}
                club={player.currentClub?.clubName}
                isRtl={isRtl}
              />
            )}

            {/* Highlights */}
            {player.fullName && (
              <PlayerHighlightsPanel
                playerId={id!}
                pinnedHighlights={(player.pinnedHighlights ?? []) as HighlightVideo[]}
                playerName={player.fullName}
                teamName={player.currentClub?.clubName}
                position={player.positions?.[0] ?? ''}
                nationality={player.nationality}
                clubCountry={player.currentClub?.clubCountry}
                isRtl={isRtl}
                playerCollection="PlayersWomen"
                accentVariant="women"
              />
            )}

            {/* Player-related tasks */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                <h2 className="text-lg font-display font-semibold text-mgsr-text">
                  {t('player_tasks_section_women')}
                </h2>
                <button
                  onClick={() => setShowAddTaskModal(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30 transition font-medium text-sm shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {t('player_tasks_add_women')}
                </button>
              </div>
              {playerTasks.length === 0 ? (
                <div
                  onClick={() => setShowAddTaskModal(true)}
                  className="p-8 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center text-mgsr-muted cursor-pointer hover:border-[var(--women-rose)]/30 hover:bg-mgsr-card/70 transition shadow-[0_0_30px_rgba(232,160,191,0.05)]"
                >
                  {t('player_tasks_empty_women')}
                </div>
              ) : (
                <div className="space-y-3">
                  {playerTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-mgsr-card border border-mgsr-border rounded-xl hover:border-[var(--women-rose)]/30 transition group shadow-[0_0_30px_rgba(232,160,191,0.05)]"
                    >
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await updateDoc(doc(db, 'AgentTasksWomen', task.id), {
                              isCompleted: !task.isCompleted,
                              completedAt: task.isCompleted ? 0 : Date.now(),
                            });
                          } catch {
                            /* ignore */
                          }
                        }}
                        className={`shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition ${
                          task.isCompleted ? 'border-[var(--women-rose)] bg-[var(--women-rose)]' : 'border-mgsr-muted group-hover:border-[var(--women-rose)] cursor-pointer'
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
                              {t('tasks_opened_by')} <span className="text-[var(--women-rose)]">{task.createdByAgentName}</span>
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
                              <a href={`tel:${task.linkedAgentContactPhone}`} className="ms-1.5 text-[var(--women-rose)] hover:underline">{task.linkedAgentContactPhone}</a>
                            )}
                          </p>
                        )}
                      </div>
                      <Link
                        href="/tasks"
                        className="shrink-0 p-2 rounded-lg text-mgsr-muted hover:text-[var(--women-rose)] hover:bg-[var(--women-rose)]/10 transition"
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
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--women-rose)]/20 text-[var(--women-rose)] hover:bg-[var(--women-rose)]/30 transition font-medium text-sm shrink-0"
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
                  className="p-8 bg-mgsr-card/50 border border-mgsr-border rounded-xl text-center text-mgsr-muted cursor-pointer hover:border-[var(--women-rose)]/30 hover:bg-mgsr-card/70 transition shadow-[0_0_30px_rgba(232,160,191,0.05)]"
                >
                  {t('player_info_no_notes')}
                </div>
              ) : (
                <div className="space-y-4">
                  {player.notes && (
                    <div className="p-5 bg-mgsr-card border border-mgsr-border rounded-xl shadow-[0_0_30px_rgba(232,160,191,0.05)]">
                      <p className="text-mgsr-text whitespace-pre-wrap">{player.notes}</p>
                    </div>
                  )}
                  {sortedNotes.map((n, i) => (
                    <div
                      key={i}
                      className="group flex flex-col sm:flex-row sm:items-start gap-3 p-5 bg-mgsr-card border border-mgsr-border rounded-xl shadow-[0_0_30px_rgba(232,160,191,0.05)]"
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
                          className="p-2 rounded-lg text-mgsr-muted hover:text-[var(--women-rose)] hover:bg-[var(--women-rose)]/10 transition"
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

        {/* Bottom bar - Generate mandate + Prepare for portfolio */}
        <div className="sticky bottom-0 left-0 right-0 mt-8 rounded-t-2xl border border-t border-mgsr-border bg-mgsr-card p-4 shadow-[0_0_30px_rgba(232,160,191,0.08)]">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-8">
              {player.passportDetails && (
                <Link
                  href={hasValidMandate ? '#' : `/players/women/${id}/generate-mandate`}
                  className={`flex items-center gap-2 ${hasValidMandate ? 'cursor-default opacity-50' : 'text-[var(--women-rose)] hover:underline'}`}
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
                  setShowPortfolioLanguageModal(true);
                }}
                disabled={addingToPortfolio}
                className="flex items-center gap-2 text-[var(--women-rose)] hover:underline disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="font-medium text-sm">{t('player_info_prepare_portfolio')}</span>
              </button>
            </div>
            {portfolioError && (
              <p className="text-sm text-red-400 text-center">{portfolioError}</p>
            )}
          </div>
        </div>

        <div className="mt-6 text-xs text-mgsr-muted">
          Data: Wosostat · SoccerDonna · FMInside
        </div>

        {/* Delete document confirmation */}
        {docToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 women-dialog-backdrop" onClick={() => setDocToDelete(null)}>
            <div
              className="women-dialog-content bg-mgsr-card rounded-2xl p-6 max-w-sm w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="women-dialog-accent -mx-6 -mt-6 mb-5" />
              <p className="text-mgsr-text font-medium mb-5">
                {t('player_info_delete_doc_confirm')} &quot;{docToDelete.name || docToDelete.type || 'document'}&quot;?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDocToDelete(null)}
                  className="px-4 py-2.5 rounded-xl text-mgsr-muted hover:bg-[var(--women-rose)]/10 hover:text-[var(--women-rose)] transition font-medium"
                >
                  {t('player_info_note_cancel')}
                </button>
                <button
                  onClick={() => handleDeleteDocument(docToDelete)}
                  className="px-4 py-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition font-medium"
                >
                  {t('tasks_delete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Portfolio preparation loader */}
        {addingToPortfolio && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-mgsr-card border border-mgsr-border shadow-[0_0_30px_rgba(232,160,191,0.08)]"
            >
              <div className="w-10 h-10 border-2 border-[var(--women-rose)] border-t-transparent rounded-full animate-spin" />
              <p className="text-mgsr-text font-medium">
                {t('player_info_portfolio_adding')}
              </p>
            </div>
          </div>
        )}

        {/* Portfolio language choice modal */}
        {showPortfolioLanguageModal && !addingToPortfolio && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 women-dialog-backdrop"
            onClick={() => setShowPortfolioLanguageModal(false)}
          >
            <div className="absolute inset-0" aria-hidden />
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="relative w-full max-w-md women-dialog-content bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="women-dialog-accent -mx-6 -mt-6 mb-5" />
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
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--women-rose)]/20 text-[var(--women-rose)] font-medium hover:bg-[var(--women-rose)]/30 disabled:opacity-50"
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
                  className="flex-1 px-4 py-3 rounded-xl bg-[var(--women-rose)]/20 text-[var(--women-rose)] font-medium hover:bg-[var(--women-rose)]/30 disabled:opacity-50"
                >
                  English
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit modal */}
        {editOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 women-dialog-backdrop"
            onClick={() => !saving && setEditOpen(false)}
          >
            <div
              className="women-dialog-content bg-mgsr-card rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="women-dialog-accent" />
              <div className="p-6 border-b border-mgsr-border/50">
                <h2 className="font-display font-bold text-xl text-mgsr-text">
                  {t('woman_player_edit')} {player.fullName}
                </h2>
              </div>
              <form onSubmit={handleSave} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                    {error}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                    {t('add_woman_player_full_name')}
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:border-[var(--women-rose)]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                    {t('add_woman_player_positions')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {POSITIONS.map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => togglePosition(pos)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                          positions.includes(pos)
                            ? 'bg-[var(--women-rose)]/20 text-[var(--women-rose)]'
                            : 'bg-mgsr-dark border border-mgsr-border text-mgsr-muted hover:text-mgsr-text'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                      {t('add_woman_player_club')}
                    </label>
                    <input
                      type="text"
                      value={currentClub}
                      onChange={(e) => setCurrentClub(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:border-[var(--women-rose)]/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                      {t('add_woman_player_age')}
                    </label>
                    <input
                      type="text"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:border-[var(--women-rose)]/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                      {t('add_woman_player_nationality')}
                    </label>
                    <input
                      type="text"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:border-[var(--women-rose)]/50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                      {t('add_woman_player_market_value')}
                    </label>
                    <input
                      type="text"
                      value={marketValue}
                      onChange={(e) => setMarketValue(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:border-[var(--women-rose)]/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                    {t('add_woman_player_soccerdonna_url')}
                  </label>
                  <input
                    type="url"
                    value={soccerDonnaUrl}
                    onChange={(e) => setSoccerDonnaUrl(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:border-[var(--women-rose)]/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                    {t('add_woman_player_fminside_url')}
                  </label>
                  <input
                    type="url"
                    value={fmInsideUrl}
                    onChange={(e) => setFmInsideUrl(e.target.value)}
                    placeholder="https://fminside.net/players/7-fm-26/2000351404-diana-bieliakova"
                    className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50"
                  />
                  <p className="text-xs text-mgsr-muted mt-1">{t('add_woman_player_fminside_url_hint')}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                    {t('add_woman_player_profile_image')}
                  </label>
                  <input
                    type="url"
                    value={profileImage}
                    onChange={(e) => setProfileImage(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:border-[var(--women-rose)]/50"
                  />
                </div>
                <div className="space-y-4">
                  <p className="text-xs font-medium text-mgsr-muted uppercase tracking-wider">
                    {t('add_player_contact_section')}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-mgsr-muted mb-1.5">{t('player_info_player_phone_women')}</label>
                      <input
                        type="tel"
                        value={playerPhone}
                        onChange={(e) => setPlayerPhone(e.target.value)}
                        placeholder="+972 50 123 4567"
                        className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-mgsr-muted mb-1.5">{t('player_info_agent_phone')}</label>
                      <input
                        type="tel"
                        value={agentPhone}
                        onChange={(e) => setAgentPhone(e.target.value)}
                        placeholder="+972 50 987 6543"
                        className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/50"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-mgsr-muted uppercase tracking-wider mb-1.5">
                    {t('add_woman_player_notes')}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text focus:outline-none focus:border-[var(--women-rose)]/50 resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => !saving && setEditOpen(false)}
                    className="flex-1 py-3 rounded-xl font-medium border border-mgsr-border text-mgsr-muted hover:bg-[var(--women-rose)]/10 hover:text-[var(--women-rose)] hover:border-[var(--women-rose)]/30 transition"
                  >
                    {t('woman_player_cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !fullName.trim()}
                    className="flex-1 py-3 rounded-xl font-semibold bg-[var(--women-gradient)] text-white shadow-[0_0_20px_rgba(232,160,191,0.25)] hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    {saving ? t('add_woman_player_saving') : t('woman_player_save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete confirmation modal */}
        {deleteOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 women-dialog-backdrop"
            onClick={() => !deleting && setDeleteOpen(false)}
          >
            <div
              className="women-dialog-content bg-mgsr-card rounded-2xl max-w-sm w-full p-6 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="women-dialog-accent -mx-6 -mt-6 mb-5" />
              <h3 className="font-display font-bold text-lg text-mgsr-text mb-2">
                {t('woman_player_delete')}
              </h3>
              <p className="text-mgsr-muted text-sm mb-6">
                {t('woman_player_delete_confirm_name').replace('{name}', player.fullName)}
              </p>
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm">
                  {error}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => !deleting && setDeleteOpen(false)}
                  className="flex-1 py-3 rounded-xl font-medium border border-mgsr-border text-mgsr-muted hover:bg-[var(--women-rose)]/10 hover:text-[var(--women-rose)] hover:border-[var(--women-rose)]/30 transition"
                >
                  {t('woman_player_cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-3 rounded-xl font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/25 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {deleting ? t('add_woman_player_saving') : t('woman_player_delete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Note Add/Edit Modal */}
        {noteModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 women-dialog-backdrop"
            onClick={() => !noteSaving && setNoteModalOpen(null)}
          >
            <div className="absolute inset-0" aria-hidden />
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="women-dialog-content relative w-full sm:max-w-lg bg-mgsr-card rounded-t-2xl sm:rounded-2xl p-6 max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="women-dialog-accent -mx-6 -mt-6 mb-4" />
              <h3 className="text-lg font-display font-semibold text-mgsr-text mb-4">
                {noteModalOpen === 'add' ? t('player_info_add_note') : t('player_info_edit_note')}
              </h3>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={t('player_info_note_placeholder')}
                rows={5}
                className="w-full px-4 py-3 rounded-xl bg-mgsr-dark border border-mgsr-border text-mgsr-text placeholder-mgsr-muted focus:outline-none focus:border-[var(--women-rose)]/60 resize-none"
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
                  className="flex-1 px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-[var(--women-rose)]/10 hover:text-[var(--women-rose)] hover:border-[var(--women-rose)]/30 transition disabled:opacity-50"
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
                  className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--women-gradient)] text-white font-medium shadow-[0_0_20px_rgba(232,160,191,0.25)] hover:opacity-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 women-dialog-backdrop"
            onClick={() => !noteSaving && setDeleteConfirmNote(null)}
          >
            <div
              dir={isRtl ? 'rtl' : 'ltr'}
              className="women-dialog-content relative w-full max-w-sm bg-mgsr-card rounded-2xl p-6 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="women-dialog-accent -mx-6 -mt-6 mb-5" />
              <p className="text-mgsr-text mb-6">{t('player_info_delete_note_confirm')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmNote(null)}
                  disabled={noteSaving}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-mgsr-border text-mgsr-muted hover:bg-[var(--women-rose)]/10 hover:text-[var(--women-rose)] hover:border-[var(--women-rose)]/30 transition disabled:opacity-50"
                >
                  {t('player_info_note_cancel')}
                </button>
                <button
                  onClick={() => handleDeleteNote(deleteConfirmNote)}
                  disabled={noteSaving}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/25 transition disabled:opacity-50"
                >
                  {noteSaving ? '...' : t('player_info_delete_note')}
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
                  playerId: id!,
                  playerName: player.fullName,
                  playerWomenId: id,
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
          taskCollection="AgentTasksWomen"
        />
      </div>
    </AppLayout>
  );
}
