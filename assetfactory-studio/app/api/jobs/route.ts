import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { addJob, readJobs } from '@/lib/server/assetFactoryStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.prompt || typeof body.prompt !== 'string') {
      return NextResponse.json({ error: 'Invalid input: "prompt" is required and must be a string.' }, { status: 400 });
    }
    const jobId = body.jobId ?? randomUUID();
    const job = { jobId, tenantId: body.tenantId ?? 'default', status: 'queued', createdAt: new Date().toISOString(), ...body };
    await addJob(job);
    return NextResponse.json({ message: 'Job submitted successfully', jobId, status: 'queued' }, { status: 202 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const jobs = await readJobs();
  if (jobId) {
    const job = jobs.find((j: any) => j.jobId === jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json(job, { status: 200 });
  }
  return NextResponse.json(jobs, { status: 200 });
}
