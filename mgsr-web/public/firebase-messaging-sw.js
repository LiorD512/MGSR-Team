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

// Firebase SDK handles everything:
// - Displays notification from webpush.notification payload
// - On click, opens webpush.fcmOptions.link (absolute URL)
// No custom notificationclick handler — let the SDK do its thing.
messaging.onBackgroundMessage((_payload) => {});
