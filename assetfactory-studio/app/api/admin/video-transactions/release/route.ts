import { NextRequest, NextResponse } from 'next/server';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { recordUsage, updateJob } from '@/lib/server/assetFactoryStore';
import { releaseVideoProviderReservation } from '@/lib/server/assetVideoReconciliation';

async function parseBody(req: NextRequest) {
  try {
    return await req.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error ?? 'video reservation release failed'))
    .replace(/[\u0000-\u001f]+/g, ' ')
    .trim()
    .slice(0, 1000) || 'video reservation release failed';
}

export async function POST(req: NextRequest) {
  const auth = authorizeAssetRequest(req, undefined, 'operator');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await parseBody(req);
  const transactionId = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!transactionId || !/^[a-f0-9]{64}$/.test(transactionId)) {
    return NextResponse.json({ error: 'valid transactionId is required' }, { status: 400 });
  }
  if (!reason || reason.length > 1000) {
    return NextResponse.json({ error: 'reason is required and must be at most 1000 characters' }, { status: 400 });
  }

  try {
    const result = await releaseVideoProviderReservation({
      transactionId,
      operatorId: auth.userId ?? 'operator',
      reason,
    });
    const transaction = result.transaction as Record<string, unknown>;
    const jobId = String(transaction.jobId ?? '');

    if (jobId) {
      await updateJob(jobId, {
        status: 'archived',
        queueStatus: 'released-before-provider-dispatch',
        videoTransactionStatus: transaction.status,
        reservationHeld: false,
        providerActualCostCents: 0,
        providerReleasedAt: transaction.releasedAt,
        providerReleasedBy: transaction.releasedBy,
        providerReleaseReason: transaction.releaseReason,
        providerProductionReady: false,
      });
    }

    await recordUsage({
      action: 'video.reservation_released',
      tenantId: transaction.tenantId ?? auth.tenantId ?? 'default',
      jobId: transaction.jobId,
      transactionId,
      operatorId: auth.userId,
      reason,
      releasedCostCents: 0,
      remainingReservedCostCents: result.budget.reservedCostCents,
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
