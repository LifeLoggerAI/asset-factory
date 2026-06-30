import { NextRequest, NextResponse } from 'next/server';
import { approveAsset, findAsset } from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import type { AssetFactoryAsset } from '@/lib/server/assetFactoryTypes';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  const { jobId } = await params;
  const existingAsset = await findAsset(jobId) as AssetFactoryAsset | null;

  if (!existingAsset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, existingAsset.tenantId, 'publisher');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const asset = await approveAsset(jobId, body);

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, asset });
}
