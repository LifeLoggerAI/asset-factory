
const fs = require('fs/promises');
const path = require('path');
const { hashData } = require('./crypto');

/**
 * Recursively builds a Merkle tree from a list of hashes.
 * @param {string[]} hashes - An array of hashes.
 * @returns {string} The Merkle root of the tree.
 */
function buildMerkleTree(hashes) {
    if (hashes.length === 0) {
        return hashData(''); // Return a hash of an empty string for an empty tree
    }
    if (hashes.length === 1) {
        return hashes[0];
    }

    // If the number of hashes is odd, duplicate the last one
    if (hashes.length % 2 !== 0) {
        hashes.push(hashes[hashes.length - 1]);
    }

    const nextLevelHashes = [];
    for (let i = 0; i < hashes.length; i += 2) {
        const combinedHash = hashData(hashes[i] + hashes[i + 1]);
        nextLevelHashes.push(combinedHash);
    }

    return buildMerkleTree(nextLevelHashes);
}

/**
 * Anchors the state by writing the Merkle root to a persistent location.
 * In a real system, this would write to a version-controlled object store (e.g., GCS, S3)
 * and/or a public blockchain.
 * 
 * @param {string[]} transactionHashes - A list of transaction hashes to anchor.
 */
async function anchorState(transactionHashes) {
    if (!transactionHashes || transactionHashes.length === 0) {
        console.log('[Anchor] No transactions to anchor. Skipping.');
        return null;
    }

    console.log(`[Anchor] Building Merkle root from ${transactionHashes.length} transaction(s)...`);
    const merkleRoot = buildMerkleTree(transactionHashes);
    console.log(`[Anchor] Calculated Merkle Root: ${merkleRoot}`);

    const timestamp = new Date().toISOString();
    const anchorFileName = `${timestamp}_${merkleRoot}.anchor`;
    
    // This path simulates a write to a secure, immutable storage bucket.
    const anchorPath = path.join(__dirname, '..', 'anchors', anchorFileName);

    try {
        await fs.mkdir(path.dirname(anchorPath), { recursive: true });
        await fs.writeFile(anchorPath, JSON.stringify({ merkleRoot, timestamp, transactionHashes }));
        console.log(`[Anchor] ✅ State successfully anchored to ${anchorPath}`);
        return merkleRoot;
    } catch (error) {
        console.error(`[Anchor] ❌ Failed to write anchor file:`, error);
        return null;
    }
}

module.exports = { anchorState, buildMerkleTree };
