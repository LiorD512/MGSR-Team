import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { User } from 'firebase/auth';

export interface AccountForShortlist {
  id: string;
  name?: string;
  hebrewName?: string;
}

/**
 * Fetches the current user's account from Firestore (Accounts collection).
 * Used when adding to shortlist to store who added the player.
 * Falls back to user.displayName or user.email if no Account is found.
 */
export async function getCurrentAccountForShortlist(
  user: User
): Promise<AccountForShortlist> {
  const fallbackName = user.displayName || user.email || 'Unknown';
  const email = user.email?.toLowerCase();
  if (!email) {
    return { id: user.uid, name: fallbackName };
  }
  const snap = await getDocs(collection(db, 'Accounts'));
  const doc = snap.docs.find(
    (d) => (d.data().email as string)?.toLowerCase() === email
  );
  if (!doc) {
    return { id: user.uid, name: fallbackName };
  }
  const data = doc.data();
  const name = (data.name as string)?.trim() || fallbackName;
  const hebrewName = (data.hebrewName as string)?.trim();
  return {
    id: doc.id,
    name: name || fallbackName,
    hebrewName: hebrewName || undefined,
  };
}

/** Shared shortlist document - all agents see the same shortlist. */
export const SHARED_SHORTLIST_DOC_ID = 'team';

/**
 * Returns the shortlist document ID. Uses shared team shortlist so all agents see the same entries.
 */
export function useShortlistDocId(user: User | null): string | null {
  return user ? SHARED_SHORTLIST_DOC_ID : null;
}
