
import jwt from 'jsonwebtoken';

// IMPORTANT: In a production environment, this secret key should be stored in a secure
// secret manager (like Google Secret Manager or AWS KMS) and not hardcoded.
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-that-is-long-and-secure';

// This API route is for internal use by the Asset Factory Studio frontend.
// It simulates a login process where a tenant ID is exchanged for a JWT.
export default function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const { tenantId } = req.body;

    if (!tenantId) {
        return res.status(400).json({ error: 'tenantId is required.' });
    }

    try {
        // Create a JWT that expires in 1 hour.
        const token = jwt.sign(
            { 
                tenantId,
                // In a real system, you would include other claims like user roles, etc.
                // iss: 'AssetFactoryAuthService',
                // sub: userId, 
            },
            JWT_SECRET, 
            { expiresIn: '1h' } 
        );

        console.log(`[Token Service] Issued JWT for tenant: ${tenantId}`);
        res.status(200).json({ token });

    } catch (error) {
        console.error(`[Token Service] Error signing JWT for tenant ${tenantId}:`, error);
        res.status(500).json({ error: 'Failed to generate token.' });
    }
}
