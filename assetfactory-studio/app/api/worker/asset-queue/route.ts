import { NextRequest, NextResponse } from 'next/server';
import { recordUsage, updateJob } from '@/lib/server/assetFactoryStore';
import {
  claimNextAssetQueueJob,
  completeAssetQueueJob,
  failAssetQueueJob,
  heartbeatAssetQueueJob,
} from '@/lib/server/assetQueueDispatcher';
import {
  classifyExecutionError,
  generatorConfigurationSnapshot,
  isContinuousAssetEngineEnabled,
  isContinuousAssetEnginePaused,
  reconcilePendingPromotions,
  runGovernedAssetJob,
} from '@/lib/server/assetContinuousEngine';

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
    continuousEngineEnabled: isContinuousAssetEngineEnabled(),
    workersPaused: isContinuousAssetEnginePaused(),
    generatorConfiguration: generatorConfigurationSnapshot(),
    actions: ['claim-and-run', 'reconcile-pending', 'heartbeat', 'complete', 'fail'],
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
    const retryable = body.retryable === true;
    const item = await failAssetQueueJob(jobId, leaseId, reason, retryable);
    if (!item) return NextResponse.json({ error: 'Queue item lease not found' }, { status: 404 });
    await updateJob(jobId, { queueStatus: item.queueStatus, failureReason: reason });
    await recordUsage({ action: 'queue.worker_failed', jobId, workerId, retryable, failureReason: reason });
    return NextResponse.json({ ok: true, action, item });
  }

  if (action === 'reconcile-pending') {
    if (!isContinuousAssetEngineEnabled()) {
      return NextResponse.json({ error: 'Continuous asset engine is disabled.' }, { status: 503 });
    }
    const limit = Number(body.limit ?? 10);
    const reconciliation = await reconcilePendingPromotions(limit);
    return NextResponse.json({ ok: true, action, ...reconciliation });
  }

  if (action !== 'claim-and-run') {
    return NextResponse.json({ error: `Unsupported worker action: ${action}` }, { status: 400 });
  }

  if (!isContinuousAssetEngineEnabled()) {
    return NextResponse.json({ error: 'Continuous asset engine is disabled.' }, { status: 503 });
  }
  if (isContinuousAssetEnginePaused()) {
    return NextResponse.json({ error: 'Continuous asset engine workers are paused.' }, { status: 423 });
  }

  const claimed = await claimNextAssetQueueJob(workerId);
  if (!claimed) {
    return NextResponse.json({ ok: true, action, claimed: false, message: 'No claimable asset queue job found.' });
  }

  await recordUsage({
    action: 'queue.worker_claimed',
    jobId: claimed.jobId,
    workerId,
    leaseId: claimed.leaseId,
    attempts: claimed.attempts,
  });

  try {
    const result = await runGovernedAssetJob(claimed, workerId);

    if (result.outcome === 'retryable-failure') {
      const reason = result.policyDecision.reasons.join('; ');
      const failed = await failAssetQueueJob(claimed.jobId, claimed.leaseId, reason, true);
      await updateJob(claimed.jobId, { queueStatus: failed?.queueStatus ?? 'retrying', failureReason: reason });
      return NextResponse.json({ ok: false, action, claimed: true, result, item: failed }, { status: 503 });
    }

    if (result.outcome === 'rejected') {
      const reason = result.policyDecision.reasons.join('; ');
      const failed = await failAssetQueueJob(claimed.jobId, claimed.leaseId, reason, false);
      await updateJob(claimed.jobId, { queueStatus: failed?.queueStatus ?? 'dead-lettered', failureReason: reason });
      return NextResponse.json({ ok: false, action, claimed: true, result, item: failed }, { status: 422 });
    }

    const completed = await completeAssetQueueJob(claimed.jobId, claimed.leaseId, {
      governedOutcome: result.outcome,
      materializedAssetFile: result.assetFileName,
      validationReportId: result.validation.reportId,
      policyDisposition: result.policyDecision.disposition,
      promotionPullRequestUrl: result.promotion?.pullRequestUrl,
    });
    await recordUsage({
      action: 'queue.worker_completed',
      jobId: claimed.jobId,
      workerId,
      leaseId: claimed.leaseId,
      governedOutcome: result.outcome,
    });
    return NextResponse.json({ ok: true, action, claimed: true, item: completed, result });
  } catch (error) {
    const classified = classifyExecutionError(error);
    const failed = await failAssetQueueJob(claimed.jobId, claimed.leaseId, classified.message, classified.retryable);
    await updateJob(claimed.jobId, {
      queueStatus: failed?.queueStatus ?? (classified.retryable ? 'retrying' : 'dead-lettered'),
      failureReason: classified.message,
      workerId,
      leaseId: claimed.leaseId,
      executionFailureCode: classified.code,
    });
    await recordUsage({
      action: 'queue.worker_failed',
      jobId: claimed.jobId,
      workerId,
      leaseId: claimed.leaseId,
      retryable: classified.retryable,
      failureReason: classified.message,
      failureCode: classified.code,
    });
    return NextResponse.json({ ok: false, action, claimed: true, item: failed, error: classified.message }, { status: classified.retryable ? 503 : 500 });
  }
}
