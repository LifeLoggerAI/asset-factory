import { NextRequest, NextResponse } from 'next/server';
import { findAsset } from '@/lib/server/assetFactoryStore';

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const asset = await findAsset(params.jobId);
  if (!asset) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  return NextResponse.json(asset, { status: 200 });
}
