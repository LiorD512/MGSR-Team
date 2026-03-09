import { getToken, onMessage, Unsubscribe } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, getMessaging } from './firebase';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '';

export type NotificationStatus = 'default' | 'granted' | 'denied' | 'unsupported';

/** Current browser notification permission status. */
export function getNotificationStatus(): NotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationStatus;
}

/** Request permission and obtain an FCM token. Returns null on failure/denial. */
export async function requestNotificationPermission(): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const messaging = await getMessaging();
  if (!messaging) return null;

  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  // Wait for the service worker to become active before requesting a push token
  if (!swReg.active) {
    await new Promise<void>((resolve) => {
      const sw = swReg.installing || swReg.waiting;
      if (!sw) { resolve(); return; }
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') resolve();
      });
    });
  }
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });
  return token || null;
}

/** Save a web FCM token to the Account's fcmTokens array in Firestore. */
export async function saveWebFcmToken(accountId: string, token: string): Promise<void> {
  await updateDoc(doc(db, 'Accounts', accountId), {
    fcmTokens: arrayUnion({ token, platform: 'web', updatedAt: Date.now() }),
  });
}

/** Remove a web FCM token from the Account's fcmTokens array. */
export async function removeWebFcmToken(accountId: string, token: string): Promise<void> {
  // arrayRemove requires exact match, so we read and filter
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(db, 'Accounts', accountId));
  if (!snap.exists()) return;
  const tokens: Array<{ token: string; platform: string; updatedAt: number }> = snap.data().fcmTokens || [];
  const entry = tokens.find((t) => t.token === token);
  if (entry) {
    await updateDoc(doc(db, 'Accounts', accountId), {
      fcmTokens: arrayRemove(entry),
    });
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
