import { randomUUID } from 'node:crypto';
import { getAdminBucket, getAdminDb, getFirebaseDiagnostics, isFirebaseAdminAvailable } from './firebaseAdmin';
import {
  localAddJob,
  localFindAsset,
  localFindJob,
  localListAssets,
  localReadGenerated,
  localReadJobs,
  localUpdateJob,
  localUpsertAsset,
  localWriteGenerated,
} from './localAssetFactoryStore';
import { renderAsset } from './assetRenderer';

type GenericRecord = Record<string, unknown>;

type RenderableAssetJob = GenericRecord & {
  jobId: string;
  prompt: string;
  type: string;
  tenantId?: string;
};

const JOBS_COLLECTION = process.env.ASSET_FACTORY_JOBS_COLLECTION ?? 'assetFactoryJobs';
const ASSETS_COLLECTION = process.env.ASSET_FACTORY_ASSETS_COLLECTION ?? 'assetFactoryAssets';
const GENERATED_PREFIX = (process.env.ASSET_FACTORY_GENERATED_PREFIX ?? 'asset-factory/generated').replace(/\/$/, '');

function forceLocalStore() {
  return process.env.ASSET_FACTORY_FORCE_LOCAL === 'true';
}

function useFirebaseStore() {
  return !forceLocalStore() && isFirebaseAdminAvailable();
}

function generatedPath(fileName: string) {
  return `${GENERATED_PREFIX}/${fileName}`;
}

export function getStoreMode() {
  return useFirebaseStore() ? 'firestore-storage' : 'local-json';
}

export function getStoreDiagnostics() {
  const diagnostics = getFirebaseDiagnostics();

  return {
    mode: getStoreMode(),
    fallbackActive: !useFirebaseStore(),
    firebase: diagnostics,
    collections: {
      jobs: JOBS_COLLECTION,
      assets: ASSETS_COLLECTION,
    },
    generatedPrefix: GENERATED_PREFIX,
  };
}

async function firestoreAddJob(job: GenericRecord) {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore is not available');

  await db.collection(JOBS_COLLECTION).doc(String(job.jobId)).set(job, { merge: true });
  return job;
}

async function firestoreReadJobs() {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore is not available');

  const snapshot = await db.collection(JOBS_COLLECTION).orderBy('createdAt', 'desc').limit(250).get();
  return snapshot.docs.map((doc) => doc.data() as GenericRecord);
}

async function firestoreFindJob(jobId: string) {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore is not available');

  const doc = await db.collection(JOBS_COLLECTION).doc(jobId).get();
  return doc.exists ? (doc.data() as GenericRecord) : null;
}

async function firestoreUpdateJob(jobId: string, patch: GenericRecord) {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore is not available');

  const ref = db.collection(JOBS_COLLECTION).doc(jobId);
  const existing = await ref.get();

  if (!existing.exists) return null;

  const updated = {
    ...existing.data(),
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await ref.set(updated, { merge: true });
  return updated;
}

async function firestoreListAssets() {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore is not available');

  const snapshot = await db.collection(ASSETS_COLLECTION).orderBy('createdAt', 'desc').limit(250).get();
  return snapshot.docs.map((doc) => doc.data() as GenericRecord);
}

async function firestoreFindAsset(jobId: string) {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore is not available');

  const doc = await db.collection(ASSETS_COLLECTION).doc(jobId).get();
  return doc.exists ? (doc.data() as GenericRecord) : null;
}

async function firestoreUpsertAsset(asset: GenericRecord) {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore is not available');

  await db.collection(ASSETS_COLLECTION).doc(String(asset.jobId)).set(asset, { merge: true });
  return asset;
}

async function writeGenerated(fileName: string, buffer: Buffer, contentType?: string) {
  if (!useFirebaseStore()) {
    await localWriteGenerated(fileName, buffer);
    return { storagePath: fileName, publicUrl: null };
  }

  const bucket = getAdminBucket();
  if (!bucket) throw new Error('Cloud Storage bucket is not available');

  const file = bucket.file(generatedPath(fileName));
  await file.save(buffer, {
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=31536000, immutable',
      contentType: contentType ?? 'application/octet-stream',
    },
  });

  return {
    storagePath: file.name,
    publicUrl: `gs://${bucket.name}/${file.name}`,
  };
}

