import { NextRequest, NextResponse } from 'next/server';
import {
  addJob,
  getStoreDiagnostics,
  readJobs,
} from '@/lib/server/assetFactoryStore';
import { validateGenerateRequest, type GenerateRequest } from '@/lib/server/assetFactoryValidation';
import { evaluateGenerationPolicy } from '@/lib/server/assetGenerationPolicy';
import { resolveAssetType } from '@/lib/server/assetTypeCatalog';

export async function GET() {
  return NextResponse.json(await readJobs());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const err = validateGenerateRequest(body);
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const request = body as GenerateRequest;
    const policy = evaluateGenerationPolicy(request);
    if (!policy.ok) {
      return NextResponse.json({ error: policy.error, policy }, { status: 422 });
    }

    const definition = resolveAssetType(request.type);
    const job = {
      ...request,
      type: definition.canonicalType,
      requestedType: request.type,
      assetFamily: definition.family,
      canonicalType: definition.canonicalType,
      status: 'queued',
      queueStatus: 'pending-materialization',
      estimatedUnits: policy.estimatedUnits,
      estimatedCostCents: policy.estimatedCostCents,
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