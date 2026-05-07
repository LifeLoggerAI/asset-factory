import { randomUUID } from 'node:crypto';
import { getFirebaseDiagnostics, isFirebaseAdminAvailable } from './firebaseAdmin';
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
  const saved = await localAddJob(job);
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
  await recordUsage({
    action: 'asset.published',
    tenantId: (asset as GenericRecord).tenantId ?? 'default',
    jobId,
    assetType: ((asset as GenericRecord).manifest as GenericRecord | undefined)?.type,
  });

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
  await recordUsage({
    action: 'asset.rolled_back',
    tenantId: job.tenantId ?? 'default',
    jobId,
    versionId,
  });
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
    await recordUsage({
      action: 'asset.approved',
      tenantId: assetRecord.tenantId ?? 'default',
      jobId,
      approvalStatus: approvalPatch.status ?? 'approved',
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
