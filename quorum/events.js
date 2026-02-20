const crypto = require('crypto');

/**
 * Creates a standardized, secure event envelope.
 * @param {object} payload - The core data of the event.
 * @param {string} tenantId - The ID of the tenant initiating the event.
 * @param {string} originCloud - The cloud provider originating the event (gcp, aws, azure).
 * @returns {object} - The structured event envelope.
 */
function createEvent(payload, tenantId, originCloud) {
    const event = {
        eventId: crypto.randomBytes(16).toString('hex'),
        tenantId,
        logicalClock: Date.now(),
        region: process.env.REGION || 'us-central1', // Get region from environment
        payload,
        createdAt: new Date().toISOString(),
        originCloud,
    };

    // Generate a hash of the event content
    const hash = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex');
    event.hash = hash;

    // In a real system, this signature would be generated with a cloud-specific private key (e.g., from a KMS)
    // For this simulation, we'll use a simple HMAC as a placeholder for the signature.
    const signature = crypto.createHmac('sha256', 'cloud-secret-key').update(hash).digest('hex');
    event.signature = signature;

    console.log(`[Event] Created Event: ${event.eventId} from ${originCloud}`);

    return event;
}

module.exports = {
    createEvent,
};