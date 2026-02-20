
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getSubscriptionStatus, getCurrentUsage } from './billing.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-that-is-long-and-secure';

const TIER_LIMITS = {
    free: 10,
    pro: 100,
    enterprise: Infinity,
};

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
        const decoded = jwt.verify(token, JWT_SECRET) as { tenantId: string };

        if (!decoded.tenantId) {
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

        console.log(`[Auth] JWT validated. Request authorized for tenant: ${decoded.tenantId}`);
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
