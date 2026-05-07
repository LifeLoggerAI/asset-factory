import { NextRequest, NextResponse } from 'next/server';

function authorizeCronRequest(req: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Cron secret is not configured. Set CRON_SECRET before enabling cron endpoints.',
      },
      { status: 503 }
    );
  }

  const providedSecret =
    req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (providedSecret !== configuredSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export async function GET(req: NextRequest) {
  const authError = authorizeCronRequest(req);
  if (authError) return authError;

  return NextResponse.json({
    ok: true,
    status: 'integrity-check-disabled',
    reason: 'engine integrity checker export unavailable in studio runtime',
  });
}
