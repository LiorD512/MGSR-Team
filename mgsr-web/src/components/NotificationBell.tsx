'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, doc as firestoreDoc, getDoc, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import {
  getNotificationStatus,
  requestNotificationPermission,
  saveWebFcmToken,
  onForegroundMessage,
  NotificationStatus,
} from '@/lib/notifications';
import { callNotificationMarkRead, callNotificationMarkAllRead } from '@/lib/callables';

interface StoredNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  timestamp: number;
  read: boolean;
}

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
  const { getToken, deleteToken } = await import('firebase/messaging');
  const { getMessaging: getMessagingInstance } = await import('@/lib/firebase');
  const messaging = await getMessagingInstance();
  if (!messaging) { console.warn('[FCM-DIAG] no messaging instance'); return null; }
  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  if (!swReg.active) {
    await new Promise<void>((resolve) => {
      const sw = swReg.installing || swReg.waiting;
      if (!sw) { resolve(); return; }
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
    });
  }
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';
  await deleteToken(messaging).catch(() => {});
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swReg,
  }).catch(() => null);
  if (!token) return null;
  await saveWebFcmToken(accountId, token);
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

/** Format timestamp to relative time string */
function formatRelativeTime(ts: number, t: (k: string) => string): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notif_center_just_now');
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
}

/** Get a color accent for notification type */
function getTypeColor(type: string): string {
  switch (type) {
    case 'TASK_ASSIGNED':
    case 'TASK_REMINDER':
      return '#39D164';
    case 'CLUB_CHANGE':
    case 'NOTE_TAGGED':
    case 'AGENT_TRANSFER_REQUEST':
    case 'AGENT_TRANSFER_APPROVED':
    case 'AGENT_TRANSFER_REJECTED':
      return '#2196F3';
    case 'BECAME_FREE_AGENT':
    case 'NEW_RELEASE_FROM_CLUB':
    case 'MANDATE_EXPIRED':
      return '#FF9800';
    case 'MARKET_VALUE_CHANGE':
      return '#9C27B0';
    case 'MANDATE_PLAYER_SIGNED':
      return '#4DB6AC';
    case 'CHAT_ROOM_TAG':
      return '#4DB6AC';
    case 'REQUEST_ADDED':
      return '#9C27B0';
    default:
      return '#4DB6AC';
  }
}

/** Get an icon for notification type */
function getTypeIcon(type: string): string {
  switch (type) {
    case 'TASK_ASSIGNED':
    case 'TASK_REMINDER':
      return '📋';
    case 'CLUB_CHANGE':
      return '🔄';
    case 'BECAME_FREE_AGENT':
    case 'NEW_RELEASE_FROM_CLUB':
      return '🏷️';
    case 'MARKET_VALUE_CHANGE':
      return '💰';
    case 'MANDATE_EXPIRED':
      return '⏰';
    case 'MANDATE_PLAYER_SIGNED':
      return '✍️';
    case 'NOTE_TAGGED':
      return '📝';
    case 'CHAT_ROOM_TAG':
      return '💬';
    case 'REQUEST_ADDED':
      return '📨';
    case 'AGENT_TRANSFER_REQUEST':
    case 'AGENT_TRANSFER_APPROVED':
    case 'AGENT_TRANSFER_REJECTED':
      return '🤝';
    default:
      return '🔔';
  }
}

/** Get navigation URL for notification */
function getNotificationUrl(notif: StoredNotification): string {
  const data = notif.data || {};
  switch (notif.type) {
    case 'TASK_ASSIGNED':
    case 'TASK_REMINDER':
      return '/tasks';
    case 'CHAT_ROOM_TAG':
      return data.messageId ? `/chat-room?highlight=${data.messageId}` : '/chat-room';
    case 'NOTE_TAGGED':
      return data.playerId ? `/players/${data.playerId}` : '/dashboard';
    case 'MANDATE_PLAYER_SIGNED':
      return data.token ? `/sign-mandate/${data.token}` : '/dashboard';
    case 'REQUEST_ADDED':
      return '/requests';
    case 'AGENT_TRANSFER_REQUEST':
    case 'AGENT_TRANSFER_APPROVED':
    case 'AGENT_TRANSFER_REJECTED':
      return data.playerId ? `/players/${data.playerId}` : '/dashboard';
    default:
      return data.playerTmProfile ? `/players/${encodeURIComponent(data.playerTmProfile)}` : '/dashboard';
  }
}

