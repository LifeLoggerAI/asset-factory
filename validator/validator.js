
const express = require('express');
const morgan = require('morgan');
const crypto = require('crypto');
const { hashEvent } = require('../utils/hashing');
const { registerNode, getValidatorNode, verifyNodeRegistration } = require('../identity/authority');
const { runConfirmationTransaction } = require('../quorum/db');

const SELF_CLOUD_ID = 'gcp-us-1';

// --- Cryptographic Setup ---
const { privateKey: selfPrivateKey, publicKey: selfPublicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// --- System Initialization ---
const app = express();
const PORT = process.env.PORT || 3000;
app.use(morgan('dev'));
app.use(express.json());

// --- Helper Functions ---
function signPayload(payload) {
    const signer = crypto.createSign('sha256');
    signer.update(payload);
    signer.end();
    return signer.sign(selfPrivateKey, 'base64');
}

// --- Core Quorum Logic (Now with Zero-Trust Identity & Durable State) ---
async function processConfirmation(eventId, cloudNodeId, hash, signature) {
    console.log(`[Quorum] Processing confirmation for ${eventId} from ${cloudNodeId}.`);
    
    // 1. FETCH & VALIDATE IDENTITY
    const nodeRecord = await getValidatorNode(cloudNodeId);
    if (!nodeRecord) {
        throw new Error(`IDENTITY REJECTED: Node ${cloudNodeId} not found in registry.`);
    }
    if (nodeRecord.status !== 'active') {
        throw new Error(`IDENTITY REJECTED: Node ${cloudNodeId} is not active. Status: ${nodeRecord.status}`);
    }
    if (new Date(nodeRecord.expiresAt) < new Date()) {
        throw new Error(`IDENTITY REJECTED: Node ${cloudNodeId} registration has expired.`);
    }

    // 2. VERIFY ROOT ENDORSEMENT
    if (!verifyNodeRegistration(nodeRecord)) {
        throw new Error(`IDENTITY REJECTED: Node ${cloudNodeId} signature from Root Authority is invalid. TAMPERING DETECTED.`);
    }
    console.log(`[Quorum] Identity of ${cloudNodeId} is valid and endorsed by Root Authority.`);

    // 3. VERIFY EVENT SIGNATURE (Zero-Trust)
    const payload = `${eventId}|${hash}`;
    const verifier = crypto.createVerify('sha256');
    verifier.update(payload);
    if (!verifier.verify(nodeRecord.publicKey, signature, 'base64')) {
        throw new Error(`SIGNATURE REJECTED: Invalid event confirmation signature from node: ${cloudNodeId}`);
    }
    console.log(`[Quorum] Event signature from ${cloudNodeId} is valid.`);

    // 4. ATOMIC & DURABLE UPDATE (Firestore Transaction)
    await runConfirmationTransaction(eventId, async (tx, snap, ref) => {
        let data = snap.exists ? snap.data() : {
            confirmations: {},
            hashes: [],
            status: "pending",
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        };

        if (data.confirmations[cloudNodeId]) return; // Idempotency

        data.confirmations[cloudNodeId] = true;
        data.hashes.push(hash);

        const confirmationCount = Object.keys(data.confirmations).length;
        const allHashesMatch = data.hashes.every(h => h === data.hashes[0]);

        if (confirmationCount >= 2 && allHashesMatch) {
            data.status = 'final';
            console.log(`✅ Quorum reached for event ${eventId}! Event is FINAL.`);
        } else if (confirmationCount >= 2 && !allHashesMatch) {
            data.status = 'quarantined';
            console.log(`❌ QUARANTINED: Hash mismatch for event ${eventId}!`);
        }

        tx.set(ref, data);
    });
}

// --- API Endpoints ---

app.post('/event', async (req, res) => {
    const event = { ...req.body, eventId: `evt-${Date.now()}`, originCloud: SELF_CLOUD_ID };
    event.hash = hashEvent(event);
    const signature = signPayload(`${event.eventId}|${event.hash}`);

    try {
        await processConfirmation(event.eventId, SELF_CLOUD_ID, event.hash, signature);
        res.status(202).send({ status: 'pending', eventId: event.eventId, hash: event.hash });
    } catch (error) {
        console.error("[Event] Failed to process initial confirmation:", error);
        return res.status(500).send({ status: 'error', message: error.message });
    }
});

app.post('/confirm', async (req, res) => {
    const { eventId, cloudNodeId, hash, signature } = req.body;
    try {
        await processConfirmation(eventId, cloudNodeId, hash, signature);
        res.status(200).send({ status: 'confirmed' });
    } catch (error) {
        console.error(`[Confirm] Failed: ${error.message}`);
        res.status(403).send({ status: 'error', message: `Confirmation rejected: ${error.message}` });
    }
});

// --- Server Initialization ---
async function startServer() {
    // SETUP: Register this node and other simulated nodes with the Identity Authority
    console.log('--- Initializing Identity Layer ---');
    await registerNode(SELF_CLOUD_ID, selfPublicKey);
    await registerNode('aws-eu-2', crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey);
    await registerNode('azure-ca-1', crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey);
    console.log('--- Identity Layer Initialized ---\n');

    app.listen(PORT, () => {
        console.log(`✅ Hardened validator node (${SELF_CLOUD_ID}) running on port ${PORT}`);
        console.log('Now using Zero-Trust Identity Verification for all confirmations.');
    });
}

startServer();
