/* eslint-disable no-undef */

// Force new service worker to activate immediately (no waiting for tabs to close)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// We do NOT use the Firebase messaging compat library here.
// Instead, we handle push + notificationclick ourselves so we have
// full control over the notification data and click navigation.

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); } catch (_) { return; }

  // FCM wraps the payload — extract what we need
  const notif = payload.notification || {};
  const data = payload.data || {};
  const fcmOptions = payload.fcmOptions || {};

  const title = notif.title || '💬 MGSR';
  const body = notif.body || '';
  const icon = notif.icon || '/logo.svg';
  const tag = notif.tag || 'mgsr-default';

  // Build the target URL from fcmOptions.link or data fields
  let targetUrl = fcmOptions.link || '';
  if (!targetUrl && data.screen === 'chat_room') {
    targetUrl = data.messageId
      ? `/chat-room?highlight=${data.messageId}`
      : '/chat-room';
  }
  if (!targetUrl) targetUrl = '/';
  if (targetUrl.startsWith('/')) targetUrl = self.location.origin + targetUrl;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      tag,
      data: { targetUrl },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.targetUrl || self.location.origin + '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus an existing tab on our origin
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      // No tab open — open a new one
      return clients.openWindow(targetUrl);
    })
  );
});
