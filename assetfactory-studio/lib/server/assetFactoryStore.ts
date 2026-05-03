import { randomUUID } from 'node:crypto';
import { getFirebaseDiagnostics, isFirebaseAdminAvailable } from './firebaseAdmin';
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

export function getStoreMode() {
  return isFirebaseAdminAvailable() ? 'firestore-storage' : 'local-json';
}

export function getStoreDiagnostics() {
  const diagnostics = getFirebaseDiagnostics();

  return {
    mode: getStoreMode(),
    fallbackActive: !diagnostics.available,
    firebase: diagnostics,
  };
}

export async function addJob(job: GenericRecord) {
  return localAddJob(job);
}

export async function readJobs() {
  return localReadJobs();
}

export async function findJob(jobId: string) {
  return localFindJob(jobId);
}

export async function updateJob(jobId: string, patch: GenericRecord) {
  return localUpdateJob(jobId, patch);
}

export async function listAssets() {
  return localListAssets();
}

export async function findAsset(jobId: string) {
  return localFindAsset(jobId);
}

export async function materializeAsset(jobId: string) {
  const job = await findJob(jobId);

  if (!job) {
    return null;
  }

  const rendered = await renderAsset(job as RenderableAssetJob);

  await localWriteGenerated(rendered.assetFileName, rendered.assetBuffer);
  await localWriteGenerated(
    `${jobId}.json`,
    Buffer.from(JSON.stringify(rendered.manifest, null, 2))
  );

  const asset = {
    jobId,
    tenantId: String(job.tenantId ?? 'default'),
    fileName: rendered.assetFileName,
    manifestFile: `${jobId}.json`,
    manifest: rendered.manifest,
    createdAt: new Date().toISOString(),
    published: false,
  };

  await localUpsertAsset(asset);
  await updateJob(jobId, { status: 'materialized' });

  return asset;
}

export async function readGeneratedAsset(fileName: string) {
  return localReadGenerated(fileName);
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

  await localUpsertAsset(updated);

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