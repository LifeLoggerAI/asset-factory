import { NextRequest, NextResponse } from 'next/server';
import { findAsset } from '@/lib/server/assetFactoryStore';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import type { AssetFactoryAsset } from '@/lib/server/assetFactoryTypes';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const asset = await findAsset(jobId) as AssetFactoryAsset | null;

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, asset.tenantId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(asset, { status: 200 });
}
