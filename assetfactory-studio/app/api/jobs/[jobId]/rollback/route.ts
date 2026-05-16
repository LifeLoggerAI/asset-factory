import { NextRequest, NextResponse } from 'next/server';
import { findAsset, rollbackAsset } from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  const { jobId } = await params;
  const existingAsset = await findAsset(jobId) as Record<string, unknown> | null;

  if (!existingAsset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, String(existingAsset.tenantId ?? 'default'), 'publisher');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const asset = await rollbackAsset(jobId, String(body.versionId ?? 'latest'));

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, asset });
}
