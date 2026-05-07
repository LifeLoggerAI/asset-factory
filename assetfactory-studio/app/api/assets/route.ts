import { NextRequest, NextResponse } from 'next/server';
import { listAssets } from '@/lib/server/assetFactoryStore';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import type { AssetFactoryAsset } from '@/lib/server/assetFactoryTypes';

export async function GET(req: NextRequest) {
  const auth = await authorizeAssetRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const assets = await listAssets() as AssetFactoryAsset[];
  if (auth.tenantId) {
    return NextResponse.json(assets.filter((asset) => asset.tenantId === auth.tenantId));
  }

  return NextResponse.json(assets);
}
