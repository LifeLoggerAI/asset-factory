import { NextRequest, NextResponse } from 'next/server';
import {
  addJob,
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
import { resolveAssetType } from '@/lib/server/assetTypeCatalog';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';

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

    const quota = await evaluateTenantQuota({
      tenantId,
      estimatedUnits: policy.estimatedUnits,
      estimatedCostCents: policy.estimatedCostCents,
    });

    if (!quota.ok) {
      return NextResponse.json({ error: quota.error, quota }, { status: 402 });
    }

    const definition = resolveAssetType(request.type);

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
      createdAt: new Date().toISOString(),
    };

    await addJob(job);

    const diagnostics = getStoreDiagnostics();

    return NextResponse.json(
      {
        ok: true,
        jobId: job.jobId,
        status: job.status,
        queueStatus: job.queueStatus,
        canonicalType: job.canonicalType,
        assetFamily: job.assetFamily,
        estimatedUnits: job.estimatedUnits,
        estimatedCostCents: job.estimatedCostCents,
        quota,
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