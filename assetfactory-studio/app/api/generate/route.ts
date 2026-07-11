import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  addJob,
  findJob,
  getStoreDiagnostics,
  readJobs,
} from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import {
  validateGenerateRequest,
  type GenerateRequest,
} from '@/lib/server/assetFactoryValidation';
import { evaluateGenerationPolicy } from '@/lib/server/assetGenerationPolicy';
import { evaluateTenantQuota } from '@/lib/server/assetBilling';
import { configuredProviderName } from '@/lib/server/assetProviderAdapters';
import { resolveAssetType } from '@/lib/server/assetTypeCatalog';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { reserveVideoProviderTransaction } from '@/lib/server/assetVideoTransactions';

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalizeForHash(nested)]),
    );
  }
  return value;
}

function requestHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(normalizeForHash(value))).digest('hex');
}

function positiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function campaignIdFrom(request: GenerateRequest) {
  const value = request.metadata?.campaignId;
  if (typeof value !== 'string' || !value.trim()) return 'default-video-campaign';
  const trimmed = value.trim();
  if (trimmed.length > 160 || /[\u0000-\u001f]/.test(trimmed)) throw new Error('invalid metadata.campaignId');
  return trimmed;
}

export async function GET(req: NextRequest) {
  const auth = authorizeAssetRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const jobs = await readJobs();

  if (auth.tenantId) {
    return NextResponse.json(
      (jobs as Record<string, unknown>[]).filter((job) => job.tenantId === auth.tenantId)
    );
  }

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    const err = validateGenerateRequest(body);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const request = body as GenerateRequest;

    const auth = authorizeAssetRequest(req, request.tenantId ?? 'default');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const policy = evaluateGenerationPolicy(request);
    if (!policy.ok) {
      return NextResponse.json({ error: policy.error, policy }, { status: 422 });
    }

    const tenantId = auth.tenantId ?? request.tenantId ?? 'default';
    const definition = resolveAssetType(request.type);
    const provider = configuredProviderName();
    const paidVideo = definition.canonicalType === 'video' && provider !== 'local-proof';

    const quota = await evaluateTenantQuota({
      tenantId,
      estimatedUnits: policy.estimatedUnits,
      estimatedCostCents: policy.estimatedCostCents,
    });

    if (!quota.ok) {
      return NextResponse.json({ error: quota.error, quota }, { status: 402 });
    }

    let videoTransaction: Awaited<ReturnType<typeof reserveVideoProviderTransaction>> | null = null;
    let providerRequestHash: string | null = null;
    let replayed = false;

    if (paidVideo) {
      const idempotencyKey = req.headers.get('idempotency-key');
      if (!idempotencyKey) {
        return NextResponse.json(
          { error: 'Idempotency-Key is required for provider-backed video generation' },
          { status: 428 },
        );
      }

      const providerModel = String(process.env.ASSET_FACTORY_VIDEO_MODEL ?? '').trim();
      if (!providerModel) {
        return NextResponse.json(
          { error: 'ASSET_FACTORY_VIDEO_MODEL is required for provider-backed video generation' },
          { status: 503 },
        );
      }

      providerRequestHash = requestHash({
        tenantId,
        provider,
        providerModel,
        request: {
          ...request,
          tenantId,
          type: definition.canonicalType,
        },
      });

      videoTransaction = await reserveVideoProviderTransaction({
        tenantId,
        campaignId: campaignIdFrom(request),
        jobId: request.jobId,
        idempotencyKey,
        requestHash: providerRequestHash,
        provider,
        providerModel,
        estimatedCostCents: policy.estimatedCostCents,
        maxJobCostCents: positiveIntegerEnv('ASSET_FACTORY_VIDEO_MAX_JOB_COST_CENTS', 2000),
        maxCampaignCostCents: positiveIntegerEnv('ASSET_FACTORY_VIDEO_MAX_CAMPAIGN_COST_CENTS', 5000),
        maxAttempts: positiveIntegerEnv('ASSET_FACTORY_VIDEO_MAX_ATTEMPTS', 1),
      });

      if (!videoTransaction.ok) {
        const status = videoTransaction.conflict ? 409 : videoTransaction.rejected ? 402 : 500;
        return NextResponse.json(
          { error: videoTransaction.error ?? 'video transaction reservation failed', videoTransaction },
          { status },
        );
      }

      replayed = videoTransaction.replayed;
      if (replayed && videoTransaction.transaction) {
        const existing = await findJob(videoTransaction.transaction.jobId) as Record<string, unknown> | null;
        if (existing) {
          return NextResponse.json({
            ok: true,
            replayed: true,
            jobId: existing.jobId,
            status: existing.status,
            queueStatus: existing.queueStatus,
            canonicalType: existing.canonicalType,
            assetFamily: existing.assetFamily,
            estimatedUnits: existing.estimatedUnits,
            estimatedCostCents: existing.estimatedCostCents,
            videoTransaction: {
              transactionId: videoTransaction.transaction.transactionId,
              status: videoTransaction.transaction.status,
              reservationHeld: videoTransaction.transaction.reservationHeld,
              attemptCount: videoTransaction.transaction.attemptCount,
              maxAttempts: videoTransaction.transaction.maxAttempts,
            },
          }, { status: 200 });
        }
        if (videoTransaction.transaction.status !== 'reserved') {
          return NextResponse.json(
            { error: 'video transaction exists without a recoverable job record; operator recovery required' },
            { status: 409 },
          );
        }
      }
    }

    const job = {
      ...request,
      tenantId,
      type: definition.canonicalType,
      requestedType: request.type,
      assetFamily: definition.family,
      canonicalType: definition.canonicalType,
      status: 'queued',
      queueStatus: 'pending-materialization',
      estimatedUnits: policy.estimatedUnits,
      estimatedCostCents: policy.estimatedCostCents,
      quotaSnapshot: quota,
      providerBacked: paidVideo,
      selectedProvider: paidVideo ? provider : null,
      providerModel: paidVideo ? String(process.env.ASSET_FACTORY_VIDEO_MODEL) : null,
      providerRequestHash,
      videoTransactionId: videoTransaction?.transaction?.transactionId ?? null,
      videoTransactionStatus: videoTransaction?.transaction?.status ?? null,
      reservationHeld: videoTransaction?.transaction?.reservationHeld ?? false,
      createdAt: videoTransaction?.transaction?.createdAt ?? new Date().toISOString(),
    };

    await addJob(job);

    const diagnostics = getStoreDiagnostics();

    return NextResponse.json(
      {
        ok: true,
        replayed,
        jobId: job.jobId,
        status: job.status,
        queueStatus: job.queueStatus,
        canonicalType: job.canonicalType,
        assetFamily: job.assetFamily,
        estimatedUnits: job.estimatedUnits,
        estimatedCostCents: job.estimatedCostCents,
        quota,
        videoTransaction: videoTransaction?.transaction ? {
          transactionId: videoTransaction.transaction.transactionId,
          status: videoTransaction.transaction.status,
          reservationHeld: videoTransaction.transaction.reservationHeld,
          attemptCount: videoTransaction.transaction.attemptCount,
          maxAttempts: videoTransaction.transaction.maxAttempts,
          maxJobCostCents: videoTransaction.transaction.maxJobCostCents,
          maxCampaignCostCents: videoTransaction.transaction.maxCampaignCostCents,
        } : null,
        persistenceMode: diagnostics.mode,
        fallbackActive: diagnostics.fallbackActive,
      },
      { status: 202 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'internal error';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}