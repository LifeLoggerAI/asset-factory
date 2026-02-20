
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../assetfactory-studio/lib/firebase');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const crypto = require('crypto');
const morgan = require('morgan');
const { createIdentity } = require('../identity/identityService');
const { verifyAttestation } = require('../attestation/verifier.ts');

// --- API SERVER IDENTITY ---
let apiServerDid;
let apiServerPrivateKey;

async function initializeApiServerIdentity() {
    const identity = await createIdentity('api-server', 'global');
    apiServerDid = identity.did;
    apiServerPrivateKey = identity.privateKey;
    console.log(`[Server] Initialized with DID: ${apiServerDid}`);
}

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
        const decoded = jwt.verify(token, JWT_SECRET);
        const { tenantId } = decoded;
        if (!tenantId) {
            return res.status(403).json({ error: 'Forbidden: Token is missing tenant information.' });
        }
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
app.use(morgan('dev'));
app.use(apiLimiter);

const PORT = process.env.PORT || 8080;
const WORKER_V2_URL = process.env.WORKER_V2_URL || 'http://localhost:8081';
const ENCLAVE_WORKER_URL = process.env.ENCLAVE_WORKER_URL || 'https://localhost:443';
const VALIDATOR_URL = process.env.VALIDATOR_URL || 'http://localhost:9000';

// --- V1, V2, V3 ENDPOINTS --- 
// ... (previous endpoints) ...

// --- V4 ENDPOINTS (Decentralized Validator) ---

app.post('/v4/jobs', authenticateAndAuthorize, async (req, res) => {
    const transaction = {
        type: 'CREATE_JOB',
        payload: { ...req.body, tenantId: req.tenantId },
        timestamp: new Date().toISOString(),
    };

    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(transaction));
    const signature = sign.sign(apiServerPrivateKey, 'hex');

    const signedTransaction = {
        transaction,
        signature,
        publicKey: apiServerDid, // The server's DID
    };

    try {
        console.log(`[Server] Submitting transaction to validator at ${VALIDATOR_URL}`)
        const validatorResponse = await axios.post(`${VALIDATOR_URL}/submit`, signedTransaction);
        res.status(validatorResponse.status).json(validatorResponse.data);
    } catch (error) {
        console.error(`[Server] Error submitting transaction to validator:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to submit transaction to the validator network.' });
    }
});


// --- SERVER START ---
async function startServer() {
    await initializeApiServerIdentity();
    app.listen(PORT, () => {
        console.log(`✅ Asset Factory V4 Server (Decentralized) running on port ${PORT}`);
        console.log(`⛓️  Submitting transactions to validator network at: ${VALIDATOR_URL}`);
    });
}

startServer();
