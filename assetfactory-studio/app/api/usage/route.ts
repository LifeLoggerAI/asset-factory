import { NextResponse } from 'next/server';
import { listAssets, readJobs } from '@/lib/server/assetFactoryStore';
import type { AssetFactoryAsset, AssetFactoryJob } from '@/lib/server/assetFactoryTypes';

type CountMap = Record<string, number>;

function increment(map: CountMap, key: unknown) {
  const value = String(key || 'unknown');
  map[value] = (map[value] ?? 0) + 1;
}

export async function GET() {
  const [jobs, assets] = await Promise.all([
    readJobs() as Promise<AssetFactoryJob[]>,
    listAssets() as Promise<AssetFactoryAsset[]>,
  ]);
  const jobsByStatus: CountMap = {};
  const jobsByType: CountMap = {};
  const assetsByType: CountMap = {};
  const assetsByRendererMode: CountMap = {};
  const assetsByFormat: CountMap = {};

  for (const job of jobs) {
    increment(jobsByStatus, job.status);
    increment(jobsByType, job.type);
  }

  for (const asset of assets) {
    increment(assetsByType, asset.manifest?.metadata?.canonicalType ?? asset.manifest?.type);
    increment(assetsByRendererMode, asset.manifest?.rendererMode);

    for (const format of asset.manifest?.formats ?? []) increment(assetsByFormat, format);
  }

  const publishedAssets = assets.filter((asset) => asset.published).length;

  return NextResponse.json({
    ok: true,
    totals: {
      jobs: jobs.length,
      assets: assets.length,
      publishedAssets,
      draftAssets: assets.length - publishedAssets,
    },
    jobsByStatus,
    jobsByType,
    assetsByType,
    assetsByRendererMode,
    assetsByFormat,
  });
}
