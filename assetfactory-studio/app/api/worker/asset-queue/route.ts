import { NextRequest, NextResponse } from 'next/server';
import { materializeAsset, recordUsage, updateJob } from '@/lib/server/assetFactoryStore';
import {
  claimNextAssetQueueJob,
  completeAssetQueueJob,
  failAssetQueueJob,
  heartbeatAssetQueueJob,
} from '@/lib/server/assetQueueDispatcher';

function workerSecretConfigured() {
  return Boolean(process.env.ASSET_FACTORY_WORKER_SECRET);
}

function providedBearer(req: NextRequest) {
  return req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}

function requireWorkerSecret(req: NextRequest) {
  const expected = process.env.ASSET_FACTORY_WORKER_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'ASSET_FACTORY_WORKER_SECRET is required for worker queue endpoints.' }, { status: 503 });
  }

  const provided = req.headers.get('x-asset-worker-secret') ?? providedBearer(req);
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized worker request' }, { status: 401 });
  }

  return null;
}

async function parseBody(req: NextRequest) {
  try {
    return await req.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'asset-factory-worker-queue',
    workerSecretConfigured: workerSecretConfigured(),
    actions: ['claim-and-run', 'heartbeat', 'complete', 'fail'],
  });
}

export async function POST(req: NextRequest) {
  const authError = requireWorkerSecret(req);
  if (authError) return authError;

  const body = await parseBody(req);
  const action = String(body.action ?? 'claim-and-run');
  const workerId = String(body.workerId ?? req.headers.get('x-worker-id') ?? 'asset-worker');
  const jobId = typeof body.jobId === 'string' ? body.jobId : undefined;
  const leaseId = typeof body.leaseId === 'string' ? body.leaseId : undefined;

  if (action === 'heartbeat') {
    if (!jobId || !leaseId) return NextResponse.json({ error: 'jobId and leaseId are required' }, { status: 400 });
    const item = await heartbeatAssetQueueJob(jobId, leaseId);
    if (!item) return NextResponse.json({ error: 'Queue item lease not found or not active' }, { status: 404 });
    return NextResponse.json({ ok: true, action, item });
  }

  if (action === 'complete') {
    if (!jobId || !leaseId) return NextResponse.json({ error: 'jobId and leaseId are required' }, { status: 400 });
    const item = await completeAssetQueueJob(jobId, leaseId, { workerCompletion: body.workerCompletion });
    if (!item) return NextResponse.json({ error: 'Queue item lease not found' }, { status: 404 });
    return NextResponse.json({ ok: true, action, item });
  }

  if (action === 'fail') {
    if (!jobId || !leaseId) return NextResponse.json({ error: 'jobId and leaseId are required' }, { status: 400 });
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason : 'worker reported failure';
    const retryable = body.retryable !== false;
    const item = await failAssetQueueJob(jobId, leaseId, reason, retryable);
    if (!item) return NextResponse.json({ error: 'Queue item lease not found' }, { status: 404 });
    await updateJob(jobId, { queueStatus: item.queueStatus, failureReason: reason });
    await recordUsage({ action: 'queue.worker_failed', jobId, workerId, retryable, failureReason: reason });
    return NextResponse.json({ ok: true, action, item });
  }

  if (action !== 'claim-and-run') {
    return NextResponse.json({ error: `Unsupported worker action: ${action}` }, { status: 400 });
  }

  const claimed = await claimNextAssetQueueJob(workerId);
  if (!claimed) {
    return NextResponse.json({ ok: true, action, claimed: false, message: 'No claimable asset queue job found.' });
  }

  await updateJob(claimed.jobId, {
    status: 'rendering',
    queueStatus: 'claimed',
    workerId,
    leaseId: claimed.leaseId,
    leaseExpiresAt: claimed.leaseExpiresAt,
    attempts: claimed.attempts,
  });

  await recordUsage({
    action: 'queue.worker_claimed',
    jobId: claimed.jobId,
    workerId,
    leaseId: claimed.leaseId,
    attempts: claimed.attempts,
  });

  try {
    const asset = await materializeAsset(claimed.jobId);
    const completed = await completeAssetQueueJob(claimed.jobId, claimed.leaseId, {
      materializedAssetFile: asset && typeof asset === 'object' ? (asset as Record<string, unknown>).fileName : undefined,
    });

    await updateJob(claimed.jobId, {
      queueStatus: 'completed',
      workerId,
      leaseId: claimed.leaseId,
    });

    await recordUsage({
      action: 'queue.worker_completed',
      jobId: claimed.jobId,
      workerId,
      leaseId: claimed.leaseId,
    });

    return NextResponse.json({ ok: true, action, claimed: true, item: completed, asset });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown worker materialization error';
    const failed = await failAssetQueueJob(claimed.jobId, claimed.leaseId, reason, true);

    await updateJob(claimed.jobId, {
      queueStatus: failed?.queueStatus ?? 'failed',
      failureReason: reason,
      workerId,
      leaseId: claimed.leaseId,
    });

    await recordUsage({
      action: 'queue.worker_failed',
      jobId: claimed.jobId,
      workerId,
      leaseId: claimed.leaseId,
      retryable: true,
      failureReason: reason,
    });

    return NextResponse.json({ ok: false, action, claimed: true, item: failed, error: reason }, { status: 500 });
  }
}
