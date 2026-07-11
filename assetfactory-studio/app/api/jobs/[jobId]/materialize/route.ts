import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  findAsset,
  findJob,
  materializeAsset,
  readGeneratedAsset,
  updateJob,
} from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import {
  beginVideoProviderAttempt,
  markVideoProviderArtifactReady,
  markVideoProviderAttemptFailed,
} from '@/lib/server/assetVideoTransactions';

function safeFailureReason(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? 'unknown provider materialization error');
  return message.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 1000) || 'unknown provider materialization error';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  const { jobId } = await params;
  const job = await findJob(jobId) as Record<string, unknown> | null;

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, String(job.tenantId ?? 'default'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const transactionId = typeof job.videoTransactionId === 'string' ? job.videoTransactionId : null;
  const providerRequestHash = typeof job.providerRequestHash === 'string' ? job.providerRequestHash : null;
  let attemptId: string | null = null;

  if (transactionId || providerRequestHash) {
    if (!transactionId || !providerRequestHash || job.canonicalType !== 'video' || job.providerBacked !== true) {
      return NextResponse.json(
        { error: 'paid video transaction binding is incomplete; refusing provider dispatch' },
        { status: 409 },
      );
    }

    const attempt = await beginVideoProviderAttempt({
      transactionId,
      requestHash: providerRequestHash,
      jobId,
    });

    if (!attempt.ok) {
      return NextResponse.json(
        {
          error: attempt.error ?? 'video provider attempt could not be leased',
          videoTransaction: attempt.transaction ? {
            transactionId: attempt.transaction.transactionId,
            status: attempt.transaction.status,
            attemptCount: attempt.transaction.attemptCount,
            maxAttempts: attempt.transaction.maxAttempts,
            reservationHeld: attempt.transaction.reservationHeld,
          } : null,
        },
        { status: 409 },
      );
    }

    if (!attempt.shouldDispatch) {
      const existing = await findAsset(jobId) as Record<string, unknown> | null;
      if (!existing) {
        return NextResponse.json(
          { error: 'video provider transaction is complete but the asset record is missing; operator recovery required' },
          { status: 409 },
        );
      }
      return NextResponse.json({
        ok: true,
        replayed: true,
        jobId,
        asset: existing,
        videoTransaction: attempt.transaction ? {
          transactionId: attempt.transaction.transactionId,
          status: attempt.transaction.status,
          reservationHeld: attempt.transaction.reservationHeld,
          humanReviewRequired: attempt.transaction.humanReviewRequired,
          productionReady: attempt.transaction.productionReady,
        } : null,
      });
    }

    attemptId = attempt.attemptId ?? null;
    if (!attemptId) {
      return NextResponse.json(
        { error: 'video provider attempt lease did not return an attempt ID' },
        { status: 500 },
      );
    }

    await updateJob(jobId, {
      videoTransactionStatus: 'dispatching',
      providerAttemptId: attemptId,
      providerAttemptCount: attempt.transaction?.attemptCount,
      providerAttemptStartedAt: new Date().toISOString(),
    });
  }

  try {
    const asset = await materializeAsset(jobId) as Record<string, unknown> | null;

    if (!asset) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    let videoTransaction = null;
    if (transactionId && attemptId) {
      const fileName = typeof asset.fileName === 'string' ? asset.fileName : null;
      if (!fileName) throw new Error('provider-backed video asset is missing fileName');
      const artifact = await readGeneratedAsset(fileName);
      if (!artifact) throw new Error('provider-backed video artifact cannot be read back after storage');
      const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
      const manifest = asset.manifest as Record<string, unknown> | undefined;
      const metadata = manifest?.metadata as Record<string, unknown> | undefined;
      const providerPredictionId = typeof metadata?.predictionId === 'string'
        ? metadata.predictionId
        : null;
      const artifactMimeType = typeof metadata?.format === 'string'
        ? ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' } as Record<string, string>)[metadata.format] ?? 'application/octet-stream'
        : 'application/octet-stream';

      videoTransaction = await markVideoProviderArtifactReady({
        transactionId,
        attemptId,
        artifactSha256,
        artifactMimeType,
        providerPredictionId,
      });

      await updateJob(jobId, {
        videoTransactionStatus: videoTransaction.status,
        reservationHeld: videoTransaction.reservationHeld,
        providerAttemptId: null,
        providerArtifactSha256: artifactSha256,
        providerArtifactMimeType: artifactMimeType,
        providerPredictionId,
        providerHumanReviewRequired: true,
        providerProductionReady: false,
      });
    }

    return NextResponse.json({
      ok: true,
      replayed: false,
      jobId,
      asset,
      videoTransaction: videoTransaction ? {
        transactionId: videoTransaction.transactionId,
        status: videoTransaction.status,
        reservationHeld: videoTransaction.reservationHeld,
        artifactSha256: videoTransaction.artifactSha256,
        humanReviewRequired: videoTransaction.humanReviewRequired,
        productionReady: videoTransaction.productionReady,
      } : null,
    });
  } catch (error) {
    const failureReason = safeFailureReason(error);
    let transactionFailure = null;

    if (transactionId && attemptId) {
      try {
        transactionFailure = await markVideoProviderAttemptFailed({
          transactionId,
          attemptId,
          failureReason,
        });
        await updateJob(jobId, {
          videoTransactionStatus: transactionFailure.status,
          reservationHeld: transactionFailure.reservationHeld,
          providerAttemptId: null,
          providerFailureReason: failureReason,
          providerHumanReviewRequired: true,
          providerProductionReady: false,
        });
      } catch (transactionError) {
        return NextResponse.json({
          error: failureReason,
          transactionError: safeFailureReason(transactionError),
          reservationState: 'unknown-operator-review-required',
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      error: failureReason,
      videoTransaction: transactionFailure ? {
        transactionId: transactionFailure.transactionId,
        status: transactionFailure.status,
        reservationHeld: transactionFailure.reservationHeld,
        attemptCount: transactionFailure.attemptCount,
        maxAttempts: transactionFailure.maxAttempts,
        humanReviewRequired: transactionFailure.humanReviewRequired,
        productionReady: transactionFailure.productionReady,
      } : null,
    }, { status: transactionFailure ? 502 : 500 });
  }
}