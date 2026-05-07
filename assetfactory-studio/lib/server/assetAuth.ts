import type { NextRequest } from 'next/server';
import { getAdminDb } from './firebaseAdmin';

type AssetRole = 'viewer' | 'creator' | 'publisher' | 'admin';
type AuthResult =
  | { ok: true; tenantId?: string; userId?: string; roles: AssetRole[]; mode: 'disabled' | 'rbac' }
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

async function readMembershipRoles(tenantId: string, userId?: string) {
  if (!userId) return null;
  const db = getAdminDb();
  if (!db) return null;
  const doc = await db.collection('tenants').doc(tenantId).collection('members').doc(userId).get();
  if (!doc.exists) return null;
  return parseRoles(doc.data()?.roles ?? doc.data()?.role);
}

export async function authorizeAssetRequest(
  req: NextRequest,
  expectedTenantId?: string,
  requiredRole: AssetRole = 'viewer'
): Promise<AuthResult> {
  const requireAuth = process.env.ASSET_FACTORY_REQUIRE_AUTH === 'true';
  const headerTenantId = req.headers.get('x-tenant-id') ?? undefined;
  const headerUserId = req.headers.get('x-user-id') ?? undefined;
  const headerRoles = req.headers.get('x-asset-roles') ?? req.headers.get('x-asset-role') ?? undefined;
  const authHeader = req.headers.get('authorization') ?? '';

  if (!requireAuth) {
    return { ok: true, tenantId: expectedTenantId ?? headerTenantId, userId: headerUserId, roles: ['admin'], mode: 'disabled' };
  }

  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Missing bearer token' };
  }

  const serviceToken = process.env.ASSET_FACTORY_SERVICE_TOKEN;
  if (serviceToken && authHeader === `Bearer ${serviceToken}`) {
    return { ok: true, tenantId: expectedTenantId ?? headerTenantId, userId: headerUserId, roles: ['admin'], mode: 'rbac' };
  }

  const tenantId = expectedTenantId ?? headerTenantId;
  if (!tenantId) return { ok: false, status: 400, error: 'x-tenant-id is required when auth is enabled' };
  if (expectedTenantId && headerTenantId && expectedTenantId !== headerTenantId) return { ok: false, status: 403, error: 'Tenant mismatch' };

  const roles = (await readMembershipRoles(tenantId, headerUserId)) ?? parseRoles(headerRoles);
  if (!hasRole(roles, requiredRole)) return { ok: false, status: 403, error: `Role ${requiredRole} required` };

  return { ok: true, tenantId, userId: headerUserId, roles, mode: 'rbac' };
}
