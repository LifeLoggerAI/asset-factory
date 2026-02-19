
import { db } from '../../lib/firebase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-that-is-long-and-secure';

// This API route fetches the job history for the authenticated tenant.
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    const authHeader = req.get('Authorization');
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing.' });
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Invalid authorization format. Use "Bearer <token>".' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { tenantId } = decoded;

        if (!tenantId) {
            return res.status(403).json({ error: 'Forbidden: Token is missing tenant information.' });
        }

        // Query Firestore for all jobs belonging to this tenant, ordered by creation date.
        const jobsSnapshot = await db.collection('jobs')
            .where('tenantId', '==', tenantId)
            .orderBy('createdAt', 'desc')
            .get();

        if (jobsSnapshot.empty) {
            return res.status(200).json([]);
        }

        const jobs = jobsSnapshot.docs.map(doc => doc.data());
        
        console.log(`[Jobs API] Fetched ${jobs.length} jobs for tenant ${tenantId}.`);
        res.status(200).json(jobs);

    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
        }
        console.error(`[Jobs API] Error fetching jobs:`, error);
        res.status(500).json({ error: 'Failed to fetch jobs.' });
    }
}
