const axios = require('axios');

// In-memory store for the health status of each peer node.
const peerHealth = new Map();

/**
 * Fetches the health status of a single peer.
 * @param {string} peerUrl - The base URL of the peer node.
 * @returns {Promise<void>}
 */
async function checkPeerHealth(peerUrl) {
    try {
        const response = await axios.get(`${peerUrl}/health`, { timeout: 2000 });
        if (response.status === 200 && response.data.status === 'healthy') {
            peerHealth.set(peerUrl, {
                ...response.data,
                cloud: new URL(peerUrl).hostname, // Extract cloud identifier
                lastCheck: new Date().toISOString(),
                status: 'healthy', // Ensure status is explicitly set
            });
             console.log(`[Health] Peer ${peerUrl} is healthy.`);
        } else {
            throw new Error('Unhealthy response');
        }
    } catch (error) {
        console.error(`[Health] Peer ${peerUrl} is unhealthy:`, error.message);
        peerHealth.set(peerUrl, {
            status: 'unhealthy',
            lastCheck: new Date().toISOString(),
            cloud: new URL(peerUrl).hostname,
        });
    }
}

/**
 * Initializes periodic health checks for all peer nodes.
 * @param {Array<string>} peerUrls - A list of peer node URLs.
 * @param {number} interval - The interval in milliseconds for health checks.
 */
function initializeHealthChecks(peerUrls, interval = 10000) {
    console.log('[Health] Initializing periodic health checks...');
    peerUrls.forEach(url => checkPeerHealth(url)); // Initial check
    setInterval(() => {
        peerUrls.forEach(url => checkPeerHealth(url));
    }, interval);
}

/**
 * Retrieves the current health status of all peers.
 * @returns {Array<object>} - A list of peer health statuses.
 */
function getPeerHealth() {
    return Array.from(peerHealth.values());
}

module.exports = {
    initializeHealthChecks,
    getPeerHealth,
};