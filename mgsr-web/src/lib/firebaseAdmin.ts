/**
 * Firebase Admin SDK for server-side operations (API routes).
 * Used for: share creation (verify auth, write to Firestore), token verification.
 *
 * Required env vars for serverless (Vercel):
 * - FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)
 * - FIREBASE_CLIENT_EMAIL
 * - FIREBASE_PRIVATE_KEY (with \n as literal for newlines)
 *
 * Or FIREBASE_SERVICE_ACCOUNT as full JSON string.
 */
import { getApps, initializeApp, getApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey } as ServiceAccount),
    });
  }
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    try {
      const sa = JSON.parse(saJson) as ServiceAccount;
      return initializeApp({ credential: cert(sa) });
    } catch {
      console.warn('[firebaseAdmin] Invalid FIREBASE_SERVICE_ACCOUNT JSON');
    }
  }
  throw new Error(
    'Firebase Admin not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT.'
  );
}

let adminApp: ReturnType<typeof getApp> | null = null;

export function getFirebaseAdmin() {
  if (!adminApp) {
    try {
      adminApp = getAdminApp();
    } catch (e) {
      return null;
    }
  }
  return adminApp;
}

export const adminAuth = () => getAuth(getFirebaseAdmin()!);
export const adminDb = () => getFirestore(getFirebaseAdmin()!);
