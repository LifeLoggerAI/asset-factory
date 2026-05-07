import { NextRequest, NextResponse } from 'next/server';
import { findJob, publishAsset } from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  const { jobId } = await params;
  const job = await findJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, String(job.tenantId ?? 'default'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const asset = await publishAsset(jobId);

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, asset });
}
