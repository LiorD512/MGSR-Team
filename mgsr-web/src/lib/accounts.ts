import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { User } from 'firebase/auth';

export interface AccountForShortlist {
  id: string;
  name?: string;
  hebrewName?: string;
  phone?: string;
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
  const phone = (data.phone as string)?.trim() || undefined;
  return {
    id: doc.id,
    name: name || fallbackName,
    hebrewName: hebrewName || undefined,
    phone: phone || undefined,
  };
}

/** Get current user's account including phone (for share contact) */
export async function getCurrentAccountWithPhone(
  user: User
): Promise<AccountForShortlist> {
  return getCurrentAccountForShortlist(user);
}
