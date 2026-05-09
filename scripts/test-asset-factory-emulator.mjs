import fs from 'node:fs';
import path from 'node:path';

const required = ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'FIREBASE_PROJECT_ID', 'FIREBASE_STORAGE_BUCKET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing emulator env: ${missing.join(', ')}`);
  console.error('Start Firebase emulators and rerun this script with Studio dependencies installed.');
  process.exit(2);
}

const studioNodeModules = path.join(process.cwd().endsWith('assetfactory-studio') ? process.cwd() : path.join(process.cwd(), 'assetfactory-studio'), 'node_modules');
if (!fs.existsSync(studioNodeModules)) {
  console.error(`Missing Studio dependencies at ${studioNodeModules}`);
  process.exit(2);
}

const admin = await import(path.join(studioNodeModules, 'firebase-admin/app/lib/index.js')).catch(() => null);
const firestore = await import(path.join(studioNodeModules, 'firebase-admin/firestore/lib/index.js')).catch(() => null);
const storage = await import(path.join(studioNodeModules, 'firebase-admin/storage/lib/index.js')).catch(() => null);

if (!admin || !firestore || !storage) {
  console.error('Unable to load firebase-admin modules from Studio dependencies.');
  process.exit(2);
}

const { initializeApp, getApps } = admin;
const { getFirestore } = firestore;
const { getStorage } = storage;

const app = getApps().length ? getApps()[0] : initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

const db = getFirestore(app);
const bucket = getStorage(app).bucket();
const testId = `emulator-${Date.now()}`;
const jobRef = db.collection('assetFactoryJobs').doc(testId);
const assetRef = db.collection('assetFactoryAssets').doc(testId);
const usageRef = db.collection('assetFactoryUsage').doc(`${testId}-usage`);
const queueRef = db.collection('assetFactoryQueue').doc(testId);
const queueDlqRef = db.collection('assetFactoryQueue').doc(`${testId}-dlq`);
const objectPath = `tenants/emulator/jobs/${testId}/v1/artifact.txt`;
const now = new Date().toISOString();

await jobRef.set({ jobId: testId, tenantId: 'emulator', type: 'graphic', status: 'queued', createdAt: now });
await assetRef.set({ jobId: testId, tenantId: 'emulator', fileName: `${testId}.txt`, published: false, createdAt: now });
await usageRef.set({ eventId: `${testId}-usage`, tenantId: 'emulator', jobId: testId, action: 'emulator.smoke', createdAt: now });
await bucket.file(objectPath).save(Buffer.from('asset-factory emulator smoke'), { resumable: false, contentType: 'text/plain' });

await queueRef.set({
  jobId: testId,
  tenantId: 'emulator',
  status: 'queued',
  queueStatus: 'queued',
  attempts: 0,
  maxAttempts: 3,
  payload: { type: 'graphic', source: 'emulator-smoke' },
  queuedAt: now,
  updatedAt: now,
});

await db.runTransaction(async (transaction) => {
  const doc = await transaction.get(queueRef);
  const item = doc.data();
  if (!doc.exists || item?.status !== 'queued') {
    throw new Error('Queue item was not available to claim.');
  }

  transaction.set(queueRef, {
    status: 'claimed',
    queueStatus: 'claimed',
    attempts: Number(item.attempts ?? 0) + 1,
    workerId: 'emulator-worker',
    leaseId: `${testId}-lease`,
    claimedAt: now,
    heartbeatAt: now,
    leaseExpiresAt: new Date(Date.now() + 300000).toISOString(),
    updatedAt: now,
  }, { merge: true });
});

await db.runTransaction(async (transaction) => {
  const doc = await transaction.get(queueRef);
  const item = doc.data();
  if (!doc.exists || item?.status !== 'claimed' || item?.leaseId !== `${testId}-lease`) {
    throw new Error('Queue item was not claimed with the expected lease.');
  }

  transaction.set(queueRef, {
    status: 'completed',
    queueStatus: 'completed',
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
});

await queueDlqRef.set({
  jobId: `${testId}-dlq`,
  tenantId: 'emulator',
  status: 'claimed',
  queueStatus: 'claimed',
  attempts: 3,
  maxAttempts: 3,
  workerId: 'emulator-worker',
  leaseId: `${testId}-dlq-lease`,
  queuedAt: now,
  updatedAt: now,
});

await db.runTransaction(async (transaction) => {
  const doc = await transaction.get(queueDlqRef);
  const item = doc.data();
  if (!doc.exists || item?.leaseId !== `${testId}-dlq-lease`) {
    throw new Error('DLQ queue item was not available to fail.');
  }

  const shouldRetry = Number(item.attempts ?? 0) < Number(item.maxAttempts ?? 3);
  transaction.set(queueDlqRef, {
    status: shouldRetry ? 'retrying' : 'dead-lettered',
    queueStatus: shouldRetry ? 'retrying' : 'dead-lettered',
    failureReason: 'emulator forced failure',
    lastFailedAt: new Date().toISOString(),
    deadLetteredAt: shouldRetry ? undefined : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
});

const [jobDoc, assetDoc, usageDoc, queueDoc, queueDlqDoc, storageExists] = await Promise.all([
  jobRef.get(),
  assetRef.get(),
  usageRef.get(),
  queueRef.get(),
  queueDlqRef.get(),
  bucket.file(objectPath).exists(),
]);

const queueData = queueDoc.data();
const queueDlqData = queueDlqDoc.data();

if (!jobDoc.exists || !assetDoc.exists || !usageDoc.exists || !storageExists[0]) {
  console.error('Emulator smoke test failed to round-trip Firestore and Storage artifacts.');
  process.exit(1);
}

if (!queueDoc.exists || queueData?.status !== 'completed' || queueData?.queueStatus !== 'completed') {
  console.error('Emulator smoke test failed durable queue claim/complete lifecycle.');
  process.exit(1);
}

if (!queueDlqDoc.exists || queueDlqData?.status !== 'dead-lettered' || queueDlqData?.queueStatus !== 'dead-lettered') {
  console.error('Emulator smoke test failed durable queue dead-letter lifecycle.');
  process.exit(1);
}

await Promise.all([
  jobRef.delete(),
  assetRef.delete(),
  usageRef.delete(),
  queueRef.delete(),
  queueDlqRef.delete(),
  bucket.file(objectPath).delete().catch(() => undefined),
]);

console.log('PASS Firestore/Storage/Queue emulator smoke test');