export default function NotificationBell({ variant = 'sidebar' }: { variant?: 'sidebar' | 'header' }) {
  const isHeader = variant === 'header';
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [status, setStatus] = useState<NotificationStatus>('default');
  const [showModal, setShowModal] = useState(false);
  const [showCenter, setShowCenter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setStatus(getNotificationStatus());
  }, []);

  // Resolve account ID
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    findAccountId(user.email).then((id) => {
      if (!cancelled && id) setAccountId(id);
    });
    return () => { cancelled = true; };
  }, [user]);

  // Ensure FCM token on page load
  useEffect(() => {
    if (status !== 'granted' || !accountId) return;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await ensureTokenSaved(accountId);
      } catch {
        // Will retry next page load
      }
    })();
    return () => { cancelled = true; };
  }, [status, accountId]);

  // Real-time listener for notification center subcollection
  useEffect(() => {
    if (!accountId) return;
    const notifRef = collection(db, 'Accounts', accountId, 'Notifications');
    const q = query(notifRef, orderBy('timestamp', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      const items: StoredNotification[] = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      } as StoredNotification));
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.read).length);
    }, (err) => {
      console.warn('[NotificationBell] Listener error:', err);
    });
    return unsub;
  }, [accountId]);

  // Foreground message listener — show toast + refresh will auto-update via snapshot
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

  // Close panel on outside click
  useEffect(() => {
    if (!showCenter) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowCenter(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCenter]);

  const handleEnable = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const token = await requestNotificationPermission();
      if (token) {
        const aid = accountId || await findAccountId(user.email);
        if (aid) {
          await saveWebFcmToken(aid, token);
          if (!accountId) setAccountId(aid);
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
  }, [user, accountId]);

  const handleBellClick = useCallback(() => {
    if (status === 'denied') {
      alert(t('notif_blocked'));
      return;
    }
    if (status !== 'granted') {
      setShowModal(true);
      return;
    }
    setShowCenter((prev) => !prev);
  }, [status, t]);

  const handleMarkAllRead = useCallback(async () => {
    if (!accountId || unreadCount === 0) return;
    try {
      await callNotificationMarkAllRead({ accountId });
    } catch (err) {
      console.error('Mark all read failed:', err);
    }
  }, [accountId, unreadCount]);

  const handleNotificationClick = useCallback(async (notif: StoredNotification) => {
    // Mark as read
    if (!notif.read && accountId) {
      callNotificationMarkRead({ accountId, notificationId: notif.id }).catch(() => {});
    }
    setShowCenter(false);
    // Navigate
    const url = getNotificationUrl(notif);
    router.push(url);
  }, [accountId, router]);

  const bellColor =
    status === 'granted'
      ? 'text-[var(--mgsr-accent)]'
      : status === 'denied'
        ? 'text-red-400'
        : 'text-mgsr-muted';

  return (
    <>
      {/* Bell button with unread badge */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={handleBellClick}
          className={isHeader
            ? `w-9 h-9 flex items-center justify-center rounded-lg ${bellColor} hover:text-[var(--mgsr-accent)] hover:bg-mgsr-dark/50 transition relative`
            : `flex items-center gap-2 text-sm ${bellColor} hover:text-[var(--mgsr-accent)] transition min-h-[44px] relative`
          }
          title={status === 'granted' ? t('notif_center_title') : t('notif_enable')}
        >
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isHeader ? 'w-5 h-5' : 'w-4 h-4'}>
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 flex items-center justify-center text-[9px] font-bold leading-none text-white animate-in zoom-in-50"
                style={{
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                  boxShadow: '0 0 6px rgba(239,68,68,0.5)',
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          {!isHeader && (status === 'granted' ? t('notif_center_title') : t('notif_enable'))}
        </button>

        {/* Notification Center Dropdown */}
        {showCenter && (
          <div
            className={`absolute ${isHeader ? 'top-full mt-2' : 'bottom-full mb-2'} ${isHeader ? 'right-0' : 'left-0'} w-80 max-h-[480px] bg-mgsr-card border border-mgsr-border rounded-xl shadow-2xl overflow-hidden z-50 animate-in ${isHeader ? 'slide-in-from-top-2' : 'slide-in-from-bottom-2'} fade-in`}
            style={{ backdropFilter: 'blur(12px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-mgsr-border">
              <h3 className="text-sm font-bold text-mgsr-text">{t('notif_center_title')}</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-[var(--mgsr-accent)] hover:underline"
                >
                  {t('notif_center_mark_all_read')}
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="overflow-y-auto max-h-[420px]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10 text-mgsr-muted/40 mb-3">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <p className="text-sm text-mgsr-muted">{t('notif_center_empty')}</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`w-full text-left px-4 py-3 border-b border-mgsr-border/50 hover:bg-mgsr-dark/40 transition flex items-start gap-3 ${
                      !notif.read ? 'bg-[var(--mgsr-accent)]/5' : ''
                    }`}
                  >
                    {/* Type icon with color accent */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm mt-0.5"
                      style={{ backgroundColor: getTypeColor(notif.type) + '20' }}
                    >
                      {getTypeIcon(notif.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs leading-snug ${!notif.read ? 'font-semibold text-mgsr-text' : 'text-mgsr-text/80'}`}>
                        {notif.title}
                      </p>
                      <p className="text-[11px] text-mgsr-muted mt-0.5 line-clamp-2">{notif.body}</p>
                      <p className="text-[10px] text-mgsr-muted/60 mt-1">{formatRelativeTime(notif.timestamp, t)}</p>
                    </div>

                    {/* Unread dot */}
                    {!notif.read && (
                      <div
                        className="w-2 h-2 rounded-full shrink-0 mt-2"
                        style={{ backgroundColor: 'var(--mgsr-accent)' }}
                      />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

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
