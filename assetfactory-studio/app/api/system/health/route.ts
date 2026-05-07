import { NextResponse } from 'next/server';
import { getStoreDiagnostics, readJobs, listAssets } from '@/lib/server/assetFactoryStore';

export async function GET() {
  const diagnostics = getStoreDiagnostics();

  try {
    const [jobs, assets] = await Promise.all([readJobs(), listAssets()]);

    return NextResponse.json({
      ok: true,
      service: 'asset-factory-studio',
      checkedAt: new Date().toISOString(),
      persistenceMode: diagnostics.mode,
      fallbackActive: diagnostics.fallbackActive,
      firebase: diagnostics.firebase,
      collections: diagnostics.collections,
      generatedPrefix: diagnostics.generatedPrefix,
      counts: {
        jobs: jobs.length,
        assets: assets.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: 'asset-factory-studio',
        checkedAt: new Date().toISOString(),
        persistenceMode: diagnostics.mode,
        fallbackActive: diagnostics.fallbackActive,
        error: error instanceof Error ? error.message : 'Unknown health-check failure',
      },
      { status: 503 }
    );
  }
}
