
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../assetfactory-studio/lib/firebase');
const rateLimit = require('express-rate-limit');

// IMPORTANT: This secret MUST match the one used in the token-issuing service.
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-super-secret-key-that-is-long-and-secure';

// --- RATE LIMITING (SOC2 Compliance) ---
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per windowMs
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: 'Too many requests from this IP, please try again after 15 minutes',
});

// --- AUTHENTICATION LAYER (V2 - JWT Hardened) ---
async function authenticateAndAuthorize(req, res, next) {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header is missing.' });
    }

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Invalid authorization format. Use "Bearer <token>".' });
    }

    try {
        // Verify the token using the shared secret.
        const decoded = jwt.verify(token, JWT_SECRET);

        // The payload of the token now securely identifies the tenant.
        const { tenantId } = decoded;

        if (!tenantId) {
            return res.status(403).json({ error: 'Forbidden: Token is missing tenant information.' });
        }

        // Attach the validated tenantId to the request object.
        req.tenantId = tenantId;
        console.log(`[Auth] JWT validated. Request authorized for tenant: ${tenantId}`);
        next();

    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ error: 'Unauthorized: Token has expired.' });
        } else if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
        }
        console.error("[Auth] An unexpected error occurred during token validation:", error);
        return res.status(500).json({ error: 'Internal server error during authentication.' });
    }
}


// --- EXPRESS APP ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(apiLimiter);

const PORT = process.env.PORT || 8080;

// --- V2 ENDPOINTS ---

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0-jwt-auth' });
});

app.post('/v1/jobs', authenticateAndAuthorize, async (req, res) => {
    const tenantId = req.tenantId;
    const idempotencyKey = req.get('Idempotency-Key');

    if (!idempotencyKey) {
        return res.status(400).json({ error: 'Idempotency-Key header is missing.' });
    }

    const idempotencyRef = db.collection('idempotency_keys').doc(idempotencyKey);

    try {
        const jobData = await db.runTransaction(async (transaction) => {
            const idempotencyDoc = await transaction.get(idempotencyRef);

            if (idempotencyDoc.exists) {
                console.log(`[Idempotency] Request already processed: ${idempotencyKey}`);
                const { jobId } = idempotencyDoc.data();
                const jobDoc = await db.collection('jobs').doc(jobId).get();
                return jobDoc.data();
            }

            const jobId = uuidv4();
            const newJobData = {
                jobId,
                tenantId,
                status: 'queued',
                createdAt: new Date().toISOString(),
                input: req.body,
            };

            transaction.set(db.collection('jobs').doc(jobId), newJobData);
            transaction.set(idempotencyRef, { jobId, createdAt: new Date().toISOString() });

            return newJobData;
        });

        res.status(jobData.status === 'queued' ? 202 : 200).json(jobData);

    } catch (error) {
        console.error(`[Transaction Error] Failed to create job for key ${idempotencyKey}:`, error);
        res.status(500).json({ error: 'Failed to queue job due to a server conflict or error.' });
    }
});

app.get('/v1/jobs/:jobId', authenticateAndAuthorize, async (req, res) => {
  const { jobId } = req.params;
  const tenantId = req.tenantId;

  try {
    const jobDoc = await db.collection('jobs').doc(jobId).get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobData = jobDoc.data();
    if (jobData.tenantId !== tenantId) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.status(200).json(jobData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job status.' });
  }
});

app.get('/v1/jobs/:jobId/download', authenticateAndAuthorize, async (req, res) => {
    res.status(501).json({ 
        error: 'Not Implemented',
        message: 'Asset download must be done via the URLs in the job manifest after job completion.'
    });
});

// --- SERVER START ---
app.listen(PORT, () => {
  console.log(`✅ Asset Factory V2 Server (JWT Hardened) running on port ${PORT}`);
  console.log('🔐 API authentication now requires a valid JWT Bearer token.');
  console.log('📈 Rate limiting is now active on all API endpoints.');
  console.log('✔️ Idempotency is now enforced on job creation.');
});
