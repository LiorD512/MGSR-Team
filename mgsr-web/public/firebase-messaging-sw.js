/* eslint-disable no-undef */

// Force new service worker to activate immediately (no waiting for tabs to close)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// ─── REGISTER CLICK HANDLER *BEFORE* FIREBASE SDK ───────────────────
// Firebase SDK registers its own notificationclick handler during init.
// By registering ours first, stopImmediatePropagation() prevents the
// SDK default (which may navigate to the wrong origin like localhost).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.stopImmediatePropagation(); // prevent Firebase SDK default handler

  const PROD = 'https://management.mgsrfa.com';
  let path = '/';

  try {
    const data = event.notification.data || {};
    const fcmMsg = data.FCM_MSG || {};
    // Extract path from fcmOptions.link
    const link = fcmMsg.fcmOptions?.link || '';
    if (link) {
      try { path = new URL(link).pathname + new URL(link).search; } catch (_) {}
    }
    // Fallback: build from data fields
    if (path === '/' && fcmMsg.data?.screen === 'chat_room') {
      const mid = fcmMsg.data.messageId;
      path = mid ? '/chat-room?highlight=' + mid : '/chat-room';
    }
    if (path === '/' && fcmMsg.data?.screen === 'shortlist') {
      const tmProfile = fcmMsg.data.playerTmProfile;
      path = tmProfile ? '/shortlist?highlight=' + encodeURIComponent(tmProfile) : '/shortlist';
    }
  } catch (_) {}

  const targetUrl = PROD + path;

  event.waitUntil(clients.openWindow(targetUrl));
});

// ─── NOW IMPORT FIREBASE SDK (its click handler will be blocked) ─────
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

// Required so Firebase SDK processes background pushes.
messaging.onBackgroundMessage((_payload) => {});
