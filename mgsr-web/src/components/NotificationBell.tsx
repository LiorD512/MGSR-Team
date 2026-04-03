'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
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
  // Runs once per page load — this is the ONLY place token persistence happens.
  useEffect(() => {
    console.log('[NotifBell] useEffect: status=', status, 'email=', user?.email);
    if (status !== 'granted' || !user?.email) {
      console.log('[NotifBell] Skipping — status not granted or no email');
      return;
    }
    const key = 'mgsr_token_saved';
    if (sessionStorage.getItem(key)) {
      console.log('[NotifBell] Skipping — already saved this session');
      return;
    }
    (async () => {
      try {
        const accountId = await findAccountId(user.email!);
        console.log('[NotifBell] accountId=', accountId);
        if (!accountId) return;
        const { getToken } = await import('firebase/messaging');
        const { getMessaging: getMessagingInstance } = await import('@/lib/firebase');
        const messaging = await getMessagingInstance();
        console.log('[NotifBell] messaging=', !!messaging);
        if (!messaging) return;
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('[NotifBell] swReg.active=', !!swReg.active);
        if (!swReg.active) {
          await new Promise<void>((resolve) => {
            const sw = swReg.installing || swReg.waiting;
            if (!sw) { resolve(); return; }
            sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
          });
        }
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
        console.log('[NotifBell] vapidKey present=', !!vapidKey, 'len=', vapidKey.length);
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swReg,
        }).catch((err) => { console.error('[NotifBell] getToken error:', err); return null; });
        console.log('[NotifBell] FCM token=', token ? token.substring(0, 20) + '...' : 'null');
        if (!token) return;
        await saveWebFcmToken(accountId, token);
        console.log('[NotifBell] Token saved successfully for', accountId);
        sessionStorage.setItem(key, '1');
      } catch (e) {
        console.error('[NotifBell] Error in token save:', e);
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
            const { httpsCallable } = await import('firebase/functions');
            const { getFunctions } = await import('firebase/functions');
            const functions = getFunctions(undefined, 'us-central1');
            const subscribe = httpsCallable(functions, 'subscribeToTopicCallable');
            await subscribe({ token, topic: 'mgsr_all' });
          } catch (e) {
            console.warn('Topic subscription failed (will retry on next load):', e);
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
          if (status === 'granted') return; // already enabled
          if (status === 'denied') {
            alert(t('notif_blocked'));
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
