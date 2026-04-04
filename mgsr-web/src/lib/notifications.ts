import { getToken, deleteToken, onMessage, Unsubscribe } from 'firebase/messaging';
import { getMessaging } from './firebase';
import { callAccountUpdate } from './callables';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

export type NotificationStatus = 'default' | 'granted' | 'denied' | 'unsupported';

/** Current browser notification permission status. */
export function getNotificationStatus(): NotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationStatus;
}

/** Request permission and obtain an FCM token. Returns null on failure/denial. */
export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('[MGSR-Notif] Browser does not support notifications');
    return null;
  }

  const permission = await Notification.requestPermission();
  console.log('[MGSR-Notif] Permission result:', permission);
  if (permission !== 'granted') return null;

  const messaging = await getMessaging();
  if (!messaging) {
    console.error('[MGSR-Notif] Failed to get messaging instance');
    return null;
  }

  console.log('[MGSR-Notif] VAPID key present:', !!VAPID_KEY, 'length:', VAPID_KEY.length);
  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  console.log('[MGSR-Notif] Service worker registered, state:', swReg.active ? 'active' : 'waiting');
  // Wait for the service worker to become active before requesting a push token
  await navigator.serviceWorker.ready;
  if (!swReg.active) {
    await new Promise<void>((resolve) => {
      const sw = swReg.installing || swReg.waiting;
      if (!sw) { resolve(); return; }
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve();
      });
    });
  }
  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    console.log('[MGSR-Notif] getToken result:', token ? `OK (${token.substring(0, 20)}...)` : 'NULL');
    return token || null;
  } catch (err) {
    console.error('[MGSR-Notif] getToken FAILED:', err);
    return null;
  }
}

/** Save a web FCM token to the Account's fcmTokens array via callable. */
export async function saveWebFcmToken(accountId: string, token: string): Promise<void> {
  console.log('[MGSR-Notif] Saving web token for account:', accountId, 'token:', token.substring(0, 20) + '...');
  try {
    await callAccountUpdate({ accountId, addFcmWebToken: token });
    console.log('[MGSR-Notif] Token saved successfully!');
  } catch (err) {
    console.error('[MGSR-Notif] SAVE TOKEN FAILED:', err);
    throw err;
  }
}

/** Remove a web FCM token from the Account's fcmTokens array via callable. */
export async function removeWebFcmToken(accountId: string, token: string): Promise<void> {
  // We need the exact entry to remove; read it first then pass to callable
  const { doc, getDoc } = await import('firebase/firestore');
  const { db } = await import('./firebase');
  const snap = await getDoc(doc(db, 'Accounts', accountId));
  if (!snap.exists()) return;
  const tokens: Array<{ token: string; platform: string; updatedAt: number }> = snap.data().fcmTokens || [];
  const entry = tokens.find((t) => t.token === token);
  if (entry) {
    await callAccountUpdate({ accountId, removeFcmWebToken: entry });
  }
}

/** Listen for foreground FCM messages. Returns unsubscribe function. */
export async function onForegroundMessage(
  callback: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void
): Promise<Unsubscribe | null> {
  const messaging = await getMessaging();
  if (!messaging) return null;
  return onMessage(messaging, (payload) => {
    callback({
      title: payload.notification?.title,
      body: payload.notification?.body,
      data: payload.data as Record<string, string> | undefined,
    });
  });
}
