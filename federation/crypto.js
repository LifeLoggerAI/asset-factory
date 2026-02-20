
const { createHash, createSign, createVerify } = require('crypto');

// In a real system, these would be managed securely.
const privateKey = '--BEGIN PRIVATE KEY--\n...' + Math.random(); // Dummy private key
const publicKey = '--BEGIN PUBLIC KEY--\n...' + Math.random(); // Dummy public key

/**
 * Hashes data using SHA256.
 * @param {any} data - The data to hash.
 * @returns {string} The SHA256 hash, encoded in hex.
 */
function hashData(data) {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/**
 * Signs a hash with the node's private key.
 * @param {string} hash - The hash to sign.
 * @returns {string} The signature in hex format.
 */
function sign(hash) {
    const signer = createSign('sha256');
    signer.update(hash);
    signer.end();
    return signer.sign(privateKey, 'hex');
}

/**
 * Verifies a signature against a hash and a public key.
 * @param {string} hash - The hash to verify.
 * @param {string} signature - The signature to verify.
 * @param {string} remotePublicKey - The public key of the signer.
 * @returns {boolean} True if the signature is valid, false otherwise.
 */
function verify(hash, signature, remotePublicKey) {
    const verifier = createVerify('sha256');
    verifier.update(hash);
    verifier.end();
    return verifier.verify(remotePublicKey, signature, 'hex');
}

module.exports = {
    hashData,
    sign,
    verify,
    publicKey, // Exporting for others to use
};
