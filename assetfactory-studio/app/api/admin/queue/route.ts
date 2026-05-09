import { NextRequest, NextResponse } from 'next/server';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { readQueueOpsSummary } from '@/lib/server/assetQueueOps';

export async function GET(req: NextRequest) {
  const auth = authorizeAssetRequest(req, undefined, 'admin');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') ?? 50);
  const status = searchParams.get('status') ?? undefined;
  const includeAllTenants = searchParams.get('allTenants') === 'true';
  const tenantId = includeAllTenants && auth.roles.includes('admin') ? undefined : auth.tenantId;

  const summary = await readQueueOpsSummary({ tenantId, limit, status });

  return NextResponse.json({
    ok: summary.configured,
    scope: tenantId ? 'tenant' : 'all-tenants',
    ...summary,
  });
}
