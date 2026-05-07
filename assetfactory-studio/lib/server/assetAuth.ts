import type { NextRequest } from 'next/server';

type AssetRole = 'viewer' | 'creator' | 'publisher' | 'admin';
type AuthResult =
  | { ok: true; tenantId?: string; userId?: string; roles: AssetRole[]; mode: 'disabled' | 'tenant-role' }
  | { ok: false; status: number; error: string };

const roleRank: Record<AssetRole, number> = { viewer: 1, creator: 2, publisher: 3, admin: 4 };

function parseRoles(value: unknown): AssetRole[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const roles = raw
    .map((role) => String(role).trim().toLowerCase())
    .filter((role): role is AssetRole => ['viewer', 'creator', 'publisher', 'admin'].includes(role));
  return roles.length ? roles : ['viewer'];
}

function hasRole(roles: AssetRole[], requiredRole: AssetRole) {
  return roles.some((role) => roleRank[role] >= roleRank[requiredRole]);
}

export function authorizeAssetRequest(
  req: NextRequest,
  expectedTenantId?: string,
  requiredRole: AssetRole = 'viewer'
): AuthResult {
  const requireAuth = process.env.ASSET_FACTORY_REQUIRE_AUTH === 'true';
  const headerTenantId = req.headers.get('x-tenant-id') ?? undefined;
  const headerUserId = req.headers.get('x-user-id') ?? undefined;
  const headerRoles = req.headers.get('x-asset-roles') ?? req.headers.get('x-asset-role') ?? undefined;

  if (!requireAuth) {
    return { ok: true, tenantId: expectedTenantId ?? headerTenantId, userId: headerUserId, roles: ['admin'], mode: 'disabled' };
  }

  const tenantId = expectedTenantId ?? headerTenantId;
  if (!tenantId) return { ok: false, status: 400, error: 'x-tenant-id is required when auth is enabled' };
  if (expectedTenantId && headerTenantId && expectedTenantId !== headerTenantId) return { ok: false, status: 403, error: 'Tenant mismatch' };

  const roles = parseRoles(headerRoles);
  if (!hasRole(roles, requiredRole)) return { ok: false, status: 403, error: `Role ${requiredRole} required` };

  return { ok: true, tenantId, userId: headerUserId, roles, mode: 'tenant-role' };
}
