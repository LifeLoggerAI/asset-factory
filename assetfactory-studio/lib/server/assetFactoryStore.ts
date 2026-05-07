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
import { attachStoragePathsToManifest, buildArtifactStoragePaths } from './assetStoragePaths';

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

  await updateJob(jobId, {
    status: 'rendering',
    renderStartedAt: new Date().toISOString(),
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
    const manifest = attachStoragePathsToManifest(rendered.manifest, paths);

    await localWriteGenerated(rendered.assetFileName, rendered.assetBuffer);
    await localWriteGenerated(
      manifestFile,
      Buffer.from(JSON.stringify(manifest, null, 2))
    );

    const asset = {
      jobId,
      tenantId: String(job.tenantId ?? 'default'),
      fileName: rendered.assetFileName,
      manifestFile,
      manifest,
      storagePaths: paths,
      createdAt: new Date().toISOString(),
      published: false,
    };

    await localUpsertAsset(asset);
    await updateJob(jobId, {
      status: 'materialized',
      renderCompletedAt: new Date().toISOString(),
      assetFileName: rendered.assetFileName,
      manifestFile,
      rendererMode: rendered.mode,
    });

    return asset;
  } catch (error) {
    await updateJob(jobId, {
      status: 'failed',
      failedAt: new Date().toISOString(),
      failureReason: error instanceof Error ? error.message : 'unknown render error',
    });
    throw error;
  }
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
  await updateJob(jobId, { status: 'published', publishedAt: updated.publishedAt });

  return updated;
}

export async function rollbackAsset(jobId: string, versionId: string) {
  const job = await findJob(jobId);
  if (!job) return null;

  const rollback = {
    jobId,
    versionId,
    rolledBack: true,
    rolledBackAt: new Date().toISOString(),
  };

  await updateJob(jobId, { status: 'rolled_back', rollback });
  return rollback;
}

export async function approveAsset(jobId: string, approvalPatch: GenericRecord) {
  const approval = {
    jobId,
    ...approvalPatch,
    approvalId: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  const asset = await findAsset(jobId);
  if (asset) {
    const assetRecord = asset as GenericRecord;
    const manifest = assetRecord.manifest as GenericRecord | undefined;
    await localUpsertAsset({
      ...assetRecord,
      manifest: manifest
        ? { ...manifest, approvalStatus: approvalPatch.status ?? 'approved' }
        : manifest,
      approval,
    });
  }

  await updateJob(jobId, {
    approvalStatus: approvalPatch.status ?? 'approved',
    approvedAt: approval.createdAt,
  });

  return approval;
}

export async function createAssetVersion(jobId: string, versionPatch: GenericRecord) {
  return {
    jobId,
    versionId: randomUUID(),
    createdAt: new Date().toISOString(),
    ...versionPatch,
  };
}
