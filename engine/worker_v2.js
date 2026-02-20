'''
const express = require('express');
const crypto = require('crypto');
const { db } = require('../assetfactory-studio/lib/firebase');
const { createIdentity, resolveIdentity } = require('../identity/identityService'); // Assuming identityService is in the right path

// --- Worker Identity ---
let workerDid;
let workerPrivateKey;

async function initializeWorkerIdentity() {
    // In a real implementation, the private key would be loaded from a secure secret manager.
    const identity = await createIdentity('worker', 'global');
    workerDid = identity.did;
    workerPrivateKey = identity.privateKey;
    console.log(`[WorkerV2] Initialized with DID: ${workerDid}`);
}

// --- Challenge Store (In-memory for this example) ---
const challengeStore = new Map();

// --- EXPRESS APP for secure endpoint ---
const app = express();
app.use(express.json());

const PORT = process.env.WORKER_PORT || 8081;

// --- Secure Endpoint with Challenge-Response Auth ---

// 1. Get Challenge
app.get('/v2/jobs/challenge', (req, res) => {
    const challenge = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + 60000; // Challenge is valid for 1 minute
    challengeStore.set(challenge, expiry);
    res.json({ challenge });
});

// 2. Submit Job with Signed Challenge
app.post('/v2/jobs', async (req, res) => {
    const clientDid = req.get('X-DID');
    const signature = req.get('X-Signature');
    const { challenge, jobData } = req.body;

    if (!clientDid || !signature || !challenge || !jobData) {
        return res.status(400).json({ error: 'Missing DID, signature, challenge, or job data.' });
    }

    // Verify challenge
    if (!challengeStore.has(challenge) || challengeStore.get(challenge) < Date.now()) {
        return res.status(401).json({ error: 'Invalid or expired challenge.' });
    }
    challengeStore.delete(challenge); // Challenge can only be used once

    try {
        // Resolve client's DID
        const clientDidDocument = await resolveIdentity(clientDid);
        const publicKeyHex = clientDidDocument.verificationMethod[0].publicKeyHex;
        const publicKey = crypto.createPublicKey({
            key: Buffer.from(publicKeyHex, 'hex'),
            format: 'hex',
            type: 'spki'
        });

        // Verify signature
        const verify = crypto.createVerify('SHA256');
        verify.update(challenge);
        const isVerified = verify.verify(publicKey, signature, 'hex');

        if (!isVerified) {
            return res.status(401).json({ error: 'Invalid signature.' });
        }

        // --- If verified, process the job ---
        console.log(`[WorkerV2] Authenticated job submission from DID: ${clientDid}`);
        // In a real implementation, you would now queue or directly execute the job.
        // For now, we'll just acknowledge it.
        const jobId = `job_${crypto.randomBytes(8).toString('hex')}`;
        res.status(202).json({
            status: 'queued',
            jobId,
            message: `Job received and authenticated from ${clientDid}.`
        });


    } catch (error) {
        console.error(`[WorkerV2] Authentication failed:`, error);
        res.status(500).json({ error: 'Failed to verify identity.' });
    }
});


// --- Main ---
async function main() {
    await initializeWorkerIdentity();
    app.listen(PORT, () => {
        console.log(`[WorkerV2] Secure worker endpoint running on port ${PORT}`);
        console.log(`[WorkerV2] Ready to accept jobs via challenge-response protocol.`);
    });
}

main();

// Note: The original 'watchForJobs' logic from worker.js is not included here.
// This V2 worker operates on a direct, authenticated push model.

''