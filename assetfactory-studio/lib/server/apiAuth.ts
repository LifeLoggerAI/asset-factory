import { NextRequest, NextResponse } from 'next/server';

function apiKeyRequired() {
  return process.env.ASSET_FACTORY_REQUIRE_API_KEY === 'true' || process.env.NODE_ENV === 'production';
}

export function requireAssetFactoryApiKey(req: NextRequest) {
  const configuredKey = process.env.ASSET_FACTORY_API_KEY;

  if (!apiKeyRequired()) {
    return null;
  }

  if (!configuredKey) {
    return NextResponse.json(
      {
        error: 'Asset Factory API key enforcement is enabled, but ASSET_FACTORY_API_KEY is not configured.',
      },
      { status: 503 }
    );
  }

  const providedKey = req.headers.get('x-asset-factory-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (providedKey !== configuredKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
