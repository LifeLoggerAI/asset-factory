
const crypto = require('crypto');

/**
 * A simple hashing function for Merkle tree nodes.
 * @param {string} data The data to hash.
 * @returns {string} The SHA256 hash.
 */
function hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Recursively builds a Merkle tree and returns the root hash.
 * @param {string[]} hashes An array of SHA256 hashes.
 * @returns {string} The Merkle root of the provided hashes.
 */
function merkleRoot(hashes) {
    if (!hashes || hashes.length === 0) {
        return null;
    }

    if (hashes.length === 1) {
        return hashes[0];
    }

    const nextLevel = [];

    for (let i = 0; i < hashes.length; i += 2) {
        const left = hashes[i];
        // If there's no right node, duplicate the left node to hash it with itself.
        const right = (i + 1 < hashes.length) ? hashes[i + 1] : left;
        const combinedHash = hash(left + right);
        nextLevel.push(combinedHash);
    }

    return merkleRoot(nextLevel);
}

/**
 * Generates a proof of inclusion for a given hash in a Merkle tree.
 * @param {string[]} hashes The original list of hashes.
 * @param {string} targetHash The hash to generate a proof for.
 * @returns {object[]} The proof path, or null if the hash is not found.
 */
function getMerkleProof(hashes, targetHash) {
    // Implementation of proof generation would go here.
    // For now, we focus on the root calculation.
    console.log('Merkle proof generation is not yet implemented.');
    return [];
}


module.exports = {
    merkleRoot,
    getMerkleProof,
};
