import type { NextRequest } from 'next/server';

type AuthResult =
  | { ok: true; tenantId?: string; mode: 'disabled' | 'required-header' }
  | { ok: false; status: number; error: string };

export function authorizeAssetRequest(req: NextRequest, expectedTenantId?: string): AuthResult {
  const requireAuth = process.env.ASSET_FACTORY_REQUIRE_AUTH === 'true';
  const headerTenantId = req.headers.get('x-tenant-id') ?? undefined;
  const authHeader = req.headers.get('authorization') ?? '';

  if (!requireAuth) {
    return { ok: true, tenantId: expectedTenantId ?? headerTenantId, mode: 'disabled' };
  }

  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Missing bearer token' };
  }

  if (!headerTenantId && !expectedTenantId) {
    return { ok: false, status: 400, error: 'x-tenant-id is required when auth is enabled' };
  }

  if (expectedTenantId && headerTenantId && expectedTenantId !== headerTenantId) {
    return { ok: false, status: 403, error: 'Tenant mismatch' };
  }

  return { ok: true, tenantId: expectedTenantId ?? headerTenantId, mode: 'required-header' };
}
