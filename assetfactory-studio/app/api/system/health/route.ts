import { NextRequest, NextResponse } from 'next/server';
import { getStoreDiagnostics, readJobs, listAssets } from '@/lib/server/assetFactoryStore';
import { requireConfiguredAssetFactoryApiKey } from '@/lib/server/apiAuth';

export async function GET(req: NextRequest) {
  const diagnostics = getStoreDiagnostics();
  const fullDiagnostics = new URL(req.url).searchParams.get('full') === 'true';

  if (fullDiagnostics) {
    const authError = requireConfiguredAssetFactoryApiKey(req);
    if (authError) return authError;
  }

  const publicPayload = {
    ok: true,
    service: 'asset-factory-studio',
    checkedAt: new Date().toISOString(),
    persistenceMode: diagnostics.mode,
    fallbackActive: diagnostics.fallbackActive,
  };

  if (!fullDiagnostics) {
    return NextResponse.json(publicPayload);
  }

  try {
    const [jobs, assets] = await Promise.all([readJobs(), listAssets()]);

    return NextResponse.json({
      ...publicPayload,
      counts: {
        jobs: jobs.length,
        assets: assets.length,
      },
      firebase: diagnostics.firebase,
      collections: diagnostics.collections,
      generatedPrefix: diagnostics.generatedPrefix,
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
