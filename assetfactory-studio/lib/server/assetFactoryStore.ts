import { randomUUID } from 'node:crypto';
import { getAdminBucket, getAdminDb, getFirebaseDiagnostics, isFirebaseAdminAvailable } from './firebaseAdmin';
import {
  localAddJob,
  localFindAsset,
  localFindJob,
  localListAssets,
  localListUsage,
  localReadGenerated,
  localReadJobs,
  localRecordUsage,
  localUpdateJob,
  localUpsertAsset,
  localWriteGenerated,
} from './localAssetFactoryStore';
import { renderAsset } from './assetRenderer';
import { attachStoragePathsToManifest, buildArtifactStoragePaths } from './assetStoragePaths';

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

async function upsertAsset(asset: GenericRecord) {
  return useFirebaseStore() ? firestoreUpsertAsset(asset) : localUpsertAsset(asset);
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

export async function recordUsage(event: GenericRecord) {
  return localRecordUsage({
    eventId: event.eventId ?? randomUUID(),
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString(),
  });
}

export async function listUsageEvents() {
  return localListUsage();
}

export async function addJob(job: GenericRecord) {
  const saved = useFirebaseStore() ? await firestoreAddJob(job) : await localAddJob(job);

  await recordUsage({
    action: 'job.created',
    tenantId: job.tenantId ?? 'default',
    jobId: job.jobId,
    assetType: job.canonicalType ?? job.type,
    assetFamily: job.assetFamily,
    estimatedUnits: job.estimatedUnits ?? 0,
    estimatedCostCents: job.estimatedCostCents ?? 0,
  });

  return saved;
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

  await updateJob(jobId, {
    status: 'rendering',
    renderStartedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
  });

  await recordUsage({
    action: 'job.rendering',
    tenantId: job.tenantId ?? 'default',
    jobId,
    assetType: job.canonicalType ?? job.type,
    estimatedUnits: job.estimatedUnits ?? 0,
    estimatedCostCents: job.estimatedCostCents ?? 0,
  });

  try {
    const rendered = await renderAsset(job as RenderableAssetJob);
    const manifestFile = `${jobId}.json`;

    const paths = buildArtifactStoragePaths({
      tenantId: String(job.tenantId ?? 'default'),
      jobId,
      version: rendered.manifest.version,
      fileName: rendered.assetFileName,
      manifestFile,
    });

    const assetWrite = await writeGenerated(
      rendered.assetFileName,
      rendered.assetBuffer,
      rendered.assetMimeType
    );

    const manifestWritePath = useFirebaseStore()
      ? generatedPath(manifestFile)
      : manifestFile;

    const manifest = attachStoragePathsToManifest(rendered.manifest, {
      ...paths,
      asset: assetWrite.storagePath,
      assetUrl: assetWrite.publicUrl ?? paths.assetUrl,
      manifest: manifestWritePath,
    });

    await writeGenerated(
      manifestFile,
      Buffer.from(JSON.stringify(manifest, null, 2)),
      'application/json'
    );

    const asset = {
      jobId,
      tenantId: String(job.tenantId ?? 'default'),
      fileName: rendered.assetFileName,
      manifestFile,
      manifest,
      storagePaths: {
        ...paths,
        asset: assetWrite.storagePath,
        assetUrl: assetWrite.publicUrl ?? paths.assetUrl,
        manifest: manifestWritePath,
      },
      previewPath: assetWrite.publicUrl ?? `/api/generated-assets/${rendered.assetFileName}`,
      createdAt: new Date().toISOString(),
      published: false,
      storageMode: getStoreMode(),
    };

    await upsertAsset(asset);

    await updateJob(jobId, {
      status: 'materialized',
      renderCompletedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      assetFileName: rendered.assetFileName,
      manifestFile,
      rendererMode: rendered.mode,
    });

    await recordUsage({
      action: 'asset.materialized',
      tenantId: job.tenantId ?? 'default',
      jobId,
      assetType: manifest.metadata?.canonicalType ?? manifest.type,
      rendererMode: rendered.mode,
      fileName: rendered.assetFileName,
      estimatedUnits: job.estimatedUnits ?? 0,
      estimatedCostCents: job.estimatedCostCents ?? 0,
    });

    return asset;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'unknown render error';

    await updateJob(jobId, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      failureReason,
      error: failureReason,
    });

    await recordUsage({
      action: 'job.failed',
      tenantId: job.tenantId ?? 'default',
      jobId,
      assetType: job.canonicalType ?? job.type,
      failureReason,
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

  const publishedAt = new Date().toISOString();

  const updated = {
    ...asset,
    published: true,
    publishedAt,
  };

  await upsertAsset(updated);
  await updateJob(jobId, { status: 'published', publishedAt });

  await recordUsage({
    action: 'asset.published',
    tenantId: (asset as GenericRecord).tenantId ?? 'default',
    jobId,
    assetType: ((asset as GenericRecord).manifest as GenericRecord | undefined)?.type,
  });

  return updated;
}

export async function rollbackAsset(jobId: string, versionId: string) {
  const asset = await findAsset(jobId);

  if (!asset) {
    return null;
  }

  const rollback = {
    rollbackId: randomUUID(),
    versionId,
    rolledBack: true,
    rolledBackAt: new Date().toISOString(),
  };

  const updated = {
    ...asset,
    activeVersionId: versionId,
    lastRollback: rollback,
    rollbacks: [...((asset.rollbacks as GenericRecord[] | undefined) ?? []), rollback],
  };

  await upsertAsset(updated);
  await updateJob(jobId, {
    status: 'rolled-back',
    activeVersionId: versionId,
    lastRollback: rollback,
  });

  await recordUsage({
    action: 'asset.rolled_back',
    tenantId: (asset as GenericRecord).tenantId ?? 'default',
    jobId,
    versionId,
  });

  return updated;
}

export async function approveAsset(jobId: string, approvalPatch: GenericRecord) {
  const asset = await findAsset(jobId);

  if (!asset) {
    return null;
  }

  const approval = {
    approvalId: randomUUID(),
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...approvalPatch,
  };

  const approvalStatus = approvalPatch.status ?? 'approved';
  const assetRecord = asset as GenericRecord;
  const manifest = assetRecord.manifest as GenericRecord | undefined;

  const updated = {
    ...assetRecord,
    manifest: manifest
      ? { ...manifest, approvalStatus }
      : manifest,
    approvalStatus,
    approvedAt: approval.approvedAt,
    lastApproval: approval,
    approval,
    approvals: [...((assetRecord.approvals as GenericRecord[] | undefined) ?? []), approval],
  };

  await upsertAsset(updated);

  await updateJob(jobId, {
    status: approvalStatus === 'approved' ? 'approved' : 'reviewed',
    approvalStatus,
    approvedAt: approval.approvedAt,
    lastApproval: approval,
  });

  await recordUsage({
    action: 'asset.approved',
    tenantId: assetRecord.tenantId ?? 'default',
    jobId,
    approvalStatus,
  });

  return updated;
}

export async function createAssetVersion(jobId: string, versionPatch: GenericRecord) {
  const asset = await findAsset(jobId);

  if (!asset) {
    return null;
  }

  const version = {
    versionId: randomUUID(),
    createdAt: new Date().toISOString(),
    ...versionPatch,
  };

  const updated = {
    ...asset,
    activeVersionId: version.versionId,
    lastVersion: version,
    versions: [...((asset.versions as GenericRecord[] | undefined) ?? []), version],
  };

  await upsertAsset(updated);
  await updateJob(jobId, {
    activeVersionId: version.versionId,
    lastVersion: version,
  });

  await recordUsage({
    action: 'asset.version_created',
    tenantId: (asset as GenericRecord).tenantId ?? 'default',
    jobId,
    versionId: version.versionId,
  });

  return updated;
}