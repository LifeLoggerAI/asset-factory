
const crypto = require('crypto');
const { saveValidator, getValidator } = require('./db');

// --- Root Authority (Simulation) ---
// In a production environment, the root private key would be stored in a secure
// hardware security module (HSM) or a top-tier secret manager. The public key
// can be safely distributed to all validator nodes.

const { privateKey: ROOT_PRIVATE_KEY, publicKey: ROOT_PUBLIC_KEY } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

console.log('[Authority] Root Authority Initialized.');


/**
 * Signs a node's identity details with the root private key to create a signature of endorsement.
 * @param {string} nodeId - The unique ID of the node.
 * @param {string} publicKey - The public key of the node.
 * @param {string} status - The status of the node (e.g., 'active').
 * @returns {string} The base64-encoded signature from the Root Authority.
 */
function signNodeRegistration(nodeId, publicKey, status) {
    const payload = `${nodeId}|${publicKey}|${status}`;
    const signer = crypto.createSign('sha256');
    signer.update(payload);
    signer.end();
    return signer.sign(ROOT_PRIVATE_KEY, 'base64');
}

/**
 * Verifies that a node's registration was signed by the Root Authority.
 * @param {object} nodeRecord - The node's record from the database.
 * @returns {boolean} True if the signature is valid, false otherwise.
 */
function verifyNodeRegistration(nodeRecord) {
    const { nodeId, publicKey, status, rootSignature } = nodeRecord;
    const payload = `${nodeId}|${publicKey}|${status}`;
    const verifier = crypto.createVerify('sha256');
    verifier.update(payload);
    verifier.end();
    return verifier.verify(ROOT_PUBLIC_KEY, rootSignature, 'base64');
}

/**
 * Securely registers a new validator node.
 * This function simulates the node registration flow.
 * @param {string} nodeId The ID for the new node.
 * @param {string} nodePublicKey The public key of the new node.
 * @returns {Promise<object>} The newly created and signed node record.
 */
async function registerNode(nodeId, nodePublicKey) {
    console.log(`[Authority] Registering new node: ${nodeId}`);
    const status = 'active';

    // 1. Root authority signs the node's identity details.
    const rootSignature = signNodeRegistration(nodeId, nodePublicKey, status);

    // 2. Create the durable node record.
    const nodeRecord = {
        nodeId,
        publicKey: nodePublicKey,
        status,
        createdAt: new Date().toISOString(),
        rotatedAt: null,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1-year expiry
        rootSignature,
    };

    // 3. Save the record to the durable database.
    await saveValidator(nodeId, nodeRecord);
    console.log(`[Authority] ✅ Node ${nodeId} successfully registered and endorsed.`);
    
    return nodeRecord;
}

/**
 * Retrieves a validator node's record from the database.
 * @param {string} nodeId The ID of the node to retrieve.
 * @returns {Promise<object | null>} The node's record or null if not found.
 */
async function getValidatorNode(nodeId) {
    return getValidator(nodeId);
}

module.exports = {
    registerNode,
    getValidatorNode,
    verifyNodeRegistration,
    ROOT_PUBLIC_KEY, // Exporting for other modules to use in verification
};
