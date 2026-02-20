const axios = require('axios');
const quorumValidator = require('./validator');

// In-memory list of peer nodes. In a real system, this would be dynamically discovered.
const PEER_NODES = [
    'http://localhost:9001', // Simulated AWS node
    'http://localhost:9002'  // Simulated Azure node
];

/**
 * Broadcasts an event to all peer nodes for confirmation.
 * @param {object} event - The event envelope to broadcast.
 */
async function broadcastEvent(event) {
    console.log(`[QuorumP2P] Broadcasting event ${event.eventId} to peers...`);

    const promises = PEER_NODES.map(peerUrl => {
        return axios.post(`${peerUrl}/quorum/receive`, event)
            .then(response => {
                console.log(`[QuorumP2P] Peer ${peerUrl} successfully received event.`);
            })
            .catch(error => {
                console.error(`[QuorumP2P] Error broadcasting to peer ${peerUrl}:`, error.message);
            });
    });

    await Promise.all(promises);
}

/**
 * An Express middleware handler to receive events from peers.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
function receiveEvent(req, res) {
    const event = req.body;
    if (!event || !event.eventId) {
        return res.status(400).json({ error: 'Invalid event received.' });
    }

    console.log(`[QuorumP2P] Received event ${event.eventId} from a peer.`);
    
    // Process the event using the quorum validator logic
    quorumValidator.recordConfirmation(event);

    res.status(200).json({ message: 'Event received and being processed.' });
}


module.exports = {
    broadcastEvent,
    receiveEvent,
};