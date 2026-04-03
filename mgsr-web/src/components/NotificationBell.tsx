'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc as firestoreDoc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getNotificationStatus,
  requestNotificationPermission,
  saveWebFcmToken,
  onForegroundMessage,
  NotificationStatus,
} from '@/lib/notifications';

/** Resolve the Account doc ID for the current user (lookup by email). */
async function findAccountId(email: string): Promise<string | null> {
  const snap = await getDocs(collection(db, 'Accounts'));
  const emailLower = email.toLowerCase();
  const doc = snap.docs.find(d => (d.data().email as string)?.toLowerCase() === emailLower);
  return doc?.id ?? null;
}

/** Check if the account already has at least one web FCM token. */
async function accountHasWebToken(accountId: string): Promise<boolean> {
  const snap = await getDoc(firestoreDoc(db, 'Accounts', accountId));
  if (!snap.exists()) return false;
  const tokens = snap.data().fcmTokens;
  return Array.isArray(tokens) && tokens.length > 0;
}

/** Get an FCM token, register service worker, subscribe to topic, and save to Firestore. */
async function ensureTokenSaved(accountId: string): Promise<string | null> {
  const { getToken } = await import('firebase/messaging');
  const { getMessaging: getMessagingInstance } = await import('@/lib/firebase');
  const messaging = await getMessagingInstance();
  if (!messaging) return null;
  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  if (!swReg.active) {
    await new Promise<void>((resolve) => {
      const sw = swReg.installing || swReg.waiting;
      if (!sw) { resolve(); return; }
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
    });
  }
  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '',
    serviceWorkerRegistration: swReg,
  }).catch(() => null);
  if (!token) return null;
  await saveWebFcmToken(accountId, token);
  // Subscribe to broadcast topic
  try {
    const { httpsCallable, getFunctions } = await import('firebase/functions');
    const functions = getFunctions(undefined, 'us-central1');
    const subscribe = httpsCallable(functions, 'subscribeToTopicCallable');
    await subscribe({ token, topic: 'mgsr_all' });
  } catch {
    // Will retry next page load
  }
  return token;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [status, setStatus] = useState<NotificationStatus>('default');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setStatus(getNotificationStatus());
  }, []);

  // Ensure FCM token is saved to account whenever notifications are granted.
  // On every page load: checks Firestore to see if the account actually has a web
  // token. If not, generates one and saves it. This guarantees token persistence.
  useEffect(() => {
    if (status !== 'granted' || !user?.email) return;
    const SESSION_KEY = 'mgsr_token_saved_v2';
    if (sessionStorage.getItem(SESSION_KEY)) return;
    (async () => {
      try {
        const accountId = await findAccountId(user.email!);
        if (!accountId) return;
        const hasToken = await accountHasWebToken(accountId);
        if (hasToken) {
          sessionStorage.setItem(SESSION_KEY, '1');
          return;
        }
        // Account has NO web token — register and save one now
        const token = await ensureTokenSaved(accountId);
        if (token) sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        // Will retry next page load
      }
    })();
  }, [status, user]);

  // Foreground message listener — show toast
  useEffect(() => {
    let unsub: (() => void) | null = null;
    if (status === 'granted') {
      onForegroundMessage((payload) => {
        setToast({ title: payload.title || 'MGSR Team', body: payload.body || '' });
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 5000);
      }).then((u) => { unsub = u; });
    }
    return () => { unsub?.(); };
  }, [status]);

  const handleEnable = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const token = await requestNotificationPermission();
      if (token) {
        const accountId = await findAccountId(user.email);
        if (accountId) {
          await saveWebFcmToken(accountId, token);
          try {
            const { httpsCallable, getFunctions } = await import('firebase/functions');
            const functions = getFunctions(undefined, 'us-central1');
            const subscribe = httpsCallable(functions, 'subscribeToTopicCallable');
            await subscribe({ token, topic: 'mgsr_all' });
          } catch {
            // Will retry next page load
          }
        }
        setStatus('granted');
      } else {
        setStatus(getNotificationStatus());
      }
    } finally {
      setLoading(false);
      setShowModal(false);
    }
  }, [user]);

  const bellColor =
    status === 'granted'
      ? 'text-[var(--mgsr-accent)]'
      : status === 'denied'
        ? 'text-red-400'
        : 'text-mgsr-muted';

  return (
    <>
      {/* Bell button */}
      <button
        onClick={() => {
          if (status === 'denied') {
            alert(t('notif_blocked'));
            return;
          }
          if (status === 'granted') {
            // Re-register token (useful if token was lost)
            handleEnable();
            return;
          }
          setShowModal(true);
        }}
        className={`flex items-center gap-2 text-sm ${bellColor} hover:text-[var(--mgsr-accent)] transition min-h-[44px]`}
        title={status === 'granted' ? t('notif_enabled') : t('notif_enable')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {status === 'granted' ? t('notif_enabled') : t('notif_enable')}
      </button>

      {/* Permission modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !loading && setShowModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-sm bg-mgsr-card border border-mgsr-border rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-mgsr-teal/20 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-mgsr-teal">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-mgsr-text">{t('notif_enable')}</h3>
            </div>
            <p className="text-sm text-mgsr-muted">{t('notif_enable_desc')}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-mgsr-muted hover:text-mgsr-text transition rounded-lg"
              >
                {t('notif_cancel_btn')}
              </button>
              <button
                onClick={handleEnable}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium bg-mgsr-teal text-mgsr-dark rounded-lg hover:bg-mgsr-teal/80 transition disabled:opacity-50"
              >
                {loading ? '...' : t('notif_enable_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Foreground toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm bg-mgsr-card border border-mgsr-border rounded-xl shadow-2xl p-4 animate-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <img src="/logo.svg" alt="" className="w-8 h-8 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-mgsr-text">{toast.title}</p>
              <p className="text-xs text-mgsr-muted mt-0.5">{toast.body}</p>
            </div>
            <button onClick={() => setToast(null)} className="text-mgsr-muted hover:text-mgsr-text shrink-0">✕</button>
          </div>
        </div>
      )}
    </>
  );
}
