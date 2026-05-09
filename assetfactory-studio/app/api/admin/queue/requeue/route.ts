import { NextRequest, NextResponse } from 'next/server';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { recordUsage, updateJob } from '@/lib/server/assetFactoryStore';
import { requeueAssetQueueJob } from '@/lib/server/assetQueueOps';

async function parseBody(req: NextRequest) {
  try {
    return await req.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function POST(req: NextRequest) {
  const auth = authorizeAssetRequest(req, undefined, 'admin');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await parseBody(req);
  const jobId = typeof body.jobId === 'string' && body.jobId.trim() ? body.jobId.trim() : undefined;
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : undefined;
  const resetAttempts = body.resetAttempts === true;
  const includeAllTenants = body.allTenants === true;

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const result = await requeueAssetQueueJob({
    jobId,
    tenantId: includeAllTenants && auth.roles.includes('admin') ? undefined : auth.tenantId,
    operatorId: auth.userId,
    reason,
    resetAttempts,
  });

  await recordUsage({
    action: result.requeued ? 'queue.admin_requeued' : 'queue.admin_requeue_rejected',
    jobId,
    tenantId: result.tenantId ?? auth.tenantId,
    operatorId: auth.userId,
    previousStatus: result.previousStatus,
    requeueReason: reason,
    resetAttempts,
    requeued: result.requeued,
    rejectionReason: result.reason,
  });

  if (result.requeued) {
    await updateJob(jobId, {
      queueStatus: 'queued',
      status: 'queued',
      failureReason: undefined,
      requeuedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: result.requeued, ...result }, { status: result.requeued ? 200 : 409 });
}
