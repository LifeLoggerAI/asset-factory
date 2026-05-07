import { NextRequest, NextResponse } from 'next/server';
import { listAssets, listUsageEvents, readJobs } from '@/lib/server/assetFactoryStore';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import type { AssetFactoryAsset, AssetFactoryJob } from '@/lib/server/assetFactoryTypes';

type CountMap = Record<string, number>;
type UsageEvent = Record<string, unknown> & {
  action?: string;
  assetType?: string;
  tenantId?: string;
  estimatedUnits?: number;
  estimatedCostCents?: number;
};

function increment(map: CountMap, key: unknown, amount = 1) {
  const value = String(key || 'unknown');
  map[value] = (map[value] ?? 0) + amount;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function GET(req: NextRequest) {
  const auth = authorizeAssetRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [allJobs, allAssets, allUsageEvents] = await Promise.all([
    readJobs() as Promise<AssetFactoryJob[]>,
    listAssets() as Promise<AssetFactoryAsset[]>,
    listUsageEvents() as Promise<UsageEvent[]>,
  ]);

  const jobs = auth.tenantId
    ? allJobs.filter((job) => job.tenantId === auth.tenantId)
    : allJobs;
  const assets = auth.tenantId
    ? allAssets.filter((asset) => asset.tenantId === auth.tenantId)
    : allAssets;
  const usageEvents = auth.tenantId
    ? allUsageEvents.filter((event) => event.tenantId === auth.tenantId)
    : allUsageEvents;

  const jobsByStatus: CountMap = {};
  const jobsByType: CountMap = {};
  const assetsByType: CountMap = {};
  const assetsByRendererMode: CountMap = {};
  const assetsByFormat: CountMap = {};
  const usageByAction: CountMap = {};
  const usageUnitsByType: CountMap = {};
  const usageCostCentsByType: CountMap = {};
  const usageEventsByTenant: CountMap = {};

  for (const job of jobs) {
    increment(jobsByStatus, job.status);
    increment(jobsByType, job.type);
  }

  for (const asset of assets) {
    increment(assetsByType, asset.manifest?.metadata?.canonicalType ?? asset.manifest?.type);
    increment(assetsByRendererMode, asset.manifest?.rendererMode);

    for (const format of asset.manifest?.formats ?? []) increment(assetsByFormat, format);
  }

  for (const event of usageEvents) {
    increment(usageByAction, event.action);
    increment(usageEventsByTenant, event.tenantId);
    increment(usageUnitsByType, event.assetType, numberValue(event.estimatedUnits));
    increment(usageCostCentsByType, event.assetType, numberValue(event.estimatedCostCents));
  }

  const publishedAssets = assets.filter((asset) => asset.published).length;
  const estimatedUnits = usageEvents.reduce((sum, event) => sum + numberValue(event.estimatedUnits), 0);
  const estimatedCostCents = usageEvents.reduce((sum, event) => sum + numberValue(event.estimatedCostCents), 0);

  return NextResponse.json({
    ok: true,
    tenantId: auth.tenantId ?? null,
    totals: {
      jobs: jobs.length,
      assets: assets.length,
      publishedAssets,
      draftAssets: assets.length - publishedAssets,
      usageEvents: usageEvents.length,
      estimatedUnits,
      estimatedCostCents,
    },
    jobsByStatus,
    jobsByType,
    assetsByType,
    assetsByRendererMode,
    assetsByFormat,
    usageByAction,
    usageEventsByTenant,
    usageUnitsByType,
    usageCostCentsByType,
  });
}
