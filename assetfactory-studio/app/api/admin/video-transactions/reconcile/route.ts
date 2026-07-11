import { NextRequest, NextResponse } from 'next/server';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { recordUsage, updateJob } from '@/lib/server/assetFactoryStore';
import {
  reconcileVideoProviderTransaction,
  type VideoReconciliationResolution,
} from '@/lib/server/assetVideoReconciliation';

const allowedResolutions = new Set<VideoReconciliationResolution>([
  'artifact-accepted',
  'artifact-rejected',
  'failed-cost-settled',
  'provider-refund',
]);

async function parseBody(req: NextRequest) {
  try {
    return await req.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? 'video reconciliation failed'))
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, 1000) || 'video reconciliation failed';
}

export async function POST(req: NextRequest) {
  const auth = authorizeAssetRequest(req, undefined, 'operator');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await parseBody(req);
  const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
  const actualCostCents = body.actualCostCents;
  const resolution = typeof body.resolution === 'string' ? body.resolution as VideoReconciliationResolution : null;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : undefined;

  if (!transactionId || !/^[a-f0-9]{64}$/.test(transactionId)) {
    return NextResponse.json({ error: 'valid transactionId is required' }, { status: 400 });
  }
  if (typeof actualCostCents !== 'number' || !Number.isSafeInteger(actualCostCents) || actualCostCents < 0) {
    return NextResponse.json({ error: 'actualCostCents must be a non-negative safe integer' }, { status: 400 });
  }
  if (!resolution || !allowedResolutions.has(resolution)) {
    return NextResponse.json({ error: 'valid resolution is required' }, { status: 400 });
  }

  try {
    const result = await reconcileVideoProviderTransaction({
      transactionId,
      actualCostCents,
      resolution,
      operatorId: auth.userId ?? 'operator',
      note,
    });
    const transaction = result.transaction as Record<string, unknown>;
    const jobId = String(transaction.jobId ?? '');

    if (jobId) {
      await updateJob(jobId, {
        videoTransactionStatus: transaction.status,
        reservationHeld: false,
        providerActualCostCents: transaction.actualCostCents,
        providerReconciliationResolution: transaction.reconciliationResolution,
        providerReconciledAt: transaction.reconciledAt,
        providerReconciledBy: transaction.reconciledBy,
        providerProductionReady: false,
      });
    }

    await recordUsage({
      action: 'video.transaction_reconciled',
      tenantId: transaction.tenantId ?? auth.tenantId ?? 'default',
      jobId: transaction.jobId,
      transactionId,
      operatorId: auth.userId,
      resolution,
      actualCostCents,
      reservedCostCents: result.budget.reservedCostCents,
      spentCostCents: result.budget.spentCostCents,
      productionReady: false,
    });

    return NextResponse.json({
      ok: true,
      transaction: result.transaction,
      budget: result.budget,
    });
  } catch (error) {
    const message = safeError(error);
    const status = /not found/.test(message) ? 404 : /invalid|required|must be/.test(message) ? 400 : 409;
    return NextResponse.json({ error: message }, { status });
  }
}
