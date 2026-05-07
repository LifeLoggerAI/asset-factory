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
const objectPath = `tenants/emulator/jobs/${testId}/v1/artifact.txt`;

await jobRef.set({ jobId: testId, tenantId: 'emulator', type: 'graphic', status: 'queued', createdAt: new Date().toISOString() });
await assetRef.set({ jobId: testId, tenantId: 'emulator', fileName: `${testId}.txt`, published: false, createdAt: new Date().toISOString() });
await usageRef.set({ eventId: `${testId}-usage`, tenantId: 'emulator', jobId: testId, action: 'emulator.smoke', createdAt: new Date().toISOString() });
await bucket.file(objectPath).save(Buffer.from('asset-factory emulator smoke'), { resumable: false, contentType: 'text/plain' });

const [jobDoc, assetDoc, usageDoc, storageExists] = await Promise.all([
  jobRef.get(),
  assetRef.get(),
  usageRef.get(),
  bucket.file(objectPath).exists(),
]);

if (!jobDoc.exists || !assetDoc.exists || !usageDoc.exists || !storageExists[0]) {
  console.error('Emulator smoke test failed to round-trip Firestore and Storage artifacts.');
  process.exit(1);
}

await Promise.all([
  jobRef.delete(),
  assetRef.delete(),
  usageRef.delete(),
  bucket.file(objectPath).delete().catch(() => undefined),
]);

console.log('PASS Firestore/Storage emulator smoke test');
