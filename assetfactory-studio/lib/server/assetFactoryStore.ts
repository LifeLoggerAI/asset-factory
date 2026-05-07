import { randomUUID } from 'node:crypto';
import { getFirebaseDiagnostics } from './firebaseAdmin';
import { activeAssetBackend } from './assetBackend';
import { renderAsset } from './assetRenderer';
import { attachStoragePathsToManifest, buildArtifactStoragePaths } from './assetStoragePaths';

type GenericRecord = Record<string, unknown>;
type RenderableAssetJob = GenericRecord & { jobId: string; prompt: string; type: string; tenantId?: string };

export function getStoreMode() {
  return activeAssetBackend().mode;
}

export function getStoreDiagnostics() {
  const diagnostics = getFirebaseDiagnostics();
  return { mode: getStoreMode(), fallbackActive: activeAssetBackend().mode === 'local-json', firebase: diagnostics };
}

export async function recordUsage(event: GenericRecord) {
  return activeAssetBackend().recordUsage({ eventId: event.eventId ?? randomUUID(), ...event, createdAt: event.createdAt ?? new Date().toISOString() });
}

export async function listUsageEvents() { return activeAssetBackend().listUsage(); }

export async function addJob(job: GenericRecord) {
  const saved = await activeAssetBackend().addJob(job);
  await recordUsage({ action: 'job.created', tenantId: job.tenantId ?? 'default', jobId: job.jobId, assetType: job.canonicalType ?? job.type, assetFamily: job.assetFamily, estimatedUnits: job.estimatedUnits ?? 0, estimatedCostCents: job.estimatedCostCents ?? 0 });
  return saved;
}

export async function readJobs() { return activeAssetBackend().readJobs(); }
export async function findJob(jobId: string) { return activeAssetBackend().findJob(jobId); }
export async function updateJob(jobId: string, patch: GenericRecord) { return activeAssetBackend().updateJob(jobId, patch); }
export async function listAssets() { return activeAssetBackend().listAssets(); }
export async function findAsset(jobId: string) { return activeAssetBackend().findAsset(jobId); }

async function upsertAsset(asset: GenericRecord) { return activeAssetBackend().upsertAsset(asset); }

async function writeGeneratedFile(fileName: string, buffer: Buffer, contentType: string, storagePath: string) {
  const writer = activeAssetBackend().writeGenerated as unknown as (fileName: string, buffer: Buffer, contentType?: string, storagePath?: string) => Promise<unknown>;
  return writer(fileName, buffer, contentType, storagePath);
}

export async function materializeAsset(jobId: string) {
  const job = await findJob(jobId);
  if (!job) return null;

  await updateJob(jobId, { status: 'rendering', renderStartedAt: new Date().toISOString() });
  await recordUsage({ action: 'job.rendering', tenantId: job.tenantId ?? 'default', jobId, assetType: job.canonicalType ?? job.type, estimatedUnits: job.estimatedUnits ?? 0, estimatedCostCents: job.estimatedCostCents ?? 0 });

  try {
    const rendered = await renderAsset(job as RenderableAssetJob);
    const manifestFile = `${jobId}.json`;
    const paths = buildArtifactStoragePaths({ tenantId: String(job.tenantId ?? 'default'), jobId, version: rendered.manifest.version, fileName: rendered.assetFileName, manifestFile });
    const manifest = attachStoragePathsToManifest(rendered.manifest, paths);
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
    const artifactUri = await writeGeneratedFile(rendered.assetFileName, rendered.assetBuffer, rendered.assetMimeType, paths.artifact);
    const manifestUri = await writeGeneratedFile(manifestFile, manifestBuffer, 'application/json; charset=utf-8', paths.manifest);
    const asset = { jobId, tenantId: String(job.tenantId ?? 'default'), fileName: rendered.assetFileName, manifestFile, manifest, storagePaths: { ...paths, artifactUri, manifestUri }, createdAt: new Date().toISOString(), published: false };

    await upsertAsset(asset);
    await updateJob(jobId, { status: 'materialized', renderCompletedAt: new Date().toISOString(), assetFileName: rendered.assetFileName, manifestFile, rendererMode: rendered.mode });
    await recordUsage({ action: 'asset.materialized', tenantId: job.tenantId ?? 'default', jobId, assetType: manifest.metadata?.canonicalType ?? manifest.type, rendererMode: rendered.mode, fileName: rendered.assetFileName, estimatedUnits: job.estimatedUnits ?? 0, estimatedCostCents: job.estimatedCostCents ?? 0 });
    return asset;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'unknown render error';
    await updateJob(jobId, { status: 'failed', failedAt: new Date().toISOString(), failureReason });
    await recordUsage({ action: 'job.failed', tenantId: job.tenantId ?? 'default', jobId, assetType: job.canonicalType ?? job.type, failureReason });
    throw error;
  }
}

export async function readGeneratedAsset(fileName: string) {
  const backend = activeAssetBackend();
  if (backend.mode === 'local-json') return backend.readGenerated(fileName);
  const jobId = fileName.split('.').slice(0, -1).join('.') || fileName;
  const asset = await backend.findAsset(jobId) as GenericRecord | null;
  const storagePaths = asset?.storagePaths as GenericRecord | undefined;
  const storagePath = fileName.endsWith('.json') ? storagePaths?.manifest : storagePaths?.artifact;
  const reader = backend.readGenerated as unknown as (fileName: string, storagePath?: string) => Promise<Buffer | null>;
  return reader(fileName, typeof storagePath === 'string' ? storagePath : undefined);
}

export async function searchAssets() { return listAssets(); }

export async function publishAsset(jobId: string) {
  const asset = await findAsset(jobId);
  if (!asset) return null;
  const updated = { ...asset, published: true, publishedAt: new Date().toISOString() };
  await upsertAsset(updated);
  await updateJob(jobId, { status: 'published', publishedAt: updated.publishedAt });
  await recordUsage({ action: 'asset.published', tenantId: (asset as GenericRecord).tenantId ?? 'default', jobId, assetType: ((asset as GenericRecord).manifest as GenericRecord | undefined)?.type });
  return updated;
}

export async function rollbackAsset(jobId: string, versionId: string) {
  const job = await findJob(jobId);
  if (!job) return null;
  const rollback = { jobId, versionId, rolledBack: true, rolledBackAt: new Date().toISOString() };
  await updateJob(jobId, { status: 'rolled_back', rollback });
  await recordUsage({ action: 'asset.rolled_back', tenantId: job.tenantId ?? 'default', jobId, versionId });
  return rollback;
}

export async function approveAsset(jobId: string, approvalPatch: GenericRecord) {
  const approval = { jobId, ...approvalPatch, approvalId: randomUUID(), createdAt: new Date().toISOString() };
  const asset = await findAsset(jobId);
  if (asset) {
    const assetRecord = asset as GenericRecord;
    const manifest = assetRecord.manifest as GenericRecord | undefined;
    await upsertAsset({ ...assetRecord, manifest: manifest ? { ...manifest, approvalStatus: approvalPatch.status ?? 'approved' } : manifest, approval });
    await recordUsage({ action: 'asset.approved', tenantId: assetRecord.tenantId ?? 'default', jobId, approvalStatus: approvalPatch.status ?? 'approved' });
  }
  await updateJob(jobId, { approvalStatus: approvalPatch.status ?? 'approved', approvedAt: approval.createdAt });
  return approval;
}

export async function createAssetVersion(jobId: string, versionPatch: GenericRecord) {
  return { jobId, versionId: randomUUID(), createdAt: new Date().toISOString(), ...versionPatch };
}
