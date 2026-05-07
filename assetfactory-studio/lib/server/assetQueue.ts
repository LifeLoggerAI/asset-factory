import { findJob, materializeAsset, readJobs, updateJob } from './assetFactoryStore';
import { dispatchAssetJob } from './assetQueueDispatcher';

export type AssetQueueStatus = 'pending' | 'queued' | 'rendering' | 'materialized' | 'failed' | 'unknown';

export type AssetQueueItem = {
  jobId: string;
  status: AssetQueueStatus;
  queueStatus?: unknown;
  dispatch?: unknown;
  type?: unknown;
  tenantId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  renderStartedAt?: unknown;
  renderCompletedAt?: unknown;
  failureReason?: unknown;
};

function normalizeStatus(job: Record<string, unknown> | null): AssetQueueStatus {
  if (!job) return 'unknown';
  if (job.queueStatus === 'queued') return 'queued';
  if (job.status === 'rendering') return 'rendering';
  if (job.status === 'materialized' || job.status === 'published') return 'materialized';
  if (job.status === 'failed') return 'failed';
  return 'pending';
}

export async function enqueueAssetMaterialization(jobId: string) {
  const job = await findJob(jobId) as Record<string, unknown> | null;
  if (!job) return null;

  const dispatch = await dispatchAssetJob(jobId, {
    tenantId: job.tenantId ?? 'default',
    type: job.canonicalType ?? job.type,
    source: 'assetfactory-studio',
  });

  await updateJob(jobId, {
    queueStatus: dispatch.queued ? 'queued' : 'local-inline',
    queuedAt: new Date().toISOString(),
    queueDispatch: dispatch,
  });

  return getAssetQueueItem(jobId);
}

export async function getAssetQueueItem(jobId: string): Promise<AssetQueueItem | null> {
  const job = await findJob(jobId) as Record<string, unknown> | null;
  if (!job) return null;

  return {
    jobId,
    status: normalizeStatus(job),
    queueStatus: job.queueStatus,
    dispatch: job.queueDispatch,
    type: job.type,
    tenantId: job.tenantId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    renderStartedAt: job.renderStartedAt,
    renderCompletedAt: job.renderCompletedAt,
    failureReason: job.failureReason,
  };
}

export async function listAssetQueueItems(): Promise<AssetQueueItem[]> {
  const jobs = await readJobs() as Record<string, unknown>[];
  return jobs.map((job) => ({
    jobId: String(job.jobId),
    status: normalizeStatus(job),
    queueStatus: job.queueStatus,
    dispatch: job.queueDispatch,
    type: job.type,
    tenantId: job.tenantId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    renderStartedAt: job.renderStartedAt,
    renderCompletedAt: job.renderCompletedAt,
    failureReason: job.failureReason,
  }));
}

export async function runAssetQueueJob(jobId: string) {
  const queued = await enqueueAssetMaterialization(jobId);
  if (!queued) return null;

  if (queued.dispatch && typeof queued.dispatch === 'object' && (queued.dispatch as { queued?: boolean }).queued) {
    return queued;
  }

  return materializeAsset(jobId);
}
