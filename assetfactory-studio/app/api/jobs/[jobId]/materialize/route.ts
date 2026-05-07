import { NextRequest, NextResponse } from 'next/server';
import { getAssetQueueItem, runAssetQueueJob } from '@/lib/server/assetQueue';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { searchParams } = new URL(req.url);
  const asyncMode = searchParams.get('async') === 'true';

  if (asyncMode) {
    const item = await getAssetQueueItem(jobId);
    if (!item) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, queued: true, item }, { status: 202 });
  }

  const asset = await runAssetQueueJob(jobId);

  if (!asset) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, asset });
}