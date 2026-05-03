import { NextRequest, NextResponse } from 'next/server';
import { addJob, getStoreDiagnostics, readJobs } from '@/lib/server/assetFactoryStore';
import { validateGenerateRequest } from '@/lib/server/assetFactoryValidation';

export async function GET() { return NextResponse.json(await readJobs()); }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const err = validateGenerateRequest(body);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    const job = { ...body, status: 'queued', createdAt: new Date().toISOString() };
    await addJob(job);
    const d = getStoreDiagnostics();
    return NextResponse.json({ ok: true, jobId: job.jobId, status: job.status, persistenceMode: d.mode, fallbackActive: d.fallbackActive }, { status: 202 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'internal error' }, { status: 500 });
  }
}
