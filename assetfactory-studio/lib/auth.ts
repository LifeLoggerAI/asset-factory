
import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-that-is-long-and-secure';

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

        console.log(`[Auth] JWT validated. Request authorized for tenant: ${decoded.tenantId}`);
        return { tenantId: decoded.tenantId };

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new Error('Unauthorized: Token has expired.');
        } else if (error instanceof jwt.JsonWebTokenError) {
            throw new Error('Unauthorized: Invalid token.');
        }
        throw new Error('Internal server error during authentication.');
    }
}
