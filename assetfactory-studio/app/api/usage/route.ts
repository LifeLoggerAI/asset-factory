import { NextResponse } from 'next/server';
import { listAssets, readJobs } from '@/lib/server/assetFactoryStore';

type CountMap = Record<string, number>;

function increment(map: CountMap, key: unknown) {
  const value = String(key || 'unknown');
  map[value] = (map[value] ?? 0) + 1;
}

export async function GET() {
  const [jobs, assets] = await Promise.all([readJobs(), listAssets()]);
  const jobsByStatus: CountMap = {};
  const jobsByType: CountMap = {};
  const assetsByType: CountMap = {};
  const assetsByRendererMode: CountMap = {};
  const assetsByFormat: CountMap = {};

  for (const job of jobs as Record<string, unknown>[]) {
    increment(jobsByStatus, job.status);
    increment(jobsByType, job.type);
  }

  for (const asset of assets as Record<string, unknown>[]) {
    const manifest = asset.manifest as Record<string, unknown> | undefined;
    increment(assetsByType, manifest?.type ?? asset.type);
    increment(assetsByRendererMode, manifest?.rendererMode);

    const formats = Array.isArray(manifest?.formats) ? manifest?.formats : [];
    for (const format of formats) increment(assetsByFormat, format);
  }

  const publishedAssets = (assets as Record<string, unknown>[]).filter((asset) => asset.published).length;

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
