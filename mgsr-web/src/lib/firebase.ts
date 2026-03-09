import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getMessaging as _getMessaging, isSupported, Messaging } from 'firebase/messaging';

// Use env vars; fallbacks allow build without .env.local (user must add real config to run)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBuildPlaceholder123456789012345678901',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'placeholder.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'placeholder-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'placeholder.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '000000000',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:000000000:web:000000000',
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} else {
  app = getApps()[0] as FirebaseApp;
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

/** Returns Messaging instance only in the browser where supported. */
let messagingInstance: Messaging | null = null;
async function getMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (messagingInstance) return messagingInstance;
  const supported = await isSupported();
  if (!supported) return null;
  messagingInstance = _getMessaging(app);
  return messagingInstance;
}

export { app, auth, db, storage, getMessaging };
