import type { NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

type AssetRole = 'viewer' | 'creator' | 'publisher' | 'admin' | 'operator';
type AuthMode = 'disabled' | 'jwt' | 'legacy-headers';
type AuthResult =
  | { ok: true; tenantId?: string; userId?: string; roles: AssetRole[]; mode: AuthMode }
  | { ok: false; status: number; error: string };

type JwtPayload = Record<string, unknown> & {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
};

const roleRank: Record<AssetRole, number> = { viewer: 1, creator: 2, publisher: 3, admin: 4, operator: 4 };
const allowedRoles: AssetRole[] = ['viewer', 'creator', 'publisher', 'admin', 'operator'];

function parseBooleanEnv(name: string) {
  return process.env[name] === 'true';
}

function parseRoles(value: unknown): AssetRole[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const roles = raw
    .map((role) => String(role).trim().toLowerCase())
    .filter((role): role is AssetRole => allowedRoles.includes(role as AssetRole));
  return roles.length ? [...new Set(roles)] : ['viewer'];
}

function hasRole(roles: AssetRole[], requiredRole: AssetRole) {
  return roles.some((role) => roleRank[role] >= roleRank[requiredRole] || role === requiredRole);
}

function base64UrlToBuffer(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function base64UrlEncode(value: Buffer) {
  return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlToBuffer(parts[1]).toString('utf8')) as JwtPayload;
  } catch {
    return null;
  }
}

function verifyHs256Signature(token: string, secret: string) {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [header, payload, signature] = parts;
  const expected = base64UrlEncode(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function getBearerToken(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function firstStringClaim(payload: JwtPayload, names: string[]) {
  for (const name of names) {
    const value = payload[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function verifyJwtClaims(payload: JwtPayload): string | null {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) return 'JWT is expired';
  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) return 'JWT is not active yet';

  const issuer = process.env.ASSET_FACTORY_JWT_ISSUER;
  if (issuer && payload.iss !== issuer) return 'JWT issuer mismatch';

  const audience = process.env.ASSET_FACTORY_JWT_AUDIENCE;
  if (audience) {
    const payloadAudience = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!payloadAudience.includes(audience)) return 'JWT audience mismatch';
  }

  return null;
}

function authenticateJwt(req: NextRequest): AuthResult {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Authorization bearer token is required when auth is enabled' };

  const sharedSecret = process.env.ASSET_FACTORY_JWT_HS256_SECRET;
  if (sharedSecret && !verifyHs256Signature(token, sharedSecret)) {
    return { ok: false, status: 401, error: 'JWT signature verification failed' };
  }

  if (!sharedSecret && parseBooleanEnv('ASSET_FACTORY_REQUIRE_JWT_SIGNATURE')) {
    return { ok: false, status: 503, error: 'JWT signature enforcement is enabled, but no supported verifier is configured' };
  }

  const payload = decodeJwtPayload(token);
  if (!payload) return { ok: false, status: 401, error: 'JWT payload is invalid' };

  const claimError = verifyJwtClaims(payload);
  if (claimError) return { ok: false, status: 401, error: claimError };

  const tenantClaimName = process.env.ASSET_FACTORY_TENANT_CLAIM || 'tenantId';
  const roleClaimName = process.env.ASSET_FACTORY_ROLE_CLAIM || 'roles';
  const tenantId = firstStringClaim(payload, [tenantClaimName, 'tenantId', 'tid', 'workspaceId']);
  if (!tenantId) return { ok: false, status: 401, error: `JWT tenant claim ${tenantClaimName} is required` };

  const roles = parseRoles(payload[roleClaimName] ?? payload.roles ?? payload.role);
  const userId = firstStringClaim(payload, ['sub', 'userId', 'uid']);

  return { ok: true, tenantId, userId, roles, mode: 'jwt' };
}

function authenticateLegacyHeaders(req: NextRequest): AuthResult {
  const headerTenantId = req.headers.get('x-tenant-id') ?? undefined;
  const headerUserId = req.headers.get('x-user-id') ?? undefined;
  const headerRoles = req.headers.get('x-asset-roles') ?? req.headers.get('x-asset-role') ?? undefined;

  if (!headerTenantId) return { ok: false, status: 400, error: 'x-tenant-id is required when legacy header auth is enabled' };
  return { ok: true, tenantId: headerTenantId, userId: headerUserId, roles: parseRoles(headerRoles), mode: 'legacy-headers' };
}

export function authorizeAssetRequest(
  req: NextRequest,
  expectedTenantId?: string,
  requiredRole: AssetRole = 'viewer'
): AuthResult {
  const requireAuth = parseBooleanEnv('ASSET_FACTORY_REQUIRE_AUTH');
  const allowLegacyHeaders = parseBooleanEnv('ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH');

  if (!requireAuth) {
    const headerTenantId = req.headers.get('x-tenant-id') ?? undefined;
    const headerUserId = req.headers.get('x-user-id') ?? undefined;
    return { ok: true, tenantId: expectedTenantId ?? headerTenantId, userId: headerUserId, roles: ['admin'], mode: 'disabled' };
  }

  const auth = getBearerToken(req) ? authenticateJwt(req) : allowLegacyHeaders ? authenticateLegacyHeaders(req) : { ok: false as const, status: 401, error: 'Authorization bearer token is required when auth is enabled' };
  if (!auth.ok) return auth;

  if (expectedTenantId && auth.tenantId && expectedTenantId !== auth.tenantId) {
    return { ok: false, status: 403, error: 'Tenant mismatch' };
  }

  if (!hasRole(auth.roles, requiredRole)) return { ok: false, status: 403, error: `Role ${requiredRole} required` };

  return auth;
}

export function isTenantAuthorized(req: NextRequest, tenantId: string, requiredRole: AssetRole = 'viewer') {
  return authorizeAssetRequest(req, tenantId, requiredRole);
}
