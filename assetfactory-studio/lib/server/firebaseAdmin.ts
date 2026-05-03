import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let initError: string | null = null;

function tryInit() {
  if (getApps().length) return getApps()[0];
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (projectId && clientEmail && privateKey) {
      return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
    }
    return initializeApp({ credential: applicationDefault(), storageBucket: process.env.FIREBASE_STORAGE_BUCKET });
  } catch (err) {
    initError = err instanceof Error ? err.message : 'unknown-error';
    return null;
  }
}

export function getAdminApp() { return tryInit(); }
export function isFirebaseAdminAvailable() { return !!getAdminApp(); }
export function getAdminDb() { const app = getAdminApp(); return app ? getFirestore(app) : null; }
export function getAdminBucket() { const app = getAdminApp(); return app ? getStorage(app).bucket() : null; }
export function getFirebaseDiagnostics() {
  const app = getAdminApp();
  return { available: !!app, initError, projectId: app?.options.projectId ?? process.env.FIREBASE_PROJECT_ID ?? null, storageBucket: app?.options.storageBucket ?? process.env.FIREBASE_STORAGE_BUCKET ?? null };
}
