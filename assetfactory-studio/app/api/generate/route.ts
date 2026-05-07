import { NextRequest, NextResponse } from 'next/server';
import {
  addJob,
  getStoreDiagnostics,
  readJobs,
} from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { validateGenerateRequest } from '@/lib/server/assetFactoryValidation';

export async function GET() {
  return NextResponse.json(await readJobs());
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

    const job = {
      ...body,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };

    await addJob(job);

    const diagnostics = getStoreDiagnostics();

    return NextResponse.json(
      {
        ok: true,
        jobId: job.jobId,
        status: job.status,
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
