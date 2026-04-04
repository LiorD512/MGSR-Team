/* eslint-disable no-undef */

// Force new service worker to activate immediately (no waiting for tabs to close)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCBnTWD6LatII5YFxNz4mywveupYN1mTvE',
  authDomain: 'mgsr-64e4b.firebaseapp.com',
  projectId: 'mgsr-64e4b',
  storageBucket: 'mgsr-64e4b.appspot.com',
  messagingSenderId: '1026069643478',
  appId: '1:1026069643478:web:0cb32330640b19aa49c977',
});

const messaging = firebase.messaging();

// Firebase SDK auto-displays the notification from webpush.notification.
// onBackgroundMessage is intentionally empty — just needed so SDK processes the push.
messaging.onBackgroundMessage((_payload) => {});

// Click handler: close notification, extract target URL, focus + navigate.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Prevent Firebase SDK default handling
  event.stopImmediatePropagation();

  const origin = self.location.origin;

  // Extract the target URL from FCM data
  let targetUrl = origin + '/';
  try {
    const data = event.notification.data;
    // Firebase SDK stores the original FCM message inside data.FCM_MSG
    const fcmMsg = data?.FCM_MSG || {};
    const link = fcmMsg?.fcmOptions?.link
      || fcmMsg?.notification?.click_action
      || data?.link;
    if (link) {
      targetUrl = link.startsWith('/') ? origin + link : link;
    }
  } catch (_) { /* use fallback */ }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Find an existing tab on our origin — focus + navigate it
      for (const client of windowClients) {
        try {
          if (new URL(client.url).origin === origin && 'navigate' in client) {
            return client.focus().then(() => client.navigate(targetUrl));
          }
        } catch (_) { /* skip */ }
      }
      // No existing tab — open new one
      return clients.openWindow(targetUrl);
    })
  );
});
