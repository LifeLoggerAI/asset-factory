import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAssetFactoryApiKey } from '@/lib/server/apiAuth';
import { authorizeAssetRequest } from '@/lib/server/assetAuth';
import { recordUsage } from '@/lib/server/assetFactoryStore';

export async function POST(req: NextRequest) {
  const apiKeyError = requireAssetFactoryApiKey(req);
  if (apiKeyError) return apiKeyError;

  const auth = authorizeAssetRequest(req, undefined, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const tenantId = auth.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required for account deletion request' }, { status: 400 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';
  const requestedAt = new Date().toISOString();
  const deletionRequestId = randomUUID();

  await recordUsage({
    action: 'account.deletion_requested',
    tenantId,
    deletionRequestId,
    requestedBy: auth.userId ?? 'unknown',
    reason: reason || undefined,
    status: 'pending-manual-review',
    createdAt: requestedAt,
  });

  return NextResponse.json({
    ok: true,
    deletionRequestId,
    tenantId,
    requestedAt,
    status: 'pending-manual-review',
    message: 'Deletion request recorded for operator review. No tenant data was deleted automatically.',
  }, { status: 202 });
}
