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

type JwtHeader = Record<string, unknown> & {
  alg?: string;
  typ?: string;
};

const roleRank: Record<AssetRole, number> = { viewer: 1, creator: 2, publisher: 3, admin: 4, operator: 4 };
const allowedRoles: AssetRole[] = ['viewer', 'creator', 'publisher', 'admin', 'operator'];
const supportedJwtAlgorithms = new Set(['HS256']);

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

function decodeJwtPart<T>(parts: string[], partIndex: 0 | 1): T | null {
  try {
    return JSON.parse(base64UrlToBuffer(parts[partIndex]).toString('utf8')) as T;
  } catch {
    return null;
  }
}

function verifyHs256Signature(parts: string[], secret: string) {
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
  if (!Number.isFinite(payload.exp)) return 'JWT expiration is required';
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) return 'JWT is expired';
  if (process.env.NODE_ENV === 'production' && typeof payload.exp === 'number' &&
      payload.exp > nowSeconds + 3600) return 'Production JWT expiration exceeds the allowed lifetime';
  if (payload.nbf !== undefined && !Number.isFinite(payload.nbf)) return 'JWT activation time is invalid';
  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) return 'JWT is not active yet';

  const issuer = process.env.ASSET_FACTORY_JWT_ISSUER;
  if (issuer && payload.iss !== issuer) return 'JWT issuer mismatch';

  const audience = process.env.ASSET_FACTORY_JWT_AUDIENCE || process.env.ASSET_FACTORY_AUDIENCE;
  if (audience) {
    const payloadAudience = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!payloadAudience.includes(audience)) return 'JWT audience mismatch';
  }

  return null;
}

function authenticateJwt(req: NextRequest): AuthResult {
  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Authorization bearer token is required when auth is enabled' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, error: 'JWT payload is invalid' };

  const header = decodeJwtPart<JwtHeader>(parts, 0);
  if (!header?.alg || !supportedJwtAlgorithms.has(header.alg)) {
    return { ok: false, status: 401, error: 'JWT algorithm is unsupported' };
  }

  const sharedSecret = process.env.ASSET_FACTORY_JWT_HS256_SECRET;
  if (!sharedSecret?.trim()) {
    return { ok: false, status: 503, error: 'JWT signature enforcement requires a configured supported verifier' };
  }
  if (process.env.NODE_ENV === 'production' && Buffer.byteLength(sharedSecret, 'utf8') < 32) {
    return { ok: false, status: 503, error: 'Production JWT verifier configuration is insufficient' };
  }
  if (!verifyHs256Signature(parts, sharedSecret)) {
    return { ok: false, status: 401, error: 'JWT signature verification failed' };
  }

  const payload = decodeJwtPart<JwtPayload>(parts, 1);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, status: 401, error: 'JWT payload is invalid' };

  const claimError = verifyJwtClaims(payload);
  if (claimError) return { ok: false, status: 401, error: claimError };

  const tenantClaimName = process.env.ASSET_FACTORY_TENANT_CLAIM || 'tenantId';
  const roleClaimName = process.env.ASSET_FACTORY_ROLE_CLAIM || 'roles';
  const production = process.env.NODE_ENV === 'production';
  const tenantId = firstStringClaim(payload, production ? [tenantClaimName] : [tenantClaimName, 'tenantId', 'tid', 'workspaceId']);
  if (!tenantId) return { ok: false, status: 401, error: `JWT tenant claim ${tenantClaimName} is required` };

  const roleValue = production ? payload[roleClaimName] : payload[roleClaimName] ?? payload.roles ?? payload.role;
  if (production) {
    const declared = Array.isArray(roleValue) ? roleValue : typeof roleValue === 'string' ? roleValue.split(',') : [];
    if (!declared.length || declared.some(role => typeof role !== 'string' ||
        !allowedRoles.includes(role.trim().toLowerCase() as AssetRole))) {
      return { ok: false, status: 401, error: 'Production JWT role claim is invalid' };
    }
  }
  const roles = parseRoles(roleValue);
  const userId = firstStringClaim(payload, production ? ['sub'] : ['sub', 'userId', 'uid']);
  if (production && !userId) return { ok: false, status: 401, error: 'Production JWT subject is required' };

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

  if (process.env.NODE_ENV === 'production') {
    if (!requireAuth || allowLegacyHeaders) {
      return { ok: false, status: 503, error: 'Production access requires signed JWT authentication' };
    }
    if (!process.env.ASSET_FACTORY_JWT_ISSUER?.trim() ||
        !(process.env.ASSET_FACTORY_JWT_AUDIENCE || process.env.ASSET_FACTORY_AUDIENCE)?.trim()) {
      return { ok: false, status: 503, error: 'Production JWT issuer and audience configuration is required' };
    }
  }

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

  // A selected tenant is a request constraint, never an identity grant. Signed
  // canonical ownership must agree before returning data for that UI context.
  const selectedTenantId = req.headers.get('x-tenant-id');
  if (auth.mode === 'jwt' && selectedTenantId !== null && selectedTenantId.trim() !== auth.tenantId) {
    return { ok: false, status: 403, error: 'Tenant mismatch' };
  }

  if (!hasRole(auth.roles, requiredRole)) return { ok: false, status: 403, error: `Role ${requiredRole} required` };

  return auth;
}

export function isTenantAuthorized(req: NextRequest, tenantId: string, requiredRole: AssetRole = 'viewer') {
  return authorizeAssetRequest(req, tenantId, requiredRole);
}
