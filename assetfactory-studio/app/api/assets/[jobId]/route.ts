import { NextRequest, NextResponse } from 'next/server';
import { findAsset } from '@/lib/server/assetFactoryStore';
export async function GET(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const asset = await findAsset(jobId);
  if (!asset) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  return NextResponse.json(asset, { status: 200 });
}
