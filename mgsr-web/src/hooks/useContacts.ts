'use client';

/**
 * useContacts — subscribes to the current platform's Contacts collection and
 * returns the live list, sorted by name.
 *
 * The contacts screens each used to inline their own `onSnapshot`; this hook
 * centralises that so other features (e.g. the "pick a phone number from your
 * contacts" picker used in the add/edit player flows) can reuse the same data
 * without duplicating the subscription. Contacts are global per platform (not
 * account-scoped), matching how the Contacts screens read them.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CONTACTS_COLLECTIONS } from '@/lib/platformCollections';
import type { Platform } from '@/contexts/PlatformContext';
import type { Contact } from '@/app/contacts/AddContactSheet';

export function useContacts(platform: Platform = 'men'): { contacts: Contact[]; ready: boolean } {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const collName = CONTACTS_COLLECTIONS[platform];
    const unsub = onSnapshot(
      collection(db, collName),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contact));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setContacts(list);
        setReady(true);
      },
      (err) => {
        console.error('useContacts snapshot error:', err);
        setReady(true);
      },
    );
    return () => unsub();
  }, [platform]);

  return { contacts, ready };
}
