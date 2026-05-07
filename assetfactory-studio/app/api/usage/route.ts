import { NextResponse } from 'next/server';
import { listAssets, listUsageEvents, readJobs } from '@/lib/server/assetFactoryStore';
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

export async function GET() {
  const [jobs, assets, usageEvents] = await Promise.all([
    readJobs() as Promise<AssetFactoryJob[]>,
    listAssets() as Promise<AssetFactoryAsset[]>,
    listUsageEvents() as Promise<UsageEvent[]>,
  ]);
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
