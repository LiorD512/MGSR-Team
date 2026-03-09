'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { removeWebFcmToken } from '@/lib/notifications';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    // Remove web FCM token before signing out
    try {
      if (user?.email) {
        const q = query(collection(db, 'Accounts'), where('email', '==', user.email.toLowerCase()));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const accountId = snap.docs[0].id;
          const { getToken } = await import('firebase/messaging');
          const { getMessaging: getMessagingInstance } = await import('@/lib/firebase');
          const messaging = await getMessagingInstance();
          if (messaging) {
            const token = await getToken(messaging).catch(() => null);
            if (token) {
              await removeWebFcmToken(accountId, token);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to remove FCM token on logout:', e);
    }
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
