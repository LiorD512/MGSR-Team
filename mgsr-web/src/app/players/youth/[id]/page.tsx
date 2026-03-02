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
  PLAYERS_YOUTH_COLLECTION,
  type YouthPlayer,
  type YouthPlayerNote,
  updateYouthPlayer,
  deleteYouthPlayer,
  computeAgeGroup,
} from '@/lib/playersYouth';
import { flattenPdf } from '@/lib/pdfFlatten';
import AddPlayerTaskModal from '@/components/AddPlayerTaskModal';
import AppLayout from '@/components/AppLayout';
import MatchingRequestsSection from '@/components/MatchingRequestsSection';
import { matchingRequestsForPlayer, type RosterPlayer, type ClubRequest } from '@/lib/requestMatcher';
import { CLUB_REQUESTS_COLLECTIONS } from '@/lib/platformCollections';
import { toWhatsAppUrl } from '@/lib/whatsapp';
import Link from 'next/link';

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
}

export default function YouthPlayerPage() {
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
  const backLabel = isFromDashboard ? t('player_info_back_dashboard') : t('youth_detail_back_to_players');

  const [player, setPlayer] = useState<YouthPlayer | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(true);
  const [documents, setDocuments] = useState<PlayerDocument[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  // Notes state
  const [noteModalOpen, setNoteModalOpen] = useState<'add' | 'edit' | null>(null);
  const [editingNote, setEditingNote] = useState<YouthPlayerNote | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
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
  const [playerTasks, setPlayerTasks] = useState<{ id: string; title?: string; notes?: string; dueDate?: number; isCompleted?: boolean; agentName?: string; createdAt?: number }[]>([]);

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
          try { await updateDoc(doc(db, 'PlayerDocuments', m.id), { expired: true }); } catch { /* */ }
        }
      }
      const validMandates = mandateDocs.filter((d) => !d.expired && (d.expiresAt == null || d.expiresAt >= now));
      const validCount = validMandates.length;
      if (prevValidMandateCountRef.current != null && validCount !== prevValidMandateCountRef.current) {
        const hasMandate = validCount > 0;
        try {
          await updateDoc(doc(db, PLAYERS_YOUTH_COLLECTION, id), { haveMandate: hasMandate });
          setPlayer((p) => (p ? { ...p, haveMandate: hasMandate } : null));
        } catch { /* */ }
      }
      prevValidMandateCountRef.current = validCount;
    });
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const q = query(collection(db, 'AgentTasksYouth'), where('playerId', '==', id));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as typeof playerTasks[0]))
        .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
      setPlayerTasks(list);
    });
    return () => unsub();
  }, [id]);

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
    const pending = clubRequests.filter((r) => (r.status ?? 'pending') === 'pending');
    const matching = matchingRequestsForPlayer(playerAsRoster, pending);
    const offerByRequestId = Object.fromEntries(playerOffers.map((o) => [o.requestId ?? '', o]));
    return matching.map((req) => ({
      request: req,
      offer: offerByRequestId[req.id] as { id: string; requestId?: string; clubFeedback?: string; offeredAt?: number; markedByAgentName?: string } | undefined,
    }));
  }, [playerAsRoster, id, clubRequests, playerOffers]);

  const handleMarkAsOffered = useCallback(
    async (requestId: string, clubName?: string, clubLogo?: string, position?: string, feedback?: string) => {
      if (!player || !id || !user?.email) return;
      const youthProfile = `youth-${id}`;
      const agentName = accounts.find((a) => a.email?.toLowerCase() === user.email?.toLowerCase());
      const markedBy = isRtl ? (agentName?.hebrewName ?? agentName?.name) : (agentName?.name ?? agentName?.hebrewName);
      await addDoc(collection(db, 'PlayerOffers'), {
        playerTmProfile: youthProfile, playerName: player.fullName ?? '', playerImage: player.profileImage ?? '',
        requestId, clubName: clubName ?? '', clubLogo: clubLogo ?? '', position: position ?? '',
        offeredAt: Date.now(), clubFeedback: feedback ?? '', markedByAgentName: markedBy ?? '',
      });
    },
    [player, id, user?.email, accounts, isRtl]
  );

  const handleUpdateOfferFeedback = useCallback(async (offerId: string, feedback: string) => {
    await updateDoc(doc(db, 'PlayerOffers', offerId), { clubFeedback: feedback });
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
        await addDoc(collection(db, 'PlayerDocuments'), data);

        if (docType === 'PASSPORT' && passportInfo) {
          const passportDetails = { firstName: passportInfo.firstName, lastName: passportInfo.lastName, dateOfBirth: passportInfo.dateOfBirth, passportNumber: passportInfo.passportNumber, nationality: passportInfo.nationality, lastUpdatedAt: Date.now() };
          await updateDoc(doc(db, PLAYERS_YOUTH_COLLECTION, id), { passportDetails });
          setPlayer((p) => (p ? { ...p, passportDetails } : null));
        }

        if (docType === 'MANDATE') {
          await addDoc(collection(db, 'FeedEventsYouth'), { type: 'MANDATE_UPLOADED', playerName: player.fullName, playerImage: player.profileImage, playerYouthId: id, agentName: createdBy, ...(mandateExpiresAt != null && { mandateExpiryAt: mandateExpiresAt }), timestamp: Date.now() });
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
        await updateDoc(doc(db, PLAYERS_YOUTH_COLLECTION, id), { haveMandate: hasMandate });
        setPlayer((p) => (p ? { ...p, haveMandate: hasMandate } : null));
        const createdBy = getCurrentUserName();
        await addDoc(collection(db, 'FeedEventsYouth'), { type: hasMandate ? 'MANDATE_SWITCHED_ON' : 'MANDATE_SWITCHED_OFF', playerName: player.fullName, playerImage: player.profileImage, playerYouthId: id, agentName: createdBy, timestamp: Date.now() });
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
        await updateDoc(doc(db, PLAYERS_YOUTH_COLLECTION, id), { passportDetails: deleteField() });
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
      await updateDoc(doc(db, PLAYERS_YOUTH_COLLECTION, id), { noteList: newNoteList });
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
        const newNote: YouthPlayerNote = { notes: text.trim(), createBy: createdBy, createdAt: Date.now() };
        await applyNoteListUpdate([...currentNotes, newNote]);
        await addDoc(collection(db, 'FeedEventsYouth'), { type: 'NOTE_ADDED', playerName: player.fullName, playerImage: player.profileImage, playerYouthId: id, agentName: createdBy, extraInfo: text.trim().slice(0, 120), timestamp: Date.now() });
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
        const newNoteList = currentNotes.filter((n) => !(n.notes === note.notes && n.createBy === note.createBy && n.createdAt === note.createdAt));
        await applyNoteListUpdate(newNoteList);
        await addDoc(collection(db, 'FeedEventsYouth'), { type: 'NOTE_DELETED', playerName: player.fullName, playerImage: player.profileImage, playerYouthId: id, agentName: deletedBy, timestamp: Date.now() });
        setDeleteConfirmNote(null);
      } finally {
        setNoteSaving(false);
      }
    },
    [player, id, getCurrentUserName, applyNoteListUpdate]
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

        const existingQ = query(
          collection(db, 'PortfolioYouth'),
          where('agentId', '==', user.uid),
          where('playerYouthId', '==', id),
          where('lang', '==', lang)
        );
        const existingSnap = await getDocs(existingQ);
        if (!existingSnap.empty) {
          const existingId = existingSnap.docs[0].id;
          await setDoc(doc(db, 'PortfolioYouth', existingId), portfolioDoc);
        } else {
          await addDoc(collection(db, 'PortfolioYouth'), portfolioDoc);
        }

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
      const updateData: Record<string, unknown> = {
        fullName: fullName.trim(),
        fullNameHe: fullNameHe.trim() || deleteField(),
        positions: positions.length > 0 ? positions : deleteField(),
        currentClub: currentClub.trim() ? { clubName: currentClub.trim() } : deleteField(),
        academy: academy.trim() || deleteField(),
        dateOfBirth: dateOfBirth.trim() || deleteField(),
        ageGroup: computedAgeGroup || deleteField(),
        nationality: nationality.trim() || deleteField(),
        profileImage: profileImage.trim() || deleteField(),
        ifaUrl: ifaUrl.trim() || deleteField(),
        notes: notes.trim() || deleteField(),
        playerPhoneNumber: playerPhone.trim() || deleteField(),
        playerEmail: playerEmail.trim() || deleteField(),
        parentContact: (parentName.trim() || parentPhone.trim())
          ? {
              parentName: parentName.trim() || null,
              parentRelationship: parentRelationship.trim() || null,
              parentPhoneNumber: parentPhone.trim() || null,
              parentEmail: parentEmail.trim() || null,
            }
          : deleteField(),
      };
      await updateDoc(doc(db, PLAYERS_YOUTH_COLLECTION, id), updateData);
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
      await deleteYouthPlayer(id);
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
  const cyanBtn = 'text-[var(--youth-cyan)] hover:bg-[var(--youth-cyan)]/10';
  const violetBtn = 'text-[var(--youth-violet)] hover:bg-[var(--youth-violet)]/10';

  // ── Loading / Not found ──
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-mgsr-dark flex items-center justify-center">
        <div className="animate-pulse youth-gradient-text font-display text-xl">Loading...</div>
      </div>
    );
  }

  if (loadingPlayer) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-12">
          <div className="animate-pulse text-mgsr-muted">Loading player...</div>
        </div>
      </AppLayout>
    );
  }

  if (!player) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto py-12">
          <p className="text-mgsr-muted mb-6">{t('youth_detail_not_found')}</p>
          <Link href={backHref} className="text-[var(--youth-cyan)] hover:underline">← {backLabel}</Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="max-w-5xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link href={backHref} className="hidden lg:inline-flex items-center gap-2 text-mgsr-muted hover:text-[var(--youth-cyan)] transition-colors group">
            <span className={`transition-transform group-hover:-translate-x-1 ${isRtl ? 'rotate-180' : ''}`}>←</span>
            <span className="text-sm font-medium">{backLabel}</span>
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setShowAddTaskModal(true)} className={`px-4 py-2 rounded-xl text-sm font-medium bg-white/5 border border-[var(--youth-violet)]/30 ${violetBtn} transition`}>
              {t('youth_detail_task_btn')}
            </button>
            <button type="button" onClick={openEdit} className={`px-4 py-2 rounded-xl text-sm font-medium bg-white/5 border border-[var(--youth-cyan)]/30 ${cyanBtn} transition`}>
              {t('youth_detail_edit')}
            </button>
            <button type="button" onClick={() => setDeleteOpen(true)} className="px-4 py-2 rounded-xl text-sm font-medium bg-white/5 border border-red-500/30 text-mgsr-muted hover:text-red-400 hover:border-red-400/50 transition">
              {t('youth_detail_delete')}
            </button>
          </div>
        </div>

        {/* ── Hero card ── */}
        <div className={`${glassCard} p-4 sm:p-6 mb-8 relative overflow-hidden`}>
          {/* Glow background */}
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full opacity-10 pointer-events-none" style={{ background: 'radial-gradient(circle, var(--youth-cyan) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full opacity-8 pointer-events-none" style={{ background: 'radial-gradient(circle, var(--youth-violet) 0%, transparent 70%)' }} />

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 relative z-10">
            <img
              src={player.profileImage || 'https://placehold.co/120x120/0A0F1C/00D4FF?text=?'}
              alt=""
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover bg-[var(--youth-cyan)]/5 border border-[var(--youth-cyan)]/20 shrink-0 self-center sm:self-start"
            />
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-2xl text-mgsr-text">{player.fullName}</h1>
              {player.fullNameHe && (
                <p className="text-[var(--youth-cyan)]/60 text-sm mt-0.5" dir="rtl">{player.fullNameHe}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {player.positions?.map((pos) => (
                  <span key={pos} className="px-2.5 py-0.5 rounded-xl bg-[var(--youth-cyan)]/15 text-[var(--youth-cyan)] text-xs font-semibold border border-[var(--youth-cyan)]/20">
                    {pos}
                  </span>
                ))}
                {player.ageGroup && (
                  <span className="px-2.5 py-0.5 rounded-xl bg-[var(--youth-violet)]/15 text-[var(--youth-violet)] text-xs font-semibold border border-[var(--youth-violet)]/20">
                    {player.ageGroup}
                  </span>
                )}
              </div>
              <p className="text-mgsr-muted text-sm mt-2">
                {player.currentClub?.clubName || '—'}
                {player.nationality && ` • ${player.nationality}`}
              </p>
              {player.ifaUrl && (
                <a href={player.ifaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--youth-cyan)]/50 hover:text-[var(--youth-cyan)] mt-1 transition">
                  🔗 {t('youth_detail_ifa_profile')}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left column */}
          <div className="lg:col-span-1 space-y-6">
            {/* Mandate switch */}
            <div className={`${glassCard} p-5`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-[var(--youth-cyan)]/60 uppercase tracking-wider mb-1">{t('youth_detail_mandate')}</h3>
                  {player.haveMandate && (() => {
                    const valid = documents.filter((d) => (d.type ?? '').toUpperCase() === 'MANDATE' && !d.expired && (d.expiresAt == null || d.expiresAt >= Date.now()));
                    const maxExp = Math.max(0, ...valid.map((d) => d.expiresAt ?? 0));
                    if (maxExp <= 0) return null;
                    const d = new Date(maxExp);
                    return <p className="text-xs text-mgsr-muted mt-0.5" dir="ltr">{t('youth_detail_expires')} {d.toLocaleDateString()}</p>;
                  })()}
                </div>
                <button
                  role="switch"
                  aria-checked={player.haveMandate ?? false}
                  disabled={mandateToggling}
                  onClick={() => handleMandateToggle(!(player.haveMandate ?? false))}
                  className={`relative flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full px-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--youth-cyan)] disabled:opacity-50 ${
                    player.haveMandate ? 'bg-[var(--youth-cyan)] justify-end' : 'bg-mgsr-muted/50 justify-start'
                  }`}
                >
                  <span className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow" />
                </button>
              </div>
            </div>

            {/* Contact cards */}
            {(player.playerPhoneNumber || player.playerEmail || player.parentContact?.parentPhoneNumber) && (
              <div className={`${glassCard} p-5 space-y-4`}>
                <h3 className="text-sm font-semibold text-[var(--youth-cyan)]/60 uppercase tracking-wider">{t('youth_detail_contact')}</h3>

                {/* Player contact */}
                {(player.playerPhoneNumber || player.playerEmail) && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-[var(--youth-cyan)]/40 uppercase font-medium">{t('youth_detail_player_section')}</p>
                    {player.playerPhoneNumber && (
                      <a href={toWhatsAppUrl(player.playerPhoneNumber) ?? `tel:${player.playerPhoneNumber}`} target="_blank" rel="noopener noreferrer" className="text-[var(--youth-cyan)] hover:underline text-sm block" dir="ltr">
                        📱 {player.playerPhoneNumber}
                      </a>
                    )}
                    {player.playerEmail && (
                      <a href={`mailto:${player.playerEmail}`} className="text-[var(--youth-cyan)]/80 hover:underline text-sm block">
                        ✉️ {player.playerEmail}
                      </a>
                    )}
                  </div>
                )}

                {/* Parent contact */}
                {player.parentContact && (player.parentContact.parentName || player.parentContact.parentPhoneNumber) && (
                  <div className="pt-3 border-t border-[var(--youth-cyan)]/10 space-y-1.5">
                    <p className="text-xs text-[var(--youth-violet)]/50 uppercase font-medium flex items-center gap-1">
                      <span>👤</span>
                      {player.parentContact.parentRelationship || t('youth_detail_parent')}
                      {player.parentContact.parentName && ` — ${player.parentContact.parentName}`}
                    </p>
                    {player.parentContact.parentPhoneNumber && (
                      <a href={toWhatsAppUrl(player.parentContact.parentPhoneNumber) ?? `tel:${player.parentContact.parentPhoneNumber}`} target="_blank" rel="noopener noreferrer" className="text-[var(--youth-violet)] hover:underline text-sm block" dir="ltr">
                        📱 {player.parentContact.parentPhoneNumber}
                      </a>
                    )}
                    {player.parentContact.parentEmail && (
                      <a href={`mailto:${player.parentContact.parentEmail}`} className="text-[var(--youth-violet)]/80 hover:underline text-sm block">
                        ✉️ {player.parentContact.parentEmail}
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* IFA Stats (if available) */}
            {player.ifaStats && (player.ifaStats.matches || player.ifaStats.goals) && (
              <div className={`${glassCard} p-5`}>
                <h3 className="text-sm font-semibold text-[var(--youth-cyan)]/60 uppercase tracking-wider mb-3">{t('youth_detail_ifa_stats')}</h3>
                <div className="grid grid-cols-3 gap-3">
                  {player.ifaStats.matches != null && (
                    <div className="text-center">
                      <div className="text-2xl font-bold youth-gradient-text">{player.ifaStats.matches}</div>
                      <div className="text-[10px] text-mgsr-muted uppercase">{t('youth_detail_matches')}</div>
                    </div>
                  )}
                  {player.ifaStats.goals != null && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[var(--youth-cyan)]">{player.ifaStats.goals}</div>
                      <div className="text-[10px] text-mgsr-muted uppercase">{t('youth_detail_goals')}</div>
                    </div>
                  )}
                  {player.ifaStats.assists != null && (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-[var(--youth-violet)]">{player.ifaStats.assists}</div>
                      <div className="text-[10px] text-mgsr-muted uppercase">{t('youth_detail_assists')}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Matching Requests */}
            {player && id && (
              <MatchingRequestsSection
                matchingRequests={matchingRequests}
                playerProfileUrl={typeof window !== 'undefined' ? `${window.location.origin}/players/youth/${id}` : ''}
                accounts={accounts}
                currentUserEmail={user?.email}
                onMarkAsOffered={handleMarkAsOffered}
                onUpdateFeedback={handleUpdateOfferFeedback}
              />
            )}

            {/* Documents */}
            <div className={`${glassCard} p-5`}>
              <h3 className="text-sm font-semibold text-[var(--youth-cyan)]/60 uppercase tracking-wider mb-3">{t('youth_detail_documents')}</h3>
              {uploadError && (
                <div className="py-2 px-3 rounded-lg bg-red-500/20 text-red-400 text-sm mb-2">{uploadError}</div>
              )}
              {uploadingDocument && (
                <div className="flex items-center gap-3 py-3 text-sm text-mgsr-muted">
                  <div className="w-5 h-5 border-2 border-[var(--youth-cyan)] border-t-transparent rounded-full animate-spin" />
                  {t('youth_detail_uploading')}
                </div>
              )}
              {documents.length === 0 && !uploadingDocument ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-mgsr-muted mb-4">{t('youth_detail_no_documents')}</p>
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,image/*,application/pdf" className="hidden" onChange={handleUploadDocument} />
                  <button onClick={() => fileInputRef.current?.click()} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--youth-cyan)]/15 text-[var(--youth-cyan)] font-medium text-sm hover:bg-[var(--youth-cyan)]/25 transition border border-[var(--youth-cyan)]/20`}>
                    {t('youth_detail_upload')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((d) => (
                    <div key={d.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 text-sm">
                      <a href={d.storageUrl} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-[var(--youth-cyan)] hover:underline">
                        {d.name || d.type || t('youth_detail_document')}
                      </a>
                      <div className="flex items-center gap-1 shrink-0">
                        {d.expired && <span className="text-red-400 text-xs">{t('youth_detail_expired')}</span>}
                        <button onClick={() => setDocToDelete(d)} className="p-1.5 text-mgsr-muted hover:text-red-400 rounded-lg transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,image/*,application/pdf" className="hidden" onChange={handleUploadDocument} />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingDocument} className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--youth-cyan)]/15 text-[var(--youth-cyan)] hover:bg-[var(--youth-cyan)]/25 transition font-medium text-sm border border-[var(--youth-cyan)]/20 disabled:opacity-50">
                    {t('youth_detail_upload')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right column — Tasks + Notes */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tasks */}
            <div className={`${glassCard} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--youth-violet)]/60 uppercase tracking-wider">{t('youth_detail_tasks')}</h3>
                <button type="button" onClick={() => setShowAddTaskModal(true)} className={`text-sm font-medium ${violetBtn} px-3 py-1.5 rounded-xl transition`}>
                  {t('youth_detail_add')}
                </button>
              </div>
              {playerTasks.length === 0 ? (
                <p className="text-sm text-mgsr-muted py-4 text-center">{t('youth_detail_no_tasks')}</p>
              ) : (
                <ul className="space-y-2">
                  {playerTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                      <input
                        type="checkbox"
                        checked={task.isCompleted ?? false}
                        onChange={async () => {
                          await updateDoc(doc(db, 'AgentTasksYouth', task.id), { isCompleted: !task.isCompleted });
                        }}
                        className="mt-1 rounded accent-[var(--youth-violet)]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${task.isCompleted ? 'line-through text-mgsr-muted' : 'text-mgsr-text'}`}>
                          {task.title}
                        </p>
                        {task.dueDate && (
                          <p className="text-xs text-mgsr-muted mt-0.5">
                            {t('youth_detail_due')} {new Date(task.dueDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Notes */}
            <div className={`${glassCard} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--youth-cyan)]/60 uppercase tracking-wider">{t('youth_detail_notes')}</h3>
                <button
                  type="button"
                  onClick={() => { setNoteModalOpen('add'); setNoteDraft(''); }}
                  className={`text-sm font-medium ${cyanBtn} px-3 py-1.5 rounded-xl transition`}
                >
                  {t('youth_detail_add_note')}
                </button>
              </div>
              {sortedNotes.length === 0 ? (
                <p className="text-sm text-mgsr-muted py-4 text-center">{t('youth_detail_no_notes')}</p>
              ) : (
                <div className="space-y-3">
                  {sortedNotes.map((note, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white/3 border border-white/5">
                      <p className="text-sm text-mgsr-text whitespace-pre-wrap">{note.notes}</p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-xs text-mgsr-muted">
                          {resolveAgentName(note.createBy)} • {note.createdAt ? new Date(note.createdAt).toLocaleDateString() : ''}
                        </p>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => { setEditingNote(note); setNoteDraft(note.notes ?? ''); setNoteModalOpen('edit'); }}
                            className="text-xs text-[var(--youth-cyan)]/50 hover:text-[var(--youth-cyan)] transition px-2 py-1"
                          >
                            {t('youth_detail_edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmNote(note)}
                            className="text-xs text-red-400/50 hover:text-red-400 transition px-2 py-1"
                          >
                            {t('youth_detail_delete')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Agent in charge */}
            {player.agentInChargeName && (
              <div className={`${glassCard} p-5`}>
                <h3 className="text-sm font-semibold text-[var(--youth-cyan)]/60 uppercase tracking-wider mb-2">{t('youth_detail_agent_in_charge')}</h3>
                <p className="text-mgsr-text">{resolveAgentName(player.agentInChargeName)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar - Prepare for portfolio */}
        <div className="sticky bottom-0 left-0 right-0 mt-8 rounded-t-2xl border border-t border-mgsr-border bg-mgsr-card/90 backdrop-blur-sm p-4 shadow-[0_0_30px_rgba(0,212,255,0.06)]">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setShowPortfolioLanguageModal(true); }}
              disabled={addingToPortfolio}
              className="flex items-center gap-2 text-[var(--youth-cyan)] hover:underline disabled:opacity-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span className="font-medium text-sm">{t('player_info_prepare_portfolio')}</span>
            </button>
            {portfolioError && (
              <p className="text-sm text-red-400 text-center">{portfolioError}</p>
            )}
          </div>
        </div>

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

        {/* ────── MODALS ────── */}

        {/* Note Modal */}
        {noteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className={`${glassCard} p-6 w-full max-w-lg`}>
              <h2 className="text-lg font-display font-bold youth-gradient-text mb-4">
                {noteModalOpen === 'add' ? t('youth_detail_add_note_title') : t('youth_detail_edit_note_title')}
              </h2>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={t('youth_detail_note_placeholder')}
                rows={4}
                className={`${glassInputSm} resize-none mb-4`}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setNoteModalOpen(null); setEditingNote(null); setNoteDraft(''); }} className="px-4 py-2 text-sm text-mgsr-muted hover:text-mgsr-text transition">
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
        {showAddTaskModal && player && id && (
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
            getDisplayName={(a, rtl) => (rtl ? a.hebrewName || a.name || '—' : a.name || a.hebrewName || '—')}
            taskCollection="AgentTasksYouth"
          />
        )}
      </div>
    </AppLayout>
  );
}
