/**
 * Women's football players — separate from men's (Transfermarkt-based).
 * Data sources: Wosostat, SoccerDonna, FMInside. No Transfermarkt.
 */

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const PLAYERS_WOMEN_COLLECTION = 'PlayersWomen';

/** Single note entry (same structure as men's Players.noteList) */
export interface WomanPlayerNote {
  notes?: string;
  createBy?: string;
  createdAt?: number;
}

export interface WomanPlayer {
  id: string;
  fullName: string;
  profileImage?: string;
  positions?: string[];
  currentClub?: { clubName?: string; clubCountry?: string };
  age?: string;
  nationality?: string;
  nationalityFlag?: string;
  soccerDonnaUrl?: string;
  wosostatId?: string;
  fmInsideId?: string;
  /** Full FMInside player URL for direct lookup (e.g. https://fminside.net/players/7-fm-26/2000351404-diana-bieliakova) */
  fmInsideUrl?: string;
  marketValue?: string;
  foot?: string;
  height?: string;
  notes?: string;
  /** Structured notes (add/edit/delete) — same logic as men's noteList */
  noteList?: WomanPlayerNote[];
  /** Pinned highlight videos (max 2) — same as men's pinnedHighlights */
  pinnedHighlights?: { id: string; source: string; title: string; thumbnailUrl: string; embedUrl: string; channelName?: string; publishedAt?: string; durationSeconds?: number; viewCount?: number }[];
  /** Mandate toggle — synced from documents */
  haveMandate?: boolean;
  /** Passport details for mandate generation */
  passportDetails?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    passportNumber?: string;
    nationality?: string;
    lastUpdatedAt?: number;
  };
  createdAt: number;
  agentInChargeId?: string;
  agentInChargeName?: string;
  /** Player phone number (for sharing, portfolio) */
  playerPhoneNumber?: string;
  /** Agent phone number (for sharing, portfolio) */
  agentPhoneNumber?: string;
}

export function subscribePlayersWomen(
  callback: (players: WomanPlayer[]) => void
): () => void {
  const q = query(
    collection(db, PLAYERS_WOMEN_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as WomanPlayer[];
    callback(list);
  });
  return unsub;
}

export async function addWomanPlayer(
  data: Omit<WomanPlayer, 'id' | 'createdAt'>
): Promise<string> {
  const payload = {
    ...data,
    createdAt: Date.now(),
  };
  // Firestore rejects undefined; remove any undefined values
  const sanitized = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined)
  );
  const docRef = await addDoc(collection(db, PLAYERS_WOMEN_COLLECTION), sanitized);
  return docRef.id;
}

export async function updateWomanPlayer(
  id: string,
  data: Partial<Omit<WomanPlayer, 'id' | 'createdAt'>>
): Promise<void> {
  const payload = { ...data };
  const sanitized = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined)
  );
  await updateDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id), sanitized);
}

export async function deleteWomanPlayer(id: string): Promise<void> {
  await deleteDoc(doc(db, PLAYERS_WOMEN_COLLECTION, id));
}

export async function checkWomanPlayerExists(
  soccerDonnaUrl?: string
): Promise<boolean> {
  if (!soccerDonnaUrl?.trim()) return false;
  const q = query(
    collection(db, PLAYERS_WOMEN_COLLECTION),
    where('soccerDonnaUrl', '==', soccerDonnaUrl.trim())
  );
  const snap = await getDocs(q);
  return !snap.empty;
}
