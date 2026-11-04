require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { db } = require('../assetfactory-studio/lib/firebase');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const crypto = require('crypto');
const morgan = require('morgan');
const { createIdentity } = require('../identity/identityService');

// This preserved V4 prototype is not the supported production entrypoint.
// It must never start without an explicitly configured strong signing key.
function configuredLegacyJwtSecret() {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret || secret.length < 32 || secret === 'your-default-super-secret-key-that-is-long-and-secure' || secret === 'change-me-local-only') {
        throw new Error('Legacy V4 API disabled: a secure JWT_SECRET must be configured.');
    }
    return secret;
}
const JWT_SECRET = configuredLegacyJwtSecret();
let apiServerDid;
let apiServerPrivateKey;
async function initializeApiServerIdentity() {
    const identity = await createIdentity('api-server', 'global');
    apiServerDid = identity.did;
    apiServerPrivateKey = identity.privateKey;
}
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
});
async function authenticateAndAuthorize(req, res, next) {
    const authHeader = req.get('Authorization');
    if (!authHeader) return res.status(401).json({ error: 'Authorization header is missing.' });
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Invalid authorization format.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        if (!decoded || typeof decoded !== 'object' || typeof decoded.tenantId !== 'string' || !decoded.tenantId.trim()) {
            return res.status(403).json({ error: 'Forbidden: Token is missing tenant information.' });
        }
        req.tenantId = decoded.tenantId;
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) return res.status(401).json({ error: 'Unauthorized: Token has expired.' });
        if (error instanceof jwt.JsonWebTokenError) return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
        return res.status(500).json({ error: 'Internal server error during authentication.' });
    }
}
const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(apiLimiter);
const PORT = process.env.PORT || 8080;
const VALIDATOR_URL = process.env.VALIDATOR_URL || 'http://localhost:9000';
app.post('/v4/jobs', authenticateAndAuthorize, async (req, res) => {
    const transaction = {
        type: 'CREATE_JOB',
        payload: { ...req.body, tenantId: req.tenantId },
        timestamp: new Date().toISOString(),
    };
    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(transaction));
    const signedTransaction = {
        transaction,
        signature: sign.sign(apiServerPrivateKey, 'hex'),
        publicKey: apiServerDid,
    };
    try {
        const validatorResponse = await axios.post(`${VALIDATOR_URL}/submit`, signedTransaction);
        res.status(validatorResponse.status).json(validatorResponse.data);
    } catch (error) {
        console.error('[Server] Validator request failed.');
        res.status(500).json({ error: 'Failed to submit transaction.' });
    }
});
async function startServer() {
    await initializeApiServerIdentity();
    app.listen(PORT, () => console.log('Asset Factory legacy V4 prototype listening'));
}
startServer();
