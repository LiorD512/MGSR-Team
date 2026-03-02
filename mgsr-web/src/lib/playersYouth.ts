/**
 * Youth football players — IFA (football.org.il) as primary data source.
 * Separate from men (Transfermarkt) and women (SoccerDonna/Wosostat).
 * Includes player + parent/guardian contact fields on the document.
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

export const PLAYERS_YOUTH_COLLECTION = 'PlayersYouth';

/** Single note entry (same structure as men/women noteList) */
export interface YouthPlayerNote {
  notes?: string;
  createBy?: string;
  createdAt?: number;
}

/** Parent / guardian contact (flat on player doc) */
export interface ParentContact {
  parentName?: string;
  parentRelationship?: 'father' | 'mother' | 'guardian' | string;
  parentPhoneNumber?: string;
  parentEmail?: string;
}

export interface YouthPlayer {
  id: string;
  fullName: string;
  /** Hebrew name from IFA */
  fullNameHe?: string;
  profileImage?: string;
  positions?: string[];
  currentClub?: { clubName?: string; clubCountry?: string };
  /** Academy / youth division name (e.g. "נערים ג' על") */
  academy?: string;
  age?: string;
  dateOfBirth?: string;
  nationality?: string;
  nationalityFlag?: string;
  /** IFA player page URL: football.org.il/players/player/?player_id=X&season_id=Y */
  ifaUrl?: string;
  /** IFA player_id integer */
  ifaPlayerId?: string;
  /** Transfermarkt profile URL (optional enrichment) */
  tmProfile?: string;
  /** Age group: U-13, U-14, U-15, U-17, U-19, U-21 */
  ageGroup?: string;
  marketValue?: string;
  foot?: string;
  height?: string;
  notes?: string;
  /** Structured notes (add/edit/delete) — same logic as men/women noteList */
  noteList?: YouthPlayerNote[];
  /** Pinned highlight videos (max 2) — same as men/women */
  pinnedHighlights?: {
    id: string;
    source: string;
    title: string;
    thumbnailUrl: string;
    embedUrl: string;
    channelName?: string;
    publishedAt?: string;
    durationSeconds?: number;
    viewCount?: number;
  }[];
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
  /** Player phone number */
  playerPhoneNumber?: string;
  /** Player email */
  playerEmail?: string;
  /** Agent phone number (for sharing, portfolio) */
  agentPhoneNumber?: string;
  /** Parent/guardian contacts */
  parentContact?: ParentContact;
  /** IFA season stats (scraped) */
  ifaStats?: {
    season?: string;
    matches?: number;
    goals?: number;
    assists?: number;
    yellowCards?: number;
    redCards?: number;
  };
}

export function subscribePlayersYouth(
  callback: (players: YouthPlayer[]) => void
): () => void {
  const q = query(
    collection(db, PLAYERS_YOUTH_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  const unsub = onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as YouthPlayer[];
    callback(list);
  }, (err) => {
    console.error('Youth players snapshot error:', err);
    callback([]);
  });
  return unsub;
}

export async function addYouthPlayer(
  data: Omit<YouthPlayer, 'id' | 'createdAt'>
): Promise<string> {
  const payload = {
    ...data,
    createdAt: Date.now(),
  };
  // Firestore rejects undefined; remove any undefined values
  const sanitized = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined)
  );
  const docRef = await addDoc(collection(db, PLAYERS_YOUTH_COLLECTION), sanitized);
  return docRef.id;
}

export async function updateYouthPlayer(
  id: string,
  data: Partial<Omit<YouthPlayer, 'id' | 'createdAt'>>
): Promise<void> {
  const payload = { ...data };
  const sanitized = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined)
  );
  await updateDoc(doc(db, PLAYERS_YOUTH_COLLECTION, id), sanitized);
}

export async function deleteYouthPlayer(id: string): Promise<void> {
  await deleteDoc(doc(db, PLAYERS_YOUTH_COLLECTION, id));
}

/** Dedup check: does a player with this IFA URL already exist? */
export async function checkYouthPlayerExists(
  ifaUrl?: string
): Promise<boolean> {
  if (!ifaUrl?.trim()) return false;
  const q = query(
    collection(db, PLAYERS_YOUTH_COLLECTION),
    where('ifaUrl', '==', ifaUrl.trim())
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/** Compute age group from birth year */
export function computeAgeGroup(dateOfBirth?: string): string | undefined {
  if (!dateOfBirth) return undefined;
  const yearMatch = dateOfBirth.match(/(\d{4})/);
  if (!yearMatch) return undefined;
  const birthYear = parseInt(yearMatch[1], 10);
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;
  if (age <= 13) return 'U-13';
  if (age <= 14) return 'U-14';
  if (age <= 15) return 'U-15';
  if (age <= 17) return 'U-17';
  if (age <= 19) return 'U-19';
  if (age <= 21) return 'U-21';
  return undefined;
}
