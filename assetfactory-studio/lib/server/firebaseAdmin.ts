import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { closeSync, existsSync, fstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';

let initError: string | null = null;

const appName = 'asset-factory-admin';
const sharedProjects = new Set(['urai-4dc1d', 'lifelogger-cgth1', 'geturai-landing-hub', 'urai-labs-llc', 'urai-labs-llc-78824152-ad18d', 'urai-foundation']);
const forbiddenLongLivedCredentialVars = [
  'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
] as const;

function checkDeclaredAdcFile() {
  const upper = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const lower = process.env.google_application_credentials?.trim();
  if (upper && lower && upper !== lower) throw new Error('ADC credential file configuration disagrees');
  const home = process.env.HOME;
  const base = process.platform === 'win32' ? process.env.APPDATA : home ? join(home, '.config') : undefined;
  const wellKnown = base ? join(base, 'gcloud', 'application_default_credentials.json') : undefined;
  const filePath = upper || lower || (wellKnown && existsSync(wellKnown) ? wellKnown : undefined);
  if (!filePath) return;
  const fd = openSync(filePath, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size < 2 || stat.size > 64 * 1024) throw new Error('ADC credential configuration is invalid');
    const bytes = Buffer.alloc(stat.size + 1);
    const length = readSync(fd, bytes, 0, bytes.length, 0);
    if (length !== stat.size) throw new Error('ADC credential configuration changed while reading');
    const json: unknown = JSON.parse(bytes.subarray(0, length).toString('utf8'));
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('ADC credential configuration is invalid');
    const config = json as Record<string, unknown>;
    if (config.type !== 'external_account' || ['private_key', 'client_secret', 'refresh_token'].some((key) => key in config)
        || typeof config.audience !== 'string' || !config.audience
        || typeof config.subject_token_type !== 'string' || !config.subject_token_type
        || typeof config.token_url !== 'string' || !config.token_url
        || !config.credential_source || typeof config.credential_source !== 'object' || Array.isArray(config.credential_source)) {
      throw new Error('Declared ADC files must use external-account federation without long-lived keys');
    }
  } finally { closeSync(fd); }
}

function configuredTarget() {
  if (process.env.NODE_ENV === 'production'
      && ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'].some((name) => Boolean(process.env[name]?.trim()))) {
    throw new Error('Firebase emulators are not Asset Factory production authority');
  }
  const dedicated = process.env.ASSET_FACTORY_FIREBASE_PROJECT_ID?.trim();
  const generic = process.env.FIREBASE_PROJECT_ID?.trim();
  if (dedicated && generic && dedicated !== generic) throw new Error('Asset Factory Firebase project configuration disagrees');
  const projectId = dedicated || generic;
  if (!projectId || !/^[a-z][a-z0-9-]{4,29}$/.test(projectId) || sharedProjects.has(projectId)) {
    throw new Error('An explicit dedicated Asset Factory Firebase project is required');
  }
  if (process.env.NODE_ENV === 'production' && projectId === 'asset-factory-dev-id') {
    throw new Error('The legacy development project is not Asset Factory production authority');
  }
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (storageBucket && ![`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].includes(storageBucket)) {
    throw new Error('Asset Factory Storage bucket must match the configured dedicated project');
  }
  return { projectId, storageBucket };
}

function tryInit() {
  try {
    const forbidden = forbiddenLongLivedCredentialVars.filter((name) => Boolean(process.env[name]?.trim()));
    if (forbidden.length) throw new Error('Asset Factory Firebase Admin requires provider ADC/WIF; long-lived credential variables are rejected');
    checkDeclaredAdcFile();
    const { projectId, storageBucket } = configuredTarget();
    const credential = applicationDefault();
    const existing = getApps().find((app) => app.name === appName);
    if (existing) {
      if (existing.options.projectId !== projectId || existing.options.storageBucket !== storageBucket || existing.options.credential !== credential) {
        throw new Error('Existing Asset Factory Firebase app differs from the configured target');
      }
      initError = null;
      return existing;
    }
    const app = initializeApp({ credential, projectId, storageBucket }, appName);
    initError = null;
    return app;
  } catch {
    // Credential SDK errors can contain private material. Expose a fixed diagnostic only.
    initError = 'Asset Factory Firebase configuration or credential initialization is unavailable';
    return null;
  }
}

export function getAdminApp() { return tryInit(); }
export function isFirebaseAdminAvailable() { return !!getAdminApp(); }
export function getAdminDb() { const app = getAdminApp(); return app ? getFirestore(app) : null; }
export function getAdminBucket() {
  const app = getAdminApp();
  if (!app?.options.storageBucket) return null;
  return getStorage(app).bucket(app.options.storageBucket);
}
export function getFirebaseDiagnostics() {
  const app = getAdminApp();
  return { available: !!app, initError, projectId: app?.options.projectId ?? process.env.FIREBASE_PROJECT_ID ?? null, storageBucket: app?.options.storageBucket ?? process.env.FIREBASE_STORAGE_BUCKET ?? null };
}
