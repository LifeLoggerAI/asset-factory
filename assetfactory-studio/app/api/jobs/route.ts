import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { addJob, readJobs } from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import {
  validateGenerateRequest,
  type GenerateRequest,
} from '@/lib/server/assetFactoryValidation';
import { evaluateGenerationPolicy } from '@/lib/server/assetGenerationPolicy';
import { evaluateTenantQuota } from '@/lib/server/assetBilling';
import { resolveAssetType } from '@/lib/server/assetTypeCatalog';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import type { AssetFactoryJob } from '@/lib/server/assetFactoryTypes';

export async function POST(req: NextRequest) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    const jobId = body.jobId ?? randomUUID();

    const request = {
      ...body,
      jobId,
      tenantId: body.tenantId ?? req.headers.get('x-tenant-id') ?? 'default',
      type: body.type ?? 'graphic',
    } as GenerateRequest;

    const err = validateGenerateRequest(request);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const auth = authorizeAssetRequest(req, request.tenantId ?? 'default');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const policy = evaluateGenerationPolicy(request);
    if (!policy.ok) {
      return NextResponse.json({ error: policy.error, policy }, { status: 422 });
    }

    const tenantId = auth.tenantId ?? request.tenantId ?? 'default';

    const quota = await evaluateTenantQuota({
      tenantId,
      estimatedUnits: policy.estimatedUnits,
      estimatedCostCents: policy.estimatedCostCents,
    });

    if (!quota.ok) {
      return NextResponse.json({ error: quota.error, quota }, { status: 402 });
    }

    const definition = resolveAssetType(request.type);

    const job: AssetFactoryJob = {
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
      createdAt: new Date().toISOString(),
    };

    await addJob(job);

    return NextResponse.json(
      {
        message: 'Job submitted successfully',
        jobId: job.jobId,
        status: job.status,
        queueStatus: job.queueStatus,
        canonicalType: job.canonicalType,
        assetFamily: job.assetFamily,
        estimatedUnits: job.estimatedUnits,
        estimatedCostCents: job.estimatedCostCents,
        quota,
      },
      { status: 202 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const auth = authorizeAssetRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');

  const jobs = (await readJobs()) as AssetFactoryJob[];
  const scopedJobs = auth.tenantId
    ? jobs.filter((job) => job.tenantId === auth.tenantId)
    : jobs;

  if (jobId) {
    const job = scopedJobs.find((item) => item.jobId === jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job, { status: 200 });
  }

  return NextResponse.json(scopedJobs, { status: 200 });
}