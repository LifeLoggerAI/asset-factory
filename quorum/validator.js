const crypto = require('crypto');

// In-memory store for event confirmations. In a real system, this would be a distributed DB like Firestore or DynamoDB.
const eventConfirmations = new Map();

/**
 * Validates the signature of a received event.
 * @param {object} event - The event envelope.
 * @returns {boolean} - True if the signature is valid, false otherwise.
 */
function validateEventSignature(event) {
    // Re-create the HMAC signature for comparison
    const expectedSignature = crypto.createHmac('sha256', 'cloud-secret-key').update(event.hash).digest('hex');
    const isValid = event.signature === expectedSignature;
    if (!isValid) {
        console.error(`[QuorumValidator] Invalid signature for event ${event.eventId}`);
    }
    return isValid;
}

/**
 * Processes a received event and records its confirmation.
 * @param {object} event - The event envelope.
 */
function recordConfirmation(event) {
    if (!validateEventSignature(event)) {
        // In a real system, you might quarantine the event or raise a security alert.
        return;
    }

    let confirmation = eventConfirmations.get(event.eventId);
    if (!confirmation) {
        confirmation = {
            gcp: false,
            aws: false,
            azure: false,
            hashes: [],
            quorumReached: false,
        };
        eventConfirmations.set(event.eventId, confirmation);
    }

    // Record the confirmation and the hash from the perspective of the originating cloud
    confirmation[event.originCloud] = true;
    confirmation.hashes.push({ cloud: event.originCloud, hash: event.hash });

    console.log(`[QuorumValidator] Recorded confirmation for event ${event.eventId} from ${event.originCloud}`);

    checkQuorum(event.eventId);
}

/**
 * Checks if an event has reached quorum.
 * @param {string} eventId - The ID of the event to check.
 */
function checkQuorum(eventId) {
    const confirmation = eventConfirmations.get(eventId);
    if (!confirmation) return;

    const confirmationCount = (confirmation.gcp ? 1 : 0) + (confirmation.aws ? 1 : 0) + (confirmation.azure ? 1 : 0);

    if (confirmationCount >= 2) {
        // In addition to counting, we must verify that the hashes from the confirming nodes match.
        const allHashesMatch = confirmation.hashes.every(h => h.hash === confirmation.hashes[0].hash);

        if (allHashesMatch) {
            if (!confirmation.quorumReached) {
                confirmation.quorumReached = true;
                console.log(`[QuorumValidator] ✅ Quorum reached for event ${eventId}`);
                // Here you would trigger the finalization logic (e.g., mark the event as FINAL in a persistent store).
            }
        } else {
            console.warn(`[QuorumValidator] ⚠️ Hash mismatch for event ${eventId}. Quarantining.`);
            // In a real system, this event would be flagged for manual review.
            confirmation.status = 'QUARANTINED';
        }
    }
}

/**
 * Gets the current status of all event confirmations.
 * @returns {object} - A JSON representation of the confirmation statuses.
 */
function getConfirmationStatus() {
    // Convert Map to a JSON-serializable object
    const result = {};
    eventConfirmations.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}

module.exports = {
    recordConfirmation,
    getConfirmationStatus,
};