export async function addJob(job: GenericRecord) {
  return useFirebaseStore() ? firestoreAddJob(job) : localAddJob(job);
}

export async function readJobs() {
  return useFirebaseStore() ? firestoreReadJobs() : localReadJobs();
}

export async function findJob(jobId: string) {
  return useFirebaseStore() ? firestoreFindJob(jobId) : localFindJob(jobId);
}

export async function updateJob(jobId: string, patch: GenericRecord) {
  return useFirebaseStore() ? firestoreUpdateJob(jobId, patch) : localUpdateJob(jobId, patch);
}

export async function listAssets() {
  return useFirebaseStore() ? firestoreListAssets() : localListAssets();
}

export async function findAsset(jobId: string) {
  return useFirebaseStore() ? firestoreFindAsset(jobId) : localFindAsset(jobId);
}

export async function materializeAsset(jobId: string) {
  const job = await findJob(jobId);

  if (!job) {
    return null;
  }

  await updateJob(jobId, { status: 'processing', startedAt: new Date().toISOString() });

  try {
    const rendered = await renderAsset(job as RenderableAssetJob);
    const assetWrite = await writeGenerated(rendered.assetFileName, rendered.assetBuffer, rendered.assetMimeType);
    const manifestFile = `${jobId}.json`;
    const manifest = {
      ...rendered.manifest,
      storagePaths: {
        asset: assetWrite.storagePath,
        assetUrl: assetWrite.publicUrl,
        manifest: useFirebaseStore() ? generatedPath(manifestFile) : manifestFile,
      },
      previewPath: assetWrite.publicUrl ?? `/api/generated-assets/${rendered.assetFileName}`,
    };

    await writeGenerated(manifestFile, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');

    const asset = {
      jobId,
      tenantId: String(job.tenantId ?? 'default'),
      fileName: rendered.assetFileName,
      manifestFile,
      manifest,
      createdAt: new Date().toISOString(),
      published: false,
      storageMode: getStoreMode(),
    };

    if (useFirebaseStore()) {
      await firestoreUpsertAsset(asset);
    } else {
      await localUpsertAsset(asset);
    }

    await updateJob(jobId, { status: 'materialized', completedAt: new Date().toISOString() });

    return asset;
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown render failure',
    });
    throw error;
  }
}

export async function readGeneratedAsset(fileName: string) {
  if (!useFirebaseStore()) {
    return localReadGenerated(fileName);
  }

  const bucket = getAdminBucket();
  if (!bucket) throw new Error('Cloud Storage bucket is not available');

  try {
    const [buffer] = await bucket.file(generatedPath(fileName)).download();
    return buffer;
  } catch {
    return null;
  }
}

export async function searchAssets() {
  return listAssets();
}

export async function publishAsset(jobId: string) {
  const asset = await findAsset(jobId);

  if (!asset) {
    return null;
  }

  const updated = {
    ...asset,
    published: true,
    publishedAt: new Date().toISOString(),
  };

  if (useFirebaseStore()) {
    await firestoreUpsertAsset(updated);
  } else {
    await localUpsertAsset(updated);
  }

  return updated;
}

export async function rollbackAsset(jobId: string, versionId: string) {
  return {
    jobId,
    versionId,
    rolledBack: true,
  };
}

export async function approveAsset(jobId: string, approvalPatch: GenericRecord) {
  return {
    jobId,
    ...approvalPatch,
    approvalId: randomUUID(),
  };
}

export async function createAssetVersion(jobId: string, versionPatch: GenericRecord) {
  return {
    jobId,
    versionId: randomUUID(),
    ...versionPatch,
  };
}
