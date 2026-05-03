import { NextRequest, NextResponse } from 'next/server';
import { publishAsset } from '@/lib/server/assetFactoryStore';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const asset = await publishAsset(jobId);

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, asset });
}