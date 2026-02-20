const crypto = require('crypto');
const fs = require('fs');

/**
 * Generates a snapshot of the system's critical data.
 * For this simulation, we'll use the mempool and treasury history.
 * In a real system, this would read from a production database.
 * @param {Map} mempool - The current mempool.
 * @param {Array} treasuryHistory - The treasury transaction history.
 * @returns {string} - A stringified JSON representation of the system state.
 */
functioncreateSystemSnapshot(mempool, treasuryHistory) {
    console.log('[Audit] Creating system state snapshot...');

    const snapshot = {
        timestamp: new Date().toISOString(),
        mempool: Array.from(mempool.values()),
        treasuryHistory,
    };

    // The order of keys is important for a consistent hash
    return JSON.stringify(snapshot, Object.keys(snapshot).sort());
}

/**
 * Hashes the system snapshot to create a unique, verifiable fingerprint.
 * @param {string} snapshotData - The stringified snapshot data.
 * @returns {string} - The SHA256 hash of the snapshot.
 */
functionhashSnapshot(snapshotData) {
    const hash = crypto.createHash('sha256').update(snapshotData).digest('hex');
    console.log(`[Audit] Generated snapshot hash: ${hash}`);
    return hash;
}

module.exports = {
    createSystemSnapshot,
    hashSnapshot,
};