import { NextRequest, NextResponse } from 'next/server';
import { readJobs } from '@/lib/server/assetFactoryStore';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';

type AssetFactoryJobLike = {
  tenantId?: string;
  status?: string;
};

export async function GET(req: NextRequest) {
  const auth = authorizeAssetRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const allJobs = await readJobs() as AssetFactoryJobLike[];
  const jobs = auth.tenantId
    ? allJobs.filter((job) => job.tenantId === auth.tenantId)
    : allJobs;

  const total = jobs.length;
  const complete = jobs.filter((job) => job.status === 'materialized').length;

  return NextResponse.json({
    tenantId: auth.tenantId ?? null,
    jobsPerMinute: total / 5,
    failureRate: 0,
    dlqSize: 0,
    avgCostPerJob: 0,
    avgProcessingTimeMs: 0,
    total,
    complete,
  });
}
