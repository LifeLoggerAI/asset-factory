import { NextRequest, NextResponse } from 'next/server';
import { findJob, publishAsset } from '@/lib/server/assetFactoryStore';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const authError = requireAssetFactoryApiKey(req);
  if (authError) return authError;

  const { jobId } = await params;
  const job = await findJob(jobId);

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  const auth = authorizeAssetRequest(req, String(job.tenantId ?? 'default'));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (process.env.ASSET_FACTORY_CONTINUOUS_ENGINE_ENABLED === 'true') {
    const promotion = record(job.promotion);
    const validationPassed = job.validationStatus === 'passed';
    const approved = job.approvalStatus === 'approved';
    const promotionMerged = promotion.status === 'merged';
    if (!validationPassed || !approved || !promotionMerged) {
      return NextResponse.json({
        error: 'Governed publish gate is closed.',
        validationPassed,
        approved,
        promotionMerged,
      }, { status: 409 });
    }
  }

  const asset = await publishAsset(jobId);

  if (!asset) {
    return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, asset });
}
