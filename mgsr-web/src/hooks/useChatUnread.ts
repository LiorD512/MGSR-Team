'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getCurrentAccountForShortlist } from '@/lib/accounts';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
} from 'firebase/firestore';

/**
 * Returns the count of unread chat room messages for the current user.
 * Listens in real-time to both ChatRoom messages and ChatRoomLastRead/{accountId}.
 */
export function useChatUnread(): number {
  const { user } = useAuth();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // Resolve account ID once
  useEffect(() => {
    if (!user) return;
    getCurrentAccountForShortlist(user).then((acc) => setAccountId(acc.id));
  }, [user]);

  useEffect(() => {
    if (!accountId) return;

    let lastReadAt = 0;
    let allMessages: { createdAt: number }[] = [];

    const recalc = () => {
      const count = allMessages.filter((m) => m.createdAt > lastReadAt).length;
      setUnreadCount(count);
    };

    // Listen to user's last-read timestamp
    const readUnsub = onSnapshot(doc(db, 'ChatRoomLastRead', accountId), (snap) => {
      lastReadAt = snap.data()?.lastReadAt ?? 0;
      recalc();
    });

    // Listen to all messages (only need createdAt)
    const msgUnsub = onSnapshot(
      query(collection(db, 'ChatRoom'), orderBy('createdAt', 'asc')),
      (snap) => {
        allMessages = snap.docs.map((d) => ({ createdAt: d.data().createdAt ?? 0 }));
        recalc();
      }
    );

    return () => {
      readUnsub();
      msgUnsub();
    };
  }, [accountId]);

  return unreadCount;
}
