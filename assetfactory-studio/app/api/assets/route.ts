import { NextRequest, NextResponse } from 'next/server';
import { listAssets } from '@/lib/server/assetFactoryStore';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import type { AssetFactoryAsset } from '@/lib/server/assetFactoryTypes';

export async function GET(req: NextRequest) {
  const auth = authorizeAssetRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const assets = await listAssets() as AssetFactoryAsset[];
    const currentAuth = authorizeAssetRequest(req, auth.tenantId);
    if (!currentAuth.ok) return NextResponse.json({ error: currentAuth.error }, { status: currentAuth.status });
    if (currentAuth.tenantId !== auth.tenantId || currentAuth.userId !== auth.userId ||
        currentAuth.mode !== auth.mode) {
      return NextResponse.json({ error: 'Request authorization changed' }, { status: 403 });
    }
    if (currentAuth.tenantId) {
      return NextResponse.json(assets.filter((asset) => asset.tenantId === currentAuth.tenantId));
    }
    return NextResponse.json(assets);
  } catch {
    return NextResponse.json({ error: 'Unable to read asset metadata.' }, { status: 500 });
  }
}
