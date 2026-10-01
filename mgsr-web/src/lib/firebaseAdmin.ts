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
 *
 * Storage additionally needs a bucket name, from FIREBASE_STORAGE_BUCKET or
 * NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET. Without it `getStorage(app).bucket()`
 * has no default and throws "Bucket name not specified or invalid".
 */
import { getApps, initializeApp, getApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function resolveStorageBucket(projectId?: string): string | undefined {
  const configured =
    process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (configured?.trim()) {
    // Tolerate a gs:// prefix, which the Firebase console sometimes shows.
    return configured.trim().replace(/^gs:\/\//, '');
  }
  return projectId ? `${projectId}.appspot.com` : undefined;
}

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
      storageBucket: resolveStorageBucket(projectId),
    });
  }
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    try {
      const sa = JSON.parse(saJson) as ServiceAccount;
      return initializeApp({
        credential: cert(sa),
        storageBucket: resolveStorageBucket(sa.projectId),
      });
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

/**
 * The default Storage bucket, with an error that says what to set. The SDK's
 * own message ("Bucket name not specified or invalid") does not mention which
 * env var is missing.
 */
export async function adminBucket() {
  const app = getFirebaseAdmin();
  if (!app) throw new Error('Firebase Admin is not configured on this environment.');
  const bucketName = resolveStorageBucket(
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
  if (!bucketName) {
    throw new Error(
      'No Storage bucket configured. Set FIREBASE_STORAGE_BUCKET (or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) to e.g. your-project.appspot.com.'
    );
  }
  const { getStorage } = await import('firebase-admin/storage');
  return getStorage(app).bucket(bucketName);
}
