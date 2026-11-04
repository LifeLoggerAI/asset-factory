import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import { getSubscriptionStatus, getCurrentUsage } from './billing';

const TIER_LIMITS = {
    free: 10,
    pro: 100,
    enterprise: Infinity,
};

function configuredLegacyJwtSecret(): string {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret || secret.length < 32 || secret === 'your-default-super-secret-key-that-is-long-and-secure' || secret === 'change-me-local-only') {
        throw new Error('Legacy JWT verification is disabled: a secure JWT_SECRET is required.');
    }
    return secret;
}

export async function authenticateAndAuthorize(req: NextRequest) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        throw new Error('Authorization header is missing.');
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
        throw new Error('Invalid authorization format. Use "Bearer <token>".');
    }

    try {
        const decoded = jwt.verify(token, configuredLegacyJwtSecret(), { algorithms: ['HS256'] });
        if (typeof decoded !== 'object' || decoded === null || typeof decoded.tenantId !== 'string' || !decoded.tenantId.trim()) {
            throw new Error('Forbidden: Token is missing tenant information.');
        }

        const subscription = await getSubscriptionStatus(decoded.tenantId);
        if (subscription.status !== 'active' && subscription.tier !== 'free') {
            throw new Error('402: Subscription is not active.');
        }

        const usage = await getCurrentUsage(decoded.tenantId);
        const limit = TIER_LIMITS[subscription.tier || 'free'];

        if (usage >= limit) {
            throw new Error('429: Usage limit exceeded.');
        }

        console.log('[Auth] Legacy JWT validated for configured tenant.');
        return { tenantId: decoded.tenantId, subscription };
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new Error('Unauthorized: Token has expired.');
        } else if (error instanceof jwt.JsonWebTokenError) {
            throw new Error('Unauthorized: Invalid token.');
        }
        throw error;
    }
}
