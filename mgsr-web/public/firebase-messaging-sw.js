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

// Click handler: Firebase SDK opens fcmOptions.link (absolute URL) automatically,
// but in case that fails or the tab is already open, we handle it ourselves.
self.addEventListener('notificationclick', (event) => {
  // Don't close — let Firebase SDK handle it if it wants to.
  // We focus the existing tab if one exists on our origin.
  const origin = self.location.origin;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        try {
          if (new URL(client.url).origin === origin && 'focus' in client) {
            return client.focus();
          }
        } catch (_) { /* ignore bad URL */ }
      }
      // No existing tab — open the app
      return clients.openWindow(origin + '/');
    })
  );
});
