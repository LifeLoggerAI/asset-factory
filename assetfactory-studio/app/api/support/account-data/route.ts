import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { listAssets, listUsageEvents, readJobs, recordUsage } from '@/lib/server/assetFactoryStore';

function tenantMatches(record: Record<string, unknown>, tenantId: string) {
  return record.tenantId === tenantId;
}

export async function GET(req: NextRequest) {
  const apiKeyError = requireAssetFactoryApiKey(req);
  if (apiKeyError) return apiKeyError;

  const auth = authorizeAssetRequest(req, undefined, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = auth.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required for account export' }, { status: 400 });

  const [jobs, assets, usage] = await Promise.all([
    readJobs(),
    listAssets(),
    listUsageEvents(),
  ]);

  const exportedAt = new Date().toISOString();
  const exportId = randomUUID();
  const tenantJobs = (jobs as Record<string, unknown>[]).filter((job) => tenantMatches(job, tenantId));
  const tenantAssets = (assets as Record<string, unknown>[]).filter((asset) => tenantMatches(asset, tenantId));
  const tenantUsage = (usage as Record<string, unknown>[]).filter((event) => tenantMatches(event, tenantId));

  await recordUsage({
    action: 'account.exported',
    tenantId,
    exportId,
    exportedBy: auth.userId ?? 'unknown',
    jobCount: tenantJobs.length,
    assetCount: tenantAssets.length,
    usageEventCount: tenantUsage.length,
    createdAt: exportedAt,
  });

  return NextResponse.json({
    ok: true,
    exportId,
    tenantId,
    exportedAt,
    actor: {
      userId: auth.userId ?? null,
      roles: auth.roles,
    },
    counts: {
      jobs: tenantJobs.length,
      assets: tenantAssets.length,
      usageEvents: tenantUsage.length,
    },
    data: {
      jobs: tenantJobs,
      assets: tenantAssets,
      usageEvents: tenantUsage,
    },
  });
}
