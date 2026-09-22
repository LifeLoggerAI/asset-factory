import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let initError: string | null = null;

const forbiddenLongLivedCredentialVars = [
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_SERVICE_ACCOUNT_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
] as const;

function tryInit() {
  if (getApps().length) return getApps()[0];

  try {
    const forbidden = forbiddenLongLivedCredentialVars.filter((name) => Boolean(process.env[name]?.trim()));
    if (forbidden.length) {
      throw new Error(
        `Asset Factory Firebase Admin rejects long-lived credential variables: ${forbidden.join(', ')}. Provider ADC/WIF is required.`,
      );
    }

    return initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  } catch (err) {
    initError = err instanceof Error ? err.message : 'unknown-error';
    return null;
  }
}

export function getAdminApp() {
  return tryInit();
}

export function isFirebaseAdminAvailable() {
  return Boolean(getAdminApp());
}

export function getAdminDb() {
  const app = getAdminApp();
  return app ? getFirestore(app) : null;
}

export function getAdminBucket() {
  const app = getAdminApp();
  return app ? getStorage(app).bucket() : null;
}

export function getFirebaseDiagnostics() {
  const app = getAdminApp();
  return {
    available: Boolean(app),
    initError,
    projectId: app?.options.projectId ?? process.env.FIREBASE_PROJECT_ID ?? null,
    storageBucket: app?.options.storageBucket ?? process.env.FIREBASE_STORAGE_BUCKET ?? null,
  };
}
