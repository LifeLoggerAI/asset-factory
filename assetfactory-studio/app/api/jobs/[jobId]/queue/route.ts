import { NextRequest, NextResponse } from 'next/server';
import {
  enqueueAssetMaterialization,
  getAssetQueueItem,
  runAssetQueueJob,
} from '@/lib/server/assetQueue';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const item = await getAssetQueueItem(jobId);

  if (!item) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const { searchParams } = new URL(req.url);
  const runNow = searchParams.get('run') === 'true';

  if (runNow) {
    const asset = await runAssetQueueJob(jobId);
    if (!asset) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ran: true, asset });
  }

  const item = await enqueueAssetMaterialization(jobId);
  if (!item) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, queued: true, item }, { status: 202 });
}
