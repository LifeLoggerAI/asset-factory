import { NextRequest, NextResponse } from 'next/server';
import { readJobs } from '@/lib/server/assetFactoryStore';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { readQueueOpsSummary } from '@/lib/server/assetQueueOps';

type AssetFactoryJobLike = {
  tenantId?: string;
  status?: string;
};

export async function GET(req: NextRequest) {
  const auth = authorizeAssetRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const allJobs = await readJobs() as AssetFactoryJobLike[];
  const jobs = auth.tenantId
    ? allJobs.filter((job) => job.tenantId === auth.tenantId)
    : allJobs;
  const queue = await readQueueOpsSummary({ tenantId: auth.tenantId, limit: 200 });

  const total = jobs.length;
  const complete = jobs.filter((job) => job.status === 'materialized').length;
  const failedJobs = jobs.filter((job) => job.status === 'failed' || job.status === 'error').length;
  const failedQueueItems = queue.failedOrDeadLettered;
  const failureRate = total ? (failedJobs + failedQueueItems) / total : 0;

  return NextResponse.json({
    tenantId: auth.tenantId ?? null,
    jobsPerMinute: total / 5,
    failureRate,
    dlqSize: queue.byStatus['dead-lettered'] ?? 0,
    queueFailures: failedQueueItems,
    staleClaimedQueueItems: queue.staleClaimed,
    queueByStatus: queue.byStatus,
    avgCostPerJob: 0,
    avgProcessingTimeMs: 0,
    total,
    complete,
  });
}
