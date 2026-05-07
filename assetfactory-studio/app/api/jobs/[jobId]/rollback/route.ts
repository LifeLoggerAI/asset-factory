import { NextRequest, NextResponse } from 'next/server';
import { rollbackAsset } from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  const { jobId } = await params;
  const body = await req.json();
  const asset = await rollbackAsset(jobId, String(body.versionId ?? 'latest'));

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, asset });
}
