import { NextRequest, NextResponse } from 'next/server';
import { materializeAsset } from '@/lib/server/assetFactoryStore';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const asset = await materializeAsset(jobId);

  if (!asset) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, asset });
}