import { NextRequest, NextResponse } from 'next/server';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { readAutonomyOperationsSummary } from '@/lib/server/assetContinuousEngine';

export async function GET(req: NextRequest) {
  const auth = authorizeAssetRequest(req, undefined, 'admin');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const summary = await readAutonomyOperationsSummary();
  return NextResponse.json({ ok: true, ...summary });
}
