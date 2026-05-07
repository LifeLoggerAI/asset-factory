import { NextRequest, NextResponse } from 'next/server';

function apiKeyRequired() {
  return process.env.ASSET_FACTORY_REQUIRE_API_KEY === 'true';
}

function providedAssetFactoryKey(req: NextRequest) {
  return req.headers.get('x-asset-factory-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
}

export function requireConfiguredAssetFactoryApiKey(req: NextRequest) {
  const configuredKey = process.env.ASSET_FACTORY_API_KEY;

  if (!configuredKey) {
    return NextResponse.json(
      {
        error: 'ASSET_FACTORY_API_KEY is required for this endpoint.',
      },
      { status: 503 }
    );
  }

  if (providedAssetFactoryKey(req) !== configuredKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export function requireAssetFactoryApiKey(req: NextRequest) {
  if (!apiKeyRequired()) {
    return null;
  }

  const authError = requireConfiguredAssetFactoryApiKey(req);
  if (authError?.status === 503) {
    return NextResponse.json(
      {
        error: 'Asset Factory API key enforcement is enabled, but ASSET_FACTORY_API_KEY is not configured.',
      },
      { status: 503 }
    );
  }

  return authError;
}
