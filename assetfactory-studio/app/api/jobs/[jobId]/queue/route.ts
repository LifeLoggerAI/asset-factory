import { NextRequest, NextResponse } from 'next/server';
import {
  enqueueAssetMaterialization,
  getAssetQueueItem,
  runAssetQueueJob,
} from '@/lib/server/assetQueue';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const item = await getAssetQueueItem(jobId);

  if (!item) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, String(item.tenantId ?? 'default'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json({ ok: true, item });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  const { jobId } = await params;
  const { searchParams } = new URL(req.url);
  const runNow = searchParams.get('run') === 'true';

  const item = await getAssetQueueItem(jobId);
  if (!item) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, String(item.tenantId ?? 'default'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (runNow) {
    const asset = await runAssetQueueJob(jobId);
    if (!asset) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ran: true, asset });
  }

  const queued = await enqueueAssetMaterialization(jobId);
  if (!queued) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, queued: true, item: queued }, { status: 202 });
}
